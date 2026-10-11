create table if not exists public.registration_acceptances (
  user_id uuid primary key references auth.users(id) on delete cascade,
  referral_source text not null check (referral_source in ('TPD', 'EJW', 'Internet search', 'Other')),
  referral_other text,
  terms_version text not null,
  accepted_at timestamptz not null,
  recorded_at timestamptz not null default now(),
  check (
    (referral_source = 'Other' and length(trim(referral_other)) >= 5)
    or (referral_source <> 'Other' and referral_other is null)
  )
);

alter table public.registration_acceptances enable row level security;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (
    new.id,
    lower(new.email),
    coalesce(nullif(new.raw_user_meta_data ->> 'display_name', ''), split_part(new.email, '@', 1))
  )
  on conflict (id) do update set
    email = excluded.email,
    display_name = excluded.display_name;

  if new.raw_user_meta_data ? 'terms_accepted_at' then
    insert into public.registration_acceptances (
      user_id,
      referral_source,
      referral_other,
      terms_version,
      accepted_at
    )
    values (
      new.id,
      new.raw_user_meta_data ->> 'referral_source',
      nullif(new.raw_user_meta_data ->> 'referral_other', ''),
      new.raw_user_meta_data ->> 'terms_version',
      (new.raw_user_meta_data ->> 'terms_accepted_at')::timestamptz
    )
    on conflict (user_id) do nothing;
  end if;
  return new;
end;
$$;

drop policy if exists "Public acceptance export" on public.registration_acceptances;
create policy "Public acceptance export"
  on public.registration_acceptances for select to anon, authenticated
  using (true);

grant select on public.registration_acceptances to anon, authenticated;

insert into public.registration_acceptances (
  user_id,
  referral_source,
  referral_other,
  terms_version,
  accepted_at
)
select
  id,
  raw_user_meta_data ->> 'referral_source',
  nullif(raw_user_meta_data ->> 'referral_other', ''),
  raw_user_meta_data ->> 'terms_version',
  (raw_user_meta_data ->> 'terms_accepted_at')::timestamptz
from auth.users
where raw_user_meta_data ? 'terms_accepted_at'
on conflict (user_id) do nothing;
