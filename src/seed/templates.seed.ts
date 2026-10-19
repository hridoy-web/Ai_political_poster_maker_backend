import { prisma } from "../lib/prisma.js";
import { cleanTemplateHtml, cleanTemplateCss } from "../lib/sanitizeHtml.js";
import { configSchema } from "../modules/template/template.validation.js";
import type { ITheme } from "../modules/template/template.interface.js";

const baseCss = `
.poster { position: relative; width: 1080px; height: 1350px; overflow: hidden; font-family: sans-serif; }
.layer { position: absolute; }
.bg { top: 0; left: 0; width: 1080px; height: 1350px; }
.title { top: 120px; left: 80px; width: 920px; font-size: 80px; font-weight: bold; text-align: center; }
.subtitle { top: 260px; left: 80px; width: 920px; font-size: 40px; text-align: center; }
.photo { top: 400px; left: 290px; width: 500px; height: 500px; border-radius: 50%; }
.footer { top: 1150px; left: 80px; width: 920px; font-size: 44px; text-align: center; }
`;



const themes: ITheme[] = [
  { title: "Birthday Classic", category: { name: "Birthday", slug: "birthday", sortOrder: 1 }, accessLevel: "FREE", bg: "#fff3e0", titleColor: "#e65100", textColor: "#333333", defaultTitle: "Happy Birthday", defaultSubtitle: "Best wishes", withPhoto: true },
  { title: "Birthday Blue", category: { name: "Birthday", slug: "birthday", sortOrder: 1 }, accessLevel: "PREMIUM", bg: "#e3f2fd", titleColor: "#0d47a1", textColor: "#1a237e", defaultTitle: "Happy Birthday", defaultSubtitle: "Many happy returns", withPhoto: true },
  { title: "Birthday Pink", category: { name: "Birthday", slug: "birthday", sortOrder: 1 }, accessLevel: "FREE", bg: "#fce4ec", titleColor: "#c2185b", textColor: "#4a148c", defaultTitle: "Happy Birthday", defaultSubtitle: "Celebrate today", withPhoto: false },
  { title: "Eid Mubarak Green", category: { name: "Eid", slug: "eid", sortOrder: 2 }, accessLevel: "FREE", bg: "#e8f5e9", titleColor: "#1b5e20", textColor: "#2e7d32", defaultTitle: "Eid Mubarak", defaultSubtitle: "Wishing you joy and peace", withPhoto: true },
  { title: "Eid Mubarak Gold", category: { name: "Eid", slug: "eid", sortOrder: 2 }, accessLevel: "PREMIUM", bg: "#fffde7", titleColor: "#f57f17", textColor: "#4e342e", defaultTitle: "Eid Mubarak", defaultSubtitle: "Blessed Eid to you", withPhoto: false },
  { title: "Election Campaign Red", category: { name: "Election", slug: "election", sortOrder: 3 }, accessLevel: "FREE", bg: "#ffebee", titleColor: "#b71c1c", textColor: "#212121", defaultTitle: "Vote for Change", defaultSubtitle: "Your vote, your future", withPhoto: true },
  { title: "Election Campaign Green", category: { name: "Election", slug: "election", sortOrder: 3 }, accessLevel: "PREMIUM", bg: "#e8f5e9", titleColor: "#006a4e", textColor: "#212121", defaultTitle: "Vote for Progress", defaultSubtitle: "Together we build", withPhoto: true },
  { title: "Rally Announcement", category: { name: "Rally", slug: "rally", sortOrder: 4 }, accessLevel: "FREE", bg: "#e8eaf6", titleColor: "#1a237e", textColor: "#212121", defaultTitle: "Join Our Rally", defaultSubtitle: "Date, time and venue", withPhoto: false },
  { title: "Independence Day", category: { name: "National Day", slug: "national-day", sortOrder: 5 }, accessLevel: "FREE", bg: "#e8f5e9", titleColor: "#006a4e", textColor: "#b71c1c", defaultTitle: "Happy Independence Day", defaultSubtitle: "Proud of our nation", withPhoto: false },
  { title: "Victory Day", category: { name: "National Day", slug: "national-day", sortOrder: 5 }, accessLevel: "PREMIUM", bg: "#fbe9e7", titleColor: "#bf360c", textColor: "#212121", defaultTitle: "Happy Victory Day", defaultSubtitle: "Remembering the heroes", withPhoto: true },
  { title: "Thank You Voters", category: { name: "Election", slug: "election", sortOrder: 3 }, accessLevel: "FREE", bg: "#f3e5f5", titleColor: "#6a1b9a", textColor: "#212121", defaultTitle: "Thank You", defaultSubtitle: "For your trust and support", withPhoto: true },
  { title: "Condolence Message", category: { name: "Condolence", slug: "condolence", sortOrder: 6 }, accessLevel: "FREE", bg: "#eceff1", titleColor: "#263238", textColor: "#37474f", defaultTitle: "Deepest Condolences", defaultSubtitle: "Our thoughts are with you", withPhoto: true },
];

const buildTemplate = (t: ITheme) => {
  const html = `<div class="poster">
  <div class="layer bg" style="background:${t.bg}"></div>
  <div class="layer title" style="color:${t.titleColor}">{{title}}</div>
  <div class="layer subtitle" style="color:${t.textColor}">{{subtitle}}</div>${
    t.withPhoto ? `\n  <img class="layer photo" data-field="photo" alt="" />` : ""
  }
  <div class="layer footer" style="color:${t.textColor}">{{name}}</div>
</div>`;

  const fields = [
    { key: "title", type: "text" as const, label: "Title", default: t.defaultTitle },
    { key: "subtitle", type: "text" as const, label: "Subtitle", default: t.defaultSubtitle },
    ...(t.withPhoto ? [{ key: "photo", type: "image" as const, label: "Photo" }] : []),
    { key: "name", type: "text" as const, label: "Name", default: "Your Name" },
  ];

  return { type: "html" as const, html, css: baseCss, fields };
};

const main = async () => {
  const categoryIds = new Map<string, string>();

  for (const t of themes) {
    // category 
    let categoryId = categoryIds.get(t.category.slug);
    if (!categoryId) {
      const category = await prisma.templateCategory.upsert({
        where: { slug: t.category.slug },
        update: {},
        create: t.category,
      });
      categoryId = category.id;
      categoryIds.set(t.category.slug, categoryId);
    }

    const parsed = configSchema.parse(buildTemplate(t));
    const config = {
      ...parsed,
      html: cleanTemplateHtml(parsed.html),
      css: cleanTemplateCss(parsed.css),
    };

    const existing = await prisma.template.findFirst({
      where: { title: t.title, categoryId },
    });

    if (existing) {
      await prisma.template.update({ where: { id: existing.id }, data: { config } });
      console.log("Updated:", t.title);
    } else {
      await prisma.template.create({
        data: { title: t.title, categoryId, accessLevel: t.accessLevel, status: "PUBLISHED", config },
      });
      console.log("Created:", t.title);
    }
  }
};

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());