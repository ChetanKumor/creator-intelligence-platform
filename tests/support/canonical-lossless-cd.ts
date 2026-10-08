// C–D GENERATED MEDIA ONLY. Uses the accepted pinned fixture tools; never imports test encoders into production.
import { mkdir, mkdtemp, realpath } from "node:fs/promises";
import { join } from "node:path";
import { inspectCanonicalChromaLocalMedia, type CanonicalIngestRequest } from "../../scripts/media-ingest-local.js";
import { calibrationFrames, encodeGeneratedSource, declareGeneratedChroma, registerGenerated, MATRIX_FOR_D4 } from "./canonical-reencode-media.js";
import { patchPlanFixture } from "./canonical-plan-media.js";
import { sha256File } from "./canonical-media-fixtures.js";
import { PINNED_TOOL_ROOT } from "./edit-render-media.js";
import { type PixelTransform } from "./canonical-pixel-reference.js";
export async function cdBase(prefix: string): Promise<string> {
  await mkdir(".local-runs/phase5-gate7", { recursive: true });
  return realpath(await mkdtemp(".local-runs/phase5-gate7/" + prefix));
}
export async function cdRequest(source: string, workspace: string): Promise<CanonicalIngestRequest> {
  return { sourcePath: source, workspaceRoot: workspace, toolRoot: PINNED_TOOL_ROOT, clock: { now: () => "2026-10-08T00:00:00.000Z" },
    rootAuthorization: { manifestType: "AuthorizedFootage", schemaVersion: "1.1.0", ...await sha256File(source), sourceType: "owner_supplied",
      authorizationBasis: "owner_created", allowedPurposes: ["local_footage_analysis"], dateAdded: "2026-10-01T00:00:00.000Z",
      creatorId: "creator_cd_generated", projectId: "project_cd_generated", canonicalizationConsent: "local_media_canonicalization" } };
}
export async function cdSeed(base: string, codec: "h264" | "hevc", width = 64, height = 48, count = 9): Promise<string> {
  const name = codec + "-" + width + "x" + height;
  const seed = await encodeGeneratedSource(base, name, codec, calibrationFrames(width, height, count));
  return declareGeneratedChroma(seed, join(base, name + "-center.mp4"), codec, 1);
}
export async function cdTransform(base: string, source: string, name: string, transform: PixelTransform): Promise<string> {
  return transform === "identity" ? source : registerGenerated(await patchPlanFixture(source, join(base, name + "-input.mp4"),
    { matrix: MATRIX_FOR_D4[transform] }));
}
export async function cdAdmit(source: string, base: string) {
  const request = await cdRequest(source, base), observed = await inspectCanonicalChromaLocalMedia(request);
  return { request, ...observed };
}
