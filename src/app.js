import express from "express";
import helmet from "helmet";
import cors from "cors";
import rateLimit from "express-rate-limit";
import { requireAuth } from "./middleware/auth.js";
import { authRouter } from "./routes/auth.js";
import { leadsRouter, publicEnquiryRouter } from "./routes/enquiries.js";
import { HttpError } from "./utils/errors.js";

/**
 * Builds the Express app. Dependencies are injected so tests can pass their own DB.
 * @param {{ db: import('pg').Pool, jwtSecret: string, jwtExpiresIn?: string, corsOrigin?: string, rateLimits?: boolean }} deps
 */
export function createApp({ db, jwtSecret, jwtExpiresIn = "1d", corsOrigin = "*", rateLimits = true }) {
  const app = express();

  app.disable("x-powered-by");
  app.use(helmet());
  app.use(cors({ origin: corsOrigin }));
  app.use(express.json({ limit: "20kb" }));

  const limiter = (max) =>
    rateLimits
      ? rateLimit({ windowMs: 15 * 60 * 1000, limit: max, standardHeaders: "draft-7", legacyHeaders: false })
      : (_req, _res, next) => next();

  app.get("/health", async (_req, res) => {
    await db.query("SELECT 1");
    res.json({ status: "ok" });
  });

  app.use("/api/auth", limiter(20), authRouter({ db, jwtSecret, jwtExpiresIn }));
  app.use("/api/enquiries/public", publicEnquiryRouter({ db, formLimiter: limiter(30) }));
  app.use("/api/enquiries", requireAuth(jwtSecret), leadsRouter({ db }));

  app.use((_req, _res, next) => next(new HttpError(404, "Route not found")));

  // Central error handler — Express 5 forwards rejected async handlers here.
  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    if (err.type === "entity.parse.failed") {
      return res.status(400).json({ error: "Malformed JSON body" });
    }
    const status = err instanceof HttpError ? err.status : 500;
    if (status === 500) console.error(err);
    res.status(status).json({
      error: status === 500 ? "Internal server error" : err.message,
      ...(err.details ? { details: err.details } : {}),
    });
  });

  return app;
}
