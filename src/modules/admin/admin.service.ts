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

export const adminService = {
  getUsers,
  getUserById,
  updateUserRole,
  updateUserStatus,
};
