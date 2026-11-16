# Open Bible Study

Open Bible Study is a free, open-source Bible study app for macOS, Windows, Linux, and Android. Read translations side by side, follow a passage back to its Hebrew, Aramaic, or Greek wording, and keep your notes alongside the text. The scripture library, dictionaries, and maps are included in the download and work offline. Your study notes stay on your device.

## Features

- **Read and compare translations.** The library includes 11 editions, among them the King James Version, Berean Standard Bible, World English Bible, Masoretic Hebrew, and Greek Septuagint. Scroll across chapters in parallel columns. Show or hide headings, chapter and verse numbers, or speaker guides. Compare how each edition lays out a poem or paragraph. You can also import compatible MySword or e-Sword Bible modules you own.
- **Study a word in context.** Select a linked word to see its Strong’s entry, dictionary definitions, and other verses where it occurs. The interlinear shows the original form, transliteration, and available grammatical details. Compare Greek New Testament variants and the written and read forms of the Masoretic Text. Greek and Hebrew lessons include vocabulary review and reading practice.
- **Check a restored word.** **Restore words** can show the inflected Hebrew, Aramaic, or Greek form when evidence links it to that particular occurrence in the selected translation. A Strong’s dictionary tag alone supports lookup. Hover on desktop or tap on Android to see the exact wording that edition printed. In BSB Genesis 4:16, “of the LORD” displays as “of YHWH.” The tip on *YHWH* shows “the LORD,” and copying the passage gives you the published wording.
- **Find where a word occurs.** Search for an exact phrase, an original-script word, or a Strong’s number. In the **Words** tab, a frequency map counts occurrences across the forms of a word in the selected original-language text. Compare books by count or by uses per 1,000 tagged words, filter by grammatical form, and open a matching verse.
- **Explore people, places, and events.** Open **Context** to see who and what a passage mentions. Follow cross-references to related verses or use the timeline to explore events in order. The atlas maps passages and documented journeys and labels uncertain locations. Genealogies show siblings and group children by recorded parentage. Jacob’s family, for example, shows the children of Leah, Rachel, Bilhah, and Zilpah.
- **Keep a study notebook.** Highlight verses, save bookmarks, write verse notes, and organize longer studies in a Markdown notebook. Export a backup to move your work to another device.
- **Ask the desktop assistant.** The optional AI assistant runs on your computer after a model download. Ask about a selected passage or search documents you add, then follow its citations back to the text.

The app code uses the MIT License. The bundled texts and reference works carry their own licenses. [Code license](LICENSE) · [Data sources and credits](docs/attribution.md)

## Installation

**[Download the latest release](https://github.com/mando222/bibleStudy/releases/latest)** and open **Assets** to find the file for your device.

| Platform | File to download | How to install |
| --- | --- | --- |
| macOS · Apple Silicon | `*-mac-arm64.dmg` | Open the disk image, drag **Open Bible Study** into **Applications**, then open it from there. If macOS blocks the first launch, go to **System Settings → Privacy & Security → Open Anyway**. |
| Windows | `*-setup.exe` | Run the installer and follow the prompts. If SmartScreen appears, choose **More info → Run anyway**. |
| Linux · x86-64 | `*.AppImage` | In the downloaded file’s properties, allow it to run as a program, then open it. |
| Debian or Ubuntu · amd64 | `*.deb` | Open the downloaded package with your system’s package installer and choose **Install**. |
| Android · 7 or later | `Open-Bible-Study-Android-<version>.apk` | Tap the downloaded APK. If prompted, allow your browser or file manager to install apps, then tap **Install**. Open the app once to prepare the offline library. |

### Updating

On desktop, open **About → Check now**. When an update is available, download the installer, quit the app, and install the new version over the existing copy. On Android, open the **Settings** gear and choose **App updates → Check now → Download update**. Tap **Install update** and confirm in Android. Updating in place preserves your notes and highlights. [Detailed installation guide](docs/INSTALL.md) · [Android guide](docs/ANDROID.md)

<details>
<summary>Run the desktop app from source</summary>

Use Node.js 22.13 or later in the 22.x series. The nine English editions are pinned Git submodules. The database build reads those checkouts, fetches shared study sources, and prepares the offline library. [Edition data and contributor guide](docs/EDITION_DATA.md)

```sh
git clone --recurse-submodules https://github.com/mando222/bibleStudy.git
cd bibleStudy
npm ci
npm run db:build
npm run dev
```

</details>
