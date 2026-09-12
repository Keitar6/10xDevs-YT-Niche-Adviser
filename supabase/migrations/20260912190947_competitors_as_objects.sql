-- Replace competitor_channel_ids text[] with competitors jsonb.
--
-- Why: the channel ID is the stable key (handles can be renamed by their owner,
-- and only IDs can be batched into a single channels.list call), but a raw
-- `UC…` string is unreadable to the person who typed `@mkbhd`. Storing one
-- object per competitor keeps the ID authoritative while carrying the display
-- labels next to it — two parallel arrays would be free to drift apart.
--
-- Shape: [{ "id": "UC…", "handle": "@mkbhd", "title": "Marques Brownlee" }, …]
-- `handle` and `title` are nullable: not every channel exposes a customUrl, and
-- rows backfilled by this migration have neither. Readers fall back to the id.

alter table public.channel_profiles
  add column competitors jsonb not null default '[]'::jsonb;

update public.channel_profiles
set competitors = coalesce(
  (
    select jsonb_agg(jsonb_build_object('id', v, 'handle', null, 'title', null))
    from unnest(competitor_channel_ids) as v
  ),
  '[]'::jsonb
);

alter table public.channel_profiles
  drop column competitor_channel_ids;

-- The default existed only to backfill existing rows; an insert must supply
-- competitors explicitly, as it previously had to supply competitor_channel_ids.
alter table public.channel_profiles
  alter column competitors drop default;

-- FR-003's 3–5 bound, enforced at the row level. Per-element shape stays in the
-- zod schema at the API layer: a CHECK constraint cannot contain a subquery,
-- and jsonb_array_elements would require one.
alter table public.channel_profiles
  add constraint channel_profiles_competitors_shape
  check (
    jsonb_typeof(competitors) = 'array'
    and jsonb_array_length(competitors) between 3 and 5
  );

-- RLS is unchanged: all four policies in 20260909213911_create_channel_profiles.sql
-- are row-scoped on user_id and are unaffected by a column swap.
