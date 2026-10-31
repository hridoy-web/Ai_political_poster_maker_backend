import { z } from "zod";

// UPDATED: আগে email format শুধু যাচাই হতো।
// এখন trim করে lowercase করা হয়, তারপর email format যাচাই হয়।
const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email({ error: "Invalid email address" }));

// bcrypt-এর 72-byte limit যাচাই করি। বাংলা/emoji অক্ষর একাধিক byte হতে পারে,
// তাই শুধু string.length দিয়ে এই limit যাচাই যথেষ্ট নয়।
const passwordByteLimit = (password: string) =>
  Buffer.byteLength(password, "utf8") <= 72;

export const registerSchema = z.strictObject({
  name: z
    .string({ error: "Name is required" })
    .trim()
    .min(1, { error: "Name is required" })
    // UPDATED: আগে name-এর সর্বোচ্চ length ছিল না।
    .max(100, { error: "Name must be 100 characters or fewer" }),

  email: emailSchema,

  password: z
    .string({ error: "Password is required" })
    // UPDATED: আগের minimum ছিল 6; এখন নতুন account-এর জন্য 8।
    .min(8, { error: "Password must be at least 8 characters" })
    .regex(/[a-z]/, {
      error: "Password must contain at least one lowercase letter",
    })
    .regex(/[A-Z]/, {
      error: "Password must contain at least one uppercase letter",
    })
    .regex(/[0-9]/, { error: "Password must contain at least one number" })
    .regex(/[^a-zA-Z0-9]/, {
      error: "Password must contain at least one special character",
    })
    // UPDATED: 72 byte-এর বেশি password হলে validation error দেবে।
    .refine(passwordByteLimit, {
      error: "Password must not exceed 72 bytes",
    }),
});

// UPDATED: z.object() থেকে z.strictObject() করেছি,
// যাতে client role/status-এর মতো অপ্রত্যাশিত field পাঠালে reject হয়।
export const loginSchema = z.strictObject({
  email: emailSchema,

  password: z
    .string({ error: "Password is required" })
    .min(1, { error: "Password is required" })
    .refine(passwordByteLimit, {
      error: "Password must not exceed 72 bytes",
    }),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;