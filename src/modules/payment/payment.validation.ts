import { z } from "zod";

export const initiatePaymentSchema = z.object({
  body: z.object({
    packageId: z.string().min(1, "Package ID cannot be empty").optional(),
    customAmount: z.number().min(20, "Minimum recharge amount is 20 BDT").optional(),
    paymentMethod: z.string().optional(),
    customerPhone: z.string().optional(),
  }),
});

export const sslCommerzCallbackSchema = z.object({
  body: z.object({
    tran_id: z.string().optional(),
    tranId: z.string().optional(),
    val_id: z.string().optional(),
    valId: z.string().optional(),
    status: z.string().optional(),
    bank_tran_id: z.string().optional(),
    card_no: z.string().optional(),
    cus_phone: z.string().optional(),
  }).passthrough().optional(),
  query: z.object({
    tran_id: z.string().optional(),
    tranId: z.string().optional(),
    val_id: z.string().optional(),
    valId: z.string().optional(),
  }).passthrough().optional(),
});
