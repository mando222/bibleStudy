# Data sources & attribution

The app bundles/derives text and lexical data from the following open sources. The build
pipeline (`npm run db:build`) fetches these fresh; nothing here is redistributed in this repo.

## Bible text

- **helloao "Free Use Bible API"** — <https://bible.helloao.org> — verse text for the King James
  Version (KJV), Berean Standard Bible (BSB), World English Bible (WEB), American Standard Version
  (ASV), and Young's Literal Translation (YLT). These translations are in the Public Domain.
- **American Standard Version (1901)** — via helloao / <https://ebible.org/Scriptures/details.php?id=eng-asv>
  — Public Domain.
- **Tyndale New Testament (1534)** — William Tyndale, via helloao /
  <https://ebible.org/Scriptures/details.php?id=engtnt> — Public Domain. New Testament only,
  in original 1534 spelling.
- **Geneva Bible (1599)** — via helloao / <https://ebible.org/Scriptures/details.php?id=enggnv>
  — Public Domain. Original 1599 spelling.
- **Wycliffe Bible (c. 1395), surviving portions** — via helloao /
  <https://ebible.org/Scriptures/details.php?id=engWycliffe> — Public Domain. The Pentateuch and
  the four Gospels only, in Middle English. (The complete modern-spelling editions are
  CC BY-NC-ND, which this project does not bundle.)
- **Julia E. Smith Translation (1876)** — text via <https://studybible.info/JuliaSmith> — Public
  Domain.

## Derived word mappings

- Word frequency uses the original word and component records in STEPBible TAHOT and TAGNT. The English translations and inferred Septuagint tags do not contribute to these counts. Grammatical labels expand the publisher’s exact codes from [TEHMC and TEGMC](https://github.com/STEPBible/STEPBible-Data/tree/f71b5e51f2d768ae72e3ed69743a7a9df25ef8b5/Morphology%20codes), **CC BY 4.0**, STEPBible / Tyndale House. The app shortens the explanations and retains an unrecognized code as written.

- The word-to-Strong’s mappings for ASV, WEB, YLT, Julia Smith, Tyndale, Geneva and Wycliffe are computed from the Berean alignment and the lexical candidates for each verse. The reader marks these links as inferred. The KJV benchmark scores agreement conditional on both sides having a tag. It uses KJV records in its lookup tables. See the [paired evaluation](SCRIPTURE_ACCURACY_AUDIT.md#word-level-accuracy) for the denominators.
- Source word restoration uses the inflected form and transliteration on the Berean row aligned to the selected English word. YHWH represents the four Hebrew consonants. KJV restorations also require independent English tagging and an original-language witness. For terms other than YHWH, the KJV and BSB verse wording must agree exactly, and the Masoretic Hebrew/Aramaic or Textus Receptus Greek witness must confirm the specific form. [Berean alignment source](https://bereanbible.com/bsb_tables.tsv)

## Original languages & lexicons

The 0.4.0 word index uses the [July 18 snapshot of STEPBible](https://github.com/STEPBible/STEPBible-Data/tree/f71b5e51f2d768ae72e3ed69743a7a9df25ef8b5). The build checks the publisher files, including the Berean alignment table, against the [recorded SHA-256 digests](../data-pipeline/assets/word-source-hashes.json).

- **STEPBible TAHOT / TAGNT** — <https://github.com/STEPBible/STEPBible-Data> — amalgamated tagged
  Hebrew OT and Greek NT editions. The critical interlinear follows the NA28 readings identified in TAGNT, alongside its Scrivener 1894 and Robinson–Pierpont 2005 readings. The Greek interlinear uses KJV reference keys and retains edition-local references on the tokens. ASV and BSB reverse the contents of Philippians 1:16–17 relative to these study keys. The app maps this verified exception when comparing passages. **CC BY 4.0** (STEPBible / Tyndale House, Cambridge).
- **STEPBible Translators Versification Traditions (TVTMS)** — the app uses the source’s verse equivalences and checks its numbering conditions against the bundled Swete/KJV inventories. Merged, ambiguous and absent passages can have no single equivalent. **CC BY 4.0**, STEPBible / Tyndale House. [Source data](https://github.com/STEPBible/STEPBible-Data/tree/5de0a47f35f0fc13dfe1430d104e5db8a4285f9c/Versification)
- **Septuagint (Swete)** — <https://github.com/nathans/lxx-swete> via Open Greek and Latin /
  First1KGreek — **CC BY-SA 4.0**.
- **OpenScriptures Strong's Greek & Hebrew dictionaries** —
  <https://github.com/openscriptures/strongs> — JSON derived from Strong's Exhaustive Concordance
  (1890/1894, public domain). The JSON compilation is licensed **CC BY-SA** (Open Scriptures).
- **Lexicons: BDB · Abbott-Smith · LSJ (TBESH / TBESG / TFLSJ)** —
  <https://github.com/STEPBible/STEPBible-Data> — keyed to Strong's numbers. **CC BY 4.0**
  (STEPBible / Tyndale House).
- **kaiserlik/kjv** — <https://github.com/kaiserlik/kjv> — KJV text with per-word Strong's numbers,
  used to tag the KJV for the Strong's overlay and concordance.

## Study data (people · places · events · maps)

- **Theographic Bible Metadata** — <https://github.com/robertrouse/theographic-bible-metadata> —
  people, places, and events knowledge graph powering Genealogies, Timelines, and Maps.
  **CC BY-SA 4.0**.
- **OpenBible.info** — <https://www.openbible.info/geo/> — biblical place coordinates (via
  Theographic). **CC BY**.
- **Easton's Bible Dictionary (1897)** — <https://www.ccel.org/ccel/easton/ebd2.html> — public-domain
  person summaries. **Public Domain**.
- **Natural Earth** — <https://www.naturalearthdata.com> — 1:50m land polygons used for the offline
  Maps basemap. **Public Domain**.
- **Treasury of Scripture Knowledge** — cross-references via <https://www.openbible.info/labs/cross-references/>
  (distributed by scrollmapper/bible_databases). **CC BY** (OpenBible.info).
- **Kingdoms overlay** — the approximate empire/kingdom extents shown on the map time slider are
  hand-authored for this project and released **CC0 / public domain**. They are deliberately coarse
  and are not a scholarly boundary source.

## Learn (Greek & Hebrew)

- **Greek grammar course** — the interactive "read real Greek early" lessons (explanations,
  vocabulary, exercises) are **authored for this project**. Each lesson's *reading* is a reference
  into the bundled tagged Greek New Testament and is rendered live from that data — the Greek text is
  the NA28 reading as represented by **STEPBible TAGNT (CC BY 4.0)**.
- **Vocabulary & drills** derive word lists from the STEPBible tagged Greek NT and Hebrew OT
  (**CC BY 4.0**, credited above). Alphabet data is authored for this project.

## Not bundled (copyrighted)

- **NKJV** © Thomas Nelson, and **NASB** © The Lockman Foundation, are proprietary and are **not**
  included. A future importer will let users load their own licensed copies (SWORD/MySword/e-Sword
  modules).

---

Attribution for CC BY / CC BY-SA sources will also be surfaced in an in-app About / Credits screen.
