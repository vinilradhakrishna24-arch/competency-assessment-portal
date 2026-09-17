-- Introduces a "manager" capability, orthogonal to permission_level, so a
-- viewer-tier role (e.g. "HSE Manager") can be granted create/edit rights on
-- assessments, questions and candidates within its own stream_scope, without
-- promoting it to full Admin (Users & Roles / Settings / Audit Log / other
-- streams stay admin-only). permission_level itself is left untouched
-- ('admin' | 'viewer' only) so every existing RLS SELECT policy keyed off
-- is_viewer_or_admin()/viewer_stream_scope() keeps working unchanged.

alter table public.roles
  add column can_manage boolean not null default false;

comment on column public.roles.can_manage is
  'When true (only meaningful for a viewer-tier role), grants create/edit rights on questions, question_options, and candidates -- scoped to the role''s stream_scope where applicable -- without granting full Admin (Users & Roles, Settings, Audit Log). See is_manager().';

update public.roles set can_manage = true where name = 'HSE Manager';

create or replace function public.is_manager()
returns boolean
language sql stable security definer
set search_path to 'public'
as $$
  select coalesce(
    (
      select r.permission_level = 'viewer' and r.can_manage
      from profiles p
      join roles r on r.id = p.role_id
      where p.id = auth.uid()
        and p.active = true
    ),
    false
  )
$$;

comment on function public.is_manager() is
  'True for an active, viewer-tier profile whose role has can_manage = true (e.g. HSE Manager). Combine with viewer_stream_scope() to scope writes to that role''s stream(s).';

-- questions: widen the existing admin-only insert/update policies to also
-- allow a manager whose stream_scope covers the question's competency.
alter policy questions_admin_insert on public.questions
  with check (
    is_admin() or (
      is_manager() and exists (
        select 1 from competencies c
        where c.id = questions.competency_id
          and c.stream = any (viewer_stream_scope(auth.uid()))
      )
    )
  );

alter policy questions_admin_update on public.questions
  using (
    is_admin() or (
      is_manager() and exists (
        select 1 from competencies c
        where c.id = questions.competency_id
          and c.stream = any (viewer_stream_scope(auth.uid()))
      )
    )
  );

-- question_options: same pattern, via the parent question's competency.
alter policy question_options_admin_insert on public.question_options
  with check (
    is_admin() or (
      is_manager() and exists (
        select 1 from questions q
        join competencies c on c.id = q.competency_id
        where q.id = question_options.question_id
          and c.stream = any (viewer_stream_scope(auth.uid()))
      )
    )
  );

alter policy question_options_admin_update on public.question_options
  using (
    is_admin() or (
      is_manager() and exists (
        select 1 from questions q
        join competencies c on c.id = q.competency_id
        where q.id = question_options.question_id
          and c.stream = any (viewer_stream_scope(auth.uid()))
      )
    )
  );

-- candidates: candidate profiles are not stream-tagged (the same person can
-- be assessed under either stream), so a manager may create/edit any
-- candidate record -- no stream filter here. Deletion stays admin-only.
alter policy candidates_admin_insert on public.candidates
  with check (is_admin() or is_manager());

alter policy candidates_admin_update on public.candidates
  using (is_admin() or is_manager());

-- candidates_select: a manager who just created a candidate with no
-- assessment yet would otherwise fail the stream-match EXISTS clause and be
-- unable to see the record they just made. Add a created_by fallback.
alter policy candidates_select on public.candidates
  using (
    is_admin() or (
      is_viewer_or_admin()
      and deleted_at is null
      and (
        viewer_stream_scope(auth.uid()) is null
        or exists (
          select 1 from assessments a
          join competencies c on c.id = a.competency_id
          where a.candidate_id = candidates.id
            and c.stream = any (viewer_stream_scope(auth.uid()))
        )
        or candidates.created_by = auth.uid()
      )
    )
  );
