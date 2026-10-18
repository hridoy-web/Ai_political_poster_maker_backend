import jwt from "jsonwebtoken";


export const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;


export const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
};



// Generate JWT
export const generateToken = (userId: string | number) => {
  return jwt.sign({ id: userId }, process.env.JWT_SECRET as string, {
    expiresIn: "7d",
  });
};
