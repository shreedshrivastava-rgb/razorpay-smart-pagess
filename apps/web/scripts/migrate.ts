import postgres from "postgres";
import { readFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function migrate() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL not set. Skipping migration.");
    process.exit(0);
  }

  const sql = postgres(url, { max: 1 });

  try {
    // Track applied migrations
    await sql`
      CREATE TABLE IF NOT EXISTS _migrations (
        name TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `;

    const migrationsDir = path.join(__dirname, "..", "migrations");
    const { readdir } = await import("fs/promises");
    const files = (await readdir(migrationsDir)).filter((f) => f.endsWith(".sql")).sort();

    const applied = new Set(
      (await sql<{ name: string }[]>`SELECT name FROM _migrations`).map((r) => r.name)
    );

    for (const file of files) {
      if (applied.has(file)) {
        console.log(`Skipping ${file} (already applied)`);
        continue;
      }

      console.log(`Applying ${file}...`);
      const content = await readFile(path.join(migrationsDir, file), "utf-8");

      await sql.begin((tx) => {
        // Split by semicolons for multi-statement migrations
        const statements = content
          .split(";")
          .map((s) => s.trim())
          .filter((s) => s.length > 0 && !s.startsWith("--"));

        for (const stmt of statements) {
          tx.unsafe(stmt);
        }

        tx`INSERT INTO _migrations (name) VALUES (${file})`;
      });

      console.log(`Applied ${file}`);
    }

    console.log("All migrations up to date.");
  } catch (err) {
    console.error("Migration failed:", err);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

migrate();
