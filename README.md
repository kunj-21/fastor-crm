# Fastor CRM API

REST API for a counselor CRM: employees log in, prospective students submit a public enquiry form, and counselors **claim** enquiries so they become private to them.

**Stack:** Node.js 20+ · Express 5 · PostgreSQL · JWT (HS256) · bcrypt · Zod validation · Helmet · rate limiting

## Run it

```bash
docker compose up -d          # PostgreSQL on localhost:5433 (or use your own)
cp .env.example .env          # set JWT_SECRET
npm install
npm run dev                   # http://localhost:4000 (creates tables on boot)
```

Tests (real PostgreSQL, 12 cases, including a concurrent-claim race):

```bash
TEST_DATABASE_URL=postgres://crm:crm@localhost:5433/crm npm test
```

Import `postman_collection.json` into Postman. Register or Login stores the JWT automatically.

## Endpoints

| # | Acceptance criterion | Method & path | Auth |
|---|---|---|---|
| 1 | Employee register | `POST /api/auth/register` `{name, email, password}` | – |
| 1 | Employee login | `POST /api/auth/login` `{email, password}` | – |
| 2 | Public enquiry form | `POST /api/enquiries/public` `{name, email, courseInterest, phone?, message?}` | **None** |
| 3 | Fetch unclaimed (public) leads | `GET /api/enquiries/unclaimed?limit=20&offset=0` | Bearer JWT |
| 4 | Claim a lead | `PATCH /api/enquiries/:id/claim` | Bearer JWT |
| 5 | Fetch my claimed leads | `GET /api/enquiries/mine?limit=20&offset=0` | Bearer JWT |

Health check: `GET /health`.

**Status codes:** `201` created · `400` validation error (with field-level `details`) · `401` missing or invalid token, or wrong credentials · `404` enquiry not found · `409` email already registered, or lead already claimed.

### Example

```bash
TOKEN=$(curl -s -X POST localhost:4000/api/auth/register -H 'Content-Type: application/json' \
  -d '{"name":"Asha","email":"asha@fastor.in","password":"secret123"}' | jq -r .token)

curl -X POST localhost:4000/api/enquiries/public -H 'Content-Type: application/json' \
  -d '{"name":"Riya","email":"riya@example.com","courseInterest":"Full Stack Development"}'

curl localhost:4000/api/enquiries/unclaimed -H "Authorization: Bearer $TOKEN"
curl -X PATCH localhost:4000/api/enquiries/1/claim -H "Authorization: Bearer $TOKEN"
curl localhost:4000/api/enquiries/mine -H "Authorization: Bearer $TOKEN"
```

## Design decisions

- **Public vs. private is one column.** An enquiry is public while `counselor_id IS NULL` and private once claimed. A `CHECK` constraint keeps `counselor_id` and `claimed_at` consistent.
- **Race-safe claiming.** The claim is one atomic statement: `UPDATE … WHERE id = $1 AND counselor_id IS NULL`. If two counselors claim at once, exactly one row update succeeds and the other gets `409`. There's no read-then-write gap, and this is covered by a test.
- **Indexes:** a partial index on unclaimed enquiries (`created_at DESC WHERE counselor_id IS NULL`) and a `(counselor_id, claimed_at)` index for "my leads".
- **Auth:** bcrypt-hashed passwords and JWTs carrying `sub` (employee id) and `email`. Login compares against a dummy hash for unknown emails, so response timing and messages don't reveal which emails exist. Emails are normalised to lowercase.
- **Hardening:** Helmet headers, a 20 KB JSON body limit, rate limits on auth (20 per 15 min) and the public form (30 per 15 min), parameterised SQL throughout, and a central error handler that never leaks stack traces.
- **Testable by design:** `createApp({ db, jwtSecret })` takes its dependencies, so tests run the real app against a real database.

## Structure

```
src/
  app.js              Express app factory (middleware, routes, error handler)
  server.js           boot: config → DB pool → migrate → listen
  config.js           env vars (fails fast if missing)
  db/schema.sql       tables, constraint, indexes (idempotent)
  db/migrate.js       applies schema (also: npm run migrate)
  middleware/auth.js  JWT bearer verification
  routes/             auth.js, enquiries.js
  repositories.js     all SQL
  validation.js       Zod schemas
test/api.test.js      integration tests
```
