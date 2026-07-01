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
   * Creates a checkout session for upgrading to PRO.
   */
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
      return_url: `${env.CLIENT_URL}/dashboard/billing/success`,
      cancel_url: `${env.CLIENT_URL}/dashboard/billing`,
    };

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
      return { message: "Subscription scheduled for cancellation at the next billing date" };
    } catch (err: any) {
      throw AppError.internal(`Failed to cancel subscription: ${err.message}`);
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
      await tx.subscription.upsert({
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
      case "payment.succeeded": {
        const payment = event.data;
        const customerId = payment.customer.customer_id;
        const email = payment.customer.email;
        const userId = payment.metadata?.userId || null;

        const user = await prisma.user.findFirst({
          where: {
            OR: [
              { providerCustomerId: customerId },
              { email },
              ...(userId ? [{ id: userId }] : []),
            ],
          },
        });

        if (!user) {
          console.warn(`[Webhook] User not found for payment: ${payment.payment_id}`);
          break;
        }

        const targetUser = user;

        await prisma.$transaction(async (tx) => {
          if (!targetUser.providerCustomerId) {
            await tx.user.update({
              where: { id: targetUser.id },
              data: { providerCustomerId: customerId },
            });
          }

          if (payment.subscription_id) {
            const productId = payment.product_cart?.[0]?.product_id || "";
            const billingCycle = PRODUCT_ID_TO_BILLING_CYCLE[productId] || BillingCycle.MONTHLY;

            const currentPeriodStart = new Date();
            const currentPeriodEnd = new Date();
            if (billingCycle === BillingCycle.MONTHLY) {
              currentPeriodEnd.setMonth(currentPeriodEnd.getMonth() + 1);
            } else if (billingCycle === BillingCycle.QUARTERLY) {
              currentPeriodEnd.setMonth(currentPeriodEnd.getMonth() + 3);
            } else if (billingCycle === BillingCycle.YEARLY) {
              currentPeriodEnd.setFullYear(currentPeriodEnd.getFullYear() + 1);
            }

            const subscription = await tx.subscription.upsert({
              where: { userId: targetUser.id },
              update: {
                plan: SubscriptionPlan.PRO,
                billingCycle,
                status: SubscriptionStatus.ACTIVE,
                currentPeriodStart,
                currentPeriodEnd,
                providerSubscriptionId: payment.subscription_id,
                providerProductId: productId,
                cancelAtPeriodEnd: false,
                cancelledAt: null,
              },
              create: {
                userId: targetUser.id,
                plan: SubscriptionPlan.PRO,
                billingCycle,
                status: SubscriptionStatus.ACTIVE,
                currentPeriodStart,
                currentPeriodEnd,
                providerSubscriptionId: payment.subscription_id,
                providerProductId: productId,
              },
            });

            await tx.user.update({
              where: { id: targetUser.id },
              data: {
                plan: UserPlan.PRO,
                planExpiresAt: currentPeriodEnd,
              },
            });

            await tx.transaction.create({
              data: {
                userId: targetUser.id,
                subscriptionId: subscription.id,
                providerPaymentId: payment.payment_id,
                providerInvoiceId: payment.invoice_id || null,
                providerSubscriptionId: payment.subscription_id,
                amount: payment.total_amount / 100,
                currency: payment.currency,
                status: TransactionStatus.SUCCESS,
                type: TransactionType.CHARGE,
                paidAt: payment.created_at ? new Date(payment.created_at) : new Date(),
              },
            });
          } else {
            const freeSub = await tx.subscription.upsert({
              where: { userId: targetUser.id },
              update: {},
              create: {
                userId: targetUser.id,
                plan: SubscriptionPlan.FREE,
                billingCycle: BillingCycle.MONTHLY,
                status: SubscriptionStatus.EXPIRED,
              },
            });

            await tx.transaction.create({
              data: {
                userId: targetUser.id,
                subscriptionId: freeSub.id,
                providerPaymentId: payment.payment_id,
                providerInvoiceId: payment.invoice_id || null,
                amount: payment.total_amount / 100,
                currency: payment.currency,
                status: TransactionStatus.SUCCESS,
                type: TransactionType.CHARGE,
                paidAt: payment.created_at ? new Date(payment.created_at) : new Date(),
              },
            });
          }
        });
        break;
      }

      case "subscription.active":
      case "subscription.renewed":
      case "subscription.updated": {
        const subData = event.data;
        const customerId = subData.customer.customer_id;
        const email = subData.customer.email;
        const userId = subData.metadata?.userId || null;

        const user = await prisma.user.findFirst({
          where: {
            OR: [
              { providerCustomerId: customerId },
              { email },
              ...(userId ? [{ id: userId }] : []),
            ],
          },
        });

        if (!user) {
          console.warn(`[Webhook] User not found for subscription: ${subData.subscription_id}`);
          break;
        }

        const targetUser = user;

        await prisma.$transaction(async (tx) => {
          if (!targetUser.providerCustomerId) {
            await tx.user.update({
              where: { id: targetUser.id },
              data: { providerCustomerId: customerId },
            });
          }

          const productId = subData.product_id;
          const billingCycle = PRODUCT_ID_TO_BILLING_CYCLE[productId] || BillingCycle.MONTHLY;
          const nextBilling = subData.next_billing_date ? new Date(subData.next_billing_date) : null;
          const prevBilling = subData.previous_billing_date ? new Date(subData.previous_billing_date) : new Date();

          let status: SubscriptionStatus = SubscriptionStatus.ACTIVE;
          if (subData.status === "cancelled") status = SubscriptionStatus.CANCELLED;
          if (subData.status === "expired") status = SubscriptionStatus.EXPIRED;
          if (subData.status === "on_hold") status = SubscriptionStatus.PAST_DUE;
          if (subData.status === "failed") status = SubscriptionStatus.EXPIRED;

          const subscription = await tx.subscription.upsert({
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
        const customerId = subData.customer.customer_id;
        const email = subData.customer.email;
        const userId = subData.metadata?.userId || null;

        const user = await prisma.user.findFirst({
          where: {
            OR: [
              { providerCustomerId: customerId },
              { email },
              ...(userId ? [{ id: userId }] : []),
            ],
          },
        });

        if (!user) {
          console.warn(`[Webhook] User not found for subscription transition: ${subData.subscription_id}`);
          break;
        }

        const targetUser = user;

        let status: SubscriptionStatus = SubscriptionStatus.EXPIRED;
        if (event.type === "subscription.cancelled") status = SubscriptionStatus.CANCELLED;
        if (event.type === "subscription.expired") status = SubscriptionStatus.EXPIRED;
        if (event.type === "subscription.failed") status = SubscriptionStatus.EXPIRED;

        await prisma.$transaction(async (tx) => {
          await tx.subscription.update({
            where: { userId: targetUser.id },
            data: {
              status,
              cancelledAt: subData.cancelled_at ? new Date(subData.cancelled_at) : new Date(),
              cancelAtPeriodEnd: subData.cancel_at_next_billing_date || false,
            },
          });

          const nextBilling = subData.next_billing_date ? new Date(subData.next_billing_date) : null;
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

      case "refund.succeeded": {
        const refund = event.data;
        const customerId = refund.customer?.customer_id;
        const email = refund.customer?.email;

        let user;
        if (customerId || email) {
          user = await prisma.user.findFirst({
            where: {
              OR: [
                ...(customerId ? [{ providerCustomerId: customerId }] : []),
                ...(email ? [{ email }] : []),
              ],
            },
          });
        }

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

        const userSub = await prisma.subscription.findFirst({
          where: { userId: user.id },
        });

        if (userSub) {
          await prisma.transaction.create({
            data: {
              userId: user.id,
              subscriptionId: userSub.id,
              providerPaymentId: refund.payment_id,
              providerInvoiceId: refund.refund_id,
              amount: refund.amount / 100,
              currency: refund.currency,
              status: TransactionStatus.SUCCESS,
              type: TransactionType.REFUND,
              paidAt: refund.created_at ? new Date(refund.created_at) : new Date(),
            },
          });
        }
        break;
      }

      default:
        console.log(`[Webhook] Unhandled webhook event: ${event.type}`);
        break;
    }
  }
}

export const billingService = new BillingService();
