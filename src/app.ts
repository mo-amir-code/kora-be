import express from "express";
import cors from "cors";
import helmet from "helmet";
import { errorHandler, notFoundHandler, requestLogger } from "./shared/index.js";
import { healthRoutes } from "./modules/index.js";

const app = express();

// Global middleware
app.use(requestLogger);
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Module routes
app.use("/api/health", healthRoutes);

// Error handling
app.use(notFoundHandler);
app.use(errorHandler);

export { app };
