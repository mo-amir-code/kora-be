import { config } from "dotenv";

config();

export const env = {
  NODE_ENV: process.env["NODE_ENV"] ?? "development",
  PORT: parseInt(process.env["PORT"] ?? "4000", 10),
  HOST: process.env["HOST"] ?? "0.0.0.0",
  DATABASE_URL: process.env["DATABASE_URL"] ?? "",
  DIRECT_URL: process.env["DIRECT_URL"] ?? "",

  // JWT
  JWT_SECRET: process.env["JWT_SECRET"] ?? "change-me-in-production",
  JWT_EXPIRES_IN: process.env["JWT_EXPIRES_IN"] ?? "15m",
  REFRESH_TOKEN_SECRET: process.env["REFRESH_TOKEN_SECRET"] ?? "refresh-change-me-in-production",
  REFRESH_TOKEN_EXPIRES_IN_DAYS: parseInt(process.env["REFRESH_TOKEN_EXPIRES_IN_DAYS"] ?? "30", 10),

  // Resend
  RESEND_API_KEY: process.env["RESEND_API_KEY"] ?? "",
  EMAIL_FROM: process.env["EMAIL_FROM"] ?? "noreply@yourdomain.com",
  MAIL_TO: process.env["MAIL_TO"] ?? "",

  // Google OAuth
  GOOGLE_CLIENT_ID: process.env["GOOGLE_CLIENT_ID"] ?? "",
  GOOGLE_CLIENT_SECRET: process.env["GOOGLE_CLIENT_SECRET"] ?? "",
  GOOGLE_REDIRECT_URI: process.env["GOOGLE_REDIRECT_URI"] ?? "http://localhost:4000/api/auth/google/callback",

  // Client
  CLIENT_URL: process.env["CLIENT_URL"] ?? "http://localhost:3000",

  // Currency conversion used by financial dashboards
  USD_TO_INR_RATE: parseFloat(process.env["USD_TO_INR_RATE"] ?? "85"),

  // GCP Cloud Storage
  GCP_BUCKET_NAME: process.env["GCP_BUCKET_NAME"] ?? "",
  GCP_PROJECT_ID: process.env["GCP_PROJECT_ID"] ?? "",
  GCP_CLIENT_EMAIL: process.env["GCP_CLIENT_EMAIL"] ?? "",
  GCP_PRIVATE_KEY: (process.env["GCP_PRIVATE_KEY"] ?? "").replace(/\\n/g, "\n"),

  // Billing & Subscription (Provider)
  PROVIDER_API_KEY: process.env["PROVIDER_API_KEY"] ?? "",
  PROVIDER_WEBHOOK_KEY: process.env["PROVIDER_WEBHOOK_KEY"] ?? "",
  PROVIDER_PRO_MONTHLY_PRODUCT_ID: process.env["PROVIDER_PRO_MONTHLY_PRODUCT_ID"] ?? "prod_monthly_id",
  PROVIDER_PRO_QUARTERLY_PRODUCT_ID: process.env["PROVIDER_PRO_QUARTERLY_PRODUCT_ID"] ?? "prod_quarterly_id",
  PROVIDER_PRO_YEARLY_PRODUCT_ID: process.env["PROVIDER_PRO_YEARLY_PRODUCT_ID"] ?? "prod_yearly_id",
  ADMIN_SECRET_KEY: process.env["ADMIN_SECRET_KEY"] ?? "admin-secret-key-change-me",
} as const;

export type Env = typeof env;
