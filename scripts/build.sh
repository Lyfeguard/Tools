#!/usr/bin/env bash
# Rebuild dist/ from src/. Run from anywhere: npm run build
set -euo pipefail
cd "$(dirname "$0")/.."

npx --yes -p csso-cli@4.0.2 csso src/lg-calc.css --no-restructure -o dist/lg-calc.min.css
# csso writes transparent backgrounds as "0 0"; keep the explicit keyword.
sed -i.bak 's/background:0 0\([;}]\)/background:transparent\1/g' dist/lg-calc.min.css && rm -f dist/lg-calc.min.css.bak
# csso writes CSS escapes (\2192) as the characters; put them back as escapes.
node -e "const f='dist/lg-calc.min.css',fs=require('fs');fs.writeFileSync(f,fs.readFileSync(f,'utf8').replace(/[^\x00-\x7f]/g,(c)=>'\\\\'+c.charCodeAt(0).toString(16).toUpperCase()+' '))"
# v1, with the data files (data/) put in.
v2_tmp="$(mktemp -d)"
trap 'rm -rf "$v2_tmp"' EXIT
node scripts/data.js src/lg-calc.js "$v2_tmp/lg-calc-v1.js"
npx --yes terser@5.51.2 "$v2_tmp/lg-calc-v1.js" -c -m --comments '/^!/' --format ascii_only=true -o dist/lg-calc.min.js
rm "$v2_tmp/lg-calc-v1.js"

# v2: the <lg-calculator> component, assembled from the same sources.
# One file per calculator (dist/v2/<key>.min.js and .min.css), and all of them in lg-calculator.min.js.
node scripts/build-v2.js "$v2_tmp"
for js in "$v2_tmp"/*.js; do
  npx --yes terser@5.51.2 "$js" -c -m --comments '/^!/' --format ascii_only=true -o "dist/v2/$(basename "$js" .js).min.js"
done

# Loaded when someone downloads a PDF: the email dialog and the PDF maker.
node scripts/build-extras.js "$v2_tmp"
npx --yes terser@5.51.2 "$v2_tmp/lg-dl.js" -c -m --comments '/^!/' --format ascii_only=true -o dist/lg-dl.min.js
npx --yes terser@5.51.2 "$v2_tmp/v2/lg-pdf.js" -c -m --comments '/^!/' --format ascii_only=true -o dist/v2/lg-pdf.min.js
# Site-wide click tracking.
npx --yes terser@5.51.2 "$v2_tmp/lg-track.js" -c -m --comments '/^!/' --format ascii_only=true -o dist/lg-track.min.js

# Files must stay ASCII-only (see README).
if LC_ALL=C grep -nP '[^\x00-\x7F]' src/lg-calc.css src/lg-calc.js src/v2/*.js src/v2/*.css src/lg-dl.js src/lg-dl.css src/lg-track.js dist/lg-track.min.js dist/lg-calc.min.css dist/lg-calc.min.js dist/v2/*.min.js dist/v2/*.min.css dist/lg-dl.min.js; then
  echo "Non-ASCII characters found: write them as escapes (e.g. \\u00A3 in JS)." >&2
  exit 1
fi
echo "Built dist/lg-calc.min.css, dist/lg-calc.min.js, dist/lg-dl.min.js and dist/v2/"
