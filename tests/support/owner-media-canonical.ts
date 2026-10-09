// Gate 7 Batch 3E-B1B test support for the owner-media registry, the derived lifecycle observation and the permit's provenance rule. Nothing
// here starts a process, decodes media or reaches a network. Every fixture is labelled for what it is:
// - CANONICAL STORE ENTRIES over OPAQUE TEST BYTES, written the way scripts/media-ingest-local.ts publishes them (the object under its content
//   name and the scope-free computation record). Their derivations are built by the accepted pure builders from LABEL digests, never from
//   measurements: they exercise the registry's own checks only. The media suite registers real canonical outputs.
// - A STRUCTURAL creator_upload chain: FootageAnalysis from the accepted pure analyzer over opaque bytes with a test embedding backend (the
//   3D-H06 and B1A-PL02 method), carried through the accepted 3D harness builders to an admitted ExecutionDag. Its authorizations are declared
//   owner_supplied or system_canonicalized only to exercise the registry and the permit. It is not real footage, not a real canonical
//   FootageAnalysis (3E-C) and not real-model evidence.
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { TestContext } from "node:test";
import { createHash } from "node:crypto";
import { analyzeFootage } from "../../packages/footage-analyzer/index.js";
import { DEFAULT_FOOTAGE_CONFIG, type FootageManifest } from "../../packages/footage-analyzer/protocol.js";
import { siglipConfiguration } from "../../packages/reference-analyzer/models.js";
import type { EmbeddingBackend } from "../../packages/reference-analyzer/embeddings.js";
import { PINNED_MEDIA_RUNTIME, RENDER_ENVIRONMENT, buildOwnerMediaLifecycleObservation, buildRealCapabilityProbe, buildRealRuntimeProbe, buildStagedInputConformance,
  compileRenderProgram, type CheckTiming, type OwnerMediaLifecycleObservation, type RealEvidenceBundle, type RenderProgram, type RuntimeObservation } from "../../packages/edit-render/index.js";
import * as ownerMedia from "../../packages/edit-render/owner-media.js";
import { acquireExecutionClaim, openValidatedDag, registerDagAttempt, stageClaimedSource, type ClaimOwnership, type ExecutionClaim, type RuntimeCall, type StagedSourceReceipt,
  type ValidatedExecutionDag } from "../../packages/edit-runtime/index.js";
import * as ingest from "../../packages/media-ingest/index.js";
import { classify, probeOf, type Json } from "./canonical-media.js";
import * as R from "./edit-real-footage.js";
import { footageEnvironment } from "./footage.js";
import { deterministicBytes, runtimeEnv, sha256Hex, type RuntimeEnv } from "./edit-runtime.js";

export type { Json };
export const sha = (text: string): string => createHash("sha256").update(text).digest("hex");
/** footageEnvironment's owner scope: every fixture authorization below belongs to it. */
export const OWNER_SCOPE = { creatorId: "creator_footage_test", projectId: "project_footage_test" } as const;
/** Dated before footageEnvironment's analysis clock (2026-09-14): the accepted analyzer refuses an authorization added after its clock. */
export const ROOT_DATE = "2026-09-01T00:00:00.000Z", DERIVED_DATE = "2026-09-02T00:00:00.000Z";
export const PURPOSES = ["local_footage_analysis", "local_evaluation"] as const;
const identityOf = (bytes: Uint8Array) => ({ contentHash: sha256Hex(bytes), sizeBytes: bytes.length });
/** AuthorizedFootage 1.0.0, declared owner_supplied for opaque test bytes (a fixture label, not owner media). */
export const v1Of = (bytes: Uint8Array, patch: Json = {}): Json => ({ manifestType: "AuthorizedFootage", schemaVersion: "1.0.0", ...identityOf(bytes), sourceType: "owner_supplied",
  authorizationBasis: "owner_created", allowedPurposes: [...PURPOSES], dateAdded: ROOT_DATE, ...OWNER_SCOPE, ...patch });
/** An AuthorizedFootage 1.1.0 root with the owner's canonicalization consent, for opaque test bytes. */
export const rootOf = (bytes: Uint8Array, patch: Json = {}): Json => v1Of(bytes, { schemaVersion: "1.1.0", canonicalizationConsent: "local_media_canonicalization", ...patch });

/** A derivation of `root` whose output is `output`, from the accepted pure builders and LABEL digests (never measurements). */
export function structuralDerivation(root: Json, output: Uint8Array, label = "structural"): { derivation: Json; authorization: Json } {
  const source = classify(probeOf({ sar: null, audio: "none" })), classified = classify(probeOf({ sar: "1:1", audio: "none" }));
  const derivation = ingest.buildCanonicalMediaDerivation({ rootAuthorization: root, source, output: { ...identityOf(output), classification: classified,
    decodedVideo: { sourceDigest: sha(`${label}-decoded`), outputDigest: sha(`${label}-decoded`) }, audioPackets: null } });
  const authorization = ingest.buildCanonicalDerivedAuthorization({ derivation, dateAdded: DERIVED_DATE });
  return { derivation: derivation as unknown as Json, authorization: authorization as unknown as Json };
}
export const storeOf = (workspace: string, ...parts: string[]) => join(workspace, ...ownerMedia.CANONICAL_STORE.directory, ...parts);
/** Writes an object and its computation record exactly where, and exactly as, the media-ingest adapter publishes them (test-only). */
export async function plantCanonical(workspace: string, derivation: unknown, bytes: Uint8Array): Promise<{ objectPath: string; recordPath: string; recordBytes: string }> {
  const record = ownerMedia.canonicalComputationRecordOf(derivation), objects = storeOf(workspace, ownerMedia.CANONICAL_STORE.objects);
  const computations = storeOf(workspace, ownerMedia.CANONICAL_STORE.computations);
  await mkdir(objects, { recursive: true }); await mkdir(computations, { recursive: true });
  const objectPath = join(objects, ownerMedia.canonicalObjectName(sha256Hex(bytes))), recordPath = join(computations, record.name);
  await writeFile(objectPath, bytes); await writeFile(recordPath, record.bytes);
  return { objectPath, recordPath, recordBytes: record.bytes };
}
export const OWNER = { kind: "owner", actorId: "owner_b1b_test" } as const;
export function renderAuthorizationOf(statement: string, patch: Json = {}): Json {
  return { statement, owner: OWNER, renderIntents: ["final"], authorizedAt: ROOT_DATE, expiresAt: null, ...patch };
}
/** An OwnerMediaRegistration 0.2.0 over declared originals (relative paths) and declared canonical derivatives (no location). */
export function registration02(o: { originals: { entryId: string; path: string; authorization: Json }[]; derivatives?: { entryId: string; rootEntryId: string;
  authorization: Json; derivation: Json }[]; statement?: string; renderPatch?: Json }): Json {
  const derivatives = o.derivatives ?? [];
  const statement = o.statement ?? (derivatives.length > 0 ? ownerMedia.OWNER_CANONICAL_RENDER_AUTHORIZATION_STATEMENT : ownerMedia.OWNER_RENDER_AUTHORIZATION_STATEMENT);
  return { artifactType: "OwnerMediaRegistration", artifactVersion: "0.2.0", stability: "internal_pre_stable",
    footage: { manifestType: "AuthorizedFootageSet", schemaVersion: "1.0.0", ...OWNER_SCOPE, assets: o.originals }, canonicalDerivatives: derivatives,
    renderAuthorization: renderAuthorizationOf(statement, o.renderPatch ?? {}) };
}

// ---------------------------------------------------------------- the structural creator_upload chain
const JOB = "footage_00000000-0000-4000-8000-00000000b1b0";
const T = (second: number) => `2026-09-30T10:00:${String(second).padStart(2, "0")}.000Z`;
/** Inside the structural DAG's execution grant (issued 10:00:06, admitted 10:00:07, expiring 12:00). */
export const RUN_START = "2026-09-30T10:05:00.000Z";
/** A test backend of the frozen model's width: arbitrary test numbers, never model output. */
class WideTestBackend implements EmbeddingBackend {
  async embed(ids: readonly string[]) {
    return { vectors: ids.map((sampleId, i) => ({ sampleId, vector: Array.from({ length: 1152 }, (_, k) => ((k * 7 + i * 13) % 17) / 17 + 0.01) })), version: "test-backend-not-a-model",
      device: "cpu" as const, fallback: false };
  }
}
export interface StructuralChain { x: R.RealExecution; bytesOf: (assetId: string) => Uint8Array; assetOf: { alpha: string; beta: string }; contents: { alpha: Uint8Array; beta: Uint8Array } }
/**
 * Two opaque sources, "alpha" and "beta", analysed by the accepted pure analyzer with the given authorizations (each must name exactly its
 * bytes: see `contentsOf`), and carried to an admitted revision-0 DAG by the accepted 3D harness builders.
 */
export async function structuralChain(authorizations: (contents: { alpha: Uint8Array; beta: Uint8Array }) => { alpha: Json; beta: Json },
  suppliedContents?: { alpha: Uint8Array; beta: Uint8Array }): Promise<StructuralChain> {
  const env = await footageEnvironment(["alpha", "beta"], 1);
  // G: optional generated bytes for structural lifecycle joins. Default fixtures and mock metadata/backend stay unchanged.
  if (suppliedContents) { env.contents.set("alpha", suppliedContents.alpha); env.contents.set("beta", suppliedContents.beta); }
  const contents = { alpha: env.contents.get("alpha")!, beta: env.contents.get("beta")! }, declared = authorizations(contents);
  const manifest: FootageManifest = { ...env.manifest, assets: env.manifest.assets.map(a => ({ ...a, authorization: a.entryId === "entry_alpha" ? declared.alpha : declared.beta })) };
  const base = env.services;
  const services = { ...base, async open(entry: FootageManifest["assets"][number], authorization: Parameters<typeof base.open>[1], config: Parameters<typeof base.open>[2]) {
    const opened = await base.open(entry, authorization, config);
    return { ...opened, backend: new WideTestBackend(), expectedDimensions: async () => 1152 };
  } };
  const config = { ...DEFAULT_FOOTAGE_CONFIG, embedding: siglipConfiguration("so400m") };
  const result = await analyzeFootage(manifest, config, JOB, services);
  if (result.analyses.length !== 2) throw new Error(`structural chain: the accepted analyzer refused a declared authorization (${JSON.stringify(result).slice(0, 400)})`);
  const record = { jobId: JOB, status: "succeeded", modelRuns: env.telemetry.modelRuns(), events: [], timings: result.timings, cache: result.cacheStats, configuration: config };
  const sources = result.analyses.map((analysis, i) => ({ entryId: manifest.assets[i]!.entryId, analysis })) as [R.TimelineSource, R.TimelineSource];
  const plan = R.planOutput(sources, { sourceAudio: "excluded", outputResolution: null, realMedia: false });
  const { chosen } = R.selectTimeline(sources, [null, null], plan);
  const scope = { projectId: manifest.projectId, creatorId: manifest.creatorId };
  const root = R.buildRealChain({ scope, owner: OWNER, run: { jobId: JOB, record }, plan, sourceAudio: "excluded", retentionExpiresAt: null,
    timeline: [{ ...sources[0], candidateId: chosen[0].candidateId }, { ...sources[1], candidateId: chosen[1].candidateId }], times: { world: T(0), capability: T(1) } });
  const chain = R.rootGraphChain(root);
  const assets = [...new Set(chain.graph.clipUses.filter(c => c.medium === "video").map(c => c.source.assetId))].sort();
  const verified = assets.map(assetId => { const s = sources.find(x => x.analysis.assetId === assetId)!.analysis;
    return { assetId, contentHash: s.contentHash, sizeBytes: s.authorization.sizeBytes, checkedAt: T(3) }; });
  const verificationEvidence = new Map(verified.map((v, i) => [v.assetId, R.artifactOf(`b1b_test_verification_${i}`, "Evidence",
    { scope: root.scope, basis: "test_declared_not_hashed", ...v })]));
  const x = R.buildExecution(chain, { owner: OWNER, authorityEvidence: R.artifactOf("b1b_test_authority", "Evidence", { scope: root.scope, basis: "test_render_authorization_not_real" }),
    resolver: { resolverId: "test_declared_resolver", version: "0.1.0", implementationDigest: "e".repeat(64) }, verified, verificationEvidence, renderIntents: ["final"],
    mediaGrantExpiresAt: null, times: { mediaGrant: T(2), capability: T(4), estimate: T(5), issued: T(6), admitted: T(7), expires: "2026-09-30T12:00:00.000Z" }, attempt: 1,
    prefix: "b1b_test_attempt_1" });
  const assetOf = { alpha: `asset_${sha256Hex(contents.alpha)}`, beta: `asset_${sha256Hex(contents.beta)}` };
  const bytesOf = (assetId: string) => (assetId === assetOf.alpha ? contents.alpha : assetId === assetOf.beta ? contents.beta : (() => { throw new Error("unknown asset"); })());
  return { x, bytesOf, assetOf, contents };
}
export interface DerivedStructuralChain extends StructuralChain { alphaRoot: Uint8Array; alpha: { derivation: Json; authorization: Json } }
/** alpha: a declared canonical derivative (structural, label digests) of an opaque root; beta: a consenting 1.1.0 original. */
export async function derivedStructuralChain(): Promise<DerivedStructuralChain> {
  const alphaRoot = deterministicBytes("b1b-structural-alpha-root", 4099);
  let alpha: { derivation: Json; authorization: Json } | undefined;
  const chain = await structuralChain(contents => {
    alpha = structuralDerivation(rootOf(alphaRoot), contents.alpha, "structural-alpha");
    return { alpha: alpha.authorization, beta: rootOf(contents.beta) };
  });
  if (alpha === undefined) throw new Error("structural chain: no derivation");
  return { ...chain, alphaRoot, alpha };
}
/** The owner's files and canonical store for the derived chain under `directory`: alpha's root and beta as originals, alpha as the declared derivative. */
export async function structuralRegistry(directory: string, chain: DerivedStructuralChain): Promise<{ base: string; workspace: string; registration: Json; rootId: string }> {
  const base = join(directory, "owner"), workspace = join(directory, "workspace");
  await mkdir(base); await mkdir(workspace);
  await writeFile(join(base, "alpha_root.mp4"), chain.alphaRoot); await writeFile(join(base, "beta.mp4"), chain.contents.beta);
  await plantCanonical(workspace, chain.alpha.derivation, chain.contents.alpha);
  const registration = registration02({ originals: [{ entryId: "alpha_root", path: "alpha_root.mp4", authorization: rootOf(chain.alphaRoot) },
    { entryId: "beta", path: "beta.mp4", authorization: rootOf(chain.contents.beta) }], derivatives: [{ entryId: "alpha_canonical", rootEntryId: "alpha_root", ...chain.alpha }] });
  return { base, workspace, registration, rootId: `asset_${sha256Hex(chain.alphaRoot)}` };
}
export interface Claimed { env: RuntimeEnv; v: ValidatedExecutionDag; claim: ExecutionClaim; ownership: ClaimOwnership; call: RuntimeCall; staged: StagedSourceReceipt[] }
/** The structural DAG registered, claimed and both sources staged through the accepted Batch-2A runtime over isolated temporary roots. */
export async function claimStructural(t: TestContext, s: StructuralChain): Promise<Claimed> {
  const v = openValidatedDag({ dag: s.x.dagArtifact.ref }, s.x.artifacts);
  const env = await runtimeEnv({ sources: v.admission.sources.map((source, i) => ({ assetId: source.assetId, bytes: s.bytesOf(source.assetId), name: `staged_${i}.bin` })),
    start: RUN_START });
  t.after(env.cleanup);
  await registerDagAttempt(v, s.x.artifacts, env.runtime);
  const { claim, ownership } = await acquireExecutionClaim(v, { workerId: "worker_b1b" }, env.runtime);
  const call: RuntimeCall = { dag: v, runtime: env.runtime, ownership, artifacts: s.x.artifacts };
  const staged: StagedSourceReceipt[] = [];
  for (const source of v.admission.sources) staged.push(await stageClaimedSource(call, { assetId: source.assetId }));
  env.clock.advance(250);
  return { env, v, claim, ownership, call, staged };
}

// ---------------------------------------------------------------- the other post-claim records, as the trusted adapters build them
export const timingAt = (t: string): CheckTiming => ({ checkStartedAt: t, observedAt: t, checkCompletedAt: t, observedAtBasis: "check_started_lower_bound" });
export const SESSION = { scheme: "sha256_of_ephemeral_session_token_v0" as const, digest: sha("b1b-owner-media-test-session") };
const listing = (title: string, legend: string[], separator: string, rows: string[]) => [`${title}:`, ...legend, separator, ...rows].join("\n");
const CODEC_LEGEND = [" V..... = Video", " A..... = Audio", " S..... = Subtitle", " .F.... = Frame-level multithreading", " ..S... = Slice-level multithreading",
  " ...X.. = Codec is experimental", " ....B. = Supports draw_horiz_band", " .....D = Supports direct rendering method 1"];
const FILTER_NAMES = ["trim", "atrim", "setpts", "asetpts", "scale", "setsar", "format", "aformat", "concat", "settb", "asettb", "split", "asplit", "null", "colorchannelmixer", "eq"];
const FORMAT_LEGEND = [" D.. = Demuxing supported", " .E. = Muxing supported", " ..d = Is a device"];
/** Real-shaped pinned-runtime evidence, copied in minimal form from the accepted 3D lifecycle tests. */
export function runtimeObservation(): RuntimeObservation {
  return { ffmpeg: { sha256: PINNED_MEDIA_RUNTIME.ffmpeg.sha256, sizeBytes: PINNED_MEDIA_RUNTIME.ffmpeg.sizeBytes,
    versionText: `ffmpeg version ${PINNED_MEDIA_RUNTIME.ffmpeg.reportedVersion} Copyright (c) 2000-2026 the FFmpeg developers\nbuilt with gcc 16.1.0\nconfiguration: --enable-gpl --enable-libx264`,
    buildConfigurationText: "\n  configuration:\n    --enable-gpl\n    --enable-version3\n    --enable-libx264\n" },
  ffprobe: { sha256: PINNED_MEDIA_RUNTIME.ffprobe.sha256, sizeBytes: PINNED_MEDIA_RUNTIME.ffprobe.sizeBytes,
    versionText: `ffprobe version ${PINNED_MEDIA_RUNTIME.ffprobe.reportedVersion} Copyright (c) 2007-2026 the FFmpeg developers` },
  listings: {
    encoders: listing("Encoders", CODEC_LEGEND, " ------", [" V....D libx264              libx264 H.264 / AVC / MPEG-4 AVC / MPEG-4 part 10 (codec h264)",
      " A....D aac                  AAC (Advanced Audio Coding)", " A....D pcm_s16le            PCM signed 16-bit little-endian"]),
    decoders: listing("Decoders", CODEC_LEGEND, " ------", [" VFS..D h264                 H.264 / AVC / MPEG-4 AVC / MPEG-4 part 10",
      " A....D aac                  AAC (Advanced Audio Coding)", " A....D pcm_s16le            PCM signed 16-bit little-endian"]),
    filters: listing("Filters", ["  T.. = Timeline support", "  .S. = Slice threading", "  A = Audio input/output", "  V = Video input/output",
      "  N = Dynamic number and/or type of input/output", "  | = Source or sink filter"], "  ------", FILTER_NAMES.map(n => ` .. ${n.padEnd(16)} V->V       The ${n} filter.`)),
    muxers: listing("Formats", FORMAT_LEGEND, " ---", ["  E  mov             QuickTime / MOV", "  E  mp4             MP4 (MPEG-4 Part 14)"]),
    demuxers: listing("Formats", FORMAT_LEGEND, " ---", [" D   mov,mp4,m4a,3gp,3g2,mj2 QuickTime / MOV"]),
    protocols: ["Supported file protocols:", "Input:", "  fd", "  file", "Output:", "  fd", "  file"].join("\n") },
  platform: RENDER_ENVIRONMENT.platform, arch: RENDER_ENVIRONMENT.arch };
}
/** A conforming probe of one program input: square pixels, its exact frame table on the MOV 1/15360 grid from zero, no audio. */
export function conformingProbeJson(slot: RenderProgram["inputs"][number]): string {
  const { frameCount, width, height, grid } = slot.video, tick = (15_360 * grid.denominator) / grid.numerator;
  return JSON.stringify({ frames: Array.from({ length: frameCount }, (_, i) => ({ stream_index: 0, pts: i * tick })), programs: [], stream_groups: [],
    streams: [{ index: 0, codec_name: "h264", codec_type: "video", width, height, sample_aspect_ratio: "1:1", pix_fmt: "yuv420p", time_base: "1/15360", start_pts: 0 }],
    format: { format_name: "mov,mp4,m4a,3gp,3g2,mj2" } });
}
/** Every non-lifecycle record, as the trusted adapters build them, at the runtime clock's current instant. */
export function evidenceAt(c: Claimed): Omit<RealEvidenceBundle, "lifecycle"> {
  const timing = timingAt(c.env.runtime.clock.now()), program = compileRenderProgram(c.v, c.call.artifacts), observation = runtimeObservation();
  return { policy: R.realExecutionPolicyFor(c.v.dag.scope, OWNER), program, staged: c.staged,
    runtimeProbe: buildRealRuntimeProbe({ dag: c.v, claim: c.claim, observation, timing, session: SESSION }),
    capabilityProbe: buildRealCapabilityProbe({ dag: c.v, artifacts: c.call.artifacts, claim: c.claim, observation, timing, session: SESSION }),
    conformance: c.staged.map(s => buildStagedInputConformance({ dag: c.v, claim: c.claim, stagedSource: s, program,
      probeJson: conformingProbeJson(program.inputs.find(i => i.assetId === s.source.assetId)!), timing, session: SESSION })) };
}
/** One owner-local observation record, built directly (pure): the permit binder's input, never a live handle. */
export function ownerRecordFor(c: Claimed, s: StagedSourceReceipt, provenance: unknown, state: { deletionRequestedAt: string | null; expiresAt: string | null } =
  { deletionRequestedAt: null, expiresAt: null }): OwnerMediaLifecycleObservation {
  const now = c.env.runtime.clock.now();
  return buildOwnerMediaLifecycleObservation({ dag: c.v, claim: c.claim, stagedSource: s, provenance: provenance as never,
    declaration: { registrationDigest: "e".repeat(64), entryId: "entry_declared", contentHash: s.expected.contentHash, sizeBytes: s.expected.sizeBytes, verifiedAt: now },
    state, timing: timingAt(now), session: SESSION });
}
export const ORIGINAL_PROVENANCE = { mediaOrigin: "creator_upload", sourceType: "owner_supplied", authorizationBasis: "owner_created" } as const;
/** The derived provenance a system_canonicalized authorization states: its root's identity, derivation, recipe and inherited basis. */
export function derivedProvenanceOf(authorization: Json): Json {
  const lineage = authorization.derivedFrom as { rootAuthorization: { contentHash: string; sizeBytes: number }; derivationId: string; recipeId: string };
  return { mediaOrigin: "creator_upload", sourceType: "system_canonicalized", authorizationBasis: authorization.authorizationBasis,
    root: { assetId: `asset_${lineage.rootAuthorization.contentHash}`, contentHash: lineage.rootAuthorization.contentHash, sizeBytes: lineage.rootAuthorization.sizeBytes },
    derivationId: lineage.derivationId, recipeId: lineage.recipeId };
}
