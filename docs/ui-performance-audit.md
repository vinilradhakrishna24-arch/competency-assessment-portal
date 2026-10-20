# Competency Assessment Portal — Audit Report (Phase 1)

**Scope:** response to the "Before Starting" section of the redesign request — architecture, navigation, UI/UX, performance, and database/API findings, based on direct inspection of the current codebase (not assumptions). No code has been changed as part of this audit.

---

## 1. Current Application Architecture

- **Stack:** Next.js (App Router, Server Components + Server Actions), Supabase (Postgres + Auth + Storage + RLS), deployed on Netlify. Charts via Recharts, PDFs via `@react-pdf/renderer`, spreadsheets via ExcelJS, forms via `react-hook-form` + Zod.
- **Rendering model:** pages are async Server Components that call server actions directly (no client-side data-fetching library/cache like React Query or SWR). Tables are client components that call the same server actions imperatively (`getX()` functions) for refresh after filtering or mutation.
- **Auth/authorization:** `src/lib/auth/session.ts` centralizes `requireUser()` / `requireAdmin()` / `requireManagerOrAdmin()`. Two competency "streams" exist — Technical (LOA/PTW/SFT) and HSE (HSE Advisor/HSE Manager) — enforced both at the UI (nav/stream filters) and at the database layer via Postgres RLS policies keyed off `roles.permission_level`, `roles.stream_scope`, and `roles.can_manage`. This is a real, working defense-in-depth model, not just UI-level hiding.
- **Routes:** Dashboard, Assessments, Create Assessment, Candidates, Question Bank (+ Bulk Import), Certificates, Reports, Pending Approvals, Users & Roles, Audit Log, Settings, plus the public candidate-facing Exam flow and certificate verification page.

## 2. Current Navigation Structure

`src/components/layout/nav-items.ts` + `sidebar.tsx`. Five items — **Dashboard, Assessments, Question Bank, Certificates, Reports** — are defined once but rendered **twice**: once under a "Technical" section and once under an "HSE" section, each linking to the same route with a different `?stream=` query parameter. This is what reads as "duplicate navigation items" in your screenshot. It is not a bug — it is a deliberate design that lets each page's data and pass-mark scoring be fully stream-specific — but it is a real UX cost: every user who can see both streams sees 10 nav rows for what is conceptually 5 destinations. Section-label headers only appear when a user can see both streams, which already shows the team is aware of the duplication, just not that it's confusing. This is directly fixable (see §9).

Below that, six shared items (Create Assessment, Candidates, Pending Approval, Users & Roles, Audit Log, Settings) appear once. There is no "Administration" grouping — Users & Roles, Audit Log, and Settings sit at the same visual level as Candidates.

The Topbar has **no** global search, notifications, or help affordance — confirmed by reading `topbar.tsx`: it currently shows only the user's name/email, a role badge, and Sign Out.

## 3. UI/UX Problems Identified

- **Nav duplication** (above) is the single biggest structural navigation issue.
- **No "Administration" grouping** — admin-only items are flat-listed with everyday items.
- **No global search, notifications, or help in the header.**
- **Honest counterpoint:** the visual language you're asking for (white/light background, deep navy primary, restrained accent colors, no heavy gradients/glassmorphism) is **largely already what's implemented** — the existing Tailwind theme uses a navy/slate/white palette with flat cards and minimal shadow. This is not a "basic internal web app" starting from zero; it needs density, information-architecture, and component-feature work (tables, forms, guided workflows) far more than it needs a new color language. I flag this so effort isn't spent re-skinning what already matches the target direction.
- **Create Assessment** is a single long form today (confirmed in `create-assessment-form.tsx`), not a guided multi-step flow — this matches your §9 request directly.
- **Tables** (`assessments-table.tsx`, `candidates-table.tsx`, `questions-manager.tsx`, audit log, certificates) have search and basic filters, but **no sorting, no column selection, no pagination controls, no bulk actions, and no export** on most of them.
- **Status badges** are implemented per-page (`StatusBadge`, inline `Badge` classes) rather than from one shared status taxonomy — some reuse exists (`STATUS_LABELS` in `constants.ts`) but color/label mapping is duplicated in places rather than drawn from a single source.

## 4. Performance Problems Identified (code-level, confirmed by reading the source)

These are concrete findings, not guesses:

1. **The Dashboard does all aggregation in application code, not SQL.** `src/lib/dashboard.ts` pulls up to **2,000 assessment rows** (with joins to competencies and candidates) plus the **entire certificates table** and a candidate count, on every single dashboard request, with **no caching** (no `unstable_cache`, no ISR, no revalidation window). It then runs upwards of a dozen separate `.filter()` passes over that in-memory array to compute KPIs, monthly trends, pass/fail, competency distribution, pass rate, project-wise and department-wise breakdowns. This is the classic "fetch everything, compute client/server-side" anti-pattern instead of letting Postgres aggregate (`GROUP BY`, `count()`, materialized views, or at minimum a cached RPC). It will get linearly slower as assessment volume grows and is very likely the dominant source of "noticeable delay" on the Dashboard specifically.
2. **No server-side pagination anywhere.** Every list action caps at a fixed `.limit()` and ships the whole page to the browser for client-side filtering: Assessments and Candidates and Certificates and Question Bank at 500 rows, Reports at 2,000, Audit Log at 1,000 (plus a separate 5,000-row query just to compute a filter's dropdown options). This matches your own §7/§5 concerns directly and is a real, fixable issue — not a hypothetical one.
3. **Repeated auth/session checks per navigation.** The shared layout (`(app)/layout.tsx`) calls `requireUser()` once, and then **every individual page also calls `requireUser()`/`requireAdmin()`/`requireManagerOrAdmin()` again** (confirmed in 11 of the route files). Each call re-validates the Supabase Auth session and re-queries `profiles` joined to `roles`. That's two full auth+DB round trips per page load at minimum, where one (cached per-request) would do.
4. **No client-side data cache/dedupe layer.** There's no React Query/SWR; every table's "refresh after filter/mutation" is a fresh server-action call with no request de-duplication or background revalidation, so rapid filter changes can produce overlapping in-flight requests.
5. **What's *not* a problem, based on inspection:** the dashboard page itself already parallelizes its two top-level fetches with `Promise.all`; several tables already guard against a redundant initial client-side refetch (a `didMount` ref pattern appears in `candidates-table.tsx` and similar). The codebase is not undisciplined — the issues above are specific and targeted, not systemic chaos.

I have **not** yet run Lighthouse, a bundle analyzer, or production request timing — the findings above are static-analysis based (confirmed by reading the actual query/filter code), not measured milliseconds. Before/after metrics (§20 of your request) require an instrumented pass (Next.js build output + bundle analyzer + Lighthouse against a staging deploy) as a distinct next step; I won't invent numbers.

## 5. Database/API Issues Affecting Performance

- `getDashboardData()` (above) is the highest-value fix: move KPI/aggregate computation into SQL (views or RPC functions) so the database does the counting, and cache the result for a short window (even 30–60s) rather than recomputing on every request.
- List actions (`getAssessments`, `getCandidates`, `getQuestions`, `getCertificates`, `getAuditLogs`) need real server-side pagination (`range()`/keyset pagination) plus server-side search/filter pushdown, replacing the "fetch up to N, filter in the browser" pattern.
- RLS is correctly in place for every table I checked — this must be preserved exactly as-is; none of the above requires weakening it, only querying through it more efficiently (aggregates and paginated reads still go through the same RLS-scoped client).

## 6. Components That Should Be Reused

- The existing `src/components/ui/*` primitives (`Button`, `Input`, `Select`, `FormField`, `Table`/`Thead`/`Tbody`/`Tr`/`Th`/`Td`, `Badge`, `Dialog`/`ConfirmDialog`, `EmptyState`, `PageHeader`, `KpiCard`) are a genuine, consistent design-system foundation already. They should be extended (pagination, sorting, column controls, skeleton states) rather than replaced.
- `CompetencyBadge` and `StatusBadge` are the right pattern for a unified status system — they just need to become the *only* source of status color/label everywhere (a few places still build ad hoc `Badge` className strings for status-like states).
- The RBAC pattern (`requireAdmin`/`requireManagerOrAdmin`/`streamScope` checks) is sound and should be preserved exactly; new UI must keep gating at this same layer, not just hide buttons.

## 7. Components That Should Be Refactored

- `sidebar.tsx` — restructure around a single set of nav items with an in-context stream switcher instead of duplicated per-stream entries, and add an "Administration" group.
- `dashboard.ts` — move aggregation into SQL/RPC + add caching (highest-impact performance item).
- `assessments-table.tsx`, `candidates-table.tsx`, `questions-manager.tsx`, certificates and audit-log tables — add shared pagination/sort/export building blocks instead of each hand-rolling its own filter state.
- `create-assessment-form.tsx` — split into the step-based wizard you described; the underlying `createAssessment` server action and its validation can stay as-is.
- `topbar.tsx` — add the search/notifications/help affordances; this is additive, nothing to break.

## 8. Proposed New Information Architecture

```
Dashboard
Assessments        (stream switcher inside the page, not duplicated nav rows)
Create Assessment
Candidates
Question Bank
Certificates
Reports
Approvals
Administration
  ├─ Users & Roles
  ├─ Audit Log
  └─ Settings
```
One nav row per destination; a stream switcher (Technical/HSE segmented control) lives at the top of Dashboard/Assessments/Question Bank/Certificates/Reports themselves, preserving every bit of the existing stream-scoping logic (RLS, `streamScope`, pass-mark config) — only the *navigation chrome* changes, not the data model.

## 9. Proposed Dashboard Layout

Keep the current KPI-cards-then-charts-then-activity structure (it's already close to right) but:
- Group KPI cards by meaning (Candidates/Assessments outcome counts | Competency-specific counts | Certificates), each as a labeled row rather than one undifferentiated 6-column grid.
- Group charts explicitly into "Assessment Overview", "Competency Overview", "Organizational Competency" sections as you specified in §4.
- Move the stream switcher to the page header area (replacing the nav-duplication it currently requires).
- Compute aggregates server-side (SQL) with a short cache window, so the heavier charts (project-wise, department-wise) don't require scanning 2,000 rows per view.

## 10. Proposed Design System (extension, not a rewrite)

Formalize what already exists in `src/components/ui` into a documented set: typography scale, spacing scale, the existing navy/slate/status palette, button/input/select variants, the Table primitives extended with sort/paginate/export, Card and KpiCard, Dialog/Drawer, Tabs (new — needed for the candidate detail profile and Create Assessment wizard), Tooltip (new), and a single `StatusBadge` taxonomy used everywhere status appears.

## 11. Performance Optimization Strategy

1. Dashboard aggregation → SQL/RPC + caching (highest impact, most measurable).
2. Server-side pagination for every list view, with sort/filter pushed to the query.
3. De-duplicate auth checks per request (resolve the session once per request and pass it down, rather than re-querying per page).
4. Only after 1–3: revisit bundle size, code-splitting, and skeleton/optimistic-UI polish — these are real but secondary to the query-shape issues above.
5. Instrument before/after with Lighthouse + Next.js bundle analysis once the above land, to produce the metrics table in your §20 honestly rather than estimating it up front.

## 12. Implementation Sequence (proposed)

Matches your own §21 phasing: Phase 1 (this audit, done) → Phase 2 design-system extension → Phase 3 Dashboard (visual + the SQL/caching fix together, since they touch the same code) → Phase 4 core modules (Assessments/Candidates/Question Bank/Certificates — tables + pagination) → Phase 5 Administration → Phase 6 Reports/export → Phase 7 remaining performance passes (bundle/code-splitting) → Phase 8 responsive pass → Phase 9 regression test.

---

### Recommendation

This is a large, multi-week scope if done properly without breaking anything (your own §17 is right to insist on that). I'd suggest starting with **Phase 2 (design system) + Phase 3 (Dashboard redesign + the SQL aggregation fix)** as the first deliverable, since the Dashboard is both your highest-visibility screen and the one confirmed performance hotspot — and reviewing that increment with you before moving to the other modules, rather than attempting all nine phases in one pass.
