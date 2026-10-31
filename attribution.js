// Credits a pack's sources require, in one place because more than one entry point records
// them: the full ingest writes one with the rest of a layer's provenance, and
// record-attribution.js merges one into a pack that is already loaded. Two copies of a legal
// statement is two statements.
//
// `text` is the short line that goes under a map. `statement` is the full acknowledgement in
// the rights holder's own words, for a licence or about screen. The API reads both out of
// pack_meta and serves them; see services/places-api/server.js, packFacts().

// Statistics South Africa, Census 2011 main place / sub-place — the `mdb-zaf-2020` generation.
// Still loaded and no longer the default: production's default is `stats-sa-2022`, below, and has
// been since 22 October 2026. A host reading /v1/places/generation without naming a generation gets
// the 2022 statement, so do not read this one as what a licence screen shows.
//
// Stats SA require acknowledgement and, on 20 October 2026, supplied the wording they accept.
// Two departures from the words they sent, both of which narrow what is claimed: their wording
// names the 2022 EA/placename framework, and this generation serves Census 2011 place names and
// no enumeration areas at all. Claiming the 2022 vintage or the EA framework would be claiming
// data this pack does not hold. Their reply allowed "something similar"; this exact text went
// back to them on 20 October as a confirmation and was answered on 27 October 2026 -- "Your
// wording is acceptable". See packs/SOURCES.md § Stats SA conditions of use.
const STATS_SA_CENSUS_2011 = {
  source: "Statistics South Africa",
  text: "Boundaries © Statistics South Africa, Census 2011 main place / sub-place framework",
  url: "https://www.statssa.gov.za/",
  license: "Stats SA copyright and licensing terms; not resold as a standalone product",
  statement:
    'Fascia uses the official Statistics South Africa ("Stats SA") Census 2011 placename ' +
    "geographic framework as the underlying spatial reference layer, acknowledges Stats SA " +
    "as the source and rights holder of that placename framework, and confirms that the " +
    "placename boundaries are not supplied, sold, or charged for as a standalone product " +
    "but are made available only in accordance with Stats SA's applicable copyright and " +
    "licensing terms; any fees charged by Fascia relate solely to Fascia's proprietary " +
    "data, analysis, outputs, or other value-added commercial content created by Fascia " +
    "and spatially linked to the placename boundary framework.",
};

// Statistics South Africa, Census 2022 main place / sub-place -- the generation we move to.
//
// This is the wording Stats SA sent on 20 October 2026, with ONE edit rather than the two the
// 2011 statement needs: their sentence names the 2022 framework, which is now the vintage we
// serve, so only "EA/placename" is narrowed to "placename". This pack holds the place-name
// layers and no enumeration areas at any vintage, and claiming the EA framework would claim
// data we do not hold. Stats SA approved that narrowing on 27 October 2026, answering the
// 20 October confirmation with "Your wording is acceptable", so this is the live text and it
// is theirs apart from that one word.
const STATS_SA_CENSUS_2022 = {
  source: "Statistics South Africa",
  text: "Boundaries © Statistics South Africa, Census 2022 main place / sub-place framework",
  url: "https://www.statssa.gov.za/",
  license: "Stats SA copyright and licensing terms; not resold as a standalone product",
  statement:
    'Fascia uses the official Statistics South Africa ("Stats SA") 2022 placename ' +
    "geographic framework as the underlying spatial reference layer, acknowledges Stats SA " +
    "as the source and rights holder of that placename framework, and confirms that the " +
    "placename boundaries are not supplied, sold, or charged for as a standalone product " +
    "but are made available only in accordance with Stats SA's applicable copyright and " +
    "licensing terms; any fees charged by Fascia relate solely to Fascia's proprietary " +
    "data, analysis, outputs, or other value-added commercial content created by Fascia " +
    "and spatially linked to the placename boundary framework.",
};

// Survey of India, Administrative Boundary Database 2025 -- the `in-abdb-2025` generation.
//
// ACKNOWLEDGEMENT IS A CONDITION OF THE PERMISSION, not a courtesy. The Online Maps Portal team
// answered on 15 October 2026 that no prior permission is required for the ABDB, that no
// alteration is permitted, and that "due acknowledgement to Survey of India must be provided in
// the publication". Two of those three were enforced in code from the day the pack was built --
// `geometry_export: false` carries the no-alteration reading -- and the third was not. This
// object lived inline in ingest-soi.js and was recorded WITHOUT `attribution_required`, so
// packFacts() skipped it and the credit reached no response, while packs/SOURCES.md said "the
// acknowledgement rides on every response carrying these cells". Fixed 29 October 2026, before
// the pack is served anywhere. See packs/SOURCES.md § Survey of India conditions of use.
//
// NO `statement`, DELIBERATELY. The contract defines that field as the acknowledgement "in that
// rights holder's own words, present only where one has been supplied". Stats SA supplied theirs
// and approved a narrowing of it, so they have one. Survey of India prescribed no form of words
// at all -- only that acknowledgement be given -- so writing a sentence here and serving it in
// `statement` would tell a host that SOI approved wording they have never seen. `text` is the
// acknowledgement, and it is what their condition asks for.
const SURVEY_OF_INDIA_ABDB = {
  source: "Survey of India",
  text: "© Survey of India, Administrative Boundary Database",
  url: "https://surveyofindia.gov.in/pages/administrative-boundary-data-base-abdb-",
  license: "Permission confirmed 2026-10-15/16: no alteration, acknowledgement required, NGP 2022",
};

// OpenStreetMap contributors, ODbL 1.0 -- the locality (`LOC`) tier of the India pack.
//
// The locality layer recorded `source`, `license` and `url` as loose provenance keys from the day
// it was built and recorded no credit object at all, so packFacts() had nothing to push: a
// response carrying OSM-derived cells carried no OSM credit. The streets layer has always been
// credited in the documentation and the locality tier was simply never wired up. Fixed
// 29 October 2026.
//
// `text` is the form the OSM copyright page itself names, which is why it is not paraphrased.
// No `statement`, for the reason given above the SOI constant: ODbL prescribes that attribution
// be given and names this short form, and it does not supply a longer sentence of its own.
//
// THE METHOD URL IS NOT IN HERE. ODbL share-alike is met by publishing the method, and that URL
// belongs in the layer's provenance (`method` in ingest-osm-places.js), not in the credit a host
// renders. Adding an unenumerated key to a credit object is how a host's transport quietly drops
// things -- see docs/HOST-ADVANCE-OS.md for the three components that have already gone that way.
const OSM_ODBL = {
  source: "OpenStreetMap contributors",
  text: "© OpenStreetMap contributors",
  url: "https://www.openstreetmap.org/copyright",
  license: "Open Database License (ODbL) 1.0",
};

// Municipal Demarcation Board -- the ADM1-ADM4 polygons, every vintage and both routes.
//
// WE TOLD THE CUSTODIAN WE DO THIS, IN WRITING, AND WE DID NOT. The letter sent to the MDB on
// 21 October 2026 says: "We credit the Municipal Demarcation Board as the source wherever those
// boundaries are used." Measured against production on 31 October 2026, no response that carries
// those boundaries credited them, and `GET /v1/places/generation` -- which docs/API.md calls "the
// whole display duty for that country and generation" -- named three rights holders of six.
// `GET /v1/places/geojson?kind=ward` returned MDB ward polygons under a credit to Statistics
// South Africa and OpenStreetMap, neither of whom supplied a cell in it.
//
// The cause is the same one found twice on 29 October 2026 and fixed twice without being swept:
// ingest-mdb.js recorded `polygons_adm` with a `license` and no `attribution_required`, so
// packFacts() skipped it. Survey of India and the OSM locality tier were the two layers somebody
// happened to be looking at; this is the oldest layer in the pack and nobody looked. Held now by
// scripts/check-pack-credits.js, which fails the build on a licensed layer that reaches no
// response -- the class rather than the instance.
//
// AN ACKNOWLEDGEMENT OF SOURCE, NOT AN ASSERTION OF COPYRIGHT. MDB demarcates municipal and ward
// boundaries; a provincial boundary is constitutional and not theirs to demarcate. "(c) Municipal
// Demarcation Board" across ADM1 would claim for them something they do not claim, so `text`
// credits them as the source of the layer, which is both true of all four levels and the wording
// the letter used.
//
// NO `statement`. The MDB prescribed no form of words -- their answer of 22 October 2026 was that
// the data is self-service, no licence and no fee. Writing a sentence here and serving it in
// `statement` would tell a host the MDB approved wording they have never seen. Same reasoning as
// the Survey of India constant above.
const MDB_DEMARCATION = {
  source: "Municipal Demarcation Board",
  text: "Administrative boundaries: Municipal Demarcation Board, South Africa",
  url: "https://www.demarcation.org.za/",
  license: "MDB open data; attribute the Municipal Demarcation Board",
};

// geoBoundaries -- the route the ADM1-ADM4 polygons reach us by, and a second rights holder on
// one layer.
//
// `polygons_adm` is a two-party layer: the MDB demarcated the boundaries and geoBoundaries
// publishes the copy we actually ingested, under CC BY 3.0 IGO, by way of OCHA ROSEA. CC BY
// requires crediting the licensor, so representing only one of the two would be choosing which
// obligation to break. That is why packFacts() now accepts a LIST of credits for one layer: the
// provenance shape allowed exactly one per layer, which quietly made a two-party chain
// unrepresentable and is part of why this went unnoticed.
//
// THE 2026 WARD LAYER LEAVES THIS CHAIN. From 4 November 2026 the wards come straight from MDB's
// own portal, so geoBoundaries is the publisher of ADM1-ADM3 only and `polygons_ward_mdb` carries
// the MDB credit alone. mergeCredits() unions the layer lists, so the MDB appears once naming both
// layers and geoBoundaries once naming one.
//
// NO `statement`, AND THE CITATION FORM IS NOT SETTLED. geoBoundaries asks to be cited in a
// particular academic form which we have not confirmed with them. Crediting them by name under the
// licence they release is defensible and is strictly better than the nothing that was served
// before; the exact form is a letter, as it was for Stats SA, Survey of India and the MDB. Recorded
// as an open item in packs/SOURCES.md rather than guessed at here.
const GEOBOUNDARIES_GBOPEN = {
  source: "geoBoundaries",
  text: "Boundaries via geoBoundaries (gbOpen), after OCHA ROSEA",
  url: "https://www.geoboundaries.org/",
  license: "CC BY 3.0 IGO",
};

// GeoNames -- the `points_geonames` layer, CC BY 4.0, credited nowhere until 31 October 2026.
//
// The second layer the sweep found. ingest-geonames.js recorded `license: "CC BY 4.0"` and no
// credit, and `GET /v1/places/geonames` carries no `attribution` field at all -- not an empty one,
// none -- so a host rendering GeoNames dots had nothing to show even if it looked. The populated
// places are labels rather than harvest cells, which is probably why nobody looked; a licence
// condition does not weaken with the importance of the layer.
//
// `© GeoNames` is the short form GeoNames' own pages use, with the link the licence asks for. No
// `statement`: they prescribe none.
const GEONAMES_CCBY = {
  source: "GeoNames",
  text: "© GeoNames",
  url: "https://www.geonames.org/",
  license: "CC BY 4.0",
};

module.exports = {
  STATS_SA_CENSUS_2011,
  STATS_SA_CENSUS_2022,
  SURVEY_OF_INDIA_ABDB,
  OSM_ODBL,
  MDB_DEMARCATION,
  GEOBOUNDARIES_GBOPEN,
  GEONAMES_CCBY,
};
