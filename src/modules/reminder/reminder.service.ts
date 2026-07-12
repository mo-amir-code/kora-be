import { prisma } from "../../shared/index.js";
import { AppError } from "../../shared/index.js";

function parseDurationToMinutes(durationStr: string): number {
  const parts = durationStr.trim().split(/\s+/);
  const val = parseFloat(parts[0] || "");
  const unit = parts[1]?.toLowerCase();
  
  if (isNaN(val)) return 0;
  
  switch (unit) {
    case "minutes":
    case "minute":
      return val;
    case "hours":
    case "hour":
      return val * 60;
    case "days":
    case "day":
      return val * 24 * 60;
    case "weeks":
    case "week":
      return val * 7 * 24 * 60;
    default:
      return 0;
  }
}

export async function getReminderRules(userId: string) {
  return prisma.reminderRule.findMany({
    where: { userId },
    include: { template: true },
    orderBy: { createdAt: "desc" },
  });
}

export async function createReminderRule(userId: string, data: {
  name?: string;
  triggerType: string;
  offsetValue: number;
  offsetUnit: string;
  nextFollowUps?: string[];
  recipients?: string[];
  messageTemplate?: string | null;
  templateId?: string | null;
  channelEmail?: boolean;
  channelWhatsapp?: boolean;
  channelPush?: boolean;
}) {
  if (data.nextFollowUps) {
    if (data.nextFollowUps.length > 2) {
      throw AppError.badRequest("Maximum of 2 scheduled follow-ups are allowed per reminder rule.");
    }
    for (const f of data.nextFollowUps) {
      if (parseDurationToMinutes(f) < 30) {
        throw AppError.badRequest(`Each scheduled follow-up interval must be at least 30 minutes. Found: "${f}"`);
      }
    }
  }

  return prisma.reminderRule.create({
    data: {
      userId,
      name: data.name ?? null,
      triggerType: data.triggerType as any,
      offsetValue: data.offsetValue,
      offsetUnit: data.offsetUnit,
      nextFollowUps: data.nextFollowUps ?? [],
      recipients: data.recipients ?? [],
      messageTemplate: data.templateId ? null : (data.messageTemplate ?? null),
      templateId: data.templateId ?? null,
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

export async function updateReminderRule(userId: string, ruleId: string, data: {
  name?: string;
  triggerType?: string;
  offsetValue?: number;
  offsetUnit?: string;
  nextFollowUps?: string[];
  recipients?: string[];
  messageTemplate?: string | null;
  templateId?: string | null;
  channelEmail?: boolean;
  channelWhatsapp?: boolean;
  channelPush?: boolean;
}) {
  if (data.nextFollowUps) {
    if (data.nextFollowUps.length > 2) {
      throw AppError.badRequest("Maximum of 2 scheduled follow-ups are allowed per reminder rule.");
    }
    for (const f of data.nextFollowUps) {
      if (parseDurationToMinutes(f) < 30) {
        throw AppError.badRequest(`Each scheduled follow-up interval must be at least 30 minutes. Found: "${f}"`);
      }
    }
  }

  const rule = await prisma.reminderRule.findFirst({
    where: { id: ruleId, userId },
  });

  if (!rule) throw AppError.notFound("Reminder rule not found");

  return prisma.reminderRule.update({
    where: { id: ruleId },
    data: {
      name: data.name !== undefined ? data.name : rule.name,
      triggerType: data.triggerType !== undefined ? (data.triggerType as any) : rule.triggerType,
      offsetValue: data.offsetValue !== undefined ? data.offsetValue : rule.offsetValue,
      offsetUnit: data.offsetUnit !== undefined ? data.offsetUnit : rule.offsetUnit,
      nextFollowUps: data.nextFollowUps !== undefined ? data.nextFollowUps : rule.nextFollowUps,
      recipients: data.recipients !== undefined ? data.recipients : rule.recipients,
      messageTemplate: data.templateId !== undefined
        ? (data.templateId ? null : (data.messageTemplate !== undefined ? data.messageTemplate : rule.messageTemplate))
        : (data.messageTemplate !== undefined ? data.messageTemplate : rule.messageTemplate),
      templateId: data.templateId !== undefined ? data.templateId : rule.templateId,
      channelEmail: data.channelEmail !== undefined ? data.channelEmail : rule.channelEmail,
      channelWhatsapp: data.channelWhatsapp !== undefined ? data.channelWhatsapp : rule.channelWhatsapp,
      channelPush: data.channelPush !== undefined ? data.channelPush : rule.channelPush,
    },
  });
}
