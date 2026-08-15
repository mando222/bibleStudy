# Installing Open Bible Study

Open Bible Study is free and runs fully offline once installed. It's around a
**300 MB** download (the whole Bible database — many translations, original
languages, lexicons — is built in).

Because this is an independent open-source project, the installers are **not
code-signed** by Apple or Microsoft. That's normal for free software, but your
operating system will show a one-time warning the first time you open it. Here's
how to get past it on each platform.

---

## macOS

The Mac download is **Apple Silicon only** (M1/M2/M3/M4):
`Open Bible Study-<version>-mac-arm64.dmg`

> **Intel Macs aren't supported by the published builds.** Rosetta can't run an Apple Silicon
> app on an Intel machine, so there's no download that will work. You can still build from
> source — see the README.

Steps:

1. Open the `.dmg` and drag **Open Bible Study** into your **Applications** folder.
2. The first time you open it, macOS says the app *"can't be opened because Apple cannot
   check it for malicious software."* That's the unsigned-app warning — expected for free,
   independently published software.
3. Clear it once: **right-click (or Control-click) the app → Open → Open again.**
   You can also go to **System Settings → Privacy & Security**, where a button offers to
   **Open Anyway**.

After that first time, it opens like any other app.

<details>
<summary>If macOS says the app <em>"is damaged and can't be opened"</em></summary>

That wording means the signature is invalid rather than merely untrusted, and right-click →
Open won't clear it. It affects **versions 0.2.0 and earlier**, which were published without a
valid signature. Either download 0.2.1 or later, or strip the download flag by hand:

```bash
xattr -cr "/Applications/Open Bible Study.app"
```

Then open the app normally.
</details>

---

## Windows

1. Run `Open Bible Study-<version>-setup.exe`.
2. Windows **SmartScreen** may say *"Windows protected your PC."* Click
   **More info** → **Run anyway**.
3. Follow the installer; it creates a Start-menu and desktop shortcut.

---

## Linux

Two formats are provided:

- **AppImage** (works on most distros, no install):
  ```bash
  chmod +x "Open Bible Study-<version>-x86_64.AppImage"
  ./"Open Bible Study-<version>-x86_64.AppImage"
  ```
- **Debian/Ubuntu** (`.deb`):
  ```bash
  sudo dpkg -i "open-bible-study_<version>_amd64.deb"
  ```

---

## The AI assistant (optional)

The study features — reading, parallel translations, Strong's numbers,
interlinear, lexicons, notes, search — all work immediately, offline, with no
setup.

The **Assistant** is optional. The first time you turn it on, it downloads a
small language model that then runs privately on your own computer. That's a
one-time download and needs an internet connection just for that step.

---

## Something wrong?

This is early software. If it won't open or behaves oddly, note what you did and
what happened — that feedback is exactly what this trial is for.
