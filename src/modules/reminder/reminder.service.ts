import { prisma } from "../../shared/index.js";
import { AppError } from "../../shared/index.js";

export async function getReminderRules(userId: string) {
  return prisma.reminderRule.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });
}

export async function createReminderRule(userId: string, data: {
  name?: string;
  triggerType: string;
  offsetValue: number;
  offsetUnit: string;
  nextFollowUps?: string[];
  messageTemplate?: string;
  channelEmail?: boolean;
  channelWhatsapp?: boolean;
  channelPush?: boolean;
}) {
  return prisma.reminderRule.create({
    data: {
      userId,
      name: data.name ?? null,
      triggerType: data.triggerType as any,
      offsetValue: data.offsetValue,
      offsetUnit: data.offsetUnit,
      nextFollowUps: data.nextFollowUps ?? [],
      messageTemplate: data.messageTemplate ?? null,
      channelEmail: data.channelEmail ?? true,
      channelWhatsapp: data.channelWhatsapp ?? false,
      channelPush: data.channelPush ?? true,
      isActive: true,
    },
  });
}

export async function toggleReminderRule(userId: string, ruleId: string, isActive: boolean) {
  const rule = await prisma.reminderRule.findFirst({
    where: { id: ruleId, userId },
  });

  if (!rule) throw AppError.notFound("Reminder rule not found");

  return prisma.reminderRule.update({
    where: { id: ruleId },
    data: { isActive },
  });
}

export async function deleteReminderRule(userId: string, ruleId: string) {
  const rule = await prisma.reminderRule.findFirst({
    where: { id: ruleId, userId },
  });

  if (!rule) throw AppError.notFound("Reminder rule not found");

  await prisma.reminderRule.delete({ where: { id: ruleId } });
}
