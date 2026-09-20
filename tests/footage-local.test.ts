import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdir, mkdtemp, writeFile, symlink } from "node:fs/promises";
import { join } from "node:path";
import { PROJECT_ROOT } from "../scripts/reference-local.js";
import { resolveFootagePath } from "../scripts/footage-local.js";

test("footage manifests reject traversal, network paths, Windows device names and linked parents", async () => {
  const base = join(PROJECT_ROOT, ".test-artifacts"); await mkdir(base, { recursive: true });
  const root = await mkdtemp(join(base, "footage-paths-")), manifest = join(root, "manifest.json");
  await writeFile(join(root, "synthetic & local.mp4"), "authorized synthetic bytes");
  assert.equal(await resolveFootagePath(manifest, "synthetic & local.mp4"), join(root, "synthetic & local.mp4"));
  for (const name of ["../secret.mp4", "nested/../../secret.mp4", "C:/secret.mp4", "\\\\host\\share\\clip.mp4", "https://host/clip.mp4", "NUL.mp4", "foo:bar.mp4", "nested/./clip.mp4", "nested/clip.mp4."]) await assert.rejects(resolveFootagePath(manifest, name), { code: "MEDIA_UNREADABLE" });
  const target = join(root, "target"); await mkdir(target); await writeFile(join(target, "clip.mp4"), "synthetic bytes");
  await symlink(target, join(root, "linked"), "junction");
  await assert.rejects(resolveFootagePath(manifest, "linked/clip.mp4"), { code: "MEDIA_UNREADABLE" });
});
