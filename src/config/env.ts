import { config } from "dotenv";

config();

export const env = {
  NODE_ENV: process.env["NODE_ENV"] ?? "development",
  PORT: parseInt(process.env["PORT"] ?? "4000", 10),
  HOST: process.env["HOST"] ?? "0.0.0.0",
  DATABASE_URL: process.env["DATABASE_URL"] ?? "",
  DIRECT_URL: process.env["DIRECT_URL"] ?? "",
} as const;

export type Env = typeof env;
