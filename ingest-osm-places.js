// The locality tier: named OpenStreetMap `place=*` features as cells. Pieces 2 and 3 of
// docs/DESIGN-locality-tier.md. Touches only the `locality` rows of its generation.
//
// WHY THIS LAYER EXISTS, in one measurement. Greater Mumbai's official cells are 24 lettered
// administrative wards subdivided into 227 numbered electoral wards, so `F/South - Ward No.
// 203` is the name a member would be offered. 0 of a host's 499 Mumbai register rows match an
// official cell by name and never will -- the two naming systems do not intersect. The same
// bounding box holds 1,295 named OSM place features, which match 158 of the 499.
//
// A LOCALITY IS A POINT, and that is the tier rather than a gap. OSM names a neighbourhood
// without drawing it, and inventing a polygon would be a lie the code then has to remember.
// So `/point` never resolves a locality by containment; a locality is reached by name, and
// (once piece 5 lands) offered by proximity with a distance in `meters`. A hit carries `lng`
// and `lat` and NO `bbox`: a point's extent is zero, and `[x, y, x, y]` is a degenerate box
// that a host's pipeline is right to reject.
//
//   PACK_COUNTRY=IN PACK_GENERATION=in-osm-2026 \
//     PLACES_PBF_URL=https://download.geofabrik.de/asia/india/western-zone-260101.osm.pbf \
//     node ingest-osm-places.js
//
// ODbL 4.6 -- SHARE-ALIKE ON THE METHOD. This file and locality-id.js are the method by which
// a produced work is derived from OSM, and they are published beside the streets method at
// github.com/daniel-kruger-rsa/fascia-places-streets. Republish whenever either changes, and
// before a generation built with it is served. See packs/SOURCES.md.
//
// Run order: the official layers of this generation must be loaded FIRST. A locality's parent
// is the finest official cell that contains its point, and a locality with no official parent
// cannot be bounded by one in the crosswalk (piece 4) -- so the count of those is reported
// rather than left to be discovered.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const readline = require("readline");
const { execFileSync } = require("child_process");
const { connect } = require("./db");
const { recordSource } = require("./pack-meta");
const { localityId, localitySeed } = require("./locality-id");
const { OSM_ODBL } = require("./attribution");

const generation = process.env.PACK_GENERATION;
const country = (process.env.PACK_COUNTRY || "IN").toUpperCase();
const cacheDir = process.env.PACK_CACHE || "/packs/cache";
// western-zone is Maharashtra, Gujarat and Goa -- Geofabrik publishes no Maharashtra extract.
// Confirmed against their own western-zone.poly rather than assumed from the name: Mumbai,
// Pune and Nagpur inside; Bengaluru, Hyderabad and Delhi outside. See tools/locality-radius.
const PBF_URL = process.env.PLACES_PBF_URL
  || "https://download.geofabrik.de/asia/india/western-zone-latest.osm.pbf";

// The tier spans the official-ish end of place=* and the crowd-named end, and the crowd-named
// end is the whole point: those are the words a member uses. Both are taken, and the OSM value
// is recorded per cell in `codes.place` so a host -- or a later decision of ours -- can narrow
// without a re-ingest.
//
// CLOSED, 27-28 October 2026: `village` and `town` can name the same ground as an official SOI
// village, so one place may carry both an official SP cell and an unofficial LOC cell. That is
// not a collision -- the two carry different ids, kinds and `adm` codes, and a host asking for
// one never receives the other -- but a host asking for both sees two cells for one village,
// 15,659 times. Decided: keep every value and let `codes.same_name_as_parent` make the
// duplication visible without deciding it, because dropping `village` would discard 12,053
// cells that are not duplicates. Confirmed by Advance OS on 28 October. This comment described
// the question as open until 29 October 2026, by which time it had been answered twice.
const PLACE_KINDS = [
  "city", "town", "village", "hamlet", "isolated_dwelling",
  "suburb", "quarter", "neighbourhood", "borough", "locality",
];

// The official tiers a locality may hang from, finest first. The first one whose polygon
// contains the locality's point wins. Named per level rather than per country word, because
// `kind` is the local word and these are the levels: see KIND_ADM in places-api/server.js.
const PARENT_KINDS = ["subplace", "subdistrict", "municipality", "district", "province"];

// How far outside the official layer a locality may sit and still be part of this pack. The
// extract is a region and the official layer is a state, so without this the pack serves cells
// for ground it holds no official cell for -- and nothing in such a hit says so, because a
// locality with no parent carries no parent chain, only a point. Measured in metres from the
// nearest official polygon; `off` ingests the whole extract deliberately. See the long note at
// the filter itself for why it is a distance and not a boundary.
const SLACK_RAW = process.env.PLACES_COVERAGE_SLACK_M;
const slackM = SLACK_RAW === "off" ? null : Number(SLACK_RAW === undefined ? 2000 : SLACK_RAW);
if (slackM !== null && !(Number.isFinite(slackM) && slackM >= 0)) {
  console.error(`PLACES_COVERAGE_SLACK_M must be a non-negative number of metres, or "off"; got ${SLACK_RAW}`);
  process.exit(1);
}

function download(url, dest) {
  if (fs.existsSync(dest) && fs.statSync(dest).size > 1_000_000) {
    console.log("cached", path.basename(dest));
    return;
  }
  console.log("download", url);
  execFileSync("curl", ["-fL", "--retry", "3", "-o", dest, url], { stdio: "inherit" });
}

function sha256(file) {
  return new Promise((resolve, reject) => {
    const h = crypto.createHash("sha256");
    fs.createReadStream(file).on("data", (d) => h.update(d)).on("end", () => resolve(h.digest("hex"))).on("error", reject);
  });
}

function replicationTimestamp(pbf) {
  try {
    const out = execFileSync("osmium", ["fileinfo", "-g", "header.option.osmosis_replication_timestamp", pbf]);
    return out.toString().trim() || null;
  } catch {
    return null;
  }
}

// The vintage is in every locality id, so it has to be a fact about the extract rather than
// the day the ingest happened to run. A pack whose vintage is invented is a pack whose ids
// nobody can reproduce -- so this REFUSES rather than defaulting to today or to "latest".
function vintageFrom(pbf, url) {
  if (process.env.PLACES_VINTAGE) return process.env.PLACES_VINTAGE;
  const ts = replicationTimestamp(pbf);
  if (ts && /^\d{4}-\d{2}-\d{2}/.test(ts)) return ts.slice(0, 10);
  // Geofabrik's dated extracts carry the date in the filename (western-zone-260101.osm.pbf).
  const m = /-(\d{2})(\d{2})(\d{2})\.osm\.pbf$/.exec(url);
  if (m) return `20${m[1]}-${m[2]}-${m[3]}`;
  throw new Error(
    "cannot establish the extract's vintage: the pbf header carries no replication timestamp "
    + "and the URL is not a dated Geofabrik extract. Every locality id contains the vintage, so "
    + "set PLACES_VINTAGE explicitly or pin a dated extract -- do not let it default.",
  );
}

// osmium's type_id writes "n240109189" for a node and "a45652402" for an AREA -- never "w" or
// "r" on an exported polygon, which is the thing that silently cost this ingest every polygon
// place on its first real run. 933 of 42,654 features in the western-zone extract carry `a`,
// and they are places like Badlapur, Kalyan and Bhiwandi: named suburbs and towns of the Mumbai
// metropolitan region, which is precisely the ground this tier exists to cover.
//
// An area id encodes its source: a way-based area is way_id * 2, a relation-based area is
// relation_id * 2 + 1. VERIFIED rather than remembered -- `a45652402` decodes to way 22826201
// and `osmium getid w22826201` on the same pbf returns `name=Badlapur, place=town`, matching the
// exported feature exactly; `a45652410` likewise decodes to way 22826205, `name=Kalyan,
// place=suburb`.
//
// Decoding it means a polygon place mints the SAME area_id it would have as a way or relation,
// which is correct: the identity is the OSM feature, not the geometry osmium handed us.
const TYPE_OF = { n: "node", w: "way", r: "relation" };

function featureId(f) {
  const tid = String(f.id || "");
  const num = Number(tid.slice(1));
  if (!Number.isInteger(num) || num <= 0) return null;
  const c = tid[0];
  if (TYPE_OF[c]) return { type: TYPE_OF[c], osmId: num };
  if (c === "a") {
    return num % 2 === 0
      ? { type: "way", osmId: num / 2 }
      : { type: "relation", osmId: (num - 1) / 2 };
  }
  return null;
}

async function loadFeatures(client, seqPath, vintage) {
  const rl = readline.createInterface({ input: fs.createReadStream(seqPath), crlfDelay: Infinity });
  const counts = { read: 0, unparsable: 0, unnamed: 0, other_place: 0, bad_id: 0, kept: 0,
                   by_type: {}, by_place: {} };
  let batch = [];
  const flush = async () => {
    if (!batch.length) return;
    await client.query(
      `INSERT INTO loc_src (area_id, osm_type, osm_id, name, place, geom)
       SELECT a, t, i, n, p, ST_SetSRID(ST_GeomFromGeoJSON(g), 4326)
         FROM unnest($1::uuid[], $2::text[], $3::bigint[], $4::text[], $5::text[], $6::text[])
           AS x(a, t, i, n, p, g)`,
      [batch.map((r) => r.id), batch.map((r) => r.type), batch.map((r) => r.osmId),
        batch.map((r) => r.name), batch.map((r) => r.place), batch.map((r) => r.geom)],
    );
    batch = [];
  };
  for await (const raw of rl) {
    // A GeoJSON text sequence prefixes every record with RS (0x1e), RFC 8142. Stripped exactly
    // as ingest-streets.js has always stripped it. Omitting this made every line fail to parse,
    // and the counters below are the only reason that was visible rather than mysterious.
    const line = raw.replace(/^/, "").trim();
    if (!line) continue;
    counts.read += 1;
    let f;
    try {
      f = JSON.parse(line);
    } catch {
      // COUNTED, not swallowed. The first version did `continue` with no counter, so a run in
      // which NOTHING parsed reported read: 42654 with every other tally at zero -- and then
      // threw "no named place features survived the filter", which was false: nothing reached
      // the filter at all. An error message naming the wrong stage is worse than no message.
      counts.unparsable += 1;
      continue;
    }
    const props = f.properties || {};
    const place = props.place;
    if (!PLACE_KINDS.includes(place)) {
      // tags-filter is a prefilter on the key, not the value; a place=island arrives here.
      counts.other_place += 1;
      continue;
    }
    const name = String(props.name || "").trim();
    if (!name) {
      // A nameless place cannot be a cell a member recognises, and the tier is a name spine.
      counts.unnamed += 1;
      continue;
    }
    // `--add-unique-id=type_id` writes it at the TOP level as `id` ("n16173235"), not into
    // properties. ingest-streets.js reads f.id for the same reason. Reading props["@id"] gave
    // undefined for every feature, which would have surfaced as bad_id on every row once the
    // parse was fixed -- a second round of the same debugging.
    const ident = featureId(f);
    const type = ident?.type;
    const osmId = ident?.osmId;
    let id;
    try {
      id = localityId(vintage, type, osmId);
    } catch {
      // A feature whose type or id osmium did not give us cannot be identified, and a cell
      // with an id minted from a guess is worse than a cell left out. Counted, not kept.
      counts.bad_id += 1;
      continue;
    }
    counts.kept += 1;
    counts.by_type[type] = (counts.by_type[type] || 0) + 1;
    counts.by_place[place] = (counts.by_place[place] || 0) + 1;
    batch.push({ id, type, osmId, name, place, geom: JSON.stringify(f.geometry) });
    if (batch.length >= 2000) await flush();
  }
  await flush();
  // Every line read must land in exactly one tally. This is the check that turned a silent
  // total-parse-failure into a visible one, so it is now an assertion rather than an accident:
  // if the sums stop agreeing, the counting is wrong and no number below can be trusted.
  const tallied = counts.unparsable + counts.unnamed + counts.other_place + counts.bad_id + counts.kept;
  if (tallied !== counts.read) {
    throw new Error(
      `counted ${tallied} outcomes for ${counts.read} features read: the tallies do not account `
      + "for every line, so none of the counts in this run mean what they say",
    );
  }
  return counts;
}

// Every assertion this layer makes about itself, run inside the transaction that writes it.
// Each one throws, because a layer that reports a defect and commits anyway has told a host
// nothing: the ingest's own output is the only place anybody looks.
async function verify(client, vintage) {
  const q = async (sql, params = []) => (await client.query(sql, params)).rows[0];

  const shape = await q(
    `SELECT count(*)::int AS n,
            count(*) FILTER (WHERE ST_GeometryType(geom) <> 'ST_Point')::int AS not_point,
            count(*) FILTER (WHERE geom IS NULL)::int AS no_geom
       FROM areas WHERE generation = $1 AND country = $2 AND kind = 'locality'`,
    [generation, country],
  );
  if (shape.not_point > 0) {
    throw new Error(`${shape.not_point} localities are not points; a locality carries a point by design`);
  }
  if (shape.no_geom > 0) {
    throw new Error(`${shape.no_geom} localities have no geometry; the point is what makes a proximity offer possible`);
  }

  // A zero-extent bbox is the defect option B taught us to look for: the API omits bbox only
  // where geom is NULL, so a point-backed cell would otherwise ship [x, y, x, y]. Asserted
  // here as well as in the API, because this is where the geometry is decided.
  const degenerate = await q(
    `SELECT count(*)::int AS n FROM areas
      WHERE generation = $1 AND country = $2 AND kind = 'locality'
        AND ST_XMin(geom) = ST_XMax(geom) AND ST_YMin(geom) = ST_YMax(geom)`,
    [generation, country],
  );
  if (degenerate.n !== shape.n) {
    throw new Error(
      `${shape.n - degenerate.n} localities have a non-zero extent; every one should be a point, `
      + "and the API's bbox rule depends on it",
    );
  }

  const dupes = await q(
    `SELECT count(*)::int AS n FROM (
       SELECT codes->>'osm_type' AS t, codes->>'osm_id' AS i
         FROM areas WHERE generation = $1 AND country = $2 AND kind = 'locality'
        GROUP BY 1, 2 HAVING count(*) > 1) d`,
    [generation, country],
  );
  if (dupes.n > 0) throw new Error(`${dupes.n} OSM features produced more than one cell`);

  const seeded = await q(
    `SELECT count(*)::int AS n FROM areas
      WHERE generation = $1 AND country = $2 AND kind = 'locality'
        AND codes->>'vintage' <> $3`,
    [generation, country, vintage],
  );
  if (seeded.n > 0) throw new Error(`${seeded.n} localities carry a vintage other than ${vintage}`);

  const parents = await q(
    `SELECT count(*) FILTER (WHERE cardinality(parent_ids) > 0)::int AS linked,
            count(*) FILTER (WHERE cardinality(parent_ids) = 0)::int AS orphan
       FROM areas WHERE generation = $1 AND country = $2 AND kind = 'locality'`,
    [generation, country],
  );
  return { localities: shape.n, parents };
}

async function main() {
  if (!generation) throw new Error("set PACK_GENERATION: this ingest writes into one generation");

  fs.mkdirSync(cacheDir, { recursive: true });
  const pbf = path.join(cacheDir, path.basename(new URL(PBF_URL).pathname));
  download(PBF_URL, pbf);
  const vintage = vintageFrom(pbf, PBF_URL);
  const digest = await sha256(pbf);
  const replication = replicationTimestamp(pbf);
  console.log(JSON.stringify({ pbf: path.basename(pbf), vintage, replication, sha256: digest }));
  // Proves the seed before anything expensive runs, and prints it so a person can reproduce
  // one id by hand from the pack alone.
  console.log("seed example", localitySeed(vintage, "node", 240109189));

  const placesPbf = path.join(cacheDir, "osm-places.osm.pbf");
  const seqPath = path.join(cacheDir, "osm-places.geojsonseq");
  const configPath = path.join(cacheDir, "osm-places-export.json");
  fs.writeFileSync(configPath, JSON.stringify({ linear_tags: false, area_tags: true, include_tags: ["name", "place"] }));

  console.log("osmium tags-filter");
  // nwr: a suburb is as often a polygon as a node. 98.5% are nodes in the western-zone
  // extract, which is a measurement rather than a reason to skip the other 1.5%.
  execFileSync("osmium", ["tags-filter", pbf, `nwr/place=${PLACE_KINDS.join(",")}`, "-O", "-o", placesPbf], { stdio: "inherit" });
  console.log("osmium export");
  execFileSync(
    "osmium",
    ["export", placesPbf, "-c", configPath, "--geometry-types=point,polygon",
      "--add-unique-id=type_id", "-f", "geojsonseq", "-O", "-o", seqPath],
    { stdio: "inherit" },
  );

  const client = await connect(process.env.DATABASE_URL);
  await client.query(fs.readFileSync(path.join(__dirname, "schema.sql"), "utf8"));
  await client.query("SET statement_timeout = '2h'");
  try {
    await client.query("BEGIN");
    await client.query(
      `CREATE TEMP TABLE loc_src (area_id uuid, osm_type text, osm_id bigint, name text,
                                  place text, geom geometry(Geometry, 4326)) ON COMMIT DROP`,
    );
    const counts = await loadFeatures(client, seqPath, vintage);
    console.log("features", JSON.stringify(counts));
    if (!counts.kept) {
      // Name the stage. "Nothing survived the filter" was the message the first run printed
      // while the truth was that nothing had parsed, and it sent the search to the wrong place.
      const where = counts.unparsable === counts.read ? "nothing parsed: check the record separator and the export format"
        : counts.bad_id === counts.read ? "every feature had an unreadable id: check --add-unique-id and where osmium puts it"
        : counts.unnamed === counts.read ? "every place feature was nameless"
        : counts.other_place === counts.read ? "no feature carried a place value in PLACE_KINDS"
        : "a mix of causes";
      throw new Error(`no localities to load from ${counts.read} features read — ${where}. ${JSON.stringify(counts)}`);
    }

    await client.query("CREATE INDEX ON loc_src USING GIST (geom)");
    await client.query("ANALYZE loc_src");

    // Replaces only this layer of this generation. Ids are deterministic, so a re-run with the
    // same extract rewrites the same rows and nothing downstream is orphaned.
    const { rowCount: removed } = await client.query(
      "DELETE FROM areas WHERE generation = $1 AND country = $2 AND kind = 'locality'",
      [generation, country],
    );
    console.log("replaced", removed);

    // A polygon place is reduced to a point: ST_PointOnSurface rather than ST_Centroid, so the
    // point is inside a concave suburb rather than possibly outside it.
    const { rowCount: written } = await client.query(
      `INSERT INTO areas (area_id, name, kind, country, codes, parent_ids, geom, generation)
       SELECT s.area_id, s.name, 'locality', $2::text,
              jsonb_build_object('osm_type', s.osm_type, 'osm_id', s.osm_id::text,
                                 'place', s.place, 'vintage', $3::text),
              '{}'::uuid[],
              CASE WHEN ST_GeometryType(s.geom) = 'ST_Point' THEN s.geom
                   ELSE ST_PointOnSurface(s.geom) END,
              $1::text
         FROM loc_src s
       ON CONFLICT (area_id, generation) DO UPDATE
         SET name = EXCLUDED.name, codes = EXCLUDED.codes, geom = EXCLUDED.geom`,
      [generation, country, vintage],
    );
    console.log("written", written);

    // The parent is the finest official cell containing the point. Finest-first, and a cell
    // already linked is never relinked to a coarser tier.
    const linked = {};
    for (const parentKind of PARENT_KINDS) {
      const { rowCount } = await client.query(
        `UPDATE areas c SET parent_ids = ARRAY[p.area_id]
           FROM areas p
          WHERE c.generation = $1 AND p.generation = $1
            AND c.country = $2 AND p.country = $2
            AND c.kind = 'locality' AND cardinality(c.parent_ids) = 0
            AND p.kind = $3 AND p.geom IS NOT NULL
            AND ST_Contains(p.geom, c.geom)`,
        [generation, country, parentKind],
      );
      if (rowCount) linked[parentKind] = rowCount;
    }

    // OUTSIDE THE GROUND THE OFFICIAL TIER COVERS. The extract is a region, the official layer
    // is a state, and the difference was 6,622 cells on the first run -- reported as
    // `without_official_parent` and described in the design as "mostly Gujarat and Goa", which
    // was an unmeasured claim. Measured 29 October 2026 against that run:
    //
    //     3,722  inside Gujarat's OSM boundary                            dropped
    //       339  Gujarat, in gaps of that boundary's assembled pieces     dropped
    //     1,115  Goa, by bounding box (crude, and said to be crude)       dropped
    //       164  Daman, Dadra and Silvassa -- a separate union territory
    //            -- plus Madhya Pradesh and Telangana border slivers      dropped
    //     1,282  within 2 km of a village polygon                         KEPT
    //
    // All 672 parentless localities in Greater Mumbai are in that last group, 671 of them within
    // 500 m, so the filter keeps the city this tier exists for. The separation is what makes a
    // threshold defensible rather than arbitrary: of 4,837 out-of-state cells only 65 lie within
    // 2 km of our coverage, while 4,121 lie beyond 20 km.
    //
    // WHY NOT A STATE BOUNDARY, which was the first plan. OSM's Maharashtra relation (r1950884)
    // does not assemble from the western-zone extract -- `osmium getid -r` exits 1 on missing
    // members and the ring never closes -- and Goa's (r11251493) fails the same way, while
    // Gujarat's (r1949080) assembles clean. So a boundary clip would need a boundary fetched
    // from somewhere else and maintained per state, and it would still keep Daman and the Madhya
    // Pradesh slivers that a distance to our own coverage drops for nothing.
    //
    // WHY THIS RAISES NO NEW QUESTION ABOUT SOI'S CONDITIONS. It reads their polygons at ingest
    // and stores nothing derived from them, which is exactly what the parent resolution above
    // already does by containment. Same read, same transience, one more predicate. Unioning
    // villages into a boundary -- the thing packs/SOURCES.md records as forbidden -- is what
    // this avoids.
    //
    // WHY NOT SIMPLY "has no official parent". Because that is a different claim, and acting on
    // it would delete the tier's reason to exist: SOI's village layer does not tile cities, so
    // 70% of Greater Mumbai's localities have no parent while sitting squarely inside covered
    // ground. Parentless and out-of-coverage are two populations with one count, and separating
    // them is the whole of this filter.
    let droppedOutside = null;
    if (slackM !== null) {
      const { rows: cov } = await client.query(
        `SELECT count(*)::int AS n FROM areas
          WHERE generation = $1 AND country = $2 AND kind <> 'locality' AND geom IS NOT NULL`,
        [generation, country],
      );
      // A filter that cannot measure anything must say so rather than keep everything: with no
      // official geometry the LATERAL below returns no row, the delete matches nothing, and the
      // run would look filtered while being unfiltered. That is the shape of every defect this
      // pack has turned up, so it throws.
      if (!cov[0].n) {
        throw new Error(
          `${country}/${generation} holds no official cell with geometry, so there is nothing to `
          + "measure a locality's distance against and every locality would be kept silently. "
          + "Load the official layers first, or set PLACES_COVERAGE_SLACK_M=off to take the "
          + "whole extract on purpose.",
        );
      }
      const { rowCount: dropped } = await client.query(
        `WITH beyond AS (
           SELECT l.area_id
             FROM areas l
            CROSS JOIN LATERAL (
              SELECT ST_Distance(l.geom::geography, o.geom::geography) AS metres
                FROM areas o
               WHERE o.generation = $1 AND o.country = $2
                 AND o.kind <> 'locality' AND o.geom IS NOT NULL
               ORDER BY o.geom <-> l.geom
               LIMIT 1
            ) n
            WHERE l.generation = $1 AND l.country = $2 AND l.kind = 'locality'
              AND cardinality(l.parent_ids) = 0
              AND n.metres > $3
         )
         DELETE FROM areas a USING beyond b
          WHERE a.area_id = b.area_id AND a.generation = $1`,
        [generation, country, slackM],
      );
      droppedOutside = dropped;
      console.log(`dropped outside coverage (>${slackM} m from any official cell)`, dropped);
    }

    // THE DUPLICATE MARK. Measured on the first run: of 24,008 OSM `village` localities with an
    // official parent, 15,659 -- 65% -- carry the same name as that parent, so the largest
    // component of this tier is largely a restatement of the official layer. Three options were
    // put to the host; the one their own counts ruled out was keeping them UNMARKED, because
    // 15,659 silent doubles is a confident wrong answer at scale.
    //
    // Decided 27 October 2026 by Daniel Kruger, applying the ruling Hugo van Niekerk made on
    // 23 October: a village keeps its own name and never masquerades as a subplace. Marking
    // preserves exactly that while making the duplication visible, where dropping `village`
    // would have discarded 12,053 cells that are NOT duplicates -- the ground a government
    // does not name usefully, which is the whole reason this tier was asked for.
    //
    // That number read 8,349 here until 28 October 2026. 8,349 is 24,008 - 15,659: villages that
    // HAVE an official parent and do not share its name. It omits the 3,704 villages with no
    // official parent at all (27,712 - 24,008), which cannot carry the mark because there is
    // nothing to compare them against. Both routes to the real figure agree: 8,349 + 3,704 and a
    // direct count of unmarked villages are both 12,053. If you change either count, check that
    // they still agree -- that they do is the only reason the figure can be trusted.
    //
    // It states the fact it measured rather than the conclusion: same name as the official
    // parent. What to do about it is the host's -- they prefer the SP wherever it is set,
    // because a government behind it and a code they can store beats a matching name.
    const { rowCount: marked } = await client.query(
      `UPDATE areas l
          SET codes = l.codes || jsonb_build_object('same_name_as_parent', true)
         FROM areas p
        WHERE l.generation = $1 AND l.country = $2 AND l.kind = 'locality'
          AND p.generation = $1 AND p.area_id = l.parent_ids[1]
          AND lower(btrim(l.name)) = lower(btrim(p.name))`,
      [generation, country],
    );
    console.log("marked as same-named as parent", marked);

    const checks = await verify(client, vintage);
    await recordSource(client, country, generation, "places_osm", {
      source: "OpenStreetMap contributors",
      license: "ODbL 1.0",
      url: "https://www.openstreetmap.org/copyright",
      extract: PBF_URL,
      sha256: digest,
      osm_replication_timestamp: replication,
      vintage,
      place_kinds: PLACE_KINDS,
      // The pack states the rule it was filtered by and what the rule cost, because a cell
      // count alone cannot distinguish an extract that covered one state from one that covered
      // three. `null` means the filter was switched off for this run.
      coverage_slack_m: slackM,
      dropped_outside_coverage: droppedOutside,
      // The credit the API serves, as against the three loose provenance keys above. Those
      // record where the data came from for a person reading pack_meta; these two are read by
      // packFacts(), and both are required before any credit is emitted. Until 29 October 2026
      // this layer recorded neither, so every OSM-derived locality was served with no ODbL
      // attribution at all -- the one condition ODbL asks for unconditionally.
      attribution_required: true,
      attribution: OSM_ODBL,
      id_seed: "fascia-loc:<vintage>:<osm_type>/<osm_id>",
      // How ODbL share-alike is met: the method that produced this derivative database is
      // published, per clause 4.6, the same way the streets layer meets it. Provenance rather
      // than credit, deliberately -- it is a URL an auditor follows, not a line a host renders.
      // **Any change to the locality method here is republished there before a generation built
      // with it is served**, which is the same rule packs/SOURCES.md states for streets.
      method: "https://github.com/daniel-kruger-rsa/fascia-places-streets",
      note:
        "Named place=* features as the LOC tier. A locality is a point: OSM names a "
        + "neighbourhood without drawing it, so this layer never answers /point by containment.",
    });
    await client.query("COMMIT");

    console.log(JSON.stringify({
      ok: true, country, generation, kind: "locality", vintage,
      localities: checks.localities,
      parents_linked: linked,
      with_official_parent: checks.parents.linked,
      // A host reads this field, so a host's transport can drop it -- and a dropped mark does
      // not error, it silently produces the unmarked option, which is the one the measurement
      // ruled out. Reported here every run so the count is never only in a comment.
      same_name_as_parent: marked,
      // Not a failure, and since 29 October 2026 it means one thing instead of two. Cells
      // outside the official layer's ground are dropped above, so what is left here is ground
      // the pack DOES cover officially and whose cities the village layer does not tile --
      // Mumbai, overwhelmingly. It IS the ceiling on piece 4: the parent-bounded crosswalk
      // cannot bound a cell that has no official parent. Reported every run, and worth reading
      // beside dropped_outside_coverage rather than alone.
      without_official_parent: checks.parents.orphan,
      dropped_outside_coverage: droppedOutside,
      by_type: counts.by_type,
      by_place: counts.by_place,
      skipped: { unnamed: counts.unnamed, other_place: counts.other_place, unidentifiable: counts.bad_id },
    }, null, 2));
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
