import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { errorHandler, notFoundHandler, requestLogger } from "./shared/index.js";
import { healthRoutes, authRoutes, brandRoutes, uploadRoutes, dealRoutes, reminderRoutes, userRoutes, invoiceRoutes, calendarRoutes } from "./modules/index.js";
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
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Module routes
app.use("/api/health", healthRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/brands", brandRoutes);
app.use("/api/upload", uploadRoutes);
app.use("/api/deals", dealRoutes);
app.use("/api/reminders", reminderRoutes);
app.use("/api/user", userRoutes);
app.use("/api/invoice", invoiceRoutes);
app.use("/api/calendar", calendarRoutes);

// Error handling
app.use(notFoundHandler);
app.use(errorHandler);

export { app };
