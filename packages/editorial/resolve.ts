import { z } from "zod";
import { ClipSegmentSchema, IdSchema, ModelRunSchema } from "../contracts/index.js";
import { CandidateSchema, FootageAnalysisSchema, FootageConfigSchema, FOOTAGE_VERSION, NumericSignalsSchema, type Candidate, type CandidateEvidence, type CheapEvidence, type SemanticFrame } from "../footage-analyzer/protocol.js";
import { contentId } from "../reference-analyzer/features.js";
import { EMBEDDING_IMPLEMENTATION, embeddingCacheKey, embeddingSpaceId } from "../reference-analyzer/embeddings.js";
import { assertCompatibleEmbeddingSpaces } from "../validation/index.js";
import { ArtifactRefSchema, EditorialArtifactMap, EvidenceRefSchema, MissingSchema, ProducerSchema, ensure, equal, missing, present, unique, type ArtifactRef, type Availability, type EvidenceRef, type Feature, type Producer } from "./common.js";
import { CheapSignalNameSchema, EditorialTokenSchema, createEditorialToken, temporalGetters, type CheapSignalName, type EditorialToken, type Locality } from "./token.js";

const FootageRunMinimumSchema = z.strictObject({ jobId: IdSchema, status: z.enum(["succeeded", "partial", "failed"]), configuration: FootageConfigSchema, modelRuns: z.array(ModelRunSchema).max(4096) })
  .refine((r) => unique(r.modelRuns.map((m) => m.runId)), "Duplicate model run IDs.");
function record(input: unknown): Record<string, unknown> {
  ensure(input !== null && typeof input === "object" && !Array.isArray(input), "Expected JSON object.");
  return input as Record<string, unknown>;
}
export function resolveFootageRun(ref: ArtifactRef, artifacts: EditorialArtifactMap) {
  ensure(ref.artifactType === "FootageRun" && ref.artifactVersion === "legacy-unversioned", "Expected source footage run.");
  const rawRun = record(artifacts.get(ref));
  // Legacy run has additional telemetry: validate a minimum projection, keep the exact full hash.
  return FootageRunMinimumSchema.parse({ jobId: rawRun.jobId, status: rawRun.status, configuration: rawRun.configuration, modelRuns: rawRun.modelRuns });
}
export function validateProducerEvidence(producerInput: Producer, artifacts: EditorialArtifactMap): Producer {
  const p = ProducerSchema.parse(producerInput);
  artifacts.resolve(p.configuration);
  for (const ref of p.sourceEvidence) artifacts.resolve(ref);
  if (p.implementation.state === "present") artifacts.resolve(p.implementation.value);
  if (p.runEvidence.state === "present") for (const ref of p.runEvidence.value) artifacts.resolve(ref);
  return p;
}
function support<T extends { sampleId: string; shotId: string; atSeconds: number }>(all: readonly T[], candidate: Candidate) {
  const group = all.filter((f) => f.shotId === candidate.shotId);
  ensure(group.length > 0, "Source shot has no supplied support.");
  const { startSeconds: s, endSeconds: e } = candidate.sourceRange;
  const inside = group.filter((f) => s <= f.atSeconds && f.atSeconds < e);
  if (inside.length) return { frames: inside, kind: "within_segment" as const };
  const sorted = [...group].sort((a, b) => Math.abs(a.atSeconds - (s + e) / 2) - Math.abs(b.atSeconds - (s + e) / 2) || a.atSeconds - b.atSeconds);
  return { frames: [sorted[0]!], kind: "same_shot_context" as const };
}
export function resolveLocality(candidate: Candidate, evidence: CandidateEvidence, frames: readonly SemanticFrame[]): Locality {
  ensure(equal(candidate, evidence.candidate), "Candidate identity mismatch.");
  const selected = support(frames, candidate);
  ensure(equal(selected.frames.map((f) => f.sampleId), evidence.contributingSemanticFrameIds), "Ordered semantic support identity mismatch.");
  ensure(selected.kind === evidence.semanticSupport, "Semantic support membership mismatch.");
  const supports = selected.frames.map((f) => ({ semanticFrameId: f.sampleId, distanceToIntervalSeconds: Math.max(candidate.sourceRange.startSeconds - f.atSeconds, f.atSeconds - candidate.sourceRange.endSeconds, 0) }));
  const nearestEvidenceDistanceSeconds = Math.min(...supports.map((s) => s.distanceToIntervalSeconds));
  ensure(Math.abs(nearestEvidenceDistanceSeconds - evidence.semanticContextDistanceSeconds) <= 1e-6, "Semantic context distance mismatch.");
  return { support: selected.kind, supports, nearestEvidenceDistanceSeconds, distancePolicy: "interval-distance-half-open-membership-v1" };
}

/** Specific null causality is derivable only when the actual aggregator implementation
 * is bound by supplied source evidence. Unknown legacy causality remains unknown.
 */
export function resolveCheapMissingness(evidence: CandidateEvidence, cheap: readonly CheapEvidence[], contributions: EvidenceRef, currentImplementationVerified: boolean) {
  const selected = support(cheap.map((f) => f.sample), evidence.candidate);
  ensure(selected.kind === evidence.cheapSupport && equal(selected.frames.map((f) => f.sampleId), evidence.contributingCheapSampleIds), "Cheap support identity mismatch.");
  const ids = new Set(evidence.contributingCheapSampleIds);
  const features = evidence.contributingCheapSampleIds.map((id, i) => {
    const f = cheap.find((c) => c.sample.sampleId === id);
    ensure(f && f.measurementId === evidence.contributingMeasurementIds[i], "Cheap measurement identity mismatch.");
    return f;
  });
  const pairs = evidence.cheapSupport === "within_segment" ? features.filter((f) => f.measurement.comparisonSampleId !== null && ids.has(f.measurement.comparisonSampleId)) : [];
  for (const signal of ["frameDifferenceMean", "opticalFlowPixelsPerSecond", "stabilityIndicator"] as const) {
    if (evidence.signals[signal] === null) continue;
    ensure(evidence.cheapSupport === "within_segment", "Borrowed cheap support cannot supply in-window temporal flow.");
    const values = signal === "frameDifferenceMean"
      ? pairs.filter((f) => f.measurement.frameDifferenceMean !== null).map((f) => f.measurement.frameDifferenceMean!)
      : pairs.filter((f) => f.measurement.opticalFlowMeanPixels !== null && f.measurement.comparisonIntervalSeconds !== null).map((f) => f.measurement.opticalFlowMeanPixels! / f.measurement.comparisonIntervalSeconds!);
    ensure(values.length > 0, "Temporal signal lacks an eligible in-window pair.");
    if (currentImplementationVerified) {
      const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
      const expected = signal === "stabilityIndicator" ? 1 / (1 + mean / 10) : mean;
      ensure(Math.abs(expected - evidence.signals[signal]!) <= 1e-6, "Temporal signal contradicts comparison-pair evidence.");
    }
  }
  return CheapSignalNameSchema.options.filter((signal) => evidence.signals[signal] === null).map((signal) => {
    const eligible = signal === "frameDifferenceMean" ? pairs.filter((f) => f.measurement.frameDifferenceMean !== null) : pairs.filter((f) => f.measurement.opticalFlowMeanPixels !== null && f.measurement.comparisonIntervalSeconds !== null);
    if (currentImplementationVerified) ensure(eligible.length === 0, "Null signal conflicts with eligible measurement evidence.");
    return { signal, ...missing("unavailable", currentImplementationVerified ? "no_eligible_temporal_pair" : "legacy_reason_unknown", [contributions]) };
  });
}
export interface TokenResolutionInput {
  readonly projectId: string;
  readonly candidate: Candidate;
  readonly analysis: ArtifactRef;
  readonly producingRun: { readonly jobId: string; readonly artifact: ArtifactRef };
  readonly clipSegment: Availability<EvidenceRef>;
  readonly adapter: Producer;
  readonly featureProducer: Producer;
  /** Exact descriptor of the known source implementation; absence means legacy causality. */
  readonly aggregationImplementation: Availability<EvidenceRef>;
}
const AGGREGATOR_SHA256 = "46024d6af6743868e30504cf35cb26c1acfcc1eb5025e35544744edd273c0cf8";
const ImplementationDescriptorSchema = z.strictObject({ implementationId: z.literal("CandidateFeatureAggregator"), aggregationVersion: z.literal("footage-evidence-v1"), sourceSha256: z.literal(AGGREGATOR_SHA256) });

export function resolveEditorialToken(input: TokenResolutionInput, artifacts: EditorialArtifactMap): EditorialToken {
  IdSchema.parse(input.projectId); CandidateSchema.parse(input.candidate);
  ArtifactRefSchema.parse(input.analysis);
  const analysis = FootageAnalysisSchema.parse(artifacts.get(input.analysis));
  const c = input.candidate;
  ensure(input.projectId === analysis.authorization.projectId, "Project identity mismatch.");
  ensure(c.assetId === analysis.assetId, "Asset identity mismatch.");
  const index = analysis.candidates.findIndex((v) => v.candidate.candidateId === c.candidateId);
  ensure(index >= 0, "Candidate identity missing from analysis.");
  const evidence = analysis.candidates[index]!;
  ensure(equal(c, evidence.candidate), "Candidate/proposal/temporal identity mismatch.");
  ensure(c.proposalConfigurationId === contentId("proposal", [analysis.configuration.proposal, analysis.cheapFeatures.map((f) => f.measurementId)]), "Proposal identity mismatch.");
  ensure(c.candidateId === contentId("segment", [c.assetId, c.shotId, c.sourceRange, c.proposalConfigurationId]), "Candidate content identity mismatch.");
  const run = resolveFootageRun(input.producingRun.artifact, artifacts);
  ensure(run.status !== "failed" && run.jobId === input.producingRun.jobId, "Producing run identity/status mismatch.");
  ensure(equal(run.configuration, analysis.configuration), "Run/configuration identity mismatch.");
  for (const m of run.modelRuns) ensure(m.scope.projectId === input.projectId && m.scope.jobId === run.jobId && m.scope.creatorId === analysis.authorization.creatorId, "Run/project/creator provenance mismatch.");
  ensure(run.modelRuns.some((m) => m.status === "succeeded" && (m.inputIds.includes(c.assetId) || m.outputIds.includes(c.assetId))), "Run lacks source-asset evidence.");
  const at = (pointer: string): EvidenceRef => ({ artifact: input.analysis, pointer });
  const candidateEvidence = at(`/candidates/${index}`), configuration = at("/configuration"), implementation = at("/embeddingImplementation");
  ensure(equal(analysis.embeddingImplementation, EMBEDDING_IMPLEMENTATION), "Embedding implementation identity mismatch.");
  const expectedSpace = { ...evidence.semanticEmbedding, spaceId: embeddingSpaceId(analysis.configuration.embedding), spaceVersion: "normalized-mean-v1", distance: "cosine" as const, dimensions: analysis.configuration.embedding.mode === "siglip" ? 1152 : evidence.semanticEmbedding.dimensions };
  assertCompatibleEmbeddingSpaces(expectedSpace, evidence.semanticEmbedding);
  for (const f of analysis.semanticFrames) {
    assertCompatibleEmbeddingSpaces(expectedSpace, f.embedding);
    ensure(f.embedding.objectId === embeddingCacheKey(analysis.contentHash, [contentId("sample", ["decoded-png-v1", f.frameContentHash])], analysis.configuration.embedding, "frame"), "Frame embedding cache identity mismatch.");
  }
  const frames = evidence.contributingSemanticFrameIds.map((id) => analysis.semanticFrames.find((f) => f.sampleId === id)!);
  ensure(evidence.semanticEmbedding.objectId === embeddingCacheKey(analysis.contentHash, frames.map((f) => f.embedding.embeddingId), analysis.configuration.embedding, "normalized-mean-v1"), "Aggregate cache identity mismatch.");
  ensure(evidence.aggregationId === contentId("aggregation", [c, frames.map((f) => f.embedding), evidence.contributingMeasurementIds, evidence.aggregationVersion]), "Aggregation identity mismatch.");
  const featureProducer = validateProducerEvidence(input.featureProducer, artifacts), adapter = validateProducerEvidence(input.adapter, artifacts);
  ensure(featureProducer.producerId === "footage_analyzer" && featureProducer.producerVersion === FOOTAGE_VERSION, "Feature producer identity mismatch.");
  ensure(equal(featureProducer.configuration, configuration), "Feature configuration reference mismatch.");
  ensure(featureProducer.sourceEvidence.some((r) => equal(r, candidateEvidence)) && featureProducer.sourceEvidence.some((r) => equal(r, at("/authorization"))), "Feature source/authorization evidence missing.");
  ensure(featureProducer.runEvidence.state === "present" && featureProducer.runEvidence.value.some((r) => equal(r.artifact, input.producingRun.artifact)), "Feature producing run mismatch.");
  ensure(featureProducer.implementation.state === "present" && equal(featureProducer.implementation.value, implementation), "Feature implementation reference mismatch.");
  const stub = analysis.configuration.embedding.mode === "stub";
  ensure(stub ? featureProducer.computationBasis === "synthetic_stub" && analysis.authorization.sourceType === "synthetic" : featureProducer.computationBasis === "cached_real_model", "Computation basis mismatch; resolver reads existing model evidence only.");
  ensure(featureProducer.mediaBasis === (analysis.authorization.sourceType === "synthetic" ? "synthetic" : "real_footage"), "Media provenance mismatch.");
  ensure(adapter.computationBasis === "deterministic" && adapter.mediaBasis === featureProducer.mediaBasis, "Adapter provenance mismatch.");
  ensure(adapter.sourceEvidence.some((r) => equal(r, candidateEvidence)), "Adapter source evidence missing.");
  let knownImplementation = false;
  if (input.aggregationImplementation.state === "present") {
    ImplementationDescriptorSchema.parse(artifacts.resolve(input.aggregationImplementation.value)); knownImplementation = true;
  } else MissingSchema.parse(input.aggregationImplementation);
  if (input.clipSegment.state === "present") {
    EvidenceRefSchema.parse(input.clipSegment.value);
    const clip = ClipSegmentSchema.parse(artifacts.resolve(input.clipSegment.value));
    ensure(clip.segmentId === c.candidateId && clip.assetId === c.assetId && equal(clip.sourceRange, c.sourceRange), "Clip candidate/asset/temporal identity mismatch.");
    ensure(analysis.keptCandidateIds.includes(c.candidateId), "Clip refers to a pruned candidate.");
    ensure(clip.semanticEmbedding !== null, "Clip semantic evidence missing.");
    assertCompatibleEmbeddingSpaces(clip.semanticEmbedding, evidence.semanticEmbedding);
    ensure(equal(clip.semanticEmbedding, evidence.semanticEmbedding), "Clip embedding identity mismatch.");
    ensure(clip.provenance.producer === "footage_analyzer" && clip.provenance.producerVersion === FOOTAGE_VERSION && unique(clip.provenance.modelRunIds) && clip.provenance.modelRunIds.every((id) => run.modelRuns.some((r) => r.runId === id && r.status === "succeeded")), "Clip producing run identity mismatch.");
  } else MissingSchema.parse(input.clipSegment);
  const shotIndex = analysis.shots.findIndex((s) => s.shotId === c.shotId), shot = analysis.shots[shotIndex]!;
  const deferred = { provenance: adapter, data: missing("not_computed", "channel_deferred", [adapter.configuration]) };
  return createEditorialToken({
    artifactType: "EditorialToken", artifactVersion: "0.1.0", stability: "internal_pre_stable", projectId: input.projectId, sourceHash: analysis.contentHash, candidate: c,
    analysis: { analysisId: analysis.analysisId, configurationId: analysis.configurationId, artifact: input.analysis }, producingRun: input.producingRun, candidateEvidence, clipSegment: input.clipSegment,
    temporal: { provenance: adapter, data: present({ sourceDurationSeconds: analysis.metadata.durationSeconds, shotRange: { startSeconds: shot.startSeconds, endSeconds: shot.endSeconds }, sourcePosition: { startFraction: c.sourceRange.startSeconds / analysis.metadata.durationSeconds, endFraction: c.sourceRange.endSeconds / analysis.metadata.durationSeconds }, shotPosition: { startSeconds: c.sourceRange.startSeconds - shot.startSeconds, endSeconds: c.sourceRange.endSeconds - shot.startSeconds }, previousShot: shotIndex === 0 ? missing("not_applicable", "source_boundary", [at("/shots")]) : present(at(`/shots/${shotIndex - 1}`)), nextShot: shotIndex === analysis.shots.length - 1 ? missing("not_applicable", "source_boundary", [at("/shots")]) : present(at(`/shots/${shotIndex + 1}`)) }) },
    semantic: { provenance: featureProducer, data: present({ embedding: evidence.semanticEmbedding, modelConfiguration: at("/configuration/embedding"), aggregationId: evidence.aggregationId, aggregationVersion: evidence.aggregationVersion, locality: resolveLocality(c, evidence, analysis.semanticFrames) }) },
    cheap: { provenance: { ...featureProducer, computationBasis: "deterministic" }, data: present({ signals: at(`/candidates/${index}/signals`), contributions: candidateEvidence, support: evidence.cheapSupport, missingSignals: resolveCheapMissingness(evidence, analysis.cheapFeatures, candidateEvidence, knownImplementation).map((s) => ({ ...s, evidenceRefs: input.aggregationImplementation.state === "present" ? [...s.evidenceRefs, input.aggregationImplementation.value] : s.evidenceRefs })) }) },
    future: { temporalMotion: deferred, qualityAesthetic: deferred, speechAudio: deferred, music: deferred, referenceStyle: deferred },
  });
}

/** An unavailable bundle stays unavailable; a ClipSegment is never sufficient input. */
export function resolveAvailableToken(input: Availability<TokenResolutionInput>, artifacts: EditorialArtifactMap): Availability<EditorialToken> {
  return input.state === "present" ? present(resolveEditorialToken(input.value, artifacts)) : MissingSchema.parse(input);
}
/** Structural identity alone does not attest to the contents of referenced sidecars. */
export function validateTokenEvidence(input: EditorialToken, artifacts: EditorialArtifactMap): EditorialToken {
  const token = EditorialTokenSchema.parse(input);
  let aggregationImplementation: Availability<EvidenceRef> = missing("unavailable", "legacy_reason_unknown");
  if (token.cheap.data.state === "present") {
    const refs = token.cheap.data.value.missingSignals.flatMap((s) => s.evidenceRefs);
    for (const ref of refs) {
      const value = artifacts.resolve(ref);
      if (ImplementationDescriptorSchema.safeParse(value).success) aggregationImplementation = present(ref);
    }
  }
  const resolved = resolveEditorialToken({
    projectId: token.projectId, candidate: token.candidate, analysis: token.analysis.artifact,
    producingRun: token.producingRun, clipSegment: token.clipSegment,
    adapter: token.temporal.provenance, featureProducer: token.semantic.provenance, aggregationImplementation,
  }, artifacts);
  for (const key of ["sourceHash", "analysis", "producingRun", "candidateEvidence", "clipSegment"] as const) ensure(equal(token[key], resolved[key]), `Token ${key} contradicts source evidence.`);
  for (const key of ["temporal", "semantic", "cheap"] as const) {
    validateProducerEvidence(token[key].provenance, artifacts);
    if (token[key].data.state === "present") ensure(equal(token[key], resolved[key]), `Token ${key} contradicts source evidence.`);
    else for (const ref of token[key].data.evidenceRefs) artifacts.resolve(ref);
  }
  for (const channel of Object.values(token.future)) {
    ensure(equal(channel.provenance, resolved.temporal.provenance), "Deferred channel producer must match the resolved declaration adapter.");
    validateProducerEvidence(channel.provenance, artifacts);
    for (const ref of channel.data.evidenceRefs) artifacts.resolve(ref);
  }
  return token;
}
export function resolveTokenView(input: EditorialToken, artifacts: EditorialArtifactMap) {
  const token = validateTokenEvidence(input, artifacts);
  const signals: Partial<Record<CheapSignalName, Feature<number>>> = {};
  if (token.cheap.data.state === "present") {
    const channel = token.cheap.data.value, values = NumericSignalsSchema.parse(artifacts.resolve(channel.signals));
    ensure(equal(channel.missingSignals.map((s) => s.signal).sort(), CheapSignalNameSchema.options.filter((name) => values[name] === null).sort()), "Cheap missingness must cover exactly null signals.");
    for (const signal of CheapSignalNameSchema.options) {
      const value = values[signal], absent = channel.missingSignals.find((s) => s.signal === signal);
      signals[signal] = { provenance: token.cheap.provenance, data: value === null ? missing(absent!.state, absent!.reasonCode, absent!.evidenceRefs) : present(value) };
    }
  }
  return { token, ...temporalGetters(token), signals, modelConfiguration: token.semantic.data.state === "present" ? present(artifacts.resolve(token.semantic.data.value.modelConfiguration)) : token.semantic.data };
}
