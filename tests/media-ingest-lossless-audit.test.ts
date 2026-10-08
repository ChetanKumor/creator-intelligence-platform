// Precise additive preservation: accepted baseline hashes, never regenerated goldens.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";
const pins = [
  {
    "path": "package-lock.json",
    "bytes": 1937,
    "sha256": "96a41979781463cb304934b47bb0de6685af01c953eef0618467a0e590059691"
  },
  {
    "path": "package.json",
    "bytes": 1681,
    "sha256": "4789fe849b56e800b402bbbe2a6a67871e7ee398fecd4132f11248cad1269084"
  },
  {
    "path": "packages/edit-render/owner-media.ts",
    "bytes": 38653,
    "sha256": "a00df854ccf87719f6d5330b3adf06030c073d7dd3591509c3ea5ba617dd096a"
  },
  {
    "path": "packages/media-ingest/canonical.ts",
    "bytes": 28392,
    "sha256": "f7b2cae9410625c426bd579ae43d93228eb0adbd053459221ba14320d8cc0332"
  },
  {
    "path": "packages/media-ingest/chroma.ts",
    "bytes": 24347,
    "sha256": "b821580f0e8426931a5d16304d92c313d53a9ec197c83dcc88386a336b78ccee"
  },
  {
    "path": "packages/media-ingest/index.ts",
    "bytes": 3877,
    "sha256": "7a75694cd03052f447bc6f03f63d7b11fb9ff26471b4bc06bc83af7702c0786d"
  },
  {
    "path": "packages/media-ingest/plan.ts",
    "bytes": 39501,
    "sha256": "29a5c4b8e0eacb0ddbdd6bc27909078e26d5482bf96b3de23a11780ef9a35f39"
  },
  {
    "path": "packages/media-ingest/profile.ts",
    "bytes": 44654,
    "sha256": "7dfb89591d2a75e5cb2f3c068da59ea301145c777720e9fd1322153564febc94"
  },
  {
    "path": "packages/media-ingest/reencode.ts",
    "bytes": 22699,
    "sha256": "ffb68fa7b133654757fc3906e1dfcbc5827ae669b3b0fdf721329c5057e54620"
  },
  {
    "path": "scripts/audit-workspace.mjs",
    "bytes": 14732,
    "sha256": "2353f2ed0cd258997ac9a29967372c09c9598bd36a7bce1615cc38a8cf75b53d"
  },
  {
    "path": "scripts/edit-render-owner-media-authority-local.ts",
    "bytes": 30928,
    "sha256": "fea458a60b33106610716c3f560e84e028ee34c9ff153594fa3ea3694d3bbd6e"
  },
  {
    "path": "tests/support/canonical-pixel-reference.ts",
    "bytes": 5615,
    "sha256": "31939aa36472d43152761fbe817eeb555a75e8c0bc2d47c8831f0dd1fd9184a4"
  }
];
for (const p of pins) test("CD-AUDIT-frozen " + p.path, () => { const b=readFileSync(p.path); assert.equal(b.length,p.bytes); assert.equal(createHash("sha256").update(b).digest("hex"),p.sha256); });
const additions = [
  {
    "path": "scripts/media-ingest-local.ts",
    "bytes": 118584,
    "sha256": "f56abf2048e6991a67482cc806727b926b610c2e5a81545c91fc6ac8d8a92a66"
  },
  {
    "path": "tests/media-ingest-plan-trust-media.integration.ts",
    "bytes": 12217,
    "sha256": "d1324b3d33c19786a4c8c81c9e93c39a5e617500fd171659cbae786688cbff61"
  },
  {
    "path": "tests/support/canonical-reencode-media.ts",
    "bytes": 17807,
    "sha256": "916f6beeeda54063c6f0ae1278806e5c8829dc1e4632d5a895c8d7d1ddd316fa"
  }
];
for (const p of additions) test("CD-AUDIT-exact-accepted-prefix " + p.path, () => { const b=readFileSync(p.path); assert.ok(b.length>p.bytes); assert.equal(createHash("sha256").update(b.subarray(0,p.bytes)).digest("hex"),p.sha256); });
