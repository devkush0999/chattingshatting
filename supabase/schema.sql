create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 2 and 40),
  avatar_color text not null default '#2563eb',
  created_at timestamptz not null default now()
);

create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[0-9]{10}$'),
  name text not null check (char_length(name) between 2 and 40),
  created_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.room_members (
  room_id uuid not null references public.rooms(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  primary key (room_id, user_id)
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(trim(body)) between 1 and 2000),
  deleted_for_everyone boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.message_deletions (
  message_id uuid not null references public.messages(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  deleted_at timestamptz not null default now(),
  primary key (message_id, user_id)
);

create table if not exists public.typing_events (
  room_id uuid not null references public.rooms(id) on delete cascade,
  from_user uuid not null references public.profiles(id) on delete cascade,
  to_user uuid not null references public.profiles(id) on delete cascade,
  is_typing boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (room_id, from_user, to_user)
);

create table if not exists public.call_signals (
  id uuid primary key default gen_random_uuid(),
  room_id text not null,
  circle_id uuid not null references public.rooms(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  type text not null check (type in ('offer', 'answer', 'ice', 'hangup')),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.messages add column if not exists room_id uuid references public.rooms(id) on delete cascade;
alter table public.typing_events add column if not exists room_id uuid references public.rooms(id) on delete cascade;
alter table public.call_signals add column if not exists circle_id uuid references public.rooms(id) on delete cascade;

drop trigger if exists profiles_max_ten on public.profiles;
drop function if exists public.prevent_more_than_ten_profiles();

create index if not exists room_members_user_idx on public.room_members(user_id, joined_at);
create index if not exists messages_room_pair_idx on public.messages(room_id, sender_id, recipient_id, created_at);
create index if not exists call_signals_recipient_idx on public.call_signals(recipient_id, created_at);

create or replace function public.is_room_member(room uuid, member uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.room_members
    where room_id = room and user_id = member
  );
$$;

create or replace function public.room_has_space(room uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select (select count(*) from public.room_members where room_id = room) < 10;
$$;

create or replace function public.share_room(first_user uuid, second_user uuid, room uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select public.is_room_member(room, first_user) and public.is_room_member(room, second_user);
$$;

create or replace function public.create_private_room(room_name text, room_code text)
returns public.rooms
language plpgsql
security definer
set search_path = public
as $$
declare
  created_room public.rooms;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;

  if room_code !~ '^[0-9]{10}$' then
    raise exception 'Room code must be exactly 10 digits.';
  end if;

  insert into public.rooms (code, name, created_by)
  values (room_code, trim(room_name), auth.uid())
  returning * into created_room;

  insert into public.room_members (room_id, user_id, role)
  values (created_room.id, auth.uid(), 'owner');

  return created_room;
end;
$$;

create or replace function public.join_private_room(room_code text)
returns public.rooms
language plpgsql
security definer
set search_path = public
as $$
declare
  target_room public.rooms;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;

  select * into target_room
  from public.rooms
  where code = room_code;

  if target_room.id is null then
    raise exception 'Room not found.';
  end if;

  if not public.room_has_space(target_room.id) and not public.is_room_member(target_room.id, auth.uid()) then
    raise exception 'This room already has 10 members.';
  end if;

  insert into public.room_members (room_id, user_id, role)
  values (target_room.id, auth.uid(), 'member')
  on conflict (room_id, user_id) do nothing;

  return target_room;
end;
$$;

alter table public.profiles enable row level security;
alter table public.rooms enable row level security;
alter table public.room_members enable row level security;
alter table public.messages enable row level security;
alter table public.message_deletions enable row level security;
alter table public.typing_events enable row level security;
alter table public.call_signals enable row level security;

drop policy if exists "Profiles are visible to signed in circle members" on public.profiles;
drop policy if exists "Profiles are visible to room members" on public.profiles;
drop policy if exists "Users create their own profile" on public.profiles;
drop policy if exists "Users update their own profile" on public.profiles;
drop policy if exists "Members can read their rooms" on public.rooms;
drop policy if exists "Members can read room membership" on public.room_members;
drop policy if exists "Participants can read their messages" on public.messages;
drop policy if exists "Users can send messages as themselves" on public.messages;
drop policy if exists "Senders can delete their messages for everyone" on public.messages;
drop policy if exists "Users can mark visible messages deleted for self" on public.message_deletions;
drop policy if exists "Users can read their own deletion markers" on public.message_deletions;
drop policy if exists "Typing is visible between participants" on public.typing_events;
drop policy if exists "Users can publish their typing status" on public.typing_events;
drop policy if exists "Users can update their typing status" on public.typing_events;
drop policy if exists "Call signals are visible to participants" on public.call_signals;
drop policy if exists "Users can send call signals as themselves" on public.call_signals;

create policy "Profiles are visible to room members"
on public.profiles for select
to authenticated
using (
  auth.uid() = id or exists (
    select 1
    from public.room_members mine
    join public.room_members theirs on theirs.room_id = mine.room_id
    where mine.user_id = auth.uid() and theirs.user_id = profiles.id
  )
);

create policy "Users create their own profile"
on public.profiles for insert
to authenticated
with check (auth.uid() = id);

create policy "Users update their own profile"
on public.profiles for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

create policy "Members can read their rooms"
on public.rooms for select
to authenticated
using (public.is_room_member(id, auth.uid()));

create policy "Members can read room membership"
on public.room_members for select
to authenticated
using (public.is_room_member(room_id, auth.uid()));

create policy "Participants can read their room messages"
on public.messages for select
to authenticated
using (
  (auth.uid() = sender_id or auth.uid() = recipient_id)
  and public.share_room(sender_id, recipient_id, room_id)
  and public.is_room_member(room_id, auth.uid())
);

create policy "Users can send messages to room members"
on public.messages for insert
to authenticated
with check (
  auth.uid() = sender_id
  and public.share_room(sender_id, recipient_id, room_id)
);

create policy "Senders can delete their messages for everyone"
on public.messages for update
to authenticated
using (auth.uid() = sender_id and public.is_room_member(room_id, auth.uid()))
with check (auth.uid() = sender_id and public.is_room_member(room_id, auth.uid()));

create policy "Users can mark visible messages deleted for self"
on public.message_deletions for insert
to authenticated
with check (
  auth.uid() = user_id and exists (
    select 1 from public.messages
    where id = message_id
      and (sender_id = auth.uid() or recipient_id = auth.uid())
      and public.is_room_member(room_id, auth.uid())
  )
);

create policy "Users can read their own deletion markers"
on public.message_deletions for select
to authenticated
using (auth.uid() = user_id);

create policy "Typing is visible between room participants"
on public.typing_events for select
to authenticated
using (
  (auth.uid() = from_user or auth.uid() = to_user)
  and public.share_room(from_user, to_user, room_id)
);

create policy "Users can publish their room typing status"
on public.typing_events for insert
to authenticated
with check (
  auth.uid() = from_user
  and public.share_room(from_user, to_user, room_id)
);

create policy "Users can update their room typing status"
on public.typing_events for update
to authenticated
using (auth.uid() = from_user and public.share_room(from_user, to_user, room_id))
with check (auth.uid() = from_user and public.share_room(from_user, to_user, room_id));

create policy "Call signals are visible to room participants"
on public.call_signals for select
to authenticated
using (
  (auth.uid() = sender_id or auth.uid() = recipient_id)
  and public.share_room(sender_id, recipient_id, circle_id)
);

create policy "Users can send call signals to room members"
on public.call_signals for insert
to authenticated
with check (
  auth.uid() = sender_id
  and public.share_room(sender_id, recipient_id, circle_id)
);

do $$
begin
  alter publication supabase_realtime add table public.messages;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.message_deletions;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.typing_events;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.call_signals;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.profiles;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.rooms;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.room_members;
exception when duplicate_object then null;
end $$;
