import { AccountStatus } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { ApiError } from "../../utils/ApiError.js";

interface GetUsersQuery {
  page?: number | string;
  limit?: number | string;
  search?: string;
  status?: AccountStatus;
  role?: string;
}

interface UpdateUserRolePayload {
  roleId?: string;
  roleName?: string;
  role?: string;
  roleIds?: string[];
  roleNames?: string[];
}

const getUsers = async (query: GetUsersQuery) => {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.max(1, Math.min(100, Number(query.limit) || 10));
  const skip = (page - 1) * limit;

  const where: any = {};

  if (query.search && query.search.trim()) {
    const search = query.search.trim();
    where.OR = [
      { name: { contains: search, mode: "insensitive" } },
      { email: { contains: search, mode: "insensitive" } },
    ];
  }

  if (query.status) {
    where.status = query.status;
  }

  if (query.role && query.role.trim()) {
    where.roles = {
      some: {
        role: {
          name: query.role.trim(),
        },
      },
    };
  }

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        email: true,
        status: true,
        title: true,
        area: true,
        createdAt: true,
        updatedAt: true,
        roles: {
          select: {
            role: {
              select: {
                id: true,
                name: true,
                description: true,
                isSystem: true,
              },
            },
          },
        },
      },
    }),
    prisma.user.count({ where }),
  ]);

  const items = users.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    status: u.status,
    title: u.title,
    area: u.area,
    createdAt: u.createdAt,
    updatedAt: u.updatedAt,
    roles: u.roles.map((r) => r.role),
  }));

  return {
    items,
    meta: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
};

const getUserById = async (id: string) => {
  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      email: true,
      status: true,
      title: true,
      area: true,
      createdAt: true,
      updatedAt: true,
      roles: {
        select: {
          role: {
            select: {
              id: true,
              name: true,
              description: true,
              isSystem: true,
            },
          },
        },
      },
    },
  });

  if (!user) {
    throw new ApiError(404, "User not found");
  }

  return {
    ...user,
    roles: user.roles.map((r) => r.role),
  };
};

const updateUserRole = async (userId: string, payload: UpdateUserRolePayload) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true },
  });

  if (!user) {
    throw new ApiError(404, "User not found");
  }

  const roleNames: string[] = [];
  const roleIds: string[] = [];

  if (payload.roleNames && Array.isArray(payload.roleNames)) {
    roleNames.push(...payload.roleNames);
  } else if (payload.roleName) {
    roleNames.push(payload.roleName);
  } else if (payload.role) {
    roleNames.push(payload.role);
  }

  if (payload.roleIds && Array.isArray(payload.roleIds)) {
    roleIds.push(...payload.roleIds);
  } else if (payload.roleId) {
    roleIds.push(payload.roleId);
  }

  if (roleNames.length === 0 && roleIds.length === 0) {
    throw new ApiError(400, "Please provide roleName, roleId, roleNames, or roleIds");
  }

  const targetRoles = await prisma.role.findMany({
    where: {
      OR: [
        ...(roleNames.length > 0 ? [{ name: { in: roleNames } }] : []),
        ...(roleIds.length > 0 ? [{ id: { in: roleIds } }] : []),
      ],
    },
  });

  if (targetRoles.length === 0) {
    throw new ApiError(404, "Target role(s) not found");
  }

  await prisma.$transaction(async (tx) => {
    await tx.userRole.deleteMany({
      where: { userId },
    });

    await tx.userRole.createMany({
      data: targetRoles.map((role) => ({
        userId,
        roleId: role.id,
      })),
    });
  });

  return getUserById(userId);
};

const updateUserStatus = async (userId: string, status: AccountStatus) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true },
  });

  if (!user) {
    throw new ApiError(404, "User not found");
  }

  if (!Object.values(AccountStatus).includes(status)) {
    throw new ApiError(400, "Invalid account status value");
  }

  const updatedUser = await prisma.user.update({
    where: { id: userId },
    data: { status },
    select: {
      id: true,
      name: true,
      email: true,
      status: true,
      updatedAt: true,
    },
  });

  return updatedUser;
};

const getOverviewAnalytics = async () => {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const [
    totalUsers,
    todayUsers,
    totalPosters,
    todayPosters,
    totalTemplates,
    successfulPayments,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { createdAt: { gte: startOfToday } } }),
    prisma.poster.count(),
    prisma.poster.count({ where: { createdAt: { gte: startOfToday } } }),
    prisma.template.count({ where: { status: "PUBLISHED" } }),
    prisma.payment.findMany({
      where: {
        status: "SUCCEEDED",
      },
      select: {
        amount: true,
        createdAt: true,
      },
    }),
  ]);

  let totalRevenue = 0;
  let monthRevenue = 0;
  let todayRevenue = 0;

  for (const p of successfulPayments) {
    const amt = Number(p.amount || 0);
    totalRevenue += amt;
    if (p.createdAt >= startOfMonth) {
      monthRevenue += amt;
    }
    if (p.createdAt >= startOfToday) {
      todayRevenue += amt;
    }
  }

  // Last 5-7 days daily revenue for charts
  const dailyMap = new Map<string, number>();
  for (let i = 4; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i * 2);
    const key = `${d.getDate()} অক`;
    dailyMap.set(key, 0);
  }

  for (const p of successfulPayments) {
    const key = `${p.createdAt.getDate()} অক`;
    if (dailyMap.has(key)) {
      dailyMap.set(key, (dailyMap.get(key) || 0) + Number(p.amount || 0));
    }
  }

  const dailyRevenue = Array.from(dailyMap.entries()).map(([day, revenue]) => ({
    day,
    revenue,
  }));

  return {
    todayRevenue,
    monthRevenue,
    totalRevenue,
    totalUsers,
    todayUsers,
    totalPosters,
    todayPosters,
    totalTemplates,
    dailyRevenue,
  };
};

const getPosters = async (query: any) => {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.max(1, Math.min(100, Number(query.limit) || 10));
  const skip = (page - 1) * limit;

  const where: any = {};
  if (query.search && query.search.trim()) {
    const search = query.search.trim();
    where.OR = [
      { template: { title: { contains: search, mode: "insensitive" } } },
      { user: { name: { contains: search, mode: "insensitive" } } },
      { user: { email: { contains: search, mode: "insensitive" } } },
    ];
  }

  const [posters, total] = await Promise.all([
    prisma.poster.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: "desc" },
      include: {
        user: { select: { name: true, email: true } },
        template: { select: { title: true, category: { select: { name: true } } } },
        output: true,
        preview: true,
      },
    }),
    prisma.poster.count({ where }),
  ]);

  const items = posters.map((p) => {
    const input = (p.inputData as any) || {};
    const title = input.candidateName
      ? `${input.candidateName} - নির্বাচনী পোস্টার`
      : p.template?.title || "রাজনৈতিক পোস্টার";

    let formattedDate = "তারিখ অনুপলব্ধ";
    if (p.createdAt) {
      try {
        formattedDate = new Intl.DateTimeFormat("bn-BD", {
          day: "numeric",
          month: "long",
          year: "numeric",
        }).format(new Date(p.createdAt));
      } catch {
        formattedDate = String(p.createdAt).slice(0, 10);
      }
    }

    const imageUrl =
      p.output?.storageKey ||
      p.preview?.storageKey ||
      input.photoUrl ||
      "/image/images26.jpg";

    return {
      id: p.id,
      title,
      userName: p.user?.name || "অতিথি ব্যবহারকারী",
      userEmail: p.user?.email || "guest@posterai.app",
      imageUrl,
      createdAt: formattedDate,
      category: p.template?.category?.name || "রাজনৈতিক",
    };
  });

  return {
    items,
    meta: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
};

const getTransactions = async (query: any) => {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.max(1, Math.min(100, Number(query.limit) || 10));
  const skip = (page - 1) * limit;

  const where: any = {};
  if (query.search && query.search.trim()) {
    const search = query.search.trim();
    where.OR = [
      { tranId: { contains: search, mode: "insensitive" } },
      { user: { name: { contains: search, mode: "insensitive" } } },
      { user: { email: { contains: search, mode: "insensitive" } } },
      { providerReference: { contains: search, mode: "insensitive" } },
    ];
  }

  const [payments, total] = await Promise.all([
    prisma.payment.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: "desc" },
      include: {
        user: { select: { name: true, email: true } },
      },
    }),
    prisma.payment.count({ where }),
  ]);

  const items = payments.map((p) => {
    let method: "bKash" | "Nagad" | "Card" = "bKash";
    const ref = (p.providerReference || "").toLowerCase();
    if (ref.includes("nagad")) method = "Nagad";
    else if (ref.includes("card") || ref.includes("visa") || ref.includes("master")) method = "Card";

    let status: "Successful" | "Failed" | "Pending" = "Pending";
    if (p.status === "SUCCEEDED") status = "Successful";
    else if (p.status === "FAILED" || p.status === "CANCELLED") status = "Failed";

    let formattedDate = "তারিখ অনুপলব্ধ";
    if (p.createdAt) {
      try {
        formattedDate = new Intl.DateTimeFormat("bn-BD", {
          day: "numeric",
          month: "long",
          year: "numeric",
        }).format(new Date(p.createdAt));
      } catch {
        formattedDate = String(p.createdAt).slice(0, 10);
      }
    }

    return {
      id: p.id,
      trxId: p.tranId,
      method,
      amount: Number(p.amount || 0),
      status,
      date: formattedDate,
      userName: p.user?.name || "ব্যবহারকারী",
      userEmail: p.user?.email || "",
    };
  });

  return {
    items,
    meta: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
};

export const adminService = {
  getUsers,
  getUserById,
  updateUserRole,
  updateUserStatus,
  getOverviewAnalytics,
  getPosters,
  getTransactions,
};
