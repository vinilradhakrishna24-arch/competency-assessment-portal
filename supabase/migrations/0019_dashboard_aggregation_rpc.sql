-- =====================================================================
-- 0019_dashboard_aggregation_rpc.sql
--
-- Performance fix for the Dashboard (see docs/ui-performance-audit.md,
-- finding #1): getDashboardData() used to pull up to 2,000 assessment
-- rows (joined) plus the *entire* certificates table on every request,
-- then compute every KPI/chart via a dozen in-memory .filter() passes.
-- This migration moves that aggregation into a single SQL function so
-- Postgres does the counting/grouping instead of the application.
--
-- Security: deliberately NOT `security definer`. It runs as whichever
-- role calls it (the same authenticated Supabase client used everywhere
-- else), so every existing RLS policy on assessments/competencies/
-- candidates/certificates (viewer_stream_scope() etc., see
-- 0012_role_stream_scope.sql) applies exactly as it does to a direct
-- `select` today. A stream-scoped viewer calling this with a stream
-- they can't see gets the same empty result RLS already gives them --
-- nothing here widens or narrows access.
--
-- Purely additive: no existing table, column, or policy is touched.
-- =====================================================================

-- Composite index matching this function's dominant filter pattern
-- (assessments for competencies in one stream, grouped by status).
-- Both idx_assessments_competency and idx_assessments_status already
-- exist (0003); this just gives the planner a single covering index
-- for the common case instead of a bitmap-and of two.
create index if not exists idx_assessments_competency_status on assessments(competency_id, status);

create or replace function fn_dashboard_data(p_stream text)
returns jsonb
language sql
stable
as $$
  with stream_competencies as (
    select code, competency_name
    from competencies
    where stream = p_stream and active = true
    order by code
  ),
  stream_assessments as (
    select
      a.id,
      a.status,
      a.created_at,
      a.updated_at,
      a.link_expires_at,
      c.code as competency_code,
      cand.full_name as candidate_name,
      cand.project_contract as project_contract,
      cand.department as department
    from assessments a
    join competencies c on c.id = a.competency_id
    left join candidates cand on cand.id = a.candidate_id
    where c.stream = p_stream
  ),
  kpi_base as (
    select
      count(*) as total,
      count(*) filter (where status = 'PENDING') as pending,
      count(*) filter (where status = 'STARTED') as in_progress,
      count(*) filter (where status in ('PASSED', 'CERTIFIED')) as passed,
      count(*) filter (where status = 'FAILED') as failed,
      count(*) filter (where status = 'AWAITING_APPROVAL') as awaiting_approval,
      count(*) filter (where status = 'EXPIRED') as expired
    from stream_assessments
  ),
  total_candidates as (
    select count(*) as n from candidates where deleted_at is null
  ),
  certificates_in_stream as (
    select count(*) as n
    from certificates cert
    join competencies c on c.id = cert.competency_id
    where c.stream = p_stream
  ),
  competent_by_competency as (
    select coalesce(jsonb_agg(jsonb_build_object('code', sc.code, 'name', sc.competency_name, 'count', coalesce(cnt.n, 0)) order by sc.code), '[]'::jsonb) as v
    from stream_competencies sc
    left join (
      select competency_code, count(*) as n
      from stream_assessments
      where status in ('PASSED', 'CERTIFIED')
      group by competency_code
    ) cnt on cnt.competency_code = sc.code
  ),
  competency_distribution as (
    select coalesce(jsonb_agg(jsonb_build_object('name', sc.code, 'value', coalesce(cnt.n, 0)) order by sc.code), '[]'::jsonb) as v
    from stream_competencies sc
    left join (
      select competency_code, count(*) as n
      from stream_assessments
      group by competency_code
    ) cnt on cnt.competency_code = sc.code
  ),
  pass_rate_by_competency as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'name', sc.code,
      'passRate', case when coalesce(d.decided, 0) = 0 then 0 else round((coalesce(d.passed, 0)::numeric / d.decided) * 100) end
    ) order by sc.code), '[]'::jsonb) as v
    from stream_competencies sc
    left join (
      select
        competency_code,
        count(*) filter (where status in ('PASSED', 'FAILED', 'CERTIFIED')) as decided,
        count(*) filter (where status in ('PASSED', 'CERTIFIED')) as passed
      from stream_assessments
      group by competency_code
    ) d on d.competency_code = sc.code
  ),
  by_month as (
    select coalesce(jsonb_agg(jsonb_build_object('month', to_char(m.month_start, 'Mon YY'), 'count', coalesce(cnt.n, 0)) order by m.month_start), '[]'::jsonb) as v
    from (
      select date_trunc('month', now()) - (n || ' months')::interval as month_start
      from generate_series(11, 0, -1) as n
    ) m
    left join (
      select date_trunc('month', created_at) as month_start, count(*) as n
      from stream_assessments
      group by date_trunc('month', created_at)
    ) cnt on cnt.month_start = m.month_start
  ),
  project_wise as (
    select coalesce(jsonb_agg(jsonb_build_object('name', label, 'competent', competent, 'total', total) order by total desc), '[]'::jsonb) as v
    from (
      select
        coalesce(project_contract, 'Unassigned') as label,
        count(*) as total,
        count(*) filter (where status in ('PASSED', 'CERTIFIED')) as competent
      from stream_assessments
      group by coalesce(project_contract, 'Unassigned')
      order by count(*) desc
      limit 8
    ) g
  ),
  department_wise as (
    select coalesce(jsonb_agg(jsonb_build_object('name', label, 'competent', competent, 'total', total) order by total desc), '[]'::jsonb) as v
    from (
      select
        coalesce(department, 'Unassigned') as label,
        count(*) as total,
        count(*) filter (where status in ('PASSED', 'CERTIFIED')) as competent
      from stream_assessments
      group by coalesce(department, 'Unassigned')
      order by count(*) desc
      limit 8
    ) g
  ),
  recent_activity as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', id,
      'candidateName', coalesce(candidate_name, 'Unknown candidate'),
      'competencyCode', coalesce(competency_code, '—'),
      'status', status,
      'at', coalesce(updated_at, created_at)
    ) order by coalesce(updated_at, created_at) desc), '[]'::jsonb) as v
    from (
      select *
      from stream_assessments
      order by coalesce(updated_at, created_at) desc
      limit 8
    ) r
  ),
  upcoming_pending as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', id,
      'candidateName', coalesce(candidate_name, 'Unknown candidate'),
      'competencyCode', coalesce(competency_code, '—'),
      'linkExpiresAt', link_expires_at
    ) order by link_expires_at asc), '[]'::jsonb) as v
    from (
      select *
      from stream_assessments
      where status = 'PENDING'
      order by link_expires_at asc
      limit 6
    ) u
  )
  select jsonb_build_object(
    'kpis', jsonb_build_object(
      'total', kb.total,
      'totalCandidates', tc.n,
      'pending', kb.pending,
      'inProgress', kb.in_progress,
      'passed', kb.passed,
      'failed', kb.failed,
      'awaitingApproval', kb.awaiting_approval,
      'expired', kb.expired,
      'passPercentage', case when (kb.passed + kb.failed) = 0 then 0 else round((kb.passed::numeric / (kb.passed + kb.failed)) * 100) end,
      'competentByCompetency', cbc.v,
      'certificatesIssued', cis.n
    ),
    'byMonth', bm.v,
    'passVsFail', jsonb_build_array(
      jsonb_build_object('name', 'Passed', 'value', kb.passed),
      jsonb_build_object('name', 'Failed', 'value', kb.failed)
    ),
    'competencyDistribution', cd.v,
    'passRateByCompetency', prbc.v,
    'projectWise', pw.v,
    'departmentWise', dw.v,
    'recentActivity', ra.v,
    'upcomingPending', up.v
  )
  from kpi_base kb, total_candidates tc, certificates_in_stream cis,
       competent_by_competency cbc, competency_distribution cd, pass_rate_by_competency prbc,
       by_month bm, project_wise pw, department_wise dw, recent_activity ra, upcoming_pending up;
$$;

comment on function fn_dashboard_data(text) is
  'Server-side aggregation for the Dashboard, replacing the old fetch-2000-rows-then-filter-in-JS approach (src/lib/dashboard.ts). Runs with the caller''s own privileges, so every RLS policy that already applies to assessments/competencies/candidates/certificates applies here too -- this changes nothing about who can see what.';
