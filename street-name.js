// Street-name normalisation. The normalised name groups OSM ways into one street per
// sub-place and seeds the street_id, so changing these rules changes street ids: treat
// a change here like a new generation. Search (later) must normalise queries the same way.
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
