import type { Request, Response } from "express";
import { apiController, AppOk, AppError, prisma } from "../../shared/index.js";
import { env, APP_NAME } from "../../config/index.js";
import {
  signupUser,
  signupSendOtp,
  signupVerifyOtp,
  signinUser,
  forgotPasswordService,
  resetPasswordService,
  refreshTokenService,
  logoutService,
} from "./auth.service.js";
import type {
  SignupBody,
  SigninBody,
  ForgotPasswordBody,
  ResetPasswordBody,
  SignupSendOtpBody,
  SignupVerifyOtpBody,
} from "./auth.validation.js";

// ─── REQUEST METADATA HELPER ──────────────────────────────────────────────────

function getRequestMetadata(req: Request) {
  return {
    userAgent: req.headers["user-agent"] || undefined,
    ipAddress: req.ip || undefined,
  };
}

// ─── COOKIE CONFIG ──────────────────────────────────────────────────────────────

const REFRESH_COOKIE_NAME = `${APP_NAME.toLowerCase()}_refresh_token`;

function setRefreshCookie(res: Response, refreshToken: string) {
  res.cookie(REFRESH_COOKIE_NAME, refreshToken, {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: env.NODE_ENV === "production" ? "strict" : "lax",
    maxAge: env.REFRESH_TOKEN_EXPIRES_IN_DAYS * 24 * 60 * 60 * 1000,
    path: "/api/auth",
  });
}

function clearRefreshCookie(res: Response) {
  res.clearCookie(REFRESH_COOKIE_NAME, {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: env.NODE_ENV === "production" ? "strict" : "lax",
    path: "/api/auth",
  });
}

// ─── SIGNUP (legacy) ────────────────────────────────────────────────────────────

export const signup = apiController(async (req, res) => {
  const result = await signupUser(req.body as SignupBody);
  setRefreshCookie(res, result.refreshToken);
  return AppOk.created({
    data: { user: result.user, accessToken: result.accessToken },
    message: "Account created",
  });
});

// ─── SIGNUP WITH OTP ────────────────────────────────────────────────────────────

export const signupSendOtpController = apiController(async (req) => {
  const result = await signupSendOtp(req.body as SignupSendOtpBody);
  return AppOk.ok(result);
});

export const signupVerifyOtpController = apiController(async (req, res) => {
  const result = await signupVerifyOtp(req.body as SignupVerifyOtpBody, getRequestMetadata(req));
  setRefreshCookie(res, result.refreshToken);
  return AppOk.ok({
    data: { user: result.user, accessToken: result.accessToken },
    message: "Email verified successfully",
  });
});

// ─── SIGNIN ─────────────────────────────────────────────────────────────────────

export const signin = apiController(async (req, res) => {
  const result = await signinUser(req.body as SigninBody, getRequestMetadata(req));
  setRefreshCookie(res, result.refreshToken);
  return AppOk.ok({
    data: { user: result.user, accessToken: result.accessToken },
  });
});

// ─── FORGOT & RESET PASSWORD ────────────────────────────────────────────────────

export const forgotPassword = apiController(async (req) => {
  const { email } = req.body as ForgotPasswordBody;
  await forgotPasswordService(email);
  return AppOk.ok({ message: "If the email exists, a reset code has been sent" });
});

export const resetPassword = apiController(async (req) => {
  await resetPasswordService(req.body as ResetPasswordBody);
  return AppOk.ok({ message: "Password reset successfully" });
});

// ─── REFRESH TOKEN ──────────────────────────────────────────────────────────────

export const refresh = apiController(async (req, res) => {
  const token = req.cookies?.[REFRESH_COOKIE_NAME] as string | undefined;

  if (!token) {
    throw AppError.unauthorized("No refresh token provided");
  }

  const result = await refreshTokenService(token, getRequestMetadata(req));
  setRefreshCookie(res, result.refreshToken);
  return AppOk.ok({
    data: { user: result.user, accessToken: result.accessToken },
  });
});

// ─── LOGOUT ─────────────────────────────────────────────────────────────────────

export const logout = apiController(async (req, res) => {
  const token = req.cookies?.[REFRESH_COOKIE_NAME] as string | undefined;

  if (token) {
    await logoutService(token);
  }

  clearRefreshCookie(res);
  return AppOk.ok({ message: "Logged out successfully" });
});

// ─── GET ME ─────────────────────────────────────────────────────────────────────

export const getMe = apiController(async (req) => {
  const userId = req.userId;

  if (!userId) {
    throw AppError.unauthorized("Not authenticated");
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });

  if (!user) {
    throw AppError.notFound("User not found");
  }

  return AppOk.ok({
    data: {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      avatarUrl: user.avatarUrl,
    },
  });
});
