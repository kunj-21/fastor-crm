import jwt from "jsonwebtoken";
import { unauthorized } from "../utils/errors.js";

/** Requires `Authorization: Bearer <jwt>`; sets req.employee = { id, email }. */
export function requireAuth(jwtSecret) {
  return (req, _res, next) => {
    const [scheme, token] = (req.headers.authorization ?? "").split(" ");
    if (scheme !== "Bearer" || !token) return next(unauthorized());

    try {
      const payload = jwt.verify(token, jwtSecret, { algorithms: ["HS256"] });
      req.employee = { id: Number(payload.sub), email: payload.email };
      next();
    } catch {
      next(unauthorized("Invalid or expired token"));
    }
  };
}
