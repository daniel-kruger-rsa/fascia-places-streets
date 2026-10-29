// Records provenance for one layer of a country's pack generation without clobbering the
// others. pack_meta.sources is a JSON object keyed by layer: { polygons_adm: {...}, … }.
// A generation belongs to a (country, generation) pair: census years differ by country, so
// South Africa can sit on 2011 cells while another pack is already on its own newer vintage.
async function recordSource(client, country, generation, key, value) {
  const c = String(country || "ZA").toUpperCase();
  await client.query(
    `INSERT INTO pack_meta (country, generation, sources)
     VALUES ($1, $2, jsonb_build_object($3::text, $4::jsonb))
     ON CONFLICT (country, generation) DO UPDATE
       SET sources = pack_meta.sources || jsonb_build_object($3::text, $4::jsonb),
           loaded_at = now()`,
    [c, generation, key, JSON.stringify({ ...value, loaded_at: new Date().toISOString() })],
  );
}

module.exports = { recordSource };
