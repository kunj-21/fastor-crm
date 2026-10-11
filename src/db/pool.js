import pg from "pg";

export function createPool(connectionString) {
  const isLocal = connectionString.includes("localhost") || connectionString.includes("127.0.0.1");
  const ssl =
    process.env.DATABASE_SSL === "true"
      ? { rejectUnauthorized: false }
      : process.env.DATABASE_SSL === "false"
        ? false
        : !isLocal
          ? { rejectUnauthorized: false }
          : false;

  const pool = new pg.Pool({
    connectionString,
    max: 10,
    ...(ssl ? { ssl } : {}),
  });
  pool.on("error", (err) => console.error("Unexpected Postgres pool error", err));
  return pool;
}
