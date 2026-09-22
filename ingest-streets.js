// Named streets from OpenStreetMap (Geofabrik ZA extract). Touches only the streets table
// of the generation. Labels and search only — never harvest cells.
//
// One row per street per sub-place: OSM splits a road into many ways, so ways are merged by
// normalised name (street-name.js) within each SP and clipped to it. That disambiguates the
// hundreds of "Main Road"s by the SP stack they sit in, and keeps street_id stable across OSM
// edits that only re-split ways. The subplace layer must be loaded first; SP ids are
// deterministic, so re-running the subplace ingest does not orphan streets.
//
// osmium-tool filters and exports the extract (GDAL was rejected for host DNS; do not reintroduce).
// OSM changes daily and Geofabrik's "latest" moves, so the pbf's sha256 and OSM replication
// timestamp go into pack_meta. Pin a dated extract with STREETS_PBF_URL to reproduce a pack.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const readline = require("readline");
const { execFileSync } = require("child_process");
const { connect } = require("./db");
const { recordSource } = require("./pack-meta");
const { normaliseStreetName } = require("./street-name");

const generation = process.env.PACK_GENERATION || "mdb-zaf-2020";
const cacheDir = process.env.PACK_CACHE || "/packs/cache";
const PBF_URL = process.env.STREETS_PBF_URL || "https://download.geofabrik.de/africa/south-africa-latest.osm.pbf";

// highway values that are streets people name and navigate by, most significant first.
// The order ranks the representative class when ways of different classes merge.
// Excluded: footway, path, cycleway, steps, bridleway, corridor, construction, proposed, …
const HIGHWAYS = [
  "motorway", "trunk", "primary", "secondary", "tertiary",
  "motorway_link", "trunk_link", "primary_link", "secondary_link", "tertiary_link",
  "unclassified", "residential", "living_street", "pedestrian", "road", "service", "track",
];

// A street that crosses an SP boundary by less than this (census 2011 lines vs OSM) is not
// listed in that SP — unless the stub is all there is of it.
const MIN_PIECE_M = 25;
const BATCH = 2000;

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

async function insertBatch(client, rows) {
  await client.query(
    `INSERT INTO streets_src (osm_id, name, norm_name, highway, geom)
     SELECT o, n, nn, h, ST_SetSRID(ST_GeomFromGeoJSON(g), 4326)
     FROM unnest($1::bigint[], $2::text[], $3::text[], $4::text[], $5::text[]) AS t(o, n, nn, h, g)`,
    [rows.map((r) => r.osm_id), rows.map((r) => r.name), rows.map((r) => r.norm), rows.map((r) => r.highway), rows.map((r) => r.geom)],
  );
}

// Streams the osmium GeoJSONSeq export into the staging table.
async function loadWays(client, seqPath) {
  const rl = readline.createInterface({ input: fs.createReadStream(seqPath), crlfDelay: Infinity });
  let batch = [];
  let read = 0;
  let kept = 0;
  for await (const raw of rl) {
    const line = raw.replace(/^\x1e/, "").trim();
    if (!line) continue;
    read += 1;
    const f = JSON.parse(line);
    const p = f.properties || {};
    const name = String(p.name || "").trim();
    const norm = name && normaliseStreetName(name);
    const osmId = Number(String(f.id || "").replace(/^w/, ""));
    if (!norm || !HIGHWAYS.includes(p.highway) || !Number.isFinite(osmId) || f.geometry?.type !== "LineString") continue;
    batch.push({ osm_id: osmId, name, norm, highway: p.highway, geom: JSON.stringify(f.geometry) });
    kept += 1;
    if (batch.length === BATCH) {
      await insertBatch(client, batch);
      batch = [];
      if (kept % 50_000 === 0) console.log("ways", kept);
    }
  }
  if (batch.length) await insertBatch(client, batch);
  return { read, kept };
}

async function main() {
  const client = await connect(process.env.DATABASE_URL);
  await client.query(fs.readFileSync(path.join(__dirname, "schema.sql"), "utf8"));
  const sp = await client.query("SELECT count(*)::int AS n FROM areas WHERE generation = $1 AND kind = 'subplace'", [generation]);
  if (!sp.rows[0].n) throw new Error(`no subplaces in generation ${generation}: run the subplace ingest first`);

  fs.mkdirSync(cacheDir, { recursive: true });
  const pbf = path.join(cacheDir, path.basename(new URL(PBF_URL).pathname));
  download(PBF_URL, pbf);
  const highwaysPbf = path.join(cacheDir, "streets-highways.osm.pbf");
  const seqPath = path.join(cacheDir, "streets.geojsonseq");
  const configPath = path.join(cacheDir, "streets-export.json");
  fs.writeFileSync(configPath, JSON.stringify({ linear_tags: true, area_tags: false, include_tags: ["name", "highway"] }));
  console.log("osmium tags-filter");
  execFileSync("osmium", ["tags-filter", pbf, `w/highway=${HIGHWAYS.join(",")}`, "-O", "-o", highwaysPbf], { stdio: "inherit" });
  console.log("osmium export");
  execFileSync(
    "osmium",
    ["export", highwaysPbf, "-c", configPath, "--geometry-types=linestring", "--add-unique-id=type_id", "-f", "geojsonseq", "-O", "-o", seqPath],
    { stdio: "inherit" },
  );

  await client.query(
    `CREATE TEMP TABLE streets_src (osm_id bigint, name text, norm_name text, highway text, geom geometry(LineString, 4326))`,
  );
  const ways = await loadWays(client, seqPath);
  console.log("ways", JSON.stringify(ways));
  await client.query("CREATE INDEX ON streets_src USING GIST (geom)");
  await client.query("ANALYZE streets_src");

  // Subdivided SPs: large rural SPs make ST_Intersects / ST_Intersection slow; the pieces
  // are merged back per SP by the ST_Collect below.
  await client.query(
    `CREATE TEMP TABLE sp_parts AS
     SELECT area_id, COALESCE(codes->>'sp_code', area_id::text) AS sp_code, ST_Subdivide(geom, 255) AS geom
     FROM areas WHERE generation = $1 AND kind = 'subplace'`,
    [generation],
  );
  await client.query("CREATE INDEX ON sp_parts USING GIST (geom)");
  await client.query("ANALYZE sp_parts");

  console.log("clip and merge");
  await client.query("BEGIN");
  await client.query("DELETE FROM streets WHERE generation = $1", [generation]);
  const inserted = await client.query(
    `WITH pieces AS (
       SELECT p.area_id, p.sp_code, r.osm_id, r.name, r.norm_name, r.highway,
              CASE WHEN ST_CoveredBy(r.geom, p.geom) THEN r.geom
                   ELSE ST_CollectionExtract(ST_Intersection(r.geom, p.geom), 2) END AS geom
       FROM streets_src r
       JOIN sp_parts p ON ST_Intersects(r.geom, p.geom)
     ), merged AS (
       SELECT area_id, sp_code, norm_name,
              mode() WITHIN GROUP (ORDER BY name) AS name,
              (array_agg(highway ORDER BY array_position($2::text[], highway)))[1] AS highway,
              array_agg(DISTINCT osm_id ORDER BY osm_id) AS osm_ids,
              ST_Multi(ST_LineMerge(ST_UnaryUnion(ST_CollectionExtract(ST_Collect(geom), 2)))) AS geom
       FROM pieces
       WHERE NOT ST_IsEmpty(geom)
       GROUP BY area_id, sp_code, norm_name
     )
     INSERT INTO streets (street_id, name, norm_name, highway, sp_area_id, osm_ids, length_m, country, generation, geom)
     SELECT md5('fascia-st:' || sp_code || ':' || norm_name)::uuid, name, norm_name, highway, area_id, osm_ids,
            ST_Length(geom::geography), 'ZA', $1, geom
     FROM merged
     WHERE NOT ST_IsEmpty(geom)`,
    [generation, HIGHWAYS],
  );
  const pruned = await client.query(
    `DELETE FROM streets a
     WHERE a.generation = $1 AND a.length_m < $2
       AND EXISTS (
         SELECT 1 FROM streets b
         WHERE b.generation = a.generation AND b.norm_name = a.norm_name AND b.street_id <> a.street_id
           AND b.osm_ids && a.osm_ids AND b.length_m >= $2)`,
    [generation, MIN_PIECE_M],
  );
  await client.query("COMMIT");

  // Ways outside every SP: Lesotho (in the Geofabrik extract) and any census gaps.
  const outside = await client.query(
    `SELECT count(*)::int AS n FROM streets_src r
     WHERE NOT EXISTS (SELECT 1 FROM sp_parts p WHERE ST_Intersects(r.geom, p.geom))`,
  );

  const stats = await client.query(
    `SELECT count(*)::int AS streets, count(DISTINCT sp_area_id)::int AS subplaces,
            round(sum(length_m) / 1000)::int AS km
     FROM streets WHERE generation = $1`,
    [generation],
  );
  const counts = {
    ways_read: ways.read,
    ways_named: ways.kept,
    ways_outside_sp: outside.rows[0].n,
    pieces_inserted: inserted.rowCount,
    stubs_pruned: pruned.rowCount,
    ...stats.rows[0],
  };

  await recordSource(client, generation, "lines_streets", {
    source: PBF_URL,
    license: "ODbL 1.0",
    attribution: "© OpenStreetMap contributors",
    pbf_sha256: await sha256(pbf),
    pbf_bytes: fs.statSync(pbf).size,
    osm_replication_timestamp: replicationTimestamp(pbf),
    highways: HIGHWAYS,
    min_piece_m: MIN_PIECE_M,
    counts,
  });
  fs.rmSync(seqPath, { force: true });
  fs.rmSync(highwaysPbf, { force: true });

  console.log(JSON.stringify({ ok: true, generation, ...counts }));
  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
