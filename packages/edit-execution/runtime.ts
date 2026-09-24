/**
 * Execution-runtime attestation: attributed evidence that one exact executor build, driving one exact encoding runtime in
 * one environment, produces exactly the requested encoding semantics. The frozen Gate-6 capability vocabulary has no
 * output-encoding predicate and stays unmodified, so this Gate-7 artifact carries that proof. The core runs no probe: the
 * evidence is supplied and attributed, and the runtime identity is an owned identifier a later adapter pins, never a
 * location or an invocation.
 */
import { z } from "zod";
import { IdSchema, TimestampSchema } from "../contracts/common.js";
import { checkIdentity, identify, type EvidenceRef } from "../editorial/common.js";
import { HashSchema, evidenceSet, idSet } from "../edit-graph/common.js";
import { ActorSchema, ExecutionExecutorIdentitySchema, LocationFreeVersionSchema, ScopeSchema, envelope, parse } from "./common.js";
import { AudioEncodingSchema, VideoEncodingSchema } from "./policy.js";

/** The exact encoding runtime (tool, library or adapter build) an executor drives; Batch 2 binds its pinned build to this identity. */
export const RuntimeIdentitySchema = z.strictObject({ runtimeId: IdSchema, version: LocationFreeVersionSchema, implementationDigest: HashSchema });
export type RuntimeIdentity = z.infer<typeof RuntimeIdentitySchema>;
/** The exact encoding semantics attested: the render profile's video and audio encoding, nothing broader. */
export const RuntimeEncodingSchema = z.strictObject({ video: VideoEncodingSchema, audio: AudioEncodingSchema });
const OutcomeSchema = z.discriminatedUnion("state", [
  z.strictObject({
    state: z.literal("available"), licensing: z.strictObject({ eligiblePurposes: idSet(16, 1) }),
    conformance: z.strictObject({ meaning: z.literal("attested_encoding_matches_declared_semantics"), evidence: evidenceSet(16, 1) }),
    configuration: z.strictObject({ meaning: z.literal("runtime_configured_in_environment"), evidence: evidenceSet(16, 1) }),
  }),
  z.strictObject({ state: z.literal("unavailable"), reasonCode: z.enum(["unconfigured", "unverified", "resource_blocked", "permission_unavailable", "inaccessible"]),
    nextCheckAfter: TimestampSchema, evidence: evidenceSet(16, 1) }),
  z.strictObject({ state: z.literal("failed"), failureCode: IdSchema, attempt: z.strictObject({ attemptedAt: TimestampSchema, evidence: evidenceSet(16, 1) }) }),
]);
export type RuntimeOutcome = z.infer<typeof OutcomeSchema>;
const BodySchema = z.strictObject({
  ...envelope("ExecutionRuntimeAttestation"), scope: ScopeSchema, environment: IdSchema, observedAt: TimestampSchema,
  executor: ExecutionExecutorIdentitySchema, runtime: RuntimeIdentitySchema, encoding: RuntimeEncodingSchema,
  attester: ActorSchema, basis: z.literal("attester_supplied_runtime_check_results_no_probe"), outcome: OutcomeSchema,
});
export const ExecutionRuntimeAttestationSchema = BodySchema.extend({ attestationId: IdSchema })
  .refine(v => v.outcome.state !== "failed" || v.outcome.attempt.attemptedAt <= v.observedAt, "A failed attempt cannot follow its attestation.")
  .refine(v => checkIdentity(v, "attestationId", "execution_runtime_attestation_v0"), "Execution runtime attestation identity mismatch.");
export type ExecutionRuntimeAttestation = z.infer<typeof ExecutionRuntimeAttestationSchema>;
export function createExecutionRuntimeAttestation(input: unknown): ExecutionRuntimeAttestation {
  return parse(ExecutionRuntimeAttestationSchema, identify("execution_runtime_attestation_v0", "attestationId", parse(BodySchema, input)));
}
/** Every evidence reference a runtime outcome rests on. */
export function runtimeEvidence(outcome: RuntimeOutcome): EvidenceRef[] {
  if (outcome.state === "available") return [...outcome.conformance.evidence, ...outcome.configuration.evidence];
  return outcome.state === "failed" ? outcome.attempt.evidence : outcome.evidence;
}
