import { z } from "zod";
import { EmbeddingReferenceSchema, IdSchema, TimeRangeSchema, TimestampSchema } from "../contracts/index.js";
import { AuthorizationManifestSchema, DetectorConfigSchema, EmbeddingConfigSchema, HashSchema, MeasurementSchema, MetadataSchema, SampleSchema, ShotSchema, validateAuthorizationProvenance } from "../reference-analyzer/protocol.js";
import { siglipConfiguration, SIGLIP_MODELS } from "../reference-analyzer/models.js";
import { contentId } from "../reference-analyzer/features.js";
import { assertCompatibleEmbeddingSpaces } from "../validation/index.js";

export const FOOTAGE_VERSION = "0.2.0";
export const CHEAP_VERSION = "shot-budget-pts-v1";
export const SEMANTIC_VERSION = "events-coverage-v1";
export const PROPOSAL_VERSION = "coverage-multiscale-v1";
export const AGGREGATION_VERSION = "footage-evidence-v1";
export const MEASUREMENT_VERSION = "opencv-temporal-v1";

/** AuthorizedFootage 1.0.0, exactly as accepted: its meaning never changes. */
export const FootageAuthorizationV1Schema = z.strictObject({
  ...AuthorizationManifestSchema.shape, manifestType: z.literal("AuthorizedFootage"),
  allowedPurposes: z.array(z.enum(["local_footage_analysis", "local_evaluation"])).min(1).max(2),
}).superRefine(validateAuthorizationProvenance);
export type FootageAuthorizationV1 = z.infer<typeof FootageAuthorizationV1Schema>;
/*
 * AuthorizedFootage 1.1.0 (Gate 7 Batch 3E-B1A) adds two footage-only forms and widens nothing in 1.0.0 or in the shared
 * AuthorizedReference contract:
 * - a root: owner-supplied media whose owner gave explicit consent to local canonicalization (an owner who does not consent keeps
 *   using 1.0.0);
 * - a derived record: bytes the system canonicalized from exactly one such root. It says so (`system_canonicalized`), inherits the
 *   root's rights basis and scope, never gains a purpose, carries no consent of its own, and binds its root, derivation and recipe.
 * The consent is its own field, never an allowed purpose: every form keeps exactly the 1.0.0 purpose vocabulary, so a purpose-scoped
 * consumer can never be authorized by consent (owner ruling after the self-found purpose-label red). Depth is exactly one: a
 * derived record's root is a root form, which carries no lineage. Synthetic media stays 1.0.0.
 */
const OwnerBasisSchema = z.enum(["owner_created", "permission_granted"]);
const FootagePurposesSchema = z.array(z.enum(["local_footage_analysis", "local_evaluation"])).min(1).max(2);
const FootageAuthorizationRootSchema = z.strictObject({
  manifestType: z.literal("AuthorizedFootage"), schemaVersion: z.literal("1.1.0"), contentHash: HashSchema, sizeBytes: z.number().int().positive().safe(),
  sourceType: z.literal("owner_supplied"), authorizationBasis: OwnerBasisSchema, allowedPurposes: FootagePurposesSchema,
  canonicalizationConsent: z.literal("local_media_canonicalization"), dateAdded: TimestampSchema, creatorId: IdSchema, projectId: IdSchema,
}).superRefine(validateAuthorizationProvenance);
const FootageAuthorizationDerivedSchema = z.strictObject({
  manifestType: z.literal("AuthorizedFootage"), schemaVersion: z.literal("1.1.0"), contentHash: HashSchema, sizeBytes: z.number().int().positive().safe(),
  sourceType: z.literal("system_canonicalized"), authorizationBasis: OwnerBasisSchema, allowedPurposes: FootagePurposesSchema,
  dateAdded: TimestampSchema, creatorId: IdSchema, projectId: IdSchema,
  derivedFrom: z.strictObject({ rootAuthorization: FootageAuthorizationRootSchema, derivationId: IdSchema, recipeId: IdSchema }),
}).superRefine((value, ctx) => {
  const issue = (message: string) => ctx.addIssue({ code: "custom", message });
  validateAuthorizationProvenance(value, ctx);
  const root = value.derivedFrom.rootAuthorization;
  if (value.contentHash === root.contentHash) issue("A derived record names bytes distinct from its root.");
  if (value.authorizationBasis !== root.authorizationBasis) issue("A derived record inherits exactly its root's rights basis.");
  if (value.creatorId !== root.creatorId || value.projectId !== root.projectId) issue("A derived record keeps exactly its root's creator and project.");
  if (value.dateAdded < root.dateAdded) issue("A derived record is never dated before its root.");
  if (!value.allowedPurposes.every(purpose => root.allowedPurposes.includes(purpose))) issue("A derived record never gains a purpose its root did not grant.");
});
export type FootageAuthorizationRoot = z.infer<typeof FootageAuthorizationRootSchema>;
export type FootageAuthorizationDerived = z.infer<typeof FootageAuthorizationDerivedSchema>;
export { FootageAuthorizationDerivedSchema, FootageAuthorizationRootSchema };
/** Every accepted AuthorizedFootage form. A 1.0.0 record parses exactly as before; each form is identified by version and source type. */
export const FootageAuthorizationSchema = z.union([FootageAuthorizationV1Schema, FootageAuthorizationRootSchema, FootageAuthorizationDerivedSchema]);
export type FootageAuthorization = z.infer<typeof FootageAuthorizationSchema>;
// Authorization is checked per asset, so one invalid attestation cannot erase other results.
export const FootageManifestSchema = z.strictObject({
  manifestType: z.literal("AuthorizedFootageSet"), schemaVersion: z.literal("1.0.0"), creatorId: IdSchema, projectId: IdSchema,
  assets: z.array(z.strictObject({ entryId: IdSchema, path: z.string().min(1).max(4096), authorization: z.unknown() })).min(1).max(16),
}).refine((value) => new Set(value.assets.map((item) => item.entryId)).size === value.assets.length, "Manifest entry IDs must be unique.");
export type FootageManifest = z.infer<typeof FootageManifestSchema>;
export const CheapConfigSchema = z.strictObject({ version: z.literal(CHEAP_VERSION), targetSamplesPerSecond: z.number().min(0.25).max(8), maximumFrames: z.number().int().min(1).max(3000) });
export const SemanticConfigSchema = z.strictObject({
  version: z.literal(SEMANTIC_VERSION), maximumFrames: z.number().int().min(1).max(256), coverageGapSeconds: z.number().min(1).max(600),
  minimumEventSeparationSeconds: z.number().min(0).max(10), changeThreshold: z.number().positive().max(1),
  exposureChangeThreshold: z.number().positive().max(1), sharpnessLogChangeThreshold: z.number().positive().max(10), motionChangeThreshold: z.number().positive().max(100),
});
export const ProposalConfigSchema = z.strictObject({
  version: z.literal(PROPOSAL_VERSION), durationsSeconds: z.array(z.number().min(0.1).max(10)).min(1).max(8), strideFraction: z.number().min(0.1).max(1),
  maximumPerShot: z.number().int().min(1).max(256), maximumPerAsset: z.number().int().min(1).max(1024), maximumPerProject: z.number().int().min(1).max(4096),
}).refine((v) => v.durationsSeconds.every((d, i) => i === 0 || d > v.durationsSeconds[i - 1]!), "Durations must be strictly increasing.");
export const DedupConfigSchema = z.strictObject({ version: z.literal("coverage-preserving-v1"), temporalIoU: z.number().min(0.5).max(1), cosineSimilarity: z.number().min(0).max(1), durationRatio: z.number().min(0.5).max(1), maximumCenterDistanceSeconds: z.number().min(0).max(2) });

export const TransNetV2FootageDetectorConfigSchema =
  z.strictObject({
    kind: z.literal("transnetv2"),
    threshold: z.number().finite().min(0).max(1),
  });

export const FootageDetectorConfigSchema =
  z.union([
    DetectorConfigSchema,
    TransNetV2FootageDetectorConfigSchema,
  ]);

export type FootageDetectorConfig =
  z.infer<typeof FootageDetectorConfigSchema>;

export const FootageConfigSchema = z.strictObject({
  analyzerVersion: z.literal(FOOTAGE_VERSION), cheap: CheapConfigSchema, semantic: SemanticConfigSchema, proposal: ProposalConfigSchema, deduplication: DedupConfigSchema,
  detector: FootageDetectorConfigSchema, embedding: EmbeddingConfigSchema, aggregationVersion: z.literal(AGGREGATION_VERSION),
  workerTimeoutMilliseconds: z.number().int().min(1000).max(600000), assetTimeoutMilliseconds: z.number().int().min(1000).max(3600000),
}).superRefine((config, ctx) => {
  const e = config.embedding;
  if (e.mode === "siglip" && (e.model !== SIGLIP_MODELS.so400m.model || e.revision !== SIGLIP_MODELS.so400m.revision || e.maxPatches !== 256 || e.device !== "cpu" || e.cpuFallback)) ctx.addIssue({ code: "custom", message: "Footage V0 uses the approved pinned CPU So400m reference space." });
});
export type FootageConfig = z.infer<typeof FootageConfigSchema>;
export const DEFAULT_FOOTAGE_CONFIG: FootageConfig = {
  analyzerVersion: FOOTAGE_VERSION, cheap: { version: CHEAP_VERSION, targetSamplesPerSecond: 4, maximumFrames: 480 },
  semantic: { version: SEMANTIC_VERSION, maximumFrames: 32, coverageGapSeconds: 8, minimumEventSeparationSeconds: 0.5, changeThreshold: 0.06, exposureChangeThreshold: 0.12, sharpnessLogChangeThreshold: 1, motionChangeThreshold: 0.04 },
  proposal: { version: PROPOSAL_VERSION, durationsSeconds: [0.5, 1, 2, 3], strideFraction: 0.5, maximumPerShot: 64, maximumPerAsset: 256, maximumPerProject: 1024 },
  deduplication: { version: "coverage-preserving-v1", temporalIoU: 0.85, cosineSimilarity: 0.995, durationRatio: 0.9, maximumCenterDistanceSeconds: 0.25 },
  detector: { kind: "content", threshold: 27, minSceneFrames: 2, adaptiveThreshold: 3 }, embedding: siglipConfiguration("so400m"), aggregationVersion: AGGREGATION_VERSION,
  workerTimeoutMilliseconds: 180000, assetTimeoutMilliseconds: 900000,
};
export const CheapEvidenceSchema = z.strictObject({ sample: SampleSchema, measurementId: IdSchema, measurement: MeasurementSchema, frameContentHash: HashSchema });
export type CheapEvidence = z.infer<typeof CheapEvidenceSchema>;
export const SelectionReasonSchema = z.enum(["source_shot", "temporal_coverage", "visual_change", "motion_change", "exposure_change", "sharpness_change"]);
export type SelectionReason = z.infer<typeof SelectionReasonSchema>;
export const SemanticSelectionSchema = z.strictObject({ sampleId: IdSchema, selectionReasons: z.array(SelectionReasonSchema).min(1).max(6), noveltyScore: z.number().finite().nonnegative() });
export type SemanticSelection = z.infer<typeof SemanticSelectionSchema>;
export const SemanticFrameSchema = z.strictObject({ ...SampleSchema.shape, frameContentHash: HashSchema, embedding: EmbeddingReferenceSchema, selectionReasons: z.array(SelectionReasonSchema).min(1).max(6) });
export type SemanticFrame = z.infer<typeof SemanticFrameSchema>;
export const CandidateSchema = z.strictObject({ candidateId: IdSchema, assetId: IdSchema, shotId: IdSchema, sourceRange: TimeRangeSchema, proposalConfigurationId: IdSchema, proposalVersion: z.literal(PROPOSAL_VERSION) });
export type Candidate = z.infer<typeof CandidateSchema>;
export const NumericSignalsSchema = z.strictObject({
  brightnessMean: z.number().min(0).max(1), darkPixelFraction: z.number().min(0).max(1), brightPixelFraction: z.number().min(0).max(1), laplacianVariance: z.number().finite().nonnegative(),
  frameDifferenceMean: z.number().min(0).max(1).nullable(), opticalFlowPixelsPerSecond: z.number().finite().nonnegative().nullable(),
  sharpnessIndicator: z.number().min(0).max(1), unclippedPixelFraction: z.number().min(0).max(1), stabilityIndicator: z.number().min(0).max(1).nullable(),
});
export const CandidateEvidenceSchema = z.strictObject({
  candidate: CandidateSchema, contributingSemanticFrameIds: z.array(IdSchema).min(1).max(256), contributingMeasurementIds: z.array(IdSchema).min(1).max(3000),
  contributingCheapSampleIds: z.array(IdSchema).min(1).max(3000), semanticEmbedding: EmbeddingReferenceSchema,
  semanticSupport: z.enum(["within_segment", "same_shot_context"]), semanticContextDistanceSeconds: z.number().nonnegative(),
  cheapSupport: z.enum(["within_segment", "same_shot_context"]), aggregationVersion: z.literal(AGGREGATION_VERSION), aggregationId: IdSchema, signals: NumericSignalsSchema,
});
export type CandidateEvidence = z.infer<typeof CandidateEvidenceSchema>;
export const CoverageSchema = z.strictObject({ durationSeconds: z.number().nonnegative(), coveredSeconds: z.number().nonnegative(), temporalCoverage: z.number().min(0).max(1), maximumGapSeconds: z.number().nonnegative(), representedShots: z.number().int().nonnegative(), sourceShots: z.number().int().nonnegative() });
export type Coverage = z.infer<typeof CoverageSchema>;
export const FootageFailureSchema = z.strictObject({ entryId: IdSchema, assetId: IdSchema.nullable(), stage: IdSchema, code: IdSchema, diagnostic: z.string().max(240) });
export type FootageFailure = z.infer<typeof FootageFailureSchema>;
export const AssetInventorySchema = z.strictObject({
  assetId: IdSchema, analysisId: IdSchema, durationSeconds: z.number().positive(), sourceShots: z.number().int().positive(), cheapFramesAnalyzed: z.number().int().positive(),
  semanticSamplesRequested: z.number().int().positive(), semanticSamplesSelected: z.number().int().positive(), semanticSamplesEmbedded: z.number().int().nonnegative(),
  uniqueSemanticFrames: z.number().int().positive(), reducedCheapResolution: z.boolean(), reducedSemanticCoverage: z.boolean(),
  candidatesBeforeDeduplication: z.number().int().nonnegative(), candidatesAfterDeduplication: z.number().int().nonnegative(),
  coverageBefore: CoverageSchema, coverageAfter: CoverageSchema, embeddingSpace: EmbeddingReferenceSchema,
});
export const FootageInventorySchema = z.strictObject({
  artifactType: z.literal("FootageInventory"), artifactVersion: z.literal("1.0.0"), inventoryId: IdSchema, analyzerVersion: z.literal(FOOTAGE_VERSION), configurationId: IdSchema,
  creatorId: IdSchema, projectId: IdSchema, assets: z.array(AssetInventorySchema).max(16), failures: z.array(FootageFailureSchema).max(16),
  duplicateAssets: z.array(z.strictObject({ entryId: IdSchema, assetId: IdSchema })).max(16),
  candidateCount: z.number().int().nonnegative().max(4096), totalSourceDurationSeconds: z.number().nonnegative(), referenceSpecificSufficiency: z.null(),
}).superRefine((value, ctx) => {
  const fail = (message: string) => ctx.addIssue({ code: "custom", message });
  if (new Set(value.assets.map((a) => a.assetId)).size !== value.assets.length) fail("Inventory asset identities must be unique.");
  if (value.candidateCount !== value.assets.reduce((sum, a) => sum + a.candidatesAfterDeduplication, 0)) fail("Inventory candidate total disagrees with assets.");
  if (Math.abs(value.totalSourceDurationSeconds - value.assets.reduce((sum, a) => sum + a.durationSeconds, 0)) > 1e-6) fail("Inventory source duration disagrees with assets.");
  for (const asset of value.assets) {
    if (asset.semanticSamplesEmbedded > asset.uniqueSemanticFrames || asset.uniqueSemanticFrames > asset.semanticSamplesSelected || asset.semanticSamplesSelected > asset.semanticSamplesRequested || asset.semanticSamplesSelected > asset.cheapFramesAnalyzed) fail("Inventory semantic counts are inconsistent.");
    if (asset.candidatesAfterDeduplication > asset.candidatesBeforeDeduplication || asset.coverageAfter.coveredSeconds + 1e-6 < asset.coverageBefore.coveredSeconds) fail("Inventory pruning removed coverage or added candidates.");
  }
});
export const EmbeddingImplementationSchema = z.strictObject({ adapter: z.string(), preprocessing: z.string(), ffmpeg: z.string(), pillow: z.string(), transformers: z.string(), torch: z.string(), imageProcessor: z.string(), inferenceBatchSize: z.number().int().positive() });
export const FootageAnalysisSchema = z.strictObject({
  artifactType: z.literal("FootageAnalysis"), artifactVersion: z.literal("1.0.0"), analysisId: IdSchema, assetId: IdSchema, contentHash: HashSchema,
  authorization: FootageAuthorizationSchema, configuration: FootageConfigSchema, configurationId: IdSchema, embeddingImplementation: EmbeddingImplementationSchema, metadata: MetadataSchema, shots: z.array(ShotSchema).min(1).max(1000),
  cheapFeatures: z.array(CheapEvidenceSchema).min(1).max(3000), semanticFrames: z.array(SemanticFrameSchema).min(1).max(256),
  candidates: z.array(CandidateEvidenceSchema).max(1024), keptCandidateIds: z.array(IdSchema).max(1024),
  prunedCandidates: z.array(z.strictObject({ candidateId: IdSchema, representedBy: IdSchema })).max(1024), inventory: AssetInventorySchema,
}).superRefine((value, ctx) => {
  const fail = (message: string) => ctx.addIssue({ code: "custom", message });
  const unique = (ids: readonly string[]) => new Set(ids).size === ids.length;
  const shots = new Map(value.shots.map((s) => [s.shotId, s]));
  const cheap = new Map(value.cheapFeatures.map((f) => [f.sample.sampleId, f]));
  const semantic = new Map(value.semanticFrames.map((f) => [f.sampleId, f]));
  const candidates = new Map(value.candidates.map((c) => [c.candidate.candidateId, c]));
  if (value.assetId !== `asset_${value.contentHash}` || value.authorization.contentHash !== value.contentHash || value.configurationId !== contentId("configuration", value.configuration)) fail("Analysis asset or configuration identity mismatch.");
  if (shots.size !== value.shots.length || cheap.size !== value.cheapFeatures.length || semantic.size !== value.semanticFrames.length || candidates.size !== value.candidates.length) fail("Feature identities must be unique.");
  for (const [index, shot] of value.shots.entries()) if (shot.startSeconds !== (index ? value.shots[index - 1]!.endSeconds : 0) || shot.endSeconds > value.metadata.durationSeconds) fail("Source shots do not partition the asset.");
  if (Math.abs(value.shots.at(-1)!.endSeconds - value.metadata.durationSeconds) > 1e-6) fail("Source-shot coverage is incomplete.");
  for (const frame of value.cheapFeatures) {
    const s = frame.sample, shot = shots.get(s.shotId), m = frame.measurement;
    if (!shot || s.atSeconds < shot.startSeconds || s.atSeconds >= shot.endSeconds || value.metadata.frameTimes[s.frameIndex] !== s.atSeconds || m.sampleId !== s.sampleId) fail("Cheap sample is outside its source evidence.");
    if (frame.measurementId !== contentId("measurement", [s, m, frame.frameContentHash, MEASUREMENT_VERSION])) fail("Measurement provenance checksum mismatch.");
    if (m.comparisonSampleId !== null) {
      const prior = cheap.get(m.comparisonSampleId)?.sample;
      if (!prior || prior.shotId !== s.shotId || prior.atSeconds >= s.atSeconds || m.comparisonIntervalSeconds === null || Math.abs(m.comparisonIntervalSeconds - s.atSeconds + prior.atSeconds) > 1e-6) fail("Temporal measurement has invalid comparison evidence.");
    }
  }
  for (const frame of value.semanticFrames) {
    const source = cheap.get(frame.sampleId);
    if (!source || source.frameContentHash !== frame.frameContentHash || contentId("sample", source.sample) !== contentId("sample", { sampleId: frame.sampleId, shotId: frame.shotId, frameIndex: frame.frameIndex, atSeconds: frame.atSeconds })) fail("Semantic sample lacks matching cheap evidence.");
    try { assertCompatibleEmbeddingSpaces(value.inventory.embeddingSpace, frame.embedding); } catch { fail("Semantic feature space mismatch."); }
  }
  for (const evidence of value.candidates) {
    const c = evidence.candidate, shot = shots.get(c.shotId);
    if (c.assetId !== value.assetId || !shot || c.sourceRange.startSeconds < shot.startSeconds || c.sourceRange.endSeconds > shot.endSeconds) fail("Candidate is outside its source shot.");
    if (!unique(evidence.contributingSemanticFrameIds) || !unique(evidence.contributingCheapSampleIds) || !unique(evidence.contributingMeasurementIds)) fail("Candidate feature contributions must be unique.");
    const frames = evidence.contributingSemanticFrameIds.map((id) => semantic.get(id));
    const measurements = evidence.contributingCheapSampleIds.map((id) => cheap.get(id));
    if (frames.some((f) => !f || f.shotId !== c.shotId) || measurements.some((f, i) => !f || f.sample.shotId !== c.shotId || f.measurementId !== evidence.contributingMeasurementIds[i]) || measurements.length !== evidence.contributingMeasurementIds.length) fail("Candidate feature lineage is broken.");
    const inside = (t: number) => t >= c.sourceRange.startSeconds && t < c.sourceRange.endSeconds;
    if (evidence.semanticSupport === "within_segment" && (evidence.semanticContextDistanceSeconds !== 0 || frames.some((f) => f && !inside(f.atSeconds)))) fail("Candidate semantic support is incorrectly marked inside the segment.");
    if (evidence.cheapSupport === "within_segment" && measurements.some((f) => f && !inside(f.sample.atSeconds))) fail("Candidate measurement support is incorrectly marked inside the segment.");
    try { assertCompatibleEmbeddingSpaces(value.inventory.embeddingSpace, evidence.semanticEmbedding); } catch { fail("Candidate feature space mismatch."); }
    if (evidence.aggregationVersion !== value.configuration.aggregationVersion || c.proposalVersion !== value.configuration.proposal.version) fail("Candidate version provenance mismatch.");
  }
  const kept = new Set(value.keptCandidateIds), pruned = new Set(value.prunedCandidates.map((p) => p.candidateId));
  if (kept.size !== value.keptCandidateIds.length || pruned.size !== value.prunedCandidates.length || kept.size + pruned.size !== candidates.size || [...kept].some((id) => !candidates.has(id)) || value.prunedCandidates.some((p) => !candidates.has(p.candidateId) || kept.has(p.candidateId) || !kept.has(p.representedBy))) fail("Kept and pruned candidates must partition all evidence with retained replacement IDs.");
  const inventory = value.inventory;
  if (inventory.assetId !== value.assetId || inventory.analysisId !== value.analysisId || inventory.sourceShots !== shots.size || inventory.cheapFramesAnalyzed !== cheap.size || inventory.semanticSamplesSelected !== semantic.size || inventory.candidatesBeforeDeduplication !== candidates.size || inventory.candidatesAfterDeduplication !== kept.size) fail("Analysis inventory counts disagree with evidence.");
  if (cheap.size > value.configuration.cheap.maximumFrames || semantic.size > value.configuration.semantic.maximumFrames || candidates.size > value.configuration.proposal.maximumPerAsset || value.shots.some((shot) => value.candidates.filter((c) => c.candidate.shotId === shot.shotId).length > value.configuration.proposal.maximumPerShot)) fail("Analysis exceeded its configured work budget.");
});
