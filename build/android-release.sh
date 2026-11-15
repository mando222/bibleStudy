#!/usr/bin/env bash
# Run from the repository root after Gradle assembleRelease.
set -euo pipefail

tools="${ANDROID_HOME:?Android SDK is required}/build-tools/36.1.0"
version=$(node -p "require('./package.json').version")
version_code=$(node -p "let [a,b,c]=require('./package.json').version.split('.').map(Number); a*1000000+b*1000+c")
unsigned=android/app/build/outputs/apk/release/app-release-unsigned.apk
output_dir="${1:-dist/android-release}"
mkdir -p "$output_dir"
apk="$output_dir/Open-Bible-Study-Android-$version.apk"

: "${OBS_ANDROID_KEYSTORE:?Set the path to the signing keystore}"
: "${ANDROID_STORE_PASSWORD:?Set the keystore password}"
export ANDROID_KEY_PASSWORD="${ANDROID_KEY_PASSWORD:-$ANDROID_STORE_PASSWORD}"
"$tools/apksigner" sign --ks "$OBS_ANDROID_KEYSTORE" --ks-pass env:ANDROID_STORE_PASSWORD \
  --key-pass env:ANDROID_KEY_PASSWORD --v4-signing-enabled false --out "$apk" "$unsigned"
"$tools/apksigner" verify --verbose --print-certs "$apk"
badging=$("$tools/aapt" dump badging "$apk")
if ! grep -Fq "package: name='org.openbiblestudy.android' versionCode='$version_code' versionName='$version'" <<< "$badging" ||
   grep -q '^application-debuggable' <<< "$badging"; then
  echo "Android package, version or release mode did not match." >&2
  exit 1
fi

python3 - "$apk" <<'PY'
import gzip
import hashlib
import sys
import zipfile
from pathlib import Path

def digest(stream):
    sha = hashlib.sha256()
    while chunk := stream.read(1024 * 1024):
        sha.update(chunk)
    return sha.hexdigest()

library = Path('resources/bible.sqlite')
with zipfile.ZipFile(sys.argv[1]) as apk, library.open('rb') as src:
    expected = digest(src)
    if apk.read('assets/library/manifest').decode().splitlines() != [expected, str(library.stat().st_size)]:
        raise SystemExit('Android library manifest differs from the desktop corpus')
    with apk.open('assets/library/bible.pack') as packed, gzip.GzipFile(fileobj=packed) as contents:
        if digest(contents) != expected:
            raise SystemExit('The bundled Android corpus differs from the desktop corpus')
    if not apk.read('assets/public/index.html'):
        raise SystemExit('Android reader is missing')
print('Verified Android release and offline library.')
PY
