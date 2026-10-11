import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createPool } from "./pool.js";

const schemaPath = fileURLToPath(new URL("./schema.sql", import.meta.url));

export async function migrate(pool) {
  const sql = await readFile(schemaPath, "utf8");
  await pool.query(sql);
}

// `npm run migrate`
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const pool = createPool(process.env.DATABASE_URL);
  try {
    await migrate(pool);
    console.log("✓ Database schema is up to date");
  } finally {
    await pool.end();
  }
}
