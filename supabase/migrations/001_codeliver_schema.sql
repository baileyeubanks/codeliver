-- Co-Deliver Schema
-- Run this in Supabase SQL Editor

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ═══════════════════════════════════════════════════
-- 1. Projects
-- ═══════════════════════════════════════════════════
create table if not exists projects (
  id uuid primary key default uuid_generate_v4(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  description text,
  status text not null default 'active' check (status in ('active', 'archived', 'completed')),
  thumbnail_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table projects enable row level security;
create policy "Users see own projects" on projects for select using (auth.uid() = owner_id);
create policy "Users insert own projects" on projects for insert with check (auth.uid() = owner_id);
create policy "Users update own projects" on projects for update using (auth.uid() = owner_id);
create policy "Users delete own projects" on projects for delete using (auth.uid() = owner_id);

-- ═══════════════════════════════════════════════════
-- 2. Assets (files within projects)
-- ═══════════════════════════════════════════════════
create table if not exists assets (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid not null references projects(id) on delete cascade,
  title text not null,
  file_type text not null default 'video' check (file_type in ('video', 'image', 'audio', 'document', 'other')),
  file_url text,
  thumbnail_url text,
  file_size bigint,
  duration_seconds float,
  status text not null default 'draft' check (status in ('draft', 'in_review', 'approved', 'needs_changes', 'final')),
  metadata jsonb default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table assets enable row level security;
create policy "Assets visible to project owner" on assets for select
  using (exists (select 1 from projects where projects.id = assets.project_id and projects.owner_id = auth.uid()));
create policy "Assets insertable by project owner" on assets for insert
  with check (exists (select 1 from projects where projects.id = assets.project_id and projects.owner_id = auth.uid()));
create policy "Assets updatable by project owner" on assets for update
  using (exists (select 1 from projects where projects.id = assets.project_id and projects.owner_id = auth.uid()));
create policy "Assets deletable by project owner" on assets for delete
  using (exists (select 1 from projects where projects.id = assets.project_id and projects.owner_id = auth.uid()));

-- ═══════════════════════════════════════════════════
-- 3. Versions (version history per asset)
-- ═══════════════════════════════════════════════════
create table if not exists versions (
  id uuid primary key default uuid_generate_v4(),
  asset_id uuid not null references assets(id) on delete cascade,
  version_number int not null default 1,
  file_url text not null,
  file_size bigint,
  notes text,
  uploaded_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique (asset_id, version_number)
);

alter table versions enable row level security;
create policy "Versions visible to project owner" on versions for select
  using (exists (
    select 1 from assets join projects on projects.id = assets.project_id
    where assets.id = versions.asset_id and projects.owner_id = auth.uid()
  ));
create policy "Versions insertable by project owner" on versions for insert
  with check (exists (
    select 1 from assets join projects on projects.id = assets.project_id
    where assets.id = versions.asset_id and projects.owner_id = auth.uid()
  ));

-- ═══════════════════════════════════════════════════
-- 4. Reviews (review sessions)
-- ═══════════════════════════════════════════════════
create table if not exists reviews (
  id uuid primary key default uuid_generate_v4(),
  asset_id uuid not null references assets(id) on delete cascade,
  version_id uuid references versions(id),
  title text not null default 'Review',
  status text not null default 'open' check (status in ('open', 'completed', 'cancelled')),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table reviews enable row level security;
create policy "Reviews visible to project owner" on reviews for select
  using (exists (
    select 1 from assets join projects on projects.id = assets.project_id
    where assets.id = reviews.asset_id and projects.owner_id = auth.uid()
  ));
create policy "Reviews insertable by project owner" on reviews for insert
  with check (exists (
    select 1 from assets join projects on projects.id = assets.project_id
    where assets.id = reviews.asset_id and projects.owner_id = auth.uid()
  ));
create policy "Reviews updatable by project owner" on reviews for update
  using (exists (
    select 1 from assets join projects on projects.id = assets.project_id
    where assets.id = reviews.asset_id and projects.owner_id = auth.uid()
  ));

-- ═══════════════════════════════════════════════════
-- 5. Comments (timecoded + spatial)
-- ═══════════════════════════════════════════════════
create table if not exists comments (
  id uuid primary key default uuid_generate_v4(),
  review_id uuid references reviews(id) on delete cascade,
  asset_id uuid not null references assets(id) on delete cascade,
  parent_id uuid references comments(id) on delete cascade,
  author_name text not null default 'Anonymous',
  author_email text,
  author_id uuid references auth.users(id),
  body text not null,
  timecode_seconds float,
  pin_x float,
  pin_y float,
  status text not null default 'open' check (status in ('open', 'resolved', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table comments enable row level security;
create policy "Comments visible to project owner" on comments for select
  using (exists (
    select 1 from assets join projects on projects.id = assets.project_id
    where assets.id = comments.asset_id and projects.owner_id = auth.uid()
  ));
create policy "Comments insertable by anyone" on comments for insert
  with check (true);
create policy "Comments updatable by project owner" on comments for update
  using (exists (
    select 1 from assets join projects on projects.id = assets.project_id
    where assets.id = comments.asset_id and projects.owner_id = auth.uid()
  ));

-- ═══════════════════════════════════════════════════
-- 6. Approvals (workflow gates)
-- ═══════════════════════════════════════════════════
create table if not exists approvals (
  id uuid primary key default uuid_generate_v4(),
  asset_id uuid not null references assets(id) on delete cascade,
  step_order int not null default 1,
  role_label text not null,
  assignee_email text,
  assignee_id uuid references auth.users(id),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'changes_requested')),
  decision_note text,
  decided_at timestamptz,
  created_at timestamptz not null default now()
);

alter table approvals enable row level security;
create policy "Approvals visible to project owner" on approvals for select
  using (exists (
    select 1 from assets join projects on projects.id = assets.project_id
    where assets.id = approvals.asset_id and projects.owner_id = auth.uid()
  ));
create policy "Approvals insertable by project owner" on approvals for insert
  with check (exists (
    select 1 from assets join projects on projects.id = assets.project_id
    where assets.id = approvals.asset_id and projects.owner_id = auth.uid()
  ));
create policy "Approvals updatable by project owner or assignee" on approvals for update
  using (
    exists (
      select 1 from assets join projects on projects.id = assets.project_id
      where assets.id = approvals.asset_id and projects.owner_id = auth.uid()
    )
    or assignee_id = auth.uid()
  );

-- ═══════════════════════════════════════════════════
-- 7. Review Invites (shareable review links)
-- ═══════════════════════════════════════════════════
create table if not exists review_invites (
  id uuid primary key default uuid_generate_v4(),
  asset_id uuid not null references assets(id) on delete cascade,
  token text not null unique,
  password_hash text,
  reviewer_name text,
  reviewer_email text,
  permissions text not null default 'comment' check (permissions in ('view', 'comment', 'approve')),
  expires_at timestamptz,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

alter table review_invites enable row level security;
create policy "Invites visible to project owner" on review_invites for select
  using (exists (
    select 1 from assets join projects on projects.id = assets.project_id
    where assets.id = review_invites.asset_id and projects.owner_id = auth.uid()
  ));
create policy "Invites public by token" on review_invites for select
  using (true);
create policy "Invites insertable by project owner" on review_invites for insert
  with check (exists (
    select 1 from assets join projects on projects.id = assets.project_id
    where assets.id = review_invites.asset_id and projects.owner_id = auth.uid()
  ));

-- ═══════════════════════════════════════════════════
-- 8. Activity Log
-- ═══════════════════════════════════════════════════
create table if not exists activity_log (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid references projects(id) on delete cascade,
  asset_id uuid references assets(id) on delete cascade,
  actor_id uuid references auth.users(id),
  actor_name text,
  action text not null,
  details jsonb default '{}',
  created_at timestamptz not null default now()
);

alter table activity_log enable row level security;
create policy "Activity visible to project owner" on activity_log for select
  using (
    exists (select 1 from projects where projects.id = activity_log.project_id and projects.owner_id = auth.uid())
  );
create policy "Activity insertable" on activity_log for insert with check (true);

-- ═══════════════════════════════════════════════════
-- Indexes
-- ═══════════════════════════════════════════════════
create index if not exists idx_assets_project on assets(project_id);
create index if not exists idx_versions_asset on versions(asset_id);
create index if not exists idx_comments_asset on comments(asset_id);
create index if not exists idx_comments_review on comments(review_id);
create index if not exists idx_approvals_asset on approvals(asset_id);
create index if not exists idx_review_invites_token on review_invites(token);
create index if not exists idx_activity_project on activity_log(project_id);
create index if not exists idx_activity_asset on activity_log(asset_id);

-- ═══════════════════════════════════════════════════
-- Updated_at triggers
-- ═══════════════════════════════════════════════════
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_projects_updated before update on projects for each row execute function update_updated_at();
create trigger trg_assets_updated before update on assets for each row execute function update_updated_at();
create trigger trg_reviews_updated before update on reviews for each row execute function update_updated_at();
create trigger trg_comments_updated before update on comments for each row execute function update_updated_at();

-- ═══════════════════════════════════════════════════
-- Storage bucket
-- ═══════════════════════════════════════════════════
insert into storage.buckets (id, name, public) values ('deliverables', 'deliverables', true)
on conflict (id) do nothing;
