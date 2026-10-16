#!/bin/sh
# Shrinks the original downloaded car models (models-src/) into game-ready files (public/models/).
# Usage: ./optimize-models.sh    (run from the tools folder after `npm install`)
set -e
cd "$(dirname "$0")"
G=./node_modules/.bin/gltf-transform
opt() { # <id> <vertex-ratio or "none">
  if [ "$2" = none ]; then S="--simplify false"; else S="--simplify-ratio $2 --simplify-error 0.02"; fi
  $G optimize ../models-src/$1.glb ../public/models/$1.glb --compress quantize --texture-compress webp --texture-size 1024 $S 2>&1 | grep -E "^info:" || true
}
opt brezza 0.055
opt punch 0.18
opt sonet 0.18
# Fortuner ships outline lines and flat-shaded faces: strip them first so it can be decimated
node strip-non-triangles.mjs ../models-src/fortuner.glb /tmp/fortuner-prepped.glb --drop-normals
$G optimize /tmp/fortuner-prepped.glb ../public/models/fortuner.glb --compress quantize --texture-compress webp --texture-size 1024 --simplify-ratio 0.13 --simplify-error 0.02 2>&1 | grep -E "^info:" || true
# Creta and Swift use the old specular-glossiness materials: convert to metal-roughness first so colours survive
for id in creta swift; do $G metalrough ../models-src/$id.glb /tmp/$id-mr.glb > /dev/null 2>&1; done
$G optimize /tmp/creta-mr.glb ../public/models/creta.glb --compress quantize --texture-compress webp --texture-size 1024 --simplify-ratio 0.13 --simplify-error 0.02 2>&1 | grep -E "^info:" || true
$G optimize /tmp/swift-mr.glb ../public/models/swift.glb --compress quantize --texture-compress webp --texture-size 1024 --simplify-ratio 0.7 --simplify-error 0.02 2>&1 | grep -E "^info:" || true
opt ertiga 0.6
opt scorpio 0.5
opt thar none
opt nexon none
