import { createHash } from "node:crypto";
import { AudioFingerprintSchema, ClipSegmentSchema, DecisionEventSchema, MediaAssetSchema, ReferenceFingerprintSchema, TimestampSchema, UniversalEditPlanSchema } from "../contracts/index.js";
import type { AudioFingerprint, ClipSegment, DecisionEvent, EmbeddingReference, MediaAsset, ReferenceFingerprint, UniversalEditPlan } from "../domain/index.js";
import { canonicalSerialize } from "../domain/serialization.js";

export class InputValidationError extends Error {
  constructor(public readonly code: string, message: string) { super(message); this.name = "InputValidationError"; }
}
export interface PlanInputs {
  readonly assets: readonly MediaAsset[];
  readonly segments: readonly ClipSegment[];
  readonly audio: readonly AudioFingerprint[];
  readonly references: readonly ReferenceFingerprint[];
  readonly decisions: readonly DecisionEvent[];
  readonly asOf: string;
}

function indexUnique<T>(values: readonly T[], key: (value: T) => string): Map<string, T> {
  const result = new Map<string, T>();
  for (const value of values) {
    const id = key(value);
    if (result.has(id)) throw new InputValidationError("duplicate_id", `Duplicate input ID: ${id}`);
    result.set(id, value);
  }
  return result;
}

/** Structural validation plus project, asset, segment, fingerprint, and decision joins.
 * Workers must repeat this with an explicit current timestamp before accessing media.
 */
export function validatePlanWithInputs(input: unknown, context: PlanInputs): UniversalEditPlan {
  const plan = UniversalEditPlanSchema.parse(input);
  const asOf = TimestampSchema.parse(context.asOf);
  const assets = indexUnique(context.assets.map((asset) => MediaAssetSchema.parse(asset)), (asset) => asset.assetId);
  const segments = indexUnique(context.segments.map((segment) => ClipSegmentSchema.parse(segment)), (segment) => segment.segmentId);
  const audios = indexUnique(context.audio.map((audio) => AudioFingerprintSchema.parse(audio)), (audio) => audio.fingerprintId);
  const references = indexUnique(context.references.map((reference) => ReferenceFingerprintSchema.parse(reference)), (reference) => reference.fingerprintId);
  const decisions = indexUnique(context.decisions.map((decision) => DecisionEventSchema.parse(decision)), (decision) => decision.decisionId);

  function assetFor(id: string, needsBytes: boolean): MediaAsset {
    const asset = assets.get(id);
    if (asset === undefined) throw new InputValidationError("asset_missing", `Missing asset: ${id}`);
    if (asset.projectId !== plan.projectId) throw new InputValidationError("project_mismatch", "Asset belongs to another project.");
    if (needsBytes && (asset.retention.deletionRequestedAt !== null || (asset.retention.expiresAt !== null && asset.retention.expiresAt <= asOf))) {
      throw new InputValidationError("media_unavailable", "Selected media is expired or pending deletion.");
    }
    return asset;
  }
  for (const segment of segments.values()) {
    const asset = assetFor(segment.assetId, false);
    if (asset.kind !== "video" || segment.sourceRange.endSeconds > asset.durationSeconds) throw new InputValidationError("segment_out_of_bounds", "Segment must fit its source video.");
  }
  for (const audio of audios.values()) {
    if (Math.abs(audio.durationSeconds - assetFor(audio.assetId, false).durationSeconds) > 0.000001) throw new InputValidationError("audio_duration_mismatch", "Audio fingerprint must describe its source duration.");
  }
  for (const reference of references.values()) {
    const asset = assetFor(reference.assetId, false);
    if (asset.kind !== "video" || Math.abs(reference.durationSeconds - asset.durationSeconds) > 0.000001) throw new InputValidationError("reference_duration_mismatch", "Reference fingerprint must describe its source video.");
    if (reference.audioFingerprintId !== null && audios.get(reference.audioFingerprintId)?.assetId !== reference.assetId) throw new InputValidationError("reference_audio_mismatch", "Reference audio must describe the reference asset.");
  }
  if (plan.metadata.referenceFingerprintId !== null && !references.has(plan.metadata.referenceFingerprintId)) throw new InputValidationError("reference_missing", "Plan references an unknown fingerprint.");
  for (const clip of plan.clips) {
    const asset = assetFor(clip.assetId, true);
    const segment = segments.get(clip.segmentId);
    if (asset.kind !== "video" || segment === undefined || segment.assetId !== clip.assetId) throw new InputValidationError("segment_asset_mismatch", "Timeline segment must belong to its declared source video.");
    if (clip.sourceRange.startSeconds < segment.sourceRange.startSeconds || clip.sourceRange.endSeconds > segment.sourceRange.endSeconds) throw new InputValidationError("source_out_of_bounds", "Timeline source range must fit the selected segment.");
    const decision = decisions.get(clip.decisionId);
    const winner = decision?.candidates.find((candidate) => candidate.candidateId === decision.winnerCandidateId)?.value;
    if (decision === undefined || decision.scope.projectId !== plan.projectId || decision.context.planId !== plan.planId || decision.context.revision !== plan.revision || decision.context.slotId !== clip.clipId || winner?.kind !== "clip_segment" || winner.segmentId !== clip.segmentId) throw new InputValidationError("decision_mismatch", "Selected clip must match a recorded decision in this plan and slot.");
  }
  if (plan.music !== null) {
    const asset = assetFor(plan.music.assetId, true);
    if (audios.get(plan.music.audioFingerprintId)?.assetId !== asset.assetId || plan.music.sourceRange.endSeconds > asset.durationSeconds) throw new InputValidationError("music_source_mismatch", "Music must fit its source and match its audio fingerprint.");
  }
  return plan;
}

export function planDigest(plan: UniversalEditPlan): string {
  return createHash("sha256").update(canonicalSerialize(UniversalEditPlanSchema.parse(plan)), "utf8").digest("hex");
}

export function assertCompatibleEmbeddingSpaces(left: EmbeddingReference, right: EmbeddingReference): void {
  if (left.spaceId !== right.spaceId || left.spaceVersion !== right.spaceVersion || left.dimensions !== right.dimensions || left.distance !== right.distance) throw new InputValidationError("embedding_space_mismatch", "Embeddings must share the same immutable space, version, dimensions, and distance function.");
}
