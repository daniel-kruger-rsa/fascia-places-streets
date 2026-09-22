// Records provenance for one layer of a pack generation without clobbering the others.
// pack_meta.sources is a JSON object keyed by layer: { polygons_adm: {...}, places_census: {...}, points_geonames: {...} }.
async function recordSource(client, generation, key, value) {
  await client.query(
    `INSERT INTO pack_meta (generation, sources)
     VALUES ($1, jsonb_build_object($2::text, $3::jsonb))
     ON CONFLICT (generation) DO UPDATE
       SET sources = pack_meta.sources || jsonb_build_object($2::text, $3::jsonb),
           loaded_at = now()`,
    [generation, key, JSON.stringify({ ...value, loaded_at: new Date().toISOString() })],
  );
}

module.exports = { recordSource };
