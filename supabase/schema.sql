create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.pairs (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'ふたりの家計簿',
  invite_code_hash text not null unique,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.pair_members (
  id uuid primary key default gen_random_uuid(),
  pair_id uuid not null references public.pairs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  unique (pair_id, user_id)
);

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  pair_id uuid not null references public.pairs(id) on delete cascade,
  name text not null,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  amount integer not null check (amount >= 0),
  billing_cycle text not null check (billing_cycle in ('monthly', 'yearly')),
  billing_day integer not null check (billing_day between 1 and 31),
  billing_month integer not null default 1 check (billing_month between 1 and 12),
  share_type text not null check (share_type in ('percentage', 'fixed')),
  partner_share_value integer not null default 0 check (partner_share_value >= 0),
  status text not null default 'active' check (status in ('active', 'paused')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.loans (
  id uuid primary key default gen_random_uuid(),
  pair_id uuid not null references public.pairs(id) on delete cascade,
  title text not null,
  lender_user_id uuid not null references auth.users(id) on delete cascade,
  borrower_user_id uuid not null references auth.users(id) on delete cascade,
  principal_amount integer not null check (principal_amount >= 0),
  borrowed_at date not null,
  due_date date not null,
  repayment_type text not null check (repayment_type in ('lump_sum', 'installment', 'flexible')),
  installment_count integer not null default 1 check (installment_count >= 1),
  monthly_amount integer not null default 0 check (monthly_amount >= 0),
  repayment_day integer not null default 25 check (repayment_day between 1 and 31),
  status text not null default 'active' check (status in ('active', 'paid', 'overdue', 'canceled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.loan_repayments (
  id uuid primary key default gen_random_uuid(),
  loan_id uuid not null references public.loans(id) on delete cascade,
  paid_at date not null,
  amount integer not null check (amount > 0),
  method text not null default '送金',
  created_by uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.personal_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in ('income', 'expense')),
  title text not null,
  amount integer not null check (amount >= 0),
  entry_date date not null,
  category text not null default 'その他',
  source text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at before update on public.profiles
for each row execute function public.touch_updated_at();

drop trigger if exists subscriptions_touch_updated_at on public.subscriptions;
create trigger subscriptions_touch_updated_at before update on public.subscriptions
for each row execute function public.touch_updated_at();

drop trigger if exists loans_touch_updated_at on public.loans;
create trigger loans_touch_updated_at before update on public.loans
for each row execute function public.touch_updated_at();

drop trigger if exists personal_entries_touch_updated_at on public.personal_entries;
create trigger personal_entries_touch_updated_at before update on public.personal_entries
for each row execute function public.touch_updated_at();

create or replace function public.is_pair_member(pair_uuid uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.pair_members pm
    where pm.pair_id = pair_uuid
      and pm.user_id = auth.uid()
  );
$$;

create or replace function public.is_user_in_pair(pair_uuid uuid, member_uuid uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.pair_members pm
    where pm.pair_id = pair_uuid
      and pm.user_id = member_uuid
  );
$$;

create or replace view public.pair_member_profiles as
select
  pm.pair_id,
  pm.user_id,
  coalesce(nullif(p.display_name, ''), 'メンバー') as display_name,
  pm.role,
  pm.joined_at
from public.pair_members pm
left join public.profiles p on p.id = pm.user_id
where public.is_pair_member(pm.pair_id);

create or replace function public.create_pair_with_invite_hash(
  pair_name text,
  invite_hash text,
  display_name_input text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_pair_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  insert into public.profiles (id, display_name)
  values (auth.uid(), coalesce(nullif(display_name_input, ''), '私'))
  on conflict (id) do update set display_name = excluded.display_name;

  insert into public.pairs (name, invite_code_hash, created_by)
  values (coalesce(nullif(pair_name, ''), 'ふたりの家計簿'), invite_hash, auth.uid())
  returning id into new_pair_id;

  insert into public.pair_members (pair_id, user_id, role)
  values (new_pair_id, auth.uid(), 'owner');

  return new_pair_id;
end;
$$;

create or replace function public.join_pair_with_invite_hash(
  invite_hash text,
  display_name_input text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  target_pair_id uuid;
  member_count integer;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select id into target_pair_id
  from public.pairs
  where invite_code_hash = invite_hash
  limit 1;

  if target_pair_id is null then
    raise exception '招待コードが見つかりません';
  end if;

  select count(*) into member_count
  from public.pair_members
  where pair_id = target_pair_id;

  if member_count >= 2 and not public.is_pair_member(target_pair_id) then
    raise exception 'このペアはすでに2人で利用中です';
  end if;

  insert into public.profiles (id, display_name)
  values (auth.uid(), coalesce(nullif(display_name_input, ''), '相方'))
  on conflict (id) do update set display_name = excluded.display_name;

  insert into public.pair_members (pair_id, user_id, role)
  values (target_pair_id, auth.uid(), 'member')
  on conflict (pair_id, user_id) do nothing;

  return target_pair_id;
end;
$$;

alter table public.profiles enable row level security;
alter table public.pairs enable row level security;
alter table public.pair_members enable row level security;
alter table public.subscriptions enable row level security;
alter table public.loans enable row level security;
alter table public.loan_repayments enable row level security;
alter table public.personal_entries enable row level security;

drop policy if exists "profiles self select" on public.profiles;
create policy "profiles self select" on public.profiles
for select using (id = auth.uid());

drop policy if exists "profiles self upsert" on public.profiles;
create policy "profiles self upsert" on public.profiles
for all using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists "pairs member select" on public.pairs;
create policy "pairs member select" on public.pairs
for select using (public.is_pair_member(id));

drop policy if exists "pair_members member select" on public.pair_members;
create policy "pair_members member select" on public.pair_members
for select using (public.is_pair_member(pair_id));

drop policy if exists "subscriptions member select" on public.subscriptions;
create policy "subscriptions member select" on public.subscriptions
for select using (public.is_pair_member(pair_id));

drop policy if exists "subscriptions member insert" on public.subscriptions;
create policy "subscriptions member insert" on public.subscriptions
for insert with check (
  public.is_pair_member(pair_id)
  and public.is_user_in_pair(pair_id, owner_user_id)
);

drop policy if exists "subscriptions member update" on public.subscriptions;
create policy "subscriptions member update" on public.subscriptions
for update using (public.is_pair_member(pair_id))
with check (
  public.is_pair_member(pair_id)
  and public.is_user_in_pair(pair_id, owner_user_id)
);

drop policy if exists "loans member select" on public.loans;
create policy "loans member select" on public.loans
for select using (public.is_pair_member(pair_id));

drop policy if exists "loans member insert" on public.loans;
create policy "loans member insert" on public.loans
for insert with check (
  public.is_pair_member(pair_id)
  and public.is_user_in_pair(pair_id, lender_user_id)
  and public.is_user_in_pair(pair_id, borrower_user_id)
);

drop policy if exists "loans member update" on public.loans;
create policy "loans member update" on public.loans
for update using (public.is_pair_member(pair_id))
with check (
  public.is_pair_member(pair_id)
  and public.is_user_in_pair(pair_id, lender_user_id)
  and public.is_user_in_pair(pair_id, borrower_user_id)
);

drop policy if exists "loan_repayments member select" on public.loan_repayments;
create policy "loan_repayments member select" on public.loan_repayments
for select using (
  exists (
    select 1 from public.loans l
    where l.id = loan_id and public.is_pair_member(l.pair_id)
  )
);

drop policy if exists "loan_repayments member insert" on public.loan_repayments;
create policy "loan_repayments member insert" on public.loan_repayments
for insert with check (
  exists (
    select 1 from public.loans l
    where l.id = loan_id and public.is_pair_member(l.pair_id)
  )
);

drop policy if exists "personal entries self select" on public.personal_entries;
create policy "personal entries self select" on public.personal_entries
for select using (user_id = auth.uid());

drop policy if exists "personal entries self insert" on public.personal_entries;
create policy "personal entries self insert" on public.personal_entries
for insert with check (user_id = auth.uid());

drop policy if exists "personal entries self update" on public.personal_entries;
create policy "personal entries self update" on public.personal_entries
for update using (user_id = auth.uid()) with check (user_id = auth.uid());

grant usage on schema public to anon, authenticated;
grant select on public.pair_member_profiles to authenticated;
grant execute on function public.create_pair_with_invite_hash(text, text, text) to authenticated;
grant execute on function public.join_pair_with_invite_hash(text, text) to authenticated;
