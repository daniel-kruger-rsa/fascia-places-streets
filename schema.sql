CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE IF NOT EXISTS areas (
  area_id     uuid NOT NULL,
  geoname_id  integer,
  name        text NOT NULL,
  kind        text NOT NULL,
  country     text NOT NULL,
  codes       jsonb NOT NULL DEFAULT '{}'::jsonb,
  parent_ids  uuid[] NOT NULL DEFAULT '{}',
  geom        geometry(Geometry, 4326),
  generation  text NOT NULL,
  PRIMARY KEY (area_id, generation)
);

ALTER TABLE areas ALTER COLUMN geom TYPE geometry(Geometry, 4326);
-- A cell may have no geometry. India is the case: the lawful boundary source there is
-- Survey of India's, whose conditions forbid altering their dataset, and the urban cell a
-- host needs has no polygon from any lawful source at all — so a pack can hold names, codes
-- and parent chains for cells it cannot draw. See docs/DESIGN-india-pack.md.
--
-- The alternative was a placeholder polygon, which is a lie the code would have to remember.
-- Nullable geometry makes the absence visible to every query instead, which is why the
-- geometry-dependent reads were changed in the same commit as this line.
ALTER TABLE areas ALTER COLUMN geom DROP NOT NULL;

CREATE INDEX IF NOT EXISTS areas_gix ON areas USING GIST (geom);
CREATE INDEX IF NOT EXISTS areas_gen_country ON areas (generation, country);
CREATE INDEX IF NOT EXISTS areas_kind ON areas (kind);
CREATE INDEX IF NOT EXISTS areas_gen_kind ON areas (generation, kind);

CREATE TABLE IF NOT EXISTS geonames (
  geoname_id     bigint NOT NULL,
  name           text NOT NULL,
  feature_class  text,
  feature_code   text,
  admin1         text,
  country        text NOT NULL,
  generation     text NOT NULL,
  geom           geometry(Point, 4326) NOT NULL,
  PRIMARY KEY (geoname_id, generation)
);

CREATE INDEX IF NOT EXISTS geonames_gix ON geonames USING GIST (geom);
CREATE INDEX IF NOT EXISTS geonames_gen_country ON geonames (generation, country);

CREATE TABLE IF NOT EXISTS pack_meta (
  country     text NOT NULL DEFAULT 'ZA',
  generation  text NOT NULL,
  sources     jsonb NOT NULL,
  loaded_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (country, generation)
);

-- Named streets (OSM), one row per street per sub-place: ways merged by normalised name
-- and clipped to the SP they lie in. Labels and search only, never harvest cells.
-- Keyed on (street_id, generation) so two generations can coexist.
CREATE TABLE IF NOT EXISTS streets (
  street_id   uuid NOT NULL,
  name        text NOT NULL,
  norm_name   text NOT NULL,
  highway     text NOT NULL,
  sp_area_id  uuid NOT NULL,
  osm_ids     bigint[] NOT NULL,
  length_m    real NOT NULL,
  country     text NOT NULL,
  generation  text NOT NULL,
  geom        geometry(MultiLineString, 4326) NOT NULL,
  PRIMARY KEY (street_id, generation)
);

CREATE INDEX IF NOT EXISTS streets_gix ON streets USING GIST (geom);
CREATE INDEX IF NOT EXISTS streets_gen_name ON streets (generation, norm_name);
CREATE INDEX IF NOT EXISTS streets_gen_sp ON streets (generation, sp_area_id);

-- Per-cell measures, one row per area per generation. Filled by different ingests and
-- nullable: streets fills the road lengths, buildings fills the structure count. These are
-- denominators a host can measure coverage against — named streets are missing across much
-- of the rural former-homeland belt (Eastern Cape 12% of sub-places, Limpopo 16%), so
-- "streets prayed" cannot be a national measure while "road km" and "structures" can.
CREATE TABLE IF NOT EXISTS area_stats (
  area_id        uuid NOT NULL,
  generation     text NOT NULL,
  road_km        real,
  named_road_km  real,
  buildings      integer,
  area_km2       real,
  land_class     text,        -- urban | non_urban | agricultural_holdings | smallholdings
  centroid       geometry(Point, 4326),
  -- Mean number of OTHER structures within 10 m of a structure in this cell. Crowding, not
  -- density: a Poisson estimate from density puts Khayelitsha at 0.4 where measurement says
  -- 2.2, because settlements cluster. It sizes a host's building picker — see
  -- docs/DESIGN-building-identity.md.
  crowding_10m   real,
  updated_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (area_id, generation)
);

-- What a pack can and cannot answer in a country, as data rather than prose. A host sizes a
-- building picker, or decides an entrance list is not worth building, by reading this instead
-- of shipping a country list that would be wrong inside one country anyway.
CREATE TABLE IF NOT EXISTS coverage (
  country     text NOT NULL,
  generation  text NOT NULL,
  measure     text NOT NULL,   -- buildings_any | crowding_10m | osm_housenumber | osm_levels | osm_entrance_ref | …
  value       double precision,
  detail      jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (country, generation, measure)
);

-- Which cells touch which. Harvest planning asks "what should this group take next",
-- and that is adjacency, not a bbox. Subplaces only: they are the harvest cells.
CREATE TABLE IF NOT EXISTS area_neighbours (
  area_id      uuid NOT NULL,
  neighbour_id uuid NOT NULL,
  generation   text NOT NULL,
  PRIMARY KEY (area_id, neighbour_id, generation)
);

CREATE INDEX IF NOT EXISTS area_neighbours_gen ON area_neighbours (generation, area_id);

-- What became of a cell when the geography changed. Built by ingest-crosswalk.js, read by
-- GET /v1/places/crosswalk. See docs/DESIGN-generation-crosswalk.md.
--
-- One row per surviving overlap, so a cell that split has several and a host can see the
-- shares. `share` is a fraction of the FROM cell's area, so the rows for one from_area_id
-- sum to roughly 1 and read as "62% of your old cell is now in this one".
--
-- `verdict` is stored rather than computed per read, because it is a property of the whole
-- row set for that cell: it depends on how many successors there are and how big the best
-- one is. Two readers deriving it independently would be two chances to derive it differently.
CREATE TABLE IF NOT EXISTS area_crosswalk (
  from_generation text NOT NULL,
  to_generation   text NOT NULL,
  country         char(2) NOT NULL,
  kind            text NOT NULL,
  from_area_id    uuid NOT NULL,
  to_area_id      uuid NOT NULL,
  -- Both names, denormalised on purpose. A crosswalk outlives the generations it maps
  -- between -- that is the point of it -- so a join to `areas` for a label stops working the
  -- moment the old generation is dropped, which is exactly when the mapping is still needed.
  --
  -- And the pair of names is the answer to a question the geometry cannot reach. A host asked
  -- us to script every `same` verdict; their own register then turned up a link that had been
  -- placed on the cell whose NAME matched a community, 1.7 km from the ground it occupies.
  -- `same` certified that the ground had not changed and could not certify the link was ever
  -- right. "Cedar Lakes" beside "Needwood" is a mismatch a person reads in a second, and a
  -- crosswalk run is the only moment anybody looks at an old link.
  from_name       text,
  to_name         text,
  share           double precision NOT NULL,
  verdict         text NOT NULL,
  PRIMARY KEY (from_generation, to_generation, from_area_id, to_area_id)
);

CREATE INDEX IF NOT EXISTS area_crosswalk_lookup
  ON area_crosswalk (from_generation, to_generation, from_area_id);

-- Crosswalks built before 22 October 2026 carry ids and no labels.
ALTER TABLE area_crosswalk ADD COLUMN IF NOT EXISTS from_name text;
ALTER TABLE area_crosswalk ADD COLUMN IF NOT EXISTS to_name text;

-- HOW a successor was found, not only that it was. Piece 5 of docs/DESIGN-locality-tier.md,
-- agreed with Advance OS on 27 October 2026 to apply to the official tiers as well as to
-- localities -- because a host branching on `verdict` cannot otherwise tell a cell that was
-- measured to overlap from one that was merely the nearest thing.
--
--   overlap    the polygons intersect, and `share` is how much of the old cell the new one
--              holds. Every row built before 28 October 2026 is this, which is why it is
--              the DEFAULT: a backfill that guessed would be worse than the column's absence.
--   feature    the same underlying source feature on both sides -- an OSM place that kept its
--              id. Carries neither a share nor a distance, because neither was computed.
--   proximity  no overlap and no shared feature: the nearest candidate to the old cell's
--              point, `meters` away. A locality has no polygon, so this is the only basis
--              available to it.
--
-- `meters`, not `metres`. The codebase and GeonameHit.meters already say meters, and two
-- spellings of one unit inside one API is the fault this column exists to prevent.
ALTER TABLE area_crosswalk ADD COLUMN IF NOT EXISTS basis text NOT NULL DEFAULT 'overlap';
ALTER TABLE area_crosswalk ADD COLUMN IF NOT EXISTS meters double precision;
--   none       nothing was measured, because nothing was found. This is the no-successor
--              MARKER's basis on a point layer, added 28 October 2026 with the locality
--              crosswalk. The marker used to borrow `overlap` and a share of 0, which for a
--              layer with no polygons is a claim that an overlap was computed and came out
--              empty -- false, and the kind of false that reads as a measurement. A marker is
--              never served to a host, so this value is internal and not in the contract's
--              enum; server.js treats `none` as a marker unconditionally, which is what the
--              value means.
--
-- Dropped and re-added rather than guarded on duplicate_object: the constraint already exists
-- in every loaded database, so an ADD guarded by the exception would silently keep the old
-- three-value version and the locality job's markers would fail the check at runtime instead
-- of here.
ALTER TABLE area_crosswalk DROP CONSTRAINT IF EXISTS area_crosswalk_basis;
ALTER TABLE area_crosswalk ADD CONSTRAINT area_crosswalk_basis
  CHECK (basis IN ('overlap', 'feature', 'proximity', 'none'));

-- A share is what an overlap measured, so a row with another basis must be able to say it has
-- none. Storing 0 there would be a placeholder that reads as "no overlap" -- true of a
-- proximity row and false of what the number means -- and the code would have to remember
-- which. Same reasoning as nullable geometry above: make the absence visible to every query.
ALTER TABLE area_crosswalk ALTER COLUMN share DROP NOT NULL;

-- Packs loaded before September 2026 key areas on area_id alone and geonames on
-- geoname_id alone, so a second generation could not be loaded beside the first.
-- Widen both keys in place; new installs already have the composite key above.
-- Runs last, after every CREATE TABLE above, and skips tables that do not exist yet.
ALTER TABLE area_stats ADD COLUMN IF NOT EXISTS area_km2 real;
ALTER TABLE area_stats ADD COLUMN IF NOT EXISTS land_class text;
ALTER TABLE area_stats ADD COLUMN IF NOT EXISTS centroid geometry(Point, 4326);
ALTER TABLE area_stats ADD COLUMN IF NOT EXISTS crowding_10m real;

-- A generation belongs to a country: census years differ, so cadence does too. Packs loaded
-- before October 2026 keyed pack_meta on the generation alone, when the pack was one country.
ALTER TABLE pack_meta ADD COLUMN IF NOT EXISTS country text NOT NULL DEFAULT 'ZA';
DO $$
DECLARE cols int;
BEGIN
  SELECT array_length(conkey, 1) INTO cols FROM pg_constraint
   WHERE conrelid = 'pack_meta'::regclass AND contype = 'p';
  IF cols = 1 THEN
    ALTER TABLE pack_meta DROP CONSTRAINT pack_meta_pkey;
    ALTER TABLE pack_meta ADD PRIMARY KEY (country, generation);
    RAISE NOTICE 'pack_meta primary key widened to (country, generation)';
  END IF;
END $$;

DO $$
DECLARE cols int;
BEGIN
  IF to_regclass('public.areas') IS NOT NULL THEN
    SELECT array_length(conkey, 1) INTO cols FROM pg_constraint
     WHERE conrelid = 'areas'::regclass AND contype = 'p';
    IF cols = 1 THEN
      ALTER TABLE areas DROP CONSTRAINT areas_pkey;
      ALTER TABLE areas ADD PRIMARY KEY (area_id, generation);
      RAISE NOTICE 'areas primary key widened to (area_id, generation)';
    END IF;
  END IF;

  IF to_regclass('public.geonames') IS NOT NULL THEN
    SELECT array_length(conkey, 1) INTO cols FROM pg_constraint
     WHERE conrelid = 'geonames'::regclass AND contype = 'p';
    IF cols = 1 THEN
      ALTER TABLE geonames DROP CONSTRAINT geonames_pkey;
      ALTER TABLE geonames ADD PRIMARY KEY (geoname_id, generation);
      RAISE NOTICE 'geonames primary key widened to (geoname_id, generation)';
    END IF;
  END IF;
END $$;

-- Structures, as centroids only. Stage 0 of docs/DESIGN-building-identity.md measured that
-- nearest-centroid beats containment everywhere tested — 90.7% against 38.5% in Moscow at a
-- 10 m fix — so polygons would cost four times the storage to answer worse. Footprints stay
-- at the source; a map that needs one fetches it there.
--
-- Partitioned by country because this is the layer where one pack stops fitting one box:
-- South Africa alone is ~30M rows, and the two global ML sets are ~3.2B.
CREATE TABLE IF NOT EXISTS buildings (
  building_id  uuid NOT NULL,
  generation   text NOT NULL,
  country      text NOT NULL,
  source       text NOT NULL,          -- google_open_buildings | microsoft_ml | osm
  source_ref   text,                   -- the source's own key: plus code, OSM way id
  area_id      uuid,                   -- smallest containing cell in that country's pack
  area_m2      real,
  centroid     geometry(Point, 4326) NOT NULL,
  PRIMARY KEY (building_id, generation, country)
) PARTITION BY LIST (country);

CREATE INDEX IF NOT EXISTS buildings_gix ON buildings USING GIST (centroid);
CREATE INDEX IF NOT EXISTS buildings_cell ON buildings (generation, area_id);

-- WHAT AN `unresolved` REFUSED. Piece 4 of docs/DESIGN-locality-tier.md, on Advance OS's
-- amendment of 28 October 2026: a bare `unresolved` invites a later implementer to fetch
-- candidates themselves, unbounded, which is exactly what the 27x swing in the measured
-- movement radius rules out. So the rejections travel with the answer and nobody re-derives
-- them.
--
-- A SEPARATE TABLE RATHER THAN A FLAG ON area_crosswalk, and the reason is the whole point of
-- it. These rows name cells that were considered and refused. One forgotten `WHERE rejected =
-- false` would serve a refused candidate as a successor a host can re-point to -- a guess
-- wearing the shape of an answer, which is the fault this tier exists to avoid. In its own
-- table it cannot be reached by a query that does not name it.
--
-- `reason` is not decoration: a candidate 400 m away in the wrong parent and one 1.8 km away in
-- the right one are different problems for whoever looks at this, and in Maharashtra the parent
-- is absent for 6,622 of 39,699 localities, so `no_parent` is a common verdict rather than an
-- edge.
CREATE TABLE IF NOT EXISTS area_crosswalk_rejected (
  from_generation   text NOT NULL,
  to_generation     text NOT NULL,
  country           char(2) NOT NULL,
  kind              text NOT NULL,
  from_area_id      uuid NOT NULL,
  candidate_area_id uuid NOT NULL,
  -- Denormalised for the same reason as area_crosswalk.from_name: a crosswalk outlives the
  -- generations it maps between, and a join for a label stops working the moment the old
  -- generation is dropped -- which is when somebody is most likely to be reading this.
  candidate_name    text,
  meters            double precision NOT NULL,
  reason            text NOT NULL,
  PRIMARY KEY (from_generation, to_generation, from_area_id, candidate_area_id)
);

CREATE INDEX IF NOT EXISTS area_crosswalk_rejected_lookup
  ON area_crosswalk_rejected (from_generation, to_generation, from_area_id);

-- Dropped and re-added rather than guarded on duplicate_object, for the reason the basis
-- constraint above gives: a guarded ADD silently keeps an older value set, and the job then
-- fails the check at runtime instead of here. 'ambiguous' was added hours after the rest, on
-- the first real run -- see crosswalk-locality.js MARGIN.
ALTER TABLE area_crosswalk_rejected DROP CONSTRAINT IF EXISTS area_crosswalk_rejected_reason;
ALTER TABLE area_crosswalk_rejected ADD CONSTRAINT area_crosswalk_rejected_reason
  CHECK (reason IN ('outside_radius', 'outside_parent', 'no_radius', 'no_parent',
                    'parent_unresolved', 'ambiguous'));

-- A rejected candidate must never be the cell's own id. A self-row is the no-successor marker's
-- shape in area_crosswalk, and the two tables are read together.
DO $$ BEGIN
  ALTER TABLE area_crosswalk_rejected ADD CONSTRAINT area_crosswalk_rejected_not_self
    CHECK (candidate_area_id <> from_area_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
