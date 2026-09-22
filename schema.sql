CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE IF NOT EXISTS areas (
  area_id     uuid PRIMARY KEY,
  geoname_id  integer,
  name        text NOT NULL,
  kind        text NOT NULL,
  country     text NOT NULL,
  codes       jsonb NOT NULL DEFAULT '{}'::jsonb,
  parent_ids  uuid[] NOT NULL DEFAULT '{}',
  geom        geometry(Geometry, 4326) NOT NULL,
  generation  text NOT NULL
);

ALTER TABLE areas ALTER COLUMN geom TYPE geometry(Geometry, 4326);

CREATE INDEX IF NOT EXISTS areas_gix ON areas USING GIST (geom);
CREATE INDEX IF NOT EXISTS areas_gen_country ON areas (generation, country);
CREATE INDEX IF NOT EXISTS areas_kind ON areas (kind);
CREATE INDEX IF NOT EXISTS areas_gen_kind ON areas (generation, kind);

CREATE TABLE IF NOT EXISTS geonames (
  geoname_id     bigint PRIMARY KEY,
  name           text NOT NULL,
  feature_class  text,
  feature_code   text,
  admin1         text,
  country        text NOT NULL,
  generation     text NOT NULL,
  geom           geometry(Point, 4326) NOT NULL
);

CREATE INDEX IF NOT EXISTS geonames_gix ON geonames USING GIST (geom);
CREATE INDEX IF NOT EXISTS geonames_gen_country ON geonames (generation, country);

CREATE TABLE IF NOT EXISTS pack_meta (
  generation  text PRIMARY KEY,
  sources     jsonb NOT NULL,
  loaded_at   timestamptz NOT NULL DEFAULT now()
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
