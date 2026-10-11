// Integration tests against a real PostgreSQL database.
// Uses TEST_DATABASE_URL (falls back to DATABASE_URL). Tables are truncated between tests.
import { after, before, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { createApp } from "../src/app.js";
import { createPool } from "../src/db/pool.js";
import { migrate } from "../src/db/migrate.js";

const db = createPool(process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL);
const app = createApp({ db, jwtSecret: "test-secret", rateLimits: false });
const api = request(app);

const enquiry = (n = 1) => ({
  name: `Student ${n}`,
  email: `student${n}@example.com`,
  phone: "+91 98765 43210",
  courseInterest: "Full Stack Development",
  message: "Please call me in the evening",
});

async function signUp(name = "Asha", email = "asha@fastor.in") {
  const res = await api.post("/api/auth/register").send({ name, email, password: "secret123" });
  assert.equal(res.status, 201);
  return res.body.token;
}

async function submitEnquiry(n) {
  const res = await api.post("/api/enquiries/public").send(enquiry(n));
  assert.equal(res.status, 201);
  return res.body.enquiry.id;
}

before(async () => migrate(db));
beforeEach(async () => db.query("TRUNCATE enquiries, employees RESTART IDENTITY CASCADE"));
after(async () => db.end());

describe("Employee register / login", () => {
  test("registers and returns a JWT without the password hash", async () => {
    const res = await api.post("/api/auth/register").send({ name: "Asha", email: "ASHA@Fastor.in", password: "secret123" });
    assert.equal(res.status, 201);
    assert.ok(res.body.token);
    assert.equal(res.body.employee.email, "asha@fastor.in");
    assert.equal(res.body.employee.password_hash, undefined);
  });

  test("rejects a duplicate email with 409", async () => {
    await signUp();
    const res = await api.post("/api/auth/register").send({ name: "Asha 2", email: "asha@fastor.in", password: "secret123" });
    assert.equal(res.status, 409);
  });

  test("validates input with field-level errors", async () => {
    const res = await api.post("/api/auth/register").send({ name: "A", email: "nope", password: "123" });
    assert.equal(res.status, 400);
    assert.deepEqual(res.body.details.map((d) => d.field).sort(), ["email", "name", "password"]);
  });

  test("logs in with correct credentials, rejects wrong ones with 401", async () => {
    await signUp();
    const ok = await api.post("/api/auth/login").send({ email: "asha@fastor.in", password: "secret123" });
    assert.equal(ok.status, 200);
    assert.ok(ok.body.token);

    const wrongPass = await api.post("/api/auth/login").send({ email: "asha@fastor.in", password: "wrongpass" });
    const noUser = await api.post("/api/auth/login").send({ email: "ghost@fastor.in", password: "secret123" });
    assert.equal(wrongPass.status, 401);
    assert.equal(noUser.status, 401);
    assert.equal(wrongPass.body.error, noUser.body.error); // no user enumeration
  });
});

describe("Public enquiry form", () => {
  test("accepts a submission without authentication", async () => {
    const res = await api.post("/api/enquiries/public").send(enquiry());
    assert.equal(res.status, 201);
    assert.equal(res.body.enquiry.status, "unclaimed");
    assert.equal(res.body.enquiry.courseInterest, "Full Stack Development");
  });

  test("rejects invalid submissions", async () => {
    const res = await api.post("/api/enquiries/public").send({ name: "X", email: "bad" });
    assert.equal(res.status, 400);
  });

  test("rejects malformed JSON with 400", async () => {
    const res = await api.post("/api/enquiries/public").set("Content-Type", "application/json").send("{bad json");
    assert.equal(res.status, 400);
  });
});

describe("Protected lead routes", () => {
  test("require a valid JWT", async () => {
    assert.equal((await api.get("/api/enquiries/unclaimed")).status, 401);
    assert.equal((await api.get("/api/enquiries/mine").set("Authorization", "Bearer forged.token.here")).status, 401);
    assert.equal((await api.patch("/api/enquiries/1/claim")).status, 401);
  });

  test("unclaimed list shows public enquiries to every counselor, newest first, paginated", async () => {
    const token = await signUp();
    for (const n of [1, 2, 3]) await submitEnquiry(n);

    const res = await api.get("/api/enquiries/unclaimed?limit=2").set("Authorization", `Bearer ${token}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.data.length, 2);
    assert.equal(res.body.pagination.total, 3);
    assert.equal(res.body.data[0].name, "Student 3");
  });

  test("claiming makes a lead private to that counselor", async () => {
    const asha = await signUp("Asha", "asha@fastor.in");
    const ravi = await signUp("Ravi", "ravi@fastor.in");
    const id = await submitEnquiry(1);
    await submitEnquiry(2);

    const claim = await api.patch(`/api/enquiries/${id}/claim`).set("Authorization", `Bearer ${asha}`);
    assert.equal(claim.status, 200);
    assert.equal(claim.body.enquiry.status, "claimed");

    // Gone from the public list for everyone
    const publicForRavi = await api.get("/api/enquiries/unclaimed").set("Authorization", `Bearer ${ravi}`);
    assert.deepEqual(publicForRavi.body.data.map((e) => e.id), [2]);

    // Visible only in Asha's leads
    const ashaLeads = await api.get("/api/enquiries/mine").set("Authorization", `Bearer ${asha}`);
    const raviLeads = await api.get("/api/enquiries/mine").set("Authorization", `Bearer ${ravi}`);
    assert.deepEqual(ashaLeads.body.data.map((e) => e.id), [id]);
    assert.equal(raviLeads.body.data.length, 0);
    assert.equal(raviLeads.body.pagination.total, 0);
  });

  test("claim returns 409 if already claimed and 404 if missing", async () => {
    const asha = await signUp("Asha", "asha@fastor.in");
    const ravi = await signUp("Ravi", "ravi@fastor.in");
    const id = await submitEnquiry(1);

    await api.patch(`/api/enquiries/${id}/claim`).set("Authorization", `Bearer ${asha}`);
    const again = await api.patch(`/api/enquiries/${id}/claim`).set("Authorization", `Bearer ${asha}`);
    const other = await api.patch(`/api/enquiries/${id}/claim`).set("Authorization", `Bearer ${ravi}`);
    const missing = await api.patch(`/api/enquiries/9999/claim`).set("Authorization", `Bearer ${ravi}`);
    const badId = await api.patch(`/api/enquiries/abc/claim`).set("Authorization", `Bearer ${ravi}`);

    assert.equal(again.status, 409);
    assert.equal(other.status, 409);
    assert.equal(missing.status, 404);
    assert.equal(badId.status, 400);
  });

  test("simultaneous claims: exactly one counselor wins", async () => {
    const tokens = await Promise.all(
      Array.from({ length: 8 }, (_, i) => signUp(`Counselor ${i}`, `c${i}@fastor.in`)),
    );
    const id = await submitEnquiry(1);

    const results = await Promise.all(
      tokens.map((t) => api.patch(`/api/enquiries/${id}/claim`).set("Authorization", `Bearer ${t}`)),
    );
    const statuses = results.map((r) => r.status);
    assert.equal(statuses.filter((s) => s === 200).length, 1);
    assert.equal(statuses.filter((s) => s === 409).length, 7);
  });
});
