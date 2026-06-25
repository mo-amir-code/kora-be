import { apiController, AppOk, AppError } from "../../shared/index.js";
import { sendSupportInquiry } from "./support.service.js";
import { prisma } from "../../shared/index.js";
import type { SubmitInquiryBody } from "./support.validation.js";

export const submitInquiry = apiController(async (req) => {
  if (!req.userId) throw AppError.unauthorized("Not authenticated");

  const user = await prisma.user.findUnique({
    where: { id: req.userId },
    select: { email: true },
  });

  if (!user) throw AppError.notFound("User not found");

  const body = req.body as SubmitInquiryBody;
  await sendSupportInquiry(body, user.email);
  return AppOk.ok({ message: "Inquiry submitted successfully" });
});
