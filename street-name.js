// Street-name normalisation. The normalised name groups OSM ways into one street per
// sub-place and seeds the street_id, so changing these rules changes street ids: treat
// a change here like a new generation.
//
// This file exists twice, byte-identical: services/places-ingest (builds the names) and
// services/places-api (normalises search queries the same way). CI compares them; edit both,
// and republish the ingest copy to the public method repo (see packs/SOURCES.md).
//
// Rules, in order: strip diacritics, lowercase, punctuation to spaces, collapse spaces,
// then expand a trailing street-type abbreviation ("Main Rd" and "Main Road" are one street).
// Only the LAST word is expanded, so "St Johns Road" keeps its saint. "Str" is left alone:
// in ZA it is as often Afrikaans "straat" as English "street".
const SUFFIXES = {
  rd: "road",
  st: "street",
  ave: "avenue",
  av: "avenue",
  dr: "drive",
  cres: "crescent",
  cr: "crescent",
  ln: "lane",
  cl: "close",
  pl: "place",
  hwy: "highway",
  blvd: "boulevard",
  sq: "square",
  tce: "terrace",
  ter: "terrace",
};

function normaliseStreetName(name) {
  const words = String(name)
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
  if (words.length > 1 && SUFFIXES[words[words.length - 1]]) {
    words[words.length - 1] = SUFFIXES[words[words.length - 1]];
  }
  return words.join(" ");
}

module.exports = { normaliseStreetName };
