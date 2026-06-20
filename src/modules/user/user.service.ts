import { prisma, AppError } from "../../shared/index.js";

export const userService = {
  /**
   * Get current user profile
   */
  async getMe(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId, deletedAt: null },
      select: {
        id: true,
        email: true,
        fullName: true,
        handle: true,
        avatarUrl: true,
        whatsappNumber: true,
        timezone: true,
        plan: true,
        onboardingDone: true,
        createdAt: true,
        invoiceSettings: true,
      },
    });

    if (!user) {
      throw AppError.notFound("User not found");
    }

    return user;
  },

  /**
   * Update current user profile
   */
  async updateMe(userId: string, data: {
    fullName?: string;
    handle?: string;
    whatsappNumber?: string;
    avatarUrl?: string;
  }) {
    // Check if handle is already taken by someone else
    if (data.handle) {
      const existing = await prisma.user.findFirst({
        where: {
          handle: data.handle,
          id: { not: userId },
          deletedAt: null,
        },
      });

      if (existing) {
        throw AppError.badRequest("This handle is already taken");
      }
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data,
      select: {
        id: true,
        email: true,
        fullName: true,
        handle: true,
        avatarUrl: true,
        whatsappNumber: true,
      },
    });

    return updated;
  },

  /**
   * Update or create invoice settings for a user
   */
  async updateInvoiceSettings(userId: string, data: any) {
    return prisma.userInvoiceSettings.upsert({
      where: { userId },
      create: { ...data, userId },
      update: data,
    });
  },
};
