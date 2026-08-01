import bcrypt from "bcrypt";
import jwt, { type Secret } from "jsonwebtoken";
import crypto from "node:crypto";
import { prisma } from "../../shared/index.js";
import { env, REFRESH_TOKEN_EXPIRES_IN_DAYS } from "../../config/index.js";
import { AppError } from "../../shared/index.js";
import { sendOtpEmail } from "./email.service.js";
import { billingService } from "../billing/billing.service.js";
import { UserPlan } from "../../generated/client/enums.js";

const SALT_ROUNDS = 12;
const OTP_EXPIRY_MINUTES = 10;

// ─── SIGNUP (legacy — kept for reference but unused) ────────────────────────────

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

  const { accessToken, refreshToken } = await generateTokenPair(user.id);
  return { user: sanitizeUser(user), accessToken, refreshToken };
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

  const hashedPassword = await bcrypt.hash(data.password, SALT_ROUNDS);
  let user = existing;

  if (existing) {
    if (existing.verified) {
      throw AppError.conflict("Email already registered");
    }
    user = await prisma.user.update({
      where: { id: existing.id },
      data: {
        password: hashedPassword,
        fullName: data.fullName,
      },
    });
  } else {
    user = await prisma.user.create({
      data: {
        email: data.email,
        password: hashedPassword,
        fullName: data.fullName,
      },
    });

    // Seed default reminder rules for new user
    await seedDefaultReminderRules(user.id);
  }

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

  return { message: "Verification code sent to your email" };
}

export async function signupVerifyOtp(
  data: { email: string; otp: string },
  metadata?: { userAgent?: string | undefined; ipAddress?: string | undefined }
) {
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

  const [, updatedUser] = await prisma.$transaction([
    prisma.otp.update({
      where: { id: otpRecord.id },
      data: { used: true },
    }),
    prisma.user.update({
      where: { id: user.id },
      data: { verified: true },
    }),
  ]);

  const verifiedCount = await prisma.user.count({
    where: { verified: true },
  });

  let finalUser = updatedUser;
  if (verifiedCount <= env.PRO_PLAN_PROMOTION_LIMIT) {
    await billingService.grantPromoAccess(user.id, UserPlan.PRO, 90);
    finalUser = await prisma.user.findUniqueOrThrow({
      where: { id: user.id },
    });
  }

  const { accessToken, refreshToken } = await generateTokenPair(user.id, metadata);
  return { user: sanitizeUser(finalUser), accessToken, refreshToken };
}

// ─── SIGNIN ─────────────────────────────────────────────────────────────────────

export async function signinUser(
  data: { email: string; password: string },
  metadata?: { userAgent?: string | undefined; ipAddress?: string | undefined }
) {
  const user = await prisma.user.findUnique({
    where: { email: data.email },
  });

  if (!user || !user.password || !user.verified) {
    throw AppError.unauthorized("Invalid email or password");
  }

  const valid = await bcrypt.compare(data.password, user.password);
  if (!valid) {
    throw AppError.unauthorized("Invalid email or password");
  }

  const { accessToken, refreshToken } = await generateTokenPair(user.id, metadata);
  return { user: sanitizeUser(user), accessToken, refreshToken };
}

// ─── FORGOT PASSWORD ────────────────────────────────────────────────────────────

export async function forgotPasswordService(email: string) {
  const user = await prisma.user.findUnique({ where: { email } });

  if (!user) {
    return;
  }

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

export async function findOrCreateOAuthUser(
  data: {
    email: string;
    fullName: string;
    avatarUrl?: string | undefined;
    provider: "GOOGLE" | "GITHUB";
    providerId: string;
  },
  metadata?: { userAgent?: string | undefined; ipAddress?: string | undefined }
) {
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
    let user = existingOAuth.user;
    if (!user.verified) {
      user = await prisma.user.update({
        where: { id: user.id },
        data: { verified: true },
      });
    }
    const { accessToken, refreshToken } = await generateTokenPair(user.id, metadata);
    return { user: sanitizeUser(user), accessToken, refreshToken };
  }

  let user = await prisma.user.findUnique({ where: { email: data.email } });

  if (user) {
    if (!user.verified) {
      user = await prisma.user.update({
        where: { id: user.id },
        data: { verified: true },
      });

      // Check and grant PRO plan on first-time verification
      const verifiedCount = await prisma.user.count({
        where: { verified: true },
      });
      if (verifiedCount <= env.PRO_PLAN_PROMOTION_LIMIT) {
        await billingService.grantPromoAccess(user.id, UserPlan.PRO, 90);
        user = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
      }
    }
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
        verified: true,
        oauthAccounts: {
          create: {
            provider: data.provider,
            providerId: data.providerId,
          },
        },
      },
    });

    // Check and grant PRO plan on new user registration
    const verifiedCount = await prisma.user.count({
      where: { verified: true },
    });
    if (verifiedCount <= env.PRO_PLAN_PROMOTION_LIMIT) {
      await billingService.grantPromoAccess(user.id, UserPlan.PRO, 90);
      user = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    }

    // Seed default reminder rules for new OAuth user
    await seedDefaultReminderRules(user.id);
  }

  const { accessToken, refreshToken } = await generateTokenPair(user.id, metadata);
  return { user: sanitizeUser(user), accessToken, refreshToken };
}

// ─── REFRESH TOKEN ──────────────────────────────────────────────────────────────

export async function refreshTokenService(
  token: string,
  metadata?: { userAgent?: string | undefined; ipAddress?: string | undefined }
) {
  const record = await prisma.refreshToken.findUnique({
    where: { token },
    include: { user: true },
  });

  if (!record || record.revoked || record.expiresAt < new Date()) {
    if (record && !record.revoked) {
      // Potential token reuse — revoke all user tokens
      await prisma.refreshToken.updateMany({
        where: { userId: record.userId },
        data: { revoked: true },
      });
    }
    throw AppError.unauthorized("Invalid or expired refresh token");
  }

  // Rotate: revoke old, issue new pair
  await prisma.refreshToken.update({
    where: { id: record.id },
    data: { revoked: true },
  });

  const { accessToken, refreshToken } = await generateTokenPair(record.userId, metadata);
  return { accessToken, refreshToken, user: sanitizeUser(record.user) };
}

export async function logoutService(token: string) {
  await prisma.refreshToken.updateMany({
    where: { token, revoked: false },
    data: { revoked: true },
  });
}

// ─── HELPERS ────────────────────────────────────────────────────────────────────

async function seedDefaultReminderRules(userId: string) {
  await prisma.reminderRule.createMany({
    data: [
      {
        userId,
        name: "Deliverable Due in 3 Days",
        triggerType: "DELIVERABLE_DUE_SOON",
        offsetValue: 72,
        offsetUnit: "hours",
        nextFollowUps: [],
        recipients: ["me"],
        messageTemplate: "Hi {contact_name}, this is a friendly reminder that your deliverable for {deal_title} is due in 3 days.",
        channelEmail: true,
        channelWhatsapp: false,
        channelPush: true,
        isActive: true,
      },
      {
        userId,
        name: "Deliverable Due Tomorrow",
        triggerType: "DELIVERABLE_DUE_SOON",
        offsetValue: 24,
        offsetUnit: "hours",
        nextFollowUps: [],
        recipients: ["me"],
        messageTemplate: "Hi {contact_name}, this is a friendly reminder that your deliverable for {deal_title} is due tomorrow. Please reach out if you have any questions.",
        channelEmail: true,
        channelWhatsapp: false,
        channelPush: true,
        isActive: true,
      },
    ],
  });
}

function generateAccessToken(userId: string): string {
  return jwt.sign({ sub: userId }, env.JWT_SECRET as Secret, {
    expiresIn: env.JWT_EXPIRES_IN as string,
  } as jwt.SignOptions);
}

async function generateRefreshToken(userId: string, metadata?: { userAgent?: string | undefined; ipAddress?: string | undefined }): Promise<string> {
  const token = crypto.randomBytes(64).toString("hex");
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_EXPIRES_IN_DAYS * 24 * 60 * 60 * 1000);

  await prisma.refreshToken.create({
    data: {
      userId,
      token,
      expiresAt,
      userAgent: metadata?.userAgent || null,
      ipAddress: metadata?.ipAddress || null,
      lastActiveAt: new Date(),
    },
  });

  return token;
}

async function generateTokenPair(userId: string, metadata?: { userAgent?: string | undefined; ipAddress?: string | undefined }) {
  const accessToken = generateAccessToken(userId);
  const refreshToken = await generateRefreshToken(userId, metadata);
  return { accessToken, refreshToken };
}

function generateOtp(): string {
  return crypto.randomInt(100000, 999999).toString();
}

function sanitizeUser(user: { id: string; email: string; fullName: string; avatarUrl?: string | null; verified: boolean }) {
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    avatarUrl: user.avatarUrl,
    verified: user.verified,
  };
}
