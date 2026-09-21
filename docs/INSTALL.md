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
3. Clear it once. The reliable route on current macOS:
   **System Settings → Privacy & Security** → scroll to **Security**, where a line about
   "Open Bible Study" offers **Open Anyway**. Click it and confirm.
   Right-click (or Control-click) the app → **Open** also works on some macOS versions, but it
   does not reliably clear this prompt for an app signed the way ours is — use the setting above
   if it doesn't.

   If neither works, the Terminal always does:
   ```bash
   xattr -cr "/Applications/Open Bible Study.app"
   ```

After that first time, it opens like any other app.

### Updating later

When a new version is out, a bar appears at the top of the window. **Download** fetches the
installer straight into your Downloads folder while you carry on reading — the app does not close
and nothing is installed for you. When you are ready, quit Open Bible Study, open the `.dmg` and
drag the new copy into Applications, replacing the old one. (macOS will not let an app replace
itself while it is running, which is why installing is a separate step you control.)

You can also press **In browser** to download it the ordinary way instead, or turn the update
check off entirely in the About screen.

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
