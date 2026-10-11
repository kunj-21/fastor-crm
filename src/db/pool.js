import pg from "pg";

export function createPool(connectionString) {
  const pool = new pg.Pool({ connectionString, max: 10 });
  pool.on("error", (err) => console.error("Unexpected Postgres pool error", err));
  return pool;
}
