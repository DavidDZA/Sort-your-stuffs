-- Sort my stuffs — schéma Supabase, phase 1 (comptes et synchro).
-- À coller dans Supabase : SQL Editor → New query → Run. Peut être relancé sans risque.
-- Les amis (phase 2) ajouteront la table friendships et les règles de lecture entre amis.

-- ---------------------------------------------------------------------------
-- Profil public minimal
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users on delete cascade,
  pseudo text not null check (char_length(pseudo) between 1 and 40),
  friend_code text unique not null default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)),
  -- Ce que les amis pourront voir (phase 2) : wishlist et top par défaut, les vus en option.
  share_seen boolean not null default false,
  share_ranking boolean not null default true,
  share_wishlist boolean not null default true,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Réponses : une ligne par titre et par utilisateur.
-- « deleted » = pierre tombale pour synchroniser les suppressions ; « title » = copie du titre
-- (nom, année, affiche) pour afficher chez un ami un titre absent de son catalogue.
-- ---------------------------------------------------------------------------
create table if not exists public.answers (
  user_id uuid not null references auth.users on delete cascade,
  key text not null,
  type text not null check (type in ('movie', 'tv')),
  status text check (status in ('seen', 'unseen', 'wish')),
  tier text check (tier in ('good', 'meh')),
  title jsonb,
  deleted boolean not null default false,
  client_updated_at timestamptz not null, -- horodatage de l'appareil : arbitre les conflits
  updated_at timestamptz not null default now(), -- horodatage serveur : curseur de synchro
  primary key (user_id, key),
  check (deleted or status is not null)
);

-- Classements, activité, badges… (même rôle que la table locale « meta »).
create table if not exists public.user_meta (
  user_id uuid not null references auth.users on delete cascade,
  key text not null,
  value jsonb,
  deleted boolean not null default false,
  client_updated_at timestamptz not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);

create index if not exists answers_sync_idx on public.answers (user_id, updated_at);
create index if not exists user_meta_sync_idx on public.user_meta (user_id, updated_at);

-- ---------------------------------------------------------------------------
-- updated_at fixé par le serveur à chaque écriture (indépendant des horloges des appareils)
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists answers_touch on public.answers;
create trigger answers_touch before insert or update on public.answers
  for each row execute function public.touch_updated_at();

drop trigger if exists user_meta_touch on public.user_meta;
create trigger user_meta_touch before insert or update on public.user_meta
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Profil créé automatiquement à l'inscription (e-mail ou Google).
-- Pseudo : celui saisi à l'inscription, sinon le nom du compte Google, sinon le début de l'e-mail.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, pseudo)
  values (
    new.id,
    left(
      coalesce(
        nullif(trim(new.raw_user_meta_data ->> 'pseudo'), ''),
        nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
        nullif(trim(new.raw_user_meta_data ->> 'name'), ''),
        nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
        'Cinéphile'
      ),
      40
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Suppression de compte depuis l'appli (obligatoire pour le Play Store) :
-- supprime l'utilisateur, et par cascade son profil et toutes ses données.
-- ---------------------------------------------------------------------------
create or replace function public.delete_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from auth.users where id = auth.uid();
end;
$$;

revoke all on function public.delete_account() from public, anon;
grant execute on function public.delete_account() to authenticated;

-- ---------------------------------------------------------------------------
-- Règles d'accès (RLS) : chacun ne voit et ne modifie que ses propres lignes.
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.answers enable row level security;
alter table public.user_meta enable row level security;

revoke all on public.profiles, public.answers, public.user_meta from anon;
revoke update on public.profiles from authenticated;
grant select on public.profiles to authenticated;
grant update (pseudo, share_seen, share_ranking, share_wishlist) on public.profiles to authenticated; -- pas le code ami
grant select, insert, update, delete on public.answers, public.user_meta to authenticated;

drop policy if exists "profil : lecture du sien" on public.profiles;
create policy "profil : lecture du sien" on public.profiles
  for select to authenticated using ((select auth.uid()) = id);

drop policy if exists "profil : modification du sien" on public.profiles;
create policy "profil : modification du sien" on public.profiles
  for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

drop policy if exists "réponses : les siennes" on public.answers;
create policy "réponses : les siennes" on public.answers
  for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "meta : les siennes" on public.user_meta;
create policy "meta : les siennes" on public.user_meta
  for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
