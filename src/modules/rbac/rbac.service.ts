import { prisma } from "../../lib/prisma.js";
import { ApiError } from "../../utils/ApiError.js";

interface CreateRolePayload {
  name: string;
  description?: string;
  permissionKeys?: string[];
  permissionIds?: string[];
}

interface UpdateRolePayload {
  name?: string;
  description?: string;
  permissionKeys?: string[];
  permissionIds?: string[];
}

interface PermissionAssignmentPayload {
  permissionKeys?: string[];
  permissionIds?: string[];
}

const getRoles = async () => {
  const roles = await prisma.role.findMany({
    orderBy: { name: "asc" },
    include: {
      permissions: {
        include: {
          permission: true,
        },
      },
    },
  });

  return roles.map((role) => ({
    id: role.id,
    name: role.name,
    description: role.description,
    isSystem: role.isSystem,
    createdAt: role.createdAt,
    updatedAt: role.updatedAt,
    permissions: role.permissions.map((rp) => rp.permission),
  }));
};

const getRoleById = async (id: string) => {
  const role = await prisma.role.findUnique({
    where: { id },
    include: {
      permissions: {
        include: {
          permission: true,
        },
      },
    },
  });

  if (!role) {
    throw new ApiError(404, "Role not found");
  }

  return {
    id: role.id,
    name: role.name,
    description: role.description,
    isSystem: role.isSystem,
    createdAt: role.createdAt,
    updatedAt: role.updatedAt,
    permissions: role.permissions.map((rp) => rp.permission),
  };
};

const createRole = async (payload: CreateRolePayload) => {
  if (!payload.name || !payload.name.trim()) {
    throw new ApiError(400, "Role name is required");
  }

  const roleName = payload.name.trim();

  const existingRole = await prisma.role.findUnique({
    where: { name: roleName },
    select: { id: true },
  });

  if (existingRole) {
    throw new ApiError(409, `A role with the name '${roleName}' already exists`);
  }

  const permissionKeys = payload.permissionKeys || [];
  const permissionIds = payload.permissionIds || [];

  const matchedPermissions =
    permissionKeys.length > 0 || permissionIds.length > 0
      ? await prisma.permission.findMany({
          where: {
            OR: [
              ...(permissionKeys.length > 0 ? [{ key: { in: permissionKeys } }] : []),
              ...(permissionIds.length > 0 ? [{ id: { in: permissionIds } }] : []),
            ],
          },
        })
      : [];

  const newRole = await prisma.$transaction(async (tx) => {
    const role = await tx.role.create({
      data: {
        name: roleName,
        description: payload.description?.trim() || null,
        isSystem: false,
      },
    });

    if (matchedPermissions.length > 0) {
      await tx.rolePermission.createMany({
        data: matchedPermissions.map((p) => ({
          roleId: role.id,
          permissionId: p.id,
        })),
      });
    }

    return role;
  });

  return getRoleById(newRole.id);
};

const updateRole = async (id: string, payload: UpdateRolePayload) => {
  const role = await prisma.role.findUnique({
    where: { id },
    select: { id: true, name: true, isSystem: true },
  });

  if (!role) {
    throw new ApiError(404, "Role not found");
  }

  if (role.isSystem && payload.name && payload.name.trim() !== role.name) {
    throw new ApiError(400, "System role names cannot be modified");
  }

  await prisma.$transaction(async (tx) => {
    if (payload.name || payload.description !== undefined) {
      await tx.role.update({
        where: { id },
        data: {
          ...(payload.name && !role.isSystem ? { name: payload.name.trim() } : {}),
          ...(payload.description !== undefined ? { description: payload.description } : {}),
        },
      });
    }

    if (payload.permissionKeys !== undefined || payload.permissionIds !== undefined) {
      const keys = payload.permissionKeys || [];
      const ids = payload.permissionIds || [];

      const targetPermissions =
        keys.length > 0 || ids.length > 0
          ? await tx.permission.findMany({
              where: {
                OR: [
                  ...(keys.length > 0 ? [{ key: { in: keys } }] : []),
                  ...(ids.length > 0 ? [{ id: { in: ids } }] : []),
                ],
              },
            })
          : [];

      await tx.rolePermission.deleteMany({
        where: { roleId: id },
      });

      if (targetPermissions.length > 0) {
        await tx.rolePermission.createMany({
          data: targetPermissions.map((p) => ({
            roleId: id,
            permissionId: p.id,
          })),
        });
      }
    }
  });

  return getRoleById(id);
};

const deleteRole = async (id: string) => {
  const role = await prisma.role.findUnique({
    where: { id },
    select: { id: true, name: true, isSystem: true },
  });

  if (!role) {
    throw new ApiError(404, "Role not found");
  }

  if (role.isSystem) {
    throw new ApiError(400, "System roles cannot be deleted");
  }

  await prisma.role.delete({
    where: { id },
  });

  return {
    id: role.id,
    name: role.name,
    deleted: true,
  };
};

const getPermissions = async () => {
  return prisma.permission.findMany({
    orderBy: { key: "asc" },
  });
};

const assignPermissionsToRole = async (
  roleId: string,
  payload: PermissionAssignmentPayload
) => {
  const role = await prisma.role.findUnique({
    where: { id: roleId },
    select: { id: true },
  });

  if (!role) {
    throw new ApiError(404, "Role not found");
  }

  const keys = payload.permissionKeys || [];
  const ids = payload.permissionIds || [];

  if (keys.length === 0 && ids.length === 0) {
    throw new ApiError(400, "Please provide permissionKeys or permissionIds");
  }

  const permissions = await prisma.permission.findMany({
    where: {
      OR: [
        ...(keys.length > 0 ? [{ key: { in: keys } }] : []),
        ...(ids.length > 0 ? [{ id: { in: ids } }] : []),
      ],
    },
  });

  if (permissions.length === 0) {
    throw new ApiError(404, "None of the specified permissions were found");
  }

  for (const perm of permissions) {
    await prisma.rolePermission.upsert({
      where: {
        roleId_permissionId: {
          roleId,
          permissionId: perm.id,
        },
      },
      update: {},
      create: {
        roleId,
        permissionId: perm.id,
      },
    });
  }

  return getRoleById(roleId);
};

const removePermissionsFromRole = async (
  roleId: string,
  payload: PermissionAssignmentPayload
) => {
  const role = await prisma.role.findUnique({
    where: { id: roleId },
    select: { id: true },
  });

  if (!role) {
    throw new ApiError(404, "Role not found");
  }

  const keys = payload.permissionKeys || [];
  const ids = payload.permissionIds || [];

  if (keys.length === 0 && ids.length === 0) {
    throw new ApiError(400, "Please provide permissionKeys or permissionIds");
  }

  const permissions = await prisma.permission.findMany({
    where: {
      OR: [
        ...(keys.length > 0 ? [{ key: { in: keys } }] : []),
        ...(ids.length > 0 ? [{ id: { in: ids } }] : []),
      ],
    },
  });

  if (permissions.length > 0) {
    await prisma.rolePermission.deleteMany({
      where: {
        roleId,
        permissionId: { in: permissions.map((p) => p.id) },
      },
    });
  }

  return getRoleById(roleId);
};

export const rbacService = {
  getRoles,
  getRoleById,
  createRole,
  updateRole,
  deleteRole,
  getPermissions,
  assignPermissionsToRole,
  removePermissionsFromRole,
};
