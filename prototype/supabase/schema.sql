create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  display_name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.projects (
  id uuid primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  owner_email text not null,
  collaborator_emails text[] not null default '{}',
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.projects enable row level security;

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
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert or update of email, raw_user_meta_data on auth.users
  for each row execute procedure public.handle_new_user();

create or replace function public.protect_project_access_fields()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  new.updated_at = now();
  if auth.uid() <> old.owner_id then
    new.owner_id = old.owner_id;
    new.owner_email = old.owner_email;
    new.collaborator_emails = old.collaborator_emails;
  end if;
  return new;
end;
$$;

drop trigger if exists protect_project_access_fields on public.projects;
create trigger protect_project_access_fields
  before update on public.projects
  for each row execute procedure public.protect_project_access_fields();

drop policy if exists "Authenticated users can find profiles" on public.profiles;
create policy "Authenticated users can find profiles"
  on public.profiles for select to authenticated
  using (true);

drop policy if exists "Users can update their profile" on public.profiles;
create policy "Users can update their profile"
  on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists "Owners and collaborators can read projects" on public.projects;
create policy "Owners and collaborators can read projects"
  on public.projects for select to authenticated
  using (
    owner_id = auth.uid()
    or lower(auth.jwt() ->> 'email') = any(collaborator_emails)
  );

drop policy if exists "Users can create their own projects" on public.projects;
create policy "Users can create their own projects"
  on public.projects for insert to authenticated
  with check (
    owner_id = auth.uid()
    and lower(owner_email) = lower(auth.jwt() ->> 'email')
  );

drop policy if exists "Owners and collaborators can edit projects" on public.projects;
create policy "Owners and collaborators can edit projects"
  on public.projects for update to authenticated
  using (
    owner_id = auth.uid()
    or lower(auth.jwt() ->> 'email') = any(collaborator_emails)
  )
  with check (
    owner_id = auth.uid()
    or lower(auth.jwt() ->> 'email') = any(collaborator_emails)
  );

drop policy if exists "Only owners can delete projects" on public.projects;
create policy "Only owners can delete projects"
  on public.projects for delete to authenticated
  using (owner_id = auth.uid());

grant select, update on public.profiles to authenticated;
grant select, insert, update, delete on public.projects to authenticated;
