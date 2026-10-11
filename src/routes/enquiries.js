import { Router } from "express";
import { enquiriesRepo, toEnquiry } from "../repositories.js";
import { enquirySchema, idParamSchema, paginationSchema, parse } from "../validation.js";
import { conflict, notFound } from "../utils/errors.js";

const page = (rows, total, { limit, offset }) => ({
  data: rows.map(toEnquiry),
  pagination: { total, limit, offset },
});

/** Public enquiry form — NO authentication. */
export function publicEnquiryRouter({ db, formLimiter }) {
  const router = Router();
  const enquiries = enquiriesRepo(db);

  // POST /api/enquiries/public
  router.post("/", formLimiter, async (req, res) => {
    const input = parse(enquirySchema, req.body);
    const row = await enquiries.create(input);
    res.status(201).json({ message: "Enquiry submitted successfully", enquiry: toEnquiry(row) });
  });

  return router;
}

/** Counselor-only lead routes — mounted behind requireAuth. */
export function leadsRouter({ db }) {
  const router = Router();
  const enquiries = enquiriesRepo(db);

  // GET /api/enquiries/unclaimed — public enquiries visible to every counselor
  router.get("/unclaimed", async (req, res) => {
    const p = parse(paginationSchema, req.query);
    const { rows, total } = await enquiries.listUnclaimed(p);
    res.json(page(rows, total, p));
  });

  // GET /api/enquiries/mine — leads claimed by the logged-in counselor
  router.get("/mine", async (req, res) => {
    const p = parse(paginationSchema, req.query);
    const { rows, total } = await enquiries.listByCounselor(req.employee.id, p);
    res.json(page(rows, total, p));
  });

  // PATCH /api/enquiries/:id/claim — make a public enquiry private to me
  router.patch("/:id/claim", async (req, res) => {
    const { id } = parse(idParamSchema, req.params);
    const result = await enquiries.claim(id, req.employee.id);

    switch (result.status) {
      case "claimed":
        return res.json({ message: "Lead claimed", enquiry: toEnquiry(result.enquiry) });
      case "already_yours":
        throw conflict("You have already claimed this lead");
      case "taken":
        throw conflict("This lead has already been claimed by another counselor");
      default:
        throw notFound("Enquiry not found");
    }
  });

  return router;
}
