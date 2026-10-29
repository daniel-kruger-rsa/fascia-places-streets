// The identity of a locality: piece 3 of docs/DESIGN-locality-tier.md.
//
// A locality's `area_id` is minted from its OpenStreetMap feature, never from its name.
// The design's reason, measured: 39.5% of `same` crosswalk verdicts in the South African
// pack are renames, so a label is a poor key even for official cells -- and an OSM place
// name is crowd-mutable, which is worse.
//
//   fascia-loc:<vintage>:<osm_type>/<osm_id>
//
// WHY THE TYPE IS IN THE SEED, and this is the whole reason this file is separate and tested:
// an OSM id is unique only WITHIN its type. Node 123, way 123 and relation 123 are three
// different objects that all exist. A seed built from the id alone would mint one `area_id`
// for all three and silently merge them into one cell -- a cell with one name, one point and
// two or three features behind it, which no count, no parent chain and no response shape would
// reveal. The measurement behind the radius decision found 1.5% of named place features are
// ways or relations rather than nodes, so the collision is not hypothetical.
//
// WHY THE VINTAGE IS IN THE SEED: OSM reuses nothing, but it does delete and redraw. A feature
// deleted and re-created is a new object with a new id, which the crosswalk handles; a pack
// rebuilt from a later extract is a new vintage, and ids that carry it let two vintages sit in
// one database without one silently standing in for the other. Same rule as the 2026 wards,
// whose seed is `fascia-za-ward:2026:<WardID>`.
//
// Changing anything here changes every locality id, so treat it as a new vintage.
const crypto = require("crypto");

const OSM_TYPES = new Set(["node", "way", "relation"]);

// Matches the seeding used by every other layer: sha1 over the "fascia-places" namespace,
// shaped into a v5 UUID. Kept identical on purpose -- an id scheme that varies per layer is
// one more thing to get wrong.
function uuidFrom(s) {
  const h = crypto.createHash("sha1").update("fascia-places").update(String(s)).digest();
  h[6] = (h[6] & 0x0f) | 0x50;
  h[8] = (h[8] & 0x3f) | 0x80;
  const hex = h.subarray(0, 16).toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

// The seed, as a string, so a pack can record what an id was made from and a person can
// reproduce one by hand. Every argument is checked rather than coerced: a silently coerced
// type or id mints a well-formed uuid for the wrong thing, and nothing downstream can tell.
function localitySeed(vintage, osmType, osmId) {
  const v = String(vintage == null ? "" : vintage).trim();
  if (!/^\d{4}(-\d{2}(-\d{2})?)?$/.test(v)) {
    throw new Error(`locality vintage must be a year or an ISO date, got ${JSON.stringify(vintage)}`);
  }
  const t = String(osmType == null ? "" : osmType).trim().toLowerCase();
  if (!OSM_TYPES.has(t)) {
    throw new Error(`osm_type must be node, way or relation, got ${JSON.stringify(osmType)}`);
  }
  // An OSM object id is a positive integer. Some tools emit negative ids for objects that do
  // not exist upstream yet; one of those in a pack would be an id nobody can resolve.
  if (!Number.isInteger(osmId) || osmId <= 0) {
    throw new Error(`osm_id must be a positive integer, got ${JSON.stringify(osmId)}`);
  }
  return `fascia-loc:${v}:${t}/${osmId}`;
}

function localityId(vintage, osmType, osmId) {
  return uuidFrom(localitySeed(vintage, osmType, osmId));
}

module.exports = { localityId, localitySeed, uuidFrom, OSM_TYPES };
