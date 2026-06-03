import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../generated/client/client.js";
import { env } from "../../config/index.js";

const prismaClientSingleton = () => {
  const pool = new Pool({
    connectionString: env.DIRECT_URL || env.DATABASE_URL,
    max: 10,                    // max connections in pool (match your Supabase plan limit)
    idleTimeoutMillis: 30_000,  // close idle connections after 30s (Supabase PgBouncer kills at 60s)
    connectionTimeoutMillis: 5_000, // fail fast if can't connect in 5s
  });
  const adapter = new PrismaPg(pool);
  return new PrismaClient({ adapter });
};

declare global {
  var prisma: undefined | ReturnType<typeof prismaClientSingleton>;
}

export const prisma = globalThis.prisma ?? prismaClientSingleton();

if (env.NODE_ENV !== "production") {
  globalThis.prisma = prisma;
}
