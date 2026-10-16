// Prepares a downloaded .glb for simplification:
//  - removes line/point primitives (some models ship outline "wireframe" lines)
//  - optionally drops normals so flat-shaded meshes can be welded and decimated (three.js re-lights them flat)
// Usage: node strip-non-triangles.mjs <in.glb> <out.glb> [--drop-normals]
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
const [, , input, output, flag] = process.argv;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(input);
let removed = 0;
for (const mesh of doc.getRoot().listMeshes()) {
  for (const prim of mesh.listPrimitives()) {
    if (prim.getMode() < 4) { mesh.removePrimitive(prim); prim.dispose(); removed++; }
    else if (flag === '--drop-normals') prim.setAttribute('NORMAL', null);
  }
}
await io.write(output, doc);
console.log(`removed ${removed} non-triangle primitives${flag ? ', dropped normals' : ''}`);
