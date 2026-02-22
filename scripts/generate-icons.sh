#!/usr/bin/env bash
set -euo pipefail

SRC_DIR="build/icons"
SRC="$SRC_DIR/icon.png"
OUT_DIR="$SRC_DIR"
TMP_ICONSET="$OUT_DIR/icon.iconset"

if [ ! -f "$SRC" ]; then
  echo "Source $SRC not found. Place your icon.png in $SRC_DIR and try again."
  exit 1
fi

command -v convert >/dev/null 2>&1 || { echo "ImageMagick 'convert' not found. Install it (brew install imagemagick)"; exit 1; }

mkdir -p "$OUT_DIR"

sizes=(1024 512 256 128 64 48 32 16)
for s in "${sizes[@]}"; do
  out="$OUT_DIR/icon-${s}.png"
  radius=$((s/6))
  # Resize and apply rounded mask
  convert "$SRC" -resize "${s}x${s}^" -gravity center -extent "${s}x${s}" \
    \( -size ${s}x${s} xc:none -fill white -draw "roundrectangle 0,0 ${s},${s} ${radius},${radius}" \) \
    -alpha set -compose DstIn -composite "$out"
  echo "Wrote $out"
done

# create .ico (Windows)
convert "$OUT_DIR/icon-16.png" "$OUT_DIR/icon-32.png" "$OUT_DIR/icon-48.png" "$OUT_DIR/icon-256.png" "$OUT_DIR/icon.ico"
echo "Wrote $OUT_DIR/icon.ico"

# create .icns (macOS) if iconutil is available
if command -v iconutil >/dev/null 2>&1; then
  rm -rf "$TMP_ICONSET"
  mkdir -p "$TMP_ICONSET"
  cp "$OUT_DIR/icon-16.png"  "$TMP_ICONSET/icon_16x16.png"
  cp "$OUT_DIR/icon-32.png"  "$TMP_ICONSET/icon_16x16@2x.png"
  cp "$OUT_DIR/icon-32.png"  "$TMP_ICONSET/icon_32x32.png"
  cp "$OUT_DIR/icon-64.png"  "$TMP_ICONSET/icon_32x32@2x.png"
  cp "$OUT_DIR/icon-128.png" "$TMP_ICONSET/icon_128x128.png"
  cp "$OUT_DIR/icon-256.png" "$TMP_ICONSET/icon_128x128@2x.png"
  cp "$OUT_DIR/icon-256.png" "$TMP_ICONSET/icon_256x256.png"
  cp "$OUT_DIR/icon-512.png" "$TMP_ICONSET/icon_256x256@2x.png"
  cp "$OUT_DIR/icon-512.png" "$TMP_ICONSET/icon_512x512.png"
  cp "$OUT_DIR/icon-1024.png" "$TMP_ICONSET/icon_512x512@2x.png"
  iconutil -c icns "$TMP_ICONSET" -o "$OUT_DIR/icon.icns"
  rm -rf "$TMP_ICONSET"
  echo "Wrote $OUT_DIR/icon.icns"
else
  echo "iconutil not found; skipping .icns generation (mac only)"
fi

echo "Icon generation complete."
