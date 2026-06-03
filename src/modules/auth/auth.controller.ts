import { apiController, AppOk, AppError, prisma } from "../../shared/index.js";
import { signupUser, signupSendOtp, signupVerifyOtp, signinUser, forgotPasswordService, resetPasswordService } from "./auth.service.js";
import type { SignupBody, SigninBody, ForgotPasswordBody, ResetPasswordBody, SignupSendOtpBody, SignupVerifyOtpBody } from "./auth.validation.js";

export const signup = apiController(async (req) => {
  const result = await signupUser(req.body as SignupBody);
  return AppOk.created({ data: result, message: "Account created" });
});

export const signupSendOtpController = apiController(async (req) => {
  const result = await signupSendOtp(req.body as SignupSendOtpBody);
  return AppOk.ok(result);
});

export const signupVerifyOtpController = apiController(async (req) => {
  const result = await signupVerifyOtp(req.body as SignupVerifyOtpBody);
  return AppOk.ok({ data: result, message: "Email verified successfully" });
});

export const signin = apiController(async (req) => {
  const result = await signinUser(req.body as SigninBody);
  return AppOk.ok({ data: result });
});

export const forgotPassword = apiController(async (req) => {
  const { email } = req.body as ForgotPasswordBody;
  await forgotPasswordService(email);
  return AppOk.ok({ message: "If the email exists, a reset code has been sent" });
});

export const resetPassword = apiController(async (req) => {
  await resetPasswordService(req.body as ResetPasswordBody);
  return AppOk.ok({ message: "Password reset successfully" });
});

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
