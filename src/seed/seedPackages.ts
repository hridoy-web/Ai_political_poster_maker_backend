import { prisma } from "../lib/prisma.js";

async function main() {
  const packages = [
    {
      code: "starter",
      name: "মিনিমাম প্যাক (Starter Pack)",
      description: "২০টি পোস্টার তৈরির সুযোগ (প্রতিটি ১ টাকা)",
      price: 20,
      currency: "BDT",
      posterCredits: 20,
      bonusCredits: 0,
      aiCaptionLimit: 5,
      aiBackgroundLimit: 5,
      premiumAccess: false,
      isPublished: true,
    },
    {
      code: "campaign",
      name: "পপুলার ক্যাম্পেইন প্যাক (Campaign Booster Pack)",
      description: "৫০টি পোস্টার তৈরির সুযোগ + ১০টি পোস্টার সম্পূর্ণ ফ্রি! (মোট ৬০টি)",
      price: 50,
      currency: "BDT",
      posterCredits: 50,
      bonusCredits: 10,
      aiCaptionLimit: 20,
      aiBackgroundLimit: 20,
      premiumAccess: true,
      isPublished: true,
    },
    {
      code: "pro",
      name: "প্রো পলিটিক্যাল প্যাক (Pro Political Package)",
      description: "১০০টি পোস্টার তৈরির সুযোগ + ২৫টি পোস্টার সম্পূর্ণ ফ্রি! (মোট ১২৫টি)",
      price: 100,
      currency: "BDT",
      posterCredits: 100,
      bonusCredits: 25,
      aiCaptionLimit: 50,
      aiBackgroundLimit: 50,
      premiumAccess: true,
      isPublished: true,
    },
  ];

  for (const pkg of packages) {
    await prisma.package.upsert({
      where: { code: pkg.code },
      update: pkg,
      create: pkg,
    });
    console.log(`Upserted package: ${pkg.code}`);
  }

  console.log("Packages seeded successfully!");
  process.exit(0);
}

main().catch((e) => {
  console.error("Seeding error:", e);
  process.exit(1);
});
