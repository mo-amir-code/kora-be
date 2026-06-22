import { prisma } from "../../shared/index.js";
import { MessageTemplateCategory } from "@prisma/client";

export const messageTemplateService = {
  /**
   * List all templates for a user, optionally filtered by category.
   * Includes system templates (isSystem: true).
   */
  async listTemplates(userId: string, category?: MessageTemplateCategory) {
    return prisma.messageTemplate.findMany({
      where: {
        OR: [
          { userId },
          { isSystem: true }
        ],
        ...(category ? { category } : {}),
      },
      orderBy: { name: "asc" },
    });
  },

  /**
   * Create a new message template.
   */
  async createTemplate(userId: string, data: {
    name: string;
    body: string;
    category: MessageTemplateCategory;
    channels: string[];
  }) {
    return prisma.messageTemplate.create({
      data: {
        ...data,
        userId,
        isSystem: false,
      },
    });
  },

  /**
   * Update an existing template.
   */
  async updateTemplate(userId: string, id: string, data: {
    name?: string;
    body?: string;
    category?: MessageTemplateCategory;
    channels?: string[];
  }) {
    return prisma.messageTemplate.update({
      where: { id, userId }, // Ensure user owns the template
      data,
    });
  },

  /**
   * Delete a template.
   */
  async deleteTemplate(userId: string, id: string) {
    return prisma.messageTemplate.delete({
      where: { id, userId }, // Ensure user owns the template
    });
  },

  /**
   * Get a single template by ID.
   */
  async getTemplate(userId: string, id: string) {
    return prisma.messageTemplate.findFirst({
      where: {
        id,
        OR: [{ userId }, { isSystem: true }],
      },
    });
  },
};
