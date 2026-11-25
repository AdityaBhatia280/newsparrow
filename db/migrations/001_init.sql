-- Sparrow schema. The server is the only database client; browsers never query tables directly.

create table app_users (
  id uuid primary key,
  email text not null,
  display_name text,
  role text not null default 'student' check (role in ('student', 'admin')),
  session_version integer not null default 1,
  terms_accepted_at timestamptz,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

-- The official publik module's per-person record. The pk_ key inside is encrypted by the server.
create table publik_users (
  user_id uuid primary key references app_users (id) on delete cascade,
  record jsonb not null,
  updated_at timestamptz not null default now()
);

create table publik_own_keys (
  user_id uuid primary key references app_users (id) on delete cascade,
  key_enc text not null,
  key_hint text not null,
  created_at timestamptz not null default now()
);

create table profiles (
  user_id uuid primary key references app_users (id) on delete cascade,
  first_name text,
  grade smallint check (grade between 9 and 12),
  country text not null default 'US',
  region text,
  persona text,
  interests text[] not null default '{}',
  custom_interest text,
  goals text[] not null default '{}',
  weekly_hours smallint check (weekly_hours between 0 and 40),
  budget text,
  format text,
  study_location text,
  experience text,
  skills text[] not null default '{}',
  summary text,
  strengths text[] not null default '{}',
  onboarding_step smallint not null default 0,
  onboarded_at timestamptz,
  tour_done_at timestamptz,
  settings jsonb not null default '{}',
  updated_at timestamptz not null default now()
);

create table activities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_users (id) on delete cascade,
  kind text not null default 'activity' check (kind in ('activity', 'honor')),
  category text,
  title text not null,
  role text,
  organization text,
  description text,
  grades smallint[] not null default '{}',
  hours_per_week real,
  weeks_per_year smallint,
  recognition text,
  source text not null default 'manual' check (source in ('manual', 'resume')),
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index activities_user on activities (user_id, kind, position);

create table opportunities (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  provider text not null,
  type text not null,
  interests text[] not null default '{}',
  grades smallint[] not null default '{}',
  format text not null default 'varies',
  location text,
  cost text not null default 'unknown' check (cost in ('free', 'paid', 'varies', 'unknown')),
  summary text not null,
  official_url text not null,
  eligibility text,
  time_commitment text,
  deadline date,
  deadline_note text,
  status text not null default 'approved' check (status in ('approved', 'archived')),
  facts_verified_at timestamptz,
  link_checked_at timestamptz,
  created_by uuid references app_users (id) on delete set null,
  verified_by uuid references app_users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index opportunities_status on opportunities (status, type);

create table opportunity_evidence (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references opportunities (id) on delete cascade,
  field text not null,
  excerpt text not null,
  source_url text not null,
  captured_at timestamptz not null default now(),
  reviewer_id uuid references app_users (id) on delete set null
);
create index opportunity_evidence_opportunity on opportunity_evidence (opportunity_id);

create table saved_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_users (id) on delete cascade,
  opportunity_id uuid references opportunities (id) on delete cascade,
  title text,
  url text,
  provider text,
  status text not null default 'interested' check (status in ('interested', 'preparing', 'submitted', 'accepted', 'closed')),
  note text not null default '',
  personal_due date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, opportunity_id),
  check (opportunity_id is not null or title is not null)
);
create index saved_items_user on saved_items (user_id, status);

create table tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_users (id) on delete cascade,
  saved_id uuid references saved_items (id) on delete cascade,
  title text not null,
  due date,
  done_at timestamptz,
  source text not null default 'manual' check (source in ('manual', 'plan', 'advisor')),
  plan_key text,
  created_at timestamptz not null default now(),
  unique (user_id, plan_key)
);
create index tasks_user on tasks (user_id, done_at, due);

create table colleges (
  id integer primary key,
  name text not null,
  city text,
  state text,
  url text,
  price_calculator_url text,
  ownership smallint,
  locale smallint,
  size integer,
  admission_rate real,
  tuition_in integer,
  tuition_out integer,
  net_price integer,
  completion_rate real,
  median_earnings integer,
  program_shares jsonb not null default '{}',
  source_retrieved_at date not null
);
create index colleges_state on colleges (state);

create table college_shortlist (
  user_id uuid not null references app_users (id) on delete cascade,
  college_id integer not null references colleges (id) on delete cascade,
  tag text not null default 'considering' check (tag in ('top_choice', 'considering', 'visit_planned', 'applying')),
  note text not null default '',
  created_at timestamptz not null default now(),
  primary key (user_id, college_id)
);

create table submissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_users (id) on delete cascade,
  url text not null,
  normalized_url text not null,
  type text,
  title text,
  notes text not null default '',
  correction_of uuid references opportunities (id) on delete set null,
  status text not null default 'draft' check (status in ('draft', 'pending', 'needs_changes', 'approved', 'rejected', 'duplicate')),
  extracted jsonb,
  evidence jsonb,
  source_title text,
  fetched_at timestamptz,
  reviewer_id uuid references app_users (id) on delete set null,
  decision_reason text,
  decided_at timestamptz,
  opportunity_id uuid references opportunities (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, normalized_url)
);
create index submissions_status on submissions (status, created_at);

create table advisor_threads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_users (id) on delete cascade,
  task text not null,
  title text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index advisor_threads_user on advisor_threads (user_id, updated_at desc);

create table advisor_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references advisor_threads (id) on delete cascade,
  user_id uuid not null references app_users (id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content jsonb not null,
  tier text,
  provider_request_id text,
  created_at timestamptz not null default now()
);
create index advisor_messages_thread on advisor_messages (thread_id, created_at);

-- Durable idempotency and rate limiting for every billable AI or search call.
create table provider_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_users (id) on delete cascade,
  request_id uuid not null,
  kind text not null,
  status text not null default 'pending' check (status in ('pending', 'succeeded', 'failed', 'unknown')),
  http_status integer,
  provider_request_id text,
  created_at timestamptz not null default now(),
  unique (user_id, request_id)
);
create index provider_requests_user on provider_requests (user_id, created_at);

-- Append-only reward ledger. Points have no cash value.
create table reward_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_users (id) on delete cascade,
  kind text not null check (kind in ('contribution', 'correction', 'adjustment')),
  points integer not null,
  reason text not null,
  reference text,
  idempotency_key text not null unique,
  created_by uuid references app_users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index reward_transactions_user on reward_transactions (user_id, created_at);

create table audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references app_users (id) on delete set null,
  action text not null,
  target_type text,
  target_id text,
  detail jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index audit_events_created on audit_events (created_at desc);

-- Row-level security with no policies: only the server's own database role (the table owner) reads and writes.
alter table app_users enable row level security;
alter table publik_users enable row level security;
alter table publik_own_keys enable row level security;
alter table profiles enable row level security;
alter table activities enable row level security;
alter table opportunities enable row level security;
alter table opportunity_evidence enable row level security;
alter table saved_items enable row level security;
alter table tasks enable row level security;
alter table colleges enable row level security;
alter table college_shortlist enable row level security;
alter table submissions enable row level security;
alter table advisor_threads enable row level security;
alter table advisor_messages enable row level security;
alter table provider_requests enable row level security;
alter table reward_transactions enable row level security;
alter table audit_events enable row level security;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on all tables in schema public from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on all tables in schema public from authenticated';
  end if;
end
$$;
