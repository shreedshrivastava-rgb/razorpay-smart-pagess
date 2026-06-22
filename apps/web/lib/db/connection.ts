import postgres from "postgres";
import { logger } from "@/lib/logger";

let sql: postgres.Sql | null = null;

export function getDb(): postgres.Sql | null {
  const url = process.env.DATABASE_URL;
  if (!url) return null;

  if (!sql) {
    sql = postgres(url, {
      max: parseInt(process.env.DATABASE_POOL_MAX ?? "20", 10),
      idle_timeout: 30,
      connect_timeout: 15,
      transform: { column: undefined, value: undefined },
      onclose: () => {
        logger.warn("Database connection closed");
        sql = null;
      },
    });
  }
  return sql;
}

export async function healthCheck(): Promise<boolean> {
  const db = getDb();
  if (!db) return false;
  try {
    await db`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

export async function closeDb(): Promise<void> {
  if (sql) {
    await sql.end();
    sql = null;
  }
}

export type Db = postgres.Sql;
