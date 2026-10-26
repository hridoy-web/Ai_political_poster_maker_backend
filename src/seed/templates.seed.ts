import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seeding Categories and Templates...");

  // Create or Update Category
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

  // Dynamic HTML Configuration (Now 100% aligned with the Zod schema)
  const electionTemplateConfig = {
    type: "html",
    css: "",
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
    fields: [
      { key: "election_slogan", type: "text", label: "নির্বাচনী স্লোগান", default: "উন্নয়নের মার্কা ভোট দিন" },
      { key: "leader_image_url", type: "image", label: "নেতার ছবি", default: "https://via.placeholder.com/350" },
      { key: "leader_name", type: "text", label: "শীর্ষ নেতার নাম", default: "জননেতা জনাব..." },
      { key: "leader_title", type: "text", label: "নেতার পদবি", default: "মাননীয় সংসদ সদস্য" },
      { key: "candidate_name", type: "text", label: "প্রার্থীর নাম", default: "মো: আপনার নাম" },
      { key: "designation", type: "text", label: "পদবি", default: "সাধারণ সম্পাদক পদপ্রার্থী" },
      { key: "party_symbol", type: "text", label: "নির্বাচনী প্রতীক", default: "নৌকা / ধানের শীষ / লাঙ্গল" }
    ]
  };

  const templateTitle = "নির্বাচনী প্রচারণার পোস্টার - ৪:৫";

  const existingTemplate = await prisma.template.findFirst({
    where: { 
      title: templateTitle,
      categoryId: politicalCategory.id 
    },
  });

  if (!existingTemplate) {
    const template = await prisma.template.create({
      data: {
        title: templateTitle,
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
  } else {
   
    await prisma.template.update({
      where: { id: existingTemplate.id },
      data: { config: electionTemplateConfig },
    });
    console.log(`ℹ️ Template already exists, updated config: ${existingTemplate.title}`);
  }
}

main()
  .catch((e) => {
    console.error("❌ Seeding failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });