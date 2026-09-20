import { z } from "zod";
import { CONTRACT_VERSION, CostEventSchema, CreatorPreferenceEventSchema, DecisionEventSchema, FeedbackEventSchema, ModelRunSchema } from "../contracts/index.js";
import type { CreatorPreferenceEvent, DecisionEvent, DecisionValue, FeedbackEvent, ModelRun, TelemetryEvent } from "../domain/index.js";
import { canonicalSerialize } from "../domain/serialization.js";

const TelemetryEventSchema = z.union([DecisionEventSchema, FeedbackEventSchema, CostEventSchema, CreatorPreferenceEventSchema]);
export interface Telemetry {
  record(event: TelemetryEvent): "inserted" | "duplicate";
  recordModelRun(run: ModelRun): "inserted" | "duplicate";
}

/** Append-only snapshots for one local process. A durable implementation must transact
 * event IDs, decision IDs, operation IDs, and feedback joins before acknowledging writes.
 */
export class InMemoryTelemetry implements Telemetry {
  private readonly events = new Map<string, TelemetryEvent>();
  private readonly decisions = new Map<string, DecisionEvent>();
  private readonly latestValues = new Map<string, DecisionValue>();
  private readonly latestFeedbackTimes = new Map<string, string>();
  private readonly preferenceIds = new Set<string>();
  private readonly operations = new Set<string>();
  private readonly runs = new Map<string, ModelRun>();

  record(input: TelemetryEvent): "inserted" | "duplicate" {
    const event = TelemetryEventSchema.parse(input);
    const previous = this.events.get(event.eventId);
    if (previous !== undefined) {
      if (canonicalSerialize(previous) !== canonicalSerialize(event)) throw new Error("Event ID collision with different content.");
      return "duplicate";
    }
    if (event.contractType === "DecisionEvent") {
      if (this.decisions.has(event.decisionId)) throw new Error("Decision ID is already recorded.");
    }
    if (event.contractType === "FeedbackEvent" && event.decisionId !== null) {
      const decision = this.decisions.get(event.decisionId);
      if (decision === undefined) throw new Error("Feedback decision must already be recorded.");
      if (canonicalSerialize(decision.scope) !== canonicalSerialize(event.scope) || decision.context.planId !== event.planId || decision.context.revision !== event.revision) throw new Error("Feedback and decision scopes must match.");
      if (event.occurredAt < decision.occurredAt) throw new Error("Feedback cannot precede its decision.");
      if (event.occurredAt < (this.latestFeedbackTimes.get(event.decisionId) ?? decision.occurredAt)) throw new Error("Decision feedback must be recorded in chronological order.");
      if (event.oldValue !== null && canonicalSerialize(event.oldValue) !== canonicalSerialize(this.latestValues.get(event.decisionId))) throw new Error("Correction old value must match the last recorded decision value.");
      if (event.oldValue !== null && canonicalSerialize(event.oldValue) === canonicalSerialize(event.newValue)) throw new Error("Correction must change the value.");
    }
    if (event.contractType === "CreatorPreferenceEvent") {
      if (this.preferenceIds.has(event.preferenceId)) throw new Error("Preference ID is already recorded.");
      for (const id of event.basisFeedbackEventIds) {
        const feedback = this.events.get(id);
        if (feedback?.contractType !== "FeedbackEvent" || canonicalSerialize(feedback.scope) !== canonicalSerialize(event.scope) || feedback.occurredAt > event.occurredAt) throw new Error("Preference evidence must be prior feedback in the same scope.");
      }
      if (event.signal.kind === "pairwise_clip") {
        const signal = event.signal;
        const matches = event.basisFeedbackEventIds.some((id) => {
          const feedback = this.events.get(id);
          return feedback?.contractType === "FeedbackEvent" && feedback.action === "replaced" && feedback.decisionId === signal.contextDecisionId && feedback.oldValue?.kind === "clip_segment" && feedback.newValue?.kind === "clip_segment" && feedback.oldValue.segmentId === signal.disfavoredSegmentId && feedback.newValue.segmentId === signal.preferredSegmentId;
        });
        if (!matches) throw new Error("Pairwise preference must match a recorded replacement.");
      }
    }
    if (event.contractType === "CostEvent") {
      const key = canonicalSerialize([event.scope.projectId, event.scope.jobId, event.operationId, event.attempt]);
      if (this.operations.has(key)) throw new Error("Operation attempt cost is already recorded.");
      this.operations.add(key);
    }
    this.events.set(event.eventId, event);
    if (event.contractType === "CreatorPreferenceEvent") this.preferenceIds.add(event.preferenceId);
    if (event.contractType === "DecisionEvent") {
      this.decisions.set(event.decisionId, event);
      const winner = event.candidates.find((candidate) => candidate.candidateId === event.winnerCandidateId);
      if (winner !== undefined) this.latestValues.set(event.decisionId, winner.value);
    }
    if (event.contractType === "FeedbackEvent" && event.decisionId !== null && event.newValue !== null) this.latestValues.set(event.decisionId, event.newValue);
    if (event.contractType === "FeedbackEvent" && event.decisionId !== null) this.latestFeedbackTimes.set(event.decisionId, event.occurredAt);
    return "inserted";
  }

  recordModelRun(input: ModelRun): "inserted" | "duplicate" {
    const run = ModelRunSchema.parse(input);
    const previous = this.runs.get(run.runId);
    if (previous !== undefined) {
      if (canonicalSerialize(previous) !== canonicalSerialize(run)) throw new Error("Model run ID collision.");
      return "duplicate";
    }
    this.runs.set(run.runId, run);
    return "inserted";
  }
  snapshot(): TelemetryEvent[] { return structuredClone([...this.events.values()]); }
  modelRuns(): ModelRun[] { return structuredClone([...this.runs.values()]); }
}

/** A contextual label, not a global preference, quality score, or trained model. */
export function deriveReplacementPreference(input: FeedbackEvent): CreatorPreferenceEvent | null {
  const feedback = FeedbackEventSchema.parse(input);
  if (feedback.action !== "replaced" || feedback.decisionId === null || feedback.oldValue?.kind !== "clip_segment" || feedback.newValue?.kind !== "clip_segment") return null;
  return CreatorPreferenceEventSchema.parse({
    contractType: "CreatorPreferenceEvent", schemaVersion: CONTRACT_VERSION,
    eventId: `${feedback.eventId}.preference`, preferenceId: `${feedback.eventId}.pairwise`, scope: feedback.scope, occurredAt: feedback.occurredAt,
    basisFeedbackEventIds: [feedback.eventId],
    signal: { kind: "pairwise_clip", preferredSegmentId: feedback.newValue.segmentId, disfavoredSegmentId: feedback.oldValue.segmentId, contextDecisionId: feedback.decisionId },
    evidenceStrength: "explicit_correction", derivationVersion: "replacement-rule-1.0.0",
  });
}
