// Gate 7 Batch 3D: the pure core of the owner-run real-footage verification harness. Nothing here starts a process, reads a file,
// clock or environment, or reaches a network: the runner (tests/edit-real-footage.local.ts) supplies every instant, every record it
// read and every byte verification the owner-local authority performed. Everything is built only from accepted Gate 1-7 APIs.
//
// - Provenance is derived, never asserted: each record's media and computation labels come from the supplied analysis. A synthetic
//   analysis yields synthetic labels (the cloud tests use one). Real eligibility requires owner provenance and the frozen model
//   configuration; a canonical derivative additionally requires the existing live 0.3 authority and exact 0.4 lineage. This check
//   is neither proof of inference nor a fresh byte observation or an executable permit.
// - Direction, planning and the edit requests are DETERMINISTIC VERIFICATION INPUT, not creative direction: no Director model runs,
//   and nothing here measures creative or editing quality.
// - Admissibility is checked, never repaired: variable-rate, off-grid, rotated, non-H.264, non-square-pixel or mismatched sources,
//   and candidates the exact output clock cannot represent, are refused with the exact reason. Nothing is transcoded, retimed,
//   rotated, cropped, stretched or silently muted.
import { z } from "zod";
import { IdSchema } from "../../packages/contracts/common.js";
import { EditorialArtifactMap, equal, missing, present, type ArtifactRef, type Producer, type SuppliedArtifact } from "../../packages/editorial/common.js";
import { resolveEditorialToken } from "../../packages/editorial/resolve.js";
import { createEditorialCandidateSet } from "../../packages/editorial/decision.js";
import { createWorldSnapshot, linkEditorialToken, queryWorld, WORLD_MAX_RESULTS, type GroundedSupport } from "../../packages/world-model/index.js";
import { budget, profile, reserve, selectModel } from "../../packages/routing/index.js";
import { CANON_V0, createCanonView, createCandidateSummary, createCreativeDirectionGraph, createDirectorGroundingReport, createDirectorProducerRun, createDirectorRequest,
  createDirectorResult, createIntentSpec, directorSelectionInputDigest } from "../../packages/director/index.js";
import { createPlanningContext, createPlanningPolicy, runPlanning } from "../../packages/planning/index.js";
import { buildEditGraph, createCapabilityAttestation, createCapabilitySnapshot, createEditGraphPolicy, createEditOutputProfile, createTechniqueResolution, supplied,
  type AnyEditGraph } from "../../packages/edit-graph/index.js";
import { canonicalTime, convertTime, decodeLegacySeconds, frameTime, rateOf, secondsOf, type ExactTime, type Rate } from "../../packages/edit-graph/common.js";
import { admitExecution, buildExecutionDag, createExecutionGrant, createExecutionMediaGrant, createExecutionPolicy, createExecutionRenderProfile,
  createExecutionRuntimeAttestation, createExecutionWorkEstimate, createSourceAccessReceipt, type RenderIntent } from "../../packages/edit-execution/index.js";
import { OWNER_MEDIA_AUTHORITY, OWNER_MEDIA_AUTHORITY_DIGEST, OwnerRenderAuthorizationSchema, PINNED_MEDIA_RUNTIME, RENDER_ENVIRONMENT, RENDER_EXECUTOR, RENDER_SEMANTICS,
  createRealExecutionPolicy } from "../../packages/edit-render/index.js";
import { createReviewPolicy, REVIEW_HARD_LIMITS, yuv420pFrameBytes } from "../../packages/edit-review/index.js";
import * as E from "../../packages/edit-editorial/index.js";
import { FOOTAGE_VERSION, FootageAnalysisSchema } from "../../packages/footage-analyzer/protocol.js";
import { SIGLIP_MODELS, siglipConfiguration } from "../../packages/reference-analyzer/models.js";
import { embeddingSpaceId } from "../../packages/reference-analyzer/embeddings.js";
import { artifact } from "./planning.js";
import { AnyOwnerRenderAuthorizationSchema, OwnerMediaLosslessRegistrationSchema, ownerMediaDeclarations, ownerMediaLosslessDeclarations } from "../../packages/edit-render/owner-media.js";
import { OwnerMediaLifecycleAuthority } from "../../scripts/edit-render-owner-media-authority-local.js";

export const HARNESS = { harnessId: "batch3d_real_footage_harness", version: "0.1.0" } as const;
/** The label every direction, plan and request of this harness carries: it is verification input, never creative direction. */
export const VERIFICATION_INPUT = "deterministic_verification_input" as const;
/** The frozen Phase-2 semantic model (AGENTS.md): exact model, revision and observed real embedding space. Nothing else is real-model evidence here. */
export const FROZEN_SEMANTIC_MODEL = { model: SIGLIP_MODELS.so400m.model, revision: SIGLIP_MODELS.so400m.revision,
  spaceId: "space_58bd790c6dc94ee22f001fadec49ff85cb3178eef47a856ca421948b3d06f687" } as const;
const OWNER_BASES: readonly string[] = ["owner_created", "permission_granted"];
const PURPOSE = "local_evaluation" as const;
const LINKED_AUDIO_SAMPLE_RATE = 48_000;
/**
 * The harness's bound on the retained-candidate universe of the timeline analyses. The accepted chain re-validates every retained
 * candidate at each boundary, and the current-head validation runs twice between the post-stage lifecycle observation and permit
 * issuance, which must fit inside the policy's 60-second maximum evidence age. On the cloud container one current-head validation took
 * about 5-9 s at 22 retained candidates, growing linearly, so larger universes are refused before any media work, never sampled:
 * the owner authorizes and analyzes shorter clips, or a smaller accepted proposal configuration, instead.
 */
export const MAX_RETAINED_CANDIDATES = 32;
const MAX_OUTPUT_CLOCK = 1_000_000_000, MICROSECOND_CLOCK = 1_000_000;
const H = "0".repeat(64);
const envelope = <const T extends string>(artifactType: T) => ({ artifactType, artifactVersion: "0.1.0" as const, stability: "internal_pre_stable" as const });
const byText = <T>(key: (value: T) => string) => (a: T, b: T) => key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0;
/** Zero-padded, so canonical text order is candidate order. */
const entityId = (i: number) => `entity_candidate_${String(i).padStart(4, "0")}`;

export type FootageAnalysis = z.infer<typeof FootageAnalysisSchema>;
/** A refusal with a stable code and the exact reasons; the runner records it and never works around it. */
export class HarnessRefusal extends Error {
  constructor(readonly code: string, readonly reasons: readonly string[]) { super(`${code}: ${reasons.join("; ")}`); this.name = "HarnessRefusal"; }
}
function refuse(code: string, reasons: readonly string[]): never { throw new HarnessRefusal(code, reasons); }

// ================================================================ the owner's run manifest (execution-only local input, git-ignored)
const Dimension = z.number().int().min(2).max(RENDER_SEMANTICS.bounds.maxWidth).refine(v => v % 2 === 0, "Output dimensions are even.");
/**
 * The strict run manifest. It carries no media and no identity of its own: the footage manifest it names is the accepted Phase-2
 * AuthorizedFootageSet (exact relative paths, SHA-256, sizes, labels and owner provenance) that the accepted analyzer consumed, and
 * the timeline names that set's own entry labels. The render authorization is the owner's explicit marker.
 */
const RunFields = {
  manifestType: z.literal("Batch3DRealFootageRun"),
  /** Absolute local path of the accepted Phase-2 AuthorizedFootageSet JSON. Its directory is the only place sources are read from. */
  footageManifest: z.string().min(1).max(1024),
  /** The accepted analyzer's run over exactly that footage manifest: .local-runs/<analysisJobId>/. */
  analysisJobId: z.string().regex(/^footage_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/),
  /** Two clips in output order: the first is locked (state only), the second is trimmed. A null candidate lets the harness choose deterministically. */
  timeline: z.tuple([z.strictObject({ entryId: IdSchema, candidateId: IdSchema.nullable() }), z.strictObject({ entryId: IdSchema, candidateId: IdSchema.nullable() })]),
  /** Explicit: linked source audio, or audio excluded by the owner's graph policy. Never inferred, never silently removed. */
  sourceAudio: z.enum(["linked_identity", "excluded"]),
  /** Optional output size with the sources' exact display aspect; default the first timeline source's own size. */
  outputResolution: z.strictObject({ width: Dimension, height: Dimension }).nullable(),
};
/** 0.1 keeps the original contract; 0.2 names an explicit accepted 0.3 registration and its private canonical store. */
export const RealFootageRunManifestSchema = z.union([
  z.strictObject({ ...RunFields, schemaVersion: z.literal("0.1.0"), renderAuthorization: OwnerRenderAuthorizationSchema }),
  z.strictObject({ ...RunFields, schemaVersion: z.literal("0.2.0"), renderAuthorization: AnyOwnerRenderAuthorizationSchema,
    ownerMediaRegistration: z.string().min(1).max(1024), canonicalWorkspace: z.string().min(1).max(1024) }),
]).refine(v => v.renderAuthorization.renderIntents.includes("final"), "The owner's render authorization must cover the final render intent.");
export type RealFootageRunManifest = z.infer<typeof RealFootageRunManifestSchema>;

/** Version dispatch only: accepted parsers own all registration/authorization/derivation rules. No registration is invented for a derivative. */
export function registrationForRun(manifest: RealFootageRunManifest, footage: unknown, supplied?: unknown) {
  if (manifest.schemaVersion === "0.1.0") {
    const d = ownerMediaDeclarations({ artifactType: "OwnerMediaRegistration", artifactVersion: "0.1.0", stability: "internal_pre_stable",
      footage, renderAuthorization: manifest.renderAuthorization });
    return { ...d, derivatives: [] };
  }
  const registration = OwnerMediaLosslessRegistrationSchema.parse(supplied), d = ownerMediaLosslessDeclarations(registration);
  if (!equal(registration.footage, footage) || !equal(registration.renderAuthorization, manifest.renderAuthorization))
    refuse("registration_run_mismatch", ["The explicit registration must bind exactly the named root manifest and render authorization."]);
  if (!manifest.timeline.some(t => d.derivatives.some(a => a.entryId === t.entryId)))
    refuse("canonical_timeline_missing", ["The canonical run must select a declared 0.4 derivative."]);
  return { registration, registrationDigest: d.registrationDigest, declarations: [...d.declarations, ...d.derivatives], derivatives: d.derivatives };
}

/** An absolute local path, never a URL, share, device path, traversal or NUL. */
export function absoluteLocalPath(path: string, label: string): string {
  if (typeof path !== "string" || path.length === 0 || path.length > 1024 || !/^(?:[A-Za-z]:[\\/]|\/)/.test(path) || path.startsWith("\\\\") || path.startsWith("//")
    || /^[A-Za-z][A-Za-z0-9+.-]*:\/\//.test(path) || path.includes("\0") || path.split(/[\\/]/).includes("..")) {
    refuse("location_invalid", [`${label} is an absolute local path, never a URL, share, device path or traversal.`]);
  }
  return path;
}
/** The runner's one argument: `--manifest <absolute local path>`. */
export function manifestArgument(args: readonly string[]): string {
  if (args.length !== 2 || args[0] !== "--manifest" || args[1] === undefined) refuse("usage", ["--manifest <absolute path of the run manifest>"]);
  return absoluteLocalPath(args[1], "The run manifest");
}
/**
 * A private manifest inside the repository must live in a git-ignored directory (.local-media/, local-media/ or .local-runs/; the accepted
 * Phase-2 AuthorizedFootageSet lives under local-media/); outside the repository the owner's own location is used as given. `inside` is the
 * path relative to the repository root.
 */
export function privateLocationRefusal(inside: string, label: string): HarnessRefusal | null {
  if (inside.startsWith("..") || /^(?:[A-Za-z]:|[\\/])/.test(inside)) return null;
  const top = inside.split(/[\\/]/)[0];
  return top === ".local-media" || top === "local-media" || top === ".local-runs" ? null
    : new HarnessRefusal("private_manifest_not_git_ignored", [`${label} inside the repository must live under .local-media/, local-media/ or .local-runs/.`]);
}

// ================================================================ source admissibility (inspected, never repaired)
export interface TimelineSource { entryId: string; analysis: FootageAnalysis }
export interface OutputPlan {
  frameRate: { numerator: number; denominator: number }; ticksPerSecond: number; aspect: { width: number; height: number };
  resolution: { width: number; height: number }; linkedAudio: boolean;
}
const gcd = (a: number, b: number): number => b === 0 ? a : gcd(b, a % b);
/**
 * The exact output clock: the largest multiple of lcm(frame-rate numerator, 10^6) not above 10^9 ticks per second. Every output frame
 * instant and every microsecond-rounded analyzer instant is then a whole number of ticks; an unrepresentable rate refuses.
 */
export function outputClockFor(frameRate: { numerator: number; denominator: number }): number {
  const unit = frameRate.numerator / gcd(frameRate.numerator, MICROSECOND_CLOCK) * MICROSECOND_CLOCK;
  if (!Number.isSafeInteger(unit) || unit > MAX_OUTPUT_CLOCK) refuse("frame_rate_clock_unrepresentable", [`No exact output clock up to ${MAX_OUTPUT_CLOCK} ticks/s represents ${frameRate.numerator}/${frameRate.denominator} fps frames and microsecond instants.`]);
  return Math.floor(MAX_OUTPUT_CLOCK / unit) * unit;
}
/** True only for the frozen real model's exact configuration and embedding space. */
export function isFrozenRealModel(analysis: FootageAnalysis): boolean {
  const e = analysis.configuration.embedding;
  return e.mode === "siglip" && e.model === FROZEN_SEMANTIC_MODEL.model && e.revision === FROZEN_SEMANTIC_MODEL.revision && equal(e, siglipConfiguration("so400m"))
    && embeddingSpaceId(e) === FROZEN_SEMANTIC_MODEL.spaceId;
}
export interface RegisteredMediaInput { registration: unknown; authority: unknown; asOf: string }
/** Pure eligibility inspection of an already-created authority. The runner still re-verifies bytes and obtains fresh execution observations. */
function registeredAnalysisReasons(sources: readonly TimelineSource[], input: RegisteredMediaInput): string[] {
  const parsed = OwnerMediaLosslessRegistrationSchema.safeParse(input.registration);
  if (!parsed.success) return ["canonical_registration_invalid"];
  const declared = ownerMediaLosslessDeclarations(parsed.data), all = [...declared.declarations, ...declared.derivatives];
  const authority = input.authority;
  if (!OwnerMediaLifecycleAuthority.is(authority)) return ["canonical_live_authority_required"];
  const identities = all.map(({ entryId, assetId, contentHash, sizeBytes }) => ({ entryId, assetId, contentHash, sizeBytes })).sort(byText(d => d.assetId));
  if (authority.registrationDigest !== declared.registrationDigest || !equal(authority.scope, { projectId: parsed.data.footage.projectId, creatorId: parsed.data.footage.creatorId })
    || !equal(authority.renderAuthorization, parsed.data.renderAuthorization) || !equal([...authority.declared].sort(byText(d => d.assetId)), identities))
    return ["canonical_authority_registration_mismatch"];
  const reasons: string[] = [];
  if (parsed.data.renderAuthorization.authorizedAt > input.asOf) reasons.push("render_authorization_not_in_effect");
  for (const s of sources) {
    const d = all.find(d => d.entryId === s.entryId), a = s.analysis;
    if (d === undefined) { reasons.push(`canonical_analysis_missing_or_invalid:${s.entryId}`); continue; }
    if (a.assetId !== d.assetId || a.contentHash !== d.contentHash || a.authorization.sizeBytes !== d.sizeBytes || !equal(a.authorization, d.authorization))
      reasons.push(`canonical_analysis_binding_mismatch:${s.entryId}`);
    if (!isFrozenRealModel(a) || a.inventory.embeddingSpace.spaceId !== FROZEN_SEMANTIC_MODEL.spaceId || a.inventory.embeddingSpace.dimensions !== 1152)
      reasons.push(`analysis_not_frozen_semantic_model:${s.entryId}`);
    try { authority.assertCurrent(d.assetId, input.asOf); } catch (error) {
      const code = error !== null && typeof error === "object" && "code" in error ? String(error.code) : "invalid";
      reasons.push(`canonical_lifecycle_refused:${s.entryId}:${code}`);
    }
    const derivative = declared.derivatives.find(v => v.assetId === d.assetId);
    if (derivative === undefined) continue;
    const facts = derivative.derivation.sampleDerivation.output.facts, video = facts.streams.find(s => s.kind === "video"), m = a.metadata;
    if (video === undefined || m.codec !== video.codec || m.width !== video.geometry.declared.width || m.height !== video.geometry.declared.height
      || m.codedWidth !== video.geometry.declared.width || m.codedHeight !== video.geometry.declared.height || m.rotation !== 0 || m.variableFrameRate
      || !equal(m.fps, video.declaredFrameRate) || m.frameCount !== video.presentationTimestamps.length
      || !equal(m.frameTimes, video.presentationTimestamps.map(value => secondsOf({ value, rate: rateOf(video.timeBase.denominator) })))
      || m.hasAudio !== facts.streams.some(s => s.kind === "audio")) reasons.push(`canonical_analysis_media_mismatch:${s.entryId}`);
  }
  return reasons;
}
/**
 * Inspects the timeline sources against the accepted V0 render and conformance rules. `realMedia` requires owner-supplied real media
 * analysed by the frozen real model. Every violation is reported with its exact reason; nothing is normalized.
 */
export function planOutput(sources: readonly TimelineSource[], o: { sourceAudio: "linked_identity" | "excluded"; outputResolution: { width: number; height: number } | null;
  realMedia: boolean; registeredMedia?: RegisteredMediaInput }): OutputPlan {
  const { realMedia, registeredMedia, sourceAudio, outputResolution } = o;
  if (realMedia && registeredMedia) sources = sources.map(s => {
    const entryId = s.entryId, parsed = FootageAnalysisSchema.safeParse(s.analysis);
    if (!parsed.success) refuse("source_not_admissible", [`canonical_analysis_missing_or_invalid:${entryId}`]);
    return { entryId, analysis: parsed.data };
  });
  const reasons: string[] = realMedia && registeredMedia ? registeredAnalysisReasons(sources, registeredMedia) : [];
  // Invalid or missing registered analysis must refuse before legacy metadata access; never repair it or borrow a root's analysis.
  if (reasons.length > 0) refuse("source_not_admissible", reasons);
  for (const { entryId, analysis } of sources) {
    const a = analysis.authorization, m = analysis.metadata;
    if (realMedia && ((a.sourceType !== "owner_supplied" && !(registeredMedia && a.sourceType === "system_canonicalized"))
      || !OWNER_BASES.includes(a.authorizationBasis))) reasons.push(`analysis_not_owner_real_media:${entryId}`);
    if (realMedia && !isFrozenRealModel(analysis)) reasons.push(`analysis_not_frozen_semantic_model:${entryId}`);
    if (!a.allowedPurposes.includes(PURPOSE)) reasons.push(`authorization_lacks_local_evaluation:${entryId}`);
    if (m.variableFrameRate) reasons.push(`variable_frame_rate:${entryId} (V0 renders only constant-rate sources; nothing is converted)`);
    if (m.codec !== "h264") reasons.push(`codec_unsupported:${entryId}:${m.codec}`);
    if (m.rotation !== 0) reasons.push(`rotation_unsupported:${entryId}:${m.rotation}`);
    const g = gcd(m.width, m.height);
    if (m.width / g !== m.aspectRatio.width || m.height / g !== m.aspectRatio.height) reasons.push(`pixel_geometry_not_display_aspect:${entryId} (non-square pixels are refused, never stretched)`);
    const grid = { value: 0, rate: rateOf(m.fps.numerator, m.fps.denominator) };
    const off = m.frameTimes.findIndex((t, i) => t !== secondsOf({ ...grid, value: i }));
    if (off >= 0) reasons.push(`frame_table_off_grid:${entryId}:frame ${off} at ${m.frameTimes[off]} s is not exactly ${off} x ${m.fps.denominator}/${m.fps.numerator} s`);
    if (m.fps.numerator < m.fps.denominator || m.fps.numerator > 240 * m.fps.denominator) reasons.push(`frame_rate_out_of_bounds:${entryId}`);
    if (sourceAudio === "linked_identity" && !m.hasAudio) reasons.push(`source_audio_absent:${entryId} (V0 never synthesizes silence; declare sourceAudio "excluded" explicitly)`);
  }
  const retained = [...new Map(sources.map(s => [s.analysis.assetId, s.analysis.keptCandidateIds.length])).values()].reduce((n, k) => n + k, 0);
  if (retained > MAX_RETAINED_CANDIDATES) reasons.push(`candidate_universe_exceeds_harness_bound:${retained} retained candidates (at most ${MAX_RETAINED_CANDIDATES}; authorize and analyze shorter clips)`);
  const first = sources[0]!.analysis.metadata;
  for (const { entryId, analysis: { metadata: m } } of sources.slice(1)) {
    if (m.fps.numerator !== first.fps.numerator || m.fps.denominator !== first.fps.denominator) reasons.push(`frame_rate_mismatch:${entryId}`);
    if (m.aspectRatio.width !== first.aspectRatio.width || m.aspectRatio.height !== first.aspectRatio.height) reasons.push(`display_aspect_mismatch:${entryId}`);
  }
  const resolution = outputResolution ?? { width: first.width, height: first.height };
  if (resolution.width % 2 !== 0 || resolution.height % 2 !== 0 || resolution.width > RENDER_SEMANTICS.bounds.maxWidth || resolution.height > RENDER_SEMANTICS.bounds.maxHeight) {
    reasons.push(`output_resolution_unsupported:${resolution.width}x${resolution.height} (even, at most ${RENDER_SEMANTICS.bounds.maxWidth}; set outputResolution explicitly)`);
  }
  if (resolution.width * first.aspectRatio.height !== resolution.height * first.aspectRatio.width) reasons.push("output_resolution_aspect_mismatch");
  let ticksPerSecond = 0;
  try { ticksPerSecond = outputClockFor(first.fps); } catch (error) { if (error instanceof HarnessRefusal) reasons.push(...error.reasons); else throw error; }
  if (reasons.length > 0) refuse("source_not_admissible", reasons);
  return { frameRate: { numerator: first.fps.numerator, denominator: first.fps.denominator }, ticksPerSecond, aspect: { ...first.aspectRatio }, resolution,
    linkedAudio: sourceAudio === "linked_identity" };
}

// ================================================================ candidate admissibility and exact frame selection
export interface CandidateFacts { candidateId: string; index: number; precision: "frame_pts_exact" | "source_seconds"; startFrame: number; endFrame: number; frames: number;
  durationSeconds: number }
const gridOf = (plan: OutputPlan): Rate => rateOf(plan.frameRate.numerator, plan.frameRate.denominator);
const sampleExact = (frame: number, plan: OutputPlan) =>
  (BigInt(frame) * BigInt(plan.frameRate.denominator) * BigInt(LINKED_AUDIO_SAMPLE_RATE)) % BigInt(plan.frameRate.numerator) === 0n;
/**
 * The exact frames the V0 renderer would select for one retained candidate, or the reasons it cannot: both endpoints must decode exactly
 * on the output clock, the output duration must be whole output frames, the selected source frames must be exactly those output frames,
 * and linked audio must start and end on whole samples. This mirrors the accepted graph, workload and render-program rules; they
 * remain the authority and refuse independently.
 */
export function candidateFacts(analysis: FootageAnalysis, candidateId: string, plan: OutputPlan): CandidateFacts | { candidateId: string; reasons: string[] } {
  const index = analysis.candidates.findIndex(c => c.candidate.candidateId === candidateId), reasons: string[] = [];
  if (index < 0 || !analysis.keptCandidateIds.includes(candidateId)) return { candidateId, reasons: ["candidate_not_retained"] };
  const range = analysis.candidates[index]!.candidate.sourceRange, clock = rateOf(plan.ticksPerSecond), grid = gridOf(plan), frameTimes = analysis.metadata.frameTimes;
  const start = decodeLegacySeconds(range.startSeconds, clock), end = decodeLegacySeconds(range.endSeconds, clock);
  if (start === undefined || end === undefined || end.value <= start.value) return { candidateId, reasons: ["endpoint_not_exact_on_output_clock"] };
  const numerator = BigInt(end.value - start.value) * BigInt(plan.frameRate.numerator), denominator = BigInt(plan.ticksPerSecond) * BigInt(plan.frameRate.denominator);
  if (numerator % denominator !== 0n) return { candidateId, reasons: ["duration_not_whole_output_frames"] };
  const frames = Number(numerator / denominator);
  const s = frameTimes.indexOf(range.startSeconds), e = frameTimes.indexOf(range.endSeconds), exact = s >= 0 && e >= 0;
  const first = (t: ExactTime) => Math.min(convertTime(t, grid, "ceil").value, frameTimes.length);
  const startFrame = exact ? s : first(start), endFrame = exact ? e : first(end);
  if (endFrame - startFrame !== frames) reasons.push("selected_frames_differ_from_output_frames");
  if (plan.linkedAudio && !(sampleExact(startFrame, plan) && sampleExact(endFrame, plan))) reasons.push("audio_sample_boundary_not_exact");
  if (reasons.length > 0) return { candidateId, reasons };
  return { candidateId, index, precision: exact ? "frame_pts_exact" : "source_seconds", startFrame, endFrame, frames, durationSeconds: range.endSeconds - range.startSeconds };
}
/**
 * The exact keep range of a trim that removes about half a second from the end of a clip: whole admitted source frames, every changed
 * endpoint an admitted frame, at most a third of the clip, and (with linked audio) whole samples. A start with only candidate-endpoint
 * authority is replaced by the first frame the parent already renders, so the kept picture starts where it did. Nothing is snapped
 * to a non-frame instant; if no such trim exists this refuses. With `fewerThan`, the trim removes strictly fewer than that many frames: the
 * distinct exact edit of the QC-failure attempt (R02-E).
 */
export function trimKeep(clip: { source: { range: { start: ExactTime; end: ExactTime }; startAuthority: { kind: string; frameIndex?: number };
  endAuthority: { kind: string; frameIndex?: number }; precision: string } }, frameCount: number, plan: OutputPlan, fewerThan?: number) {
  const grid = gridOf(plan), s = clip.source;
  const first = (t: ExactTime) => Math.min(convertTime(t, grid, "ceil").value, frameCount);
  const startFrame = s.precision === "frame_pts_exact" ? s.startAuthority.frameIndex! : first(s.range.start);
  const endFrame = s.precision === "frame_pts_exact" ? s.endAuthority.frameIndex! : first(s.range.end);
  const half = Math.round(plan.frameRate.numerator / (2 * plan.frameRate.denominator));
  const bound = Math.min(half, Math.floor((endFrame - startFrame) / 3), fewerThan === undefined ? half : fewerThan - 1);
  for (let removed = bound; removed >= 1; removed -= 1) {
    const kept = endFrame - removed;
    if (plan.linkedAudio && !sampleExact(kept, plan)) continue;
    const start = s.startAuthority.kind === "frame_pts" ? s.range.start : canonicalTime(frameTime(startFrame, grid));
    return { keep: { start, end: canonicalTime(frameTime(kept, grid)) }, removedFrames: removed, keptFrames: kept - startFrame, startFrame, endFrame: kept,
      startSnappedToRenderedFrame: s.startAuthority.kind !== "frame_pts" };
  }
  return refuse("trim_not_representable", ["No whole-frame, sample-exact trim of at most a third of the clip exists."]);
}
/**
 * The two timeline candidates: an owner-named candidate must be admissible; otherwise the longest admissible retained candidate of the
 * entry (then earliest, then by identity) is chosen, the second distinct from the first. The second must also admit an exact trim.
 */
export function selectTimeline(sources: readonly [TimelineSource, TimelineSource], requested: readonly [string | null, string | null], plan: OutputPlan) {
  const chosen: CandidateFacts[] = [], rejected: { entryId: string; candidateId: string; reasons: string[] }[] = [];
  sources.forEach(({ entryId, analysis }, position) => {
    const ids = requested[position] !== null ? [requested[position]!] : analysis.keptCandidateIds;
    const admissible: CandidateFacts[] = [];
    for (const id of ids) {
      if (chosen.some(c => c.candidateId === id)) continue;
      const facts = candidateFacts(analysis, id, plan);
      if ("reasons" in facts) { rejected.push({ entryId, ...facts }); continue; }
      if (position === 1) {
        const c = analysis.candidates[facts.index]!.candidate.sourceRange;
        const probe = { source: { range: { start: canonicalTime(decodeLegacySeconds(c.startSeconds, rateOf(plan.ticksPerSecond))!),
          end: canonicalTime(decodeLegacySeconds(c.endSeconds, rateOf(plan.ticksPerSecond))!) },
          startAuthority: facts.precision === "frame_pts_exact" ? { kind: "frame_pts", frameIndex: facts.startFrame } : { kind: "candidate_endpoint" },
          endAuthority: facts.precision === "frame_pts_exact" ? { kind: "frame_pts", frameIndex: facts.endFrame } : { kind: "candidate_endpoint" }, precision: facts.precision } };
        // Two distinct exact trims of this clip: the published revision's, and the strictly smaller one of the QC-failure attempt (R02-E).
        try {
          const first = trimKeep(probe, analysis.metadata.frameTimes.length, plan);
          trimKeep(probe, analysis.metadata.frameTimes.length, plan, first.removedFrames);
        } catch (error) {
          if (!(error instanceof HarnessRefusal)) throw error;
          rejected.push({ entryId, candidateId: id, reasons: [...error.reasons] }); continue;
        }
      }
      admissible.push(facts);
    }
    admissible.sort((a, b) => b.frames - a.frames || a.startFrame - b.startFrame || (a.candidateId < b.candidateId ? -1 : 1));
    if (admissible.length === 0) refuse("no_admissible_candidate", [`${entryId}: no retained candidate satisfies the V0 exact-time rules`,
      ...rejected.filter(r => r.entryId === entryId).slice(0, 8).map(r => `${r.candidateId}: ${r.reasons.join(", ")}`)]);
    chosen.push(admissible[0]!);
  });
  return { chosen: chosen as [CandidateFacts, CandidateFacts], rejectedCount: rejected.length };
}

// ================================================================ the owner-scoped chain: analysis -> tokens -> world -> direction -> planning -> revision-zero EditGraph
export interface ChainSource extends TimelineSource { candidateId: string }
export interface ChainInput {
  scope: { projectId: string; creatorId: string };
  owner: { kind: "owner"; actorId: string };
  /** The accepted analyzer's run record (run.json) and its job, which produced every supplied analysis. */
  run: { jobId: string; record: unknown };
  timeline: readonly [ChainSource, ChainSource];
  plan: OutputPlan;
  sourceAudio: "linked_identity" | "excluded";
  /** Instants of the trusted runtime clock at which the world was queried and the executor's capability claims were recorded. */
  times: { world: string; capability: string };
  /** The owner's render-authorization expiry: the MediaAsset retention the admitted sources carry. */
  retentionExpiresAt: string | null;
}
const EDITORIAL_POLICY = { policyId: "batch3d_editorial_adapter_policy", policyVersion: "0.1.0" };
const AGGREGATOR = { implementationId: "CandidateFeatureAggregator", aggregationVersion: "footage-evidence-v1", sourceSha256: "46024d6af6743868e30504cf35cb26c1acfcc1eb5025e35544744edd273c0cf8" };
export const REAL_SUPPORTS = (plan: OutputPlan) => [member("time_mapping", "constant_speed_identity"), member("framing", "source_aspect_matches_output"),
  member("source_endpoint_precision", "frame_pts_exact", "source_seconds"), member("source_rotation", "rotation_0"), member("source_frame_timing", "constant_frame_rate"),
  member("source_codec", "codec_h264"), member("output_aspect", `aspect_${plan.aspect.width}_${plan.aspect.height}`),
  member("output_frame_rate", `fps_${plan.frameRate.numerator}_${plan.frameRate.denominator}`), atMost("output_width", RENDER_SEMANTICS.bounds.maxWidth),
  atMost("output_height", RENDER_SEMANTICS.bounds.maxHeight), atMost("output_duration_seconds_ceiling", RENDER_SEMANTICS.bounds.maxDurationSeconds),
  atMost("clip_count", RENDER_SEMANTICS.bounds.maxClips)];
function member(name: string, ...values: string[]) { return { name, kind: "member" as const, values }; }
function atMost(name: string, max: number) { return { name, kind: "at_most" as const, max }; }

/** Evidence records of this chain: each names what it is, and none claims a measurement it did not make. */
function chainEvidence(scope: object) {
  const e = (objectId: string, basis: string) => artifact(objectId, "Evidence", { scope, basis });
  return {
    conformance: e("b3d_declared_capability_conformance", "owner_run_declared_executor_capability_claim_not_measured_pinned_runtime_probe_verifies_at_execution"),
    configuration: e("b3d_declared_capability_configuration", "owner_run_declared_executor_configuration_not_measured_pinned_runtime_probe_verifies_at_execution"),
    resources: e("b3d_declared_capability_resources", "owner_run_declared_executor_resources_not_measured"),
  };
}
export type RealChain = ReturnType<typeof buildRealChain>;
/**
 * The revision-zero EditGraph over the two timeline candidates, through the accepted Gate 4-6 builders: every retained candidate of every
 * supplied analysis is resolved to a token (the candidate universe is exactly the retained set), the world grounds each candidate range,
 * two hard story nodes bind the chosen candidates in order, one typed cut joins them, and Gate 5 chooses exactly that sequence.
 */
export function buildRealChain(input: ChainInput) {
  const { owner, plan } = input, chainScope = { ...input.scope, purpose: PURPOSE };
  const analyses = [...new Map(input.timeline.map(t => [t.analysis.assetId, t.analysis])).values()];
  if (analyses.some(a => a.authorization.projectId !== chainScope.projectId || a.authorization.creatorId !== chainScope.creatorId)) {
    refuse("scope_mismatch", ["Every analysis belongs to the owner's project and creator."]);
  }
  const retained = analyses.reduce((n, a) => n + a.keptCandidateIds.length, 0);
  if (retained > WORLD_MAX_RESULTS) refuse("candidate_universe_exceeds_bound", [`${retained} retained candidates exceed the ${WORLD_MAX_RESULTS}-candidate world view bound.`]);
  const runArtifact = artifact(`b3d_run_${input.run.jobId}`.slice(0, 128), "FootageRun", input.run.record, "legacy-unversioned");
  const policyArtifact = artifact("b3d_editorial_policy", "EditorialPolicy", EDITORIAL_POLICY, "legacy-unversioned");
  const implementationArtifact = artifact("b3d_aggregation_implementation", "ImplementationDescriptor", AGGREGATOR, "legacy-unversioned");
  const policyRef = { artifact: policyArtifact.ref, pointer: "" };
  const built = analyses.map((analysis, a) => {
    const analysisArtifact = artifact(`b3d_analysis_${a}`, "FootageAnalysis", FootageAnalysisSchema.parse(analysis), "1.0.0");
    const synthetic = analysis.authorization.sourceType === "synthetic";
    const at = (pointer: string) => ({ artifact: analysisArtifact.ref, pointer });
    const producers = (index: number) => {
      const sourceEvidence = [at(`/candidates/${index}`), at("/authorization")];
      const featureProducer: Producer = { producerId: "footage_analyzer", producerVersion: FOOTAGE_VERSION, configuration: at("/configuration"),
        implementation: present(at("/embeddingImplementation")), sourceEvidence, mediaBasis: synthetic ? "synthetic" : "real_footage",
        computationBasis: analysis.configuration.embedding.mode === "stub" ? "synthetic_stub" : "cached_real_model", runEvidence: present([{ artifact: runArtifact.ref, pointer: "" }]) };
      return { featureProducer, adapter: { ...featureProducer, producerId: "editorial_adapter", producerVersion: "0.1.0", computationBasis: "deterministic" as const, configuration: policyRef } };
    };
    const base = [analysisArtifact, runArtifact, policyArtifact, implementationArtifact], map = new EditorialArtifactMap(base);
    const tokens = analysis.keptCandidateIds.map(candidateId => {
      const index = analysis.candidates.findIndex(c => c.candidate.candidateId === candidateId), p = producers(index);
      const token = resolveEditorialToken({ projectId: chainScope.projectId, candidate: analysis.candidates[index]!.candidate, analysis: analysisArtifact.ref,
        producingRun: { jobId: input.run.jobId, artifact: runArtifact.ref }, clipSegment: missing("unavailable", "clip_not_supplied"), featureProducer: p.featureProducer,
        adapter: p.adapter, aggregationImplementation: present({ artifact: implementationArtifact.ref, pointer: "" }) }, map);
      return { index, token, tokenArtifact: artifact(`b3d_token_${a}_${index}`, "EditorialToken", token) };
    });
    const media = artifact(`b3d_media_${a}`, "MediaAsset", { contractType: "MediaAsset", schemaVersion: "1.0.0", assetId: analysis.assetId, projectId: chainScope.projectId,
      creatorId: chainScope.creatorId, kind: "video", objectId: `source_${analysis.assetId}`, durationSeconds: analysis.metadata.durationSeconds,
      origin: synthetic ? "synthetic" : "creator_upload", retention: { expiresAt: input.retentionExpiresAt, deletionRequestedAt: null } }, "1.0.0");
    return { analysis, analysisArtifact, tokens, media, adapter: producers(0).adapter };
  });
  const allTokens = built.flatMap(b => b.tokens);
  const set = createEditorialCandidateSet({ ...envelope("EditorialCandidateSet"), projectId: chainScope.projectId,
    candidates: allTokens.map(t => ({ candidateId: t.token.candidate.candidateId, token: t.tokenArtifact.ref })),
    analysisRefs: built.map(b => b.analysisArtifact.ref), runRefs: [runArtifact.ref], selectionPolicy: policyRef,
    universe: "retained", sourceRunStatus: "succeeded", failureEvidence: [] });
  const setArtifact = artifact("b3d_candidate_set", "EditorialCandidateSet", set);
  const firstAnalysis = built[0]!.analysisArtifact.ref, analysisRefs = built.map(b => b.analysisArtifact.ref).sort(byText<ArtifactRef>(r => r.objectId));
  const channels = [{ channel: "source_index", state: "complete" as const, evidence: present({ artifact: firstAnalysis, pointer: "/metadata/frameTimes" }) }];
  const coverageArtifact = artifact("b3d_world_coverage", "WorldCoverageEvidence", { artifactType: "WorldCoverageEvidence", artifactVersion: "0.1.0", ...chainScope,
    sourceAnalysisRefs: analysisRefs, channels, producer: built[0]!.adapter });
  const initial = [runArtifact, policyArtifact, implementationArtifact, ...built.flatMap(b => [b.analysisArtifact, ...b.tokens.map(t => t.tokenArtifact), b.media]),
    setArtifact, coverageArtifact];
  const map = new EditorialArtifactMap(initial);
  const tokenLinks = allTokens.map(t => linkEditorialToken(t.tokenArtifact.ref, map, chainScope)).sort(byText(t => t.tokenId));
  const grounded = built.flatMap(b => b.tokens.map(t => ({ t, support: { assetId: b.analysis.assetId, sourceHash: b.analysis.contentHash, analysis: b.analysisArtifact.ref,
    shotId: t.token.candidate.shotId, range: t.token.candidate.sourceRange, rangeEvidence: { artifact: b.analysisArtifact.ref, pointer: `/candidates/${t.index}/candidate/sourceRange` },
    timebase: { artifact: b.analysisArtifact.ref, pointer: "/metadata/frameTimes" }, sample: missing("not_applicable", "range_support") } satisfies GroundedSupport })));
  const authorization = { artifact: firstAnalysis, pointer: "/authorization" };
  const world = createWorldSnapshot({ ...chainScope, authorization, revision: 0, parent: missing("not_applicable", "initial_snapshot"), asOf: input.times.world,
    mediaTruthRefs: analysisRefs, observed: [], derived: [],
    entities: grounded.map((g, i) => ({ entityId: entityId(i), authority: "MediaTruth" as const, kind: "source_range", artifact: g.support.analysis, support: present(g.support) })),
    relationships: [], perceptionBindings: [], tokenLinks,
    candidateLinks: grounded.map((g, i) => ({ candidateId: g.t.token.candidate.candidateId, token: g.t.tokenArtifact.ref, entityId: entityId(i) })).sort(byText(l => l.candidateId)),
    candidateSetRefs: [setArtifact.ref], coverage: { evidence: { artifact: coverageArtifact.ref, pointer: "" }, channels },
    changeSet: { evidence: authorization, added: [], superseded: [], invalidated: [], unchanged: [] }, builder: built[0]!.adapter }, new EditorialArtifactMap(initial));
  const worldArtifact = artifact("b3d_world", "ProjectWorldModel", world);
  const worldQuery = { worldId: world.worldId, ...chainScope, currentAuthorization: authorization, currentAccess: built.map(b => b.media.ref).sort(byText<ArtifactRef>(r => r.objectId)),
    accessAsOf: input.times.world, queryVersion: "0.1.0", authority: ["MediaTruth"], channels: ["source_index"], limit: Math.max(1, grounded.length), offset: 0 };
  const view = queryWorld(world, worldQuery, new EditorialArtifactMap([...initial, worldArtifact]));
  const viewArtifact = artifact("b3d_world_view", "ProjectWorldView", view);
  // ---------------------------------------------------------------- the Director request: selection only, no Director model ever runs
  const canonArtifacts = CANON_V0.slice(0, 2).map(e => artifact(`b3d_${e.entryKey}`, "CanonEntry", e));
  const canonView = createCanonView({ scope: chainScope, domain: "talking_head", selectionPolicy: "explicit_required_set", entries: canonArtifacts.map(item => item.ref) },
    new EditorialArtifactMap(canonArtifacts));
  const canonViewArtifact = artifact("b3d_canon_view", "CanonView", canonView);
  const intent = createIntentSpec({ ...envelope("IntentSpec"), scope: chainScope, revision: 0, parent: missing("not_applicable", "initial_intent"), author: owner,
    goal: "Deterministic verification input: the two declared clips in declared order.", domain: "talking_head", audience: "Owner verification review only",
    outputRequirements: [{ requirementId: "output_short", description: "A short two-clip verification output", priority: "hard" }],
    mustInclude: [{ requirementId: "include_subject", description: "Include both declared clips", priority: "hard" }], mustExclude: [] });
  const intentArtifact = artifact("b3d_intent", "IntentSpec", intent);
  const summary = createCandidateSummary({ ...envelope("DirectorCandidateSummary"), scope: chainScope, candidateSet: setArtifact.ref, worldSnapshot: worldArtifact.ref,
    worldView: viewArtifact.ref, coverage: "complete_declared_set", candidates: set.candidates, omittedCandidateIds: [], selectionPolicy: "explicit_supplied" },
    new EditorialArtifactMap([...initial, worldArtifact, viewArtifact]), world, view);
  const summaryArtifact = artifact("b3d_candidate_summary", "DirectorCandidateSummary", summary);
  const routingPolicy = artifact("b3d_routing_policy", "Evidence", { scope: chainScope, order: "cost_then_latency_then_profile_id", requireEstimates: true });
  const routingPolicyRef = { artifact: routingPolicy.ref, pointer: "" }, tier = "tier_deterministic_verification_input";
  const computeGrant = artifact("b3d_planning_compute_grant", "ComputeAuthorization", { version: "0.1.0", scope: chainScope, grant: "compute", qualityTier: tier,
    cpuMilliseconds: 1000, gpuMilliseconds: 0, peakRamBytes: 10000, peakVramBytes: 0, apiSpendInrMicros: 0, totalCostInrMicros: 1000, wallClockMilliseconds: 1000,
    modelCalls: 1, renderWork: { frames: 0, pixelFrames: 0, audioMilliseconds: 0 }, premiumOperations: [], retryLimit: 0, directorRevisionLimit: 0, reservationPolicy: routingPolicyRef });
  // A declared placeholder the Director request must name. It is selected and never executed: no model call, no model output.
  const target = { modelId: "no_director_model_verification_placeholder", exactRevision: H, adapterId: "no_director_adapter", adapterVersion: "0.1.0", implementationDigest: H,
    capability: "director_reasoning" };
  const evaluationGrant = artifact("b3d_evaluation_grant", "EvaluationAuthorization", { version: "0.1.0", scope: chainScope, grant: "model_capability_evaluation",
    qualityTier: tier, authorizedModels: [target] });
  const evaluation = artifact("b3d_evaluation", "ModelEvaluation", { version: "0.1.0", scope: chainScope, authorizationRef: evaluationGrant.ref, qualityTier: tier, eligibleModels: [target] });
  const quality = artifact("b3d_quality", "QualityRequirement", { version: "0.1.0", scope: chainScope, capability: "director_reasoning", qualityTier: tier, policy: routingPolicyRef });
  const availabilityEvidence = artifact("b3d_availability", "ModelAvailability", { version: "0.1.0", scope: chainScope, modelId: target.modelId, exactRevision: H,
    adapterId: target.adapterId, adapterVersion: target.adapterVersion, implementationDigest: H, available: true, observedAt: input.times.world });
  const availabilitySnapshot = artifact("b3d_availability_snapshot", "AvailabilitySnapshot", { version: "0.1.0", scope: chainScope, observedAt: input.times.world,
    profiles: [{ modelId: target.modelId, exactRevision: H, adapterId: target.adapterId, adapterVersion: target.adapterVersion, implementationDigest: H, available: true }] });
  // The accepted routing contract parses these placeholder records strictly; they describe a declared selection target that never executes.
  const revisionEvidence = artifact("b3d_revision_evidence", "Evidence", { revision: H });
  const resourceEvidence = artifact("b3d_resource_evidence", "Evidence", { scope: chainScope, cpuMilliseconds: 10, gpuMilliseconds: 0, peakRamBytes: 100, peakVramBytes: 0 });
  const licenseEvidence = artifact("b3d_license_evidence", "Evidence", { commercial: true });
  const contextEvidence = artifact("b3d_context_evidence", "Evidence", { maximumTokens: 100 });
  const routing = [routingPolicy, computeGrant, evaluationGrant, evaluation, quality, availabilityEvidence, availabilitySnapshot, revisionEvidence, resourceEvidence, licenseEvidence, contextEvidence];
  const computeBudget = budget({ version: "0.1.0", scope: chainScope, authorizationRef: computeGrant.ref, qualityTier: tier, cpuMilliseconds: 100, gpuMilliseconds: 0,
    peakRamBytes: 1000, peakVramBytes: 0, apiSpendInrMicros: 0, totalCostInrMicros: 100, wallClockMilliseconds: 100, modelCalls: 1,
    renderWork: { frames: 0, pixelFrames: 0, audioMilliseconds: 0 }, premiumOperations: [], retryLimit: 0, directorRevisionLimit: 0, childAllocations: [], reservationPolicy: routingPolicyRef }, routing);
  const budgetArtifact = artifact("b3d_planning_budget", "ComputeBudget", computeBudget);
  const modelProfile = profile({ version: "0.1.0", scope: chainScope, modelId: target.modelId, exactRevision: H, revisionEvidence: revisionEvidence.ref,
    adapter: { adapterId: target.adapterId, version: target.adapterVersion, implementationDigest: H }, capabilities: ["director_reasoning"], modalities: ["text"], deployment: "local",
    qualityTier: tier, qualityEvidence: present(evaluation.ref), contextLimits: { artifact: contextEvidence.ref, pointer: "" },
    expectedLatency: present({ value: 20, unit: "milliseconds", evidence: routingPolicyRef }), estimatedCost: present({ value: 30, unit: "inr_micros", evidence: routingPolicyRef }),
    resourceRequirements: { artifact: resourceEvidence.ref, pointer: "" }, licensing: { artifact: licenseEvidence.ref, pointer: "" }, commercialEligibility: present(true),
    availability: present({ artifact: availabilityEvidence.ref, pointer: "" }), observedAt: input.times.world }, routing);
  const profileArtifact = artifact("b3d_director_profile", "ModelProfile", modelProfile);
  const capability = artifact("b3d_director_capability", "DirectorCapabilitySnapshot", { ...envelope("DirectorCapabilitySnapshot"), scope: chainScope,
    capability: "director_reasoning", executionStatus: "selection_only_no_execution" });
  const preselection = { ...envelope("DirectorRequest"), scope: chainScope, intent: intentArtifact.ref, worldView: viewArtifact.ref, candidateSummaryView: summaryArtifact.ref,
    audioMusicView: missing("not_computed", "audio_not_supplied"), referenceGrammar: missing("not_computed", "reference_not_supplied"), canonView: canonViewArtifact.ref,
    editingDNA: missing("not_computed", "editing_dna_not_implemented"), computeBudget: budgetArtifact.ref, capabilitySnapshot: capability.ref, modelSelection: profileArtifact.ref,
    outputRequirements: { artifact: intentArtifact.ref, pointer: "/outputRequirements" }, priorDirection: missing("not_applicable", "initial_direction"),
    revisionScope: missing("not_applicable", "initial_direction") };
  const modelSelection = selectModel({ scope: chainScope, capability: "director_reasoning", qualityRequirement: { artifact: quality.ref, pointer: "" }, budget: computeBudget,
    budgetArtifact: budgetArtifact.ref, candidates: [{ profile: modelProfile, artifact: profileArtifact.ref }], evaluation: { artifact: evaluation.ref, pointer: "" },
    availabilitySnapshot: availabilitySnapshot.ref, policy: routingPolicyRef, fallbackEscalationPolicy: routingPolicyRef, inputViewDigest: directorSelectionInputDigest(preselection) },
    [...routing, budgetArtifact, profileArtifact]);
  const selectionArtifact = artifact("b3d_director_selection", "ModelSelection", modelSelection);
  const suppliedAll = [...initial, worldArtifact, viewArtifact, ...canonArtifacts, canonViewArtifact, intentArtifact, summaryArtifact, ...routing, budgetArtifact, profileArtifact,
    capability, selectionArtifact];
  const authority = { artifacts: suppliedAll, worldQuery };
  const request = createDirectorRequest({ ...preselection, modelSelection: selectionArtifact.ref }, authority);
  const requestArtifact = artifact("b3d_director_request", "DirectorRequest", request);
  suppliedAll.push(requestArtifact);
  // ---------------------------------------------------------------- deterministic verification direction: two ordered hard nodes and one typed cut
  const nodes = input.timeline.map((t, i) => {
    const binding = set.candidates.find(c => c.candidateId === t.candidateId);
    if (binding === undefined) refuse("candidate_not_retained", [`${t.entryId}: ${t.candidateId}`]);
    const b = built.find(x => x.analysis.assetId === t.analysis.assetId)!, index = b.tokens.find(x => x.token.candidate.candidateId === t.candidateId)!.index;
    return { nodeId: `node_timeline_${i}`, intent: { kind: "story_beat" as const, role: i === 0 ? "hook" as const : "build" as const,
      description: `Deterministic verification input: timeline position ${i + 1}, owner entry ${t.entryId}.` }, priority: "hard" as const,
      scope: { kind: "candidate" as const, candidate: binding }, candidates: [binding], evidenceRefs: [{ artifact: b.analysisArtifact.ref, pointer: `/candidates/${index}` }],
      canonEntryKeys: ["narrative_arc"], hypotheses: [], requirementIds: ["include_subject", "output_short"],
      uncertainty: { state: "unknown" as const, reasonCode: VERIFICATION_INPUT, evidenceRefs: [] } };
  });
  const cutNode = { ...nodes[0]!, nodeId: "node_cut", intent: { kind: "transition_intention" as const, relation: "clear_change" as const,
    description: "Deterministic verification input: a hard cut between the two clips." }, scope: { kind: "whole_edit" as const }, candidates: [], requirementIds: [] };
  const directionBody = { ...envelope("CreativeDirectionGraph"), scope: chainScope, request: requestArtifact.ref, worldSnapshot: worldArtifact.ref, candidateUniverse: setArtifact.ref,
    revision: 0, parent: missing("not_applicable", "initial_direction"), nodes: [...nodes, cutNode],
    edges: [{ edgeId: "edge_order_00", type: "intended_order" as const, from: nodes[0]!.nodeId, to: nodes[1]!.nodeId }],
    constraints: [], alternatives: [], hypotheses: [], unresolvedRequirements: [] };
  const direction = createCreativeDirectionGraph(directionBody, requestArtifact.ref, authority);
  const directionArtifact = artifact("b3d_direction", "CreativeDirectionGraph", direction);
  suppliedAll.push(directionArtifact);
  const grounding = createDirectorGroundingReport(requestArtifact.ref, present(directionArtifact.ref), authority);
  const groundingArtifact = artifact("b3d_grounding", "DirectorGroundingReport", grounding);
  suppliedAll.push(groundingArtifact);
  // `synthetic_test` names the direction's basis: typed verification input produced for this test, not a model's or an editor's creative choice.
  const producerRun = createDirectorProducerRun({ ...envelope("DirectorProducerRun"), scope: chainScope, request: requestArtifact.ref, selection: selectionArtifact.ref,
    groundingReport: groundingArtifact.ref, direction: present(directionArtifact.ref), outcome: "succeeded", failure: missing("not_applicable", "no_failure"), basis: "synthetic_test",
    evidenceRefs: [] });
  const producerArtifact = artifact("b3d_director_producer", "DirectorProducerRun", producerRun);
  suppliedAll.push(producerArtifact);
  createDirectorResult({ outcome: "succeeded", direction: present(directionArtifact.ref), unresolvedRequirements: [],
    uncertainty: { state: "unknown", reasonCode: VERIFICATION_INPUT, evidenceRefs: [] }, failure: missing("not_applicable", "no_failure") },
    { request: requestArtifact.ref, producerRun: producerArtifact.ref, groundingReport: groundingArtifact.ref, modelRun: missing("not_applicable", "no_director_model_run"),
      costTrace: missing("not_applicable", "no_truthful_director_telemetry_operation") }, authority);
  // ---------------------------------------------------------------- Gate 5: bounds that admit exactly the ordered full-range sequence
  const durations = input.timeline.map(t => { const r = t.analysis.candidates.find(c => c.candidate.candidateId === t.candidateId)!.candidate.sourceRange;
    return r.endSeconds - r.startSeconds; });
  // Planning sums use durations in this exact order from zero, so these bounds are the planner's own floating values.
  const total = durations.reduce((sum, d) => sum + d, 0);
  const planningPolicy = createPlanningPolicy({ ...envelope("PlanningPolicy"), scope: chainScope, author: owner,
    retrieval: { method: "exact_direction_bindings_v0", maxCandidatesPerNode: 8 },
    boundary: { method: "candidate_and_sample_pts_v0", maxEvidencePoints: 8, maxOptionsPerCandidate: 1 },
    duration: { minimumSeconds: total, maximumSeconds: total, preferredSeconds: total },
    trim: { minimumSeconds: Math.min(...durations), maximumSeconds: Math.max(...durations) },
    search: { algorithm: "bounded_beam_v0", maximumDepth: 2, frontierWidth: 8, maximumExpandedStates: 128, maximumOptionsRetained: 16, manifestLimit: 128 },
    reuse: { maximumUsesPerCandidate: 1, precedingUsePolicy: "count_for_reuse_and_repetition" },
    objectives: [{ name: "direction_coverage", definitionVersion: "0.1.0", preference: "higher", missing: "block" },
      { name: "duration_deviation", definitionVersion: "0.1.0", preference: "lower", missing: "block" },
      { name: "repetition_count", definitionVersion: "0.1.0", preference: "lower", missing: "block" }],
    scoring: "lexicographic_components_v0", tie: { epsilon: 0, policy: "retain_all_within_component_epsilon" },
    seed: { kind: "deterministic", policyVersion: "0.1.0", ordering: "canonical_ids" }, stopping: "declared_bounds_or_empty_frontier",
    requirementSemantics: "structural_node_coverage_only", executionAssessment: "deferred" });
  const planningPolicyArtifact = artifact(planningPolicy.policyId, "PlanningPolicy", planningPolicy);
  const planningArtifacts = [...suppliedAll, planningPolicyArtifact];
  const context = createPlanningContext({ ...envelope("PlanningContext"), scope: chainScope, direction: directionArtifact.ref, directorRequest: requestArtifact.ref,
    worldSnapshot: worldArtifact.ref, worldView: viewArtifact.ref, worldQuery, candidateUniverse: setArtifact.ref, candidates: set.candidates, policy: planningPolicyArtifact.ref,
    computeBudget: budgetArtifact.ref, previousDecisions: [], precedingUses: [] }, planningArtifacts);
  const contextArtifact = artifact(context.contextId, "PlanningContext", context);
  planningArtifacts.push(contextArtifact);
  const run = runPlanning(contextArtifact.ref, planningArtifacts);
  const planned = [...planningArtifacts, ...run.artifacts];
  const decisionRef = run.artifacts.find(a => a.ref.artifactType === "PlanningDecision")!.ref;
  const outcome = run.decision.outcome;
  if (outcome.kind !== "chosen") refuse("planning_not_chosen", [`Gate 5 did not choose the declared sequence (${outcome.kind}).`]);
  const option = run.manifest.options.find(e => e.option.optionId === outcome.optionId)!.option;
  const obligation = run.manifest.deferredObligations.find(o => o.nodeId === "node_cut");
  if (obligation === undefined || option.uses.length !== 2) refuse("planning_not_chosen", ["The chosen sequence is not the two declared clips with one cut obligation."]);
  // ---------------------------------------------------------------- Gate 6: owner profile, policy, attributed capability claims and the typed cut
  const evidence = chainEvidence(chainScope);
  const claims = (observedAt: string) => {
    const available = (supports: ReturnType<typeof member | typeof atMost>[]) => ({ state: "available", supports, licensing: { eligiblePurposes: [PURPOSE] },
      conformance: { meaning: "every_declared_support_passed_attested_checks", evidence: [{ artifact: evidence.conformance.ref, pointer: "" }] },
      configuration: { meaning: "executor_configured_in_environment", evidence: [{ artifact: evidence.configuration.ref, pointer: "" }] },
      resources: { meaning: "required_resources_present_at_observation", evidence: [{ artifact: evidence.resources.ref, pointer: "" }] } });
    const declared: [string, ReturnType<typeof member | typeof atMost>[]][] = [["timeline_video_clip", REAL_SUPPORTS(plan)],
      ["timeline_source_audio", [member("audio_linkage", "linked_identity"), atMost("clip_count", RENDER_SEMANTICS.bounds.maxClips)]],
      ["transition_cut", [member("transition_kind", "cut"), atMost("join_count", RENDER_SEMANTICS.bounds.maxClips - 1)]]];
    const attestations = declared.map(([capabilityId, supports]) => {
      const value = createCapabilityAttestation({ ...envelope("CapabilityAttestation"), scope: chainScope, environment: RENDER_ENVIRONMENT.environmentId, observedAt,
        executor: RENDER_EXECUTOR, capabilityId, attester: owner, basis: "attester_supplied_check_results_no_probe", outcome: available(supports) });
      return supplied(value, value.attestationId);
    });
    const snapshot = createCapabilitySnapshot({ ...envelope("CapabilitySnapshot"), scope: chainScope, environment: RENDER_ENVIRONMENT.environmentId, asOf: observedAt,
      observation: "supplied_evidence_no_probe", executors: [{ ...RENDER_EXECUTOR, declarations: declared.map(([capabilityId], i) => ({ capabilityId, attestation: attestations[i]!.ref })) }] });
    return { snapshot, snapshotArtifact: supplied(snapshot, snapshot.snapshotId), attestations };
  };
  const capabilityClaims = claims(input.times.capability);
  const outputProfile = createEditOutputProfile({ ...envelope("EditOutputProfile"), scope: chainScope, author: owner, aspectRatio: plan.aspect, resolution: plan.resolution,
    frameRate: plan.frameRate, clock: { ticksPerSecond: plan.ticksPerSecond } });
  const graphPolicy = createEditGraphPolicy({ ...envelope("EditGraphPolicy"), scope: chainScope, author: owner, construction: "chosen_gate5_sequence_v0",
    placement: "contiguous_cuts_from_zero_v0", timeMapping: "constant_speed_identity_v0", framing: "source_display_aspect_must_equal_output_v0", sourceAudio: input.sourceAudio,
    obligationRelaxation: "none_fail_closed_v0", deferredCheckVerification: "none_fail_closed_v0", executability: "single_executor_all_requirements_available_v0" });
  const cut = createTechniqueResolution({ ...envelope("TechniqueResolution"), scope: chainScope, author: owner, planningDecision: decisionRef, direction: run.decision.direction,
    obligation: { nodeId: "node_cut", directionNode: obligation.directionNode }, intentionKind: "transition_intention",
    operation: { primitive: "cut_transition", join: { fromUseId: option.uses[0]!.useId, toUseId: option.uses[1]!.useId } }, rules: "typed_intention_exact_v0" });
  const profileArtifact2 = supplied(outputProfile, outputProfile.profileId), graphPolicyArtifact = supplied(graphPolicy, graphPolicy.policyId), cutArtifact = supplied(cut, cut.resolutionId);
  const graphArtifacts = [...planned, evidence.conformance, evidence.configuration, evidence.resources, profileArtifact2, graphPolicyArtifact, capabilityClaims.snapshotArtifact,
    ...capabilityClaims.attestations, cutArtifact];
  const graph = buildEditGraph({ planningDecision: decisionRef, policy: graphPolicyArtifact.ref, outputProfile: profileArtifact2.ref, techniqueResolutions: [cutArtifact.ref],
    capabilitySnapshot: capabilityClaims.snapshotArtifact.ref }, graphArtifacts);
  const graphArtifact = supplied(graph, graph.editGraphId);
  const mediaAssets = new Map(built.map(b => [b.analysis.assetId, b.media]));
  return { scope: chainScope, graph, graphArtifact, artifacts: [...graphArtifacts, graphArtifact], profile: outputProfile, mediaAssets, claims, evidence,
    analyses: built.map(b => ({ assetId: b.analysis.assetId, analysis: b.analysisArtifact.ref, media: b.media.ref })), candidateSet: setArtifact.ref, direction: directionArtifact.ref,
    planningDecision: decisionRef, retained };
}

/** The shape the accepted execution builders read: a graph (any revision) and every artifact it needs, over the root chain. */
export interface GraphChain { root: RealChain; graph: AnyEditGraph; graphArtifact: SuppliedArtifact; artifacts: SuppliedArtifact[] }
export const rootGraphChain = (root: RealChain): GraphChain => ({ root, graph: root.graph, graphArtifact: root.graphArtifact, artifacts: root.artifacts });
/** A child revision over the root chain: the parent's artifacts plus the child's own lineage (GraphDiff, plan, request, intent, parent graph). */
export function revisionGraphChain(parent: GraphChain, child: AnyEditGraph, extra: readonly SuppliedArtifact[]): GraphChain {
  const graphArtifact = supplied(child, child.editGraphId), known = new Set(parent.artifacts.map(a => a.ref.objectId));
  const added = [...extra, graphArtifact].filter(a => { if (known.has(a.ref.objectId)) return false; known.add(a.ref.objectId); return true; });
  return { root: parent.root, graph: child, graphArtifact, artifacts: [...parent.artifacts, ...added] };
}

// ================================================================ Gate 7 Batch 1: admission and ExecutionDag over verified real bytes
export interface VerifiedSource { assetId: string; contentHash: string; sizeBytes: number; checkedAt: string }
export interface ExecutionInput {
  owner: { kind: "owner"; actorId: string };
  /** The owner's explicit render authorization, as an Evidence record every media grant cites. */
  authorityEvidence: SuppliedArtifact;
  /** Who hashed the full source bytes (the owner-local authority), and the per-source Evidence of that verification. */
  resolver: { resolverId: string; version: string; implementationDigest: string };
  verified: readonly VerifiedSource[];
  verificationEvidence: ReadonlyMap<string, SuppliedArtifact>;
  renderIntents: RenderIntent[];
  mediaGrantExpiresAt: string | null;
  /** Instants of the trusted runtime clock, in order: media grants <= receipts <= capability <= estimate <= grant issued <= admitted. */
  times: { mediaGrant: string; capability: string; estimate: string; issued: string; admitted: string; expires: string };
  attempt: number; prefix: string;
}
const EXECUTION_LIMITS = { cpuMilliseconds: 3_600_000, gpuMilliseconds: 0, peakRamBytes: 16_000_000_000, peakVramBytes: 0, apiSpendInrMicros: 0,
  totalCostInrMicros: 1_000_000, wallClockMilliseconds: 3_600_000, modelCalls: 0, renderWork: { frames: 100_000, pixelFrames: 1_000_000_000_000, audioMilliseconds: 3_600_000 } };
const ESTIMATE = { cpuMilliseconds: 600_000, gpuMilliseconds: 0, peakRamBytes: 4_000_000_000, peakVramBytes: 0, wallClockMilliseconds: 600_000, apiSpendInrMicros: 0, totalCostInrMicros: 5_000 };
export const OPERATION = "operation_render_batch3d_real_footage";
/** Admission and ExecutionDag for one render attempt of `chain.graph`, naming the real V0 executor, the pinned runtime and the local environment. */
export function buildExecution(chain: GraphChain, x: ExecutionInput) {
  const scope = chain.root.scope, owner = x.owner, intent: RenderIntent = "final";
  const evidenceRef = (item: SuppliedArtifact) => ({ artifact: item.ref, pointer: "" });
  const e = (objectId: string, basis: string) => artifact(`${x.prefix}_${objectId}`, "Evidence", { scope, basis });
  const estimateBasis = e("estimate_basis", "owner_run_attributed_estimate_not_measured"), reservationPolicy = e("reservation_policy", "gate7_execution_reservation_policy");
  const runtimeConformance = e("runtime_conformance", "declared_runtime_encoding_claim_not_measured_pinned_runtime_probe_verifies_at_execution");
  const runtimeConfiguration = e("runtime_configuration", "declared_runtime_configuration_not_measured_pinned_runtime_probe_verifies_at_execution");
  const policy = createExecutionPolicy({ ...envelope("ExecutionPolicy"), scope, author: owner, admission: "single_selected_executor_fresh_evidence_v0",
    sourceRecheck: "per_unique_source_full_byte_hash_and_current_lifecycle_v0", frameConformance: "exact_output_frame_grid_all_intents_v0",
    workload: "derived_render_work_plus_attributed_estimate_v0", budget: "separate_execution_budget_replayed_reservation_v0", dag: "provider_neutral_typed_nodes_v0",
    freshness: { maxSourceReceiptAgeMilliseconds: 900_000, maxCapabilityEvidenceAgeMilliseconds: 1_800_000 } });
  const policyArtifact = supplied(policy, policy.policyId);
  const renderProfile = createExecutionRenderProfile({ ...envelope("ExecutionRenderProfile"), scope, author: owner, intent, resolution: chain.graph.output.resolution,
    frameRate: chain.graph.output.frameRate, video: { codecFamily: "h264", pixelFormat: "yuv420p", encodingProfile: "deterministic_constant_quality_v0" },
    audio: { policy: "graph_linked_source_audio_v0", codecFamily: "aac", sampleRateHz: LINKED_AUDIO_SAMPLE_RATE, channelLayout: "stereo" } });
  const renderProfileArtifact = supplied(renderProfile, renderProfile.renderProfileId);
  const fresh = chain.root.claims(x.times.capability);
  const sources = graphSourcesOf(chain);
  const mediaGrants = sources.map(source => {
    const value = createExecutionMediaGrant({ ...envelope("ExecutionMediaGrant"), scope, grant: "render_authorized_source_media_v0",
      source: { assetId: source.assetId, contentHash: source.contentHash }, renderIntents: x.renderIntents,
      authority: { actor: owner, evidence: [evidenceRef(x.authorityEvidence)] }, issuedAt: x.times.mediaGrant, expiresAt: x.mediaGrantExpiresAt });
    return supplied(value, value.grantId);
  });
  const receipts = sources.map((source, i) => {
    const verified = x.verified.find(v => v.assetId === source.assetId), evidence = x.verificationEvidence.get(source.assetId);
    if (verified === undefined || evidence === undefined) refuse("source_not_verified", [`${source.assetId} has no full-byte verification.`]);
    const value = createSourceAccessReceipt({ ...envelope("SourceAccessReceipt"), scope, editGraph: chain.graphArtifact.ref, renderIntent: intent,
      source: { assetId: source.assetId, mediaAsset: source.mediaAsset.ref, analysis: source.analysis }, mediaGrant: mediaGrants[i]!.ref,
      expected: { contentHash: source.contentHash, sizeBytes: source.sizeBytes },
      observed: { contentHash: verified.contentHash, sizeBytes: verified.sizeBytes, hashScope: "full_source_bytes" }, checkedAt: verified.checkedAt, resolver: x.resolver,
      attester: owner, basis: "runtime_resolver_supplied_full_byte_hash_no_core_io", evidence: [evidenceRef(evidence)] });
    return supplied(value, value.receiptId);
  });
  const limits = { version: "0.1.0", scope, qualityTier: "tier_owner_local_verification", premiumOperations: [], directorRevisionLimit: 0, reservationPolicy: evidenceRef(reservationPolicy) };
  const authorization = artifact(`${x.prefix}_execution_compute_grant`, "ComputeAuthorization", { ...limits, grant: "compute", ...EXECUTION_LIMITS, retryLimit: 1 });
  const base = [authorization, reservationPolicy];
  const allocationValue = budget({ ...limits, authorizationRef: authorization.ref, ...EXECUTION_LIMITS, retryLimit: 0, childAllocations: [] }, base);
  const allocation = artifact(`${x.prefix}_allocation_0`, "ComputeBudget", allocationValue);
  const parentValue = budget({ ...limits, authorizationRef: authorization.ref, ...EXECUTION_LIMITS, retryLimit: 0, childAllocations: [allocation.ref] }, [...base, allocation]);
  const parentBudget = artifact(`${x.prefix}_execution_budget`, "ComputeBudget", parentValue);
  const history = artifact(`${x.prefix}_reservation_history`, "ReservationHistory", { version: "0.1.0", scope, budgetRef: parentBudget.ref, prior: [] });
  const routing = [...base, allocation, parentBudget, history];
  const reservation = reserve({ scope, budget: parentValue, budgetArtifact: parentBudget.ref, allocation: allocationValue, allocationArtifact: allocation.ref, historyArtifact: history.ref,
    operationId: OPERATION, attempt: x.attempt }, routing);
  const reservationArtifact = artifact(`${x.prefix}_reservation`, "Reservation", reservation);
  const runtime = createExecutionRuntimeAttestation({ ...envelope("ExecutionRuntimeAttestation"), scope, environment: RENDER_ENVIRONMENT.environmentId, observedAt: x.times.capability,
    executor: RENDER_EXECUTOR, runtime: PINNED_MEDIA_RUNTIME.runtimeIdentity, encoding: { video: renderProfile.video, audio: renderProfile.audio }, attester: owner,
    basis: "attester_supplied_runtime_check_results_no_probe", outcome: { state: "available", licensing: { eligiblePurposes: [PURPOSE] },
      conformance: { meaning: "attested_encoding_matches_declared_semantics", evidence: [evidenceRef(runtimeConformance)] },
      configuration: { meaning: "runtime_configured_in_environment", evidence: [evidenceRef(runtimeConfiguration)] } } });
  const runtimeArtifact = supplied(runtime, runtime.attestationId);
  const estimate = createExecutionWorkEstimate({ ...envelope("ExecutionWorkEstimate"), scope, editGraph: chain.graphArtifact.ref, executor: RENDER_EXECUTOR, runtime: runtime.runtime,
    environment: RENDER_ENVIRONMENT.environmentId, renderProfile: renderProfileArtifact.ref, renderIntent: intent, policy: policyArtifact.ref,
    sources: sources.map(s => ({ assetId: s.assetId, contentHash: s.contentHash })), estimate: ESTIMATE, estimator: owner, basis: "attributed_estimate_not_measured",
    estimatedAt: x.times.estimate, evidence: [evidenceRef(estimateBasis)] });
  const estimateArtifact = supplied(estimate, estimate.estimateId);
  const grant = createExecutionGrant({ ...envelope("ExecutionGrant"), scope, editGraph: chain.graphArtifact.ref, graph: { editGraphId: chain.graph.editGraphId, revision: chain.graph.revision },
    executor: RENDER_EXECUTOR, environment: RENDER_ENVIRONMENT.environmentId, renderIntent: intent, renderProfile: renderProfileArtifact.ref, policy: policyArtifact.ref,
    capabilitySnapshot: fresh.snapshotArtifact.ref, runtimeAttestation: runtimeArtifact.ref,
    budget: { executionBudget: parentBudget.ref, allocation: allocation.ref, reservation: reservationArtifact.ref, meaning: "gate7_execution_budget_not_planning_budget" },
    mediaGrants: mediaGrants.map(a => a.ref), sourceReceipts: receipts.map(a => a.ref), workEstimate: estimateArtifact.ref, operationId: OPERATION, attempt: x.attempt,
    issuedAt: x.times.issued, expiresAt: x.times.expires, authorizer: owner, basis: "explicit_owner_or_operator_execution_authorization_v0" });
  const grantArtifact = supplied(grant, grant.grantId);
  const known = new Set<string>(), artifacts: SuppliedArtifact[] = [];
  for (const item of [...chain.artifacts, x.authorityEvidence, ...x.verificationEvidence.values(), estimateBasis, reservationPolicy, runtimeConformance, runtimeConfiguration,
    ...fresh.attestations, fresh.snapshotArtifact, policyArtifact, renderProfileArtifact, ...mediaGrants, ...receipts, ...routing, reservationArtifact, runtimeArtifact, estimateArtifact,
    grantArtifact]) if (!known.has(item.ref.objectId)) { known.add(item.ref.objectId); artifacts.push(item); }
  const admission = admitExecution({ executionGrant: grantArtifact.ref, admittedAt: x.times.admitted }, artifacts), admissionArtifact = supplied(admission, admission.admissionId);
  artifacts.push(admissionArtifact);
  const dag = buildExecutionDag({ admission: admissionArtifact.ref }, artifacts), dagArtifact = supplied(dag, dag.dagId);
  artifacts.push(dagArtifact);
  return { chain, admission, dag, dagArtifact, artifacts, reservation, grant };
}
export type RealExecution = ReturnType<typeof buildExecution>;
/** The unique admitted sources of a graph, with the pinned MediaAsset and analysis each clip use names. */
function graphSourcesOf(chain: GraphChain) {
  const byAsset = new Map<string, { assetId: string; contentHash: string; sizeBytes: number; analysis: ArtifactRef; mediaAsset: SuppliedArtifact }>();
  for (const clip of chain.graph.clipUses) {
    if (clip.medium !== "video" || byAsset.has(clip.source.assetId)) continue;
    const analysis = chain.artifacts.find(a => a.ref.objectId === clip.source.analysis.objectId)!.value as { authorization: { sizeBytes: number } };
    byAsset.set(clip.source.assetId, { assetId: clip.source.assetId, contentHash: clip.source.sourceHash, sizeBytes: analysis.authorization.sizeBytes,
      analysis: clip.source.analysis, mediaAsset: chain.root.mediaAssets.get(clip.source.assetId)! });
  }
  return [...byAsset.values()].sort((a, b) => a.assetId < b.assetId ? -1 : a.assetId > b.assetId ? 1 : 0);
}

// ================================================================ deterministic verification requests (typed; no language model interprets anything)
/** The interpreter identity every request of this harness names: a deterministic rule returning the harness's own typed action. */
export const VERIFICATION_INTERPRETER = { implementationId: "batch3d_deterministic_verification_interpreter", version: "0.1.0", basis: "deterministic_fixture" as const };
export function verificationRequest(c: E.CurrentEditingContext, requestKey: string, text: string, target: E.EditorialTarget,
  allowedScope: E.EditorialRequest["allowedScope"] = null): E.EditorialRequest {
  return E.createEditorialRequest({ scope: c.head.scope, requestKey, rawUserText: `${text} (deterministic verification input)`, baseHead: E.headRef(c.head),
    baseGraph: c.head.currentGraph, baseState: c.head.currentState, selectedTarget: target,
    referencedRevision: target.graph.artifact.objectId === c.graph.editGraphId ? null : target.graph, allowedScope });
}
/** The i-th video clip use of the current graph, in output order. */
export function videoClip(c: E.CurrentEditingContext, i: number) {
  const clip = c.graph.clipUses.filter(u => u.medium === "video")[i];
  if (clip === undefined || clip.medium !== "video") refuse("timeline_clip_missing", [`No video clip use at position ${i}.`]);
  return clip;
}
/**
 * A request to trim about half a second from the end of the clip at `position`, scoped to exactly that clip, with its exact keep range.
 * Position 1 is the unlocked clip the harness revises; position 0 is the locked clip, whose trim must be refused.
 */
export function trimRequest(c: E.CurrentEditingContext, requestKey: string, plan: OutputPlan, position: 0 | 1 = 1, fewerThan?: number) {
  const clip = videoClip(c, position), target = E.targetOf(c.graph, clip.clipUseId);
  const analysis = FootageAnalysisSchema.parse(c.artifacts.find(a => a.ref.objectId === clip.source.analysis.objectId && a.ref.sha256 === clip.source.analysis.sha256)?.value);
  const trim = trimKeep(clip, analysis.metadata.frameTimes.length, plan, fewerThan);
  const allowedScope = { graph: c.head.currentGraph, clipUseIds: [clip.clipUseId], interval: target.interval, ticksPerSecond: c.graph.output.clock.ticksPerSecond };
  const amount = fewerThan === undefined ? "about half a second" : "a little less than half a second";
  const request = verificationRequest(c, requestKey, `Trim ${amount} from the end of the ${position === 0 ? "first" : "second"} shot.`, target, allowedScope);
  const action: E.IntentAction = { kind: "request_edit", target, operation: "trim_clip_source_range", keep: trim.keep };
  return { request, action, trim, clipUseId: clip.clipUseId };
}
/** The identity fields of one rendered revision as the runner holds it: its validated DAG, its render receipt and its technical QC. */
interface RevisionDag { dag: { dagId: string; graph: { editGraphId: string; revision: number }; renderIdentity: { renderComputationId: string } } }
interface RevisionReceipt { receiptId: string; renderComputationId: string; dag: { dagId: string }; editGraph: { editGraphId: string; revision: number } }
interface RevisionQc { verdict: string; execution: { receiptId: string; renderComputationId: string; dagId: string } }
/**
 * The parent execution for authorizing the next revision (R02-D). The current EditingHead's graph, the parent DAG's graph, the prior render
 * receipt and the prior passing QC must all name one exact graph and revision. After a publication that is the published child, never the
 * revision-0 baseline (the first R02 run passed the baseline DAG, and production refused it as impact_input_invalid). Anything else refuses
 * before authorization.
 */
export function revisionParent<V extends RevisionDag, Rc extends RevisionReceipt, Q extends RevisionQc>(
  current: { graph: { editGraphId: string; revision: number }; head: { currentGraph: { artifact: { objectId: string }; revision: number } } },
  parent: { v: V; receipt: Rc; qc: Q }): { parentDag: V; prior: { receipt: Rc; qc: Q } } {
  const g = current.graph, h = current.head.currentGraph, d = parent.v.dag, r = parent.receipt, q = parent.qc, reasons: string[] = [];
  if (h.artifact.objectId !== g.editGraphId || h.revision !== g.revision) reasons.push("the current context is not the current head's graph");
  if (d.graph.editGraphId !== g.editGraphId || d.graph.revision !== g.revision) {
    reasons.push(`the parent DAG is of revision ${d.graph.revision} (${d.graph.editGraphId}); the current head is on revision ${g.revision} (${g.editGraphId})`);
  }
  if (r.dag.dagId !== d.dagId || r.renderComputationId !== d.renderIdentity.renderComputationId || r.editGraph.editGraphId !== d.graph.editGraphId
    || r.editGraph.revision !== d.graph.revision) reasons.push("the prior render receipt is not of the parent DAG");
  if (q.verdict !== "pass" || q.execution.receiptId !== r.receiptId || q.execution.dagId !== d.dagId || q.execution.renderComputationId !== r.renderComputationId) {
    reasons.push("the prior QC is not a pass of the prior render receipt");
  }
  if (reasons.length > 0) refuse("revision_parent_mismatch", reasons);
  return { parentDag: parent.v, prior: { receipt: parent.receipt, qc: parent.qc } };
}
/**
 * The identities of one proposed revision (R02-E). The GraphDiff, child graph, DAG and render computation identities change with the request
 * and the attempt (the render computation binds the graph, admission and grant). The exact replacement, the changed segment's computation
 * and the output frame count identify the edit itself.
 */
export function revisionIdentity(proposed: { diff: { graphDiffId: string; operations: readonly unknown[] }; child: { editGraphId: string; revision: number } },
  dag: { dagId: string; renderIdentity: { renderComputationId: string } }, program: { segments: readonly { segmentComputationId: string; video: { frames: number } }[] }) {
  return { graphDiffId: proposed.diff.graphDiffId, replacement: JSON.stringify(proposed.diff.operations), childEditGraphId: proposed.child.editGraphId,
    childRevision: proposed.child.revision, dagId: dag.dagId, renderComputationId: dag.renderIdentity.renderComputationId,
    segmentComputationIds: program.segments.map(s => s.segmentComputationId), outputFrames: program.segments.reduce((n, s) => n + s.video.frames, 0) };
}
export type RevisionIdentity = ReturnType<typeof revisionIdentity>;
/**
 * Why the QC-failure child is not a distinct edit from the published trim, or nothing when it is (R02-E). Every identity must differ, and
 * the locked first segment must stay reusable from the parent for both. Different output frame counts mean the output bytes, and so their
 * content identities, can never collide.
 */
export function distinctRevisionRefusal(attempt: RevisionIdentity, trim: RevisionIdentity, parent: { segments: readonly { segmentComputationId: string }[] }): string[] {
  const reasons: string[] = [], locked = parent.segments[0]?.segmentComputationId;
  if (attempt.graphDiffId === trim.graphDiffId) reasons.push("same GraphDiff");
  if (attempt.replacement === trim.replacement) reasons.push("same exact replacement");
  if (attempt.childEditGraphId === trim.childEditGraphId) reasons.push("same child EditGraph");
  if (attempt.dagId === trim.dagId) reasons.push("same child DAG");
  if (attempt.renderComputationId === trim.renderComputationId) reasons.push("same render computation");
  if (attempt.segmentComputationIds[1] === trim.segmentComputationIds[1]) reasons.push("same changed segment computation");
  if (attempt.outputFrames === trim.outputFrames) reasons.push("same output frame count");
  if (attempt.segmentComputationIds[0] !== locked || trim.segmentComputationIds[0] !== locked) reasons.push("locked segment not reusable");
  return reasons;
}
/** Evidence records of this harness, content-addressed like every accepted fixture record. */
export const artifactOf = artifact;
/** The source resolver every source receipt names: the owner-local authority re-hashed the full declared bytes. */
export const OWNER_RESOLVER = { resolverId: OWNER_MEDIA_AUTHORITY.observerId, version: OWNER_MEDIA_AUTHORITY.version, implementationDigest: OWNER_MEDIA_AUTHORITY_DIGEST };

// ================================================================ owner policies for the run
/** The owner's real-execution policy for this harness: the accepted bounds, with windows sized for full re-verification of real sources. */
export function realExecutionPolicyFor(scope: object, owner: { kind: "owner"; actorId: string }) {
  return createRealExecutionPolicy({ ...envelope("RealExecutionPolicy"), scope, author: owner,
    freshness: { maxRuntimeProbeAgeMilliseconds: 60_000, maxCapabilityProbeAgeMilliseconds: 60_000, maxLifecycleObservationAgeMilliseconds: 60_000,
      maxInputConformanceAgeMilliseconds: 60_000 },
    permitLifetimeMilliseconds: 10_000, process: { maxWallClockMilliseconds: 600_000 }, output: { maxOutputBytes: 1_073_741_824 } });
}
/** The owner's review policy, with windows sized so every planned decode stays inside the accepted decoded-output bound at this output size. */
export function reviewPolicyFor(scope: object, owner: { kind: "owner"; actorId: string }, resolution: { width: number; height: number }) {
  const perWindow = Math.floor(REVIEW_HARD_LIMITS.maxDecodeOutputBytes / yuv420pFrameBytes(resolution.width, resolution.height));
  if (perWindow < 2) refuse("review_window_unrepresentable", ["The output frame is too large for the accepted observation decode bound."]);
  return createReviewPolicy({ scope, author: owner,
    windows: { boundaryHalfWindowFrames: Math.min(15, Math.floor(perWindow / 2)), globalWindowFrames: Math.min(30, perWindow), interiorSamples: 3 },
    budget: { maxObservations: 16, maxDeliveredFrames: 128, maxDecodedPixelFrames: REVIEW_HARD_LIMITS.maxDecodedPixelFrames, maxEvidenceBytes: REVIEW_HARD_LIMITS.maxEvidenceBytes,
      maxFindings: 32, maxExplanationCharacters: 400, maxReviewAttempts: 2, maxTranscriptCharacters: 16_384, maxDecodeMilliseconds: REVIEW_HARD_LIMITS.maxDecodeMilliseconds } });
}

// ================================================================ the bounded deterministic receipt
export const STATUSES = ["PASS", "FAIL", "NOT_EXERCISED", "UNAVAILABLE"] as const;
export const Status = z.enum(STATUSES);
export const SCENARIOS = ["manifest_and_source_verification", "source_admissibility", "baseline_render", "baseline_technical_qc", "baseline_observation",
  "critic_execution", "editing_head_initialization", "state_only_lock", "render_failure_atomicity", "qc_failure_atomicity", "cas_loser_refused",
  "trim_revision_published", "localized_reuse", "locked_target_refusal", "historical_preference_state_only", "stale_request_refusal"] as const;
const Id = z.string().min(1).max(160), Hash = z.string().regex(/^[a-f0-9]{64}$/);
const Ref = z.strictObject({ objectId: Id, artifactType: Id, artifactVersion: z.string().max(40), sha256: Hash });
const Scenario = z.strictObject({ status: Status, detail: z.string().max(400) });
export const Batch3DReceiptSchema = z.strictObject({
  receiptType: z.literal("Batch3DRealFootageReceipt"), receiptVersion: z.literal("0.1.0"),
  harness: z.strictObject({ harnessId: z.literal(HARNESS.harnessId), version: z.literal(HARNESS.version) }),
  git: z.strictObject({ head: z.string().regex(/^[a-f0-9]{40}$/).nullable(), clean: z.boolean().nullable() }),
  evidenceClass: z.literal("owner_local_real_footage_run_pending_owner_review"),
  direction: z.literal(VERIFICATION_INPUT),
  /** Null until the file was actually read: a missing hash is recorded as missing, never as a placeholder digest. */
  manifest: z.strictObject({ runManifestSha256: Hash.nullable(), footageManifestSha256: Hash.nullable(), registrationDigest: Hash.nullable() }),
  runtime: z.strictObject({ ffmpegSha256: Hash, ffprobeSha256: Hash }).nullable(),
  sources: z.array(z.strictObject({ entryId: Id, assetId: Id, contentHash: Hash, sizeBytes: z.number().int().positive(), analysisId: Id, analysis: Ref.nullable(),
    mediaAsset: Ref.nullable(), candidateId: Id.nullable() })).max(16),
  records: z.strictObject({ rootEditGraph: Id.nullable(), rootEditorialState: Id.nullable(), rootEditingHead: Id.nullable(), baselineDag: Id.nullable(),
    baselineProgram: Id.nullable(), baselineOutputSha256: Hash.nullable(), baselineQc: Id.nullable(), baselineObservations: z.array(Id).max(64), criticReport: Id.nullable(),
    lockRequest: Id.nullable(), lockIntent: Id.nullable(), lockedHead: Id.nullable(), editorialRequest: Id.nullable(), intent: Id.nullable(), revisionPlan: Id.nullable(),
    graphDiff: Id.nullable(), childEditGraph: Id.nullable(), childEditorialState: Id.nullable(), childEditingHead: Id.nullable(), childDag: Id.nullable(),
    childProgram: Id.nullable(), reusedSegments: z.array(Id).max(16), recomputedSegments: z.array(Id).max(16), childOutputSha256: Hash.nullable(), childQc: Id.nullable(),
    preferenceHead: Id.nullable(), finalCurrentHead: Id.nullable() }),
  refusals: z.strictObject({ lockedTarget: z.string().max(80).nullable(), staleRequest: z.string().max(80).nullable() }),
  /** Processes observed independently at the native spawn entry during each execution phase: render stages and assemblies (ffmpeg with -benchmark), other ffmpeg, ffprobe. */
  renderCounts: z.record(Id, z.strictObject({ ffmpegRender: z.number().int().nonnegative(), ffmpegOther: z.number().int().nonnegative(),
    ffprobe: z.number().int().nonnegative() })),
  critic: z.strictObject({ execution: Status, semanticCritic: z.enum(["not_computed_no_semantic_critic_port", "present"]).nullable(), findings: z.number().int().nonnegative().nullable(),
    actionableRepairFinding: z.enum(["NONE_OBSERVED", "OBSERVED", "NOT_EXERCISED"]), autoRepair: z.enum(["NOT_EXERCISED_NO_VALID_FINDING", "NOT_EXERCISED_OUTSIDE_BATCH_3D_SCOPE",
      "NOT_EXERCISED"]) }),
  scenarios: z.strictObject(Object.fromEntries(SCENARIOS.map(s => [s, Scenario])) as Record<(typeof SCENARIOS)[number], typeof Scenario>),
  claims: z.strictObject({ realFootageVerified: z.literal("PENDING_OWNER_REVIEW"), professionalEditingQuality: z.literal("NOT_VERIFIED"),
    creativeQuality: z.literal("NOT_VERIFIED"), autonomousDirector: z.literal("NOT_VERIFIED") }),
}).superRefine((r, ctx) => {
  // A dependent scenario never passes when what it depends on did not.
  const after: [string, string][] = [["baseline_technical_qc", "baseline_render"], ["baseline_observation", "baseline_technical_qc"], ["critic_execution", "baseline_observation"],
    ["state_only_lock", "editing_head_initialization"], ["trim_revision_published", "state_only_lock"], ["localized_reuse", "trim_revision_published"]];
  for (const [scenario, prerequisite] of after) {
    const s = r.scenarios[scenario as (typeof SCENARIOS)[number]], p = r.scenarios[prerequisite as (typeof SCENARIOS)[number]];
    if (s.status === "PASS" && p.status !== "PASS") ctx.addIssue({ code: "custom", message: `${scenario} cannot pass without ${prerequisite}.` });
  }
  if (r.critic.execution !== r.scenarios.critic_execution.status) ctx.addIssue({ code: "custom", message: "The critic status is the critic scenario's status." });
  if (r.critic.actionableRepairFinding === "NONE_OBSERVED" && r.critic.findings !== 0) ctx.addIssue({ code: "custom", message: "No finding means zero findings." });
});
export type Batch3DReceipt = z.infer<typeof Batch3DReceiptSchema>;
export const MAX_RECEIPT_BYTES = 262_144;
