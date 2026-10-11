import { config } from "./config.js";
import { createApp } from "./app.js";
import { createPool } from "./db/pool.js";
import { migrate } from "./db/migrate.js";

const db = createPool(config.databaseUrl);
await migrate(db);

const app = createApp({
  db,
  jwtSecret: config.jwtSecret,
  jwtExpiresIn: config.jwtExpiresIn,
  corsOrigin: config.corsOrigin,
});

const server = app.listen(config.port, () => {
  console.log(`CRM API listening on http://localhost:${config.port}`);
});

const shutdown = () => {
  server.close(() => db.end().then(() => process.exit(0)));
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

