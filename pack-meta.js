// Records provenance for one layer of a country's pack generation without clobbering the
// others. pack_meta.sources is a JSON object keyed by layer: { polygons_adm: {...}, … }.
// A generation belongs to a (country, generation) pair: census years differ by country, so
// South Africa can sit on 2011 cells while another pack is already on its own newer vintage.
// A `vintage_source` must say whether its date was READ or ASSERTED, in its first word.
//
// 0.31.0 publishes this string on /v1/places/layers and tells a host to branch on that word
// before showing a vintage to a person: an asserted date can be approximate -- GeoNames
// regenerates daily and stamps no version, so ours is the day we downloaded it -- while a
// demarcation year is exact. Those were indistinguishable on the wire until the field existed.
//
// IT WAS A CONVENTION FOR ONE AFTERNOON AND ALREADY BROKEN. Four of South Africa's ten layers
// read `read from geoBoundaries …`, written when the string was prose for us rather than a field
// for a host. Measured against the real pack on 30 October 2026, after the contract text telling
// hosts to branch on the prefix was already written and green. A documented prefix held by
// convention is the same failure this repository has found five times in a week, so it is held
// here instead -- at the one place every provenance write passes through -- and an ingest that
// would record an unbranchable string fails rather than publishing one.
const VINTAGE_SOURCE_WORD = /^(read|asserted)\b/;

function assertVintageSource(country, generation, key, value) {
  const vintages = (value && value.vintages) || {};
  for (const [adm, info] of Object.entries(vintages)) {
    if (!info || typeof info !== "object") continue;
    const src = info.vintage_source;
    if (src === undefined || src === null) continue;
    if (typeof src !== "string" || !VINTAGE_SOURCE_WORD.test(src.trim())) {
      throw new Error(
        `${country}/${generation} ${key} ${adm}: vintage_source must begin with the word "read" `
        + `or "asserted" -- a host is told to branch on it. Got ${JSON.stringify(src)}`,
      );
    }
  }
}

async function recordSource(client, country, generation, key, value) {
  const c = String(country || "ZA").toUpperCase();
  assertVintageSource(c, generation, key, value);
  await client.query(
    `INSERT INTO pack_meta (country, generation, sources)
     VALUES ($1, $2, jsonb_build_object($3::text, $4::jsonb))
     ON CONFLICT (country, generation) DO UPDATE
       SET sources = pack_meta.sources || jsonb_build_object($3::text, $4::jsonb),
           loaded_at = now()`,
    [c, generation, key, JSON.stringify({ ...value, loaded_at: new Date().toISOString() })],
  );
}

module.exports = { recordSource, assertVintageSource };
