// B2-A2 actual-media execution proofs. Generated fixtures only; never owner media, models or network.
import assert from "node:assert/strict";
import { before, test } from "node:test";
import { mkdir, mkdtemp, readFile, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import * as local from "../scripts/media-ingest-local.js";
import { CANONICAL_PLAN_TOOLCHAIN, CanonicalMediaPlanDerivationSchema, buildCanonicalMediaPlanDerivation, canonicalPlanComputationIdOf,
  planCanonicalizationV1, type CanonicalMediaFacts, type CanonicalizationPlan, type CanonicalMediaPlanDerivation } from "../packages/media-ingest/index.js";
import { generatePlanFixture, generatePlanVariant, generatePlanSubtitle, independentListing, independentProbe, sha256File } from "./support/canonical-media-fixtures.js";
import { observeMediaSpawns, PINNED_TOOL_ROOT } from "./support/edit-render-media.js";
import { CANONICAL_STORE, OWNER_CANONICAL_RENDER_AUTHORIZATION_STATEMENT, canonicalObjectName } from "../packages/edit-render/owner-media.js";
import { createOwnerMediaLifecycleAuthority } from "../scripts/edit-render-owner-media-authority-local.js";

const api = local as unknown as Record<string, unknown>;
type Result = { outcome: string; facts?: CanonicalMediaFacts; plan?: CanonicalizationPlan; derivation?: CanonicalMediaPlanDerivation;
  output?: local.SourceIdentity; computationId?: string; cache?: string; publication?: string; authorization?: unknown };
const canonicalize = (request: local.CanonicalIngestRequest) => (api.canonicalizeLocalMedia as (r: local.CanonicalIngestRequest) => Promise<Result>)(request);
let base = "";
interface Case { id: string; select?: boolean; rebase?: boolean; declare?: boolean; snap?: boolean; retime?: boolean; audio?: boolean; bFrames?: boolean;
  quantized?: boolean; subtitle?: boolean; pcm?: boolean }
const CASES: Case[] = [
  { id: "M01", select: true }, { id: "M02", rebase: true }, { id: "M03", snap: true }, { id: "M04", retime: true, audio: true },
  { id: "M05", select: true, declare: true }, { id: "M06", rebase: true, declare: true }, { id: "M07", snap: true, declare: true },
  { id: "M08", snap: true, retime: true, audio: true }, { id: "M09", select: true, rebase: true, declare: true, snap: true },
  { id: "M10", select: true, rebase: true, declare: true, snap: true, retime: true, audio: true },
  { id: "E12", snap: true, bFrames: true },
  { id: "E14", snap: true, quantized: true },
  { id: "E15", select: true, subtitle: true }, { id: "E16", select: true, audio: true, pcm: true },
  { id: "E17", rebase: true, audio: true },
];
const sources: Record<string, string> = {};
before(async () => {
  base = await realpath(await mkdtemp(join(tmpdir(), "a2-plans-")));
  const generated = join(base, "generated"); await mkdir(generated);
  for (const c of CASES) {
    const seed = await generatePlanFixture(generated, `${c.id}-seed.mp4`, { sar: c.declare ? "unspecified" : "square", audio: c.pcm ? "pcm" : c.audio ? "aac" : "none", bFrames: c.bFrames ?? false,
      ...(c.quantized ? { rate: "30000/1001", frameCount: 120 } : {}) });
    sources[c.id] = c.subtitle ? await generatePlanSubtitle(seed, join(generated, `${c.id}.mp4`))
      : await generatePlanVariant(seed, join(generated, `${c.id}.mp4`), c.quantized ? { quantized: true } : c.pcm ? { ...c, container: "mov" } : c);
  }
});
async function request(path: string, label: string): Promise<local.CanonicalIngestRequest> {
  const workspaceRoot = await realpath(await mkdtemp(join(base, label)));
  return { sourcePath: path, toolRoot: PINNED_TOOL_ROOT, workspaceRoot, clock: { now: () => "2026-10-07T00:00:00.000Z" },
    rootAuthorization: { manifestType: "AuthorizedFootage", schemaVersion: "1.1.0", ...await sha256File(path), sourceType: "owner_supplied", authorizationBasis: "owner_created",
      allowedPurposes: ["local_footage_analysis"], dateAdded: "2026-10-01T00:00:00.000Z", creatorId: "creator_a2_plans", projectId: "project_a2_plans", canonicalizationConsent: "local_media_canonicalization" } };
}
const operations = (c: Case) => [[c.select, "SELECT_AV_STREAMS"], [c.rebase, "REBASE_TIMELINE_ZERO"], [c.declare, "DECLARE_SQUARE_SAMPLE_ASPECT"],
  [c.snap, "SNAP_VIDEO_TIMESTAMPS"], [c.retime, "RETIME_AUDIO_CONTIGUOUS"]].filter(([used]) => used).map(([, op]) => op);
const hashes = (listing: string) => listing.split("\n").filter(line => line !== "" && !line.startsWith("#")).map(line => line.split(",").slice(4, 6).map(s => s.trim()));

for (const c of CASES) test(`A2-${c.id} one invocation executes ${operations(c).join(" + ")} with two-run determinism`, async () => {
  const r = await request(sources[c.id]!, `${c.id}-one-`), observed = await local.inspectCanonicalLocalMedia(r);
  const planned = planCanonicalizationV1(observed.facts);
  assert.equal(planned.outcome, "PLAN", JSON.stringify(planned.evaluation));
  assert.deepEqual(planned.plan!.operations.map(op => op.op), operations(c));
  const spawns = observeMediaSpawns(); let first: Result;
  try {
    first = await canonicalize(r); assert.equal(first.outcome, "PLAN");
    const writes = spawns.calls.filter(call => call.tool === "ffmpeg" && call.arguments.includes("-fs"));
    assert.equal(writes.length, 1); const argv = writes[0]!.arguments;
    assert.ok(argv.includes("-copyts")); assert.equal(argv[argv.indexOf("-c") + 1], "copy");
    assert.ok(!argv.includes("-vf") && !argv.includes("-af") && !argv.includes("-r"));
  } finally { spawns.restore(); }
  const derivation = CanonicalMediaPlanDerivationSchema.parse(first.derivation);
  assert.equal(derivation.artifactVersion, "0.2.0");
  assert.equal(first.computationId, canonicalPlanComputationIdOf({ source: observed.source, plan: planned.plan!, toolchain: CANONICAL_PLAN_TOOLCHAIN }));
  const output = join(r.workspaceRoot, ...CANONICAL_STORE.directory, CANONICAL_STORE.objects, canonicalObjectName(first.output!.contentHash));
  const outputIdentity = await sha256File(output); assert.equal(outputIdentity.contentHash, first.output!.contentHash);
  assert.deepEqual(hashes(await independentListing(r.sourcePath, "video")), hashes(await independentListing(output, "video")), "all decoded frames match by index");
  if (c.audio) {
    assert.deepEqual(hashes(await independentListing(r.sourcePath, "audio")), hashes(await independentListing(output, "audio")), "all retained audio packet payloads match by index");
  }
  const outputRequest = { ...r, sourcePath: output, rootAuthorization: { ...(r.rootAuthorization as object), ...outputIdentity } };
  const fresh = await local.inspectCanonicalLocalMedia(outputRequest);
  assert.equal(planCanonicalizationV1(fresh.facts).outcome, "DIRECT");
  assert.deepEqual(buildCanonicalMediaPlanDerivation({ rootAuthorization: r.rootAuthorization, source: { facts: observed.facts }, plan: planned.plan,
    output: { ...outputIdentity, facts: fresh.facts, decodedFrames: derivation.output.verification.video.decodedFrames,
      videoPackets: derivation.output.verification.video.bitstream.state === "packet_payloads_identical" ? derivation.output.verification.video.bitstream : null,
      audioPackets: derivation.output.verification.audio.state === "retained" ? derivation.output.verification.audio.payload : null } }), derivation);
  const probe = JSON.parse(await independentProbe(output)) as { streams: { codec_type: string }[] };
  assert.deepEqual(probe.streams.map(s => s.codec_type), c.audio ? ["video", "audio"] : ["video"]);
  const second = await canonicalize(await request(sources[c.id]!, `${c.id}-two-`));
  assert.deepEqual(second.output, first.output); assert.deepEqual(second.derivation, derivation);
  assert.equal((await readFile(output)).length, first.output!.sizeBytes);
  if (c.id === "M09") {
    const registry = await createOwnerMediaLifecycleAuthority({ baseDirectory: dirname(r.sourcePath), canonicalWorkspace: r.workspaceRoot, clock: r.clock,
      registration: { artifactType: "OwnerMediaRegistration", artifactVersion: "0.2.0", stability: "internal_pre_stable",
        footage: { manifestType: "AuthorizedFootageSet", schemaVersion: "1.0.0", creatorId: "creator_a2_plans", projectId: "project_a2_plans",
          assets: [{ entryId: "source", path: basename(r.sourcePath), authorization: r.rootAuthorization }] },
        canonicalDerivatives: [{ entryId: "canonical", rootEntryId: "source", derivation, authorization: first.authorization }],
        renderAuthorization: { statement: OWNER_CANONICAL_RENDER_AUTHORIZATION_STATEMENT, owner: { kind: "owner", actorId: "owner_a2_test" }, renderIntents: ["final"],
          authorizedAt: "2026-10-01T00:00:00.000Z", expiresAt: null } } });
    assert.equal((await registry.verify(first.output!.assetId)).contentHash, first.output!.contentHash);
    registry.assertCurrent(first.output!.assetId, r.clock.now()); registry.requestDeletion(observed.source.assetId);
    assert.throws(() => registry.assertCurrent(first.output!.assetId, r.clock.now()));
  }
});
