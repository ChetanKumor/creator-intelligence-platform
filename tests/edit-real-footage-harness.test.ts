// Gate 7 Batch 3D: cloud tests of the owner-run real-footage harness (tests/support/edit-real-footage.ts) and of the runner's non-media
// steps. No media is decoded, no runtime process starts, no model runs and nothing reaches a network. Analyses come from the accepted pure
// analyzer over opaque test bytes: synthetic ones carry synthetic labels throughout. The "real-shaped" fixture below is a STRUCTURAL
// fixture only: its authorization is declared owner_supplied and its vectors come from a test backend, never the frozen model, so it
// proves only that the harness DERIVES real-media labels from real-labelled inputs. It is not real-footage or real-model evidence.
import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { analyzeFootage } from "../packages/footage-analyzer/index.js";
import { DEFAULT_FOOTAGE_CONFIG, type FootageManifest } from "../packages/footage-analyzer/protocol.js";
import { siglipConfiguration } from "../packages/reference-analyzer/models.js";
import type { EmbeddingBackend } from "../packages/reference-analyzer/embeddings.js";
import { canonicalTime, frameTime, rateOf, sameInstant } from "../packages/edit-graph/common.js";
import * as E from "../packages/edit-editorial/index.js";
import { EditRenderError, OWNER_RENDER_AUTHORIZATION_STATEMENT, checkOwnerMediaProvenance, compileRenderProgram } from "../packages/edit-render/index.js";
import { openValidatedDag } from "../packages/edit-runtime/index.js";
import { openLocalEditingProject } from "../scripts/edit-editorial-local.js";
import { PROJECT_ROOT } from "./support/edit-render-media.js";
import { footageEnvironment } from "./support/footage.js";
import * as R from "./support/edit-real-footage.js";

const JOB = "footage_00000000-0000-4000-8000-00000000b3d0";
const OWNER = { kind: "owner" as const, actorId: "owner_batch3d_harness_test" };
const T = (second: number) => `2026-09-30T10:00:${String(second).padStart(2, "0")}.000Z`;
/** A test backend of the frozen model's width. Its vectors are arbitrary test numbers, never model output. */
class WideTestBackend implements EmbeddingBackend {
  async embed(ids: readonly string[]) {
    return { vectors: ids.map((sampleId, i) => ({ sampleId, vector: Array.from({ length: 1152 }, (_, k) => ((k * 7 + i * 13) % 17) / 17 + 0.01) })), version: "test-backend-not-a-model",
      device: "cpu" as const, fallback: false };
  }
}
/** Analyses of two opaque sources by the accepted pure analyzer: synthetic (stub), or the structural real-shaped fixture described above. */
async function analyzed(o: { realShaped?: boolean; duration?: number } = {}) {
  const env = await footageEnvironment(["alpha", "beta"], o.duration ?? 1);
  let manifest: FootageManifest = env.manifest, config = env.config, services = env.services;
  if (o.realShaped) {
    manifest = { ...manifest, assets: manifest.assets.map(a => ({ ...a, authorization: { ...(a.authorization as object), sourceType: "owner_supplied", authorizationBasis: "owner_created" } })) };
    config = { ...DEFAULT_FOOTAGE_CONFIG, embedding: siglipConfiguration("so400m") };
    const base = env.services;
    services = { ...base, async open(entry, authorization, c) {
      const opened = await base.open(entry, authorization, c);
      return { ...opened, backend: new WideTestBackend(), expectedDimensions: async () => 1152 };
    } };
  }
  const result = await analyzeFootage(manifest, config, JOB, services);
  assert.equal(result.analyses.length, 2);
  const record = { jobId: JOB, status: "succeeded", modelRuns: env.telemetry.modelRuns(), events: [], timings: result.timings, cache: result.cacheStats, configuration: config };
  const sources = result.analyses.map((analysis, i) => ({ entryId: manifest.assets[i]!.entryId, analysis })) as [R.TimelineSource, R.TimelineSource];
  return { sources, record, manifest };
}
/** The pure chain up to the baseline ExecutionDag, exactly as the runner builds it, with fixed instants and a declared (test) verification. */
function chainOf(a: Awaited<ReturnType<typeof analyzed>>, o: { realMedia: boolean }) {
  const plan = R.planOutput(a.sources, { sourceAudio: "excluded", outputResolution: null, realMedia: o.realMedia });
  const { chosen } = R.selectTimeline(a.sources, [null, null], plan);
  const scope = { projectId: a.manifest.projectId, creatorId: a.manifest.creatorId };
  const root = R.buildRealChain({ scope, owner: OWNER, run: { jobId: JOB, record: a.record }, plan, sourceAudio: "excluded", retentionExpiresAt: null,
    timeline: [{ ...a.sources[0], candidateId: chosen[0].candidateId }, { ...a.sources[1], candidateId: chosen[1].candidateId }], times: { world: T(0), capability: T(1) } });
  let attempt = 0;
  const execution = (chain: R.GraphChain) => {
    attempt += 1;
    const assets = [...new Set(chain.graph.clipUses.filter(c => c.medium === "video").map(c => c.source.assetId))].sort();
    const verified = assets.map(assetId => { const s = a.sources.find(x => x.analysis.assetId === assetId)!.analysis;
      return { assetId, contentHash: s.contentHash, sizeBytes: s.authorization.sizeBytes, checkedAt: T(10 * attempt + 3) }; });
    const verificationEvidence = new Map(verified.map((v, i) => [v.assetId, R.artifactOf(`b3d_test_verification_${attempt}_${i}`, "Evidence",
      { scope: root.scope, basis: "test_declared_not_hashed", ...v })]));
    return R.buildExecution(chain, { owner: OWNER, authorityEvidence: R.artifactOf("b3d_test_authority", "Evidence", { scope: root.scope, basis: "test_render_authorization_not_real" }),
      resolver: { resolverId: "test_declared_resolver", version: "0.1.0", implementationDigest: "e".repeat(64) }, verified, verificationEvidence, renderIntents: ["final"],
      mediaGrantExpiresAt: null, times: { mediaGrant: T(10 * attempt + 2), capability: T(10 * attempt + 4), estimate: T(10 * attempt + 5), issued: T(10 * attempt + 6),
        admitted: T(10 * attempt + 7), expires: "2026-09-30T12:00:00.000Z" }, attempt, prefix: `b3d_test_attempt_${attempt}` });
  };
  const rootChain = R.rootGraphChain(root), x = execution(rootChain);
  return { plan, chosen, root, rootChain, x, execution, scope: root.scope };
}
const refusalOf = (run: () => unknown) => { try { run(); } catch (error) { if (error instanceof R.HarnessRefusal) return [error.code, ...error.reasons].join(" | "); throw error; } return null; };

// ================================================================ the run manifest and its locations
test("3D-H01 the run manifest is strict and minimal, and private manifests stay git-ignored", () => {
  const valid = { manifestType: "Batch3DRealFootageRun", schemaVersion: "0.1.0", footageManifest: "C:\\owner\\footage\\authorized-footage.json", analysisJobId: JOB,
    renderAuthorization: { statement: OWNER_RENDER_AUTHORIZATION_STATEMENT, owner: OWNER, renderIntents: ["final"], authorizedAt: T(0), expiresAt: null },
    timeline: [{ entryId: "entry_alpha", candidateId: null }, { entryId: "entry_beta", candidateId: null }], sourceAudio: "excluded", outputResolution: null };
  assert.equal(R.RealFootageRunManifestSchema.safeParse(valid).success, true);
  for (const patch of [{ extra: true }, { analysisJobId: "footage_not_a_uuid" }, { timeline: [...valid.timeline, valid.timeline[0]] }, { timeline: [valid.timeline[0]] },
    { renderAuthorization: { ...valid.renderAuthorization, renderIntents: ["preview"] } }, { renderAuthorization: { ...valid.renderAuthorization, statement: "yes" } },
    { outputResolution: { width: 1081, height: 1920 } }, { sourceAudio: "auto" }, { timeline: [{ entryId: "a", candidateId: null, path: "x.mp4" }, valid.timeline[1]] }]) {
    assert.equal(R.RealFootageRunManifestSchema.safeParse({ ...valid, ...patch }).success, false, JSON.stringify(patch));
  }
  assert.equal(R.manifestArgument(["--manifest", "C:\\owner\\run.json"]), "C:\\owner\\run.json");
  assert.equal(R.manifestArgument(["--manifest", "/home/owner/run.json"]), "/home/owner/run.json");
  for (const args of [[], ["--manifest"], ["--manifest", "relative.json"], ["--manifest", "https://example.com/run.json"], ["--manifest", "\\\\server\\share\\run.json"],
    ["--manifest", "//server/share/run.json"], ["--manifest", "C:\\owner\\..\\run.json"], ["--manifest", "/tmp/run.json", "--extra"], ["--discover", "C:\\"]]) {
    assert.ok(refusalOf(() => R.manifestArgument(args)) !== null, JSON.stringify(args));
  }
  assert.equal(R.privateLocationRefusal("../owner/run.json", "m"), null);
  assert.equal(R.privateLocationRefusal(".local-media/batch3d/run.json", "m"), null);
  assert.equal(R.privateLocationRefusal(".local-runs/x/run.json", "m"), null);
  assert.equal(R.privateLocationRefusal("docs/run.json", "m")?.code, "private_manifest_not_git_ignored");
  assert.equal(R.privateLocationRefusal("run.json", "m")?.code, "private_manifest_not_git_ignored");
});

// ================================================================ admissibility is inspected, never repaired
test("3D-H02 source admissibility refuses with the exact reason and repairs nothing", async () => {
  const a = await analyzed(), [s0, s1] = a.sources;
  const plan = R.planOutput(a.sources, { sourceAudio: "excluded", outputResolution: null, realMedia: false });
  assert.deepEqual({ ...plan, ticksPerSecond: plan.ticksPerSecond }, { frameRate: { numerator: 10, denominator: 1 }, ticksPerSecond: 1_000_000_000, aspect: { width: 9, height: 16 },
    resolution: { width: 90, height: 160 }, linkedAudio: false });
  const reasons = (patch: (m: R.FootageAnalysis["metadata"]) => void, o: Partial<Parameters<typeof R.planOutput>[1]> = {}, which = 1) => {
    const variant = structuredClone([s0, s1]) as [R.TimelineSource, R.TimelineSource];
    patch(variant[which]!.analysis.metadata);
    return refusalOf(() => R.planOutput(variant, { sourceAudio: "excluded", outputResolution: null, realMedia: false, ...o }));
  };
  assert.match(refusalOf(() => R.planOutput(a.sources, { sourceAudio: "excluded", outputResolution: null, realMedia: true }))!,
    /analysis_not_owner_real_media:entry_alpha.*analysis_not_frozen_semantic_model:entry_alpha/, "synthetic or stub analyses are never real-media evidence");
  assert.match(reasons(m => { m.variableFrameRate = true; })!, /source_not_admissible \| variable_frame_rate:entry_beta/);
  assert.match(reasons(m => { m.frameTimes[5] = 0.5000001; })!, /frame_table_off_grid:entry_beta:frame 5 /);
  assert.match(reasons(m => { m.codec = "hevc"; })!, /codec_unsupported:entry_beta:hevc/);
  assert.match(reasons(m => { m.rotation = 90; })!, /rotation_unsupported:entry_beta:90/);
  assert.match(reasons(m => { m.aspectRatio = { width: 3, height: 4 }; })!, /pixel_geometry_not_display_aspect:entry_beta.*display_aspect_mismatch:entry_beta/);
  assert.match(reasons(m => { m.fps = { numerator: 25, denominator: 1 }; })!, /frame_table_off_grid:entry_beta.*frame_rate_mismatch:entry_beta/);
  assert.match(reasons(() => undefined, { sourceAudio: "linked_identity" }, 0)!, /source_audio_absent:entry_alpha .*source_audio_absent:entry_beta/,
    "linked audio is never synthesized: the owner must exclude it explicitly");
  assert.match(reasons(() => undefined, { outputResolution: { width: 90, height: 150 } })!, /output_resolution_aspect_mismatch/);
  assert.match(reasons(m => { m.width = 91; m.height = 160; m.aspectRatio = { width: 91, height: 160 }; }, {}, 0)!, /output_resolution_unsupported:91x160/);
  const large = structuredClone([s0, s1]) as [R.TimelineSource, R.TimelineSource];
  large[0].analysis.keptCandidateIds = Array.from({ length: R.MAX_RETAINED_CANDIDATES }, (_, i) => `candidate_${i}`);
  assert.match(refusalOf(() => R.planOutput(large, { sourceAudio: "excluded", outputResolution: null, realMedia: false }))!,
    /candidate_universe_exceeds_harness_bound:\d+ retained candidates/, "a large universe is refused, never sampled");
});

test("3D-H03 the exact output clock represents every output frame and every microsecond instant, or refuses", () => {
  const cases: [number, number, number][] = [[30, 1, 999_000_000], [30000, 1001, 999_000_000], [25, 1, 1_000_000_000], [24000, 1001, 999_000_000],
    [60000, 1001, 999_000_000], [24, 1, 999_000_000], [50, 1, 1_000_000_000], [7, 1, 994_000_000]];
  for (const [numerator, denominator, expected] of cases) {
    const clock = R.outputClockFor({ numerator, denominator });
    assert.equal(clock, expected, `${numerator}/${denominator}`);
    assert.equal(clock % 1_000_000, 0, "every microsecond instant is whole ticks");
    assert.equal((clock * denominator) % numerator, 0, "every frame instant is whole ticks");
  }
  assert.match(refusalOf(() => R.outputClockFor({ numerator: 1009, denominator: 1 }))!, /^frame_rate_clock_unrepresentable/);
});

test("3D-H04 candidates and trims are exact admitted frames, sample-exact when audio is linked", async () => {
  const a = await analyzed(), plan = R.planOutput(a.sources, { sourceAudio: "excluded", outputResolution: null, realMedia: false });
  const { chosen } = R.selectTimeline(a.sources, [null, null], plan);
  for (const [i, c] of chosen.entries()) {
    const range = a.sources[i]!.analysis.candidates[c.index]!.candidate.sourceRange;
    assert.equal(c.frames, Math.round((range.endSeconds - range.startSeconds) * 10));
    assert.equal(c.endFrame - c.startFrame, c.frames);
  }
  assert.ok(chosen[0].frames >= chosen[1].frames || chosen[0].candidateId !== chosen[1].candidateId);
  // An owner-named candidate must itself be admissible; a missing one refuses with its reason.
  assert.match(refusalOf(() => R.selectTimeline(a.sources, ["candidate_missing", null], plan))!, /no_admissible_candidate \| entry_alpha.*candidate_missing: candidate_not_retained/);
  const named = R.selectTimeline(a.sources, [chosen[1].candidateId === chosen[0].candidateId ? null : a.sources[0].analysis.keptCandidateIds.at(-1)!, null], plan);
  assert.equal(named.chosen[0].candidateId, a.sources[0].analysis.keptCandidateIds.at(-1));
  // An endpoint the output clock cannot represent exactly, or a duration that is not whole output frames, is refused.
  const variant = structuredClone(a.sources[0].analysis), c0 = variant.candidates.find(c => c.candidate.candidateId === chosen[0].candidateId)!;
  c0.candidate.sourceRange = { startSeconds: 1 / 3, endSeconds: 1 / 3 + 1 };
  assert.deepEqual(R.candidateFacts(variant, chosen[0].candidateId, plan), { candidateId: chosen[0].candidateId, reasons: ["endpoint_not_exact_on_output_clock"] });
  c0.candidate.sourceRange = { startSeconds: 0.5, endSeconds: 1.05 };
  assert.deepEqual(R.candidateFacts(variant, chosen[0].candidateId, plan), { candidateId: chosen[0].candidateId, reasons: ["duration_not_whole_output_frames"] });
  // A trim: whole frames, at most a third of the clip, never a non-frame instant; a candidate-endpoint start moves to the first rendered frame.
  const ntsc: R.OutputPlan = { frameRate: { numerator: 30000, denominator: 1001 }, ticksPerSecond: 999_000_000, aspect: { width: 9, height: 16 }, resolution: { width: 90, height: 160 },
    linkedAudio: true };
  const grid = rateOf(30000, 1001), at = (frame: number) => canonicalTime(frameTime(frame, grid));
  const exact = R.trimKeep({ source: { range: { start: at(10), end: at(70) }, startAuthority: { kind: "frame_pts", frameIndex: 10 }, endAuthority: { kind: "frame_pts", frameIndex: 70 },
    precision: "frame_pts_exact" } }, 300, ntsc);
  assert.equal(exact.removedFrames, 15, "30000/1001 fps at 48 kHz: frames on whole samples are multiples of 5; half a second is 15 frames");
  assert.equal(exact.endFrame, 55); assert.ok(sameInstant(exact.keep.start, at(10))); assert.ok(sameInstant(exact.keep.end, at(55)));
  const odd = R.trimKeep({ source: { range: { start: at(10), end: at(71) }, startAuthority: { kind: "frame_pts", frameIndex: 10 }, endAuthority: { kind: "frame_pts", frameIndex: 71 },
    precision: "frame_pts_exact" } }, 300, ntsc);
  assert.equal(odd.endFrame % 5, 0); assert.ok(odd.removedFrames <= 15 && odd.removedFrames >= 1);
  const snapped = R.trimKeep({ source: { range: { start: canonicalTime({ value: 333_333, rate: { numerator: 1_000_000, denominator: 1 } }), end: at(40) },
    startAuthority: { kind: "candidate_endpoint" }, endAuthority: { kind: "frame_pts", frameIndex: 40 }, precision: "source_seconds" } }, 300, { ...ntsc, linkedAudio: false });
  assert.equal(snapped.startFrame, 10); assert.equal(snapped.startSnappedToRenderedFrame, true); assert.ok(sameInstant(snapped.keep.start, at(10)));
  assert.match(refusalOf(() => R.trimKeep({ source: { range: { start: at(10), end: at(12) }, startAuthority: { kind: "frame_pts", frameIndex: 10 },
    endAuthority: { kind: "frame_pts", frameIndex: 12 }, precision: "frame_pts_exact" } }, 300, ntsc))!, /^trim_not_representable/);
});

// ================================================================ the pure chain the runner builds
test("3D-H05 the chain over synthetic analyses derives synthetic labels throughout and reaches an executable program", async () => {
  const a = await analyzed(), c = chainOf(a, { realMedia: false });
  const media = [...c.root.mediaAssets.values()].map(m => m.value as { origin: string });
  assert.deepEqual(media.map(m => m.origin), ["synthetic", "synthetic"], "synthetic media is never labelled creator_upload");
  const tokens = c.root.artifacts.filter(x => x.ref.artifactType === "EditorialToken").map(x => x.value as { semantic: { provenance: { mediaBasis: string; computationBasis: string } } });
  assert.equal(tokens.length, c.root.retained, "the candidate universe is exactly every retained candidate");
  assert.ok(tokens.every(t => t.semantic.provenance.mediaBasis === "synthetic" && t.semantic.provenance.computationBasis === "synthetic_stub"));
  const direction = c.root.artifacts.find(x => x.ref.artifactType === "CreativeDirectionGraph")!.value as { nodes: { intent: { description: string } }[] };
  assert.ok(direction.nodes.every(n => n.intent.description.startsWith("Deterministic verification input")));
  const producer = c.root.artifacts.find(x => x.ref.artifactType === "DirectorProducerRun")!.value as { basis: string };
  assert.equal(producer.basis, "synthetic_test", "no Director model: the direction is typed verification input");
  const video = c.root.graph.clipUses.filter(u => u.medium === "video");
  assert.deepEqual(video.map(u => u.candidateId), c.chosen.map(x => x.candidateId));
  const v = openValidatedDag({ dag: c.x.dagArtifact.ref }, c.x.artifacts), program = compileRenderProgram(v, c.x.artifacts);
  assert.deepEqual(program.segments.map(s => [s.video.startFrame, s.video.endFrame]), c.chosen.map(x => [x.startFrame, x.endFrame]));
  assert.deepEqual(program.output.frameRate, c.plan.frameRate); assert.deepEqual(program.output.resolution, c.plan.resolution);
  assert.equal(program.output.audio.state, "none");
  // The owner-local authority never answers for these synthetic sources, whatever else is supplied.
  for (const source of v.admission.sources) {
    assert.throws(() => checkOwnerMediaProvenance(source, c.x.artifacts), (e: unknown) => e instanceof EditRenderError && e.code === "lifecycle_authority_scope_invalid");
  }
});

test("3D-H06 STRUCTURAL real-shaped fixture: real-media labels are derived from real-labelled inputs and satisfy the owner-local eligibility rule", async () => {
  const a = await analyzed({ realShaped: true }), c = chainOf(a, { realMedia: true });
  assert.ok(a.sources.every(s => R.isFrozenRealModel(s.analysis)));
  const media = [...c.root.mediaAssets.values()].map(m => m.value as { origin: string; retention: unknown });
  assert.deepEqual(media.map(m => m.origin), ["creator_upload", "creator_upload"]);
  const tokens = c.root.artifacts.filter(x => x.ref.artifactType === "EditorialToken").map(x => x.value as { semantic: { provenance: { mediaBasis: string; computationBasis: string } } });
  assert.ok(tokens.length > 0 && tokens.every(t => t.semantic.provenance.mediaBasis === "real_footage" && t.semantic.provenance.computationBasis === "cached_real_model"));
  const v = openValidatedDag({ dag: c.x.dagArtifact.ref }, c.x.artifacts);
  for (const source of v.admission.sources) {
    assert.deepEqual(checkOwnerMediaProvenance(source, c.x.artifacts).provenance, { mediaOrigin: "creator_upload", sourceType: "owner_supplied", authorizationBasis: "owner_created" });
  }
  // A stub analysis of real media stays refused before any chain is built.
  const stub = structuredClone(a.sources) as [R.TimelineSource, R.TimelineSource];
  stub[1].analysis.configuration.embedding = { ...stub[1].analysis.configuration.embedding, revision: "0".repeat(40) };
  assert.match(refusalOf(() => R.planOutput(stub, { sourceAudio: "excluded", outputResolution: null, realMedia: true }))!, /analysis_not_frozen_semantic_model:entry_beta/);
});

// ================================================================ the runner's editorial steps, without media
test("3D-H07 the runner's editorial steps: state-only lock, exact trim proposal and localized authorization, lock refusal, historical preference, stale refusal", async t => {
  await mkdir(join(PROJECT_ROOT, ".test-artifacts"), { recursive: true });
  const root = await mkdtemp(join(PROJECT_ROOT, ".test-artifacts", "b3d-harness-")); t.after(() => rm(root, { recursive: true, force: true }));
  const a = await analyzed(), c = chainOf(a, { realMedia: false });
  const project = await openLocalEditingProject({ root, scope: c.scope, policy: E.createEditorialPolicy(c.scope, OWNER) });
  const interpret = (request: E.EditorialRequest, action: E.IntentAction) => project.interpret(request, { identity: R.VERIFICATION_INTERPRETER, async interpret() { return action; } });
  const h0 = await project.initialize(c.root.graph, c.x.artifacts), a0 = E.targetOf(h0.graph, R.videoClip(h0, 0).clipUseId);
  const lock = R.verificationRequest(h0, "b3d_lock_first", "Keep the first shot exactly as it is.", a0);
  assert.match(lock.rawUserText, /\(deterministic verification input\)$/);
  const h1 = await project.applyStateIntent(lock, await interpret(lock, { kind: "lock_target", target: a0 }));
  assert.equal(h1.graph.editGraphId, h0.graph.editGraphId); assert.equal(h1.state.hardLocks.length, 1);
  const trim = R.trimRequest(h1, "b3d_trim_second_a", c.plan), intent = await interpret(trim.request, trim.action);
  const proposed = await project.propose(trim.request, intent);
  const clip = proposed.child.clipUses.find(u => u.clipUseId !== undefined && u.medium === "video" && u.planningUse.position === 1)!;
  assert.ok(clip.medium === "video" && clip.source.precision === "frame_pts_exact" && sameInstant(clip.source.range.end, trim.trim.keep.end));
  const parentDag = openValidatedDag({ dag: c.x.dagArtifact.ref }, c.x.artifacts), childX = c.execution(R.revisionGraphChain(c.rootChain, proposed.child, proposed.artifacts));
  const childDag = openValidatedDag({ dag: childX.dagArtifact.ref }, childX.artifacts);
  const authorization = await project.authorize({ ...proposed, artifacts: childX.artifacts, parentDag, childDag });
  const parentProgram = compileRenderProgram(parentDag, c.x.artifacts), childProgram = compileRenderProgram(childDag, childX.artifacts);
  assert.equal(childProgram.segments[0]!.segmentComputationId, parentProgram.segments[0]!.segmentComputationId, "the locked clip's segment is reusable by identity");
  assert.notEqual(childProgram.segments[1]!.segmentComputationId, parentProgram.segments[1]!.segmentComputationId, "the trimmed clip's segment is recomputed");
  assert.equal(childProgram.segments[1]!.video.endFrame - childProgram.segments[1]!.video.startFrame, trim.trim.keptFrames);
  assert.ok(authorization.impact !== undefined);
  // The locked clip cannot be edited; a historical preference is state only; a request made against a superseded head is stale.
  const locked = R.trimRequest(h1, "b3d_trim_locked", c.plan, 0);
  await assert.rejects(project.propose(locked.request, await interpret(locked.request, locked.action)), (e: unknown) => e instanceof E.EditorialControlError && e.code === "hard_lock_conflict");
  const preference = R.verificationRequest(h1, "b3d_historical_preference", "I liked the intro from revision 0.", a0);
  const h2 = await project.applyStateIntent(preference, await interpret(preference, { kind: "set_preference", target: a0, value: "liked" }));
  assert.equal(h2.graph.editGraphId, h1.graph.editGraphId); assert.deepEqual(h2.state.preferences.at(-1)?.target, a0);
  await assert.rejects(project.propose(trim.request, intent), (e: unknown) => e instanceof E.EditorialControlError && e.code === "stale_editing_head");
  assert.equal((await project.current()).head.headId, h2.head.headId);
});

// ================================================================ R02-E: QC failure as its own revision 0 -> 1 attempt, without media
test("3D-R02E QC failure is its own revision 0 -> 1 attempt from the current locked head, with an exact trim distinct from the published one", async t => {
  await mkdir(join(PROJECT_ROOT, ".test-artifacts"), { recursive: true });
  const root = await mkdtemp(join(PROJECT_ROOT, ".test-artifacts", "b3d-r02e-")); t.after(() => rm(root, { recursive: true, force: true }));
  const a = await analyzed(), c = chainOf(a, { realMedia: false });
  const project = await openLocalEditingProject({ root, scope: c.scope, policy: E.createEditorialPolicy(c.scope, OWNER) });
  const interpret = (request: E.EditorialRequest, action: E.IntentAction) => project.interpret(request, { identity: R.VERIFICATION_INTERPRETER, async interpret() { return action; } });
  const h0 = await project.initialize(c.root.graph, c.x.artifacts), a0 = E.targetOf(h0.graph, R.videoClip(h0, 0).clipUseId);
  const lock = R.verificationRequest(h0, "b3d_lock_first", "Keep the first shot exactly as it is.", a0);
  const h1 = await project.applyStateIntent(lock, await interpret(lock, { kind: "lock_target", target: a0 }));
  // The published trim's edit, and the QC-failure attempt's strictly smaller exact trim of the same unlocked clip, both from the current head.
  const published = R.trimRequest(h1, "b3d_trim_second_a", c.plan), qcAttempt = R.trimRequest(h1, "b3d_trim_second_qc", c.plan, 1, published.trim.removedFrames);
  const propose = async (r: ReturnType<typeof R.trimRequest>) => project.propose(r.request, await interpret(r.request, r.action));
  const pa = await propose(published), pb = await propose(qcAttempt);
  const parentDag = openValidatedDag({ dag: c.x.dagArtifact.ref }, c.x.artifacts), parentProgram = compileRenderProgram(parentDag, c.x.artifacts);
  const child = (p: typeof pa) => {
    const x = c.execution(R.revisionGraphChain(c.rootChain, p.child, p.artifacts)), v = openValidatedDag({ dag: x.dagArtifact.ref }, x.artifacts);
    return { x, v, program: compileRenderProgram(v, x.artifacts) };
  };
  const ca = child(pa), cb = child(pb), frames = (p: typeof parentProgram) => p.segments.reduce((n, s) => n + s.video.frames, 0);
  const segment = (p: typeof parentProgram, i: number) => p.segments[i]!.segmentComputationId;
  // One comparison of every property, so a failure reports them all. A different request key or attempt never makes a distinct render.
  assert.deepEqual({
    qcTrimStrictlySmaller: qcAttempt.trim.removedFrames >= 1 && qcAttempt.trim.removedFrames < published.trim.removedFrames,
    bothFromTheCurrentRevisionZeroHead: [pa, pb].every(p => p.diff.parent.editGraphId === h1.graph.editGraphId && p.diff.parent.revision === 0 && p.child.revision === 1),
    headUnmovedByProposals: (await project.current()).head.headId === h1.head.headId,
    distinctReplacement: JSON.stringify(pb.diff.operations) !== JSON.stringify(pa.diff.operations),
    distinctGraphDiff: pb.diff.graphDiffId !== pa.diff.graphDiffId,
    distinctChildGraph: pb.child.editGraphId !== pa.child.editGraphId,
    distinctChildDag: cb.v.dag.dagId !== ca.v.dag.dagId,
    distinctRenderComputation: cb.v.dag.renderIdentity.renderComputationId !== ca.v.dag.renderIdentity.renderComputationId,
    distinctChangedSegment: segment(cb.program, 1) !== segment(ca.program, 1),
    lockedSegmentReusableByBoth: segment(cb.program, 0) === segment(parentProgram, 0) && segment(ca.program, 0) === segment(parentProgram, 0),
    outputsCannotCollide: frames(cb.program) !== frames(ca.program),
  }, { qcTrimStrictlySmaller: true, bothFromTheCurrentRevisionZeroHead: true, headUnmovedByProposals: true, distinctReplacement: true, distinctGraphDiff: true,
    distinctChildGraph: true, distinctChildDag: true, distinctRenderComputation: true, distinctChangedSegment: true, lockedSegmentReusableByBoth: true, outputsCannotCollide: true });
  // The runner's own check agrees. Re-proposing the published trim under another request key changes the GraphDiff, child graph, DAG and
  // render computation identities (the last binds the graph, admission and grant: packages/edit-execution/dag.ts:177), yet it is the same
  // edit: the exact replacement, the changed segment's computation and the output frame count stay equal, and the check refuses it.
  const identity = (p: typeof pa, x: ReturnType<typeof child>) => R.revisionIdentity(p, x.v.dag, x.program);
  assert.deepEqual(R.distinctRevisionRefusal(identity(pb, cb), identity(pa, ca), parentProgram), []);
  const pc = await propose(R.trimRequest(h1, "b3d_trim_second_a_again", c.plan)), cc = child(pc);
  assert.deepEqual(R.distinctRevisionRefusal(identity(pc, cc), identity(pa, ca), parentProgram),
    ["same exact replacement", "same changed segment computation", "same output frame count"]);
  // Production authorization accepts the revision-zero parent graph and DAG for the QC-failure child.
  assert.ok((await project.authorize({ ...pb, artifacts: cb.x.artifacts, parentDag, childDag: cb.v })).impact !== undefined);
  // The runner's prior is the revision-zero parent's own execution; the QC-failure attempt's failed execution can never become a later prior.
  // (Structural render and QC records over the real test DAGs: no media runs here.)
  const execution = (v: typeof parentDag, verdict: string) => ({ v, receipt: { receiptId: `receipt_${v.dag.dagId}`, renderComputationId: v.dag.renderIdentity.renderComputationId,
    dag: { dagId: v.dag.dagId }, editGraph: v.dag.graph }, qc: { verdict, execution: { receiptId: `receipt_${v.dag.dagId}`, renderComputationId: v.dag.renderIdentity.renderComputationId,
    dagId: v.dag.dagId } } });
  assert.equal(R.revisionParent(h1, execution(parentDag, "pass")).parentDag, parentDag);
  assert.throws(() => R.revisionParent(h1, execution(cb.v, "fail")), (e: unknown) => e instanceof R.HarnessRefusal && e.code === "revision_parent_mismatch");
});

// ================================================================ the receipt
test("3D-H08 the receipt is bounded, its claims are fixed and a dependent scenario never passes without its prerequisite", () => {
  const scenarios = Object.fromEntries(R.SCENARIOS.map(s => [s, { status: "NOT_EXERCISED", detail: "Not reached." }]));
  const receipt = { receiptType: "Batch3DRealFootageReceipt", receiptVersion: "0.1.0", harness: R.HARNESS, git: { head: null, clean: null },
    evidenceClass: "owner_local_real_footage_run_pending_owner_review", direction: R.VERIFICATION_INPUT,
    manifest: { runManifestSha256: "a".repeat(64), footageManifestSha256: "b".repeat(64), registrationDigest: null }, runtime: null, sources: [],
    records: { rootEditGraph: null, rootEditorialState: null, rootEditingHead: null, baselineDag: null, baselineProgram: null, baselineOutputSha256: null, baselineQc: null,
      baselineObservations: [], criticReport: null, lockRequest: null, lockIntent: null, lockedHead: null, editorialRequest: null, intent: null, revisionPlan: null, graphDiff: null,
      childEditGraph: null, childEditorialState: null, childEditingHead: null, childDag: null, childProgram: null, reusedSegments: [], recomputedSegments: [], childOutputSha256: null,
      childQc: null, preferenceHead: null, finalCurrentHead: null },
    refusals: { lockedTarget: null, staleRequest: null }, renderCounts: {},
    critic: { execution: "NOT_EXERCISED", semanticCritic: null, findings: null, actionableRepairFinding: "NOT_EXERCISED", autoRepair: "NOT_EXERCISED" }, scenarios,
    claims: { realFootageVerified: "PENDING_OWNER_REVIEW", professionalEditingQuality: "NOT_VERIFIED", creativeQuality: "NOT_VERIFIED", autonomousDirector: "NOT_VERIFIED" } };
  assert.equal(R.Batch3DReceiptSchema.safeParse(receipt).success, true);
  const with_ = (patch: object) => R.Batch3DReceiptSchema.safeParse({ ...receipt, ...patch }).success;
  assert.equal(with_({ scenarios: { ...scenarios, localized_reuse: { status: "PASS", detail: "x" } } }), false, "reuse cannot pass without a published revision");
  assert.equal(with_({ scenarios: { ...scenarios, baseline_technical_qc: { status: "PASS", detail: "x" } } }), false);
  assert.equal(with_({ scenarios: { ...scenarios, baseline_render: { status: "SKIPPED", detail: "x" } } }), false, "statuses are PASS, FAIL, NOT_EXERCISED or UNAVAILABLE");
  for (const claims of [{ realFootageVerified: "VERIFIED" }, { professionalEditingQuality: "VERIFIED" }, { creativeQuality: "PASS" }, { autonomousDirector: "VERIFIED" }]) {
    assert.equal(with_({ claims: { ...receipt.claims, ...claims } }), false, JSON.stringify(claims));
  }
  assert.equal(with_({ critic: { ...receipt.critic, actionableRepairFinding: "NONE_OBSERVED", findings: 2 } }), false, "no finding means zero findings");
  assert.equal(with_({ direction: "creative_direction" }), false);
  assert.equal(with_({ unexpected: true }), false);
  assert.equal(with_({ renderCounts: { baseline: { ffmpegRender: 2, ffmpegOther: 0, ffprobe: 3 } } }), true);
  assert.equal(with_({ manifest: { runManifestSha256: null, footageManifestSha256: null, registrationDigest: null } }), true, "an unread file has no hash, not a placeholder");
  assert.equal(with_({ manifest: { ...receipt.manifest, runManifestSha256: "not-a-hash" } }), false);
});
