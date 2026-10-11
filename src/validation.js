import { z } from "zod";
import { badRequest } from "./utils/errors.js";

const email = z.string().trim().toLowerCase().email("Enter a valid email").max(254);

export const registerSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters").max(100),
  email,
  password: z.string().min(8, "Password must be at least 8 characters").max(72),
});

export const loginSchema = z.object({
  email,
  password: z.string().min(1, "Password is required"),
});

export const enquirySchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters").max(100),
  email,
  phone: z
    .string()
    .trim()
    .regex(/^\+?[0-9\s-]{7,20}$/, "Enter a valid phone number")
    .optional(),
  courseInterest: z.string().trim().min(2, "Course interest is required").max(150),
  message: z.string().trim().max(2000).optional(),
});

export const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export const idParamSchema = z.object({
  id: z.coerce.number().int().positive("Enquiry id must be a positive integer"),
});

/** Parse or throw a 400 with field-level messages. */
export function parse(schema, input) {
  const result = schema.safeParse(input ?? {});
  if (!result.success) {
    const details = result.error.issues.map((i) => ({ field: i.path.join("."), message: i.message }));
    throw badRequest("Validation failed", details);
  }
  return result.data;
}
