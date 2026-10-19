import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seeding Categories and Templates...");

  const politicalCategory = await prisma.templateCategory.upsert({
    where: { slug: "political-posters" },
    update: {},
    create: {
      name: "রাজনৈতিক পোস্টার",
      slug: "political-posters",
      sortOrder: 1,
      isActive: true,
    },
  });

  console.log(`✅ Category ready: ${politicalCategory.name}`);

  // dynamic HTML ও Config 
  const electionTemplateConfig = {
    html: `
      <div style="width: 1080px; height: 1350px; background: linear-gradient(180deg, #0b6623 0%, #000000 100%); color: #ffffff; font-family: Arial, sans-serif; position: relative; box-sizing: border-box; padding: 40px;">
        <div style="text-align: center; border-bottom: 3px solid #f1c40f; padding-bottom: 20px;">
          <h1 style="font-size: 50px; color: #f1c40f; margin: 0;">{{election_slogan}}</h1>
        </div>
        
        <div style="display: flex; justify-content: center; margin-top: 40px;">
          <img src="{{leader_image_url}}" style="width: 350px; height: 350px; border-radius: 50%; border: 6px solid #ffffff; object-fit: cover;" alt="Leader" />
        </div>

        <div style="text-align: center; margin-top: 20px;">
          <h2 style="font-size: 42px; margin: 5px 0;">{{leader_name}}</h2>
          <p style="font-size: 24px; color: #e0e0e0; margin: 0;">{{leader_title}}</p>
        </div>

        <div style="position: absolute; bottom: 50px; left: 40px; right: 40px; background: rgba(255,255,255,0.1); padding: 25px; border-radius: 12px; display: flex; align-items: center; justify-content: space-between;">
          <div>
            <h3 style="font-size: 32px; margin: 0; color: #f1c40f;">{{candidate_name}}</h3>
            <p style="font-size: 22px; margin: 5px 0 0 0;">{{designation}}</p>
          </div>
          <div style="font-size: 26px; font-weight: bold; background: #e74c3c; padding: 10px 20px; border-radius: 8px;">
            মার্কা: {{party_symbol}}
          </div>
        </div>
      </div>
    `,
    placeholders: [
      { key: "election_slogan", label: "নির্বাচনী স্লোগান", defaultValue: "উন্নয়নের মার্কা ভোট দিন" },
      { key: "leader_image_url", label: "নেতার ছবি", defaultValue: "https://via.placeholder.com/350" },
      { key: "leader_name", label: "শীর্ষ নেতার নাম", defaultValue: "জননেতা জনাব..." },
      { key: "leader_title", label: "নেতার পদবি", defaultValue: "মাননীয় সংসদ সদস্য" },
      { key: "candidate_name", label: "প্রার্থীর নাম", defaultValue: "মো: আপনার নাম" },
      { key: "designation", label: "পদবি", defaultValue: "সাধারণ সম্পাদক পদপ্রার্থী" },
      { key: "party_symbol", label: "নির্বাচনী প্রতীক", defaultValue: "নৌকা / ধানের শীষ / লাঙ্গল" }
    ]
  };

  // template database insert
  const template = await prisma.template.create({
    data: {
      title: "নির্বাচনী প্রচারণার পোস্টার - ৪:৫",
      description: "জাতীয় ও স্থানীয় নির্বাচনের জন্য কাস্টমাইজেবল রাজনৈতিক পোস্টার।",
      categoryId: politicalCategory.id,
      aspectRatio: "4:5",
      width: 1080,
      height: 1350,
      status: "PUBLISHED",      
      accessLevel: "FREE",      
      config: electionTemplateConfig,
    },
  });

  console.log(`✅ Template created: ${template.title} (ID: ${template.id})`);
}

main()
  .catch((e) => {
    console.error("❌ Seeding failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });