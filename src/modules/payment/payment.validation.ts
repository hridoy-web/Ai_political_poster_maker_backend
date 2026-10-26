import { z } from 'zod';

export const initiatePaymentSchema = z.object({
  body: z.object({
    packageId: z.string().min(1, 'Package ID cannot be empty').optional(),
    customAmount: z.number().min(20, 'Minimum recharge amount is 20 BDT').optional(),
    paymentMethod: z.string().optional(),
  }),
});

export const sslCommerzCallbackSchema = z.object({
  body: z.object({
    tran_id: z.string().min(1, 'Transaction ID is required'),
    val_id: z.string().optional(),
    status: z.string().optional(),
  }),
});