export interface Source {
  what: string
  detail: string
  license: string
  url: string
}

export const TRANSLATIONS: Source[] = [
  { what: 'King James Version', detail: 'KJV (1769)', license: 'Public Domain', url: 'https://bible.helloao.org' },
  { what: 'Berean Standard Bible', detail: 'BSB — text + word alignment', license: 'Public Domain', url: 'https://berean.bible' },
  { what: 'World English Bible', detail: 'WEB', license: 'Public Domain', url: 'https://ebible.org' },
  { what: 'American Standard Version', detail: 'ASV (1901)', license: 'Public Domain', url: 'https://ebible.org/Scriptures/details.php?id=eng-asv' },
  { what: 'Tyndale New Testament', detail: 'TNT (1534) — New Testament only, original spelling', license: 'Public Domain', url: 'https://ebible.org/Scriptures/details.php?id=engtnt' },
  { what: 'Geneva Bible', detail: 'GNV (1599) — original spelling', license: 'Public Domain', url: 'https://ebible.org/Scriptures/details.php?id=enggnv' },
  { what: 'Wycliffe Bible', detail: 'WYC (c. 1395) — Pentateuch + Gospels, Middle English', license: 'Public Domain', url: 'https://ebible.org/Scriptures/details.php?id=engWycliffe' },
  { what: "Young's Literal Translation", detail: 'YLT (1898)', license: 'Public Domain', url: 'https://bible.helloao.org' },
  { what: 'Julia E. Smith Translation', detail: '1876 — text via studybible.info', license: 'Public Domain', url: 'https://studybible.info/JuliaSmith' }
]

export const ORIGINALS: Source[] = [
  { what: 'Masoretic Hebrew (TAHOT)', detail: 'Amalgamated Hebrew OT', license: 'CC BY 4.0 — STEPBible / Tyndale House', url: 'https://github.com/STEPBible/STEPBible-Data' },
  { what: 'Word frequency and grammatical forms', detail: 'Original TAGNT and TAHOT word records; abbreviated grammar labels from TEGMC and TEHMC', license: 'CC BY 4.0 — STEPBible / Tyndale House', url: 'https://github.com/STEPBible/STEPBible-Data' },
  { what: 'Greek NT editions (TAGNT)', detail: 'NA28, Scrivener 1894 and Robinson–Pierpont 2005 readings represented in TAGNT', license: 'CC BY 4.0 — STEPBible / Tyndale House', url: 'https://github.com/STEPBible/STEPBible-Data' },
  { what: 'Greek NT word order checks', detail: 'Scrivener 1894 and Robinson–Pierpont 2005, one verse per line', license: 'Reference transcriptions from BYZTXT.com', url: 'https://www.byztxt.com/downloads.html' },
  { what: 'Verse numbering', detail: 'Swete and English passage correspondences from TVTMS', license: 'CC BY 4.0 — STEPBible / Tyndale House', url: 'https://github.com/STEPBible/STEPBible-Data/tree/master/Versification' },
  { what: 'Septuagint (Greek OT)', detail: 'Swete — via Open Greek and Latin / First1KGreek', license: 'CC BY-SA 4.0 — nathans/lxx-swete', url: 'https://github.com/nathans/lxx-swete' },
  { what: "Strong's Greek & Hebrew lexicons", detail: 'Strong (1890/1894), JSON', license: 'CC BY-SA — OpenScriptures', url: 'https://github.com/openscriptures/strongs' },
  { what: 'Lexicons: BDB · Abbott-Smith · LSJ', detail: 'TBESH / TBESG / TFLSJ, keyed to Strong’s', license: 'CC BY 4.0 — STEPBible / Tyndale House', url: 'https://github.com/STEPBible/STEPBible-Data' },
  { what: "KJV Strong's word tagging", detail: 'kaiserlik/kjv', license: 'Open', url: 'https://github.com/kaiserlik/kjv' },
  { what: 'Verse-text distribution', detail: 'helloao Free Use Bible API', license: 'Open', url: 'https://bible.helloao.org' }
]

export const DERIVED: Source[] = [
  {
    what: 'Inferred word mappings',
    detail:
      'Translations without scholarly tagging (ASV, WEB, YLT, Smith, Tyndale, Geneva, Wycliffe) get word→Strong’s links inferred from the Berean alignment and are marked as inferred in the reader',
    license: 'Computed at build time by this project',
    url: 'https://berean.bible'
  }
]

export const STUDY_DATA: Source[] = [
  { what: 'Literary layout and edition-supplied speaker marks', detail: 'Each translation’s own published formatting', license: 'Same source and license as the corresponding edition', url: 'https://bible.helloao.org/docs/reference/translations/standard.html' },
  { what: 'Reviewed guides and personal journeys', detail: 'Verse-cited study notes authored for Open Bible Study', license: 'MIT — this project', url: 'https://github.com/mando222/bibleStudy' },
  { what: 'People, places & events', detail: 'Genealogies, Maps & Timelines — with verse references', license: 'CC BY-SA 4.0 — Theographic Bible Metadata', url: 'https://github.com/robertrouse/theographic-bible-metadata' },
  { what: 'Place coordinates', detail: 'Biblical geocoding (via Theographic)', license: 'CC BY — OpenBible.info', url: 'https://www.openbible.info/geo/' },
  { what: "Easton's Bible Dictionary", detail: 'Public-domain person summaries', license: 'Public Domain (1897)', url: 'https://www.ccel.org/ccel/easton/ebd2.html' },
  { what: 'Map basemap', detail: 'Natural Earth 1:50m land polygons', license: 'Public Domain — naturalearthdata.com', url: 'https://www.naturalearthdata.com' },
  { what: 'Cross-references', detail: 'Treasury of Scripture Knowledge', license: 'CC BY — OpenBible.info', url: 'https://www.openbible.info/labs/cross-references/' },
  { what: 'Kingdoms overlay', detail: 'Hand-drawn approximate empire extents for the map time slider', license: 'CC0 — this project', url: 'https://github.com/mando222/bibleStudy/blob/main/data-pipeline/assets/regions.geojson' }
]

export const LEARN: Source[] = [
  { what: 'Greek grammar course', detail: 'Original "read real Greek early" lessons; readings rendered from the tagged Greek NT', license: 'Lessons: this project · Greek readings: STEPBible TAGNT (CC BY 4.0)', url: 'https://github.com/STEPBible/STEPBible-Data' },
  { what: 'Vocabulary & drills', detail: 'Frequency-ranked from the tagged Greek NT & Hebrew OT', license: 'CC BY — STEPBible / Tyndale House', url: 'https://github.com/STEPBible/STEPBible-Data' }
]

export const studyDataCredits = [...TRANSLATIONS, ...ORIGINALS, ...DERIVED, ...STUDY_DATA, ...LEARN]
