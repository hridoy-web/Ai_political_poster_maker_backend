import { z } from 'zod';

export const initiatePaymentSchema = z.object({
  body: z.object({
    packageId: z.string().uuid('Invalid package ID format').optional(),
    customAmount: z.number().min(20, 'Minimum recharge amount is 20 BDT').optional(),
  }),
});

export const sslCommerzCallbackSchema = z.object({
  body: z.object({
    tran_id: z.string().min(1, 'Transaction ID is required'),
    val_id: z.string().optional(),
    status: z.string().optional(),
  }),
});