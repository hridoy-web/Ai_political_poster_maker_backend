import type { Request, Response } from "express";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { ApiError } from "../../utils/ApiError.js";
import sendResponse from "../../utils/sendResponse.js";

export const handleContactMessage = asyncHandler(
  async (req: Request, res: Response) => {
    const { name, email, subject, message } = req.body;

    if (!name || typeof name !== "string" || !name.trim()) {
      throw new ApiError(400, "অনুগ্রহ করে আপনার নাম প্রদান করুন।");
    }

    if (!email || typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new ApiError(400, "একটি সঠিক ইমেইল ঠিকানা প্রদান করুন।");
    }

    if (!message || typeof message !== "string" || message.trim().length < 5) {
      throw new ApiError(400, "বার্তার বিবরণ কমপক্ষে ৫ অক্ষরের হতে হবে।");
    }

    // Contact messages can be forwarded or logged securely
    console.log(`[Contact Inquiry] From: ${name} <${email}> | Subject: ${subject || "General Inquiry"}`);
    console.log(`[Message Content]: ${message}`);

    return sendResponse(
      res,
      201,
      "আপনার বার্তাটি সফলভাবে আমাদের কাছে পৌঁছেছে! ধন্যবাদ।",
      true,
      null,
      {
        name: name.trim(),
        email: email.trim(),
        subject: (subject || "General Inquiry").trim(),
        receivedAt: new Date().toISOString(),
      }
    );
  }
);
