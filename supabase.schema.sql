create table if not exists public.habit_whale_data (
  user_id uuid primary key references auth.users(id) on delete cascade,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.habit_whale_data enable row level security;

create policy "habit whale users can read own data"
on public.habit_whale_data
for select
using (auth.uid() = user_id);

create policy "habit whale users can insert own data"
on public.habit_whale_data
for insert
with check (auth.uid() = user_id);

create policy "habit whale users can update own data"
on public.habit_whale_data
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
