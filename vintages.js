// What vintage each layer of a pack represents, and when that vintage stops describing
// what is in force.
//
// WHY THIS EXISTS. The ZA generation is named `mdb-zaf-2020`, and until 21 October 2026 that
// year was an assertion in a string: pack_meta recorded which geoBoundaries commit the polygons
// came from and never the year those boundaries represent. Someone had to read the upstream
// metadata by hand to answer "are we on the 2026 wards?" -- which is the sort of question a
// pack should answer about itself.
//
// KEYED BY GENERATION, because a generation names a vintage. The same layer key means a
// different year in two generations: `places_census` is 2011 in `mdb-zaf-2020` and 2022 in
// `stats-sa-2022`. An earlier draft keyed only on the layer, which would have served the
// 2011 year for 2022 cells -- the same mistake the credit avoids by being generation-keyed.
//
// TWO DIFFERENT THINGS, kept apart because conflating them makes one of them a lie:
//
//   superseded_by    a newer vintage of this layer exists. It does not make ours wrong. A
//                    census is a snapshot, and the 2011 snapshot is still a true description
//                    of 2011.
//   superseded_from  a date after which ours no longer describes what is in force. Only
//                    meaningful where "in force" is a real idea, which for boundaries means
//                    the administrative ones: a ward exists because a delimitation says so.
//
// READ OR ASSERTED, and every entry says which. geoBoundaries ships a metaData.json, so the
// ADM layers' year is read from the source and this file adds only the supersession.
// Stats SA's shapefiles carry no such file, so their year is asserted from the name of the
// release we were sent -- which is weaker evidence, and a reader who cannot tell the two apart
// will trust an assertion the way they trust a measurement. Facts about what replaces what are
// always curated here, because no source publishes its own obsolescence.

// The administrative layers are the same 2020 demarcation in every ZA generation: cutting the
// census layer over to 2022 does not re-source the wards. So the facts are written once and
// shared, rather than copied per generation and drifting.
//
// South Africa's wards are the live case. The Municipal Demarcation Board's 2024/2026
// delimitation was handed to the Electoral Commission in December 2025, and the new wards take
// effect on election day -- 4 November 2026, formally proclaimed. From that morning this pack's
// ADM4 layer describes wards that no longer exist, with nothing in the data to say so. A host
// would have had no way to tell, which is the same failure shape as a readiness flag that
// reports ready while nothing works.
//
// Only ADM4 moves. The MDB decided NOT to redetermine municipal boundaries before these
// elections, so South Africa keeps its 257 municipalities and ADM1-ADM3 stay as they are. That
// is recorded as a positive fact rather than left to inference, because "there is an election,
// so the boundaries change" is the obvious assumption and it is wrong for three of the four.
const MDB_2020 = {
  ADM4: {
    superseded_by: "MDB ward delimitation 2024/2026",
    superseded_from: "2026-11-04",
    note:
      "Wards for the 2026-27 local government elections: 4,485, counted from the MDB's own " +
      "feature service on 22 Oct 2026. The new boundaries take effect on election day, " +
      "proclaimed for 4 November 2026, so this layer is current until then and describes " +
      "wards that do not exist afterwards. Local and district municipalities are unchanged " +
      "for 2026 at 213 and 52, also counted from MDB rather than inferred from reporting.",
    source: "https://www.demarcation.org.za/ward-delimitation-2024-2026/",
  },
};

// Census place names. Dated supersession does not apply: a census is a snapshot rather than
// something in force, and the 2011 sub-places remain a true description of 2011. A newer
// vintage exists and a pack may not have cut over to it, which is a fact about us rather than
// about the data.
const CENSUS_2011 = {
  vintage: "2011",
  vintage_source: "asserted: the release supplied is Stats SA Census 2011 main place / sub-place",
  superseded_by: "Stats SA Census 2022 place names",
  superseded_from: null,
};
const CENSUS_2022 = {
  vintage: "2022",
  vintage_source: "asserted: the release supplied is Stats SA Census 2022 Placenames (MainPlace2022, SubPlace2022)",
  // Nothing newer exists. The next census is a decade out, and claiming a supersession that
  // has not happened would put a false date in front of a host.
  superseded_by: null,
  superseded_from: null,
};

// The OSM-derived locality tier. A crowd-sourced gazetteer is unlike every other layer here, and
// the difference decides what may be written:
//
//   vintage          the extract's replication date, not a year. OSM has no editions, so "2026"
//                    would be a rounding of a fact we hold exactly. It is also in every locality
//                    id -- `fascia-loc:<vintage>:<type>/<osm_id>` -- so it is already load-bearing.
//   superseded_by    always true and still worth saying: a newer extract exists the day after
//                    ours, because OSM is edited continuously. A host that reads this field as
//                    "ours is wrong" would be wrong, which is why the file keeps the two ideas
//                    apart -- see the header.
//   superseded_from  NULL, and not by omission. Nothing proclaims a locality. "In force" is a
//                    real idea for a ward because a delimitation says so; there is no authority
//                    behind a neighbourhood's name, which is the whole reason this tier is
//                    labelled unofficial. A date here would invent one.
//
// THE VINTAGE IS WRITTEN HERE AND READ FROM THE PBF, AND THE INGEST REFUSES IF THEY DISAGREE.
// Two copies of one fact is the drift this repo keeps finding -- the OpenStreetMap credit was
// wrong in two published documents on 29 October 2026 because a check covered code and not
// documents. So this copy exists to pin which extract a generation is allowed to be built from,
// the ingest reads the real one out of `osmosis_replication_timestamp`, and a mismatch stops the
// load rather than producing a pack whose ids say one date and whose layer metadata says another.
const OSM_PLACES_261019 = {
  LOC: {
    vintage: "2026-10-19",
    vintage_source:
      "read: osmosis_replication_timestamp in the header of south-africa-261019.osm.pbf, "
      + "cross-checked against this entry by ingest-osm-places.js",
    superseded_by: "a newer OpenStreetMap extract, which exists continuously",
    superseded_from: null,
    note:
      "OpenStreetMap is edited daily, so a newer extract always exists and this layer is a "
      + "dated snapshot rather than an edition. It is not superseded in the sense the ward "
      + "layer is: no authority proclaims a locality, so there is no date after which these "
      + "names stop being in force. Re-ingest to move the vintage; the id seed contains it, so "
      + "a new extract means new ids and a crosswalk, not an update in place.",
  },
};

// The streets layer, OSM-derived like the localities, and a date per generation rather than one
// shared entry -- because the two ZA generations were built from different extracts, which is
// exactly what a vintage is for.
//
// WRITTEN HERE AND READ FROM THE PBF, AND THE INGEST REFUSES IF THEY DISAGREE, the same
// arrangement as the locality tier. The vintage is the extract's own replication timestamp,
// which `ingest-streets.js` has always recorded as a loose provenance key -- a read fact,
// written where `/v1/places/layers` could not see it. The copy below pins which extract a
// generation is allowed to hold, so a re-ingest against a different one stops rather than
// quietly moving the layer's meaning.
//
// BOTH DATES WERE READ OFF PRODUCTION, not reconstructed. They were unreadable until 29 October
// 2026, when `stats-entry.sh` gained a read-only `pack-facts` verb: these layers are built on a
// workstation and transferred, so their provenance exists only on the box, and the workstation
// copy had been overwritten. A fact we hold about data we serve, with no path to it.
const OSM_STREETS_261019 = {
  ST: {
    vintage: "2026-10-19",
    vintage_source:
      "read: osm_replication_timestamp 2026-10-19T20:21:11Z recorded by ingest-streets.js from "
      + "the header of south-africa-261019.osm.pbf, sha256 12296c46…",
    superseded_by: "a newer OpenStreetMap extract, which exists continuously",
    superseded_from: null,
    note:
      "The SAME extract as this generation's locality tier -- byte for byte, sha256 12296c46… "
      + "on both -- so one download produced both OSM-derived layers and they cannot disagree "
      + "about what OpenStreetMap said that day. Pinned via STREETS_PBF_URL, which DEPLOY.md "
      + "§ 5b requires for the Census 2022 cutover so that the pack is reproducible.",
  },
};

// The 2020 generation's streets came from Geofabrik's `latest`, a URL that moves daily, so that
// extract is gone and cannot be re-downloaded -- DEPLOY.md says so, and it is the reason § 5b
// now requires a dated URL. The date is still a read fact: the ingest read it out of the pbf
// header at the time and the pack has carried it ever since. The evidence is therefore our own
// record rather than a file anyone can re-check, and vintage_source says which.
const OSM_STREETS_LATEST_260921 = {
  ST: {
    vintage: "2026-09-21",
    vintage_source:
      "read: osm_replication_timestamp 2026-09-21T20:21:51Z recorded by ingest-streets.js from "
      + "the header of south-africa-latest.osm.pbf, sha256 487ad72e… -- that URL has since "
      + "moved, so this pack_meta record is the only remaining evidence of which extract it was",
    superseded_by: "a newer OpenStreetMap extract, which exists continuously",
    superseded_from: null,
    note:
      "A DIFFERENT extract from this generation's sibling `stats-sa-2022`, four weeks earlier, "
      + "which is the whole reason /v1/places/layers honours ?generation= -- a host comparing "
      + "the two during a cutover is told the streets differ as well as the census cells.",
  },
};

// GeoNames, and this one is ASSERTED rather than read, which the field says out loud.
//
// It was left blank on 29 October 2026 with a paragraph arguing the blank was correct, on the
// grounds that `ingest-geonames.js` records `zip_mtime` -- when WE downloaded the file, not when
// GeoNames cut the dump -- and that publishing a download time as a vintage puts an asserted
// date where a read one belongs. The reasoning was right about the evidence and wrong about the
// conclusion: `vintage_source` exists precisely so an assertion can be published AS an
// assertion, which is how Stats SA's census years are carried, and a blank tells a host nothing
// at all. A download date, labelled as one, is strictly more than nothing.
//
// WHAT IT IS AND IS NOT. GeoNames regenerates its country files daily and stamps no version in
// them, so there is no publication date to read. The download is within a day of the cut, and
// the sha256 identifies the exact file. IDENTICAL IN BOTH ZA GENERATIONS -- same sha256, same
// mtime -- so the same ZA.zip was loaded into each, which is itself worth a host knowing when
// it compares them.
const GEONAMES_ZA_260921 = {
  GN: {
    vintage: "2026-09-21",
    vintage_source:
      "asserted: the download date of https://download.geonames.org/export/dump/ZA.zip, "
      + "sha256 04a5e6ac…, retrieved 2026-09-21T11:04:49Z. GeoNames regenerates its country "
      + "files daily and stamps no version in them, so this is when we took the snapshot and "
      + "not a date GeoNames published -- accurate to about a day, and the sha256 is what "
      + "identifies the file exactly",
    superseded_by: "a newer GeoNames daily dump, which exists continuously",
    superseded_from: null,
    note:
      "A daily snapshot of a continuously-edited gazetteer, like the OpenStreetMap layers and "
      + "unlike a census. Nothing is in force here, so there is no superseded_from: GeoNames "
      + "names places, it does not proclaim them. The same ZA.zip backs both ZA generations.",
  },
};

const SUPERSESSIONS = {
  ZA: {
    "mdb-zaf-2020": {
      polygons_adm: MDB_2020,
      lines_streets: OSM_STREETS_LATEST_260921,
      points_geonames: GEONAMES_ZA_260921,
      places_census: {
        MP: { ...CENSUS_2011, note: "Census 2022 supplied to us on 2026-09-29. This generation has not cut over." },
        SP: {
          ...CENSUS_2011,
          note:
            "24,743 sub-places against 22,196, supplied to us on 2026-09-29. This generation " +
            "has not cut over. See docs/HOST-ADVANCE-OS.md.",
        },
      },
    },
    "stats-sa-2022": {
      polygons_adm: MDB_2020,
      lines_streets: OSM_STREETS_261019,
      points_geonames: GEONAMES_ZA_260921,
      places_census: {
        MP: { ...CENSUS_2022, note: "13,728 main places, of which 13,698 carry a distinct mp_code." },
        SP: { ...CENSUS_2022, note: "24,743 sub-places, every one with a distinct sp_code." },
      },
      // Added 29 October 2026, the day the tier went live, because `/v1/places/layers` showed a
      // `LOC` row with no vintage while every locality cell carried `codes.vintage: 2026-10-19`.
      // The ingest had recorded the extract date as a loose `vintage` key in the layer's
      // provenance, and the endpoint that publishes vintages reads `sources[layer].vintages[adm]`
      // -- so the fact was in the pack, in a shape the one reader of it could not see. A host
      // asking what a tier means reads that endpoint, and got a blank.
      places_osm: OSM_PLACES_261019,
    },
  },
};

// The curated part for one layer of one generation, or null. `adm` is the level code, because
// that is what is comparable across countries; `kind` is the local word for it.
function supersessionFor(country, generation, layerKey, adm) {
  const byGen = SUPERSESSIONS[String(country || "").toUpperCase()] || {};
  return (((byGen[generation] || {})[layerKey]) || {})[adm] || null;
}

// Every level this file records for one layer of one generation, for the jobs that write a
// whole layer's vintages at once.
function vintagesFor(country, generation, layerKey) {
  const byGen = SUPERSESSIONS[String(country || "").toUpperCase()] || {};
  return ((byGen[generation] || {})[layerKey]) || {};
}

module.exports = { SUPERSESSIONS, supersessionFor, vintagesFor };
