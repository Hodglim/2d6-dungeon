#!/bin/sh
# Generates the PWA icons with ImageMagick: a hatched wall square with a "2D6" plaque, ink on parchment.
# Usage: scripts/make-icons.sh   (writes public/icons/*.png)
set -e
cd "$(dirname "$0")/.."
OUT=public/icons
INK='#1f1a14'
PAPER='#f7f2e7'
FONT=$(fc-match -f '%{file}' 'DejaVu Sans:bold' 2>/dev/null || true)
IM=convert; command -v magick >/dev/null 2>&1 && IM=magick
mkdir -p "$OUT"

# make <canvas-size> <artwork-percent-of-canvas> <file>
make() {
  size=$1; pct=$2; file=$3
  art=$((size * pct / 100)); off=$(((size - art) / 2))
  step=$((art / 11)); sw=$((art / 70 + 1)); border=$((art / 22 + 1))
  in=$((art * 20 / 100)); inb=$((art - in))
  draw=""
  i=$((-art))
  while [ $i -lt $art ]; do
    draw="$draw line $i,$art $((i + art)),0"
    i=$((i + step))
  done
  $IM -size ${size}x${size} xc:"$PAPER" \
    \( -size ${art}x${art} xc:"$PAPER" -fill none -stroke "$INK" -strokewidth $sw -draw "$draw" \
       -fill "$PAPER" -stroke "$INK" -strokewidth $((border / 2 + 1)) -draw "rectangle $in,$((art * 33 / 100)) $inb,$((art * 67 / 100))" \
       ${FONT:+-font "$FONT"} -pointsize $((art * 24 / 100)) -fill "$INK" -stroke none -gravity center -annotate +0+0 '2D6' \
       -fill none -stroke "$INK" -strokewidth $border -draw "rectangle 0,0 $((art - 1)),$((art - 1))" \
    \) -gravity none -geometry +$off+$off -composite "$OUT/$file"
}

make 192 92 icon-192.png
make 512 92 icon-512.png
make 180 100 apple-touch-icon.png
make 512 64 icon-maskable-512.png   # artwork inside the central safe zone (80% circle)
