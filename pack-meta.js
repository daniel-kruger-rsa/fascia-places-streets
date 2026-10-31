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
//
// AND THAT CLAIM WAS FALSE WHEN IT WAS WRITTEN. "The one place every provenance write passes
// through" described recordSource() while two other writers existed: record-pack-facts.js carried
// its own copy of the merge SQL, and ingest-mdb-wards.js a third, built with raw jsonb_set and not
// requiring this module at all. The ward ingest is the one due to run on 4 November 2026, and the
// vintage_source it writes for the new ward layer went through the only path the guard could not
// see. Found on 31 October 2026 by reading the ingest that was about to run. Both writers now come
// through mergeSource() below, which is what makes the sentence above true.
const VINTAGE_SOURCE_WORD = /^(read|asserted)\b/;

function assertOneVintage(country, generation, key, adm, info) {
  if (!info || typeof info !== "object") return;
  const src = info.vintage_source;
  if (src === undefined || src === null) return;
  if (typeof src !== "string" || !VINTAGE_SOURCE_WORD.test(src.trim())) {
    throw new Error(
      `${country}/${generation} ${key} ${adm}: vintage_source must begin with the word "read" `
      + `or "asserted" -- a host is told to branch on it. Got ${JSON.stringify(src)}`,
    );
  }
}

function assertVintageSource(country, generation, key, value) {
  const vintages = (value && value.vintages) || {};
  for (const [adm, info] of Object.entries(vintages)) {
    assertOneVintage(country, generation, key, adm, info);
  }
}

// The same guard, for a patch aimed at a path inside a layer rather than at the layer. Three shapes
// reach here and each puts the vintage object somewhere different, which is the whole reason this
// function exists rather than one regex at the top:
//
//   [layer]                      the patch is a layer value; the vintages hang off `.vintages`
//   [layer, "vintages"]          the patch IS the vintages map, keyed by adm level
//   [layer, "vintages", "ADM4"]  the patch IS one vintage object
//
// THE MIDDLE ONE WAS MISSING and would have passed anything. It is not hypothetical: it is the
// shape ingest-mdb-wards.js was changed to on 31 October 2026, so the ward layer's vintage_source
// would have gone unchecked through the second path in two days -- the same bypass this guard was
// written to close, one shape along. scripts/test-pack-meta.js now asserts all three.
function assertVintagePatch(country, generation, pathArr, patch) {
  if (pathArr.length >= 3 && pathArr[1] === "vintages") {
    assertOneVintage(country, generation, pathArr[0], pathArr[2], patch);
    return;
  }
  if (pathArr.length === 2 && pathArr[1] === "vintages") {
    for (const [adm, info] of Object.entries(patch || {})) {
      assertOneVintage(country, generation, pathArr[0], adm, info);
    }
    return;
  }
  assertVintageSource(country, generation, pathArr[0], patch);
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

// A MERGE INTO PART OF A LAYER, which is the other way provenance gets written.
//
// recordSource() replaces a layer's whole value, which is right for the ingest that owns the
// layer: it holds the source hashes, the unit counts and the corrections report, and a rerun
// should rewrite all of them. This one adds or changes keys underneath, for the two cases where
// the writer does not own everything it is touching:
//
//   a credit that arrived after the data        record-pack-facts.js, whole layer
//   one adm level inside a shared layer         ingest-mdb-wards.js owns ADM4 of polygons_adm
//                                               and must leave ADM1-ADM3 alone
//
// `path` is the full key path under `sources`, so a deep write stays deep: jsonb's `||` is a
// SHALLOW merge, and merging {vintages: {ADM4: …}} at the layer would replace the whole vintages
// object and silently drop the other three levels' years.
//
// RETURNS THE ROW COUNT, and callers must look at it. The ward ingest's own UPDATE discarded it,
// so a (country, generation) pair matching no pack_meta row wrote nothing, recorded no vintage and
// still printed `ok: true` -- a layer loaded and labelled as the vintage it replaced.
async function mergeSource(client, country, generation, path, patch) {
  const c = String(country || "ZA").toUpperCase();
  const pathArr = Array.isArray(path) ? path : [path];
  assertVintagePatch(c, generation, pathArr, patch);
  const { rowCount } = await client.query(
    `UPDATE pack_meta
        SET sources = jsonb_set(
              sources,
              $3::text[],
              COALESCE(sources #> $3::text[], '{}'::jsonb) || $4::jsonb,
              true)
      WHERE country = $1 AND generation = $2`,
    [c, generation, pathArr, JSON.stringify(patch)],
  );
  return rowCount;
}

module.exports = { recordSource, mergeSource, assertVintageSource, assertVintagePatch };
