/**
 * A pure UniversalEditPlan 1.0.0 compatibility boundary. It classifies the lossless editable timeline subset separately
 * from every frozen plan-input validator dependency and binds an exact graph-node mapping sidecar, but it never builds
 * a plan or a DecisionEvent: UEP 1.0.0 validation requires plan-bound per-clip decision events and meaningful confidence
 * that no current evidence supplies. V0 therefore always ends in an explicit refusal with evidence-bearing reasons.
 */
import { z } from "zod";
import { AudioFingerprintSchema } from "../contracts/audio.js";
import { FrameRateSchema, IdSchema, MediaAssetSchema, ResolutionSchema, TIME_EPSILON_SECONDS } from "../contracts/common.js";
import { ClipSegmentSchema, ReferenceFingerprintSchema } from "../contracts/creative.js";
import { ReferenceFingerprintV11Schema } from "../contracts/reference-v11.js";
import { canonicalSerialize } from "../domain/serialization.js";
import { ArtifactRefSchema, EditorialArtifactMap, EvidenceRefSchema, availability, checkIdentity, compareText, equal, identify, type ArtifactRef, type Availability,
  type EvidenceRef, type SuppliedArtifact } from "../editorial/common.js";
import { CreativeDirectionGraphSchema } from "../director/index.js";
import { PlanningContextSchema, PlanningDecisionSchema } from "../planning/index.js";
import { EDIT_GRAPH_RECORD_VERSION, Nat, OwnerSchema, ScopeSchema, at, check, envelope, exactArtifact, guard, header, parse, parseCanonical, sameScope, secondsOf,
  type Scope } from "./common.js";
import { EditGraphSchema, validateEditGraph, type EditGraph, type VideoClipUse } from "./graph.js";

/** Frozen UEP 1.0.0 bounds as read from packages/contracts/edit-plan.ts and common.ts. A schema-oracle test cross-checks them. */
export const UEP_V1 = {
  contractType: "UniversalEditPlan", schemaVersion: "1.0.0", aspect: { width: 9, height: 16 },
  minimumDurationSeconds: 15, maximumDurationSeconds: 30, minimumClips: 1, maximumClips: 120, maximumEffects: 16,
  colorPresets: ["neutral", "warm", "cool"], storyRoles: ["hook", "setup", "build"],
} as const;

const UepProjectionPolicyBodySchema = z.strictObject({
  ...envelope("UepProjectionPolicy"), scope: ScopeSchema, author: OwnerSchema,
  target: z.strictObject({ contractType: z.literal("UniversalEditPlan"), schemaVersion: z.literal("1.0.0") }),
  subset: z.literal("frozen_uep_1_0_0_lossless_subset_v0"), roleMapping: z.literal("exact_story_beat_role_names_v0"),
  framingEncoding: z.literal("identity_cover_center_unit_scale_v0"), sourceAudioEncoding: z.literal("linked_unity_else_zero_v0"),
  telemetry: z.literal("truthful_public_decision_events_required_v0"), reference: z.literal("legacy_validator_reference_1_0_0_only_v0"),
});
export const UepProjectionPolicySchema = UepProjectionPolicyBodySchema.extend({ projectionPolicyId: IdSchema })
  .refine(v => checkIdentity(v, "projectionPolicyId", "uep_projection_policy_v0"), "Projection policy identity mismatch.");
export type UepProjectionPolicy = z.infer<typeof UepProjectionPolicySchema>;
export function createUepProjectionPolicy(input: unknown): UepProjectionPolicy {
  return parse(UepProjectionPolicySchema, identify("uep_projection_policy_v0", "projectionPolicyId", parse(UepProjectionPolicyBodySchema, input)));
}

export const UEP_DIMENSIONS = ["graph_capability_readiness", "operation_obligations", "operation_subset", "output_profile", "output_duration", "clip_count", "framing",
  "time_mapping", "source_audio", "transitions", "effects", "timeline_arithmetic",
  "clip_identity", "clip_role", "clip_asset_joins", "clip_segment_joins", "validation_time_access", "reference", "telemetry", "plan_metadata"] as const;
/** The lossless editable-timeline subset. */
const TIMELINE_DIMENSIONS: readonly string[] = UEP_DIMENSIONS.slice(1, 12);
/**
 * Every frozen plan-input validator dependency: segment identity, roles, asset/segment/source joins, validation-time access,
 * reference joins, decisions and metadata. V0 graphs have no music track, so the projected plan's music is null and the
 * validator's music joins do not apply.
 */
const PLAN_INPUT_DIMENSIONS: readonly string[] = UEP_DIMENSIONS.slice(12);
export const UEP_FINDING_CODES = ["clip_asset_foreign_scope", "clip_asset_join_evidence_unavailable", "clip_asset_not_video", "clip_count_outside_uep_range",
  "clip_role_not_representable", "clip_segment_join_invalid", "clip_segment_join_unverified", "deferred_check_not_verified", "effect_count_exceeds_uep_limit",
  "framing_not_representable", "graph_capability_not_ready", "missing_meaningful_confidence", "missing_truthful_decision_telemetry", "operation_not_in_uep_subset",
  "output_aspect_not_uep", "output_duration_outside_uep_range", "output_frame_rate_outside_uep", "output_resolution_outside_uep", "plan_created_at_unavailable",
  "reference_asset_foreign_scope", "reference_asset_mismatch", "reference_audio_mismatch", "reference_join_evidence_unavailable", "reference_type_unsupported",
  "reference_version_incompatible", "segment_identity_unavailable", "time_mapping_not_representable", "timeline_arithmetic_outside_uep_tolerance",
  "unresolved_operation_obligation", "validation_time_access_unverified"] as const;
const FindingCodeSchema = z.enum(UEP_FINDING_CODES);
type FindingCode = z.infer<typeof FindingCodeSchema>;
// Bounded by the graph's own maxima (deferred checks, blocking subjects), so every valid graph yields a report.
const FindingSchema = z.strictObject({ code: FindingCodeSchema, subjects: z.array(IdSchema).max(4096), evidence: z.array(EvidenceRefSchema).max(4096) });
type Finding = z.infer<typeof FindingSchema>;
const DimensionSchema = z.strictObject({ dimension: z.enum(UEP_DIMENSIONS), state: z.enum(["compatible", "incompatible", "unavailable"]), findings: z.array(FindingSchema).max(16) });
type Dimension = z.infer<typeof DimensionSchema>;
const ProjectionSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("uep_clip"), clipIndex: Nat }),
  z.strictObject({ kind: z.literal("uep_clip_source_audio_gain"), clipIndex: Nat }),
  z.strictObject({ kind: z.literal("uep_effects"), effectIndexes: z.array(Nat).min(1).max(16) }),
  z.strictObject({ kind: z.literal("uep_clip_transition_out"), clipIndex: Nat }),
  z.strictObject({ kind: z.literal("not_projectable"), reasonCode: z.enum(["operation_not_in_uep_subset", "unresolved_operation_obligation"]) }),
  z.strictObject({ kind: z.literal("outside_uep"), reasonCode: z.enum(["obligation_lineage_sidecar_only", "unselected_alternative_choice"]) }),
]);
type Projection = z.infer<typeof ProjectionSchema>;
const MappingEntrySchema = z.strictObject({ graphNode: z.strictObject({ kind: z.enum(["clip_use", "operation", "obligation"]), id: IdSchema }), projection: ProjectionSchema });
type MappingEntry = z.infer<typeof MappingEntrySchema>;
/** Exact join evidence for a required reference: the reference asset and, when the reference names one, its audio fingerprint. */
const ReferenceJoinsSchema = z.strictObject({ asset: ArtifactRefSchema, audio: availability(ArtifactRefSchema) });
type ReferenceJoins = z.infer<typeof ReferenceJoinsSchema>;
const ReportBodySchema = z.strictObject({
  ...envelope("UepCompatibilityReport"), scope: ScopeSchema, editGraph: ArtifactRefSchema, graphRevision: z.literal(0), policy: ArtifactRefSchema,
  reference: availability(ArtifactRefSchema), referenceJoins: availability(ReferenceJoinsSchema),
  target: z.strictObject({ contractType: z.literal("UniversalEditPlan"), schemaVersion: z.literal("1.0.0") }),
  dimensions: z.array(DimensionSchema).length(UEP_DIMENSIONS.length),
  timelineSubset: z.enum(["compatible", "incompatible"]), planInputEligibility: z.enum(["eligible", "not_eligible"]),
  mapping: z.array(MappingEntrySchema).max(512),
  // V0 has no truthful projection path; the only representable outcome is an explicit refusal.
  outcome: z.strictObject({ kind: z.literal("refused"), reasonCodes: z.array(FindingCodeSchema).min(1).max(UEP_FINDING_CODES.length),
    plan: z.literal("not_produced"), decisionEvents: z.literal("not_emitted") }),
});
const refusalReasons = (dimensions: readonly Dimension[]) =>
  [...new Set(dimensions.filter(d => d.state !== "compatible").flatMap(d => d.findings.map(f => f.code)))].sort(compareText);
const allCompatible = (dimensions: readonly Dimension[], names: readonly string[]) => names.every(name => dimensions.find(d => d.dimension === name)?.state === "compatible");
const subsetState = (dimensions: readonly Dimension[]) => allCompatible(dimensions, TIMELINE_DIMENSIONS) ? "compatible" as const : "incompatible" as const;
const planInputState = (dimensions: readonly Dimension[]) => allCompatible(dimensions, PLAN_INPUT_DIMENSIONS) ? "eligible" as const : "not_eligible" as const;
export const UepCompatibilityReportSchema = ReportBodySchema.extend({ reportId: IdSchema }).superRefine((report, ctx) => {
  const issue = (message: string) => ctx.addIssue({ code: "custom", message });
  if (!checkIdentity(report, "reportId", "uep_compatibility_report_v0")) issue("Compatibility report identity mismatch.");
  if (!equal(report.dimensions.map(d => d.dimension), UEP_DIMENSIONS)) issue("Dimensions must be the complete fixed ordered set.");
  for (const d of report.dimensions) if ((d.state === "compatible") !== (d.findings.length === 0)) issue("A dimension is compatible exactly when it has no findings.");
  if (!equal(report.outcome.reasonCodes, refusalReasons(report.dimensions))) issue("Refusal reasons must equal the non-compatible findings.");
  if (report.timelineSubset !== subsetState(report.dimensions)) issue("Timeline-subset classification contradicts its dimensions.");
  if (report.planInputEligibility !== planInputState(report.dimensions)) issue("Plan-input eligibility contradicts its dimensions.");
  const keys = report.mapping.map(m => canonicalSerialize(m.graphNode));
  if (new Set(keys).size !== keys.length) issue("Each graph node maps exactly once.");
});
export type UepCompatibilityReport = z.infer<typeof UepCompatibilityReportSchema>;

const ProjectionRequestSchema = z.strictObject({ editGraph: ArtifactRefSchema, policy: ArtifactRefSchema, reference: availability(ArtifactRefSchema),
  referenceJoins: availability(ReferenceJoinsSchema) });
export type UepProjectionRequest = z.input<typeof ProjectionRequestSchema>;
/** Reads only the token's ClipSegment availability; the token itself was validated by Gate-5 replay. */
const TokenClipSegmentSchema = z.object({ clipSegment: availability(EvidenceRefSchema) });

const byCode = (a: Finding, b: Finding) => compareText(a.code, b.code);
const canonicalEvidence = (evidence: readonly EvidenceRef[]) =>
  [...new Map(evidence.map(e => [canonicalSerialize(e), e])).values()].sort((a, b) => compareText(canonicalSerialize(a), canonicalSerialize(b)));
function finding(code: FindingCode, subjects: readonly string[], evidence: readonly EvidenceRef[]): Finding {
  return { code, subjects: [...new Set(subjects)].sort(compareText), evidence: canonicalEvidence(evidence) };
}
/** One finding per code: repeated codes merge their subjects and evidence. */
function merged(findings: readonly Finding[]): Finding[] {
  const byName = new Map<FindingCode, Finding>();
  for (const item of findings) {
    const prior = byName.get(item.code);
    byName.set(item.code, prior ? finding(item.code, [...prior.subjects, ...item.subjects], [...prior.evidence, ...item.evidence]) : item);
  }
  return [...byName.values()].sort(byCode);
}
/** Incompatibility dominates; missing evidence alone is unavailable; no finding is compatible. */
function dimension(name: Dimension["dimension"], incompatible: readonly Finding[], unavailable: readonly Finding[] = []): Dimension {
  const findings = merged([...incompatible, ...unavailable]);
  return { dimension: name, state: incompatible.length ? "incompatible" : unavailable.length ? "unavailable" : "compatible", findings };
}
type Classified = { incompatible: Finding[]; unavailable: Finding[] };
function resolveMissing(value: Availability<unknown>, map: EditorialArtifactMap): void {
  if (value.state !== "present") for (const ref of value.evidenceRefs) guard("input_invalid", () => map.resolve(ref));
}
/**
 * ReferenceFingerprint 1.0.0 is only the first frozen requirement. The legacy validator also requires the reference asset
 * in the plan project, a video asset whose duration equals the reference, and, when named, a reference audio fingerprint
 * for that same asset. Without exact join evidence the reference is unverified; 1.1.0 is never coerced.
 */
function referenceFindings(reference: Availability<ArtifactRef>, joins: Availability<ReferenceJoins>, scope: Scope, map: EditorialArtifactMap): Classified {
  // Every supplied join ref is an exact typed artifact whether or not it can make the reference compatible: a report never binds unverified evidence.
  resolveMissing(joins, map);
  const assetJoin = joins.state === "present" ? { ref: joins.value.asset, value: parse(MediaAssetSchema, exactArtifact(map, joins.value.asset, "MediaAsset", "1.0.0")) } : undefined;
  const audioSupplied = joins.state === "present" ? joins.value.audio : undefined;
  if (audioSupplied !== undefined) resolveMissing(audioSupplied, map);
  const audioJoin = audioSupplied?.state === "present"
    ? { ref: audioSupplied.value, value: parse(AudioFingerprintSchema, exactArtifact(map, audioSupplied.value, "AudioFingerprint", "1.0.0")) } : undefined;
  if (reference.state !== "present") {
    check(joins.state !== "present", "input_invalid", "Reference join evidence requires a reference.");
    resolveMissing(reference, map);
    return { incompatible: [], unavailable: [] };
  }
  const ref = reference.value, value = guard("input_invalid", () => map.get(ref));
  if (ref.artifactType !== "ReferenceFingerprint") return { incompatible: [finding("reference_type_unsupported", [ref.objectId], [at(ref, "")])], unavailable: [] };
  if (ref.artifactVersion !== "1.0.0") {
    // A genuine 1.1.0 reference stays 1.1.0: the frozen plan validator parses only 1.0.0 and no downgrade exists.
    if (ref.artifactVersion === "1.1.0") parse(ReferenceFingerprintV11Schema, value);
    return { incompatible: [finding("reference_version_incompatible", [ref.objectId], [at(ref, "/schemaVersion")])], unavailable: [] };
  }
  const fingerprint = parse(ReferenceFingerprintSchema, value);
  check(fingerprint.audioFingerprintId !== null || audioJoin === undefined, "input_invalid", "A reference without audio takes no audio join evidence.");
  const unverified = (incompatible: Finding[], evidence: EvidenceRef[]): Classified =>
    ({ incompatible, unavailable: [finding("reference_join_evidence_unavailable", [ref.objectId], evidence)] });
  if (assetJoin === undefined) return unverified([], [at(ref, "/assetId")]);
  const { ref: assetRef, value: asset } = assetJoin;
  if (asset.assetId !== fingerprint.assetId) return unverified([], [at(ref, "/assetId"), at(assetRef, "/assetId")]);
  const incompatible: Finding[] = [];
  // The validator joins the plan project; the creator join is the repository's own scope rule and only ever refuses more.
  if (asset.projectId !== scope.projectId || asset.creatorId !== scope.creatorId) {
    incompatible.push(finding("reference_asset_foreign_scope", [ref.objectId], [at(assetRef, "/projectId"), at(assetRef, "/creatorId")]));
  }
  if (asset.kind !== "video" || Math.abs(fingerprint.durationSeconds - asset.durationSeconds) > TIME_EPSILON_SECONDS) {
    incompatible.push(finding("reference_asset_mismatch", [ref.objectId], [at(ref, "/durationSeconds"), at(assetRef, "/durationSeconds"), at(assetRef, "/kind")]));
  }
  if (fingerprint.audioFingerprintId === null) return { incompatible, unavailable: [] };
  if (audioJoin === undefined) return unverified(incompatible, [at(ref, "/audioFingerprintId")]);
  const { ref: audioRef, value: audio } = audioJoin;
  if (audio.fingerprintId !== fingerprint.audioFingerprintId) return unverified(incompatible, [at(ref, "/audioFingerprintId"), at(audioRef, "/fingerprintId")]);
  if (audio.assetId !== fingerprint.assetId || Math.abs(audio.durationSeconds - asset.durationSeconds) > TIME_EPSILON_SECONDS) {
    incompatible.push(finding("reference_audio_mismatch", [ref.objectId], [at(ref, "/audioFingerprintId"), at(audioRef, "/assetId"), at(audioRef, "/durationSeconds")]));
  }
  return { incompatible, unavailable: [] };
}

export function assessUepCompatibility(requestInput: unknown, artifacts: readonly SuppliedArtifact[]): UepCompatibilityReport {
  const request = parse(ProjectionRequestSchema, requestInput);
  const map = guard("input_invalid", () => new EditorialArtifactMap(artifacts));
  const policy = parseCanonical(UepProjectionPolicySchema, exactArtifact(map, request.policy, "UepProjectionPolicy"));
  const claimed = parse(EditGraphSchema, exactArtifact(map, request.editGraph, "EditGraph", EDIT_GRAPH_RECORD_VERSION));
  check(sameScope(policy.scope, claimed.scope), "scope_mismatch", "Foreign projection policy scope.");
  const graph: EditGraph = validateEditGraph(claimed, artifacts);
  const lineage = <S extends z.ZodType>(schema: S, ref: ArtifactRef, kind: string, version = "0.1.0") =>
    parse(schema, exactArtifact(map, ref, kind, version, "planning_lineage_invalid"), "planning_lineage_invalid");
  const decisionRef = graph.lineage.planningDecision;
  const decision = lineage(PlanningDecisionSchema, decisionRef, "PlanningDecision");
  const direction = lineage(CreativeDirectionGraphSchema, graph.lineage.direction, "CreativeDirectionGraph");
  const context = lineage(PlanningContextSchema, graph.lineage.context, "PlanningContext");
  const graphAt = (pointer: string) => at(request.editGraph, pointer);
  const tps = graph.output.clock.ticksPerSecond;
  const clipIndex = new Map(graph.tracks[0]!.clipUseIds.map((id, i) => [id, i]));
  const video = graph.clipUses.filter((c): c is VideoClipUse => c.medium === "video").sort((a, b) => clipIndex.get(a.clipUseId)! - clipIndex.get(b.clipUseId)!);
  const pointerOf = (collection: string, index: number, suffix = "") => graphAt(`/${collection}/${index}${suffix}`);
  const indexed = <T>(values: readonly T[], keep: (value: T) => boolean) => values.flatMap((value, index) => keep(value) ? [{ value, index }] : []);

  // ---------------------------------------------------------------- lossless editable-timeline subset
  const unresolved = indexed(graph.obligations, o => o.disposition.state === "unresolved");
  const unverified = indexed(graph.deferredChecks, c => c.origin === "hard_constraint" && c.disposition === "not_verified_in_v0");
  const rich = indexed(graph.operations, o => o.primitive === "color_look" && !(UEP_V1.colorPresets as readonly string[]).includes(o.parameters.look));
  const framing = indexed(graph.clipUses, c => c.medium === "video" && c.framing.state !== "source_aspect_matches_output");
  const nonIdentity = indexed(graph.clipUses, c => c.mapping.kind !== "constant_speed_identity" || c.mapping.rate.numerator !== c.mapping.rate.denominator);
  const effectCount = graph.operations.reduce((sum, o) => sum + (o.primitive === "color_look" && !rich.some(r => r.value === o) ? o.extents.length : 0), 0);
  const seconds = graph.output.durationTicks / tps;
  // The frozen UEP superRefine arithmetic, replayed on the exact projected seconds: continuity and total duration within its tolerance.
  // UEP 1.0.0 is a public float-second contract: its seconds are derived here from exact time (the correctly rounded doubles, which are
  // exactly the Gate-5 values the graph decoded) and never flow back into the graph.
  let expectedStart = 0, arithmetic = true;
  for (const clip of video) {
    const start = clip.output.startTicks / tps;
    if (Math.abs(start - expectedStart) > TIME_EPSILON_SECONDS) arithmetic = false;
    expectedStart = start + (secondsOf(clip.source.range.end) - secondsOf(clip.source.range.start));
  }
  if (Math.abs(expectedStart - seconds) > TIME_EPSILON_SECONDS) arithmetic = false;

  // ---------------------------------------------------------------- frozen plan-input dependencies
  const segments = video.map(clip => {
    const segment = lineage(TokenClipSegmentSchema, clip.token, "EditorialToken").clipSegment;
    if (segment.state !== "present") return { clip, segment: undefined };
    const reference = segment.value;
    return { clip, segment: { reference, value: parse(ClipSegmentSchema, guard("planning_lineage_invalid", () => map.resolve(reference)), "planning_lineage_invalid") } };
  });
  const missingSegments = segments.filter(s => s.segment === undefined).map(s => s.clip);
  const nodeIndex = new Map(direction.nodes.map((n, i) => [n.nodeId, i]));
  const unrepresentableRoles = video.flatMap(clip => {
    const index = nodeIndex.get(clip.directionNodeId);
    check(index !== undefined, "planning_lineage_invalid", "A clip use names a node outside its exact direction.");
    const node = direction.nodes[index]!;
    return node.intent.kind === "story_beat" && (UEP_V1.storyRoles as readonly string[]).includes(node.intent.role) ? [] : [{ clip, evidence: at(graph.lineage.direction, `/nodes/${index}`) }];
  });
  // Clip asset joins use the exact MediaAssets the replayed Gate-5 world view admitted; their current retention is a separate dimension.
  const accessAssets = context.worldQuery.currentAccess.map(ref => ({ ref, asset: lineage(MediaAssetSchema, ref, "MediaAsset", "1.0.0") }));
  const accessOf = (assetId: string) => accessAssets.find(a => a.asset.assetId === assetId);
  const assetIncompatible: Finding[] = [], assetUnavailable: Finding[] = [];
  for (const assetId of [...new Set(video.map(c => c.source.assetId))].sort(compareText)) {
    const clips = video.filter(c => c.source.assetId === assetId), ids = clips.map(c => c.clipUseId), access = accessOf(assetId);
    if (access === undefined) { assetUnavailable.push(finding("clip_asset_join_evidence_unavailable", ids, clips.map(c => at(c.source.analysis, "/assetId")))); continue; }
    if (access.asset.projectId !== graph.scope.projectId || access.asset.creatorId !== graph.scope.creatorId) assetIncompatible.push(finding("clip_asset_foreign_scope", ids, [at(access.ref, "")]));
    if (access.asset.kind !== "video") assetIncompatible.push(finding("clip_asset_not_video", ids, [at(access.ref, "/kind")]));
  }
  // Segment joins: the segment names the clip's asset, lies inside that asset, and contains the clip's exact source range.
  const segmentIncompatible: Finding[] = [], segmentUnavailable: Finding[] = [];
  for (const { clip, segment } of segments) {
    const unverifiedJoin = (evidence: EvidenceRef[]) => segmentUnavailable.push(finding("clip_segment_join_unverified", [clip.clipUseId], evidence));
    if (segment === undefined) { unverifiedJoin([at(clip.token, "/clipSegment")]); continue; }
    const range = segment.value.sourceRange, access = accessOf(clip.source.assetId);
    if (segment.value.assetId !== clip.source.assetId || range.startSeconds > secondsOf(clip.source.range.start) || range.endSeconds < secondsOf(clip.source.range.end)
      || (access !== undefined && range.endSeconds > access.asset.durationSeconds)) {
      segmentIncompatible.push(finding("clip_segment_join_invalid", [clip.clipUseId], [segment.reference]));
    } else if (access === undefined) unverifiedJoin([segment.reference]);
  }
  const reference = referenceFindings(request.reference, request.referenceJoins, graph.scope, map);
  const uncalibrated = decision.uncertainty.state === "unknown" && decision.uncertainty.reasonCode === "bounded_heuristic_uncalibrated";
  const capability = graph.executability.capability;

  const dimensions = [
    dimension("graph_capability_readiness", capability.state === "capability_ready" ? []
      : [finding("graph_capability_not_ready", capability.blocking.map(b => b.subjectId), [graphAt("/executability/capability")])]),
    dimension("operation_obligations", [
      ...(unresolved.length ? [finding("unresolved_operation_obligation", unresolved.map(u => u.value.nodeId), unresolved.map(u => pointerOf("obligations", u.index)))] : []),
      ...(unverified.length ? [finding("deferred_check_not_verified", unverified.map(u => u.value.checkId), unverified.map(u => pointerOf("deferredChecks", u.index)))] : [])]),
    dimension("operation_subset", rich.length ? [finding("operation_not_in_uep_subset", rich.map(r => r.value.operationId), rich.map(r => pointerOf("operations", r.index)))] : []),
    dimension("output_profile", [
      ...(equal(graph.output.aspectRatio, UEP_V1.aspect) ? [] : [finding("output_aspect_not_uep", [], [graphAt("/output/aspectRatio")])]),
      ...(FrameRateSchema.safeParse(graph.output.frameRate).success ? [] : [finding("output_frame_rate_outside_uep", [], [graphAt("/output/frameRate")])]),
      ...(ResolutionSchema.safeParse(graph.output.resolution).success ? [] : [finding("output_resolution_outside_uep", [], [graphAt("/output/resolution")])])]),
    // Refusal, never truncation: the graph keeps its full duration.
    dimension("output_duration", seconds >= UEP_V1.minimumDurationSeconds && seconds <= UEP_V1.maximumDurationSeconds ? []
      : [finding("output_duration_outside_uep_range", [], [graphAt("/output/durationTicks")])]),
    dimension("clip_count", video.length >= UEP_V1.minimumClips && video.length <= UEP_V1.maximumClips ? [] : [finding("clip_count_outside_uep_range", [], [graphAt("/tracks/0/clipUseIds")])]),
    dimension("framing", framing.length ? [finding("framing_not_representable", framing.map(f => f.value.clipUseId), framing.map(f => pointerOf("clipUses", f.index, "/framing")))] : []),
    dimension("time_mapping", nonIdentity.length ? [finding("time_mapping_not_representable", nonIdentity.map(n => n.value.clipUseId), nonIdentity.map(n => pointerOf("clipUses", n.index, "/mapping")))] : []),
    // Linked source audio maps to unity clip gain; excluded or absent audio maps to zero gain. V0 has no J/L timing or automation.
    dimension("source_audio", []),
    // Every V0 join is a cut and the final clip ends with a cut; V0 has no dissolve primitive.
    dimension("transitions", []),
    dimension("effects", effectCount <= UEP_V1.maximumEffects ? [] : [finding("effect_count_exceeds_uep_limit", [], [graphAt("/operations")])]),
    dimension("timeline_arithmetic", arithmetic ? [] : [finding("timeline_arithmetic_outside_uep_tolerance", [], [graphAt("/output")])]),
    dimension("clip_identity", [], missingSegments.length ? [finding("segment_identity_unavailable", missingSegments.map(c => c.clipUseId), missingSegments.map(c => at(c.token, "/clipSegment")))] : []),
    dimension("clip_role", unrepresentableRoles.length ? [finding("clip_role_not_representable", unrepresentableRoles.map(r => r.clip.clipUseId), unrepresentableRoles.map(r => r.evidence))] : []),
    dimension("clip_asset_joins", assetIncompatible, assetUnavailable),
    dimension("clip_segment_joins", segmentIncompatible, segmentUnavailable),
    // The validator rechecks deletion and expiry at its own validation time; Gate 6 holds only the pinned Gate-5 access time.
    dimension("validation_time_access", [], [finding("validation_time_access_unverified", [...new Set(video.map(c => c.source.assetId))], [graphAt("/sourceAccess")])]),
    dimension("reference", reference.incompatible, reference.unavailable),
    // Gate-5 uncertainty is a bounded heuristic, and its decision is sequence level: no per-slot candidates, scores, event time or scope.
    dimension("telemetry", [], [
      ...(uncalibrated ? [finding("missing_meaningful_confidence", [decision.planningDecisionId], [at(decisionRef, "/uncertainty")])] : []),
      finding("missing_truthful_decision_telemetry", [decision.planningDecisionId], [at(decisionRef, "/outcome")])]),
    dimension("plan_metadata", [], [finding("plan_created_at_unavailable", [], [])]),
  ];
  let effectCursor = 0;
  const mapping: MappingEntry[] = [
    ...graph.clipUses.map((c): MappingEntry => ({ graphNode: { kind: "clip_use", id: c.clipUseId },
      projection: c.medium === "video" ? { kind: "uep_clip", clipIndex: clipIndex.get(c.clipUseId)! } : { kind: "uep_clip_source_audio_gain", clipIndex: clipIndex.get(c.linkedVideoClipUseId)! } })),
    ...graph.operations.map((o): MappingEntry => {
      let projection: Projection;
      if (o.primitive === "cut_transition") projection = { kind: "uep_clip_transition_out", clipIndex: clipIndex.get(o.target.fromClipUseId)! };
      else if (rich.some(r => r.value === o)) projection = { kind: "not_projectable", reasonCode: "operation_not_in_uep_subset" };
      else projection = { kind: "uep_effects", effectIndexes: o.extents.map(() => effectCursor++) };
      return { graphNode: { kind: "operation", id: o.operationId }, projection };
    }),
    ...graph.obligations.map((o): MappingEntry => ({ graphNode: { kind: "obligation", id: o.nodeId },
      projection: o.disposition.state === "unresolved" ? { kind: "not_projectable", reasonCode: "unresolved_operation_obligation" }
        : { kind: "outside_uep", reasonCode: o.disposition.state === "bound_to_operation" ? "obligation_lineage_sidecar_only" : "unselected_alternative_choice" } })),
  ];
  const body = { ...header("UepCompatibilityReport"), scope: graph.scope, editGraph: request.editGraph, graphRevision: graph.revision, policy: request.policy,
    reference: request.reference, referenceJoins: request.referenceJoins, target: { contractType: UEP_V1.contractType, schemaVersion: UEP_V1.schemaVersion },
    dimensions, timelineSubset: subsetState(dimensions), planInputEligibility: planInputState(dimensions), mapping,
    outcome: { kind: "refused", reasonCodes: refusalReasons(dimensions), plan: "not_produced", decisionEvents: "not_emitted" } };
  return parse(UepCompatibilityReportSchema, identify("uep_compatibility_report_v0", "reportId", body));
}

/** Semantic replay from the report's own exact inputs; a rehashed report cannot change a finding or mapping. */
export function validateUepCompatibilityReport(input: unknown, artifacts: readonly SuppliedArtifact[]): UepCompatibilityReport {
  const report = parse(UepCompatibilityReportSchema, input);
  const replayed = assessUepCompatibility({ editGraph: report.editGraph, policy: report.policy, reference: report.reference, referenceJoins: report.referenceJoins }, artifacts);
  check(equal(replayed, report), "report_replay_mismatch", "Compatibility report contradicts deterministic replay from its exact inputs.");
  return structuredClone(report);
}
