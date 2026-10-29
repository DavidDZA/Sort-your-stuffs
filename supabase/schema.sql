-- Sort my stuffs — schéma Supabase : comptes et synchro (phase 1), amis (phase 2).
-- À coller en entier dans Supabase : SQL Editor → New query → Run. Peut être relancé sans risque.

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

-- ===========================================================================
-- Phase 2 : amis
-- ===========================================================================

-- Une ligne par paire d'amis (user_a < user_b), créée quand l'un utilise le code ami de l'autre :
-- partager son code (ou son lien d'invitation) vaut accord. Chacun peut retirer l'autre.
create table if not exists public.friendships (
  user_a uuid not null references auth.users on delete cascade,
  user_b uuid not null references auth.users on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_a, user_b),
  check (user_a < user_b)
);
create index if not exists friendships_b_idx on public.friendships (user_b);

alter table public.friendships enable row level security;
revoke all on public.friendships from anon;
grant select, delete on public.friendships to authenticated;

drop policy if exists "amitiés : les miennes" on public.friendships;
create policy "amitiés : les miennes" on public.friendships
  for select to authenticated using ((select auth.uid()) in (user_a, user_b));

drop policy if exists "amitiés : retirer un ami" on public.friendships;
create policy "amitiés : retirer un ami" on public.friendships
  for delete to authenticated using ((select auth.uid()) in (user_a, user_b));

-- « other » est-il mon ami ?
create or replace function public.is_friend(other uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.friendships f
    where f.user_a = least(other, auth.uid()) and f.user_b = greatest(other, auth.uid())
  );
$$;

-- « owner » est mon ami et partage « what » (« wishlist » ou « ranking » : titres vus et classement).
create or replace function public.friend_shares(owner uuid, what text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_friend(owner) and exists (
    select 1 from public.profiles p
    where p.id = owner
      and case what when 'wishlist' then p.share_wishlist when 'ranking' then p.share_ranking else false end
  );
$$;

-- Ajouter un ami avec son code ; renvoie son pseudo.
create or replace function public.add_friend(code text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  other uuid;
  name text;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  select p.id, p.pseudo into other, name from public.profiles p where p.friend_code = upper(trim(code));
  if other is null then
    raise exception 'unknown_code';
  end if;
  if other = auth.uid() then
    raise exception 'own_code';
  end if;
  insert into public.friendships (user_a, user_b)
  values (least(other, auth.uid()), greatest(other, auth.uid()))
  on conflict do nothing;
  return name;
end;
$$;

-- Pseudo du propriétaire d'un code (aperçu d'une invitation avant de l'accepter).
create or replace function public.find_friend_code(code text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select p.pseudo from public.profiles p where auth.uid() is not null and p.friend_code = upper(trim(code));
$$;

-- Nouveau code ami (l'ancien ne marche plus ; les amis déjà ajoutés le restent).
create or replace function public.new_friend_code()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  c text := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
begin
  update public.profiles set friend_code = c where id = auth.uid();
  return c;
end;
$$;

revoke all on function public.is_friend(uuid), public.friend_shares(uuid, text), public.add_friend(text),
  public.find_friend_code(text), public.new_friend_code() from public, anon;
grant execute on function public.is_friend(uuid), public.friend_shares(uuid, text), public.add_friend(text),
  public.find_friend_code(text), public.new_friend_code() to authenticated;

-- Lecture chez un ami, en lecture seule et selon ce qu'il partage :
-- pseudo et réglages de partage, wishlist (+ son ordre de priorité), titres vus (+ classement).
drop policy if exists "profil : lecture de mes amis" on public.profiles;
create policy "profil : lecture de mes amis" on public.profiles
  for select to authenticated using (public.is_friend(id));

drop policy if exists "réponses : partagées par mes amis" on public.answers;
create policy "réponses : partagées par mes amis" on public.answers
  for select to authenticated using (
    not deleted
    and (
      (status = 'wish' and public.friend_shares(user_id, 'wishlist'))
      or (status = 'seen' and public.friend_shares(user_id, 'ranking'))
    )
  );

drop policy if exists "meta : classements partagés par mes amis" on public.user_meta;
create policy "meta : classements partagés par mes amis" on public.user_meta
  for select to authenticated using (
    not deleted
    and (
      (key in ('ranking:wish:movie', 'ranking:wish:tv', 'ranking:wish:anime') and public.friend_shares(user_id, 'wishlist'))
      or (key in ('ranking:movie', 'ranking:tv', 'ranking:anime') and public.friend_shares(user_id, 'ranking'))
    )
  );
