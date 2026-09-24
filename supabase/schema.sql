-- Bite schema. Idempotent: safe to run more than once.
-- Every table is protected by row-level security: a user can only ever read
-- or write their own rows, and only while their email is on the invite list.

-- ---------------------------------------------------------------- invites
create table if not exists public.allowed_emails (
  email text primary key check (email = lower(email)),
  role text not null default 'member' check (role in ('owner', 'member')),
  invited_by text,
  created_at timestamptz not null default now()
);
alter table public.allowed_emails enable row level security;

-- Helpers (security definer so policies can consult the invite list).
create or replace function public.current_email() returns text
language sql stable as $$ select lower(coalesce(auth.jwt() ->> 'email', '')) $$;

create or replace function public.is_invited() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.allowed_emails where email = public.current_email())
$$;

create or replace function public.is_owner() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.allowed_emails where email = public.current_email() and role = 'owner')
$$;

drop policy if exists "read own or all if owner" on public.allowed_emails;
create policy "read own or all if owner" on public.allowed_emails for select
  using (email = public.current_email() or public.is_owner());
drop policy if exists "owner invites" on public.allowed_emails;
create policy "owner invites" on public.allowed_emails for insert
  with check (public.is_owner() and role = 'member');
drop policy if exists "owner removes members" on public.allowed_emails;
create policy "owner removes members" on public.allowed_emails for delete
  using (public.is_owner() and role = 'member');

-- Block sign-ups from emails that aren't invited.
create or replace function public.enforce_invite() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.allowed_emails where email = lower(new.email)) then
    raise exception 'BITE_NOT_INVITED';
  end if;
  return new;
end $$;
drop trigger if exists enforce_invite on auth.users;
create trigger enforce_invite before insert on auth.users
  for each row execute function public.enforce_invite();

-- Server-assigned timestamps drive sync (never trust device clocks).
create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$ begin new.updated_at = clock_timestamp(); return new; end $$;

-- ---------------------------------------------------------------- data
create table if not exists public.profiles (
  user_id uuid primary key default auth.uid() references auth.users on delete cascade,
  profile jsonb,
  overrides jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default clock_timestamp()
);

create table if not exists public.log_items (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  date date not null,
  item jsonb not null,
  deleted boolean not null default false,
  updated_at timestamptz not null default clock_timestamp()
);
create index if not exists log_items_user_updated on public.log_items (user_id, updated_at);

create table if not exists public.my_foods (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  key text not null,
  food jsonb,
  deleted boolean not null default false,
  updated_at timestamptz not null default clock_timestamp(),
  primary key (user_id, key)
);
create index if not exists my_foods_user_updated on public.my_foods (user_id, updated_at);

-- Small keyed records: weigh-ins (key = date), saved meals, recipes, the
-- coach's memory and chat history. Size-capped so one row can't grow unbounded.
create table if not exists public.records (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  kind text not null check (kind in ('weight', 'meal', 'recipe', 'memory', 'chat')),
  key text not null check (length(key) between 1 and 100),
  data jsonb check (data is null or pg_column_size(data) <= 65536),
  deleted boolean not null default false,
  updated_at timestamptz not null default clock_timestamp(),
  primary key (user_id, kind, key)
);
create index if not exists records_user_updated on public.records (user_id, updated_at);

do $$
declare t text;
begin
  foreach t in array array['profiles', 'log_items', 'my_foods', 'records'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop trigger if exists touch on public.%I', t);
    execute format('create trigger touch before insert or update on public.%I for each row execute function public.touch_updated_at()', t);
    execute format('drop policy if exists "own rows" on public.%I', t);
    execute format(
      'create policy "own rows" on public.%I for all using (user_id = auth.uid() and public.is_invited()) with check (user_id = auth.uid() and public.is_invited())',
      t
    );
  end loop;
end $$;


-- ---------------------------------------------------------------- AI rate limits
-- Token bucket per user and route (refills per minute) plus a daily cap, so
-- limits hold across every serverless instance. Only reachable through
-- take_token(), which always acts on the caller's own row.
create table if not exists public.rate_limits (
  user_id uuid not null references auth.users on delete cascade,
  route text not null,
  tokens double precision not null,
  refilled_at timestamptz not null,
  day date not null,
  day_count integer not null default 0,
  primary key (user_id, route)
);
alter table public.rate_limits enable row level security; -- no policies: direct access denied

create or replace function public.take_token(p_route text, p_per_minute integer, p_per_day integer)
returns text
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  now_ts timestamptz := clock_timestamp();
  today date := (now_ts at time zone 'utc')::date;
  r public.rate_limits%rowtype;
begin
  if uid is null or not public.is_invited() then return 'denied'; end if;
  if p_per_minute < 1 or p_per_day < 1 or length(p_route) > 40 then return 'denied'; end if;

  insert into public.rate_limits as rl (user_id, route, tokens, refilled_at, day, day_count)
  values (uid, p_route, p_per_minute, now_ts, today, 0)
  on conflict (user_id, route) do update set
    tokens = least(p_per_minute, rl.tokens + extract(epoch from (now_ts - rl.refilled_at)) / 60.0 * p_per_minute),
    refilled_at = now_ts,
    day = today,
    day_count = case when rl.day = today then rl.day_count else 0 end
  returning * into r;

  if r.day_count >= p_per_day then return 'day'; end if;
  if r.tokens < 1 then return 'minute'; end if;
  update public.rate_limits set tokens = tokens - 1, day_count = day_count + 1 where user_id = uid and route = p_route;
  return 'ok';
end $$;

revoke all on function public.take_token(text, integer, integer) from public, anon;
grant execute on function public.take_token(text, integer, integer) to authenticated;
