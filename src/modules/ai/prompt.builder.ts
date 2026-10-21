import { IGenerateSlogansInput, ISloganItem } from "./ai.interface.js";

/**
 * Authentic Bangladeshi political slogan rhymes, motifs, and cadences for major parties.
 */
const BANGLADESH_PARTY_RHYMES = `
বাংলাদেশি রাজনৈতিক দলের খাঁটি ছন্দ ও জনপ্রিয় স্লোগানের ভাণ্ডার:

১. বাংলাদেশ জাতীয়তাবাদী দল (বিএনপি / প্রতীক: ধানের শীষ):
   - মূল ছন্দ ১: "ভোট দিলে ধানের শীষে, / দেশ গড়বো মিলেমিশে।"
   - মূল ছন্দ ২: "ধানের শীষে দিলে ভোট, / শান্তি পাবে দেশের লোক।"
   - মূল ছন্দ ৩: "তারুণ্যের প্রথম ভোট, / ধানের শীষের পক্ষে হোক।"
   - মূল ছন্দ ৪: "এলাকার সন্তান [প্রার্থীর নাম] ভাই, / ধানের শীষে ভোট চাই।"

২. বাংলাদেশ জামায়াতে ইসলামী (প্রতীক: দাঁড়িপাল্লা):
   - মূল ছন্দ ১: "ইনসাফ যদি পেতে চাও, / দাঁড়িপাল্লায় ভোট দাও।"
   - মূল ছন্দ ২: "সৎ মানুষের শাসন চাই, / [প্রার্থীর নাম] ভাইকে পাশে পাই।"
   - মূল ছন্দ ৩: "দুর্নীতি আর সন্ত্রাস রুখতে, / দাঁড়িপাল্লায় ভোট দিন একসাথে।"
   - মূল ছন্দ ৪: "এলাকার বুকে ইনসাফের আলো, / [প্রার্থীর নাম] ভাই মানুষ ভালো।"

৩. জাতীয় নাগরিক কমিটি / বৈষম্যবিরোধী ছাত্র আন্দোলন / NCP (২৪-এর গণঅভ্যুত্থান):
   - মূল ছন্দ ১: "রক্তে কেনা নতুন ভোরে, / বৈষম্যহীন দেশ গড়ে।"
   - মূল ছন্দ ২: "২৪-এর নতুন আশা, / [প্রার্থীর নাম] ভাইয়ের প্রতি ভালোবাসা।"
   - মূল ছন্দ ৩: "সংস্কার আর ন্যায়ের পথে, / তারুণ্য লড়বে একসাথে।"
   - মূল ছন্দ ৪: "মেধার মূল্য অধিকার চাই, / তারুণ্যের শক্তিতে দেশ বানাই।"

৪. বাংলাদেশ আওয়ামী লীগ (প্রতীক: নৌকা):
   - মূল ছন্দ ১: "নৌকা মার্কায় দিলে ভোট, / শান্তি পাবে দেশের লোক।"
   - মূল ছন্দ ২: "উন্নয়নের ধারা রাখতে অব্যাহত, / নৌকা মার্কায় ভোট দিন যথাযথ।"
   - মূল ছন্দ ৩: "সোনার বাংলা গড়ার ডাক, / [প্রার্থীর নাম] ভাই জয়যুক্ত হোক।"

৫. স্বতন্ত্র / নির্দলীয় / এলাকার সৎ প্রার্থী:
   - মূল ছন্দ ১: "এলাকার উন্নয়ন যার লক্ষ্য, / [প্রার্থীর নাম] ভাই সবচেয়ে যোগ্য।"
   - মূল ছন্দ ২: "মা-বোনের মুখে হাসি, / [প্রার্থীর নাম] ভাইকে ভালোবাসি।"
   - মূল ছন্দ ৩: "সততা আর নিষ্ঠার প্রতীক, / [প্রার্থীর নাম] ভাই প্রার্থী সঠিক।"
   - মূল ছন্দ ৪: "মার্কা যার যার, / [প্রার্থীর নাম] ভাই সবার।"
   - মূল ছন্দ ৫: "দলমত নির্বিশেষে, / [প্রার্থীর নাম] ভাইয়ের পক্ষে আসুন মিলেমিশে।"
`;

/**
 * Builds a prompt strictly enforcing 4 authentic, 2-line rhyming couplets for Bangladeshi political posters.
 */
export function buildSloganPrompt(input: IGenerateSlogansInput): string {
  const count = input.count ?? 4;
  const candidateName = input.candidateName ? input.candidateName.trim() : "জননেতা";
  const area = input.area ? input.area.trim() : "এলাকা";
  const party = input.partyOrIdeology ? input.partyOrIdeology.trim() : "স্বতন্ত্র / সর্বদলীয়";

  return `
তুমি বাংলাদেশের রাজনৈতিক নির্বাচনী পোস্টার ও দেওয়াল লেখার একজন অত্যন্ত অভিজ্ঞ ছড়াকার ও স্লোগান প্রণেতা।
তোমাকে নিচের প্রার্থীর তথ্য অনুযায়ী ঠিক ${count}টি খাঁটি, মুখে মুখে সুর করে বলার মতো দুই চরণের (2-line) ছন্দময় পোস্টার স্লোগান তৈরি করতে হবে:

প্রার্থীর তথ্য:
- উদ্দেশ্য/বিষয়: "${input.topic}"
- প্রার্থীর নাম: "${candidateName}"
- নির্বাচনী এলাকা/ঠিকানা: "${area}"
- দল বা ভাবধারা: "${party}"
- পদবী: "${input.designation || "জনপ্রতিনিধি"}"
- ক্যাটাগরি: "${input.category || "নির্বাচনী প্রচারণা"}"
${input.keywords?.length ? `- প্রাসঙ্গিক শব্দ: ${input.keywords.join(", ")}` : ""}

${BANGLADESH_PARTY_RHYMES}

কঠোর অন্ত্যমিল ও স্লোগানের নিয়মাবলি (বাধ্যতামূলক):
১. প্রতিটি স্লোগান হবে ঠিক দুই লাইনের খাঁটি ছন্দময় অন্ত্যমিল (2-line rhyming couplet)।
২. লাইনের শেষের শব্দগুলোর মধ্যে অবশ্যই খাঁটি ধ্বনিসাম্য অন্ত্যমিল থাকতে হবে। যেমন:
   - আলো / ভালো
   - চাই / পাই
   - চাও / দাও
   - ভোট / হোক
   - শীষে / মিলেমিশে
   - হাসি / ভালোবাসি
   - লক্ষ্য / যোগ্য
   - সঠিক / প্রতীক
৩. কোনো অবস্থাতেই শেষে বেমানান শব্দ (যেমন: "তুমি", "রাখুন", "করুন", "ডাক/হোক") দিয়ে ছন্দ নষ্ট করা যাবে না।
৪. মোট ৪টি ভিন্ন বৈচিত্র্যময় স্লোগান দাও:
   - ১টি: প্রার্থীর নাম ও এলাকার নাম দিয়ে তৈরি সুন্দর ছন্দ
   - ১টি: দলের ঐতিহ্যবাহী প্রতীক ও মূল স্লোগান দিয়ে তৈরি ছন্দ
   - ১টি: সততা, ইনসাফ ও সৎ নেতৃত্বের ছন্দ
   - ১টি: উন্নয়ন, তারুণ্য বা নাগরিক অধিকারের ছন্দ
৫. প্রতিটি স্লোগানের সাথে ১ লাইনের একটি সহায়ক সাব-টেক্সট (subText) দাও, যা পোস্টারের নিচের ছোট বডি টেক্সটে প্রার্থীর পক্ষে দোয়া ও ভোট চাওয়ার লাইন হিসেবে বসবে।

আউটপুট ফরম্যাট (শুধুমাত্র ক্লিন JSON দাও, কোনো বাড়তি টেক্সট বা ব্যাকটিক্স ছাড়া):
{
  "slogans": [
    {
      "slogan": "প্রথম চরণ, / দ্বিতীয় চরণ।",
      "subText": "আসন্ন নির্বাচনে আপনার মূল্যবান ভোট ও দোয়া প্রার্থনা করছি।"
    }
  ]
}
`.trim();
}

/**
 * Safely parses LLM JSON output and extracts clean slogan and subText.
 */
export function parseSlogansJson(rawText: string): ISloganItem[] {
  try {
    let clean = rawText.trim();
    if (clean.startsWith("```json")) {
      clean = clean.replace(/^```json\s*/i, "").replace(/\s*```$/, "");
    } else if (clean.startsWith("```")) {
      clean = clean.replace(/^```\s*/, "").replace(/\s*```$/, "");
    }

    const parsed = JSON.parse(clean);
    const rawList = Array.isArray(parsed.slogans)
      ? parsed.slogans
      : Array.isArray(parsed)
      ? parsed
      : [];

    return rawList
      .map((item: any) => {
        let slogan = "";
        if (typeof item === "string") {
          slogan = item.trim();
        } else if (item.slogan) {
          slogan = String(item.slogan).trim();
        } else if (item.headline) {
          slogan = String(item.headline).trim();
        } else if (item.line1 && item.line2) {
          slogan = `${item.line1} / ${item.line2}`;
        }

        const subText = item.subText ? String(item.subText).trim() : undefined;

        return {
          slogan,
          subText,
        };
      })
      .filter((item: ISloganItem) => item.slogan.length > 0);
  } catch (err: any) {
    console.error("[AiPrompt] Failed to parse JSON from AI model response:", err?.message || err);
    return [];
  }
}
