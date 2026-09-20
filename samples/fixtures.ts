import { AudioFingerprintSchema, ClipSegmentSchema, CONTRACT_VERSION, CostEventSchema, DecisionEventSchema, FeedbackEventSchema, JobStateSchema, MediaAssetSchema, ReferenceFingerprintSchema, UniversalEditPlanSchema } from "../packages/contracts/index.js";
import type { AudioFingerprint, ClipSegment, CostEvent, DecisionEvent, FeedbackEvent, JobState, MediaAsset, ReferenceFingerprint, UniversalEditPlan } from "../packages/domain/index.js";
import { benchmarkCasesDigest, verifyBenchmark } from "../packages/evaluation/index.js";

export const FIXTURE_TIME = "2026-09-13T00:00:00.000Z";
export const fixtureScope = { projectId: "project_synthetic", jobId: "job_synthetic", creatorId: "creator_synthetic", environment: "synthetic" } as const;
export interface FixtureSet {
  assets: MediaAsset[];
  reference: ReferenceFingerprint;
  segments: ClipSegment[];
  audio: AudioFingerprint;
  plan: UniversalEditPlan;
  decisions: DecisionEvent[];
  job: JobState;
}
export function createFixtures(): FixtureSet {
  const provenance = { producer: "synthetic_fixture", producerVersion: "1.0.0", modelRunIds: [], createdAt: FIXTURE_TIME };
  const annotations = {
    shotType: "medium", subjectCount: 1, motion: { camera: "static", subject: "medium" },
    composition: { framing: "medium", subjectPosition: "center" }, quality: { sharpness: null, exposure: null, stability: null },
    semantics: { description: "Synthetic subject in a plain scene. No media file exists.", tags: ["synthetic"] },
  } as const;
  const assets = [
    { assetId: "asset_reference", kind: "video", durationSeconds: 20 },
    { assetId: "asset_red", kind: "video", durationSeconds: 12 },
    { assetId: "asset_scene", kind: "video", durationSeconds: 14 },
    { assetId: "asset_alternative", kind: "video", durationSeconds: 8 },
    { assetId: "asset_music", kind: "audio", durationSeconds: 20 },
  ].map((asset) => MediaAssetSchema.parse({
    contractType: "MediaAsset", schemaVersion: CONTRACT_VERSION, ...asset, projectId: fixtureScope.projectId, creatorId: fixtureScope.creatorId,
    objectId: `object_${asset.assetId}`, origin: "synthetic", retention: { expiresAt: null, deletionRequestedAt: null },
  }));
  const recipe = [
    { segmentId: "segment_hook", assetId: "asset_red", start: 1, end: 4, outputStart: 0, role: "hook" },
    { segmentId: "segment_setup", assetId: "asset_scene", start: 0, end: 5, outputStart: 3, role: "setup" },
    { segmentId: "segment_build", assetId: "asset_red", start: 5, end: 11, outputStart: 8, role: "build" },
    { segmentId: "segment_hero", assetId: "asset_scene", start: 6, end: 12, outputStart: 14, role: "hero" },
  ] as const;
  const segments = [...recipe, { segmentId: "segment_alternative", assetId: "asset_alternative", start: 0, end: 6 }].map((item) => ClipSegmentSchema.parse({
    contractType: "ClipSegment", schemaVersion: CONTRACT_VERSION, segmentId: item.segmentId, assetId: item.assetId,
    sourceRange: { startSeconds: item.start, endSeconds: item.end }, ...annotations, facePresence: "unknown", personPresence: "present",
    poseTags: [], semanticEmbedding: null, motionEmbedding: null, provenance,
  }));
  const reference = ReferenceFingerprintSchema.parse({
    contractType: "ReferenceFingerprint", schemaVersion: CONTRACT_VERSION, fingerprintId: "reference_synthetic", assetId: "asset_reference",
    durationSeconds: 20, fps: { numerator: 30, denominator: 1 }, aspectRatio: { width: 9, height: 16 },
    shots: recipe.map((item, index) => ({ shotId: `shot_${index}`, sourceRange: { startSeconds: item.outputStart, endSeconds: item.outputStart + item.end - item.start }, role: item.role, ...annotations, transitionOut: { type: "cut" } })),
    structure: recipe.map((item) => ({ role: item.role, range: { startSeconds: item.outputStart, endSeconds: item.outputStart + item.end - item.start } })),
    pacing: { averageShotLengthSeconds: 5, shotsPerSecond: 0.2, trend: "decelerating" }, audioFingerprintId: null,
    captions: { density: "sparse", position: "lower", styleHint: "clean" }, style: { family: "synthetic_lifestyle", category: "lifestyle", energy: null }, provenance,
  });
  const audio = AudioFingerprintSchema.parse({
    contractType: "AudioFingerprint", schemaVersion: CONTRACT_VERSION, fingerprintId: "audio_synthetic", assetId: "asset_music", durationSeconds: 20,
    bpm: 120, beatsSeconds: Array.from({ length: 40 }, (_, index) => index / 2), downbeatsSeconds: Array.from({ length: 10 }, (_, index) => index * 2),
    energy: [{ atSeconds: 0, energy: 0.2 }, { atSeconds: 8, energy: 0.5 }, { atSeconds: 14, energy: 0.9 }, { atSeconds: 19, energy: 0.7 }],
    mainDropSeconds: 14, phraseBoundariesSeconds: [0, 8, 14], speechRegions: [], language: null, provenance,
  });
  const decisions = recipe.map((item, index) => DecisionEventSchema.parse({
    contractType: "DecisionEvent", schemaVersion: CONTRACT_VERSION, eventId: `event_decision_${index}`, decisionId: `decision_${index}`,
    scope: fixtureScope, occurredAt: FIXTURE_TIME, decisionKind: "clip_selection",
    context: { planId: "plan_synthetic_v0", revision: 0, slotId: `timeline_${index}`, referenceFingerprintId: reference.fingerprintId, audioFingerprintId: audio.fingerprintId, creatorMemoryRevision: null, featureSetVersion: "synthetic-features-1", features: [{ kind: "numeric", name: "target_duration_seconds", value: item.end - item.start }] },
    candidates: [
      { candidateId: `candidate_${index}_chosen`, value: { kind: "clip_segment", segmentId: item.segmentId }, features: [{ kind: "boolean", name: "fixture_selected", value: true }], score: 1 },
      { candidateId: `candidate_${index}_alternative`, value: { kind: "clip_segment", segmentId: "segment_alternative" }, features: [{ kind: "boolean", name: "fixture_selected", value: false }], score: 0 },
    ],
    winnerCandidateId: `candidate_${index}_chosen`, confidence: 1,
    policy: { kind: "rule", name: "fixed_synthetic_recipe", version: "1.0.0" }, modelRunIds: [],
  }));
  const plan = UniversalEditPlanSchema.parse({
    contractType: "UniversalEditPlan", schemaVersion: CONTRACT_VERSION, planId: "plan_synthetic_v0", projectId: fixtureScope.projectId, revision: 0, parentPlanId: null,
    output: { aspectRatio: "9:16", resolution: { width: 1080, height: 1920 }, fps: { numerator: 30, denominator: 1 }, targetDurationSeconds: 20 },
    clips: recipe.map((item, index) => ({ clipId: `timeline_${index}`, segmentId: item.segmentId, assetId: item.assetId, sourceRange: { startSeconds: item.start, endSeconds: item.end }, outputStartSeconds: item.outputStart, role: item.role, speed: 1, transform: { fit: "cover", focalPoint: { x: 0.5, y: 0.5 }, scale: 1 }, sourceAudioGain: 0, transitionOut: { type: "cut" }, reason: "Fixed synthetic recipe; no matching algorithm or model was run.", confidence: 1, decisionId: `decision_${index}` })),
    music: { assetId: "asset_music", audioFingerprintId: audio.fingerprintId, sourceRange: { startSeconds: 0, endSeconds: 20 }, outputStartSeconds: 0, gain: 0.7, fadeInSeconds: 0.25, fadeOutSeconds: 0.5 },
    captions: [{ captionId: "caption_synthetic", range: { startSeconds: 0, endSeconds: 3 }, text: "మొదటి అడుగు", language: "te", position: "lower", style: "clean" }], overlays: [], effects: [],
    metadata: { planner: "fixture_planner", plannerVersion: "1.0.0", modelRunIds: [], referenceFingerprintId: reference.fingerprintId, createdAt: FIXTURE_TIME },
  });
  const job = JobStateSchema.parse({
    contractType: "JobState", schemaVersion: CONTRACT_VERSION, jobId: fixtureScope.jobId, projectId: fixtureScope.projectId,
    state: "UPLOADED", stateVersion: 0, attempt: 1, revision: 0, activePlanId: null, activeRenderId: null, activeRenderKind: null, renderIntent: null, failure: null, createdAt: FIXTURE_TIME, updatedAt: FIXTURE_TIME,
  });
  return { assets, reference, segments, audio, plan, decisions, job };
}

export function createSyntheticCost(operation: CostEvent["operation"], suffix: string, costInrMicros = 0): CostEvent {
  return CostEventSchema.parse({
    contractType: "CostEvent", schemaVersion: CONTRACT_VERSION, eventId: `event_cost_${suffix}`, scope: fixtureScope, occurredAt: FIXTURE_TIME,
    operationId: `operation_${suffix}`, attempt: 1, provider: "local", tool: "synthetic_fixture", model: null, modelRunId: null,
    operation, durationMilliseconds: 0, units: [{ unit: "operations", quantity: 1 }], costInrMicros, costSource: "synthetic",
  });
}
export function createSyntheticFeedback(action: "accepted" | "downloaded" | "regenerated" | "rejected" = "accepted"): FeedbackEvent {
  return FeedbackEventSchema.parse({
    contractType: "FeedbackEvent", schemaVersion: CONTRACT_VERSION, eventId: `event_feedback_${action}`, scope: fixtureScope, occurredAt: FIXTURE_TIME,
    action, planId: "plan_synthetic_v0", revision: 0, renderId: "render_synthetic", decisionId: null, oldValue: null, newValue: null, interventionMilliseconds: null,
  });
}
export function createSyntheticBenchmark() {
  const cases = [{ caseId: "case_contract_example", creatorGroupId: "creator_synthetic", candidateSegmentIds: ["segment_hook", "segment_alternative"], acceptableSegmentIds: ["segment_hook"], referenceFingerprintId: "reference_synthetic", audioFingerprintId: "audio_synthetic", slotRole: "hook" as const }];
  return verifyBenchmark({ contractType: "BenchmarkManifest", schemaVersion: CONTRACT_VERSION, benchmarkId: "benchmark_contract_example", benchmarkVersion: "1.0.0", provenance: "synthetic", split: "test", splitUnit: "creator", frozenAt: FIXTURE_TIME, cases, casesDigest: benchmarkCasesDigest(cases) });
}
