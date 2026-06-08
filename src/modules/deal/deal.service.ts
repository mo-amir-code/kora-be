import { prisma } from "../../shared/index.js";
import { AppError } from "../../shared/index.js";
import type { CreateDealBody, UpdateDealBody } from "./deal.validation.js";

// ─── ACTIVITY LOGGER ────────────────────────────────────────────────────────────

async function logActivity(dealId: string, userId: string, type: string, body?: string) {
  await prisma.dealActivity.create({
    data: {
      dealId,
      userId,
      type: type as any,
      body: body ?? null,
    },
  });
}

export async function createDeal(userId: string, data: CreateDealBody) {
  // Verify brand belongs to user
  const brand = await prisma.brand.findFirst({
    where: { id: data.brandId, userId },
  });

  if (!brand) {
    throw AppError.notFound("Brand not found");
  }

  // Create deal with deliverables in a transaction
  const deal = await prisma.deal.create({
    data: {
      userId,
      brandId: data.brandId,
      contactId: data.contactId ?? null,
      title: data.title,
      stage: data.stage ?? "LEAD",
      amount: data.amount ?? null,
      currency: data.currency ?? "INR",
      paymentTerms: data.paymentTerms ?? null,
      paymentDueDate: data.paymentDueDate ? new Date(data.paymentDueDate) : null,
      platforms: data.platforms ?? [],
      contractUrl: data.contractUrl ?? null,
      exclusivityEnds: data.exclusivityEnds ? new Date(data.exclusivityEnds) : null,
      notes: data.notes ?? null,
      deliverables: {
        create: (data.deliverables ?? []).map((d) => ({
          type: d.type,
          quantity: d.quantity ?? 1,
          platform: d.platform ?? null,
          dueDate: d.dueDate ? new Date(d.dueDate) : null,
          notes: d.notes ?? null,
        })),
      },
    },
    include: { brand: true, contact: true, deliverables: true },
  });

  // Log activity
  await logActivity(deal.id, userId, "DEAL_CREATED", `Deal "${deal.title}" created with brand ${deal.brand.name}`);

  if ((data.deliverables ?? []).length > 0) {
    const details = data.deliverables!.map((d) => `${d.quantity ?? 1}x ${d.type.replace(/_/g, " ")}`).join(", ");
    await logActivity(deal.id, userId, "DELIVERABLE_ADDED", `Deliverables added: ${details}`);
  }

  return deal;
}

export async function getDeals(userId: string, stage?: string) {
  const where: Record<string, unknown> = { userId };
  if (stage && stage !== "all") {
    where["stage"] = stage;
  }

  const deals = await prisma.deal.findMany({
    where,
    include: {
      brand: { select: { id: true, name: true, logoUrl: true } },
      contact: { select: { id: true, name: true } },
      deliverables: true,
    },
    orderBy: { createdAt: "desc" },
  });

  return deals;
}

export async function getDealById(userId: string, dealId: string) {
  const deal = await prisma.deal.findFirst({
    where: { id: dealId, userId },
    include: {
      brand: { select: { id: true, name: true, logoUrl: true, category: true } },
      contact: true,
      deliverables: true,
      activities: { orderBy: { createdAt: "desc" } },
    },
  });

  if (!deal) {
    throw AppError.notFound("Deal not found");
  }

  return deal;
}

export async function updateDeal(userId: string, dealId: string, data: UpdateDealBody) {
  const existing = await prisma.deal.findFirst({
    where: { id: dealId, userId },
  });

  if (!existing) {
    throw AppError.notFound("Deal not found");
  }

  const deal = await prisma.deal.update({
    where: { id: dealId },
    data: {
      ...(data.title !== undefined && { title: data.title }),
      ...(data.stage !== undefined && { stage: data.stage }),
      ...(data.amount !== undefined && { amount: data.amount }),
      ...(data.currency !== undefined && { currency: data.currency }),
      ...(data.paymentTerms !== undefined && { paymentTerms: data.paymentTerms }),
      ...(data.paymentDueDate !== undefined && { paymentDueDate: data.paymentDueDate ? new Date(data.paymentDueDate) : null }),
      ...(data.platforms !== undefined && { platforms: data.platforms }),
      ...(data.contractUrl !== undefined && { contractUrl: data.contractUrl }),
      ...(data.exclusivityEnds !== undefined && { exclusivityEnds: data.exclusivityEnds ? new Date(data.exclusivityEnds) : null }),
      ...(data.notes !== undefined && { notes: data.notes }),
      ...(data.contactId !== undefined && { contactId: data.contactId }),
    },
    include: { brand: true, contact: true, deliverables: true },
  });

  // Log activity for each change that actually differs from existing
  if (data.stage !== undefined && data.stage !== existing.stage) {
    await logActivity(dealId, userId, "STAGE_CHANGED", `Stage changed from ${existing.stage.replace(/_/g, " ")} to ${data.stage.replace(/_/g, " ")}`);
  }
  if (data.title !== undefined && data.title !== existing.title) {
    await logActivity(dealId, userId, "DEAL_UPDATED", `Title changed from "${existing.title}" to "${data.title}"`);
  }
  if (data.amount !== undefined && String(data.amount) !== String(existing.amount)) {
    const oldAmt = existing.amount ? `₹${Number(existing.amount).toLocaleString("en-IN")}` : "none";
    const newAmt = data.amount ? `₹${Number(data.amount).toLocaleString("en-IN")}` : "none";
    await logActivity(dealId, userId, "DEAL_UPDATED", `Amount changed from ${oldAmt} to ${newAmt}`);
  }
  if (data.currency !== undefined && data.currency !== existing.currency) {
    await logActivity(dealId, userId, "DEAL_UPDATED", `Currency changed from ${existing.currency} to ${data.currency}`);
  }
  if (data.contactId !== undefined && data.contactId !== existing.contactId) {
    const oldContact = existing.contactId ? (await prisma.brandContact.findUnique({ where: { id: existing.contactId } }))?.name ?? "unknown" : "none";
    const newContact = data.contactId ? (await prisma.brandContact.findUnique({ where: { id: data.contactId } }))?.name ?? "unknown" : "none";
    await logActivity(dealId, userId, "CONTACT_CHANGED", `Contact changed from "${oldContact}" to "${newContact}"`);
  }
  if (data.paymentTerms !== undefined && data.paymentTerms !== existing.paymentTerms) {
    const oldTerms = existing.paymentTerms?.replace(/_/g, " ") ?? "none";
    const newTerms = data.paymentTerms?.replace(/_/g, " ") ?? "none";
    await logActivity(dealId, userId, "DEAL_UPDATED", `Payment terms changed from ${oldTerms} to ${newTerms}`);
  }
  if (data.paymentDueDate !== undefined) {
    const oldDate = existing.paymentDueDate ? existing.paymentDueDate.toISOString().split("T")[0] : "none";
    const newDate = data.paymentDueDate ?? "none";
    if (oldDate !== newDate) {
      await logActivity(dealId, userId, "DEAL_UPDATED", `Payment due date changed from ${oldDate} to ${newDate}`);
    }
  }
  if (data.platforms !== undefined && JSON.stringify(data.platforms.sort()) !== JSON.stringify([...existing.platforms].sort())) {
    await logActivity(dealId, userId, "DEAL_UPDATED", `Platforms changed to: ${data.platforms.join(", ") || "none"}`);
  }
  if (data.contractUrl !== undefined && data.contractUrl !== existing.contractUrl) {
    await logActivity(dealId, userId, "CONTRACT_UPLOADED", data.contractUrl ? "Contract URL added" : "Contract URL removed");
  }
  if (data.notes !== undefined && data.notes !== existing.notes) {
    const oldNotes = existing.notes ? (existing.notes.length > 50 ? existing.notes.slice(0, 50) + "..." : existing.notes) : "empty";
    const newNotes = data.notes ? (data.notes.length > 50 ? data.notes.slice(0, 50) + "..." : data.notes) : "empty";
    await logActivity(dealId, userId, "NOTE_ADDED", `Notes changed from "${oldNotes}" to "${newNotes}"`);
  }

  return deal;
}

export async function deleteDeal(userId: string, dealId: string) {
  const existing = await prisma.deal.findFirst({
    where: { id: dealId, userId },
  });

  if (!existing) {
    throw AppError.notFound("Deal not found");
  }

  await prisma.deal.delete({ where: { id: dealId } });
}

export async function updateDeliverables(userId: string, dealId: string, updates: { id: string; isCompleted: boolean }[]) {
  // Verify deal ownership
  const deal = await prisma.deal.findFirst({
    where: { id: dealId, userId },
    include: { deliverables: true },
  });

  if (!deal) {
    throw AppError.notFound("Deal not found");
  }

  // Update each deliverable
  const now = new Date();
  await Promise.all(
    updates.map((u) =>
      prisma.deliverable.update({
        where: { id: u.id },
        data: {
          isCompleted: u.isCompleted,
          completedAt: u.isCompleted ? now : null,
        },
      })
    )
  );

  // Return updated deal
  const updatedDeal = await prisma.deal.findFirst({
    where: { id: dealId },
    include: { brand: true, contact: true, deliverables: true },
  });

  // Log activity — only for items that actually changed state
  const newlyCompleted = deal.deliverables.filter(
    (d) => !d.isCompleted && updates.find((u) => u.id === d.id)?.isCompleted === true
  );
  const newlyUncompleted = deal.deliverables.filter(
    (d) => d.isCompleted && updates.find((u) => u.id === d.id)?.isCompleted === false
  );

  if (newlyCompleted.length > 0) {
    const names = newlyCompleted.map((d) => `${d.quantity}x ${d.type.replace(/_/g, " ")}`).join(", ");
    await logActivity(dealId, userId, "DELIVERABLE_COMPLETED", `Completed: ${names}`);
  }

  if (newlyUncompleted.length > 0) {
    const names = newlyUncompleted.map((d) => `${d.quantity}x ${d.type.replace(/_/g, " ")}`).join(", ");
    await logActivity(dealId, userId, "DEAL_UPDATED", `Unmarked: ${names}`);
  }

  return updatedDeal;
}

export async function createDealActivity(userId: string, dealId: string, type: string, body: string) {
  const deal = await prisma.deal.findFirst({ where: { id: dealId, userId } });
  if (!deal) throw AppError.notFound("Deal not found");

  await logActivity(dealId, userId, type, body);

  return prisma.deal.findFirst({
    where: { id: dealId },
    include: { brand: true, contact: true, deliverables: true, activities: { orderBy: { createdAt: "desc" } } },
  });
}
