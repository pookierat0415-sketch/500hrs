-- Problem reports for the ohjeyti app.
-- Run once in the Supabase dashboard: SQL Editor -> New query -> paste -> Run.
--
-- The app only ever INSERTS. Anonymous users cannot read, edit, or delete
-- reports or screenshots; view them from the Supabase dashboard instead.

create table if not exists public.problem_reports (
  id              uuid primary key,              -- generated on the device, makes retries safe
  category        text not null check (category in ('bug', 'display', 'idea', 'other')),
  message         text not null check (char_length(message) between 1 and 2000),
  screenshot_path text,                          -- object name in the report-screenshots bucket
  app_version     text,
  user_agent      text,
  screen          text,
  created_at      timestamptz not null,          -- when the user wrote it (device clock)
  received_at     timestamptz not null default now()
);

alter table public.problem_reports enable row level security;

drop policy if exists "Anyone can submit a problem report" on public.problem_reports;
create policy "Anyone can submit a problem report"
  on public.problem_reports for insert
  to anon, authenticated
  with check (true);

-- Private bucket for screenshots (max 5 MB, images only).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('report-screenshots', 'report-screenshots', false, 5242880,
        array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

drop policy if exists "Anyone can upload a report screenshot" on storage.objects;
create policy "Anyone can upload a report screenshot"
  on storage.objects for insert
  to anon, authenticated
  with check (bucket_id = 'report-screenshots');
