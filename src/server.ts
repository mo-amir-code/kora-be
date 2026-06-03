import { app } from "./app.js";
import { env } from "./config/index.js";
import { prisma } from "./shared/index.js";

const MAX_RETRIES = 5;
const RETRY_DELAY_MS = 3000;

async function connectDatabase(attempt = 1): Promise<void> {
  try {
    await prisma.$queryRawUnsafe("SELECT 1");
    console.log("[db] connected to PostgreSQL");
  } catch (err) {
    console.error(`[db] connection attempt ${attempt}/${MAX_RETRIES} failed:`, err instanceof Error ? err.message : err);

    if (attempt >= MAX_RETRIES) {
      console.error("[db] all connection attempts exhausted, shutting down");
      process.exit(1);
    }

    console.log(`[db] retrying in ${RETRY_DELAY_MS / 1000}s...`);
    await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
    return connectDatabase(attempt + 1);
  }
}

async function startServer(): Promise<void> {
  await connectDatabase();

  const server = app.listen(env.PORT, env.HOST, () => {
    console.log(`[server] running on http://${env.HOST}:${env.PORT}`);
    console.log(`[server] environment: ${env.NODE_ENV}`);
  });

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    console.log(`\n[server] ${signal} received, shutting down...`);
    server.close();
    await prisma.$disconnect();
    console.log("[server] shutdown complete");
    process.exit(0);
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

startServer().catch((err) => {
  console.error("[server] failed to start:", err);
  process.exit(1);
});
