-- Transcode jobs queue — tracks FFmpeg processing of uploaded media
-- Assets go: upload complete → processing → ready (or failed)

create table if not exists transcode_jobs (
  id uuid primary key default uuid_generate_v4(),
  asset_id uuid not null references assets(id) on delete cascade,
  version_id uuid references versions(id) on delete set null,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'completed', 'failed', 'cancelled')),
  input_path text not null,           -- NAS path to original file
  output_hls_path text,               -- NAS path to HLS directory
  output_thumbnail_path text,         -- NAS path to thumbnail strip
  output_waveform_path text,          -- NAS path to waveform PNG (audio/video)
  duration_seconds float,             -- detected duration
  resolution text,                    -- e.g. "1920x1080"
  codec text,                         -- e.g. "h264", "hevc"
  fps float,                          -- detected framerate
  error_message text,                 -- on failure
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Index for queue polling
create index if not exists idx_transcode_jobs_status on transcode_jobs(status);
create index if not exists idx_transcode_jobs_asset on transcode_jobs(asset_id);

-- Add processing status to assets check constraint
-- (The existing check may not include 'processing' — add it gracefully)
alter table assets drop constraint if exists assets_status_check;
alter table assets add constraint assets_status_check
  check (status in ('draft', 'in_review', 'approved', 'needs_changes', 'final', 'processing', 'ready', 'failed'));

-- Add proxy/HLS URL column to assets
alter table assets add column if not exists proxy_url text;
alter table assets add column if not exists nas_path text;
alter table assets add column if not exists uploaded_by uuid references auth.users(id);
