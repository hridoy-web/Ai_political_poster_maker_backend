import bcrypt from "bcryptjs";
import { prisma } from "../config/db.js";

interface TargetAccount {
  name: string;
  email: string;
  passwordRaw: string;
  roleName: "ADMIN" | "TEMPLATE_MANAGER";
  roleDescription: string;
}

const TARGET_ACCOUNTS: TargetAccount[] = [
  {
    name: "Admin User",
    email: "testadmin@posterai.com",
    passwordRaw: "Password123!",
    roleName: "ADMIN",
    roleDescription: "Platform administrative access",
  },
  {
    name: "Template Manager",
    email: "tester@person.com",
    passwordRaw: "Password123!",
    roleName: "TEMPLATE_MANAGER",
    roleDescription: "Template creation and moderation access",
  },
];

async function seedTargetUsers() {
  console.log("🌱 Starting targeted credential seeding...");

  for (const acc of TARGET_ACCOUNTS) {
    const normalizedEmail = acc.email.trim().toLowerCase();

    // 1. Ensure target Role exists
    const role = await prisma.role.upsert({
      where: { name: acc.roleName },
      update: { description: acc.roleDescription, isSystem: true },
      create: {
        name: acc.roleName,
        description: acc.roleDescription,
        isSystem: true,
      },
      select: { id: true, name: true },
    });

    // 2. Hash password with bcryptjs (salt rounds = 10, strictly matching auth.service)
    const passwordHash = await bcrypt.hash(acc.passwordRaw, 10);

    // 3. Upsert User (creates if missing, updates password & status if exists)
    const user = await prisma.user.upsert({
      where: { email: normalizedEmail },
      update: {
        password: passwordHash,
        status: "ACTIVE",
      },
      create: {
        name: acc.name,
        email: normalizedEmail,
        password: passwordHash,
        status: "ACTIVE",
      },
      select: { id: true, email: true, name: true },
    });

    // 4. Attach UserRole join record
    await prisma.userRole.upsert({
      where: {
        userId_roleId: {
          userId: user.id,
          roleId: role.id,
        },
      },
      update: {},
      create: {
        userId: user.id,
        roleId: role.id,
      },
    });

    // 5. Initialize starter credit wallet if uninitialized
    await prisma.creditWallet.upsert({
      where: { userId: user.id },
      update: {},
      create: {
        userId: user.id,
        balance: 100,
      },
    });

    console.log(
      `✅ Successfully seeded: ${user.email} (Role: ${role.name}, Status: ACTIVE)`
    );
  }

  console.log("✨ All target user credentials successfully seeded!");
}

seedTargetUsers()
  .catch((err) => {
    console.error("❌ Seeding failed with error:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
