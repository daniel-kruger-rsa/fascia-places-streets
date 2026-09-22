# Fascia Places — streets method

How the named-streets layer of Fascia Places is made from OpenStreetMap.

Fascia Places is a geography service for South African community platforms. Its streets layer is a
**derivative database of OpenStreetMap**, licensed under the
[Open Database License (ODbL) 1.0](https://opendatacommons.org/licenses/odbl/1-0/). This repository
publishes the method of producing that derivative from OSM, as section 4.6 of the ODbL provides, so
anyone can rebuild it from the same public source.

**Street data © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright)**, available under the ODbL.
The code in this repository is MIT-licensed (see `LICENSE`); that licence covers the code only, not the data.

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

Ways that touch no sub-place are dropped and counted.

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
timestamp, the highway list, the stub threshold and the row counts. That record identifies the exact OSM input of any
generation Fascia Places serves.

## Running it

Needs Node 20, `osmium-tool`, `curl`, and PostGIS 3.4 holding the sub-place layer described above.

```
npm install
DATABASE_URL=postgres://… PACK_GENERATION=<generation> PACK_CACHE=./cache node ingest-streets.js
```

`STREETS_PBF_URL` points at a different (e.g. dated) extract.

## Corrections

Street names are corrected in OpenStreetMap itself, never in this layer. A fix made in OSM appears in the next build.

## Keeping this in step

These files are copies of `services/places-ingest/` in the (private) Fascia Places repository, which is the source of
truth. Every change to the method there is republished here before a generation built with it is served.
