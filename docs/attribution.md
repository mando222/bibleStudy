# Data sources & attribution

The app bundles/derives text and lexical data from the following open sources. The build
pipeline (`npm run db:build`) fetches these fresh; nothing here is redistributed in this repo.

## Bible text

- **helloao "Free Use Bible API"** — <https://bible.helloao.org> — verse text for the King James
  Version (KJV), Berean Standard Bible (BSB), World English Bible (WEB), American Standard Version
  (ASV), and Young's Literal Translation (YLT). These translations are in the Public Domain.
- **American Standard Version (1901)** — via helloao / <https://ebible.org/Scriptures/details.php?id=eng-asv>
  — Public Domain.
- **Julia E. Smith Translation (1876)** — text via <https://studybible.info/JuliaSmith> — Public
  Domain.

## Original languages & lexicons

- **STEPBible TAHOT / TAGNT** — <https://github.com/STEPBible/STEPBible-Data> — amalgamated tagged
  Hebrew OT and Greek NT editions. **CC BY 4.0** (STEPBible / Tyndale House, Cambridge).
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
  **Nestle 1904 (Public Domain)** with **STEPBible (CC BY 4.0)** tagging, not copied from any
  copyrighted textbook.
- **Vocabulary & drills** derive word lists from the STEPBible tagged Greek NT and Hebrew OT
  (**CC BY 4.0**, credited above). Alphabet data is authored for this project.

## Not bundled (copyrighted)

- **NKJV** © Thomas Nelson, and **NASB** © The Lockman Foundation, are proprietary and are **not**
  included. A future importer will let users load their own licensed copies (SWORD/MySword/e-Sword
  modules).

---

Attribution for CC BY / CC BY-SA sources will also be surfaced in an in-app About / Credits screen.
