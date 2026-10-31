import { prisma } from "../lib/prisma.js";

const permissions = [
  { key: "admin:users:read", description: "View the user list" },
  { key: "admin:users:manage", description: "Manage user accounts and statuses" },
  { key: "admin:users:role:update", description: "Change a user's role" },
  { key: "category:create", description: "Create categories" },
  { key: "category:update", description: "Update categories" },
  { key: "category:status:update", description: "Activate or deactivate categories" },
  { key: "category:read:all", description: "View all categories" },
  { key: "template:create", description: "Create templates" },
  { key: "template:update", description: "Update templates" },
  { key: "template:publish", description: "Publish templates" },
  { key: "template:archive", description: "Archive templates" },
  { key: "template:unarchive", description: "Restore archived templates" },
  { key: "package:create", description: "Create credit and subscription packages" },
  { key: "rbac:manage", description: "Manage roles and permissions" },
] as const;

const templatePermissions = [
  "template:create",
  "template:update",
  "template:publish",
  "template:archive",
  "template:unarchive",
];

const categoryPermissions = [
  "category:create",
  "category:update",
  "category:status:update",
  "category:read:all",
];

const roles = [
  {
    name: "SUPER_ADMIN",
    description: "Manage all system permissions",
    permissionKeys: permissions.map((permission) => permission.key),
  },
  {
    name: "ADMIN",
    description: "Manage users, categories, templates, and packages",
    permissionKeys: [
      "admin:users:read",
      "admin:users:manage",
      "package:create",
      ...categoryPermissions,
      ...templatePermissions,
    ],
  },
  {
    name: "TEMPLATE_MANAGER",
    description: "Manage templates",
    permissionKeys: templatePermissions,
  },
  {
    name: "USER",
    description: "Standard user access",
    permissionKeys: [],
  },
] as const;

async function main() {
  await prisma.$transaction(
    async (tx) => {
      const permissionIds = new Map<string, string>();

      for (const permission of permissions) {
        const savedPermission = await tx.permission.upsert({
          where: { key: permission.key },
          update: { description: permission.description },
          create: {
            key: permission.key,
            description: permission.description,
          },
          select: { id: true, key: true },
        });

        permissionIds.set(savedPermission.key, savedPermission.id);
      }

      for (const role of roles) {
        const savedRole = await tx.role.upsert({
          where: { name: role.name },
          update: {
            description: role.description,
            isSystem: true,
          },
          create: {
            name: role.name,
            description: role.description,
            isSystem: true,
          },
          select: { id: true },
        });

        for (const key of role.permissionKeys) {
          const permissionId = permissionIds.get(key);

          if (!permissionId) {
            throw new Error(`Permission not found in seed list: ${key}`);
          }

          await tx.rolePermission.upsert({
            where: {
              roleId_permissionId: {
                roleId: savedRole.id,
                permissionId,
              },
            },
            update: {},
            create: {
              roleId: savedRole.id,
              permissionId,
            },
          });
        }
      }

      const targetEmail = "itzsharmin07@gmail.com".toLowerCase();
      const user = await tx.user.findUnique({
        where: { email: targetEmail },
        select: { id: true },
      });

      if (user) {
        const superAdminRole = await tx.role.findUnique({
          where: { name: "SUPER_ADMIN" },
          select: { id: true },
        });

        if (superAdminRole) {
          await tx.userRole.upsert({
            where: {
              userId_roleId: {
                userId: user.id,
                roleId: superAdminRole.id,
              },
            },
            update: {},
            create: {
              userId: user.id,
              roleId: superAdminRole.id,
            },
          });
          console.log(`Assigned SUPER_ADMIN role to ${targetEmail}`);
        }
      } else {
        console.log(`User ${targetEmail} not found, skipped role assignment`);
      }
    },
    {
      maxWait: 10_000,
      timeout: 30_000,
    },
  );

  console.log("RBAC roles and permissions seeded successfully.");
}

main()
  .catch((error) => {
    console.error("RBAC seed failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
