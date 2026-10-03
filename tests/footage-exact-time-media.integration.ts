// Gate 7 Batch 3D R02-A: real synthetic media through the accepted footage service seam (TypeScript -> Python worker -> pinned ffprobe ->
// MediaMetadata). The accepted renderer admits a source only when every frameTimes entry is exactly secondsOf(frame i on the grid)
// (packages/edit-render/program.ts:120-122). Genuinely constant-rate clips at 30, 60, 30000/1001, 25 and 50 fps must meet that rule
// through the analyzer; a timeline with one moved frame or variable intervals must not; and a metadata memo written before R02-A
// (microsecond-rounded, as the Phase-2 cache holds for the owner's footage) must never be read back.
import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdir, mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { rateOf, secondsOf } from "../packages/edit-graph/common.js";
import { FootageAuthorizationSchema, FootageManifestSchema } from "../packages/footage-analyzer/protocol.js";
import { contentId } from "../packages/reference-analyzer/features.js";
import type { MediaMetadata } from "../packages/reference-analyzer/protocol.js";
import { LocalFootageServices } from "../scripts/footage-local.js";
import { FileArtifactCache, PROJECT_ROOT, atomicJson, localPaths } from "../scripts/reference-local.js";
import { stubConfig } from "./support/footage.js";
import { authorizedFootageEntry, mediaCommand } from "./support/footage-media.js";

/** The first frame whose table entry is not exactly its instant on the declared grid (the renderer's own rule), or -1. */
function firstOffGrid(m: MediaMetadata): number {
  const rate = rateOf(m.fps.numerator, m.fps.denominator);
  return m.frameTimes.findIndex((t, i) => t !== secondsOf({ value: i, rate }));
}

test("3D-R02A footage metadata carries each frame's exact instant from the pinned ffprobe through the accepted service seam", { timeout: 300000 }, async () => {
  const base = join(PROJECT_ROOT, ".test-artifacts"); await mkdir(base, { recursive: true });
  const directory = await mkdtemp(join(base, "footage-exact-time-"));
  const prefix = ["-hide_banner", "-loglevel", "error", "-nostdin", "-y"], encode = ["-c:v", "libx264", "-pix_fmt", "yuv420p", "-threads", "1"];
  const generate = (source: string, file: string, extra: string[] = []) => mediaCommand(localPaths.ffmpeg, [...prefix, "-f", "lavfi", "-i", source, ...extra, ...encode, join(directory, file)]);
  // Genuinely constant-rate clips as the pinned FFmpeg muxes them (time bases 1/15360, 1/30000 and 1/12800; every timestamp delta equal).
  const cfr = [["cfr-30.mp4", 30, 1], ["cfr-60.mp4", 60, 1], ["cfr-30000-1001.mp4", 30000, 1001], ["cfr-25.mp4", 25, 1], ["cfr-50.mp4", 50, 1]] as const;
  for (const [file, numerator, denominator] of cfr) await generate(`testsrc2=s=64x36:r=${numerator}/${denominator}:d=2`, file);
  // Exact timestamps on a 1/90000 time base: frame 7 moved by one tick, and alternating 4000/2000-tick intervals.
  const exactTimestamps = ["-fps_mode", "passthrough", "-enc_time_base", "1/90000", "-video_track_timescale", "90000", "-bf", "0"];
  await generate("testsrc2=s=64x36:r=30:d=2", "perturbed-30.mp4", ["-vf", "settb=1/90000,setpts=N*3000+eq(N\\,7)", ...exactTimestamps]);
  await generate("testsrc2=s=64x36:r=30:d=2", "variable-30.mp4", ["-vf", "settb=1/90000,setpts=N*3000+mod(N\\,2)*1000", ...exactTimestamps]);
  await generate("testsrc2=s=64x36:r=30:d=1", "cached-30.mp4");
  const names = [...cfr.map(c => c[0]), "perturbed-30.mp4", "variable-30.mp4", "cached-30.mp4"];
  const manifest = FootageManifestSchema.parse({ manifestType: "AuthorizedFootageSet", schemaVersion: "1.0.0", creatorId: "creator_footage_media", projectId: "project_footage_media",
    assets: await Promise.all(names.map(name => authorizedFootageEntry(directory, name))) });
  const manifestPath = join(directory, "authorized-footage.json"); await atomicJson(manifestPath, manifest);
  // The memo a source analysed before R02-A carries: the same 30 fps clip with its microsecond-rounded table, under the pre-R02-A key.
  const cacheRoot = join(directory, "cache"), cached = manifest.assets.find(a => a.path === "cached-30.mp4")!;
  const staleValue = { value: { durationSeconds: 1, width: 64, height: 36, codedWidth: 64, codedHeight: 36, fps: { numerator: 30, denominator: 1 }, frameCount: 30,
    frameTimes: Array.from({ length: 30 }, (_, i) => Number((i / 30).toFixed(6))), codec: "h264", rotation: 0, aspectRatio: { width: 16, height: 9 }, hasAudio: false,
    variableFrameRate: false }, version: "9.0.1-essentials_build-www.gyan.dev" };
  const staleKey = contentId("cache", ["footage-metadata-v1", FootageAuthorizationSchema.parse(cached.authorization).contentHash, "ffprobe-9.0.1"]);
  await new FileArtifactCache(cacheRoot, 16 * 1024 * 1024).write(staleKey, { version: "footage-cache-v1", key: staleKey, value: staleValue, checksum: contentId("digest", staleValue) });
  const services = new LocalFootageServices(manifestPath, join(directory, "capacity.json"), join(directory, "frames"), cacheRoot);
  try {
    const config = stubConfig(), observed: Record<string, { fps: string; variableFrameRate: boolean; firstOffGrid: number }> = {};
    for (const name of names) {
      const entry = manifest.assets.find(a => a.path === name)!;
      const m = (await (await services.open(entry, FootageAuthorizationSchema.parse(entry.authorization), config)).media.metadata()).value;
      observed[name] = { fps: `${m.fps.numerator}/${m.fps.denominator}`, variableFrameRate: m.variableFrameRate, firstOffGrid: firstOffGrid(m) };
    }
    // One comparison of every case, so a failure reports them all.
    assert.deepEqual(observed, {
      ...Object.fromEntries(cfr.map(([file, numerator, denominator]) => [file, { fps: `${numerator}/${denominator}`, variableFrameRate: false, firstOffGrid: -1 }])),
      "perturbed-30.mp4": { fps: "30/1", variableFrameRate: false, firstOffGrid: 7 },
      "variable-30.mp4": { fps: "5400/181", variableFrameRate: true, firstOffGrid: 1 },
      "cached-30.mp4": { fps: "30/1", variableFrameRate: false, firstOffGrid: -1 },
    });
  } finally { await services.close(); }
});
