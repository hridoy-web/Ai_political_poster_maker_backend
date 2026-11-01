import { prisma } from "../config/db.js";

async function seedAnalyticsData() {
  console.log("🌱 Starting Dashboard & Analytics realistic data seeding...");

  // 1. Get or create a reference active user
  let user = await prisma.user.findFirst({
    where: { email: "superadmin@posterai.com" },
  });

  if (!user) {
    user = await prisma.user.findFirst();
  }

  if (!user) {
    throw new Error("No user found in the database. Please run seed:users first.");
  }

  // 2. Ensure categories exist
  const categories = await prisma.templateCategory.findMany({
    where: { isActive: true },
  });

  if (categories.length === 0) {
    throw new Error("No categories found. Please run seed:categories first.");
  }

  const primaryCategory = categories[0];

  // 3. Seed active templates across categories
  const templateBlueprints = [
    {
      title: "জাতীয় নির্বাচন প্রচারণা পোস্টার - ৪:৫",
      slugCategory: "election",
      aspectRatio: "4:5",
      width: 1080,
      height: 1350,
    },
    {
      title: "বিশাল জনসভা ও গণসমাবেশ পোস্টার - ৪:৫",
      slugCategory: "gathering",
      aspectRatio: "4:5",
      width: 1080,
      height: 1350,
    },
    {
      title: "নেতৃবৃন্দের জন্মদিনের শুভেচ্ছা পোস্টার - ১:১",
      slugCategory: "birthday",
      aspectRatio: "1:1",
      width: 1080,
      height: 1080,
    },
    {
      title: "মহান বিজয় দিবস শুভেচ্ছা ব্যানার - ১৬:৯",
      slugCategory: "victory-day",
      aspectRatio: "16:9",
      width: 1920,
      height: 1080,
    },
    {
      title: "স্বাধীনতা দিবস গৌরবোজ্জ্বল পোস্টার - ৪:৫",
      slugCategory: "independence-day",
      aspectRatio: "4:5",
      width: 1080,
      height: 1350,
    },
    {
      title: "গভীর শোক ও শ্রদ্ধাঞ্জলি স্মারক পোস্টার - ৪:৫",
      slugCategory: "mourning",
      aspectRatio: "4:5",
      width: 1080,
      height: 1350,
    },
  ];

  const createdTemplates = [];

  for (const bp of templateBlueprints) {
    const cat = categories.find((c) => c.slug === bp.slugCategory) || primaryCategory;
    const config = {
      type: "html",
      css: "",
      html: `<div style="width:${bp.width}px;height:${bp.height}px;background:#0b6623;color:#fff;padding:40px;"><h1>{{title}}</h1></div>`,
      fields: [{ key: "title", type: "text", label: "শিরোনাম", default: bp.title }],
    };

    const t = await prisma.template.upsert({
      where: { id: `seed-tpl-${bp.slugCategory}` },
      update: {
        title: bp.title,
        status: "PUBLISHED",
        accessLevel: "FREE",
        categoryId: cat.id,
        aspectRatio: bp.aspectRatio,
        width: bp.width,
        height: bp.height,
        config,
      },
      create: {
        id: `seed-tpl-${bp.slugCategory}`,
        title: bp.title,
        status: "PUBLISHED",
        accessLevel: "FREE",
        categoryId: cat.id,
        aspectRatio: bp.aspectRatio,
        width: bp.width,
        height: bp.height,
        config,
      },
    });

    createdTemplates.push(t);
  }

  console.log(`✅ Seeded ${createdTemplates.length} published templates.`);

  // 4. Seed realistic posters
  const now = new Date();
  const posterSeeds = [
    { daysAgo: 0, hoursAgo: 2, count: 3 },
    { daysAgo: 1, hoursAgo: 5, count: 4 },
    { daysAgo: 2, hoursAgo: 8, count: 3 },
    { daysAgo: 4, hoursAgo: 10, count: 2 },
  ];

  let posterIdx = 1;
  for (const group of posterSeeds) {
    for (let i = 0; i < group.count; i++) {
      const pDate = new Date(now);
      pDate.setDate(pDate.getDate() - group.daysAgo);
      pDate.setHours(pDate.getHours() - group.hoursAgo - i);

      const tpl = createdTemplates[posterIdx % createdTemplates.length];
      const key = `seed-poster-${group.daysAgo}-${i}-${posterIdx}`;

      await prisma.poster.upsert({
        where: { idempotencyKey: key },
        update: {
          status: "COMPLETED",
          createdAt: pDate,
        },
        create: {
          idempotencyKey: key,
          userId: user.id,
          templateId: tpl.id,
          status: "COMPLETED",
          inputData: { title: `${tpl.title} - সংস্করণ ${posterIdx}` },
          createdAt: pDate,
          completedAt: pDate,
        },
      });
      posterIdx++;
    }
  }

  console.log(`✅ Seeded ${posterIdx - 1} sample generated posters.`);

  // 5. Seed realistic payment records over the last 7 days
  const dailyPaymentPlans = [
    { daysAgo: 6, amounts: [100, 50] },       // 6 days ago -> ৳150
    { daysAgo: 5, amounts: [200, 100] },      // 5 days ago -> ৳300
    { daysAgo: 4, amounts: [100, 50, 200] },  // 4 days ago -> ৳350
    { daysAgo: 3, amounts: [250, 150] },      // 3 days ago -> ৳400
    { daysAgo: 2, amounts: [300, 200, 100] }, // 2 days ago -> ৳600
    { daysAgo: 1, amounts: [400, 250] },      // Yesterday -> ৳650
    { daysAgo: 0, amounts: [200, 300, 100] }, // Today -> ৳600
  ];

  let paymentIdx = 1;
  for (const dayPlan of dailyPaymentPlans) {
    for (const amt of dayPlan.amounts) {
      const payDate = new Date(now);
      payDate.setDate(payDate.getDate() - dayPlan.daysAgo);
      payDate.setHours(12 + (paymentIdx % 8), 15 * (paymentIdx % 4), 0, 0);

      const tranId = `TRAN_SEED_${dayPlan.daysAgo}_${amt}_${paymentIdx}`;

      await prisma.payment.upsert({
        where: { tranId },
        update: {
          status: "SUCCEEDED",
          amount: amt,
          createdAt: payDate,
        },
        create: {
          userId: user.id,
          provider: "SSLCOMMERZ",
          tranId,
          amount: amt,
          currency: "BDT",
          status: "SUCCEEDED",
          idempotencyKey: tranId,
          createdAt: payDate,
          verifiedAt: payDate,
        },
      });
      paymentIdx++;
    }
  }

  console.log(`✅ Seeded ${paymentIdx - 1} successful payment transactions across past 7 days.`);
  console.log("✨ Dashboard & Analytics realistic dataset seeded successfully!");
}

seedAnalyticsData()
  .catch((err) => {
    console.error("❌ Analytics seeding failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
