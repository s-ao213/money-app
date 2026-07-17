create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.pairs (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'ふたりの家計簿',
  icon_url text,
  invite_code_hash text not null unique,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  dissolution_requested_by uuid references auth.users(id) on delete set null,
  dissolution_requested_at timestamptz
);

create table if not exists public.pair_members (
  id uuid primary key default gen_random_uuid(),
  pair_id uuid not null references public.pairs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  display_name text not null default '',
  joined_at timestamptz not null default now(),
  ended_at timestamptz,
  unique (pair_id, user_id)
);

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  pair_id uuid references public.pairs(id) on delete cascade,
  created_by uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  is_shared boolean not null default true,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  payer_user_id uuid not null references auth.users(id) on delete cascade,
  amount integer not null check (amount >= 0),
  billing_cycle text not null check (billing_cycle in ('weekly', 'monthly', 'yearly')),
  renewal_day integer not null default 1 check (renewal_day between 1 and 31),
  renewal_month integer not null default 1 check (renewal_month between 1 and 12),
  renewal_weekday integer not null default 1 check (renewal_weekday between 0 and 6),
  billing_day integer not null check (billing_day between 1 and 31),
  billing_month integer not null default 1 check (billing_month between 1 and 12),
  billing_weekday integer not null default 1 check (billing_weekday between 0 and 6),
  share_type text not null check (share_type in ('percentage', 'fixed')),
  partner_share_value integer not null default 0 check (partner_share_value >= 0),
  status text not null default 'active' check (status in ('active', 'paused', 'ended')),
  stop_billing_from date,
  memo text not null default '',
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
  repayment_day_mode text not null default 'day' check (repayment_day_mode in ('day', 'payday')),
  repayment_workplace_id uuid references public.workplaces(id) on delete set null,
  memo text not null default '',
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
  entry_status text not null default 'confirmed' check (entry_status in ('planned', 'confirmed')),
  title text not null,
  amount integer not null check (amount >= 0),
  entry_date date not null,
  category text not null default 'その他',
  source text not null default '',
  source_type text not null default 'manual' check (source_type in ('manual', 'subscription', 'loan', 'repayment')),
  source_id uuid,
  period_key text,
  scheduled_date date,
  excluded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.personal_categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  pair_id uuid references public.pairs(id) on delete cascade,
  type text not null check (type in ('income', 'expense')),
  name text not null check (char_length(trim(name)) between 1 and 50),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.workplaces (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 80),
  payday_day integer check (payday_day between 1 and 31),
  payday_is_month_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (payday_is_month_end or payday_day is not null)
);

alter table public.profiles add column if not exists avatar_url text;
alter table public.pairs add column if not exists icon_url text;
alter table public.pairs add column if not exists deleted_at timestamptz;
alter table public.pairs add column if not exists dissolution_requested_by uuid references auth.users(id) on delete set null;
alter table public.pairs add column if not exists dissolution_requested_at timestamptz;
alter table public.pair_members add column if not exists display_name text not null default '';
alter table public.pair_members add column if not exists ended_at timestamptz;
update public.pair_members pm
set ended_at = coalesce(pm.ended_at, p.deleted_at)
from public.pairs p
where p.id = pm.pair_id and p.deleted_at is not null and pm.ended_at is null;
alter table public.subscriptions alter column pair_id drop not null;
alter table public.subscriptions add column if not exists created_by uuid default auth.uid() references auth.users(id) on delete cascade;
alter table public.subscriptions add column if not exists is_shared boolean not null default true;
alter table public.subscriptions add column if not exists payer_user_id uuid references auth.users(id) on delete cascade;
alter table public.subscriptions add column if not exists renewal_day integer not null default 1;
alter table public.subscriptions add column if not exists renewal_month integer not null default 1;
alter table public.subscriptions add column if not exists renewal_weekday integer not null default 1;
alter table public.subscriptions add column if not exists billing_weekday integer not null default 1;
alter table public.subscriptions add column if not exists stop_billing_from date;
alter table public.subscriptions add column if not exists memo text not null default '';
update public.subscriptions set created_by = owner_user_id where created_by is null;
update public.subscriptions set payer_user_id = owner_user_id where payer_user_id is null;
alter table public.subscriptions alter column created_by set not null;
alter table public.subscriptions alter column payer_user_id set not null;
alter table public.loans add column if not exists repayment_day_mode text not null default 'day';
alter table public.loans add column if not exists repayment_workplace_id uuid references public.workplaces(id) on delete set null;
alter table public.loans add column if not exists memo text not null default '';
alter table public.personal_entries add column if not exists entry_status text not null default 'confirmed';
alter table public.personal_entries add column if not exists source_type text not null default 'manual';
alter table public.personal_entries add column if not exists source_id uuid;
alter table public.personal_entries add column if not exists period_key text;
alter table public.personal_entries add column if not exists scheduled_date date;
alter table public.personal_entries add column if not exists excluded_at timestamptz;

create unique index if not exists personal_categories_private_name_unique
on public.personal_categories (user_id, type, name)
where pair_id is null;

create unique index if not exists personal_categories_shared_name_unique
on public.personal_categories (pair_id, type, name)
where pair_id is not null;

create unique index if not exists personal_entries_generated_unique
on public.personal_entries (user_id, source_type, source_id, period_key, scheduled_date)
where source_type <> 'manual' and source_id is not null and period_key is not null and scheduled_date is not null;

-- A user can belong to only one active pair while historical memberships remain readable.
drop index if exists public.pair_members_user_unique;
create unique index if not exists pair_members_active_user_unique
on public.pair_members (user_id)
where ended_at is null;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = public
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

drop trigger if exists personal_categories_touch_updated_at on public.personal_categories;
create trigger personal_categories_touch_updated_at before update on public.personal_categories
for each row execute function public.touch_updated_at();

drop trigger if exists workplaces_touch_updated_at on public.workplaces;
create trigger workplaces_touch_updated_at before update on public.workplaces
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

create or replace function public.is_active_pair_member(pair_uuid uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.pair_members pm
    join public.pairs p on p.id = pm.pair_id
    where pm.pair_id = pair_uuid
      and pm.user_id = auth.uid()
      and pm.ended_at is null
      and p.deleted_at is null
  );
$$;

create or replace view public.pair_member_profiles
with (security_invoker = true)
as
select
  pm.pair_id,
  pm.user_id,
  coalesce(nullif(pm.display_name, ''), nullif(p.display_name, ''), 'メンバー') as display_name,
  pm.role,
  pm.joined_at,
  pm.ended_at
from public.pair_members pm
left join public.profiles p on p.id = pm.user_id
where public.is_pair_member(pm.pair_id);

create or replace function public.create_pair_with_invite_hash(
  pair_name text,
  invite_hash text,
  display_name_input text,
  icon_url_input text default null
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

  if exists (select 1 from public.pair_members where user_id = auth.uid() and ended_at is null) then
    raise exception 'すでにペアへ登録されています';
  end if;

  insert into public.profiles (id, display_name)
  values (auth.uid(), coalesce(nullif(display_name_input, ''), '私'))
  on conflict (id) do update set display_name = excluded.display_name;

  insert into public.pairs (name, icon_url, invite_code_hash, created_by)
  values (coalesce(nullif(pair_name, ''), 'ふたりの家計簿'), icon_url_input, invite_hash, auth.uid())
  returning id into new_pair_id;

  insert into public.pair_members (pair_id, user_id, role, display_name)
  values (new_pair_id, auth.uid(), 'owner', coalesce(nullif(display_name_input, ''), '私'));

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

  if exists (select 1 from public.pair_members where user_id = auth.uid() and ended_at is null) then
    raise exception 'すでにペアへ登録されています';
  end if;

  select id into target_pair_id
  from public.pairs
  where invite_code_hash = invite_hash
    and deleted_at is null
  limit 1;

  if target_pair_id is null then
    raise exception '招待コードが見つかりません';
  end if;

  select count(*) into member_count
  from public.pair_members
  where pair_id = target_pair_id
    and ended_at is null;

  if member_count >= 2 and not public.is_pair_member(target_pair_id) then
    raise exception 'このペアはすでに2人で利用中です';
  end if;

  insert into public.profiles (id, display_name)
  values (auth.uid(), coalesce(nullif(display_name_input, ''), '相方'))
  on conflict (id) do update set display_name = excluded.display_name;

  insert into public.pair_members (pair_id, user_id, role, display_name)
  values (target_pair_id, auth.uid(), 'member', coalesce(nullif(display_name_input, ''), '相方'))
  on conflict (pair_id, user_id) do nothing;

  return target_pair_id;
end;
$$;

create or replace function public.update_pair_settings(
  pair_id_input uuid,
  pair_name text,
  icon_url_input text,
  display_name_input text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if not public.is_active_pair_member(pair_id_input) then
    raise exception '有効なペアのメンバーではありません';
  end if;

  update public.pairs
  set name = coalesce(nullif(trim(pair_name), ''), 'ふたりの家計簿'),
      icon_url = nullif(trim(icon_url_input), '')
  where id = pair_id_input and deleted_at is null;

  update public.pair_members
  set display_name = coalesce(nullif(trim(display_name_input), ''), 'メンバー')
  where pair_id = pair_id_input and user_id = auth.uid() and ended_at is null;
end;
$$;

create or replace function public.request_or_confirm_pair_dissolution(pair_id_input uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  pair_record public.pairs%rowtype;
  active_member_count integer;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if not public.is_active_pair_member(pair_id_input) then
    raise exception '有効なペアのメンバーではありません';
  end if;

  select * into pair_record
  from public.pairs
  where id = pair_id_input and deleted_at is null
  for update;

  if not found then
    raise exception '有効なペアが見つかりません';
  end if;

  select count(*) into active_member_count
  from public.pair_members
  where pair_id = pair_id_input and ended_at is null;

  if active_member_count <= 1 then
    update public.pairs set deleted_at = now(), dissolution_requested_by = null, dissolution_requested_at = null
    where id = pair_id_input;
    update public.pair_members set ended_at = now()
    where pair_id = pair_id_input and ended_at is null;
    return 'dissolved';
  end if;

  if pair_record.dissolution_requested_by is null then
    update public.pairs
    set dissolution_requested_by = auth.uid(), dissolution_requested_at = now()
    where id = pair_id_input;
    return 'requested';
  end if;

  if pair_record.dissolution_requested_by = auth.uid() then
    return 'pending';
  end if;

  update public.pairs
  set deleted_at = now(), dissolution_requested_by = null, dissolution_requested_at = null
  where id = pair_id_input;
  update public.pair_members set ended_at = now()
  where pair_id = pair_id_input and ended_at is null;
  return 'dissolved';
end;
$$;

create or replace function public.cancel_pair_dissolution(pair_id_input uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  update public.pairs
  set dissolution_requested_by = null, dissolution_requested_at = null
  where id = pair_id_input
    and deleted_at is null
    and dissolution_requested_by = auth.uid()
    and public.is_active_pair_member(pair_id_input);

  if not found then
    raise exception '解消申請を取り消せません';
  end if;
end;
$$;

create or replace function public.regenerate_pair_invite_hash(
  pair_id_input uuid,
  invite_hash text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  member_count integer;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if invite_hash !~ '^[0-9a-f]{64}$' then
    raise exception '招待コードの形式が正しくありません';
  end if;

  if not public.is_pair_member(pair_id_input) then
    raise exception 'このペアを変更する権限がありません';
  end if;

  select count(*) into member_count
  from public.pair_members
  where pair_id = pair_id_input;

  if member_count >= 2 then
    raise exception 'このペアはすでに2人で利用中です';
  end if;

  update public.pairs
  set invite_code_hash = invite_hash
  where id = pair_id_input;
end;
$$;

alter table public.profiles enable row level security;
alter table public.pairs enable row level security;
alter table public.pair_members enable row level security;
alter table public.subscriptions enable row level security;
alter table public.loans enable row level security;
alter table public.loan_repayments enable row level security;
alter table public.personal_entries enable row level security;
alter table public.personal_categories enable row level security;
alter table public.workplaces enable row level security;

drop policy if exists "profiles self select" on public.profiles;
create policy "profiles self select" on public.profiles
for select using (id = auth.uid());

drop policy if exists "profiles self upsert" on public.profiles;
create policy "profiles self upsert" on public.profiles
for all using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists "pairs member select" on public.pairs;
create policy "pairs member select" on public.pairs
for select using (public.is_pair_member(id));

drop policy if exists "pairs member update" on public.pairs;
create policy "pairs member update" on public.pairs
for update to authenticated
using (created_by = (select auth.uid()) and deleted_at is null)
with check (created_by = (select auth.uid()));

drop policy if exists "pair_members member select" on public.pair_members;
create policy "pair_members member select" on public.pair_members
for select using (public.is_pair_member(pair_id));

drop policy if exists "pair_members self update" on public.pair_members;
create policy "pair_members self update" on public.pair_members
for update using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "subscriptions member select" on public.subscriptions;
create policy "subscriptions member select" on public.subscriptions
for select using (
  (is_shared = false and created_by = auth.uid())
  or (is_shared = true and pair_id is not null and public.is_pair_member(pair_id))
);

drop policy if exists "subscriptions member insert" on public.subscriptions;
create policy "subscriptions member insert" on public.subscriptions
for insert with check (
  created_by = auth.uid()
  and (
    (is_shared = false and pair_id is null and owner_user_id = auth.uid() and payer_user_id = auth.uid())
    or (
      is_shared = true
      and pair_id is not null
      and public.is_active_pair_member(pair_id)
      and public.is_user_in_pair(pair_id, owner_user_id)
      and public.is_user_in_pair(pair_id, payer_user_id)
    )
  )
);

drop policy if exists "subscriptions member update" on public.subscriptions;
create policy "subscriptions member update" on public.subscriptions
for update using (
  (is_shared = false and created_by = auth.uid())
  or (is_shared = true and pair_id is not null and public.is_active_pair_member(pair_id))
)
with check (
  created_by = auth.uid()
  and (
    (is_shared = false and pair_id is null and owner_user_id = auth.uid() and payer_user_id = auth.uid())
    or (
      is_shared = true
      and pair_id is not null
      and public.is_active_pair_member(pair_id)
      and public.is_user_in_pair(pair_id, owner_user_id)
      and public.is_user_in_pair(pair_id, payer_user_id)
    )
  )
);

drop policy if exists "subscriptions member delete" on public.subscriptions;
create policy "subscriptions member delete" on public.subscriptions
for delete using (
  (is_shared = false and created_by = auth.uid())
  or (is_shared = true and pair_id is not null and public.is_active_pair_member(pair_id))
);

drop policy if exists "loans member select" on public.loans;
create policy "loans member select" on public.loans
for select using (public.is_pair_member(pair_id));

drop policy if exists "loans member insert" on public.loans;
create policy "loans member insert" on public.loans
for insert with check (
  public.is_active_pair_member(pair_id)
  and public.is_user_in_pair(pair_id, lender_user_id)
  and public.is_user_in_pair(pair_id, borrower_user_id)
);

drop policy if exists "loans member update" on public.loans;
create policy "loans member update" on public.loans
for update using (public.is_active_pair_member(pair_id) and lender_user_id = auth.uid())
with check (
  public.is_active_pair_member(pair_id)
  and lender_user_id = auth.uid()
  and public.is_user_in_pair(pair_id, lender_user_id)
  and public.is_user_in_pair(pair_id, borrower_user_id)
);

drop policy if exists "loans lender delete" on public.loans;
create policy "loans lender delete" on public.loans
for delete using (public.is_active_pair_member(pair_id) and lender_user_id = auth.uid());

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
    where l.id = loan_id and public.is_pair_member(l.pair_id) and l.lender_user_id = auth.uid()
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

drop policy if exists "personal entries self delete" on public.personal_entries;
create policy "personal entries self delete" on public.personal_entries
for delete using (user_id = auth.uid());

drop policy if exists "personal categories select" on public.personal_categories;
create policy "personal categories select" on public.personal_categories
for select to authenticated
using (
  user_id = (select auth.uid())
  or (pair_id is not null and public.is_pair_member(pair_id))
);

drop policy if exists "personal categories insert" on public.personal_categories;
create policy "personal categories insert" on public.personal_categories
for insert to authenticated
with check (
  user_id = (select auth.uid())
  and (pair_id is null or public.is_active_pair_member(pair_id))
);

drop policy if exists "personal categories update" on public.personal_categories;
create policy "personal categories update" on public.personal_categories
for update to authenticated
using (user_id = (select auth.uid()))
with check (
  user_id = (select auth.uid())
  and (pair_id is null or public.is_active_pair_member(pair_id))
);

drop policy if exists "personal categories delete" on public.personal_categories;
create policy "personal categories delete" on public.personal_categories
for delete to authenticated
using (user_id = (select auth.uid()));

drop policy if exists "workplaces self select" on public.workplaces;
create policy "workplaces self select" on public.workplaces
for select to authenticated
using (user_id = (select auth.uid()));

drop policy if exists "workplaces self insert" on public.workplaces;
create policy "workplaces self insert" on public.workplaces
for insert to authenticated
with check (user_id = (select auth.uid()));

drop policy if exists "workplaces self update" on public.workplaces;
create policy "workplaces self update" on public.workplaces
for update to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

drop policy if exists "workplaces self delete" on public.workplaces;
create policy "workplaces self delete" on public.workplaces
for delete to authenticated
using (user_id = (select auth.uid()));

grant usage on schema public to anon, authenticated;
grant select, insert, update on public.profiles to authenticated;
revoke update on public.pairs from authenticated;
grant select on public.pairs to authenticated;
grant select, update on public.pair_members to authenticated;
grant select, insert, update, delete on public.subscriptions to authenticated;
grant select, insert, update, delete on public.loans to authenticated;
grant select, insert on public.loan_repayments to authenticated;
grant select, insert, update, delete on public.personal_entries to authenticated;
grant select, insert, update, delete on public.workplaces to authenticated;
grant select, insert, update, delete on public.personal_categories to authenticated;
grant select on public.pair_member_profiles to authenticated;
revoke all on function public.is_pair_member(uuid) from public, anon;
revoke all on function public.is_user_in_pair(uuid, uuid) from public, anon;
grant execute on function public.is_pair_member(uuid) to authenticated;
grant execute on function public.is_user_in_pair(uuid, uuid) to authenticated;
revoke all on function public.is_active_pair_member(uuid) from public, anon;
grant execute on function public.is_active_pair_member(uuid) to authenticated;
drop function if exists public.create_pair_with_invite_hash(text, text, text);
revoke all on function public.create_pair_with_invite_hash(text, text, text, text) from public, anon;
revoke all on function public.join_pair_with_invite_hash(text, text) from public, anon;
revoke all on function public.regenerate_pair_invite_hash(uuid, text) from public, anon;
revoke all on function public.update_pair_settings(uuid, text, text, text) from public, anon;
revoke all on function public.request_or_confirm_pair_dissolution(uuid) from public, anon;
revoke all on function public.cancel_pair_dissolution(uuid) from public, anon;
grant execute on function public.create_pair_with_invite_hash(text, text, text, text) to authenticated;
grant execute on function public.join_pair_with_invite_hash(text, text) to authenticated;
grant execute on function public.update_pair_settings(uuid, text, text, text) to authenticated;
grant execute on function public.request_or_confirm_pair_dissolution(uuid) to authenticated;
grant execute on function public.cancel_pair_dissolution(uuid) to authenticated;
revoke all on function public.regenerate_pair_invite_hash(uuid, text) from authenticated;
