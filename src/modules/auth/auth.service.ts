import bcrypt from "bcrypt";
import jwt, { type Secret } from "jsonwebtoken";
import crypto from "node:crypto";
import { prisma } from "../../shared/index.js";
import { env } from "../../config/index.js";
import { AppError } from "../../shared/index.js";
import { sendOtpEmail } from "./email.service.js";

const SALT_ROUNDS = 12;
const OTP_EXPIRY_MINUTES = 10;

// ─── SIGNUP ─────────────────────────────────────────────────────────────────────

export async function signupUser(data: {
  email: string;
  password: string;
  fullName: string;
}) {
  const existing = await prisma.user.findUnique({
    where: { email: data.email },
  });

  if (existing) {
    throw AppError.conflict("Email already registered");
  }

  const hashedPassword = await bcrypt.hash(data.password, SALT_ROUNDS);

  const user = await prisma.user.create({
    data: {
      email: data.email,
      password: hashedPassword,
      fullName: data.fullName,
    },
  });

  const token = generateToken(user.id);
  return { user: sanitizeUser(user), token };
}

// ─── SIGNUP WITH OTP ────────────────────────────────────────────────────────────

export async function signupSendOtp(data: {
  email: string;
  password: string;
  fullName: string;
}) {
  const existing = await prisma.user.findUnique({
    where: { email: data.email },
  });

  if (existing) {
    throw AppError.conflict("Email already registered");
  }

  // Create user (unverified — no token issued until OTP verified)
  const hashedPassword = await bcrypt.hash(data.password, SALT_ROUNDS);

  const user = await prisma.user.create({
    data: {
      email: data.email,
      password: hashedPassword,
      fullName: data.fullName,
    },
  });

  // Generate and store OTP
  const code = generateOtp();
  const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

  await prisma.otp.create({
    data: {
      userId: user.id,
      code,
      expiresAt,
    },
  });

  // Send OTP email
  await sendOtpEmail(user.email, user.fullName, code);

  return { message: "Verification code sent to your email" };
}

export async function signupVerifyOtp(data: { email: string; otp: string }) {
  const user = await prisma.user.findUnique({
    where: { email: data.email },
  });

  if (!user) {
    throw AppError.badRequest("Invalid email or OTP");
  }

  const otpRecord = await prisma.otp.findFirst({
    where: {
      userId: user.id,
      code: data.otp,
      used: false,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: "desc" },
  });

  if (!otpRecord) {
    throw AppError.badRequest("Invalid or expired OTP");
  }

  // Mark OTP as used
  await prisma.otp.update({
    where: { id: otpRecord.id },
    data: { used: true },
  });

  // Issue JWT token
  const token = generateToken(user.id);
  return { user: sanitizeUser(user), token };
}

// ─── SIGNIN ─────────────────────────────────────────────────────────────────────

export async function signinUser(data: { email: string; password: string }) {
  const user = await prisma.user.findUnique({
    where: { email: data.email },
  });

  if (!user || !user.password) {
    throw AppError.unauthorized("Invalid email or password");
  }

  const valid = await bcrypt.compare(data.password, user.password);
  if (!valid) {
    throw AppError.unauthorized("Invalid email or password");
  }

  const token = generateToken(user.id);
  return { user: sanitizeUser(user), token };
}

// ─── FORGOT PASSWORD ────────────────────────────────────────────────────────────

export async function forgotPasswordService(email: string) {
  const user = await prisma.user.findUnique({ where: { email } });

  if (!user) {
    // Don't reveal whether email exists
    return;
  }

  // Invalidate previous OTPs
  await prisma.otp.updateMany({
    where: { userId: user.id, used: false },
    data: { used: true },
  });

  const code = generateOtp();
  const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

  await prisma.otp.create({
    data: {
      userId: user.id,
      code,
      expiresAt,
    },
  });

  await sendOtpEmail(user.email, user.fullName, code);
}

// ─── RESET PASSWORD ─────────────────────────────────────────────────────────────

export async function resetPasswordService(data: {
  email: string;
  otp: string;
  newPassword: string;
}) {
  const user = await prisma.user.findUnique({
    where: { email: data.email },
  });

  if (!user) {
    throw AppError.badRequest("Invalid email or OTP");
  }

  const otpRecord = await prisma.otp.findFirst({
    where: {
      userId: user.id,
      code: data.otp,
      used: false,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: "desc" },
  });

  if (!otpRecord) {
    throw AppError.badRequest("Invalid or expired OTP");
  }

  const hashedPassword = await bcrypt.hash(data.newPassword, SALT_ROUNDS);

  await prisma.$transaction([
    prisma.otp.update({
      where: { id: otpRecord.id },
      data: { used: true },
    }),
    prisma.user.update({
      where: { id: user.id },
      data: { password: hashedPassword },
    }),
  ]);
}

// ─── OAUTH ──────────────────────────────────────────────────────────────────────

export async function findOrCreateOAuthUser(data: {
  email: string;
  fullName: string;
  avatarUrl?: string | undefined;
  provider: "GOOGLE" | "GITHUB";
  providerId: string;
}) {
  // Check if OAuth account already linked
  const existingOAuth = await prisma.oAuthAccount.findUnique({
    where: {
      provider_providerId: {
        provider: data.provider,
        providerId: data.providerId,
      },
    },
    include: { user: true },
  });

  if (existingOAuth) {
    const token = generateToken(existingOAuth.user.id);
    return { user: sanitizeUser(existingOAuth.user), token };
  }

  // Check if user with this email exists (link OAuth to existing account)
  let user = await prisma.user.findUnique({ where: { email: data.email } });

  if (user) {
    await prisma.oAuthAccount.create({
      data: {
        userId: user.id,
        provider: data.provider,
        providerId: data.providerId,
      },
    });
  } else {
    user = await prisma.user.create({
      data: {
        email: data.email,
        fullName: data.fullName,
        avatarUrl: data.avatarUrl ?? null,
        oauthAccounts: {
          create: {
            provider: data.provider,
            providerId: data.providerId,
          },
        },
      },
    });
  }

  const token = generateToken(user.id);
  return { user: sanitizeUser(user), token };
}

// ─── HELPERS ────────────────────────────────────────────────────────────────────

function generateToken(userId: string): string {
  return jwt.sign({ sub: userId }, env.JWT_SECRET as Secret, {
    expiresIn: "7d",
  });
}

function generateOtp(): string {
  return crypto.randomInt(100000, 999999).toString();
}

function sanitizeUser(user: { id: string; email: string; fullName: string; avatarUrl?: string | null }) {
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    avatarUrl: user.avatarUrl,
  };
}
