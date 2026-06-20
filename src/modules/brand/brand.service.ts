import { prisma } from "../../shared/index.js";
import { AppError } from "../../shared/index.js";
import type { CreateBrandBody, UpdateBrandBody, CreateContactBody, UpdateContactBody } from "./brand.validation.js";

// ─── BRANDS ─────────────────────────────────────────────────────────────────────

export async function createBrand(userId: string, data: CreateBrandBody) {
  const brand = await prisma.brand.create({
    data: {
      userId,
      name: data.name,
      category: data.category,
      logoUrl: data.logoUrl ?? null,
      website: data.website ?? null,
      gstin: data.gstin ?? null,
      notes: data.notes ?? [],
    },
    include: { contacts: true },
  });

  return brand;
}

export async function getBrands(userId: string) {
  const brands = await prisma.brand.findMany({
    where: { userId },
    include: {
      contacts: true,
      deals: {
        select: { stage: true, amount: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  // Compute active deals count and total value for each brand
  const activeStages = ["LEAD", "OUTREACH", "NEGOTIATION", "PROPOSAL_SENT", "CONTRACT_SENT", "APPROVED", "IN_PROGRESS"];

  return brands.map((brand) => {
    const activeDeals = brand.deals.filter((d) => activeStages.includes(d.stage));
    const totalValue = activeDeals.reduce((sum, d) => sum + Number(d.amount ?? 0), 0);

    const { deals: _deals, ...rest } = brand;
    return {
      ...rest,
      activeDeals: activeDeals.length,
      totalValue,
    };
  });
}

export async function getBrandById(userId: string, brandId: string) {
  const brand = await prisma.brand.findFirst({
    where: { id: brandId, userId },
    include: {
      contacts: true,
      deals: {
        include: {
          invoices: true,
        },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!brand) {
    throw AppError.notFound("Brand not found");
  }

  const activeStages = ["LEAD", "OUTREACH", "NEGOTIATION", "PROPOSAL_SENT", "CONTRACT_SENT", "APPROVED", "IN_PROGRESS"];
  const activeDeals = brand.deals.filter((d) => activeStages.includes(d.stage));
  const totalValue = activeDeals.reduce((sum, d) => sum + Number(d.amount ?? 0), 0);

  return { ...brand, activeDeals: activeDeals.length, totalValue };
}

export async function updateBrand(userId: string, brandId: string, data: UpdateBrandBody) {
  // Verify ownership
  const existing = await prisma.brand.findFirst({
    where: { id: brandId, userId },
  });

  if (!existing) {
    throw AppError.notFound("Brand not found");
  }

  const brand = await prisma.brand.update({
    where: { id: brandId },
    data: {
      ...(data.name !== undefined && { name: data.name }),
      ...(data.category !== undefined && { category: data.category }),
      ...(data.logoUrl !== undefined && { logoUrl: data.logoUrl }),
      ...(data.website !== undefined && { website: data.website }),
      ...(data.gstin !== undefined && { gstin: data.gstin }),
      ...(data.notes !== undefined && { notes: data.notes }),
    },
    include: { contacts: true },
  });

  return brand;
}

export async function deleteBrand(userId: string, brandId: string) {
  const existing = await prisma.brand.findFirst({
    where: { id: brandId, userId },
  });

  if (!existing) {
    throw AppError.notFound("Brand not found");
  }

  await prisma.brand.delete({ where: { id: brandId } });
}

// ─── BRAND CONTACTS ─────────────────────────────────────────────────────────────

export async function createContact(userId: string, brandId: string, data: CreateContactBody) {
  // Verify brand ownership
  const brand = await prisma.brand.findFirst({
    where: { id: brandId, userId },
  });

  if (!brand) {
    throw AppError.notFound("Brand not found");
  }

  // If setting as primary, unset other primary contacts
  if (data.isPrimary) {
    await prisma.brandContact.updateMany({
      where: { brandId, isPrimary: true },
      data: { isPrimary: false },
    });
  }

  const contact = await prisma.brandContact.create({
    data: {
      brandId,
      name: data.name,
      role: data.role ?? null,
      email: data.email ?? null,
      whatsapp: data.whatsapp ?? null,
      isPrimary: data.isPrimary ?? false,
    },
  });

  return contact;
}

export async function getContacts(userId: string, brandId: string) {
  // Verify brand ownership
  const brand = await prisma.brand.findFirst({
    where: { id: brandId, userId },
  });

  if (!brand) {
    throw AppError.notFound("Brand not found");
  }

  const contacts = await prisma.brandContact.findMany({
    where: { brandId },
    orderBy: [{ isPrimary: "desc" }, { createdAt: "desc" }],
  });

  return contacts;
}

export async function updateContact(userId: string, brandId: string, contactId: string, data: UpdateContactBody) {
  // Verify brand ownership
  const brand = await prisma.brand.findFirst({
    where: { id: brandId, userId },
  });

  if (!brand) {
    throw AppError.notFound("Brand not found");
  }

  const existing = await prisma.brandContact.findFirst({
    where: { id: contactId, brandId },
  });

  if (!existing) {
    throw AppError.notFound("Contact not found");
  }

  // If setting as primary, unset other primary contacts
  if (data.isPrimary) {
    await prisma.brandContact.updateMany({
      where: { brandId, isPrimary: true, id: { not: contactId } },
      data: { isPrimary: false },
    });
  }

  const contact = await prisma.brandContact.update({
    where: { id: contactId },
    data: {
      ...(data.name !== undefined && { name: data.name }),
      ...(data.role !== undefined && { role: data.role }),
      ...(data.email !== undefined && { email: data.email }),
      ...(data.whatsapp !== undefined && { whatsapp: data.whatsapp }),
      ...(data.isPrimary !== undefined && { isPrimary: data.isPrimary }),
    },
  });

  return contact;
}

export async function deleteContact(userId: string, brandId: string, contactId: string) {
  // Verify brand ownership
  const brand = await prisma.brand.findFirst({
    where: { id: brandId, userId },
  });

  if (!brand) {
    throw AppError.notFound("Brand not found");
  }

  const existing = await prisma.brandContact.findFirst({
    where: { id: contactId, brandId },
  });

  if (!existing) {
    throw AppError.notFound("Contact not found");
  }

  await prisma.brandContact.delete({ where: { id: contactId } });
}
