import { apiController, AppError } from "../../shared/index.js";
import { transactionService } from "./transaction.service.js";

export const getTransactions = apiController(async (req) => {
  if (!req.userId) {
    throw AppError.unauthorized("Not authenticated");
  }
  const transactions = await transactionService.getTransactions(req.userId);
  return { data: transactions, message: "Transactions retrieved successfully" };
});
