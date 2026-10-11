// All SQL lives here. Every query is parameterised.

const employeeFields = "id, name, email, created_at";
const enquiryFields =
  "id, name, email, phone, course_interest, message, counselor_id, claimed_at, created_at";

export const toEmployee = (r) => ({ id: r.id, name: r.name, email: r.email, createdAt: r.created_at });

export const toEnquiry = (r) => ({
  id: r.id,
  name: r.name,
  email: r.email,
  phone: r.phone,
  courseInterest: r.course_interest,
  message: r.message,
  status: r.counselor_id ? "claimed" : "unclaimed",
  counselorId: r.counselor_id,
  claimedAt: r.claimed_at,
  createdAt: r.created_at,
});

export function employeesRepo(db) {
  return {
    async create({ name, email, passwordHash }) {
      const { rows } = await db.query(
        `INSERT INTO employees (name, email, password_hash) VALUES ($1, $2, $3)
         ON CONFLICT (email) DO NOTHING
         RETURNING ${employeeFields}`,
        [name, email, passwordHash],
      );
      return rows[0] ?? null; // null → email already registered
    },

    async findByEmailWithHash(email) {
      const { rows } = await db.query(
        `SELECT ${employeeFields}, password_hash FROM employees WHERE email = $1`,
        [email],
      );
      return rows[0] ?? null;
    },
  };
}

export function enquiriesRepo(db) {
  return {
    async create({ name, email, phone, courseInterest, message }) {
      const { rows } = await db.query(
        `INSERT INTO enquiries (name, email, phone, course_interest, message)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING ${enquiryFields}`,
        [name, email, phone ?? null, courseInterest, message ?? null],
      );
      return rows[0];
    },

    async listUnclaimed({ limit, offset }) {
      const { rows } = await db.query(
        `SELECT ${enquiryFields}, COUNT(*) OVER() AS total
         FROM enquiries WHERE counselor_id IS NULL
         ORDER BY created_at DESC, id DESC
         LIMIT $1 OFFSET $2`,
        [limit, offset],
      );
      return { rows, total: rows.length ? Number(rows[0].total) : await countUnclaimed(db) };
    },

    async listByCounselor(counselorId, { limit, offset }) {
      const { rows } = await db.query(
        `SELECT ${enquiryFields}, COUNT(*) OVER() AS total
         FROM enquiries WHERE counselor_id = $1
         ORDER BY claimed_at DESC, id DESC
         LIMIT $2 OFFSET $3`,
        [counselorId, limit, offset],
      );
      return { rows, total: rows.length ? Number(rows[0].total) : await countByCounselor(db, counselorId) };
    },

    /**
     * Atomic claim: the WHERE counselor_id IS NULL guard means that when two
     * counselors claim the same lead at once, exactly one UPDATE matches.
     */
    async claim(id, counselorId) {
      const { rows } = await db.query(
        `UPDATE enquiries SET counselor_id = $2, claimed_at = NOW()
         WHERE id = $1 AND counselor_id IS NULL
         RETURNING ${enquiryFields}`,
        [id, counselorId],
      );
      if (rows[0]) return { status: "claimed", enquiry: rows[0] };

      const existing = await db.query(`SELECT counselor_id FROM enquiries WHERE id = $1`, [id]);
      if (!existing.rows[0]) return { status: "not_found" };
      return existing.rows[0].counselor_id === counselorId
        ? { status: "already_yours" }
        : { status: "taken" };
    },
  };
}

async function countUnclaimed(db) {
  const { rows } = await db.query(`SELECT COUNT(*)::int AS n FROM enquiries WHERE counselor_id IS NULL`);
  return rows[0].n;
}

async function countByCounselor(db, counselorId) {
  const { rows } = await db.query(`SELECT COUNT(*)::int AS n FROM enquiries WHERE counselor_id = $1`, [counselorId]);
  return rows[0].n;
}
