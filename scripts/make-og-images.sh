#!/bin/zsh
# Renders the link-preview images (1280x640) from scripts/og-image.html with headless Chrome.
# Usage: scripts/make-og-images.sh   (run from anywhere; writes public/assets/og-image.png and og-image-pl.png)
set -euo pipefail
cd "$(dirname "$0")/.."
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
mkdir -p public/assets
render() { # $1 output file, $2 the line under the name (URL-encoded)
  "$CHROME" --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=1 \
    --allow-file-access-from-files --virtual-time-budget=4000 --window-size=1280,640 \
    --screenshot="$PWD/$1" "file://$PWD/scripts/og-image.html?sub=$2" >/dev/null 2>&1
}
render public/assets/og-image.png 'Linguist%20%C2%B7%20LLM%20Evaluation'
render public/assets/og-image-pl.png 'J%C4%99zykoznawczyni%20%C2%B7%20Ewaluacja%20LLM'
sips -g pixelWidth -g pixelHeight public/assets/og-image.png public/assets/og-image-pl.png
