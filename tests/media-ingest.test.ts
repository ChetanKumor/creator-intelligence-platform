// Gate 7 Batch 3E-B1A, Parts 1-3: versioned footage authorization, the CanonicalMediaDerivation record and the pure DIRECT /
// NORMALIZE_N1 / REFUSE classifier. Pure: authorization records, already-parsed ffprobe-shaped facts and derivation records only. No
// media, process, FFmpeg/ffprobe, model, clock or network. New exports are read through module namespaces, so against the pre-B1A
// bytes (with an empty media-ingest skeleton) every new behaviour fails in its own test, while B1A-01..04 and B1A-P01 are
// compatibility invariants that hold before and after.
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";
import { canonicalSerialize } from "../packages/domain/serialization.js";
import { PINNED_MEDIA_RUNTIME, RENDER_ENVIRONMENT, evaluateInputConformance, type ConformanceInput, type ProbeReport } from "../packages/edit-render/index.js";
import { EditorialArtifactMap } from "../packages/editorial/common.js";
import { analyzeFootage } from "../packages/footage-analyzer/index.js";
import * as protocol from "../packages/footage-analyzer/protocol.js";
import * as ingest from "../packages/media-ingest/index.js";
import { siglipConfiguration } from "../packages/reference-analyzer/models.js";
import { linkEditorialToken } from "../packages/world-model/index.js";
import * as R from "./support/edit-real-footage.js";
import { tokenFixture } from "./support/editorial.js";
import { footageEnvironment } from "./support/footage.js";
import { ANALYSIS, CANONICALIZATION, CREATOR, DAY0, DAY1, DAY2, EVALUATION, FACTS, HASH_A, HASH_B, HASH_C, PROJECT, SIZE_A, SIZE_B, canonicalChain, classify,
  clone, derivedRecord, probeOf, root, rootWithoutConsent, sha, v1, type Json } from "./support/canonical-media.js";

const parses = (value: unknown): boolean => protocol.FootageAuthorizationSchema.safeParse(value).success;
const sha256Of = (value: unknown): string => sha(canonicalSerialize(value));
/** The structure of AuthorizedFootage 1.0.0 and of FootageAnalysis outside `authorization`, frozen from the unmodified 86d2a10 build. */
const FROZEN = { v1Structure: "38ed16e2ed50c2218146366a16a1ddbad7eee47d03bd0aeaf67ff41903a21215",
  analysisWithoutAuthorization: "09249ab116a36e7160ba58cee5eb5a0c1e29e4533ca818ddac4f0695dfc23d07" };

// ================================================================ Part 1: AuthorizedFootage 1.0.0 is unchanged
test("B1A-01 every accepted AuthorizedFootage 1.0.0 record parses unchanged, and the generated schemas keep the exact 1.0.0 structure", () => {
  const fixtures: unknown[] = [v1(), v1({ authorizationBasis: "permission_granted" }), v1({ allowedPurposes: [ANALYSIS] }), v1({ allowedPurposes: [EVALUATION, ANALYSIS] }),
    v1({ sourceType: "synthetic", authorizationBasis: "synthetic_generated" }), tokenFixture().analysis.authorization];
  for (const fixture of fixtures) {
    const parsed = protocol.FootageAuthorizationSchema.safeParse(fixture);
    assert.ok(parsed.success, JSON.stringify(fixture));
    assert.equal(canonicalSerialize(parsed.data), canonicalSerialize(fixture), "a 1.0.0 record parses to exactly itself");
  }
  const analysis = tokenFixture().analysis;
  assert.equal(canonicalSerialize(protocol.FootageAnalysisSchema.parse(analysis)), canonicalSerialize(analysis), "an accepted FootageAnalysis 1.0.0 parses unchanged");
  const generated = (name: string): Json => {
    const value = JSON.parse(readFileSync(`schemas/interchange/${name}.schema.json`, "utf8")) as Json;
    delete value.$id; delete value.$comment;
    return value;
  };
  const firstForm = (schema: Json): Json => { const form = clone((Array.isArray(schema.anyOf) ? schema.anyOf[0] : schema) as Json); delete form.$schema; return form; };
  const footage = generated("AuthorizedFootage"), footageAnalysis = generated("FootageAnalysis"), properties = footageAnalysis.properties as Json;
  assert.equal(sha256Of(firstForm(footage)), FROZEN.v1Structure, "AuthorizedFootage keeps the exact 1.0.0 structure as its first form");
  assert.equal(sha256Of(firstForm(properties.authorization as Json)), FROZEN.v1Structure, "FootageAnalysis embeds the same exact 1.0.0 form");
  assert.equal((properties.artifactVersion as Json).const, "1.0.0", "FootageAnalysis stays 1.0.0 (owner ruling D9)");
  delete properties.authorization;
  assert.equal(sha256Of(footageAnalysis), FROZEN.analysisWithoutAuthorization, "nothing else in the FootageAnalysis 1.0.0 schema changes");
});

test("B1A-02 a 1.0.0 record can never say system_canonicalized", () => {
  for (const authorizationBasis of ["owner_created", "permission_granted", "synthetic_generated"]) {
    assert.equal(parses(v1({ sourceType: "system_canonicalized", authorizationBasis })), false, authorizationBasis);
  }
  assert.equal(parses({ ...derivedRecord(), schemaVersion: "1.0.0" }), false, "a complete derived record relabelled 1.0.0");
});

test("B1A-03 a 1.0.0 record can never carry local_media_canonicalization, as a purpose or as a consent", () => {
  for (const allowedPurposes of [[CANONICALIZATION], [ANALYSIS, CANONICALIZATION], [ANALYSIS, EVALUATION, CANONICALIZATION]]) {
    assert.equal(parses(v1({ allowedPurposes })), false, JSON.stringify(allowedPurposes));
  }
  assert.equal(parses(v1({ canonicalizationConsent: CANONICALIZATION })), false, "the consent field is a 1.1.0 root field only");
});

test("B1A-04 a 1.0.0 record can never carry derivation lineage", () => {
  const lineage = derivedRecord().derivedFrom as Json;
  for (const extra of [{ derivedFrom: lineage }, { derivedFrom: null }, { derivationId: lineage.derivationId }, { recipeId: lineage.recipeId },
    { rootAuthorization: lineage.rootAuthorization }]) {
    assert.equal(parses({ ...v1(), ...extra }), false, Object.keys(extra).join());
  }
});

// ================================================================ Part 1: the 1.1.0 root and derived forms
const positiveControls = (): void => {
  assert.ok(parses(root()), "a 1.1.0 root with explicit canonicalization consent is accepted");
  assert.ok(parses(derivedRecord()), "a consistent derived record is accepted");
};

test("B1A-05 a derived record names bytes distinct from its root", () => {
  positiveControls();
  assert.equal(parses(derivedRecord({ contentHash: HASH_A })), false);
  assert.equal(parses(derivedRecord({ contentHash: HASH_A, sizeBytes: SIZE_A })), false);
});

test("B1A-06 a derived record inherits exactly its root's authorization basis", () => {
  positiveControls();
  assert.equal(parses(derivedRecord({ authorizationBasis: "permission_granted" })), false, "basis differs from the root");
  assert.equal(parses(derivedRecord({ authorizationBasis: "synthetic_generated" })), false);
  assert.equal(parses(derivedRecord({}, { rootAuthorization: root({ authorizationBasis: "permission_granted" }) })), false, "a root changed underneath its derivative");
  assert.ok(parses(derivedRecord({ authorizationBasis: "permission_granted" }, { rootAuthorization: root({ authorizationBasis: "permission_granted" }) })),
    "the inherited basis may be either owner basis");
});

test("B1A-07 a derived record keeps exactly its root's creator and project", () => {
  positiveControls();
  for (const patch of [{ creatorId: "creator_other" }, { projectId: "project_other" }]) {
    assert.equal(parses(derivedRecord(patch)), false, JSON.stringify(patch));
    assert.equal(parses(derivedRecord({}, { rootAuthorization: root(patch) })), false, `root ${JSON.stringify(patch)}`);
  }
  assert.ok(parses(derivedRecord({ creatorId: "creator_other" }, { rootAuthorization: root({ creatorId: "creator_other" }) })), "scope is inherited, whatever it is");
});

test("B1A-08 a derived record is never dated before its root", () => {
  positiveControls();
  assert.equal(parses(derivedRecord({ dateAdded: DAY0 })), false);
  assert.ok(parses(derivedRecord({ dateAdded: DAY1 })), "the root's own instant is allowed");
});

test("B1A-09 only a root whose owner consented to canonicalization has a derived record", () => {
  positiveControls();
  assert.equal(parses(rootWithoutConsent()), false, "a 1.1.0 root exists only to carry the consent; an owner who does not consent uses 1.0.0");
  assert.equal(parses(root({ canonicalizationConsent: "local_footage_analysis" })), false, "the consent names exactly canonicalization");
  assert.equal(parses(derivedRecord({}, { rootAuthorization: rootWithoutConsent() })), false);
  assert.equal(parses(derivedRecord({}, { rootAuthorization: v1() })), false, "a 1.0.0 record carries no consent and never roots a derivative");
});

test("B1A-10 a derived record's purposes are a subset of its root's purposes", () => {
  positiveControls();
  const narrow = root({ allowedPurposes: [ANALYSIS] });
  assert.equal(parses(derivedRecord({ allowedPurposes: [ANALYSIS, EVALUATION] }, { rootAuthorization: narrow })), false, "evaluation was never granted on the root");
  assert.ok(parses(derivedRecord({ allowedPurposes: [ANALYSIS] }, { rootAuthorization: narrow })));
  assert.ok(parses(derivedRecord({ allowedPurposes: [EVALUATION] })));
  assert.equal(parses(derivedRecord({ allowedPurposes: [ANALYSIS, ANALYSIS] })), false, "purposes are unique");
  assert.equal(parses(derivedRecord({ allowedPurposes: [] })), false);
});

test("B1A-11 a derived record can never itself authorize canonicalization", () => {
  positiveControls();
  for (const allowedPurposes of [[CANONICALIZATION], [ANALYSIS, CANONICALIZATION], [ANALYSIS, EVALUATION, CANONICALIZATION]]) {
    assert.equal(parses(derivedRecord({ allowedPurposes })), false, JSON.stringify(allowedPurposes));
  }
  assert.equal(parses(derivedRecord({ canonicalizationConsent: CANONICALIZATION })), false, "a derived record carries no consent field");
});

test("B1A-12 a root is never itself derived: depth is exactly one", () => {
  positiveControls();
  assert.equal(parses(derivedRecord({ contentHash: HASH_C }, { rootAuthorization: derivedRecord() })), false, "A -> B -> C");
  assert.equal(parses(root({ derivedFrom: derivedRecord().derivedFrom })), false, "a root carries no lineage");
  assert.equal(parses(root({ sourceType: "system_canonicalized" })), false);
});

test("B1A-13 a synthetic root can never produce a real system_canonicalized record", () => {
  positiveControls();
  const syntheticRoot = root({ sourceType: "synthetic", authorizationBasis: "synthetic_generated" });
  assert.equal(parses(syntheticRoot), false, "1.1.0 is an owner-supplied form; synthetic stays 1.0.0");
  assert.equal(parses(derivedRecord({ authorizationBasis: "synthetic_generated" }, { rootAuthorization: syntheticRoot })), false);
  assert.equal(parses(derivedRecord({}, { rootAuthorization: syntheticRoot })), false);
  assert.equal(parses(derivedRecord({ sourceType: "synthetic", authorizationBasis: "synthetic_generated" })), false);
  assert.ok(parses(v1({ sourceType: "synthetic", authorizationBasis: "synthetic_generated" })), "synthetic 1.0.0 keeps its exact meaning");
});

test("B1A-A01 FootageAnalysis 1.0.0 stays exact-content-bound for every authorization form; one asset's analysis never serves another", () => {
  const analysis = tokenFixture().analysis, chain = canonicalChain();
  for (const authorization of [v1(), root(), chain.authorization]) {
    const bound = { ...clone(analysis), authorization: { ...clone(authorization), contentHash: analysis.contentHash, sizeBytes: 1 } };
    assert.ok(protocol.FootageAnalysisSchema.safeParse(bound).success, `accepted for exactly the analysed bytes: ${String(authorization.schemaVersion)}`);
    const elsewhere = { ...clone(analysis), authorization: clone(authorization) };
    assert.equal(protocol.FootageAnalysisSchema.safeParse(elsewhere).success, false, `refused when it names other bytes: ${String(authorization.sourceType)}`);
  }
});

// ================================================================ self-found purpose-label regression (owner ruling: consent is a dedicated root field)
test("B1A-PL01 canonicalization consent is never an allowed purpose of any accepted AuthorizedFootage form", () => {
  for (const candidate of [v1({ allowedPurposes: [ANALYSIS, CANONICALIZATION] }), v1({ schemaVersion: "1.1.0", allowedPurposes: [ANALYSIS, EVALUATION, CANONICALIZATION] }),
    v1({ schemaVersion: "1.1.0", allowedPurposes: [ANALYSIS, CANONICALIZATION], canonicalizationConsent: CANONICALIZATION }),
    derivedRecord({ allowedPurposes: [ANALYSIS, CANONICALIZATION] })]) {
    const parsed = protocol.FootageAuthorizationSchema.safeParse(candidate);
    assert.ok(!parsed.success || !(parsed.data.allowedPurposes as readonly string[]).includes(CANONICALIZATION), JSON.stringify(candidate).slice(0, 160));
  }
  assert.ok(parses(root()), "the consenting root form exists, with the consent in its own field");
});

const JOB = "footage_00000000-0000-4000-8000-00000000b1a0", OWNER_ACTOR = { kind: "owner" as const, actorId: "owner_b1a_purpose_regression" };
/** A test backend of the frozen model's width (as in the 3D harness): arbitrary test numbers, never model output. */
class WideTestBackend {
  async embed(ids: readonly string[]) {
    return { vectors: ids.map((sampleId, i) => ({ sampleId, vector: Array.from({ length: 1152 }, (_, k) => ((k * 7 + i * 13) % 17) / 17 + 0.01) })), version: "test-backend-not-a-model",
      device: "cpu" as const, fallback: false };
  }
}
/** The accepted 3D chain over two real-shaped sources whose authorizations carry `patch`, or null when the analyzer refuses that authorization. */
async function chainOver(patch: Json) {
  const env = await footageEnvironment(["alpha", "beta"], 1);
  const manifest: protocol.FootageManifest = { ...env.manifest, assets: env.manifest.assets.map(a => ({ ...a,
    authorization: { ...(a.authorization as Json), sourceType: "owner_supplied", authorizationBasis: "owner_created", ...patch } })) };
  const base = env.services;
  const services = { ...base, async open(entry: protocol.FootageManifest["assets"][number], authorization: protocol.FootageAuthorization, config: protocol.FootageConfig) {
    const opened = await base.open(entry, authorization, config);
    return { ...opened, backend: new WideTestBackend(), expectedDimensions: async () => 1152 };
  } };
  const result = await analyzeFootage(manifest, { ...protocol.DEFAULT_FOOTAGE_CONFIG, embedding: siglipConfiguration("so400m") }, JOB, services);
  if (result.analyses.length !== 2) return null;
  const record = { jobId: JOB, status: "succeeded", modelRuns: env.telemetry.modelRuns(), events: [], timings: result.timings, cache: result.cacheStats,
    configuration: result.analyses[0]!.configuration };
  const sources = result.analyses.map((analysis, i) => ({ entryId: manifest.assets[i]!.entryId, analysis })) as [R.TimelineSource, R.TimelineSource];
  const plan = R.planOutput(sources, { sourceAudio: "excluded", outputResolution: null, realMedia: true });
  const { chosen } = R.selectTimeline(sources, [null, null], plan), scope = { projectId: manifest.projectId, creatorId: manifest.creatorId };
  const root = R.buildRealChain({ scope, owner: OWNER_ACTOR, run: { jobId: JOB, record }, plan, sourceAudio: "excluded", retentionExpiresAt: null,
    timeline: [{ ...sources[0], candidateId: chosen[0].candidateId }, { ...sources[1], candidateId: chosen[1].candidateId }],
    times: { world: "2026-09-30T10:00:00.000Z", capability: "2026-09-30T10:00:01.000Z" } });
  const token = root.artifacts.find(x => x.ref.artifactType === "EditorialToken")!;
  return (purpose: string): boolean => { try { linkEditorialToken(token.ref, new EditorialArtifactMap(root.artifacts), { ...scope, purpose }); return true; } catch { return false; } };
}

test("B1A-PL02 an owner's canonicalization consent never authorizes a world-model scope labelled with it (self-found)", async () => {
  // Whichever consenting-root representation the schema accepts, the world model must refuse the consent label as a scope purpose.
  let accepted = 0;
  for (const patch of [{ schemaVersion: "1.1.0", allowedPurposes: [ANALYSIS, EVALUATION, CANONICALIZATION] },
    { schemaVersion: "1.1.0", allowedPurposes: [ANALYSIS, EVALUATION], canonicalizationConsent: CANONICALIZATION }]) {
    const link = await chainOver(patch);
    if (link === null) continue;
    accepted += 1;
    assert.equal(link(EVALUATION), true, "the consented evaluation purpose still authorizes");
    assert.equal(link(CANONICALIZATION), false, `consent is not a purpose: ${JSON.stringify(patch)}`);
  }
  assert.equal(accepted, 1, "exactly one consenting-root representation is an accepted authorization");
  const control = await chainOver({});
  assert.ok(control !== null && control(EVALUATION) && !control(CANONICALIZATION), "the 1.0.0 control is unchanged");
});

// ================================================================ Part 3: pure DIRECT / NORMALIZE_N1 / REFUSE
type Classification = ReturnType<typeof classify>;
function refused(probe: unknown, facts: unknown = FACTS) {
  const result = classify(probe, facts);
  if (result.outcome !== "REFUSE") assert.fail(`expected REFUSE, got ${JSON.stringify(result)}`);
  return result;
}
function conformanceInputOf(result: Classification): ConformanceInput {
  if (result.outcome === "REFUSE") assert.fail("a refused source has no conformance input");
  const { video, audio } = result;
  return { video: { frameCount: video.frameCount, tableId: video.frameTableId, width: video.width, height: video.height, grid: video.frameRate },
    audio: audio.state === "absent" ? { required: false } : { required: true, sampleRateHz: audio.sampleRateHz, channelLayout: audio.channelLayout, requiredSamples: audio.samples } };
}
const asProbe = (probe: Json): ProbeReport => probe as unknown as ProbeReport;

test("B1A-15 an explicit 1:1 source the strict renderer admits unchanged classifies DIRECT", () => {
  for (const audio of ["pcm", "aac", "none"] as const) {
    const probe = probeOf({ sar: "1:1", audio }), result = classify(probe);
    if (result.outcome !== "DIRECT") assert.fail(JSON.stringify(result));
    assert.equal(result.reasonCode, "renderer_conforms_unchanged");
    assert.equal(evaluateInputConformance(conformanceInputOf(result), asProbe(probe)).outcome.state, "conforms", "the renderer's own evaluator agrees");
    assert.deepEqual({ ...result.video, frameTableId: "" }, { width: 1080, height: 1920, frameCount: 60, frameTableId: "", frameRate: { numerator: 30, denominator: 1 } });
    assert.equal(result.audio.state, audio === "none" ? "absent" : "present");
  }
});

test("B1A-16 an unspecified SAR on an otherwise conforming H.264 4:2:0 source is the only blocker: NORMALIZE_N1", () => {
  for (const audio of ["pcm", "aac", "none"] as const) {
    const probe = probeOf({ sar: null, audio }), result = classify(probe);
    if (result.outcome !== "NORMALIZE_N1") assert.fail(JSON.stringify(result));
    assert.equal(result.reasonCode, "sample_aspect_ratio_unspecified_only_renderer_blocker");
    assert.equal(result.assumption, "unspecified_sample_aspect_ratio_is_square_pixel_v1");
    assert.deepEqual([result.rendererReason, result.squarePixelRendererReason], ["source_video_nonconforming", null]);
    // Independently: the renderer refuses the unchanged source and admits it with an explicit 1:1 SAR and nothing else changed.
    const input = conformanceInputOf(result), squared = probeOf({ sar: "1:1", audio });
    assert.deepEqual(evaluateInputConformance(input, asProbe(probe)).outcome, { state: "nonconforming", reasonCode: "source_video_nonconforming" });
    assert.equal(evaluateInputConformance(input, asProbe(squared)).outcome.state, "conforms");
    const direct = classify(squared);
    if (direct.outcome !== "DIRECT") assert.fail(JSON.stringify(direct));
    assert.deepEqual({ video: direct.video, audio: direct.audio }, { video: result.video, audio: result.audio }, "declaring square pixels changes no other fact");
  }
});

test("B1A-17 an explicit non-square SAR is refused and deferred to B2; a malformed explicit SAR is refused", () => {
  for (const sar of ["4:3", "2:1", "9:10", "1:2", "64:45"]) {
    const result = refused(probeOf({ sar }));
    assert.deepEqual([result.reasonCode, result.basis], ["sample_aspect_ratio_explicit_non_square", "deferred_to_b2"], sar);
  }
  for (const sar of ["0:1", "1:0", "0:0"]) {
    const result = refused(probeOf({ sar }));
    assert.deepEqual([result.reasonCode, result.basis], ["sample_aspect_ratio_malformed", "invalid_input"], sar);
  }
});

test("B1A-18 a rotated source is refused and deferred to B2, with or without an explicit SAR", () => {
  for (const rotation of [90, -90, 180, 270]) {
    const result = refused(probeOf({ sar: null, sideData: [{ side_data_type: "Display Matrix", rotation }] }));
    assert.deepEqual([result.reasonCode, result.squarePixelRendererReason, result.basis], ["renderer_nonconforming", "source_video_nonconforming", "deferred_to_b2"],
      String(rotation));
  }
  const explicit = refused(probeOf({ sar: "1:1", sideData: [{ side_data_type: "Display Matrix", rotation: 90 }] }));
  assert.deepEqual([explicit.reasonCode, explicit.rendererReason], ["renderer_nonconforming", "source_video_nonconforming"]);
});

test("B1A-19 a mirror or any display transform, and stereo, spherical or HDR side data, are refused", () => {
  for (const sideData of [[{ side_data_type: "Display Matrix", rotation: 0 }], [{ side_data_type: "Display Matrix" }], [{ side_data_type: "Stereo 3D" }],
    [{ side_data_type: "Spherical Mapping" }], [{ side_data_type: "Mastering display metadata" }], [{ side_data_type: "Content light level metadata" }]]) {
    const result = refused(probeOf({ sar: null, sideData }));
    assert.deepEqual([result.reasonCode, result.basis], ["stream_side_data_present", "deferred_to_b2"], JSON.stringify(sideData));
  }
  assert.equal(refused(probeOf({ sar: null, sideData: [{ side_data_type: "Display Matrix", rotation: -180 }] })).reasonCode, "renderer_nonconforming",
    "a horizontal mirror reads as 180 degrees and the renderer rule itself refuses it");
  assert.equal(refused(probeOf({ sar: null, frameSideData: [{ side_data_type: "Display Matrix" }] })).reasonCode, "frame_side_data_present");
});

test("B1A-20 a variable-frame-rate source is refused", () => {
  for (const pts of [(i: number) => i * 512 + (i % 2) * 128, (i: number) => (i < 30 ? i * 512 : 30 * 512 + (i - 30) * 1024)]) {
    const result = refused(probeOf({ sar: null, pts }));
    assert.deepEqual([result.reasonCode, result.squarePixelRendererReason, result.basis], ["renderer_nonconforming", "source_timebase_mismatch", "deferred_to_b2"]);
  }
  for (const rate of ["60/1", "30000/1001", "25/1"]) {
    assert.equal(refused(probeOf({ sar: null, rate })).squarePixelRendererReason, "source_timebase_mismatch", `a declared ${rate} grid the frames do not lie on`);
  }
});

test("B1A-21 one off-grid frame, or a non-zero start, is refused", () => {
  const offGrid = refused(probeOf({ sar: null, pts: i => i * 512 + (i === 17 ? 1 : 0) }));
  assert.deepEqual([offGrid.reasonCode, offGrid.squarePixelRendererReason], ["renderer_nonconforming", "source_timebase_mismatch"]);
  assert.equal(refused(probeOf({ sar: null, pts: i => (i + 1) * 512 })).squarePixelRendererReason, "source_timebase_mismatch");
});

test("B1A-22 HEVC is refused", () => {
  for (const sar of [null, "1:1"]) {
    const result = refused(probeOf({ sar, codec: "hevc" }));
    assert.deepEqual([result.reasonCode, result.basis], ["renderer_nonconforming", "deferred_to_b2"], String(sar));
  }
});

test("B1A-23 10-bit or any pixel format other than yuv420p is refused", () => {
  for (const pixFmt of ["yuv420p10le", "yuv422p", "yuv444p", "yuvj420p", "nv12"]) {
    assert.equal(refused(probeOf({ sar: null, pixFmt })).reasonCode, "renderer_nonconforming", pixFmt);
  }
});

test("B1A-24 interlaced or unknown field order is refused", () => {
  for (const fieldOrder of ["tt", "bb", "tb", "bt", "unknown"]) {
    const result = refused(probeOf({ sar: null }), { ...FACTS, fieldOrder });
    assert.deepEqual([result.reasonCode, result.basis], ["field_order_not_progressive", "deferred_to_b2"], fieldOrder);
  }
});

test("B1A-25 an extra or unsupported stream or container is refused", () => {
  for (const extra of [{ codec_type: "data", codec_name: "bin_data" }, { codec_type: "subtitle", codec_name: "mov_text" }, { codec_type: "attachment" },
    { codec_type: "audio", codec_name: "aac", sample_rate: "48000", channels: 2, channel_layout: "stereo", time_base: "1/48000", start_pts: 0 }]) {
    const result = refused(probeOf({ sar: null, extraStreams: [extra] }));
    assert.deepEqual([result.reasonCode, result.squarePixelRendererReason, result.basis], ["renderer_nonconforming", "source_stream_layout_unsupported", "deferred_to_b2"],
      JSON.stringify(extra));
  }
  for (const format of ["matroska,webm", "mpegts"]) {
    assert.equal(refused(probeOf({ sar: null, format })).squarePixelRendererReason, "source_stream_layout_unsupported", format);
  }
});

test("B1A-26 audio outside the strict stream-copy envelope is refused, never repaired", () => {
  assert.equal(refused(probeOf({ sar: null, audioStart: 1024 })).squarePixelRendererReason, "source_audio_alignment_unsupported");
  assert.equal(refused(probeOf({ sar: null, audioGapAt: 48_000 })).squarePixelRendererReason, "source_audio_alignment_unsupported");
  assert.equal(refused(probeOf({ sar: null, audioCodec: "mp3" })).squarePixelRendererReason, "source_audio_format_unsupported");
  assert.equal(refused(probeOf({ sar: null, channels: 1, channelLayout: "stereo" })).squarePixelRendererReason, "source_audio_format_unsupported");
  for (const patch of [{ channels: 6, channelLayout: "5.1" }, { sampleRate: null }]) {
    const result = refused(probeOf({ sar: null, ...patch }));
    assert.deepEqual([result.reasonCode, result.basis], ["audio_parameters_unsupported", "deferred_to_b2"], JSON.stringify(patch));
  }
});

test("B1A-27 a zero, malformed or unsupported probe fails closed", () => {
  const invalid = (probe: unknown, facts: unknown = FACTS): string => {
    const result = refused(probe, facts);
    assert.equal(result.basis, "invalid_input", JSON.stringify(result));
    return result.reasonCode;
  };
  for (const probe of [undefined, null, 0, "probe", [], {}, { ...probeOf(), streams: [] }, { ...probeOf(), extra: 1 },
    { ...probeOf(), format: { format_name: "mov,mp4,m4a,3gp,3g2,mj2", tags: {} } }]) {
    assert.equal(invalid(probe), "probe_invalid", JSON.stringify(probe));
  }
  const cyclic = probeOf(); cyclic.self = cyclic;
  assert.equal(invalid(cyclic), "probe_invalid");
  const nan = probeOf(); (nan.streams as Json[])[0]!.width = Number.NaN;
  assert.equal(invalid(nan), "probe_invalid");
  assert.notEqual(refused(probeOf({ sar: "4:3" })).inputDigest, null, "a well-formed refusal still names its evidence");
  for (const probe of [undefined, {}, cyclic]) assert.equal(refused(probe).inputDigest, null, "malformed evidence has no digest");
  for (const facts of [undefined, null, {}, { ...FACTS, extra: true }, { ...FACTS, fieldOrder: "Progressive" }, { ...FACTS, colorTransfer: "BT709" }]) {
    // Called directly: an explicit undefined must reach the classifier, not a default parameter.
    const result = ingest.classifyCanonicalIngest({ probe: probeOf({ sar: null }), facts });
    assert.deepEqual(result.outcome === "REFUSE" ? [result.reasonCode, result.basis, result.inputDigest] : result, ["facts_invalid", "invalid_input", null],
      JSON.stringify(facts) ?? "undefined");
  }
  assert.equal(invalid(probeOf({ sar: null, frames: 0, audio: "none" })), "video_frames_absent");
  assert.equal(refused(probeOf({ sar: null, rate: null })).reasonCode, "frame_rate_undeclared");
  assert.equal(refused(probeOf({ sar: null, rate: "30/0" })).reasonCode, "frame_rate_undeclared");
  for (const rate of ["0/1", "121/1", "90000/1", "1/2"]) assert.equal(refused(probeOf({ sar: null, rate })).reasonCode, "frame_rate_out_of_bounds", rate);
  assert.equal(refused(probeOf({ sar: null, width: null })).reasonCode, "video_geometry_undeclared");
  assert.equal(refused(probeOf({ sar: null, width: 20_000 })).reasonCode, "geometry_out_of_bounds");
  assert.equal(refused(probeOf({ sar: null, audio: "none", frames: 72_001 })).reasonCode, "frame_count_out_of_bounds");
  assert.equal(refused(probeOf({ sar: null, audio: "none", frames: 601, rate: "1/1", pts: i => i * 15_360 })).reasonCode, "duration_out_of_bounds");
  assert.equal(refused(probeOf({ sar: null, timeBase: null })).squarePixelRendererReason, "source_timebase_mismatch");
});

test("B1A-N01 HDR transfers and wide-gamut primaries are refused; SDR BT.601/709 families pass", () => {
  for (const patch of [{ colorTransfer: "smpte2084" }, { colorTransfer: "arib-std-b67" }, { colorTransfer: "bt2020-10" }, { colorPrimaries: "bt2020" },
    { colorPrimaries: "smpte432" }]) {
    const result = refused(probeOf({ sar: null }), { ...FACTS, ...patch });
    assert.deepEqual([result.reasonCode, result.basis], ["color_not_sdr", "deferred_to_b2"], JSON.stringify(patch));
  }
  for (const patch of [{ colorTransfer: null, colorPrimaries: null }, { colorTransfer: "smpte170m", colorPrimaries: "smpte170m" },
    { colorTransfer: "bt470bg", colorPrimaries: "bt470bg" }]) {
    assert.equal(classify(probeOf({ sar: null }), { ...FACTS, ...patch }).outcome, "NORMALIZE_N1", JSON.stringify(patch));
  }
});

test("B1A-N02 DIRECT is exactly the accepted renderer rule; N1's own conditions gate only the square-pixel normalization", () => {
  assert.equal(classify(probeOf({ sar: "1:1" }), { ...FACTS, fieldOrder: "unknown" }).outcome, "DIRECT");
  assert.equal(classify(probeOf({ sar: "1:1", sideData: [{ side_data_type: "Display Matrix", rotation: 0 }] })).outcome, "DIRECT",
    "the renderer reads only the display-matrix angle (recorded as a limitation); ingest never re-labels such a source");
  assert.equal(classify(probeOf({ sar: null, sideData: [{ side_data_type: "Display Matrix", rotation: 0 }] })).outcome, "REFUSE");
});

test("B1A-N03 classification is total, deterministic and never mutates its input", () => {
  const probe = probeOf({ sar: null }), facts = clone(FACTS), before = canonicalSerialize([probe, facts]);
  const first = classify(probe, facts), second = classify(clone(probe), clone(facts));
  assert.deepEqual(first, second);
  assert.equal(canonicalSerialize([probe, facts]), before);
  assert.match(String(first.inputDigest), /^[a-f0-9]{64}$/);
  assert.notEqual(classify(probeOf({ sar: "1:1" })).inputDigest, first.inputDigest, "the digest names the exact evidence");
  assert.notEqual(classify(probe, { ...FACTS, colorTransfer: null }).inputDigest, first.inputDigest);
  for (const hostile of [Symbol("probe"), () => 1, new Map(), Object.create(null) as unknown, { streams: { length: 1 } }, 10n]) {
    assert.doesNotThrow(() => classify(hostile));
    assert.equal(refused(hostile).reasonCode, "probe_invalid");
  }
});

// ================================================================ Part 2: CanonicalMediaDerivation
test("B1A-D01 an N1 source and its verified 1:1 output form one deterministic, self-identifying derivation", () => {
  const first = canonicalChain(), second = canonicalChain(), d = first.derivation;
  assert.equal(canonicalSerialize(d), canonicalSerialize(second.derivation), "deterministic");
  assert.equal(canonicalSerialize(ingest.CanonicalMediaDerivationSchema.parse(d)), canonicalSerialize(d), "already canonical");
  assert.match(String(d.derivationId), /^canonical_media_derivation_v0_[a-f0-9]{64}$/);
  assert.match(String(d.computationId), /^canonical_media_computation_v0_[a-f0-9]{64}$/);
  assert.deepEqual(d.source, { assetId: `asset_${HASH_A}`, contentHash: HASH_A, sizeBytes: SIZE_A, rootAuthorization: root() });
  assert.deepEqual([(d.output as Json).assetId, (d.output as Json).contentHash, (d.output as Json).sizeBytes], [`asset_${HASH_B}`, HASH_B, SIZE_B]);
  assert.deepEqual(d.scope, { creatorId: CREATOR, projectId: PROJECT });
  assert.deepEqual(d.recipe, ingest.N1_RECIPE);
  assert.deepEqual(d.toolchain, ingest.CANONICAL_TOOLCHAIN);
  assert.equal((d.classification as Json).inputDigest, first.source.inputDigest, "the record binds the exact classified evidence");
  assert.equal((d.output as Json).probeDigest, first.output.inputDigest, "and the exact evidence of the verified output");
  for (const audio of ["aac", "none"] as const) assert.ok(ingest.CanonicalMediaDerivationSchema.safeParse(canonicalChain({ audio }).derivation).success, audio);
});

test("B1A-D02 the computation identity binds only the source bytes, the recipe and the pinned toolchain", () => {
  const base = canonicalChain().derivation;
  for (const other of [canonicalChain({ root: root({ creatorId: "creator_other", projectId: "project_other" }) }),
    canonicalChain({ root: root({ dateAdded: DAY0, authorizationBasis: "permission_granted" }) }), canonicalChain({ root: root({ allowedPurposes: [ANALYSIS] }) }),
    canonicalChain({ outputHash: HASH_C, outputSize: 9 })]) {
    assert.equal(other.derivation.computationId, base.computationId, "scope, dates, the root attestation and the output never enter the computation identity");
    assert.notEqual(other.derivation.derivationId, base.derivationId, "the completed derivation's identity does bind them");
  }
  const source = base.source as Json, inputs = { source: { assetId: String(source.assetId), contentHash: String(source.contentHash), sizeBytes: Number(source.sizeBytes) },
    recipe: ingest.N1_RECIPE, toolchain: ingest.CANONICAL_TOOLCHAIN };
  assert.equal(ingest.canonicalComputationIdOf(inputs), base.computationId);
  for (const [label, changed] of [["other bytes", { ...inputs, source: { ...inputs.source, contentHash: HASH_C, assetId: `asset_${HASH_C}` } }],
    ["another size", { ...inputs, source: { ...inputs.source, sizeBytes: SIZE_A + 1 } }],
    ["another recipe version", { ...inputs, recipe: { ...ingest.N1_RECIPE, recipeVersion: "0.2.0" } }],
    ["another FFmpeg build", { ...inputs, toolchain: { ...ingest.CANONICAL_TOOLCHAIN, ffmpeg: { ...ingest.CANONICAL_TOOLCHAIN.ffmpeg, sha256: sha("other ffmpeg") } } }]] as const) {
    assert.notEqual(ingest.canonicalComputationIdOf(changed as typeof inputs), base.computationId, label);
  }
});

test("B1A-D03 neither identity carries a path, a location, an attempt or a clock reading", () => {
  const { derivation } = canonicalChain(), text = canonicalSerialize(derivation);
  assert.doesNotMatch(text, /[\\/]/, "no path separator anywhere in the record");
  assert.deepEqual(text.match(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/g), [DAY1], "the only instant is the root authorization's own dateAdded");
  const keys = new Set<string>();
  const walk = (value: unknown): void => { if (value !== null && typeof value === "object") for (const [key, child] of Object.entries(value)) { keys.add(key); walk(child); } };
  walk(derivation);
  for (const key of ["path", "location", "directory", "file", "attempt", "user", "host", "createdAt", "startedAt", "completedAt", "derivedAt", "nonce"]) {
    assert.equal(keys.has(key), false, key);
  }
});

test("B1A-D04 only an N1 source with a verified DIRECT output of identical facts and identical decoded content builds a derivation", () => {
  const n1 = classify(probeOf({ sar: null })), direct = classify(probeOf({ sar: "1:1" }));
  type Patch = { source?: unknown; output?: Json; rootAuthorization?: unknown };
  const build = (patch: Patch) => () => ingest.buildCanonicalMediaDerivation({ rootAuthorization: patch.rootAuthorization ?? root(), source: patch.source ?? n1,
    output: { contentHash: HASH_B, sizeBytes: SIZE_B, classification: direct, decodedVideo: { sourceDigest: sha("x"), outputDigest: sha("x") },
      audioPackets: { sourceDigest: sha("y"), outputDigest: sha("y") }, ...patch.output } } as never);
  assert.doesNotThrow(build({}));
  const cases: [string, Patch][] = [["a DIRECT source", { source: direct }], ["a refused source", { source: classify(probeOf({ sar: "4:3" })) }],
    ["an N1 output", { output: { classification: n1 } }], ["a refused output", { output: { classification: classify(probeOf({ sar: "1:1", codec: "hevc" })) } }],
    ["other output frames", { output: { classification: classify(probeOf({ sar: "1:1", frames: 59 })) } }],
    ["other output audio", { output: { classification: classify(probeOf({ sar: "1:1", audio: "none" })), audioPackets: null } }],
    ["changed decoded frames", { output: { decodedVideo: { sourceDigest: sha("x"), outputDigest: sha("z") } } }],
    ["changed audio packets", { output: { audioPackets: { sourceDigest: sha("y"), outputDigest: sha("z") } } }],
    ["audio claimed absent", { output: { audioPackets: null } }], ["the root's own bytes", { output: { contentHash: HASH_A } }],
    ["a root without consent", { rootAuthorization: rootWithoutConsent() }], ["a 1.0.0 root", { rootAuthorization: v1() }],
    ["a forged classification", { source: { ...n1, reasonCode: "renderer_conforms_unchanged" } }]];
  for (const [label, patch] of cases) assert.throws(build(patch), (error: unknown) => error instanceof ingest.MediaIngestError, label);
});

test("B1A-D05 the recipe list is bounded and exact: N1 only copies streams and declares a 1:1 sample aspect", () => {
  assert.deepEqual(ingest.CANONICAL_RECIPES, [ingest.N1_RECIPE]);
  assert.equal(ingest.N1_RECIPE.semanticsDigest, sha(canonicalSerialize(ingest.N1_SEMANTICS)));
  assert.equal(ingest.N1_RECIPE.argvTemplateDigest, sha(JSON.stringify(ingest.N1_ARGV_TEMPLATE)), "the renderer's argvDigestOf convention");
  const argv: readonly string[] = ingest.N1_ARGV_TEMPLATE, joined = argv.join(" ");
  assert.deepEqual(argv.filter(a => a.startsWith("{")), ["{input_fd}", "{max_output_bytes}", "{output_fd}"], "only descriptors and the size bound are filled in");
  assert.ok(argv.includes("-nostdin") && joined.includes("-c copy") && joined.includes("-bsf:v h264_metadata=sample_aspect_ratio=1/1"), joined);
  for (const option of ["-vf", "-af", "-filter_complex", "-c:v", "-c:a", "-ar", "-ac", "-r", "-s", "-pix_fmt", "-y", "-i"]) {
    if (option === "-i") assert.equal(argv.filter(a => a === "-i").length, 1, "exactly one input");
    else assert.equal(argv.includes(option), false, option);
  }
  assert.ok(argv.every(a => !/\\|^[A-Za-z]:[\\/]|^\/|\.\./.test(a)), "no path or location in the template");
  assert.equal(argv.filter(a => a === "-protocol_whitelist").length, 2, "both ends are fd-only");
});

test("B1A-D06 the toolchain is exactly the owner-pinned runtime plus the canonicalizer's own identity", () => {
  const toolchain = ingest.CANONICAL_TOOLCHAIN;
  for (const tool of ["ffmpeg", "ffprobe"] as const) {
    assert.deepEqual(toolchain[tool], { sha256: PINNED_MEDIA_RUNTIME[tool].sha256, sizeBytes: PINNED_MEDIA_RUNTIME[tool].sizeBytes,
      reportedVersion: PINNED_MEDIA_RUNTIME[tool].reportedVersion }, tool);
  }
  assert.deepEqual(toolchain.runtime, PINNED_MEDIA_RUNTIME.runtimeIdentity);
  assert.deepEqual(toolchain.environment, RENDER_ENVIRONMENT);
  assert.equal(toolchain.canonicalizer.implementationDigest, sha(canonicalSerialize(ingest.CANONICALIZER_DESCRIPTOR)));
});

test("B1A-D07 a derived authorization is built only from a valid derivation and inherits exactly", () => {
  const { derivation, authorization } = canonicalChain();
  assert.ok(protocol.FootageAuthorizationSchema.safeParse(authorization).success);
  assert.deepEqual(authorization, { manifestType: "AuthorizedFootage", schemaVersion: "1.1.0", contentHash: HASH_B, sizeBytes: SIZE_B, sourceType: "system_canonicalized",
    authorizationBasis: "owner_created", allowedPurposes: [ANALYSIS, EVALUATION], dateAdded: DAY2, creatorId: CREATOR, projectId: PROJECT,
    derivedFrom: { rootAuthorization: root(), derivationId: derivation.derivationId, recipeId: ingest.N1_RECIPE.recipeId } });
  assert.deepEqual(ingest.buildCanonicalDerivedAuthorization({ derivation, dateAdded: DAY2, allowedPurposes: [EVALUATION] }).allowedPurposes, [EVALUATION]);
  for (const patch of [{ dateAdded: DAY0 }, { allowedPurposes: [CANONICALIZATION] }, { allowedPurposes: [] }, { derivation: { ...derivation, derivationId: "forged" } }]) {
    assert.throws(() => ingest.buildCanonicalDerivedAuthorization({ derivation, dateAdded: DAY2, ...patch } as never), (error: unknown) => error instanceof ingest.MediaIngestError,
      JSON.stringify(patch).slice(0, 80));
  }
});

// ================================================================ static boundary of the new package
test("B1A-P01 the media-ingest package is pure: bounded imports, no process, file, network, clock or entropy access, no render-core cycle", () => {
  const files = readdirSync("packages/media-ingest").filter(f => f.endsWith(".ts")).sort().map(f => `packages/media-ingest/${f}`);
  // 3E-B2-A1 (owner-authorized allowlist change): the profile and plan modules join the package under the same purity rules.
  // B2-B2 Checkpoint B adds chroma.ts; C–D adds pixels.ts under these same purity restrictions.
  assert.deepEqual(files, ["packages/media-ingest/canonical.ts", "packages/media-ingest/chroma.ts", "packages/media-ingest/index.ts", "packages/media-ingest/pixels.ts", "packages/media-ingest/plan.ts", "packages/media-ingest/profile.ts", "packages/media-ingest/reencode.ts"]);
  for (const path of files) {
    const text = readFileSync(path, "utf8"), source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true);
    const visit = (node: ts.Node): void => {
      if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
        const specifier = node.moduleSpecifier.text;
        assert.ok(specifier === "zod" || specifier === "node:crypto" || specifier.startsWith("./")
          || /^\.\.\/(contracts|domain|editorial|edit-render|footage-analyzer|reference-analyzer)\//.test(specifier), `${path}: ${specifier}`);
        assert.doesNotMatch(specifier, /^\.\.\/edit-render\/(index|owner-media|authorize)\.js$/, `${path} never imports the render core's composite or authority modules`);
      }
      if (ts.isCallExpression(node) || ts.isNewExpression(node)) {
        const callee = node.expression;
        if (ts.isIdentifier(callee)) assert.equal(["spawn", "spawnSync", "exec", "execSync", "execFile", "execFileSync", "fork", "fetch", "eval", "Function", "require"]
          .includes(callee.text), false, `${path}: ${callee.text}`);
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
    assert.doesNotMatch(text, /child_process|node:fs|node:net|node:http|Date\.now|new Date|Math\.random|process\.env|process\.platform|process\.arch/, path);
  }
});
