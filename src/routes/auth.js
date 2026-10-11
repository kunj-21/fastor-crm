import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { employeesRepo, toEmployee } from "../repositories.js";
import { loginSchema, parse, registerSchema } from "../validation.js";
import { conflict, unauthorized } from "../utils/errors.js";

// Compared against when the email doesn't exist, so response time doesn't reveal it.
const DUMMY_HASH = bcrypt.hashSync("not-a-real-password", 10);

export function authRouter({ db, jwtSecret, jwtExpiresIn }) {
  const router = Router();
  const employees = employeesRepo(db);

  const issueToken = (employee) =>
    jwt.sign({ sub: String(employee.id), email: employee.email }, jwtSecret, {
      algorithm: "HS256",
      expiresIn: jwtExpiresIn,
    });

  // POST /api/auth/register
  router.post("/register", async (req, res) => {
    const { name, email, password } = parse(registerSchema, req.body);
    const passwordHash = await bcrypt.hash(password, 10);
    const row = await employees.create({ name, email, passwordHash });
    if (!row) throw conflict("An account with this email already exists");

    const employee = toEmployee(row);
    res.status(201).json({ token: issueToken(employee), employee });
  });

  // POST /api/auth/login
  router.post("/login", async (req, res) => {
    const { email, password } = parse(loginSchema, req.body);
    const row = await employees.findByEmailWithHash(email);
    const ok = await bcrypt.compare(password, row?.password_hash ?? DUMMY_HASH);
    if (!row || !ok) throw unauthorized("Invalid email or password");

    const employee = toEmployee(row);
    res.json({ token: issueToken(employee), employee });
  });

  return router;
}
