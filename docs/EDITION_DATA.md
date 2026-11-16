# English edition data

An app release pins one Git commit for each bundled English edition. Open an edition under [data/editions](../data/editions) at the app release tag to inspect the files used to build that release. Desktop and Android read the compiled SQLite library offline. A personal translation import belongs to the user’s local library.

| Edition | Public data repository |
| --- | --- |
| King James Version | [bible-data-kjv](https://github.com/mando222/bible-data-kjv) |
| Berean Standard Bible | [bible-data-bsb](https://github.com/mando222/bible-data-bsb) |
| World English Bible | [bible-data-web](https://github.com/mando222/bible-data-web) |
| American Standard Version | [bible-data-asv](https://github.com/mando222/bible-data-asv) |
| Young’s Literal Translation | [bible-data-ylt](https://github.com/mando222/bible-data-ylt) |
| Julia E. Smith Translation | [bible-data-juliasmith](https://github.com/mando222/bible-data-juliasmith) |
| Tyndale New Testament | [bible-data-tnt](https://github.com/mando222/bible-data-tnt) |
| Geneva Bible | [bible-data-gnv](https://github.com/mando222/bible-data-gnv) |
| Wycliffe, bundled Pentateuch and Gospels | [bible-data-wyc](https://github.com/mando222/bible-data-wyc) |

## Read an edition

Start with the edition’s README, manifest, upstream inventory, and coverage report. The manifest identifies the text and the column order in each book file. Verse addresses use that edition’s numbering. The spelling, punctuation, spacing, and layout can be compared independently from changes to lookup tags or restoration evidence. Coverage counts are specific to the books and verses actually bundled.

A Strong’s number identifies a dictionary entry. An inferred English match can help a reader find that entry. A published tag is evidence that the distributor applied that number at a particular English span. Neither, by itself, identifies which occurrence or inflection belongs there.

Restoration requires an English span, an identified original-language occurrence in a named source, its inflected form, and evidence connecting them. A phrase alignment can keep the complete English phrase visible with the source form alongside it. A disputed tag or unresolved verse match stays out of restoration. The WEB data records both the distributor’s tag on “wept” in John 11:35 and the conflicting tag on “God” in Genesis 1:1. See the [WEB source download](https://ebible.org/details.php?id=engwebp).

To examine the distributor’s tags on a particular WEB or ASV verse, run the diagnostic against the built library. It prints the proposed English span, source references, and reason each candidate was accepted or withheld.

```sh
python3 data-pipeline/edition-evidence/explain.py resources/bible.sqlite WEB Gen 1 1
```

See the [evidence audit guide](../data-pipeline/edition-evidence/README.md) for the input revisions, independent checks, and regeneration commands. The compiled SQLite metadata records each edition manifest’s SHA-256 under `edition_manifest_sha256.<edition ID>`.

The app project maintains shared original texts, passage numbering, lexicons and validation code. Word frequencies are calculated from the chosen original-language edition. Two English wordings can be compared as renderings of the same occurrence when the evidence identifies that occurrence in both.

## The v0.6.0 migration

The release compares all nine editions with the SQLite database shipped in the v0.5.0 Android release. The published verses, native addresses, and edition layout records match. The baseline includes 348,742 BSB and 2,051 KJV verified spans, with their source forms and display rules. The historic KJV token layer also includes dictionary tags inferred from printed small-cap LORD and GOD. Those tags alone cannot enable restoration. Fifty inferred verse records changed when inference started using mapped verse addresses.

| New evidence in v0.6.0 | KJV | WEB | ASV |
| --- | ---: | ---: | ---: |
| Additional verified occurrences | 62,112 | 1 | 1 |
| Previously untagged KJV tokens with a verified Greek link | 4,606 | — | — |
| Additional dictionary-only distributor tags | — | 49,650 | 51,851 |
| Rejected distributor tags in Genesis 1:1 | — | 2 | 2 |

The stored Greek form identifies the reading in a named textual witness. For example, the reviewed ASV link in John 11:35 cites agreement across the Greek witnesses at this word. Its citation documents the shared reading at that occurrence. Each edition’s coverage report counts remaining gaps by book, including the books with no verified restoration links.

## Propose a correction

1. Open a pull request in the affected edition repository. Include the upstream reference, revision or checksum, redistribution terms, English span, and the evidence supporting the change. Keep unresolved records identifiable. For an original form, cite the named source and exact occurrence.
2. Follow the edition README to regenerate the affected files, update the manifest checksums and coverage report, and validate the result. Review the book diff alongside the coverage change. Preserve native verse addresses used by saved study work.
3. After the data change merges, check out that reviewed commit in the corresponding app submodule. Stage the submodule path and open an app pull request. CI validates the files and reports the changed pin and coverage counts. Build the database and run its release tests to check the effect on the combined library.
4. To restore an earlier revision, check out its commit in the submodule and commit that pin in the app. Rebuilding uses the data at the selected revision. App releases retain their original pins.

From an existing app checkout, synchronize the pinned modules before building.

```sh
git submodule update --init --recursive
npm ci
node --experimental-sqlite --import tsx data-pipeline/editionPacks.ts validate
npm run db:build
npm run test:release-db
```
