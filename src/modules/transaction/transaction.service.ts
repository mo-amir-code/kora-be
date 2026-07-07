import { prisma } from "../../shared/index.js";
import { TransactionStatus } from "../../generated/client/enums.js";

export const transactionService = {
  getTransactions: async (userId: string) => {
    const transactions = await prisma.transaction.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      include: {
        subscription: true,
      },
    });

    return transactions.map((tx) => {
      // Map status
      let status: "Succeeded" | "Pending" | "Failed" = "Pending";
      if (tx.status === TransactionStatus.SUCCESS) {
        status = "Succeeded";
      } else if (tx.status === TransactionStatus.FAILED) {
        status = "Failed";
      }

      // Format currency symbol
      const symbol = tx.currency === "USD" ? "$" : "₹";
      const amountStr = `${symbol}${Number(tx.amount).toFixed(2)}`;

      return {
        id: tx.id,
        amount: amountStr,
        status,
        date: (tx.paidAt || tx.createdAt).toISOString(),
      };
    });
  },
};
