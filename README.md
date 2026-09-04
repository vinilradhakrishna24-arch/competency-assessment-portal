# Competency Assessment Portal

A production-ready web application for engineer competency assessment across
three competency types — **LOA** (Limit of Authority), **SFT** (Safe For
Task), and **PTW** (Permit To Work). Admin/Examiners build a question bank,
generate secure one-time exam links for candidates, and candidates complete
a timed, server-scored assessment with no login required. Passing candidates
receive a QR-verified PDF certificate.

Built with Next.js 16 (App Router), TypeScript, Tailwind CSS, and Supabase
(Postgres + Auth + Storage, with Row Level Security enforced on every
table).

## Tech stack

- **Frontend**: Next.js 16 (App Router, Server Components + Server
  Actions), React 19, TypeScript (strict), Tailwind CSS v4.
- **Backend**: Supabase Postgres with RLS on every table; atomic PL/pgSQL
  functions (`supabase/migrations/0004_functions.sql`) handle the entire
  exam lifecycle transactionally — assessment creation with frozen
  question snapshots, exam start, autosave, submission/scoring, candidate
  verification with rate limiting, and reassessment.
- **Files**: `exceljs` + `papaparse` for Excel/CSV bulk import and report
  export (not `xlsx`/SheetJS, which has unpatched CVEs); `@react-pdf/renderer`
  for certificate PDFs; `qrcode` for verification QR codes.
- **Testing**: Vitest (unit tests for scoring-adjacent pure logic, import
  validation, token security) and Playwright (end-to-end).

## Project structure

```
src/
  app/
    (app)/            # Authenticated admin/viewer pages (dashboard, candidates,
                       # questions, assessments, certificates, reports, users,
                       # audit-log, settings) — behind proxy.ts route protection
    api/exam/[token]/ # Candidate-facing exam API (service-role client, token-hash auth)
    api/certificates/ # Signed certificate download URLs
    api/reports/      # CSV/XLSX report export
    exam/[token]/     # Candidate exam UI (no login)
    verify/[code]/    # Public certificate verification page
    login/            # Admin/Examiner & Viewer login
  components/          # UI, feature components, grouped by area
  lib/
    actions/          # Server Actions (admin CRUD, assessment lifecycle)
    exam/             # Token security, question freezing, session cookie
    certificate/      # PDF generation, QR codes, signed URL issuance
    import/           # Bulk import parsing + validation
    validation/       # Zod schemas
supabase/migrations/   # All SQL migrations, applied in numeric order
tests/
  unit/                # Vitest — pure logic (token security, import validation, formatting)
  e2e/                 # Playwright — auth, RBAC, full candidate exam lifecycle
```

## Environment variables

Copy `.env.example` to `.env.local` and fill in every value. The file
documents which variables are browser-safe (`NEXT_PUBLIC_*`) and which are
server-only — never move a server-only value behind a `NEXT_PUBLIC_` prefix.

Required:

- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` — from your
  Supabase project's API settings.
- `NEXT_PUBLIC_APP_URL` — the deployed URL; used to build candidate exam
  links and certificate QR codes.
- `SUPABASE_SERVICE_ROLE_KEY` — server-only, bypasses RLS. Used only in
  `lib/supabase/admin.ts` for candidate-facing routes and certificate
  generation.
- `EXAM_SESSION_SECRET` — a dedicated random secret for signing the
  candidate verification cookie. Generate with:
  `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`

## Database setup

All migrations live in `supabase/migrations/`, applied in order:

1. `0001_extensions_and_roles.sql` — roles, profiles, auth helper functions.
2. `0002_core_tables.sql` — candidates, competencies, question sets, questions, system settings.
3. `0003_assessment_tables.sql` — assessments, frozen question snapshots, answers, results, certificates, audit logs.
4. `0004_functions.sql` — atomic exam lifecycle functions.
5. `0005_rls_and_storage.sql` — RLS policies on every table, private certificates storage bucket.
6. `0006_seed.sql` — **development-only** sample competencies/questions, clearly marked `[SAMPLE]`. Do not treat as production content.
7. `0007_bulk_import_function.sql` — atomic bulk question import.

Apply them via the Supabase SQL editor, the Supabase CLI (`supabase db push`),
or the Management API, in numeric order.

### Bootstrapping the first Admin/Examiner account

New Supabase Auth users default to the `viewer` role (see
`handle_new_auth_user()` in migration 0005). To create the first Admin:

1. Create a user via Supabase Dashboard → Authentication → Users → Add User,
   or `supabase.auth.admin.createUser(...)` with the service-role key.
2. Promote them: `update profiles set role_id = (select id from roles where name = 'admin') where id = '<user-id>';`

Every Admin/Examiner created after that can be added directly from the
**Users & Roles** page in the app.

## Local development

```bash
npm install
cp .env.example .env.local   # fill in real values
npm run dev
```

## Running the test suite

**Unit tests** (no external dependencies, run anywhere):

```bash
npm test
```

**End-to-end tests** (Playwright) run against a real instance of the app
and a real Supabase project, since candidate-facing security (rate
limiting, generic verification errors, server-authoritative timers) can
only be verified against the real backend. Before running them:

1. Start the app (`npm run dev`, or point `PLAYWRIGHT_BASE_URL` at a
   deployed environment).
2. Bootstrap an Admin/Examiner account (see above) and set:
   ```bash
   export TEST_ADMIN_EMAIL=admin@example.com
   export TEST_ADMIN_PASSWORD=...
   ```
3. For the role-permissions spec, also create a Viewer/Management account
   from the Users & Roles page and set `TEST_VIEWER_EMAIL` / `TEST_VIEWER_PASSWORD`.
4. Run:
   ```bash
   npm run test:e2e
   ```

The e2e suite creates its own candidates/assessments through the real UI
(no direct DB fixtures) using the seeded `[SAMPLE]` PTW question set, so it
needs no other setup. It covers: route protection, invalid-login handling,
role-based access control, the full candidate lifecycle (verification with
a generic error message, rate-limit lockout, autosave/resume across a
reload, review, submission, idempotent result display), and the public
certificate verification page.

## Manual security review checklist

Before treating a deployment as production-ready, confirm:

- [ ] Row Level Security is enabled on every table (`\d+` each table in
      the Supabase dashboard, or re-run migration 0005 and check for errors).
- [ ] `SUPABASE_SERVICE_ROLE_KEY` never appears in a client bundle — search
      `.next/static` after a production build for the key prefix; it must
      not be found.
- [ ] No response from any candidate-facing API route
      (`/api/exam/[token]/*`) ever includes `is_correct` or
      `explanation_admin_only` — inspect responses in DevTools during a
      full exam attempt.
- [ ] The `certificates` Storage bucket is private, and every download URL
      is a short-lived signed URL obtained via `/api/certificates/[id]/download`
      — never a public bucket URL.
- [ ] Certificate QR codes encode `/verify/{code}`, never a direct link to
      the PDF.
- [ ] A candidate cannot access another candidate's assessment by guessing
      or incrementing an ID — every candidate route resolves state via the
      token hash, not a sequential ID (test by requesting
      `/api/exam/[token]/state` with a token that isn't yours).
- [ ] An expired `link_expires_at` or elapsed `ends_at` is enforced
      server-side even if the client's clock is wrong — `fn_check_and_expire_assessment`
      runs on every exam API call.
- [ ] Repeated failed Employee ID verifications lock out after
      `verification_retry_settings.max_attempts` (Settings page), and the
      error message is identical whether the employee ID or the token was
      wrong.
- [ ] Every admin Server Action re-checks the caller's role server-side
      (`requireAdmin()` / `requireUser()`) — the sidebar hiding a button is
      a UX nicety, not the security boundary.

## Deployment (Netlify)

```bash
npm run build   # verify locally first
```

Then either connect the repository in the Netlify dashboard (Next.js is
auto-detected via `@netlify/plugin-nextjs`), or deploy with the Netlify CLI:

```bash
netlify deploy --prod
```

Set every variable from `.env.example` in the Netlify site's environment
variables before the first deploy — the build will fail fast with a clear
error naming the missing variable (see `src/lib/env.ts`) rather than
silently misbehaving at runtime.
