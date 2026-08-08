# Data sources & attribution

The app bundles/derives text and lexical data from the following open sources. The build
pipeline (`npm run db:build`) fetches these fresh; nothing here is redistributed in this repo.

## Bible text

- **helloao "Free Use Bible API"** — <https://bible.helloao.org> — verse text for the King James
  Version (KJV), Berean Standard Bible (BSB), and World English Bible (WEB). These translations
  are in the Public Domain.

## Strong's lexicon

- **OpenScriptures Strong's Greek & Hebrew dictionaries** —
  <https://github.com/openscriptures/strongs> — JSON derived from Strong's Exhaustive Concordance
  (1890/1894, public domain). The JSON compilation is licensed **CC BY-SA** (Open Scriptures).

## KJV Strong's word tagging

- **kaiserlik/kjv** — <https://github.com/kaiserlik/kjv> — KJV text with per-word Strong's numbers,
  used to tag the KJV for the Strong's overlay and concordance.

## Not bundled (copyrighted)

- **NKJV** © Thomas Nelson, and **NASB** © The Lockman Foundation, are proprietary and are **not**
  included. A future importer will let users load their own licensed copies (SWORD/MySword/e-Sword
  modules).

---

Attribution for CC BY / CC BY-SA sources will also be surfaced in an in-app About / Credits screen.
