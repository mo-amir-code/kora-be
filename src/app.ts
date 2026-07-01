import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { errorHandler, notFoundHandler, requestLogger } from "./shared/index.js";
import { healthRoutes, authRoutes, brandRoutes, uploadRoutes, dealRoutes, reminderRoutes, userRoutes, invoiceRoutes, calendarRoutes, messageTemplateRoutes, paymentRoutes, earningsRoutes, dashboardRoutes, supportRoutes, billingRoutes } from "./modules/index.js";
import { env } from "./config/index.js";

const app = express();

// Global middleware
app.use(requestLogger);
app.use(helmet());
app.use(cors({
  origin: env.CLIENT_URL,
  credentials: true,
}));
app.use(cookieParser());
app.use(express.json({
  verify: (req: any, _res, buf) => {
    req.rawBody = buf;
  }
}));
app.use(express.urlencoded({ extended: true }));

// Module routes
app.use("/api/health", healthRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/brands", brandRoutes);
app.use("/api/upload", uploadRoutes);
app.use("/api/deals", dealRoutes);
app.use("/api/reminder", reminderRoutes);
app.use("/api/user", userRoutes);
app.use("/api/invoice", invoiceRoutes);
app.use("/api/calendar", calendarRoutes);
app.use("/api/message-templates", messageTemplateRoutes);
app.use("/api/payment", paymentRoutes);
app.use("/api/earnings", earningsRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/support", supportRoutes);
app.use("/api/billing", billingRoutes);

// Error handling
app.use(notFoundHandler);
app.use(errorHandler);

export { app };
