/**
 * Strict, content-identified Batch-2B evidence records and the owner's real-execution policy. The provenance unions admit only the
 * real variants: a synthetic kind is unrepresentable. A record is still only data: whoever can construct valid JSON can construct a
 * record, so a record alone never authorizes anything. The trusted adapter that ran the probe or query holds, in memory only, the
 * ephemeral token whose digest a record carries; only that live handle can present a record as its own to the permit issuer.
 */
import { z } from "zod";
import { IdSchema, TimestampSchema } from "../contracts/common.js";
import { canonicalSerialize } from "../domain/serialization.js";
import { ArtifactRefSchema, checkIdentity, compareText, equal, identify, type SuppliedArtifact } from "../editorial/common.js";
import { parseAnyEditGraph } from "../edit-graph/index.js";
import { EDIT_GRAPH_RECORD_VERSION, EDIT_GRAPH_REVISION_RECORD_VERSION, HashSchema, OwnerSchema, ScopeSchema } from "../edit-graph/common.js";
import { ExecutionExecutorIdentitySchema, LocationFreeVersionSchema, PositiveSafeInt } from "../edit-execution/common.js";
import { RuntimeEncodingSchema, RuntimeIdentitySchema } from "../edit-execution/runtime.js";
import { RuntimeArtifacts } from "../edit-runtime/common.js";
import { StagedSourceReceiptSchema, type ExecutionClaim, type StagedSourceReceipt } from "../edit-runtime/records.js";
import { requireValidated, type ValidatedExecutionDag } from "../edit-runtime/validated.js";
import { CheckTimingSchema, ORDERED_CHECK, RenderImplementationSchema, RENDER_IMPLEMENTATION, SessionProofSchema, check, envelope, guard, header, orderedCheck, parse,
  parseCanonical, sha256, type CheckTiming, type SessionProof } from "./common.js";
import { CONFORMANCE_REASONS, componentInventoryOf, evaluateInputConformance, parseBuildConfiguration, parseProbeJson, parseVersionBanner, type RuntimeListings } from "./probe.js";
import { requireProgram, type RenderProgram } from "./program.js";
import { CAPABILITY_REASON_CODES, PINNED_MEDIA_RUNTIME, PROBE_IMPLEMENTATION, PROBE_IMPLEMENTATION_DIGEST, RENDER_ENVIRONMENT, RENDER_EXECUTOR,
  assessCapabilityRequirement } from "./semantics.js";

export const ClaimBindingSchema = z.strictObject({ claimId: IdSchema, claimTargetId: IdSchema });
export const DagBindingSchema = z.strictObject({ dagId: IdSchema, artifact: ArtifactRefSchema });
const StagedBindingSchema = z.strictObject({ stagedSourceReceiptId: IdSchema, stagedAt: TimestampSchema });
const timed = <T extends z.ZodRawShape>(shape: T) => z.strictObject({ ...shape, ...CheckTimingSchema.shape });

/** The claim is the one this validated DAG was claimed under: same target, render binding and DAG. */
export function claimBinding(dag: ValidatedExecutionDag, claim: ExecutionClaim): { claimId: string; claimTargetId: string } {
  check(claim.claimTarget.claimTargetId === dag.dag.dispatch.claimTarget.claimTargetId && equal(claim.renderBinding, dag.dag.dispatch.renderBinding)
    && claim.dag.dagId === dag.dag.dagId && equal(claim.scope, dag.dag.scope), "claim_mismatch", "The claim binds another DAG, target or render computation.");
  return { claimId: claim.claimId, claimTargetId: claim.claimTarget.claimTargetId };
}
function timingFor(timing: CheckTiming, notBefore: readonly string[]): CheckTiming {
  const parsed = parse(CheckTimingSchema, timing, "evidence_chronology_invalid");
  check(orderedCheck(parsed), "evidence_chronology_invalid", ORDERED_CHECK);
  check(notBefore.every(bound => parsed.checkStartedAt >= bound), "evidence_chronology_invalid", "A post-claim check starts only after its claim, and a source check only after its staging.");
  return parsed;
}
/** A staged source receipt made under exactly this claim, for exactly an admitted source of this DAG. */
export function stagedFor(dag: ValidatedExecutionDag, claim: ExecutionClaim, input: unknown): StagedSourceReceipt {
  const receipt = parseCanonical(StagedSourceReceiptSchema, input, "staged_source_invalid");
  check(equal(receipt.scope, dag.dag.scope), "scope_mismatch", "A staged source for another scope never serves this execution.");
  check(receipt.claim.claimId === claim.claimId && receipt.claim.claimTargetId === claim.claimTarget.claimTargetId && equal(receipt.attemptRegistration, claim.attemptRegistration)
    && equal(receipt.dag, claim.dag) && equal(receipt.admission, claim.admission), "claim_mismatch", "The staged source was staged under another claim or DAG.");
  const source = dag.admission.sources.find(s => s.assetId === receipt.source.assetId);
  check(source !== undefined && equal(receipt.source.sourceAccessReceipt, source.receipt) && receipt.expected.contentHash === source.contentHash
    && receipt.expected.sizeBytes === source.sizeBytes, "staged_source_invalid", "The staged source is not an admitted source's exact bytes.");
  check(receipt.stagingStartedAt >= claim.claimedAt && receipt.stagedAt >= receipt.stagingStartedAt, "evidence_chronology_invalid", "Staging cannot precede its claim.");
  return receipt;
}

// ---------------------------------------------------------------- the owner's real-execution policy
const Age = z.number().int().min(1).max(60_000);
const PolicyBodySchema = z.strictObject({
  ...envelope("RealExecutionPolicy"), scope: ScopeSchema, author: OwnerSchema,
  freshness: z.strictObject({ maxRuntimeProbeAgeMilliseconds: Age, maxCapabilityProbeAgeMilliseconds: Age, maxLifecycleObservationAgeMilliseconds: Age,
    maxInputConformanceAgeMilliseconds: Age }),
  permitLifetimeMilliseconds: z.number().int().min(1).max(30_000),
  process: z.strictObject({ maxWallClockMilliseconds: z.number().int().min(1).max(600_000) }),
  output: z.strictObject({ maxOutputBytes: z.number().int().min(1).max(2_147_483_648) }),
});
export const RealExecutionPolicySchema = PolicyBodySchema.extend({ policyId: IdSchema })
  .refine(v => checkIdentity(v, "policyId", "real_execution_policy_v0"), "Real execution policy identity mismatch.");
export type RealExecutionPolicy = z.infer<typeof RealExecutionPolicySchema>;
export function createRealExecutionPolicy(input: unknown): RealExecutionPolicy {
  return parse(RealExecutionPolicySchema, identify("real_execution_policy_v0", "policyId", parse(PolicyBodySchema, input, "policy_invalid")), "policy_invalid");
}

// ---------------------------------------------------------------- the real pinned runtime probe
const probeProvenance = <const B extends string>(basis: B) => z.strictObject({ kind: z.literal("real_local_probe"), checkerId: IdSchema, version: LocationFreeVersionSchema,
  implementationDigest: HashSchema, basis: z.literal(basis) });
export const RUNTIME_PROBE_REASONS = ["runtime_binary_mismatch", "runtime_version_mismatch", "runtime_environment_mismatch", "runtime_identity_mismatch",
  "executor_identity_mismatch", "encoder_unavailable"] as const;
const RuntimeProbeBodySchema = timed({
  ...envelope("RealRuntimeProbe"), scope: ScopeSchema, claim: ClaimBindingSchema, dag: DagBindingSchema, renderComputationId: IdSchema,
  executor: ExecutionExecutorIdentitySchema, environment: IdSchema, runtime: RuntimeIdentitySchema, encoding: RuntimeEncodingSchema,
  binaries: z.strictObject({
    ffmpeg: z.strictObject({ sha256: HashSchema, sizeBytes: PositiveSafeInt, reportedVersion: LocationFreeVersionSchema.nullable(),
      buildConfiguration: z.array(z.string().regex(/^--[a-z0-9][a-z0-9_-]*(?:=[A-Za-z0-9_.,+-]*)?$/)).max(512), buildConfigurationDigest: HashSchema }),
    ffprobe: z.strictObject({ sha256: HashSchema, sizeBytes: PositiveSafeInt, reportedVersion: LocationFreeVersionSchema.nullable() }),
  }),
  components: z.strictObject({ inventoryDigest: HashSchema, videoEncoder: z.literal("libx264"), audioEncoder: z.literal("aac"), videoEncoderAvailable: z.boolean(),
    audioEncoderAvailable: z.boolean() }),
  hardware: z.literal("none_requested_software_codecs_and_filters_only"),
  prober: probeProvenance(PROBE_IMPLEMENTATION.runtime.basis), recorder: RenderImplementationSchema, session: SessionProofSchema,
  outcome: z.discriminatedUnion("state", [z.strictObject({ state: z.literal("available") }), z.strictObject({ state: z.literal("unavailable"), reasonCode: z.enum(RUNTIME_PROBE_REASONS) })]),
  basis: z.literal("post_claim_real_pinned_runtime_probe_v0"),
});
export const RealRuntimeProbeSchema = RuntimeProbeBodySchema.extend({ probeId: IdSchema }).refine(orderedCheck, ORDERED_CHECK)
  .refine(v => checkIdentity(v, "probeId", "real_runtime_probe_v0"), "Real runtime probe identity mismatch.");
export type RealRuntimeProbe = z.infer<typeof RealRuntimeProbeSchema>;
export interface RuntimeObservation {
  ffmpeg: { sha256: string; sizeBytes: number; versionText: string; buildConfigurationText: string };
  ffprobe: { sha256: string; sizeBytes: number; versionText: string };
  listings: RuntimeListings;
  platform: string;
  arch: string;
}
const optional = <T>(run: () => T): T | null => { try { return run(); } catch { return null; } };
export function observedEnvironment(observation: { platform: string; arch: string }): string {
  return observation.platform === RENDER_ENVIRONMENT.platform && observation.arch === RENDER_ENVIRONMENT.arch ? RENDER_ENVIRONMENT.environmentId : "unrecognized_environment";
}
const prober = (which: "runtime" | "capability" | "conformance") => ({ kind: "real_local_probe" as const, checkerId: PROBE_IMPLEMENTATION[which].checkerId,
  version: PROBE_IMPLEMENTATION[which].version, implementationDigest: PROBE_IMPLEMENTATION_DIGEST, basis: PROBE_IMPLEMENTATION[which].basis });
/**
 * Records what the trusted probe observed of the exact binaries and build, and is available only when the build is the owner-pinned
 * one (digests, sizes, reported versions), the environment is the admitted one, the admission names this pinned runtime and the real
 * V0 executor, and the software encoders exist.
 */
export function buildRealRuntimeProbe(input: { dag: ValidatedExecutionDag; claim: ExecutionClaim; observation: RuntimeObservation; timing: CheckTiming; session: SessionProof }): RealRuntimeProbe {
  const v = requireValidated(input.dag), claim = claimBinding(v, input.claim), timing = timingFor(input.timing, [input.claim.claimedAt]), o = input.observation;
  const ffmpegVersion = optional(() => parseVersionBanner(o.ffmpeg.versionText, "ffmpeg")), ffprobeVersion = optional(() => parseVersionBanner(o.ffprobe.versionText, "ffprobe"));
  const flags = optional(() => parseBuildConfiguration(o.ffmpeg.buildConfigurationText)) ?? [];
  const inventory = componentInventoryOf(o.listings);
  const environment = observedEnvironment(o);
  const runtime = { runtimeId: PINNED_MEDIA_RUNTIME.runtimeIdentity.runtimeId, version: ffmpegVersion ?? "unreported", implementationDigest: o.ffmpeg.sha256 };
  const videoEncoderAvailable = inventory.encoders.includes("libx264"), audioEncoderAvailable = inventory.encoders.includes("aac");
  const pinned = PINNED_MEDIA_RUNTIME;
  const reason = o.ffmpeg.sha256 !== pinned.ffmpeg.sha256 || o.ffmpeg.sizeBytes !== pinned.ffmpeg.sizeBytes || o.ffprobe.sha256 !== pinned.ffprobe.sha256
    || o.ffprobe.sizeBytes !== pinned.ffprobe.sizeBytes ? "runtime_binary_mismatch" as const
    : ffmpegVersion !== pinned.ffmpeg.reportedVersion || ffprobeVersion !== pinned.ffprobe.reportedVersion ? "runtime_version_mismatch" as const
      : environment !== RENDER_ENVIRONMENT.environmentId || v.admission.environment !== environment ? "runtime_environment_mismatch" as const
        : !equal(v.admission.runtime.identity, pinned.runtimeIdentity) ? "runtime_identity_mismatch" as const
          : !equal(v.admission.executor, RENDER_EXECUTOR) ? "executor_identity_mismatch" as const
            : !videoEncoderAvailable || !audioEncoderAvailable || !pinned.requiredBuildFlags.every(f => flags.includes(f)) ? "encoder_unavailable" as const : null;
  const body = { ...header("RealRuntimeProbe"), scope: v.dag.scope, claim, dag: { dagId: v.dag.dagId, artifact: v.dagRef }, renderComputationId: v.dag.renderIdentity.renderComputationId,
    executor: v.admission.executor, environment, runtime, encoding: { video: v.dag.settings.video, audio: v.dag.settings.audio },
    binaries: { ffmpeg: { sha256: o.ffmpeg.sha256, sizeBytes: o.ffmpeg.sizeBytes, reportedVersion: ffmpegVersion, buildConfiguration: flags, buildConfigurationDigest: sha256(flags.join("\n")) },
      ffprobe: { sha256: o.ffprobe.sha256, sizeBytes: o.ffprobe.sizeBytes, reportedVersion: ffprobeVersion } },
    components: { inventoryDigest: sha256(canonicalSerialize(inventory)), videoEncoder: "libx264", audioEncoder: "aac", videoEncoderAvailable, audioEncoderAvailable },
    hardware: "none_requested_software_codecs_and_filters_only", ...timing, prober: prober("runtime"), recorder: RENDER_IMPLEMENTATION, session: input.session,
    outcome: reason === null ? { state: "available" } : { state: "unavailable", reasonCode: reason }, basis: "post_claim_real_pinned_runtime_probe_v0" };
  return parse(RealRuntimeProbeSchema, identify("real_runtime_probe_v0", "probeId", parse(RuntimeProbeBodySchema, body, "runtime_probe_invalid")), "runtime_probe_invalid");
}

// ---------------------------------------------------------------- the real capability probe
const PredicateSchema = z.discriminatedUnion("kind", [z.strictObject({ name: IdSchema, kind: z.literal("member"), value: IdSchema }),
  z.strictObject({ name: IdSchema, kind: z.literal("at_most"), value: z.number().int().nonnegative().safe() })]);
const FindingSchema = z.strictObject({ requirementId: IdSchema, capabilityId: IdSchema, state: z.enum(["AVAILABLE", "UNAVAILABLE"]), reasonCode: z.enum(CAPABILITY_REASON_CODES),
  components: z.array(z.string().regex(/^[a-z_]+:[a-z0-9_]+$/)).max(64), unmetPredicates: z.array(PredicateSchema).max(64) });
const CapabilityProbeBodySchema = timed({
  ...envelope("RealCapabilityProbe"), scope: ScopeSchema, claim: ClaimBindingSchema, dag: DagBindingSchema, renderComputationId: IdSchema,
  executor: ExecutionExecutorIdentitySchema, environment: IdSchema, runtime: RuntimeIdentitySchema,
  findings: z.array(FindingSchema).min(1).max(128).refine(v => v.every((f, i) => i === 0 || compareText(v[i - 1]!.requirementId, f.requirementId) < 0), "Findings are unique and canonical."),
  prober: probeProvenance(PROBE_IMPLEMENTATION.capability.basis), recorder: RenderImplementationSchema, session: SessionProofSchema,
  outcome: z.discriminatedUnion("state", [z.strictObject({ state: z.literal("available") }), z.strictObject({ state: z.literal("unavailable"), reasonCode: z.literal("capability_unavailable") })]),
  basis: z.literal("post_claim_real_executor_capability_probe_v0"),
});
export const RealCapabilityProbeSchema = CapabilityProbeBodySchema.extend({ probeId: IdSchema }).refine(orderedCheck, ORDERED_CHECK)
  .refine(v => (v.outcome.state === "available") === v.findings.every(f => f.state === "AVAILABLE"), "The outcome summarizes the findings.")
  .refine(v => checkIdentity(v, "probeId", "real_capability_probe_v0"), "Real capability probe identity mismatch.");
export type RealCapabilityProbe = z.infer<typeof RealCapabilityProbeSchema>;
/** Every admitted requirement, with its exact Gate-6 predicates from the admitted EditGraph, against the probed build and the V0 map. */
export function buildRealCapabilityProbe(input: { dag: ValidatedExecutionDag; artifacts: readonly SuppliedArtifact[]; claim: ExecutionClaim; observation: RuntimeObservation;
  timing: CheckTiming; session: SessionProof }): RealCapabilityProbe {
  const v = requireValidated(input.dag), claim = claimBinding(v, input.claim), timing = timingFor(input.timing, [input.claim.claimedAt]);
  const graphVersion = v.admission.editGraph.artifactVersion === EDIT_GRAPH_REVISION_RECORD_VERSION ? EDIT_GRAPH_REVISION_RECORD_VERSION : EDIT_GRAPH_RECORD_VERSION;
  const graph = guard("capability_probe_invalid", () => parseAnyEditGraph(new RuntimeArtifacts(input.artifacts).exact(v.admission.editGraph, "EditGraph", graphVersion,
    "execution_dag_invalid")));
  const inventory = componentInventoryOf(input.observation.listings);
  const findings = v.admission.capability.requirements.map(r => {
    const requirement = graph.capabilityRequirements.find(g => g.requirementId === r.requirementId);
    check(requirement !== undefined && requirement.capabilityId === r.capabilityId, "capability_probe_invalid", "Every admitted requirement is one of the graph's own.");
    return assessCapabilityRequirement({ requirementId: r.requirementId, capabilityId: r.capabilityId, predicates: requirement.predicates }, inventory);
  }).sort((a, b) => compareText(a.requirementId, b.requirementId));
  const environment = observedEnvironment(input.observation);
  const body = { ...header("RealCapabilityProbe"), scope: v.dag.scope, claim, dag: { dagId: v.dag.dagId, artifact: v.dagRef }, renderComputationId: v.dag.renderIdentity.renderComputationId,
    executor: v.admission.executor, environment, runtime: { runtimeId: PINNED_MEDIA_RUNTIME.runtimeIdentity.runtimeId,
      version: optional(() => parseVersionBanner(input.observation.ffmpeg.versionText, "ffmpeg")) ?? "unreported", implementationDigest: input.observation.ffmpeg.sha256 },
    findings, ...timing, prober: prober("capability"), recorder: RENDER_IMPLEMENTATION, session: input.session,
    outcome: findings.every(f => f.state === "AVAILABLE") ? { state: "available" } : { state: "unavailable", reasonCode: "capability_unavailable" },
    basis: "post_claim_real_executor_capability_probe_v0" };
  return parse(RealCapabilityProbeSchema, identify("real_capability_probe_v0", "probeId", parse(CapabilityProbeBodySchema, body, "capability_probe_invalid")), "capability_probe_invalid");
}

// ---------------------------------------------------------------- staged-input conformance
const ConformanceSpecSchema = z.strictObject({
  video: z.strictObject({ frameCount: PositiveSafeInt, tableId: IdSchema, width: PositiveSafeInt, height: PositiveSafeInt,
    grid: z.strictObject({ numerator: PositiveSafeInt, denominator: PositiveSafeInt }) }),
  audio: z.discriminatedUnion("required", [z.strictObject({ required: z.literal(false) }),
    z.strictObject({ required: z.literal(true), sampleRateHz: PositiveSafeInt, channelLayout: z.enum(["mono", "stereo"]), requiredSamples: PositiveSafeInt })]),
});
const ConformanceBodySchema = timed({
  ...envelope("StagedInputConformance"), scope: ScopeSchema, claim: ClaimBindingSchema, dag: DagBindingSchema, stagedSource: StagedBindingSchema,
  source: z.strictObject({ assetId: IdSchema, contentHash: HashSchema, sizeBytes: PositiveSafeInt, stagedObjectId: IdSchema }),
  program: z.strictObject({ programId: IdSchema, input: z.number().int().nonnegative() }), expected: ConformanceSpecSchema,
  observed: z.strictObject({ containerFormat: z.string().max(80), streams: z.array(z.strictObject({ index: z.number().int().nonnegative(), codecType: z.string().max(20),
    codecName: z.string().max(40).nullable() })).max(16), videoFrames: z.number().int().nonnegative(), videoTableId: IdSchema.nullable(), audioSamples: z.number().int().nonnegative().nullable() }),
  probeOutput: z.strictObject({ bytes: PositiveSafeInt, sha256: HashSchema }),
  prober: probeProvenance(PROBE_IMPLEMENTATION.conformance.basis), recorder: RenderImplementationSchema, session: SessionProofSchema,
  outcome: z.discriminatedUnion("state", [z.strictObject({ state: z.literal("conforms") }), z.strictObject({ state: z.literal("nonconforming"), reasonCode: z.enum(CONFORMANCE_REASONS) })]),
  basis: z.literal("post_stage_staged_bytes_conformance_v0"),
});
export const StagedInputConformanceSchema = ConformanceBodySchema.extend({ conformanceId: IdSchema }).refine(orderedCheck, ORDERED_CHECK)
  .refine(v => checkIdentity(v, "conformanceId", "staged_input_conformance_v0"), "Staged input conformance identity mismatch.");
export type StagedInputConformance = z.infer<typeof StagedInputConformanceSchema>;
/** Whether the exact staged bytes, probed over a verified handle, satisfy exactly what the program assumes of its input. */
export function buildStagedInputConformance(input: { dag: ValidatedExecutionDag; claim: ExecutionClaim; stagedSource: unknown; program: RenderProgram; probeJson: string;
  timing: CheckTiming; session: SessionProof }): StagedInputConformance {
  const v = requireValidated(input.dag), claim = claimBinding(v, input.claim), staged = stagedFor(v, input.claim, input.stagedSource), program = requireProgram(input.program);
  check(program.binding.dagId === v.dag.dagId, "render_program_mismatch", "The program was compiled for another DAG.");
  const slot = program.inputs.find(i => i.assetId === staged.source.assetId);
  check(slot !== undefined, "input_conformance_invalid", "The staged source is not an input of this program.");
  const timing = timingFor(input.timing, [input.claim.claimedAt, staged.stagedAt]);
  const report = parseProbeJson(input.probeJson), expected = { video: slot.video, audio: slot.audio };
  const { outcome, observation } = evaluateInputConformance(expected, report);
  const body = { ...header("StagedInputConformance"), scope: v.dag.scope, claim, dag: { dagId: v.dag.dagId, artifact: v.dagRef },
    stagedSource: { stagedSourceReceiptId: staged.stagedSourceReceiptId, stagedAt: staged.stagedAt },
    source: { assetId: slot.assetId, contentHash: slot.contentHash, sizeBytes: slot.sizeBytes, stagedObjectId: slot.stagedObjectId },
    program: { programId: program.programId, input: slot.input }, expected, observed: observation,
    probeOutput: { bytes: new TextEncoder().encode(input.probeJson).length, sha256: sha256(input.probeJson) }, ...timing, prober: prober("conformance"),
    recorder: RENDER_IMPLEMENTATION, session: input.session, outcome, basis: "post_stage_staged_bytes_conformance_v0" };
  return parse(StagedInputConformanceSchema, identify("staged_input_conformance_v0", "conformanceId", parse(ConformanceBodySchema, body, "input_conformance_invalid")), "input_conformance_invalid");
}

// ---------------------------------------------------------------- the synthetic-fixture lifecycle authority's observation
/** The one lifecycle authority Batch 2B has: an owned registry of synthetic fixture assets it generated itself; not a production service. */
export const FIXTURE_AUTHORITY = { observerId: "synthetic_fixture_lifecycle_registry", version: "0.1.0",
  descriptor: { authority: "synthetic_fixture_lifecycle_registry_v0", registration: "bytes_read_inside_owned_fixture_directory_only", scope: "synthetic_fixture_assets_only_v0",
    state: "in_memory_current_deletion_and_expiry", query: "trusted_runtime_clock_check_window", eligibility: "synthetic_origin_and_synthetic_generated_authorization_only" } } as const;
export const FIXTURE_AUTHORITY_DIGEST = sha256(canonicalSerialize(FIXTURE_AUTHORITY.descriptor));
const LifecycleBodySchema = timed({
  ...envelope("FixtureLifecycleObservation"), scope: ScopeSchema, claim: ClaimBindingSchema, stagedSource: StagedBindingSchema,
  source: z.strictObject({ assetId: IdSchema, contentHash: HashSchema, mediaAsset: ArtifactRefSchema, sourceAccessReceipt: ArtifactRefSchema }),
  lifecycle: z.strictObject({ deletionRequestedAt: TimestampSchema.nullable(), expiresAt: TimestampSchema.nullable() }),
  observer: z.strictObject({ kind: z.literal("real_authoritative_observation"), observerId: z.literal(FIXTURE_AUTHORITY.observerId), version: z.literal(FIXTURE_AUTHORITY.version),
    implementationDigest: HashSchema, basis: z.literal("authoritative_media_lifecycle_record_query_v0") }),
  authorityScope: z.literal("synthetic_fixture_assets_only_v0"), recorder: RenderImplementationSchema, session: SessionProofSchema,
  basis: z.literal("post_claim_post_stage_fixture_registry_lifecycle_query_v0"),
});
export const FixtureLifecycleObservationSchema = LifecycleBodySchema.extend({ observationId: IdSchema }).refine(orderedCheck, ORDERED_CHECK)
  .refine(v => v.observer.implementationDigest === FIXTURE_AUTHORITY_DIGEST, "The observer is the synthetic-fixture registry.")
  .refine(v => checkIdentity(v, "observationId", "fixture_lifecycle_observation_v0"), "Fixture lifecycle observation identity mismatch.");
export type FixtureLifecycleObservation = z.infer<typeof FixtureLifecycleObservationSchema>;
export function buildFixtureLifecycleObservation(input: { dag: ValidatedExecutionDag; claim: ExecutionClaim; stagedSource: unknown;
  state: { deletionRequestedAt: string | null; expiresAt: string | null }; timing: CheckTiming; session: SessionProof }): FixtureLifecycleObservation {
  const v = requireValidated(input.dag), claim = claimBinding(v, input.claim), staged = stagedFor(v, input.claim, input.stagedSource);
  const timing = timingFor(input.timing, [input.claim.claimedAt, staged.stagedAt]);
  const source = v.admission.sources.find(s => s.assetId === staged.source.assetId)!;
  const body = { ...header("FixtureLifecycleObservation"), scope: v.dag.scope, claim, stagedSource: { stagedSourceReceiptId: staged.stagedSourceReceiptId, stagedAt: staged.stagedAt },
    source: { assetId: source.assetId, contentHash: source.contentHash, mediaAsset: source.mediaAsset, sourceAccessReceipt: source.receipt }, lifecycle: input.state, ...timing,
    observer: { kind: "real_authoritative_observation", observerId: FIXTURE_AUTHORITY.observerId, version: FIXTURE_AUTHORITY.version, implementationDigest: FIXTURE_AUTHORITY_DIGEST,
      basis: "authoritative_media_lifecycle_record_query_v0" }, authorityScope: "synthetic_fixture_assets_only_v0", recorder: RENDER_IMPLEMENTATION, session: input.session,
    basis: "post_claim_post_stage_fixture_registry_lifecycle_query_v0" };
  return parse(FixtureLifecycleObservationSchema, identify("fixture_lifecycle_observation_v0", "observationId", parse(LifecycleBodySchema, body, "lifecycle_observation_invalid")),
    "lifecycle_observation_invalid");
}
export type { CheckTiming, SessionProof };
