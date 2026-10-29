# Fascia Places — OpenStreetMap methods

How the OpenStreetMap-derived layers of Fascia Places are made. Two so far:

- **[Streets](#streets--named-street-pieces-per-sub-place)** — named street pieces, one row per street per sub-place.
- **[Localities](#localities--the-loc-tier)** — the `LOC` tier: named places that no official layer draws.

Fascia Places is a geography service for community platforms. Both layers are **derivative
databases of OpenStreetMap**, licensed under the
[Open Database License (ODbL) 1.0](https://opendatacommons.org/licenses/odbl/1-0/). This repository
publishes the method of producing each derivative from OSM, as section 4.6 of the ODbL provides, so
anyone can rebuild them from the same public source.

**Data © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright)**, available under the ODbL.
The code in this repository is MIT-licensed (see `LICENSE`); that licence covers the code only, not the data.

The repository is named for the streets method, which came first. The name is kept because packs
record it as their `method` URL, and changing it would break that reference in every generation
already built.

## Files

| File | What it is |
|---|---|
| `ingest-streets.js`, `street-name.js` | The streets method. |
| `ingest-osm-places.js`, `locality-id.js` | The localities method. |
| `attribution.js` | The credits each layer records, so the API can serve them. Included because `ingest-osm-places.js` requires it, and because the ODbL credit this repository exists to honour is one of the constants in it. |
| `db.js`, `pack-meta.js`, `schema.sql`, `package.json` | Shared plumbing: connection, provenance record, tables. |

`schema.sql` is the whole Places schema, not a trimmed copy, because a trimmed one invites the
question of what was trimmed. Only the `areas`, `streets` and `pack_meta` tables matter to these
two methods.

---

# Streets — named street pieces per sub-place

## Inputs

| Input | Where from |
|---|---|
| OpenStreetMap, South Africa | Geofabrik extract [`south-africa-latest.osm.pbf`](https://download.geofabrik.de/africa/south-africa.html) (ODbL). Each pack records the exact file it used: its sha256 and OSM replication timestamp (see *Provenance*). |
| Sub-place polygons | Statistics South Africa, Census 2011 sub-places (`Subplace.zip` in [SA-Maps](https://github.com/j-norwood-young/SA-Maps)), loaded into PostGIS as `areas` rows with `kind = 'subplace'`, `codes->>'sp_code'` = `SP_CODE`, geometry made valid (`ST_MakeValid`, polygon parts only) in EPSG:4326. |

The sub-places only decide **which sub-place a street piece belongs to**. They are not OSM data and are not part of the derivative.

## Method

`ingest-streets.js` runs these steps. Rerunning it on the same extract and the same sub-places produces the same rows and the same ids.

1. **Filter.** Keep OSM ways tagged `highway` with one of:
   `motorway, trunk, primary, secondary, tertiary, motorway_link, trunk_link, primary_link, secondary_link, tertiary_link, unclassified, residential, living_street, pedestrian, road, service, track`.
   Footways, paths, cycleways, steps, construction and proposed roads are left out.
   ```
   osmium tags-filter south-africa-latest.osm.pbf w/highway=<list above> -o highways.osm.pbf
   osmium export highways.osm.pbf -c export.json --geometry-types=linestring --add-unique-id=type_id -f geojsonseq -o streets.geojsonseq
   ```
   with `export.json` = `{"linear_tags": true, "area_tags": false, "include_tags": ["name", "highway"]}`.
2. **Named ways only.** Drop ways without a `name`, or whose name normalises to nothing.
3. **Normalise names** (`street-name.js`): strip diacritics, lowercase, turn punctuation into spaces, collapse spaces,
   and expand a trailing street-type abbreviation (`rd` → `road`, `st` → `street`, `ave`/`av` → `avenue`, `dr` → `drive`,
   `cres`/`cr` → `crescent`, `ln` → `lane`, `cl` → `close`, `pl` → `place`, `hwy` → `highway`, `blvd` → `boulevard`,
   `sq` → `square`, `tce`/`ter` → `terrace`). Only the last word is expanded. `str` is left as is.
4. **Clip to sub-places.** Split each sub-place with `ST_Subdivide(geom, 255)`. Intersect every way with the parts it
   touches: a way wholly inside a part is kept as is, otherwise `ST_Intersection`, keeping line parts only.
5. **Merge.** Group the pieces by (sub-place, normalised name). Each group becomes one row:
   - `geom`: `ST_Multi(ST_LineMerge(ST_UnaryUnion(ST_CollectionExtract(ST_Collect(pieces), 2))))`
   - `name`: the most frequent original spelling in the group
   - `highway`: the most significant class present, in the order of the list in step 1
   - `osm_ids`: the distinct OSM way ids that contributed
   - `length_m`: geodesic length
   - `street_id`: `md5('fascia-st:' || sp_code || ':' || normalised_name)`, read as a UUID
6. **Prune boundary stubs.** Delete a row shorter than 25 m when a row with the same normalised name and at least
   one shared OSM way id is 25 m or longer elsewhere. That is, a street that barely crosses a sub-place boundary
   is listed only in the sub-place it runs through.

7. **Measure road length per cell**, unless `STREETS_ROAD_STATS=0`. Unnamed ways are kept through
   the clip in step 4 for this one purpose and are excluded from the merge in step 5, so they never
   become street rows. Per sub-place, `area_stats.road_km` is the geodesic length of all clipped
   road pieces and `named_road_km` is the length of those that normalise to a name. The ratio is
   what tells a host how much of a cell's road network OSM has actually named.

Ways that touch no sub-place are dropped and counted.

**`street-name.js` decides `street_id`.** Step 5 seeds the id from the normalised name, so a change
to the normalisation rules in step 3 re-mints every street id that normalises differently. Treat
any edit to that file as a change to the identity of the data, not to its presentation.

## Output

One row per street per sub-place; see `schema.sql`, table `streets`:

| Column | Meaning |
|---|---|
| `street_id`, `generation` | Key. A generation is one build of the whole Places pack. |
| `name`, `norm_name` | Display name and normalised name |
| `highway` | Representative OSM `highway` class |
| `sp_area_id` | The Fascia sub-place the piece lies in |
| `osm_ids` | Contributing OSM way ids |
| `length_m`, `geom` | Length in metres; merged MultiLineString, EPSG:4326 |

## Provenance

Each build records in `pack_meta.sources.lines_streets` the source URL, the pbf's sha256 and size, its OSM replication
timestamp, the highway list, the stub threshold, the row counts and how many cells got road statistics. That record
identifies the exact OSM input of any generation Fascia Places serves.

## Running it

Needs Node 20, `osmium-tool`, `curl`, and PostGIS 3.4 holding the sub-place layer described above.

```
npm install
DATABASE_URL=postgres://… PACK_COUNTRY=ZA PACK_GENERATION=<generation> PACK_CACHE=./cache node ingest-streets.js
```

`STREETS_PBF_URL` points at a different (e.g. dated) extract. `STREETS_ROAD_STATS=0` skips step 7,
which also stops unnamed ways being read at all.

## Corrections

Street names are corrected in OpenStreetMap itself, never in this layer. A fix made in OSM appears in the next build.

---

# Localities — the `LOC` tier

Named places that no official layer draws. An official boundary layer tiles the ground it covers,
but it does not name everything on it: a neighbourhood, a hamlet or an urban suburb often exists in
OpenStreetMap and nowhere official. The `LOC` tier carries those, marked as unofficial, hanging off
whichever official cell contains them.

**A locality is a point, not an area.** OSM names a neighbourhood without drawing it, so this layer
never answers "which cell contains this coordinate" by containment. It is searched by name.

## Inputs

| Input | Where from |
|---|---|
| OpenStreetMap, regional extract | A Geofabrik extract named on the command line, e.g. [`western-zone-260101.osm.pbf`](https://download.geofabrik.de/asia/india/) (ODbL). Dated rather than `-latest`, so a build is reproducible. Each pack records the URL, the sha256 and the OSM replication timestamp. |
| Official cells | Already loaded in PostGIS as `areas` rows of the same `generation` and `country`, with polygon geometry. For India these are Survey of India Administrative Boundary Database villages at `kind = 'subplace'`. |

The official cells decide only **which cell a locality hangs from** and **which ground is in the
pack at all**. They are not OSM data and are not part of the derivative.

## Method

`ingest-osm-places.js` runs these steps. Rerunning it on the same extract and the same official
cells produces the same rows and the same ids.

1. **Establish the vintage** from the pbf header's `osmosis_replication_timestamp`
   (`osmium fileinfo -g header.option.osmosis_replication_timestamp`). The ingest **refuses** an
   extract whose header carries no timestamp, rather than guessing a vintage — the vintage is part
   of every id it mints.
2. **Filter** to named-place features of ten `place` values:
   `city, town, village, hamlet, isolated_dwelling, suburb, quarter, neighbourhood, borough, locality`.
   ```
   osmium tags-filter <extract>.osm.pbf nwr/place=city,town,village,hamlet,isolated_dwelling,suburb,quarter,neighbourhood,borough,locality -O -o places.osm.pbf
   osmium export places.osm.pbf -c export.json --geometry-types=point,polygon --add-unique-id=type_id -f geojsonseq -O -o places.geojsonseq
   ```
   with `export.json` = `{"linear_tags": false, "area_tags": true, "include_tags": ["name", "place"]}`.
   `tags-filter` prefilters on the **key**, not the value, so features with other `place` values
   arrive here and are dropped on the way in.
3. **Named features only**, and only features whose OSM type and id osmium supplied. A feature
   whose identity cannot be read is counted and dropped rather than given a made-up id.
4. **Reduce a polygon to a point** with `ST_PointOnSurface`, not `ST_Centroid`, so the point of a
   concave or ring-shaped place is inside it.
5. **Mint the id** (`locality-id.js`) from the OSM feature, never from the name:
   ```
   fascia-loc:<vintage>:<osm_type>/<osm_id>
   ```
   shaped into a UUID v5 over the `fascia-places` namespace (sha1), the same scheme every other
   Places layer uses. **The type is in the seed** because an OSM id is unique only within its
   type — node 123, way 123 and relation 123 are three different objects, and a seed built from
   the id alone would merge them into one cell that no count or response shape would reveal.
   **The vintage is in the seed** so two vintages can sit in one database without one standing in
   for the other. Changing anything in that file changes every locality id: treat it as a new
   vintage.
6. **Resolve the parent**: the finest official cell of the same generation whose polygon contains
   the point, tried `subplace` → `subdistrict` → `municipality` → `district` → `province`. Where
   only one official level has geometry — as in India, whose other levels are geometry-free
   cells — only that level can ever match, and the rest are inert.
7. **Drop what the official layer does not cover.** A locality with no official parent that lies
   further than `PLACES_COVERAGE_SLACK_M` metres (default `2000`, `off` to disable) from *every*
   official cell with geometry is deleted and counted. A regional OSM extract covers more ground
   than one state's official layer, and without this the tier carries cells on ground the pack
   has no official data for. The ingest **refuses** when the official layer holds no geometry at
   all, rather than keeping everything and looking filtered.
8. **Mark the duplicates.** Where a locality's name matches its official parent's,
   case-insensitively and trimmed, set `codes.same_name_as_parent = true`. One place can legitimately
   carry both an official cell and an unofficial one — OSM's `village` often names the same ground as
   an official village — and this makes that visible without deciding what to do about it. A host
   should prefer the official cell where the mark is set: a government behind it and a code to store
   beats a matching name.

The localities go in the **same generation as the official cells they hang from**. A separate
generation would leave every one of them with no parent, which is why the ingest takes the
generation on the command line and refuses to assume one.

## Output

`areas` rows with `kind = 'locality'` and point geometry; see `schema.sql`:

| Column | Meaning |
|---|---|
| `area_id`, `generation`, `country` | Key. The id is seeded as in step 5. |
| `name` | The OSM `name` tag, unmodified |
| `kind` | Always `locality` |
| `codes.place` | The source's own `place` value (`village`, `suburb`, …) |
| `codes.same_name_as_parent` | Present and `true` only where step 8 set it |
| `codes.osm_type`, `codes.osm_id` | The feature behind the cell |
| `parent_ids` | The official parent from step 6; empty where the covered ground has no official cell at that point |
| `geom` | A point, EPSG:4326 |

**An empty `parent_ids` is not an error**, and after step 7 it means one thing rather than two: ground
the official layer covers, whose cities its finest level does not tile. Urban India is the case —
a municipal corporation is one official cell containing hundreds of named neighbourhoods.

## Provenance

Each build records in `pack_meta.sources.places_osm` the extract URL, its sha256, the OSM
replication timestamp, the vintage, the ten `place` values, the id seed format, this repository's
URL as `method`, the coverage rule (`coverage_slack_m`) and what it cost
(`dropped_outside_coverage`), and the ODbL credit. A pack therefore states **which rule it was
filtered by and what the rule dropped**, because a cell count alone cannot distinguish an extract
that covered one state from one that covered three.

## Running it

Needs Node 20, `osmium-tool`, `curl`, and PostGIS 3.4 holding the official layer described above
in the same generation.

```
npm install
DATABASE_URL=postgres://… PACK_COUNTRY=IN PACK_GENERATION=<generation> \
  PLACES_PBF_URL=https://download.geofabrik.de/asia/india/western-zone-260101.osm.pbf \
  PACK_CACHE=./cache node ingest-osm-places.js
```

`PLACES_COVERAGE_SLACK_M` overrides the 2 km coverage slack; `off` takes the whole extract.

## Corrections

Place names are corrected in OpenStreetMap itself, never in this layer. A fix made in OSM appears in
the next build — with a new id if the feature was deleted and redrawn rather than edited, which is
what the vintage in the seed exists to keep separable.

---

## Keeping this in step

These files are copies of `services/places-ingest/` in the (private) Fascia Places repository, which
is the source of truth. Every change to a method there is republished here **before** a generation
built with it is served.

**That rule was not kept, and this commit is the repair.** Checked on 29 October 2026 rather than
assumed: every file here had drifted from the source.

- `pack-meta.js` still took `(client, generation, key, value)` where the source had taken
  `(client, country, generation, key, value)` since a second country was added, and `schema.sql`
  still had `pack_meta` keyed on `generation` alone. So the method published here **would not run**
  against the schema it describes.
- `ingest-streets.js` had gained the road-statistics pass (step 7) and was 35 lines shorter here
  than at source, so part of what is derived from OSM was not described at all.
- `schema.sql` was a 61-line extract of a 324-line file; `db.js` was missing a function.

**What had *not* drifted, which is worth stating because we checked it specifically:**
`street-name.js` differed only in its comments — the normalisation rules are byte-identical, so no
`street_id` ever depended on an unpublished rule. The merge in step 5 changed shape but not
meaning: unnamed ways now pass through the clip to be measured and are filtered out before the
merge, where before they were filtered on the way in. **No street row and no street id published
by Fascia Places was produced by a method absent from this repository.** The gap was that the
method here was incomplete and no longer runnable, not that it was wrong about the data.

All of it is refreshed above, and the localities method is published here for the first time,
before any generation containing it is served anywhere.

The lesson worth writing down: this repository is a licence obligation, not documentation, and
nothing in the build fails when it goes stale. It has to be checked against the source rather than
remembered.
