//Hridoy Vaiya
/**
 * ৫. Wallet Module (wallet.controller.ts & wallet.routes.ts) (দায়িত্বে: ) 
Branch Name: feature/wallet-controller-api
GET /api/v1/wallet/balance
👉 কোথায় লাগবে: User Dashboard Overview & Header (কাজ: ইউজারের ওয়ালেটে বর্তমানে কত টাকা ব্যালেন্স আছে তা চেক করা)
POST /api/v1/wallet/recharge
👉 কোথায় লাগবে: Wallet Recharge Page (কাজ: ওয়ালেট রিচার্জ বা পেমেন্ট রিকোয়েস্ট প্রসেস করা)
GET /api/v1/wallet/transactions
👉 কোথায় লাগবে: Wallet History Tab (কাজ: পূর্ববর্তী রিচার্জ ও খরচের ট্রানজাকশন হিস্ট্রি দেখা)
🛠️ সার্ভিস লজিক নির্দেশনা (wallet.service.ts):
পেমেন্ট গেটওয়ের পেমেন্ট সাকসেস বা ওয়েবহুক রিকোয়েস্ট পাওয়ার পর ডেটাবেজ ট্রানজাকশনের মাধ্যমে ইউজারের ওয়ালেটে ব্যালেন্স নিরাপদে যোগ করা এবং প্রতিটি রিচার্জ বা খরচের ট্রানজাকশন হিস্ট্রি রেকর্ড করার সমস্ত কুয়েরি ও বিজনেস লজিক এই সার্ভিস ফাইলে লিখতে হবে। কন্ট্রোলার শুধু ডেটা পাস করে দেবো।

 */