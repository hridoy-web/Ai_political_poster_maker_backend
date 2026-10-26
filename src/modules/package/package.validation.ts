import { z } from 'zod';

export const createPackageSchema = z.object({
  body: z.object({
    code: z.string().min(1, 'Package code is required'),
    name: z.string().min(1, 'Package name is required'),
    description: z.string().optional(),
    price: z.number({ message: 'Price must be a number' }).positive('Price must be positive'),
    currency: z.string().default('BDT'),
    durationDays: z.number().int().positive().optional(),
    posterCredits: z.number().int().nonnegative(),
    bonusCredits: z.number().int().nonnegative().default(0),
    aiCaptionLimit: z.number().int().nonnegative().default(0),
    aiBackgroundLimit: z.number().int().nonnegative().default(0),
    premiumAccess: z.boolean().default(false),
    isPublished: z.boolean().default(true),
  }),
});