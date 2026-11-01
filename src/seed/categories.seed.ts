import { prisma } from "../lib/prisma.js";

const TARGET_CATEGORIES = [
  { name: "নির্বাচনী", slug: "election", sortOrder: 1 },
  { name: "সমাবেশ", slug: "gathering", sortOrder: 2 },
  { name: "জন্মদিন", slug: "birthday", sortOrder: 3 },
  { name: "বিজয় দিবস", slug: "victory-day", sortOrder: 4 },
  { name: "স্বাধীনতা দিবস", slug: "independence-day", sortOrder: 5 },
  { name: "শোকবার্তা", slug: "mourning", sortOrder: 6 },
];

async function main() {
  console.log("🌱 Upserting exact 6 categories and deactivating others...");

  const targetSlugs = TARGET_CATEGORIES.map((c) => c.slug);

  for (const cat of TARGET_CATEGORIES) {
    const upserted = await prisma.templateCategory.upsert({
      where: { slug: cat.slug },
      update: {
        name: cat.name,
        sortOrder: cat.sortOrder,
        isActive: true,
      },
      create: {
        name: cat.name,
        slug: cat.slug,
        sortOrder: cat.sortOrder,
        isActive: true,
      },
    });
    console.log(`✅ Category ready: ${upserted.name} (${upserted.slug})`);
  }

  // Deactivate any category not in the target 6 list
  const deactivated = await prisma.templateCategory.updateMany({
    where: {
      slug: {
        notIn: targetSlugs,
      },
      isActive: true,
    },
    data: {
      isActive: false,
    },
  });
  console.log(`✅ Deactivated ${deactivated.count} other categories.`);

  // Map any templates from other categories to "election" if needed
  const electionCat = await prisma.templateCategory.findUnique({
    where: { slug: "election" },
  });
  if (electionCat) {
    const inactiveCats = await prisma.templateCategory.findMany({
      where: { isActive: false },
      select: { id: true },
    });
    const inactiveCatIds = inactiveCats.map((c) => c.id);

    if (inactiveCatIds.length > 0) {
      const moved = await prisma.template.updateMany({
        where: {
          categoryId: { in: inactiveCatIds },
        },
        data: {
          categoryId: electionCat.id,
        },
      });
      console.log(`✅ Reassigned ${moved.count} templates from inactive categories to 'election'.`);
    }
  }

  const activeCategories = await prisma.templateCategory.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: "asc" },
  });

  console.log("Active categories now in DB:", activeCategories.map((c) => `${c.sortOrder}. ${c.name} (${c.slug})`));
}

main()
  .catch((e) => {
    console.error("❌ Seeding categories failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
