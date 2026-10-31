import { IGenerateSlogansInput, ISloganItem } from "./ai.interface.js";

/**
 * Authentic Bangladeshi political slogan rhymes, motifs, and cadences for major parties.
 */
const BANGLADESH_PARTY_RHYMES = `
বাংলাদেশি প্রধান রাজনৈতিক দলগুলোর সর্বজনস্বীকৃত ঐতিহ্যবাহী মূল স্লোগান ও খাঁটি ছন্দ:

১. বাংলাদেশ জাতীয়তাবাদী দল (বিএনপি / প্রতীক: ধানের শীষ):
   - দলের ঐতিহাসিক মূল স্লোগান (সবার প্রথম পছন্দ): "ভোট দিলে ধানের শীষে, / দেশ গড়বো মিলেমিশে।"
   - অন্যান্য জনপ্রিয় ছন্দ: "ধানের শীষে দিলে ভোট, / শান্তি পাবে দেশের লোক।"
   - তারুণ্যের ছন্দ: "তারুণ্যের প্রথম ভোট, / ধানের শীষের পক্ষে হোক।"
   - প্রার্থী ও এলাকার ছন্দ: "এলাকার সন্তান [প্রার্থীর নাম] ভাই, / ধানের শীষে ভোট চাই।"

২. বাংলাদেশ জামায়াতে ইসলামী (প্রতীক: দাঁড়িপাল্লা):
   - দলের ঐতিহাসিক মূল স্লোগান (সবার প্রথম পছন্দ): "ইনসাফ যদি পেতে চাও, / দাঁড়িপাল্লায় ভোট দাও।"
   - অন্যান্য জনপ্রিয় ছন্দ: "সৎ মানুষের শাসন চাই, / ইনসাফের সমাজ পাই।"
   - সততা ও ইনসাফ: "দুর্নীতি আর সন্ত্রাস রুখতে, / দাঁড়িপাল্লায় ভোট দিন একসাথে।"
   - প্রার্থী ও এলাকার ছন্দ: "এলাকার বুকে ইনসাফের আলো, / [প্রার্থীর নাম] ভাই মানুষ ভালো।"

৩. জাতীয় নাগরিক কমিটি / বৈষম্যবিরোধী ছাত্র আন্দোলন / NCP (২৪-এর নতুন বন্দোবস্ত):
   - আন্দোলনের মূল স্লোগান (সবার প্রথম পছন্দ): "রক্তে কেনা নতুন ভোরে, / বৈষম্যহীন দেশ গড়ে।"
   - অন্যান্য জনপ্রিয় ছন্দ: "আমার সোনার বাংলায়, / বৈষম্যের ঠাঁই নাই।"
   - তারুণ্যের নতুন আশা: "২৪-এর নতুন আশা, / তারুণ্যের ভালোবাসা।"
   - সংস্কার ও অধিকার: "তারুণ্যের শক্তিতে [প্রার্থীর নাম] ভাই, / সংস্কারের নতুন দেশ বানাই।"

৪. জাতীয় পার্টি (জাপা / প্রতীক: লাঙ্গল):
   - দলের ঐতিহাসিক মূল স্লোগান (সবার প্রথম পছন্দ): "লাঙ্গল মার্কায় দিলে ভোট, / শান্তি পাবে দেশের লোক।"
   - পল্লীবন্ধুর চেতনা: "পল্লীবন্ধুর স্বপ্ন পূরণ, / লাঙ্গল দিয়ে দেশ গঠন।"
   - প্রার্থী ও এলাকার ছন্দ: "এলাকার সার্বিক উন্নয়নে [প্রার্থীর নাম] ভাই, / লাঙ্গল প্রতীকে ভোট চাই।"

৫. বাংলাদেশ আওয়ামী লীগ (প্রতীক: নৌকা):
   - দলের মূল স্লোগান: "নৌকা মার্কায় দিলে ভোট, / শান্তি পাবে দেশের লোক।"
   - উন্নয়নের ধারাবাহিকতা: "উন্নয়নের ধারা রাখতে অব্যাহত, / নৌকা মার্কায় ভোট দিন যথাযথ।"
   - ঐতিহ্যবাহী স্লোগান: "জয় বাংলা, জয় বঙ্গবন্ধু, / নৌকার পক্ষে হোক গণজোয়ারের সিন্ধু।"

৬. স্বতন্ত্র / নির্দলীয় / এলাকার সৎ প্রার্থী:
   - মূল স্লোগান (সবার প্রথম পছন্দ): "দলমত নির্বিশেষে, / সৎ প্রার্থীর পক্ষে আসুন মিলেমিশে।"
   - জনপ্রিয় ছন্দ: "মার্কা যার যার, / সৎ প্রার্থী সবার।"
   - সততা ও নিষ্ঠা: "সততা আর নিষ্ঠার প্রতীক, / [প্রার্থীর নাম] ভাই প্রার্থী সঠিক।"
   - এলাকার উন্নয়ন: "এলাকার উন্নয়ন যার লক্ষ্য, / [প্রার্থীর নাম] ভাই সবচেয়ে যোগ্য।"
`;

/**
 * Builds a prompt strictly enforcing authentic, 2-line rhyming couplets for Bangladeshi political posters.
 */
export function buildSloganPrompt(input: IGenerateSlogansInput): string {
  const count = input.count ?? 3;
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

কঠোর ক্রমবিন্যাস ও অন্ত্যমিলের নিয়মাবলি (বাধ্যতামূলক):
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
   - ডাক / থাক
   - কথা / সততা
৩. বেমানান বা ছন্দহীন শব্দ কঠোরভাবে নিষিদ্ধ (STRICT NEGATIVE CONSTRAINTS):
   - কোনো অবস্থাতেই লাইনের শেষে বেমানান শব্দ বা ছন্দহীন ক্রিয়াপদ (যেমন: "করুন", "রাখুন", "দিন", "আসুন", "চলুন", "যাবেন") দিয়ে ছন্দ ছাড়া বাক্য শেষ করা যাবে না।
   - কৃত্রিম বা জোরপূর্বক অমিল (যেমন: "সেবা/নেতা", "উন্নয়ন/জনগণ", "কথা/নেতা") দেওয়া সম্পূর্ণ নিষিদ্ধ।
   - দুটি চরণের শেষ শব্দের ধ্বনি ও স্বরবর্ণ ১০০% মিলতে হবে, যাতে স্লোগানটি মানুষের মুখে মুখে ছড়ার মতো সুর করে বলা যায়।

৪. স্লোগানের সুনির্দিষ্ট ক্রমবিন্যাস ও বৈচিত্র্য (ORDER & CATEGORIES - অত্যন্ত গুরুত্বপূর্ণ):
   - স্লোগান #১ (দলের ঐতিহ্যবাহী ও সর্বজনস্বীকৃত মূল স্লোগান): 
     প্রার্থী যে দলের (বা ভাবধারার), ১ নম্বর স্লোগানে অবশ্যই সেই দলের সর্বাধিক জনপ্রিয়, পরিচিত ও ঐতিহাসিক মূল স্লোগানটি দেবে (যেমন: বিএনপি হলে "ভোট দিলে ধানের শীষে, / দেশ গড়বো মিলেমিশে।", জামায়াত হলে "ইনসাফ যদি পেতে চাও, / দাঁড়িপাল্লায় ভোট দাও।", এনসিপি হলে "রক্তে কেনা নতুন ভোরে, / বৈষম্যহীন দেশ গড়ে।", জাপা হলে "লাঙ্গল মার্কায় দিলে ভোট, / শান্তি পাবে দেশের লোক।", স্বতন্ত্র হলে "দলমত নির্বিশেষে, / সৎ প্রার্থীর পক্ষে আসুন মিলেমিশে।")।
   
   - স্লোগান #২ (প্রার্থীর নাম ও এলাকার নাম দিয়ে তৈরি খাঁটি ছন্দ):
     প্রার্থীর নাম ("${candidateName}") এবং নির্বাচনী এলাকা ("${area}") সুন্দরভাবে ছন্দে মিলিয়ে তৈরি করবে (যেমন: "এলাকার সন্তান ${candidateName} ভাই, / ধানের শীষে ভোট চাই।")।
   
   - স্লোগান #৩ ও পরবর্তী (সততা, সুশাসন, উন্নয়ন বা তারুণ্যের ছন্দ):
     উদ্দেশ্য বা বিষয় ("${input.topic}"), সততা, তারুণ্য, নাগরিক অধিকার বা এলাকার সার্বিক উন্নয়নের অঙ্গীকার নিয়ে তৈরি নতুন ছন্দময় স্লোগান দেবে।

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

/**
 * High-quality authentic Bangladeshi political slogan generator fallback.
 * Used when LLM network fails or API keys are unconfigured, ensuring 100% service uptime.
 */
export function generateAuthenticFallbackSlogans(input: IGenerateSlogansInput): ISloganItem[] {
  const candidate = (input.candidateName || "জননেতা").trim();
  const area = (input.area || "এলাকা").trim();
  const party = (input.partyOrIdeology || "").toLowerCase().trim();
  const topic = (input.topic || "নির্বাচনী প্রচারণা").trim();
  const count = input.count ?? 4;

  const results: ISloganItem[] = [];

  // 1. Party-specific historic couplet
  if (party.includes("বিএনপি") || party.includes("bnp") || party.includes("ধানের শীষ")) {
    results.push({
      slogan: "ভোট দিলে ধানের শীষে, / দেশ গড়বো মিলেমিশে।",
      subText: `${area} এলাকার সার্বিক উন্নয়ন ও গণতন্ত্র প্রতিষ্ঠায় আপনার সমর্থন চাই।`,
    });
    results.push({
      slogan: `এলাকার সন্তান ${candidate} ভাই, / ধানের শীষে ভোট চাই।`,
      subText: `আসন্ন নির্বাচনে ${candidate} ভাইকে ধানের শীষ মার্কায় বিজয়ী করুন।`,
    });
    results.push({
      slogan: "তারুণ্যের প্রথম ভোট, / ধানের শীষের পক্ষে হোক।",
      subText: "দেশনেত্রী ও তরুণ প্রজন্মের স্বপ্নপূরণে ঐক্যবদ্ধ হোন।",
    });
  } else if (party.includes("জামায়াত") || party.includes("jamaat") || party.includes("দাঁড়িপাল্লা")) {
    results.push({
      slogan: "ইনসাফ যদি পেতে চাও, / দাঁড়িপাল্লায় ভোট দাও।",
      subText: "দুর্নীতিমুক্ত সমাজ ও ন্যায়বিচার প্রতিষ্ঠায় দাঁড়িপাল্লা মার্কায় ভোট দিন।",
    });
    results.push({
      slogan: `এলাকার বুকে ইনসাফের আলো, / ${candidate} ভাই মানুষ ভালো।`,
      subText: `সৎ ও যোগ্য নেতৃত্ব গঠনে ${candidate} ভাইকে জয়যুক্ত করুন।`,
    });
    results.push({
      slogan: "সৎ মানুষের শাসন চাই, / ইনসাফের সমাজ পাই।",
      subText: `${area}বাসীর নাগরিক অধিকার আদায়ে ঐক্যবদ্ধ সংগ্রাম।`,
    });
  } else if (party.includes("নাগরিক") || party.includes("ncp") || party.includes("ছাত্র") || party.includes("বৈষম্য")) {
    results.push({
      slogan: "রক্তে কেনা নতুন ভোরে, / বৈষম্যহীন দেশ গড়ে।",
      subText: "২৪-এর বিপ্লবের আকাঙ্ক্ষা বাস্তবায়নে নতুন বাংলাদেশ বিনির্মাণে এগিয়ে আসুন।",
    });
    results.push({
      slogan: `তারুণ্যের শক্তিতে ${candidate} ভাই, / সংস্কারের নতুন দেশ বানাই।`,
      subText: `${area} আসনে মেধা ও তারুণ্যের প্রতীক ${candidate} ভাইয়ের পক্ষে ভোট দিন।`,
    });
    results.push({
      slogan: "আমার সোনার বাংলায়, / বৈষম্যের ঠাঁই নাই।",
      subText: "নাগরিক অধিকার ও সুশাসন প্রতিষ্ঠায় তারুণ্যের অঙ্গীকার।",
    });
  } else if (party.includes("জাপা") || party.includes("জাতীয় পার্টি") || party.includes("লাঙ্গল")) {
    results.push({
      slogan: "লাঙ্গল মার্কায় দিলে ভোট, / শান্তি পাবে দেশের লোক।",
      subText: "পল্লীবন্ধুর স্বপ্ন পূরণ ও গ্রামীণ উন্নয়নে লাঙ্গল প্রতীকে ভোট দিন।",
    });
    results.push({
      slogan: `এলাকার সার্বিক উন্নয়নে ${candidate} ভাই, / লাঙ্গল প্রতীকে ভোট চাই।`,
      subText: `${area}বাসীর অকৃত্রিম বন্ধু ${candidate} ভাইকে নির্বাচিত করুন।`,
    });
  } else {
    // Independent / Universal Good Governance
    results.push({
      slogan: "দলমত নির্বিশেষে, / সৎ প্রার্থীর পক্ষে আসুন মিলেমিশে।",
      subText: `${area} এলাকার সার্বিক উন্নয়ন ও পরিবর্তনের প্রত্যয়ে ভোট দিন।`,
    });
    results.push({
      slogan: `সততা আর নিষ্ঠার প্রতীক, / ${candidate} ভাই প্রার্থী সঠিক।`,
      subText: `সৎ ও জনবান্ধব জনপ্রতিনিধি হিসেবে ${candidate} ভাইকে বিজয়ী করুন।`,
    });
    results.push({
      slogan: "মার্কা যার যার, / সৎ প্রার্থী সবার।",
      subText: "যোগ্য ও কর্মঠ নেতৃত্বকে নির্বাচিত করে উন্নয়নের ধারা বেগবান করুন।",
    });
  }

  // Topic-specific couplet
  if (topic.includes("তারুণ্য") || topic.includes("কর্মসংস্থান") || topic.includes("তরুণ")) {
    results.push({
      slogan: "তারুণ্যের শক্তি আর মেধার বলে, / আধুনিক সমাজ গড়বো সকলে।",
      subText: "যুবসমাজের কর্মসংস্থান ও মেধাভিত্তিক নতুন প্রজন্ম বিনির্মাণে পাশে থাকুন।",
    });
  } else if (topic.includes("উন্নয়ন") || topic.includes("অবকাঠামো")) {
    results.push({
      slogan: "কথায় নয় কাজে বিশ্বাসী, / উন্নয়ন করবো দিবানিশি।",
      subText: `${area} এলাকার রাস্তাঘাট ও নাগরিক সুযোগ-সুবিধা নিশ্চিতের অঙ্গীকার।`,
    });
  } else {
    results.push({
      slogan: `জনগণের পাশে ${candidate} ভাই, / এলাকার শান্তি ও সমৃদ্ধি চাই।`,
      subText: `${area}বাসীর ভালোবাসা ও দোয়ায় আমাদের পথচলা।`,
    });
  }

  return results.slice(0, count);
}

