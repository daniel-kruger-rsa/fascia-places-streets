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

// INDIA. The Survey of India Administrative Boundary Database, and the one vintage this file was
// missing for a whole country until 4 November 2026. `/v1/places/layers?country=IN` returned all
// ten levels with no vintage on any of them, because `packVintages` reads
// `sources[<layer>].vintages[<adm>]` and the India pack recorded none -- so the endpoint said
// nothing about what 79,082 Indian cells are of, and when the corrected ABDB arrives there would
// have been nothing for it to supersede. The same defect shape as the ZA locality tier on
// 29 October, one country wider.
//
// READ, not asserted, and the evidence is the custodian's own: SOI ship an ISO 19115 record in
// `Metadata_ABDB.zip` which identifies every level as `SOI/ABDB/VECTOR/50000/2025/<LEVEL>/INDIA`
// under series name ABDB, temporal extent 2022-2025, published May 2026. The year is in the
// identifier they assign, so it is read from the source rather than inferred from a filename.
const SOI_ABDB_2025 = {
  vintage: "2025",
  vintage_source:
    "read: series ABDB, identifier SOI/ABDB/VECTOR/50000/2025/<LEVEL>/INDIA in Survey of "
    + "India's ISO 19115 metadata (Metadata_ABDB.zip), temporal extent 2022-2025, published "
    + "May 2026",
  // SOI'S OWN WORDS, from their reply of 4 November 2026: "updation of administrative boundary
  // upto village level on our website is a continuous exercise. For any minute to major changes
  // will be published in our latest version. So it is requested kindly to download the data &
  // explore after every 3-6 months gaps." So a newer release always exists in principle, exactly
  // as for an OpenStreetMap extract, and for the same reason it carries no date.
  superseded_by: "a newer ABDB release, which Survey of India publishes continuously",
  // NO superseded_from, and this is the distinction MDB_2020 exists to make. An Indian
  // administrative boundary is a thing in force, but SOI proclaim no effective date and publish
  // continuously, so there is no morning on which these boundaries stop describing what is in
  // force. Naming one would put a false date in front of a host; the ward layer gets a date
  // because a delimitation proclaimed one.
  superseded_from: null,
  note:
    "Survey of India asked us on 4 November 2026 to re-download every 3-6 months, because "
    + "boundary updating to village level is continuous there. Our copy is pinned at "
    + "16 October 2026, so the first refresh falls due between January and April 2027. This "
    + "pack is also one slice rather than the country: 1 state, 36 districts, 359 sub-districts "
    + "and 44,262 villages, which is Maharashtra. A level reading 2025 here is a claim about the "
    + "slice we hold and not about India.",
  source: "https://onlinemaps.surveyofindia.gov.in/",
};

// India's localities, from the same Geofabrik extract the pack was built against. Recorded here
// on 4 November 2026 for a reason worth keeping: ingest-osm-places.js has published a LOC vintage
// since 29 October even with no curated entry, and India's locality load ran at 07:57 that
// morning -- before the fix landed. So the pack carries the extract date as a loose `vintage` key
// that a person reading pack_meta can see and the endpoint cannot. Nothing is wrong with the
// ingest; the pack is simply older than the fix, and record-pack-facts.js can repair it without
// touching 34,424 rows.
const OSM_PLACES_IN_260101 = {
  LOC: {
    vintage: "2026-01-01",
    vintage_source:
      "read: osmosis_replication_timestamp in the header of western-zone-260101.osm.pbf, "
      + "cross-checked against this entry by ingest-osm-places.js",
    superseded_by: "a newer OpenStreetMap extract, which exists continuously",
    superseded_from: null,
    note:
      "Same reasoning as the South African locality layer: OpenStreetMap is edited daily, so a "
      + "newer extract always exists and nothing proclaims a locality. The id seed contains the "
      + "vintage, so a new extract means new ids and a crosswalk rather than an update in place.",
  },
};

const SUPERSESSIONS = {
  IN: {
    "in-abdb-2025": {
      // One curated object applied to the four levels the ABDB actually fills. ADM4, MP, GN and
      // ST are deliberately absent: this pack holds no cell at those levels, and a vintage is a
      // claim about data held here. Writing one for an empty level would be the mirror of the
      // defect being fixed -- a level that reads as present because its metadata does.
      polygons_soi_abdb: {
        ADM1: { ...SOI_ABDB_2025 },
        ADM2: { ...SOI_ABDB_2025 },
        ADM3: { ...SOI_ABDB_2025 },
        SP: { ...SOI_ABDB_2025 },
      },
      places_osm: OSM_PLACES_IN_260101,
    },
  },
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

// THE SHAPE pack_meta STORES, built in one place. This was `buildVintages()` inside
// record-pack-facts.js until 4 November 2026, when ingest-soi.js needed the same object for a
// fresh load -- and a second copy of a shape is how `source` came to be spelt two ways in the
// OpenStreetMap credit, and how the `vintage_source` guard came to sit in front of one writer
// while two others went round it. The curated entries above use `note` and `source` because they
// are written for a person editing this file; what pack_meta holds is `supersession_note` and
// `supersession_source`, because a reader of the pack needs to know which of several notes it is.
// One translation, here, rather than one per caller.
//
// THROWS rather than returning something incomplete. A level with no `vintage` or no
// `vintage_source` is the defect this whole mechanism exists to stop: an omitted vintage reads as
// "this layer has none", which is a different and false statement from "nobody wrote it down".
function packVintagesFor(country, generation, layerKey) {
  const curated = vintagesFor(country, generation, layerKey);
  const out = {};
  for (const [adm, info] of Object.entries(curated)) {
    if (!info || !info.vintage || !info.vintage_source) {
      throw new Error(
        `${country}/${generation} ${layerKey}/${adm} has no vintage or no vintage_source in `
        + "vintages.js. A vintage with no provenance is the thing this mechanism exists to stop.",
      );
    }
    out[adm] = {
      vintage: info.vintage,
      vintage_source: info.vintage_source,
      superseded_by: info.superseded_by || null,
      superseded_from: info.superseded_from || null,
      supersession_note: info.note || null,
      ...(info.source ? { supersession_source: info.source } : {}),
    };
  }
  return out;
}

module.exports = { SUPERSESSIONS, supersessionFor, vintagesFor, packVintagesFor };
