import { z } from "zod";

export const signupSchema = z.object({
  body: z.object({
    email: z.string().email("Invalid email address"),
    password: z
      .string()
      .min(8, "Password must be at least 8 characters")
      .max(72, "Password must be at most 72 characters"),
    fullName: z
      .string()
      .min(2, "Name must be at least 2 characters")
      .max(100, "Name must be at most 100 characters"),
  }),
});

export const signinSchema = z.object({
  body: z.object({
    email: z.string().email("Invalid email address"),
    password: z.string().min(1, "Password is required"),
  }),
});

export const forgotPasswordSchema = z.object({
  body: z.object({
    email: z.string().email("Invalid email address"),
  }),
});

export const resetPasswordSchema = z.object({
  body: z.object({
    email: z.string().email("Invalid email address"),
    otp: z
      .string()
      .length(6, "OTP must be 6 digits")
      .regex(/^\d+$/, "OTP must contain only digits"),
    newPassword: z
      .string()
      .min(8, "Password must be at least 8 characters")
      .max(72, "Password must be at most 72 characters"),
  }),
});

export type SignupBody = z.infer<typeof signupSchema>["body"];
export type SigninBody = z.infer<typeof signinSchema>["body"];
export type ForgotPasswordBody = z.infer<typeof forgotPasswordSchema>["body"];
export type ResetPasswordBody = z.infer<typeof resetPasswordSchema>["body"];

export const signupSendOtpSchema = z.object({
  body: z.object({
    email: z.string().email("Invalid email address"),
    password: z
      .string()
      .min(8, "Password must be at least 8 characters")
      .max(72, "Password must be at most 72 characters"),
    fullName: z
      .string()
      .min(2, "Name must be at least 2 characters")
      .max(100, "Name must be at most 100 characters"),
  }),
});

export const signupVerifyOtpSchema = z.object({
  body: z.object({
    email: z.string().email("Invalid email address"),
    otp: z
      .string()
      .length(6, "OTP must be 6 digits")
      .regex(/^\d+$/, "OTP must contain only digits"),
  }),
});

export type SignupSendOtpBody = z.infer<typeof signupSendOtpSchema>["body"];
export type SignupVerifyOtpBody = z.infer<typeof signupVerifyOtpSchema>["body"];
