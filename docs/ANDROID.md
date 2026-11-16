# Android app

Android shares the desktop study library and runs offline, including the first launch. The four tabs keep these tools within reach.

| Tab | What you can do |
| --- | --- |
| Read | Tap the passage title to navigate. Tap the edition name to choose among 11 bundled translations and original texts, add parallel editions, or import a Bible module. Use the Interlinear button beside the edition name to switch reading modes. Open Interlinear options to choose the base text or stack translations. Passage tools include verse actions, textual variants, cross-references, context, and layout comparison. Reading settings control scripture text size, theme, headings, verse numbers, literary layout, speech guides, and structured passages. |
| Search | Search the current translation for English wording, original-script words, or a Strong’s number. Narrow the results to either testament. Open a verse, then press Back to return to your results. |
| Words | Browse Hebrew, Aramaic, and Greek dictionary entries, scholarly lexicons, concordances, and frequency maps. Select a form, book, or chapter to inspect its attested occurrences. |
| Library | Explore the atlas, mapped people and journeys, family relationships, historical events, Greek and Hebrew lessons, vocabulary review, and drills. Open your Markdown notebook, current chapter notes, searchable notes and highlights, bookmarks, reading history, and file tools here. |

Tap a verse number or choose Passage tools → Verse actions for notes, highlighting, and sharing. The verse picker also works with printed verse numbers hidden. Tap a restored word to see the wording your translation uses at that spot, even when it takes several words. In parallel reading, tap the word in the edition you want to check. Choose **Compare translations** to see the other editions. The atlas can open from a cited passage or person and return to your study. Android uses its document picker for module imports, notebook folders, Markdown export, and study backups. A restored backup opens in a new profile and offers to save the recovery copy. Open Recently deleted in the notebook to restore a deleted file. The phone omits the desktop assistant and its models.

The phone uses the desktop project's scripture library and restoration rules. In BSB Genesis 4:16, try the verified name display and compare it with the verse's published wording. In BSB 1 John 2:1, open the entry for G264 and enable its verified forms. Both Greek occurrences have the same dictionary entry, but their verse forms differ. The reader preserves the English negation. Verse copy and share use the published translation.

Search accepts English, Greek, Hebrew, and Strong’s numbers. In BSB, `shepherd` includes words such as *shepherds* and returns 114 verses in the current corpus. Searching `"shepherd"` with quotation marks returns 62. Set the order for comparing source texts in Settings. Each translation continues to use its own verified word links.

On an e-ink display, open **Reading settings → Display theme → E-ink (high contrast)**. English scripture uses a medium-weight sans serif at your chosen size. Restored words have a solid underline and selected words appear in reverse contrast.

## Update on your phone

Open **Settings (gear) → App updates**, or go to **Library → Files & settings → App updates**. Tap **Check now**, then **Download update** when a newer version appears. The app downloads the APK and shows its progress. If you see **Allow installation**, tap it, grant Open Bible Study permission in Android settings, and return. Tap **Install update** and confirm in Android.

Updating in place preserves your notes, highlights, and reading preferences. Automatic checks on launch are optional. You can always check manually.

## Install for testing

For a published version, choose the versioned APK under Assets on the matching GitHub release. [Android installation guide](INSTALL.md#android)

The current test APK is `dist/android/Open-Bible-Study-Android-test.apk`. Transfer it to your phone and open it. If Android asks, allow the app opening the file to install it. With an Android SDK and a connected test phone, you can also install it from the repository root.

```sh
adb install -r dist/android/Open-Bible-Study-Android-test.apk
```

The first launch extracts and verifies the bundled scripture database in private app storage. Allow space for the extracted database as well as the APK. Updating to a changed corpus temporarily requires space for both extracted copies. Notes and highlights live in a separate, private SQLite database. Reading preferences and location are local to this app. Uninstalling or clearing app data removes your study work. For an in-place update, use an APK signed with the same key.

## Rebuild

Android reads its app version from the desktop project's root `package.json`. Gradle derives the numeric Android version code from the same value. For example, version `0.4.2` produces code `4002`.

Use Node 22.13 or later, JDK 21, and an Android SDK with platform 36. Set `ANDROID_HOME` to the SDK directory and `JAVA_HOME` to the JDK directory. Start in the repository root.

```sh
# Prepare the offline library from the pinned edition data.
git submodule update --init --recursive
npm ci
npm run db:build

npm ci --prefix mobile
npm run sync --prefix mobile
cd android
./gradlew stageTestApk
```

On Windows, use `gradlew.bat stageTestApk`. Each successful build replaces the same test APK in `dist/android`. The first build downloads development dependencies. The resulting APK carries the web reader, SQLite, and the compressed scripture corpus. Study works offline. Checking for updates and downloading a release use the network.

If your SDK user directory is read-only, set `ANDROID_USER_HOME` to a writable, persistent directory before invoking Gradle. This Mac's test build uses `$HOME/Library/Application Support/Open Bible Study Android/sdk-user` so future debug builds can reuse the signing key.

To run the native regression checks against the installed debug APK, connect a test device, return to the repository root and run `node --test mobile/test/native-library.mjs`. Set `ANDROID_SERIAL` when more than one device is attached. The checks use the bundled data to verify distinct Greek forms, the Hebrew divine name, a written/read Hebrew pair, and original-script and English search results.
