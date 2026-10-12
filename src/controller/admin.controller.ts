//Sharmin
/**
 * ৭. Admin Dashboard Special Module (admin.controller.ts & admin.routes.ts) Branch Name: feature/admin-module-api (দায়িত্বে:  )
GET /api/v1/admin/stats
👉 কোথায় লাগবে: Admin Dashboard Home (কাজ: সিস্টেমে মোট কতজন ইউজার, মোট টেমপ্লেট, মোট পোস্টার এবং মোট আয়ের হিসাব ওভারভিউ দেখা)
GET /api/v1/admin/users
👉 কোথায় লাগবে: Admin Dashboard > User Management Table (কাজ: সিস্টেমের সব ইউজারের তালিকা পেজিনেশনসহ দেখা)
PATCH /api/v1/admin/users/:id/status
👉 কোথায় লাগবে: Admin Dashboard > Block/Unblock Button (কাজ: ইউজারের স্ট্যাটাস active থেকে blocked-এ টগল করা)
GET /api/v1/admin/posters
👉 কোথায় লাগবে: Admin Dashboard > All Posters Monitoring (কাজ: সিস্টেমের সমস্ত ইউজারের তৈরি পোস্টার মনিটর করা)
🛠️ সার্ভিস লজিক নির্দেশনা (admin.service.ts):
অ্যাডমিন ড্যাশবোর্ডের ওভারভিউয়ের জন্য একসাথে ডেটাবেজের একাধিক টেবিল (User, Template, Poster, Transaction) থেকে মোট ইউজার, মোট পোস্টার, মোট টেমপ্লেট এবং মোট আয়ের (Revenue) হিসাব বের করতে হবে। এই ভারী এগ্রিগেশন কুয়েরিগুলো এবং অ্যাডমিন সম্পর্কিত জটিল ডেটা প্রসেসিং লজিকগুলো এই সার্ভিস ফাইলে লিখতে হবে, যাতে কন্ট্রোলার কোড জটিল না হয়ে যায়।
 */