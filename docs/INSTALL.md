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

There are two Mac downloads — pick the one for your computer:

- **Apple Silicon** (M1/M2/M3/M4): `Open Bible Study-<version>-mac-arm64.dmg`
- **Intel**: `Open Bible Study-<version>-mac-x64.dmg`

Steps:

1. Open the `.dmg` and drag **Open Bible Study** into your **Applications** folder.
2. The first time you open it, macOS may say the app *"is damaged"* or *"can't be
   opened because Apple cannot check it."* This is just the unsigned-app warning.
3. Fix it once, either way:
   - **Easy:** right-click (or Control-click) the app → **Open** → **Open** again.
   - **If that doesn't work:** open the **Terminal** app and paste this line, then
     press Return:
     ```bash
     xattr -cr "/Applications/Open Bible Study.app"
     ```
     Then open the app normally.

After that first time, it opens like any other app.

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
