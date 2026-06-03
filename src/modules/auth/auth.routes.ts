import { Router } from "express";
import { validate, authenticate } from "../../shared/index.js";
import { signupSendOtpController, signupVerifyOtpController, signin, forgotPassword, resetPassword, getMe } from "./auth.controller.js";
import { googleRedirect, googleCallback } from "./oauth.controller.js";
import { signupSendOtpSchema, signupVerifyOtpSchema, signinSchema, forgotPasswordSchema, resetPasswordSchema } from "./auth.validation.js";

const router = Router();

// Email/password auth (OTP-verified signup)
router.post("/signup/send-otp", validate(signupSendOtpSchema), signupSendOtpController);
router.post("/signup/verify-otp", validate(signupVerifyOtpSchema), signupVerifyOtpController);
router.post("/signin", validate(signinSchema), signin);
router.post("/forgot-password", validate(forgotPasswordSchema), forgotPassword);
router.post("/reset-password", validate(resetPasswordSchema), resetPassword);

// OAuth — Google (extensible: add more providers below)
router.get("/google", googleRedirect);
router.get("/google/callback", googleCallback);

// Authenticated user info
router.get("/me", authenticate, getMe);

export { router as authRoutes };
