import { BillingCycle, SubscriptionPlan, UserPlan, SubscriptionStatus, TransactionStatus, TransactionType } from "../../generated/client/enums.js";
import { prisma, AppError } from "../../shared/index.js";
import { env } from "../../config/index.js";
import { providerClient } from "./provider.client.js";

// Helper to map BillingCycle to Provider product ID
export const BILLING_CYCLE_TO_PRODUCT_ID: Record<BillingCycle, string> = {
  MONTHLY: env.PROVIDER_PRO_MONTHLY_PRODUCT_ID,
  QUARTERLY: env.PROVIDER_PRO_QUARTERLY_PRODUCT_ID,
  YEARLY: env.PROVIDER_PRO_YEARLY_PRODUCT_ID,
};

// Inverse map to find cycle from provider product ID
export const PRODUCT_ID_TO_BILLING_CYCLE: Record<string, BillingCycle> = {
  [env.PROVIDER_PRO_MONTHLY_PRODUCT_ID]: BillingCycle.MONTHLY,
  [env.PROVIDER_PRO_QUARTERLY_PRODUCT_ID]: BillingCycle.QUARTERLY,
  [env.PROVIDER_PRO_YEARLY_PRODUCT_ID]: BillingCycle.YEARLY,
};

export class BillingService {
  /**
   * Helper: Resolves target user by parsing webhook customer and metadata identifiers.
   */
  private async findUserByPayload(data: any) {
    const customerId = data.customer?.customer_id;
    const email = data.customer?.email;
    const userId = data.metadata?.userId || null;

    return prisma.user.findFirst({
      where: {
        OR: [
          ...(customerId ? [{ providerCustomerId: customerId }] : []),
          ...(email ? [{ email }] : []),
          ...(userId ? [{ id: userId }] : []),
        ],
      },
    });
  }

  /**
   * Helper: Converts raw provider payment amounts (cents/paisa) to standard decimal currency units.
   */
  private convertAmount(amountInCents: number): number {
    return amountInCents / 100;
  }

  /**
   * Helper: Resolves or creates a stub subscription record linked to the user.
   */
  private async getOrCreateSubscriptionStub(userId: string) {
    return prisma.subscription.upsert({
      where: { userId },
      update: {},
      create: {
        userId,
        plan: SubscriptionPlan.FREE,
        billingCycle: BillingCycle.MONTHLY,
        status: SubscriptionStatus.EXPIRED,
      },
    });
  }

  /**
   * Helper: Idempotently creates a Transaction history record.
   */
  private async recordTransaction(params: {
    userId: string;
    subscriptionId: string;
    providerPaymentId: string | null;
    providerInvoiceId: string | null;
    providerSubscriptionId: string | null;
    amount: number;
    currency: string;
    status: TransactionStatus;
    type: TransactionType;
    paidAt: Date | null;
  }) {
    if (params.providerPaymentId) {
      const existing = await prisma.transaction.findFirst({
        where: { providerPaymentId: params.providerPaymentId },
      });
      if (existing) {
        console.log(`[Webhook] Duplicate transaction detection: Payment ID ${params.providerPaymentId} already recorded. Skipping.`);
        return;
      }
    }

    await prisma.transaction.create({
      data: {
        userId: params.userId,
        subscriptionId: params.subscriptionId,
        providerPaymentId: params.providerPaymentId,
        providerInvoiceId: params.providerInvoiceId,
        providerSubscriptionId: params.providerSubscriptionId,
        amount: params.amount,
        currency: params.currency,
        status: params.status,
        type: params.type,
        paidAt: params.paidAt,
      },
    });
  }

  /**
   * Helper: Maps provider status strings to SubscriptionStatus.
   */
  private mapProviderStatus(status: string): SubscriptionStatus {
    switch (status) {
      case "active":
        return SubscriptionStatus.ACTIVE;
      case "cancelled":
        return SubscriptionStatus.CANCELLED;
      case "on_hold":
        return SubscriptionStatus.PAST_DUE;
      case "expired":
      case "failed":
        return SubscriptionStatus.EXPIRED;
      default:
        return SubscriptionStatus.EXPIRED;
    }
  }

  /**
   * Helper: Maps product ID to BillingCycle.
   */
  private mapProductIdToCycle(productId: string): BillingCycle {
    return PRODUCT_ID_TO_BILLING_CYCLE[productId] || BillingCycle.MONTHLY;
  }

  async createCheckoutSession(userId: string, billingCycle: BillingCycle) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });
    if (!user) {
      throw AppError.notFound("User not found");
    }

    const productId = BILLING_CYCLE_TO_PRODUCT_ID[billingCycle];
    if (!productId) {
      throw AppError.badRequest(`Invalid billing cycle: ${billingCycle}`);
    }

    const subscription = await prisma.subscription.findUnique({
      where: { userId },
    });

    const isPromoActive =
      subscription &&
      subscription.providerSubscriptionId === "PROMO" &&
      subscription.status === SubscriptionStatus.ACTIVE &&
      subscription.currentPeriodEnd &&
      subscription.currentPeriodEnd > new Date();

    const checkoutParams: any = {
      product_cart: [
        {
          product_id: productId,
          quantity: 1,
        },
      ],
      metadata: {
        userId: user.id,
      },
      return_url: `${env.CLIENT_URL}/subscription?status=success`,
      cancel_url: `${env.CLIENT_URL}/subscription?status=cancel`,
    };

    if (isPromoActive && subscription.currentPeriodEnd) {
      const now = new Date();
      const remainingMs = subscription.currentPeriodEnd.getTime() - now.getTime();
      const remainingDays = Math.ceil(remainingMs / (1000 * 60 * 60 * 24));
      if (remainingDays > 0) {
        checkoutParams.subscription_data = {
          trial_period_days: remainingDays,
        };
      }
    }

    if (user.providerCustomerId) {
      checkoutParams.customer = {
        customer_id: user.providerCustomerId,
      };
    } else {
      checkoutParams.customer = {
        email: user.email,
        name: user.fullName || user.email.split("@")[0],
      };
    }

    try {
      const session = await providerClient.checkoutSessions.create(checkoutParams);
      return {
        checkoutUrl: session.checkout_url,
        paymentId: session.payment_id,
        sessionId: session.session_id,
      };
    } catch (err: any) {
      throw AppError.internal(`Failed to create checkout session: ${err.message}`);
    }
  }

  /**
   * Upgrades or downgrades an active subscription immediately.
   */
  async changePlan(userId: string, billingCycle: BillingCycle) {
    const subscription = await prisma.subscription.findUnique({
      where: { userId },
    });

    if (!subscription || !subscription.providerSubscriptionId || subscription.status !== SubscriptionStatus.ACTIVE) {
      throw AppError.badRequest("No active payment provider subscription found to update.");
    }

    if (subscription.providerSubscriptionId === "PROMO") {
      throw AppError.badRequest("Cannot change plan on a promotional subscription. Please purchase a regular subscription instead.");
    }

    const newProductId = BILLING_CYCLE_TO_PRODUCT_ID[billingCycle];
    if (!newProductId) {
      throw AppError.badRequest(`Invalid billing cycle: ${billingCycle}`);
    }

    try {
      await providerClient.subscriptions.changePlan(subscription.providerSubscriptionId, {
        product_id: newProductId,
        proration_billing_mode: "prorated_immediately",
        quantity: 1,
      });
      return { message: "Plan change initiated successfully" };
    } catch (err: any) {
      throw AppError.internal(`Failed to change plan: ${err.message}`);
    }
  }

  /**
   * Cancels subscription at the period end.
   */
  async cancelSubscription(userId: string) {
    const subscription = await prisma.subscription.findUnique({
      where: { userId },
    });

    if (!subscription || !subscription.providerSubscriptionId || subscription.status !== SubscriptionStatus.ACTIVE) {
      throw AppError.badRequest("No active payment provider subscription found to cancel.");
    }

    try {
      await providerClient.subscriptions.update(subscription.providerSubscriptionId, {
        cancel_at_next_billing_date: true,
      });
      await prisma.subscription.update({
        where: { userId },
        data: {
          cancelAtPeriodEnd: true,
        },
      });
      return { message: "Subscription scheduled for cancellation at the next billing date" };
    } catch (err: any) {
      throw AppError.internal(`Failed to cancel subscription: ${err.message}`);
    }
  }

  /**
   * Resumes a cancelled-but-active subscription before the period end.
   */
  async resumeSubscription(userId: string) {
    const subscription = await prisma.subscription.findUnique({
      where: { userId },
    });

    if (!subscription || !subscription.providerSubscriptionId) {
      throw AppError.badRequest("No active subscription found to resume.");
    }

    if (subscription.status !== SubscriptionStatus.ACTIVE && subscription.status !== SubscriptionStatus.CANCELLED) {
      throw AppError.badRequest("Subscription is not in a resumeable state.");
    }

    try {
      await providerClient.subscriptions.update(subscription.providerSubscriptionId, {
        cancel_at_next_billing_date: false,
      });
      await prisma.subscription.update({
        where: { userId },
        data: {
          cancelAtPeriodEnd: false,
        },
      });
      return { message: "Subscription successfully resumed" };
    } catch (err: any) {
      throw AppError.internal(`Failed to resume subscription: ${err.message}`);
    }
  }

  /**
   * Grants local promotional PRO access (bypassing payment provider).
   */
  async grantPromoAccess(targetUserId: string, plan: UserPlan, durationDays: number) {
    const user = await prisma.user.findUnique({
      where: { id: targetUserId },
    });
    if (!user) {
      throw AppError.notFound("Target user not found");
    }

    const now = new Date();
    const expiresAt = plan === UserPlan.PRO ? new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000) : null;

    await prisma.$transaction(async (tx) => {
      // 1. Update user cached credentials
      await tx.user.update({
        where: { id: targetUserId },
        data: {
          plan,
          planExpiresAt: expiresAt,
        },
      });

      // 2. Upsert Subscription locally
      const subscription = await tx.subscription.upsert({
        where: { userId: targetUserId },
        update: {
          plan: plan === UserPlan.PRO ? SubscriptionPlan.PRO : SubscriptionPlan.FREE,
          billingCycle: BillingCycle.MONTHLY,
          status: plan === UserPlan.PRO ? SubscriptionStatus.ACTIVE : SubscriptionStatus.EXPIRED,
          currentPeriodStart: plan === UserPlan.PRO ? now : null,
          currentPeriodEnd: expiresAt,
          providerSubscriptionId: plan === UserPlan.PRO ? "PROMO" : null,
          providerProductId: "PROMO",
          cancelAtPeriodEnd: false,
          cancelledAt: null,
        },
        create: {
          userId: targetUserId,
          plan: plan === UserPlan.PRO ? SubscriptionPlan.PRO : SubscriptionPlan.FREE,
          billingCycle: BillingCycle.MONTHLY,
          status: plan === UserPlan.PRO ? SubscriptionStatus.ACTIVE : SubscriptionStatus.EXPIRED,
          currentPeriodStart: plan === UserPlan.PRO ? now : null,
          currentPeriodEnd: expiresAt,
          providerSubscriptionId: plan === UserPlan.PRO ? "PROMO" : null,
          providerProductId: "PROMO",
        },
      });

      // 3. Record Transaction history record if PRO plan is being issued
      if (plan === UserPlan.PRO) {
        await tx.transaction.create({
          data: {
            userId: targetUserId,
            subscriptionId: subscription.id,
            providerPaymentId: `PROMO_${Date.now()}`,
            providerInvoiceId: `PROMO_INV_${Date.now()}`,
            providerSubscriptionId: "PROMO",
            amount: 0,
            currency: "INR",
            status: TransactionStatus.SUCCESS,
            type: TransactionType.CHARGE,
            paidAt: now,
          },
        });
      }
    });

    return {
      message: `Successfully set user plan to ${plan}`,
      plan,
      planExpiresAt: expiresAt,
    };
  }

  /**
   * Processes verified webhooks to keep database states synchronized.
   */
  async handleWebhook(rawBody: string, headers: Record<string, string>) {
    let event: any;
    try {
      event = providerClient.webhooks.unwrap(rawBody, { headers });
    } catch (err: any) {
      throw AppError.badRequest(`Webhook signature verification failed: ${err.message}`);
    }

    switch (event.type) {
      // =========================================================================
      // ACCOUNTING WEBHOOKS (Never update User plan access)
      // =========================================================================
      case "payment.succeeded": {
        const payment = event.data;
        const user = await this.findUserByPayload(payment);
        if (!user) {
          console.warn(`[Webhook] User not found for payment: ${payment.payment_id}`);
          break;
        }

        if (!user.providerCustomerId && payment.customer.customer_id) {
          await prisma.user.update({
            where: { id: user.id },
            data: { providerCustomerId: payment.customer.customer_id },
          });
        }

        const subscription = await this.getOrCreateSubscriptionStub(user.id);

        await this.recordTransaction({
          userId: user.id,
          subscriptionId: subscription.id,
          providerPaymentId: payment.payment_id,
          providerInvoiceId: payment.invoice_id || null,
          providerSubscriptionId: payment.subscription_id || null,
          amount: this.convertAmount(payment.total_amount),
          currency: payment.currency,
          status: TransactionStatus.SUCCESS,
          type: TransactionType.CHARGE,
          paidAt: payment.created_at ? new Date(payment.created_at) : new Date(),
        });
        break;
      }

      case "payment.failed":
      case "payment.cancelled": {
        const payment = event.data;
        const user = await this.findUserByPayload(payment);
        if (!user) {
          console.warn(`[Webhook] User not found for failed/cancelled payment: ${payment.payment_id}`);
          break;
        }

        const subscription = await this.getOrCreateSubscriptionStub(user.id);

        await this.recordTransaction({
          userId: user.id,
          subscriptionId: subscription.id,
          providerPaymentId: payment.payment_id,
          providerInvoiceId: payment.invoice_id || null,
          providerSubscriptionId: payment.subscription_id || null,
          amount: this.convertAmount(payment.total_amount),
          currency: payment.currency,
          status: TransactionStatus.FAILED,
          type: TransactionType.CHARGE,
          paidAt: null,
        });
        break;
      }

      case "refund.succeeded": {
        const refund = event.data;
        let user = await this.findUserByPayload(refund);

        if (!user) {
          const originalTx = await prisma.transaction.findFirst({
            where: { providerPaymentId: refund.payment_id },
            include: { user: true },
          });
          if (originalTx) {
            user = originalTx.user;
          }
        }

        if (!user) {
          console.warn(`[Webhook] User not found for refund: ${refund.refund_id}`);
          break;
        }

        const subscription = await this.getOrCreateSubscriptionStub(user.id);

        await this.recordTransaction({
          userId: user.id,
          subscriptionId: subscription.id,
          providerPaymentId: refund.payment_id,
          providerInvoiceId: refund.refund_id,
          providerSubscriptionId: null,
          amount: this.convertAmount(refund.amount),
          currency: refund.currency,
          status: TransactionStatus.SUCCESS,
          type: TransactionType.REFUND,
          paidAt: refund.created_at ? new Date(refund.created_at) : new Date(),
        });
        break;
      }

      case "payment.processing":
        // Quietly acknowledge
        break;

      // =========================================================================
      // ENTITLEMENT WEBHOOKS (Never write Transaction entries)
      // =========================================================================
      case "subscription.active":
      case "subscription.renewed":
      case "subscription.updated":
      case "subscription.plan_changed": {
        const subData = event.data;
        const user = await this.findUserByPayload(subData);
        if (!user) {
          console.warn(`[Webhook] User not found for subscription update: ${subData.subscription_id}`);
          break;
        }

        const targetUser = user;

        await prisma.$transaction(async (tx) => {
          if (!targetUser.providerCustomerId && subData.customer.customer_id) {
            await tx.user.update({
              where: { id: targetUser.id },
              data: { providerCustomerId: subData.customer.customer_id },
            });
          }

          const productId = subData.product_id;
          const billingCycle = this.mapProductIdToCycle(productId);
          const nextBilling = subData.next_billing_date ? new Date(subData.next_billing_date) : null;
          const prevBilling = subData.previous_billing_date ? new Date(subData.previous_billing_date) : new Date();
          const status = this.mapProviderStatus(subData.status);

          await tx.subscription.upsert({
            where: { userId: targetUser.id },
            update: {
              plan: SubscriptionPlan.PRO,
              billingCycle,
              status,
              currentPeriodStart: prevBilling,
              currentPeriodEnd: nextBilling,
              providerSubscriptionId: subData.subscription_id,
              providerProductId: productId,
              cancelAtPeriodEnd: subData.cancel_at_next_billing_date || false,
              cancelledAt: subData.cancelled_at ? new Date(subData.cancelled_at) : null,
            },
            create: {
              userId: targetUser.id,
              plan: SubscriptionPlan.PRO,
              billingCycle,
              status,
              currentPeriodStart: prevBilling,
              currentPeriodEnd: nextBilling,
              providerSubscriptionId: subData.subscription_id,
              providerProductId: productId,
              cancelAtPeriodEnd: subData.cancel_at_next_billing_date || false,
              cancelledAt: subData.cancelled_at ? new Date(subData.cancelled_at) : null,
            },
          });

          const isUserPro = status === SubscriptionStatus.ACTIVE || status === SubscriptionStatus.CANCELLED;

          await tx.user.update({
            where: { id: targetUser.id },
            data: {
              plan: isUserPro ? UserPlan.PRO : UserPlan.FREE,
              planExpiresAt: isUserPro ? nextBilling : null,
            },
          });
        });
        break;
      }

      case "subscription.cancelled":
      case "subscription.expired":
      case "subscription.failed": {
        const subData = event.data;
        const user = await this.findUserByPayload(subData);
        if (!user) {
          console.warn(`[Webhook] User not found for subscription transition: ${subData.subscription_id}`);
          break;
        }

        const targetUser = user;

        let status: SubscriptionStatus = SubscriptionStatus.EXPIRED;
        if (event.type === "subscription.cancelled") status = SubscriptionStatus.CANCELLED;

        const productId = subData.product_id;
        const billingCycle = this.mapProductIdToCycle(productId);
        const nextBilling = subData.next_billing_date ? new Date(subData.next_billing_date) : null;
        const prevBilling = subData.previous_billing_date ? new Date(subData.previous_billing_date) : new Date();

        await prisma.$transaction(async (tx) => {
          await tx.subscription.upsert({
            where: { userId: targetUser.id },
            update: {
              status,
              cancelledAt: subData.cancelled_at ? new Date(subData.cancelled_at) : new Date(),
              cancelAtPeriodEnd: subData.cancel_at_next_billing_date || false,
            },
            create: {
              userId: targetUser.id,
              plan: SubscriptionPlan.PRO,
              billingCycle,
              status,
              currentPeriodStart: prevBilling,
              currentPeriodEnd: nextBilling,
              providerSubscriptionId: subData.subscription_id,
              providerProductId: productId,
              cancelAtPeriodEnd: subData.cancel_at_next_billing_date || false,
              cancelledAt: subData.cancelled_at ? new Date(subData.cancelled_at) : new Date(),
            },
          });

          const isUserPro = status === SubscriptionStatus.CANCELLED && nextBilling && nextBilling > new Date();

          await tx.user.update({
            where: { id: targetUser.id },
            data: {
              plan: isUserPro ? UserPlan.PRO : UserPlan.FREE,
              planExpiresAt: isUserPro ? nextBilling : null,
            },
          });
        });
        break;
      }

      default:
        console.log(`[Webhook] Unhandled webhook event: ${event.type}`);
        break;
    }
  }

  async getCurrentPlan(userId: string) {
    const subscription = await prisma.subscription.findUnique({
      where: { userId },
    });
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { plan: true, planExpiresAt: true },
    });

    if (
      !subscription ||
      subscription.plan === SubscriptionPlan.FREE ||
      subscription.status === SubscriptionStatus.EXPIRED
    ) {
      return {
        plan: "FREE",
        billingCycle: null,
        planExpiresAt: null,
        cancelAtPeriodEnd: false,
        isPromo: false,
      };
    }

    return {
      plan: subscription.plan,
      billingCycle: subscription.billingCycle,
      planExpiresAt: subscription.currentPeriodEnd || user?.planExpiresAt || null,
      status: subscription.status,
      cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
      isPromo: subscription.providerSubscriptionId === "PROMO",
    };
  }
}

export const billingService = new BillingService();
