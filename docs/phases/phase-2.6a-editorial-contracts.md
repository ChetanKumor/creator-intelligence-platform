# Editorial contracts — proposed internal 0.1.0

Normative architecture for [Phase 2.6A Session 1](phase-2.6a-session-1-architecture.md). These are proposed interfaces and validation rules, not generated schemas or implemented code. Types in code blocks are design notation. Session 2 translates them into strict Zod schemas and inferred TypeScript types. `?` means a field may be omitted; explicit feature missingness always uses the tagged union below.

## 1. Shared envelope, references and provenance

Reuse `IdSchema`, `HashSchema`, `TimeRangeSchema`, `TimestampSchema`, `EmbeddingReferenceSchema`, `CandidateSchema`, and canonical serialization without changing them. All numbers are finite; seconds are nonnegative; byte/count values are safe nonnegative integers. Ratios are bounded [0,1]. Times use source PTS seconds and half-open intervals; equality tolerance is 1e-6 seconds, but tolerance never changes sample membership. New timestamps use the existing millisecond UTC format. Historical receipt timestamps remain in their original referenced bytes.

```ts
type MissingState = "not_computed" | "unavailable" | "not_applicable"
  | "failed" | "unsupported";
type Availability<T> =
  | { state: "present"; value: T }
  | { state: MissingState; reasonCode: Id; evidenceRefs: EvidenceRef[] };
type ArtifactRef = {
  objectId: Id; sha256: Hash; artifactType: string; artifactVersion: string;
};
type EvidenceRef = {
  artifact: ArtifactRef; pointer: string; // validated JSON Pointer
};
type Envelope<K> = {
  artifactType: K; artifactVersion: "0.1.0"; stability: "internal_pre_stable";
};
type Producer = {
  producerId: Id; producerVersion: string;
  configuration: EvidenceRef;
  implementation: Availability<EvidenceRef>;
  sourceEvidence: EvidenceRef[];
  mediaBasis: "real_footage" | "synthetic" | "unverified";
  computationBasis: "deterministic" | "cached_real_model"
    | "fresh_real_model" | "synthetic_stub" | "human_annotation" | "unverified";
  runEvidence: Availability<EvidenceRef[]>;
};
type Feature<T> = { provenance: Producer; data: Availability<T> };
```

`Id` and `Hash` denote the reused validated primitives. Strings in structural headers are bounded to 80 characters. Evidence pointers are bounded to 1024 characters, must resolve inside the hashed JSON object, and are checked against expected entity IDs. No arbitrary URI fetch, filesystem path, URL, raw media, caption, transcript or free-form editor identity is permitted in these records. Object IDs resolve through an explicitly supplied local artifact map; paths are execution-only. Artifact refs are exact-byte hashes, including encoding; semantic content IDs are distinct. UTF-8 JSON is the new write convention; legacy BOM/UTF-16 receipts may be read without rewriting them.

The producer is the actual existing feature producer, not the token adapter. Derived temporal/locality projections identify the adapter/version, config and original evidence. A deferred channel identifies the adapter's declaration policy as producer; it must not name an unrun model as a producing model. `failed` requires a sanitized error receipt in evidence; `not_computed` means no attempt; `unavailable` means needed evidence cannot be supplied; `not_applicable` means the concept does not apply; `unsupported` means the declared implementation/version cannot represent it. Zero is a valid measured value only in the `present` branch. Missing branches contain no value. Missing confidence/reason/timeline fields similarly never imply zero, no reasons, or no final survival.

For existing artifacts without a native envelope (notably `run.json` and ClipSegment arrays), the reference adapter declares a role such as `FootageRun` or `ClipSegmentArray` and `artifactVersion: "legacy-unversioned"`; these are resolver descriptors, not invented native headers. The original bytes remain unchanged. For native enveloped artifacts, reference type/version must match the payload. Implementation/source/configuration refs may target bounded registered JSON descriptors with file hashes; this does not require a new producer or model.

New content-addressed artifacts use `contentId(prefix, bodyWithoutOwnId)`, with envelope/version included. Prefixes are listed with each record below. No embedded self-digest or circular content reference. Set arrays sort by ID before hashing; ranked lists, sequences, presentation traces and aligned support arrays retain order. Ties use explicit groups. Duplicate IDs fail. Unknown fields and unsupported versions fail. Corrections create a new artifact and reference the prior artifact; no in-place historical mutation.

## 2. Editorial task taxonomy

`EditorialTaskTaxonomy` has `taxonomyId`, `taxonomyVersion: "0.1.0"`, envelope, and the following fixed task definitions. Each task definition binds `taskId`, input kind, outcome kind, label protocol version and lifecycle (`active_contract` or `reserved`). Task refs always include taxonomy ID/version and task ID. Content ID prefix: `editorial_taxonomy`.

| Task ID | Prediction-time inputs | Label/outcome and distinctions |
| --- | --- | --- |
| `candidate_selection` | Candidate set, brief/context | Zero or more selected options; explicit rejects and unresolved alternatives remain separate. |
| `keep_reject` | Candidate, context and usability objective | Keep / reject / abstain / unjudged, with per-candidate observation provenance. |
| `pairwise_preference` | Two distinct candidate options under the same context | Left / right / tie / abstain / unjudged. Preference does not imply absolute unusability of loser. |
| `candidate_ranking` | Fixed eligible candidate set and context | Ordered tie groups plus explicit unjudged options; total versus partial ranking declared. |
| `moment_selection` | Source shot/range or candidate set, context | One or more source intervals and candidate correspondence if known; a moment need not equal a proposal. |
| `trim_boundary_selection` | Candidate, allowed trim domain and source timebase | Preferred source start/end, alternative valid ranges, or abstention. Separate candidate selection from boundary accuracy. |
| `next_shot_choice` | Ordered previous editorial context, fixed candidate set | Selected next candidate / end-sequence / tie / abstain; end-sequence is an explicit option. |
| `transition_compatibility` | Ordered outgoing/incoming clip uses, boundary ranges and transition | Compatible / incompatible / uncertain / unjudged under a versioned rubric; compatibility is directional. |
| `sequence_preference` | Two or more exact ordered sequences and common context | Preferred option / tied options / partial order / abstain. Candidate membership alone is insufficient. |
| `technical_usability` | Candidate and declared delivery constraints | Usable / unusable / uncertain / unjudged, per technical rubric dimension. Cheap scores are inputs, not ground truth. |
| `aesthetic_usability` | Candidate and editorial objective | Separate human ordinal/category rubric, uncertainty and disagreement. No inference from sharpness. |
| `reference_style_compatibility` | Candidate/sequence plus authorized reference feature ref | Reserved; future rubric and reference identity required. No reference extraction or matching is authorized. |

Task instructions/briefs are bounded object refs with authorization, not inline prompts. No taxonomy entry authorizes a model or training.

## 3. EditorialToken

```ts
type EditorialToken = Envelope<"EditorialToken"> & {
  tokenId: Id; // prefix editorial_token
  projectId: Id;
  sourceHash: Hash;
  candidate: Candidate; // exact existing CandidateSchema value, once
  analysis: { analysisId: Id; configurationId: Id; artifact: ArtifactRef };
  producingRun: { jobId: Id; artifact: ArtifactRef };
  candidateEvidence: EvidenceRef;
  clipSegment: Availability<EvidenceRef>;
  temporal: Feature<TemporalContext>;
  semantic: Feature<SemanticChannel>;
  cheap: Feature<CheapChannel>;
  future: {
    temporalMotion: Feature<TemporalMotionChannel>;
    qualityAesthetic: Feature<QualityAestheticChannel>;
    speechAudio: Feature<SpeechAudioChannel>;
    music: Feature<MusicChannel>;
    referenceStyle: Feature<ReferenceStyleChannel>;
  };
};
type TemporalContext = {
  sourceDurationSeconds: number;
  shotRange: TimeRange;
  sourcePosition: { startFraction: number; endFraction: number };
  shotPosition: { startSeconds: number; endSeconds: number };
  previousShot: Availability<EvidenceRef>;
  nextShot: Availability<EvidenceRef>;
};
type Locality = {
  support: "within_segment" | "same_shot_context";
  supports: { semanticFrameId: Id; distanceToIntervalSeconds: number }[];
  nearestEvidenceDistanceSeconds: number;
  distancePolicy: "interval-distance-half-open-membership-v1";
};
type SemanticChannel = {
  embedding: EmbeddingReference;
  modelConfiguration: EvidenceRef; // resolves full model, revision, device, patches
  aggregationId: Id;
  aggregationVersion: "footage-evidence-v1";
  locality: Locality;
};
type CheapChannel = {
  signals: EvidenceRef; // existing CandidateEvidence.signals, no raw bank copy
  contributions: EvidenceRef; // existing candidate evidence's aligned sample/measurement IDs
  support: "within_segment" | "same_shot_context";
  missingSignals: { signal: CheapSignalName; state: MissingState;
    reasonCode: Id; evidenceRefs: EvidenceRef[] }[];
};
```

Identity retains project, asset (`candidate.assetId`), source hash, source shot (`candidate.shotId`), candidate, interval and proposal identity without inventing alternate identifiers. `durationSeconds = candidate.end - candidate.start` and `shotDurationSeconds = shotRange.end - shotRange.start` are mandatory resolved interface getters, not redundant persisted numbers. The resolved temporal interface also supplies shot-relative start/end fractions by dividing offsets by shot duration. Source fractions divide absolute candidate bounds by source duration. Previous/next shots mean adjacent detected source shots in this asset, not editorial neighbors; first/last absence is `not_applicable/source_boundary`. Editorial neighbors belong to decision context.

Semantic model/revision getters resolve `modelConfiguration`; space ID/dimension/version resolve the reused EmbeddingRef. These must match the source analysis and frozen baseline for real Phase 2 ingestion. No vector or second model-config blob is persisted. Stub tokens carry `synthetic_stub`, the actual stub space/dimension, and cannot enter a real-only benchmark. Reading real refs today is cached evidence; historical fresh computation may be claimed only through its original producing receipt. Do not copy aggregate run-level cache counts into per-frame fresh/cache claims where the original run cannot distinguish them.

Locality validation is mandatory:

1. Every supporting `semanticFrameId` resolves to `semanticFrames[].sampleId` in the exact analysis. Do not substitute embedding ID or deduplicate temporal support by PNG hash.
2. The support list equals the existing ordered contributing semantic frame IDs; every frame has matching asset and source shot. Hash/frame/embedding lineage resolves through the original sidecar.
3. For source interval `[s,e)` and frame PTS `t`, membership is `s <= t && t < e`; distance is `max(s-t, t-e, 0)`. The nearest distance is the minimum over the nonempty support list and equals existing `semanticContextDistanceSeconds` to 1e-6.
4. `within_segment` requires all supports inside and distance zero. `same_shot_context` preserves the existing producer's single nearest-to-center support (earlier sample on equal distances), with no selected semantic frame inside. A frame at `e` has distance zero and remains borrowed.
5. Missing semantic evidence makes the semantic group unavailable; it cannot emit an empty present support list. Contradictory joins or a wrong dimension/space fail validation, rather than becoming benign missingness.

Cheap signals reuse exactly: `brightnessMean`, `darkPixelFraction`, `brightPixelFraction`, `laplacianVariance`, `frameDifferenceMean`, `opticalFlowPixelsPerSecond`, `sharpnessIndicator`, `unclippedPixelFraction`, `stabilityIndicator`. The resolved view exposes a `Feature`/availability value per signal and inherits the cheap producer. Pixel flow uses the existing resized analysis image and actual comparison seconds; it is not camera/subject motion. Frame difference compares existing samples, not necessarily consecutive decoded frames. Indicators are uncalibrated descriptive transforms.

`missingSignals` must cover exactly the null fields in the referenced signals, with no entry for measured zero. For the current aggregator, no eligible comparison pair wholly inside the candidate yields `unavailable/no_eligible_temporal_pair`. Borrowed cheap support never supplies in-window flow. If exact legacy causality cannot be resolved, use `unavailable/legacy_reason_unknown`. Scalar cheap means can have borrowed support; preserve this independently from semantic support. A missing whole cheap group is distinct from individual unavailable temporal signals.

### Reserved future channel shapes

Each is typed and carries the same per-group producer/config/source provenance. Version 0.1.0 validators restrict all five slots to missing branches; the default is `not_computed/channel_deferred`. These shape definitions reserve direction only; a future version and explicit phase authorization are required to accept `present` payloads.

| Type | Future payload shape, not populated |
| --- | --- |
| `TemporalMotionChannel` | EmbeddingRef, source range, ordered frame evidence refs, temporal pooling version and support policy. |
| `QualityAestheticChannel` | Rubric/model-config ref, source range, typed measurement refs with unit/scale and calibration-ref availability; technical and aesthetic dimensions distinct. |
| `SpeechAudioChannel` | Authorized audio asset/hash/range refs, time-alignment version, speech-segment and audio-feature refs; no transcript text in token. |
| `MusicChannel` | Authorized audio/hash/range refs, beat/section feature refs and alignment version; missing audio is not zero beat energy. |
| `ReferenceStyleChannel` | Authorized reference artifact, style-feature ref or EmbeddingRef, comparison-space/version and rubric ref; cannot overwrite source-only semantic channel. |

## 4. Candidate sets, context and decision contract

Candidate sets are separate immutable snapshots, allowing many decisions to reuse one set without copying vectors or provenance. `EditorialCandidateSet` contains envelope, `candidateSetId` (prefix `editorial_set`), project ID, sorted unique `{candidateId, token: ArtifactRef}` entries, producing analysis/run refs, selection policy/config ref, and `universe: "retained" | "all_proposed" | "explicit_subset"`. It also records `sourceRunStatus: "succeeded" | "partial"` and failure evidence for partial runs. Maximum 4096 entries; one representation per candidate per set. A pruned proposal is not an editor rejection; `all_proposed` requires explicit designation and may lack ClipSegments. A partial run can support an explicitly scoped set but cannot be described as the whole project universe.

```ts
type ClipUse = {
  useId: Id; candidateId: Id; token: ArtifactRef;
  sourceRange: TimeRange; // must lie inside candidate for 0.1.0 trim/sequence uses
};
type ChoiceOption =
  | { optionId: Id; kind: "candidate"; candidateId: Id }
  | { optionId: Id; kind: "trim"; use: ClipUse }
  | { optionId: Id; kind: "transition"; outgoing: ClipUse;
      incoming: ClipUse; transition: Transition }
  | { optionId: Id; kind: "sequence"; uses: ClipUse[] }
  | { optionId: Id; kind: "end_sequence" };
type EditorialContext = Envelope<"EditorialContext"> & {
  contextId: Id; projectId: Id; // prefix editorial_context
  asOf: Timestamp;
  precedingUses: ClipUse[]; // editorial order, not source order
  previousDecisionRefs: ArtifactRef[];
  brief: Availability<EvidenceRef>;
  timelineSnapshot: Availability<EvidenceRef>;
  completeness: "complete" | "partial" | "unknown";
};
type EditorialDecision = Envelope<"EditorialDecision"> & {
  decisionId: Id; // prefix editorial_decision
  projectId: Id; task: TaskRef; decisionType: DecisionType;
  availableCandidates: ArtifactRef; // EditorialCandidateSet
  options: ChoiceOption[];
  presentation: Availability<{
    order: Id[]; // unique option IDs in initial display order
    protocol: EvidenceRef;
    seed: Availability<number>;
  }>;
  previousContext: Availability<ArtifactRef>; // EditorialContext
  actor: { kind: "editor" | "annotator" | "system";
    pseudonymId: Id; namespaceId: Id };
  observed: {
    completion: "open" | "completed" | "abstained";
    selectedCandidateIds: Id[];
    rejectedCandidateIds: Id[]; // explicit rejection only
    chosenOptionIds: Id[];
    rejectedOptionIds: Id[];
    observations: Observation[];
    finalTrims: Availability<ClipUse[]>;
  };
  judgment: Availability<TaskJudgment>;
  editorExplanation: Availability<{
    author: { pseudonymId: Id; namespaceId: Id };
    reasonTaxonomy: EvidenceRef; reasonTags: Id[];
    confidence: Availability<{ value: number;
      meaning: "self_reported_certainty"; scaleVersion: string }>;
    sourceEvidence: EvidenceRef[];
  }>;
  producing: { analysisRefs: ArtifactRef[]; runRefs: ArtifactRef[];
    captureProducer: Producer; decisionConfiguration: EvidenceRef };
  finalTimelineLinkage: Availability<ArtifactRef>;
  legacyEventRefs: ArtifactRef[];
  supersedes: Availability<ArtifactRef>;
};
```

`DecisionType` enumerates `select`, `keep_reject`, `compare`, `rank`, `select_moment`, `trim`, `choose_next`, `assess_transition`, `compare_sequences`, `assess_usability`, `inspect`, `reorder`, `replace`, `record_final_survival`. Task and type combinations are validated; reserved reference-style judgments cannot become labels in 0.1.0. `Transition` reuses the frozen cut/dissolve type; no new transition implementation.

`Observation` is a discriminated append-only value: `{observationId, ordinal, occurredAt: Availability<Timestamp>, evidenceRefs, action}`. Actions are `presented{optionId}`, `inspected{optionId}`, `selected{optionId}`, `rejected{optionId}`, `trimmed{before: ClipUse, after: ClipUse}`, `reordered{beforeUseIds, afterUseIds}`, `replaced{oldUse: ClipUse,newUse: ClipUse}`, or `survived_final{useId,timelineLink: EvidenceRef}`. Ordinals are strictly increasing in this capture stream; wall-clock order alone is insufficient. Observations reference a source event/capture receipt and may reference previously established uses through context. Reorder arrays are permutations; replacement is an explicit edge between distinct candidate uses; repeated use of one candidate needs distinct use IDs. Source time and output timeline time are never conflated.

`TaskJudgment` is a discriminated union matching the taxonomy: `selection{acceptedOptionIds}`, `keep_reject{candidateId,label}`, `pairwise{leftOptionId,rightOptionId,outcome}`, `ranking{tieGroups: Id[][],unjudgedOptionIds,completeness}`, `moments{assetId,sourceHash,shotId,ranges: TimeRange[],candidateIds}`, `trim{candidateId,acceptableRanges: TimeRange[]}`, `next_shot{acceptableOptionIds}`, `transition{optionId,label,rubric: EvidenceRef}`, `sequence{tieGroups,unjudgedOptionIds}`, `usability{candidateId,dimension,rubric: EvidenceRef,label}`. Every judgment additionally contains `basis: "explicit_annotation" | "derived_observation" | "synthetic_fixture"`, source evidence refs, label protocol ref and annotator pseudonym when explicit. Ordinal aesthetic labels belong to their bounded rubric, not arbitrary numbers. Abstention/unjudged are explicit label outcomes; an absent judgment is `not_computed` or another justified missing state. Ranking completeness requires all options assigned exactly once among tie groups and unjudged. Moment ranges may extend beyond a proposal but must remain inside the named source shot; such a moment is not silently converted into a trimmed candidate.

### Decision invariants

- Selected and rejected candidate sets are disjoint subsets of the available snapshot; empty sets are valid for unfinished, tie or abstaining decisions. Unselected/unrejected candidates remain unresolved. Chosen/rejected option IDs are disjoint subsets of `options`.
- These sets summarize the state at the capture boundary. Earlier selection/rejection changes remain in ordered observations; a later reversal creates a new decision snapshot/context link. Historical actions are not erased to enforce disjoint current summary sets.
- Presentation/inspection records concern options. Candidate refs within every option must exist in the same set/project, with matching token versions. Presentation order can be unknown; never sort candidate IDs and call it observed presentation. Later presentation changes are observations.
- Candidate-level rejection requires explicit candidate rejection evidence. Losing a sequence/trim/transition option does **not** reject every candidate it contains. Different sequences may share candidates. Outcome projections must follow the declared capture protocol, never set subtraction alone.
- `selectedCandidateIds` records observed candidate selection, whereas `chosenOptionIds` records the task's option outcome. Pure comparison labels need not produce a timeline selection. A tie is not two simultaneous editing selections.
- `previousContext.asOf` cannot follow the decision's first known observation; only preceding history is available at prediction time. Missing timestamps require ordinal/capture proof or explicit incomplete context.
- Trims stay inside original candidate bounds; they do not mutate token identity or its semantic locality. Extending beyond a candidate requires a separately identified future proposal, not a relabeled old candidate.
- Editor explanations require editor/annotator authorship and independent source evidence. System-derived tags belong in derivation provenance, never `editorExplanation`. Self-reported confidence is not a calibrated probability and cannot be synthesized from motion/sharpness.
- Pseudonyms are opaque assigned IDs within a declared namespace, not unsalted hashes of emails/names. Identity mapping remains outside benchmark artifacts. No inferred demographic identity.
- Legacy events are optional evidence links. The frozen single-winner event cannot encode this full contract; no lossy automatic conversion is defined.

### Final timeline linkage and graph compatibility

`EditorialTimelineLinkage` contains envelope, `linkageId` (prefix `editorial_linkage`), project ID, final-edit ArtifactRef, optional exact UniversalEditPlan ref with plan ID/revision, alignment producer/config, and mappings. Each mapping has a `useId`, availability of candidate/token ref, asset ID/source hash, source range, output range, availability of plan clip ID/decision ref, `mappingKind: "exact" | "manual_alignment" | "estimated"`, and evidence refs. Unmapped output/source portions and unknown survival are explicit. Exact plan mappings validate source ranges, speed and output timing against the frozen plan. Time-warped/estimated external edits cannot masquerade as exact constant-speed mappings.

Repeated candidate use has separate mappings; absence from an incomplete alignment is not rejection. A `survived_final` observation requires an exact or explicitly adjudicated mapping to a declared final revision, not a download event. A later final linkage is a separate artifact/observation referring to the original decision; do not retroactively insert the future into prediction context or create circular artifact hashes.

The future graph is recoverable as project -> candidate-set snapshot -> presented/inspected observations -> rejection/selection -> trim use -> reorder sequence -> replacement old/new use -> final-revision mapping. Stable IDs, parent/context refs and ordered observations carry those edges today. No graph storage or traversal engine is designed for Session 2.

## 5. Project benchmark contract

`EditorialBenchmark` contains envelope, `benchmarkId` (prefix `editorial_benchmark`), `benchmarkVersion`, `frozenAt`, taxonomy ArtifactRef, configuration EvidenceRef, purpose, project records, split policy/assignments, case refs, task coverage, artifact inventory and release state (`draft` or `frozen`). Version and exact digest travel together; a changed label, split, option set or rubric creates a new benchmark identity/version.

Project record:

- Project ID, privacy-safe creator group IDs, source-family group IDs and grouping evidence/status (`verified` or `unresolved`). These are dataset grouping IDs, not inferred identities of people appearing in video.
- Explicit source records: asset ID/source SHA-256, authorization EvidenceRef, known parent/derivative source IDs and grouping evidence. Existing AuthorizedFootage schema is reused; additional purpose-specific grants are separate references, never edited permissions.
- Candidate-set and token artifact refs, decision refs and final-linkage availability; media domain/source basis and label basis kept separate.
- Purpose eligibility with authorization evidence: local evaluation may reuse an appropriate existing permission; training/export/release requires separately established coverage. Missing/withdrawn authorization excludes the affected purpose. Historical evidence is preserved subject to the applicable retention contract; no deletion workflow is implemented here.

`EditorialBenchmarkCase` has envelope, `caseId` (prefix `editorial_case`), project ID, TaskRef, frozen decision ref, input snapshot refs, label EvidenceRef, label protocol, label origin, and eligibility (`eligible` or missing state/reason). Case inputs are whitelisted prediction-time projections: candidate set/options/context and allowed feature channels. Labels/explanations/final survival cannot be read by the predictor. A case definition identifies which observation/context boundary precedes the prediction. Multiple annotations stay separate or reference a versioned adjudication record; do not silently majority-vote or count copies as independent projects.

Split policy includes `splitPolicyId`, version, seed, grouping policy, explicit creator-isolation mode (`holdout_creators` or `within_creator_projects`), family-registry ref and assignments to `train`, `validation`, `test`, or `quarantine`. Build connected components using shared project ID, exact source hash, source-family/known derivative relations, and creator IDs when `holdout_creators`. Every case/candidate/trim/frame from a component receives its component's split. Multi-creator projects connect all their groups under creator holdout. `within_creator_projects` may share a creator but must isolate projects and source families; results cannot claim unseen-creator generalization.

Unknown source-family relations quarantine affected records until reviewed, or leave the entire draft explicitly unverified. Matching filenames are insufficient; re-encodes and crops can share a source family despite different hashes. Explicit family adjudication references are sufficient for Session 2 contract tests; no new similarity model is required. Do not create train/validation/test by randomly partitioning 872 windows from the single Phase 2.5 verification project.

Freeze validation traverses all linked source groups, cases and labels, verifies permissions for the declared purpose, enforces split disjointness and artifact hashes, and checks task eligibility. Feature normalization, threshold selection and imputation configuration must be fitted only on training data; validation is for selection; test is held out. Changes discovered after test exposure create a new release with a contamination record; they do not erase the old release.

Task coverage records per task/split: projects, independent components, candidates/options, labeled decisions, abstentions, unjudged, excluded with reason, complete/partial context, locality strata (`within_segment` vs `same_shot_context`), and domain/label-source strata. Counts derive from cases. Zero editorial labels is explicit; Phase 2 mechanical review cannot populate these labels. Benchmark shard limits: up to 10,000 cases and 1,000 projects per manifest, each case referencing a bounded set; shards can be referenced by a future release rather than unbounded embedded arrays. Max 256 options per decision, 120 uses per sequence, 4096 observations per decision; larger traces require ordered continuation decisions with context refs. Bounds do not change Phase 2 budgets.

## 6. Metric interfaces

`EditorialMetricProtocol` contains envelope, protocol ID/version, TaskRef, metric definitions/direction/unit, prediction tie policy, accepted label basis, inclusion rules, weighting, cutoffs/tolerances, abstention policy and uncertainty configuration. Prefix `editorial_metric_protocol`. `EditorialMetricReport` contains envelope, report ID (prefix `editorial_metrics`), exact benchmark/split/task/protocol/config refs, prediction artifact ref, per-case results, aggregate results, eligibility/exclusion counters, independent group counts and locality/domain strata.

```ts
type MetricValue = Availability<number>;
type MetricObservation = {
  metricId: Id; unit: "ratio" | "seconds" | "count" | "score";
  direction: "higher" | "lower";
  value: MetricValue;
  numerator: Availability<number>; denominator: number;
  eligibleCases: number; evaluatedCases: number;
  abstainedCases: number; missingPredictionCases: number;
  excluded: { reasonCode: Id; count: number }[];
  uncertainty: Availability<{
    lower: number; upper: number; level: number;
    methodVersion: string; resamplingUnit: "leakage_component";
    seed: number; repetitions: number;
  }>;
};
interface EditorialEvaluator<I, P> {
  evaluate(input: I, predictions: P, protocol: MetricProtocol): MetricReport;
}
```

Evaluation is a deterministic pure function over validated inputs/predictions, with injected seed and no provider. Predictions identify case, task, option/candidate IDs and exact input snapshot digest. Foreign/duplicate options, incompatible task outputs, missing required configuration and altered cohorts fail. Rank scores are finite uncalibrated ordering values; probabilities, if offered, have separate fields/validation and do not imply calibration. No test-time label access is permitted in feature construction.

| Task | Required protocol / metrics |
| --- | --- |
| Pairwise preference | Non-tied decisive accuracy; tie-aware three-way accuracy including explicit truth ties; label abstentions excluded with counts. Prediction ties against decisive truth are incorrect. Optional probabilistic log loss/Brier only for declared normalized outcome probabilities and explicit clipping policy. |
| Candidate ranking | nDCG@k for complete declared relevance labels, gain `2^relevance - 1`, log2 positional discount; ideal DCG zero yields unavailable. Recall@k and MRR for explicit acceptable sets. Pairwise concordance on judged pairs for partial rankings; never treat unjudged options as relevance zero. Score ties order by option ID for deterministic cutoff, with tied-score counts reported. |
| Keep/reject | Confusion counts, precision/recall/F1 per class, balanced accuracy, macro-F1 and label/prediction coverage. Zero denominators are unavailable. Abstention is an uncovered eligible case; primary correct/eligible accuracy counts it as incorrect, conditional metrics report their evaluated denominator. AUROC/PR-AUC optional only with both classes and a frozen score protocol. |
| Trim/boundary | Absolute start and end error in source seconds, temporal IoU, and joint within-tolerance success. Candidate/asset identity must agree. For multiple acceptable ranges choose one range minimizing total absolute endpoint error, tie by earlier start/end; all metrics use that same range. Tolerance must be frozen in seconds or resolved through actual PTS; rounded FPS is not a VFR clock. Report conditional trim accuracy plus eligible-case success so missing predictions cannot improve results. |
| Next-shot choice | Top-1, acceptable-set recall@k and MRR, conditional on exact preceding context and fixed option universe; `end_sequence` participates explicitly. Separate incomplete-context cases; no inference that a visually similar shot was preferred. |
| Sequence preference | Pairwise/tie-aware agreement or rank concordance over exact sequence options, with use order, ranges and context bound. Different candidate multisets/order are distinct options. Do not average frame cosine similarity and call it sequence preference quality. |

Candidate selection may use explicit accepted-set precision/recall; moment selection may use source interval IoU and endpoint success under a matching policy; usability/transition labels use rubric-specific agreement. These require their own protocol refs before evaluation. Reference-style metrics remain reserved.

Default aggregation contract: compute within each eligible project first, then macro-average projects; always also report case-weighted diagnostics. Report independent leakage-component counts. Paired challenger uncertainty resamples whole shared components, not overlapping windows. Confidence intervals are unavailable with insufficient independent components or an unspecified method; never emit fictitious zero-width certainty. Numeric method parameters/minimum sample counts must be supplied in the frozen experiment protocol. Empty cohorts yield unavailable metrics plus denominator zero. Missing predictions remain visible and count against eligible-case success metrics; exclusions cannot be changed after seeing predictions. No benchmark scores are supplied in Session 1.

## 7. Ablation and challenger contracts

`EditorialExperiment` contains envelope, `experimentId` (prefix `editorial_experiment`), protocol version, status (`planned`, `running`, `completed`, `failed`), exact benchmark ArtifactRef/version, split assignment digest/name, TaskRefs, cohort/case IDs, feature configuration, ranker configuration, seed, repetition ID, implementation/source digest, evaluation protocol refs, metrics availability, resources and artifacts. Timestamps and resource numbers are observations, not guessed values. This session defines the record only.

Feature configuration binds token version, selected channel/signal names, required/optional availability rules, semantic locality policy, normalization/imputation policy refs and fit split/artifact refs. Missingness masks remain visible; imputation never rewrites source evidence. Ablations may mask semantic values, but preserve locality for audit and strata. No implicit feature-channel concatenation, dimension reduction or cache-key change.

Ranker configuration is a discriminated declaration: `none`, `rule{implementationRef,configurationRef}`, or `model{modelId,revision,checkpointRef,trainingRunRef: Availability<ArtifactRef>,configurationRef}`. It binds architecture/config identity without implementing or selecting a ranker. Planned experiments may carry unavailable metrics/resources; completed experiments require evaluated output or explicit task-level unavailable results and coverage. Failed experiments retain error receipts.

Resource observations use availability and measurement provenance for each field: wall runtime milliseconds, CPU/GPU seconds, provider operations, source duration/workload size, cold/warm cache condition and hit/miss counts; peak working set, peak private/commit bytes, measurement scope/method; unique model storage bytes, unique feature/cache storage bytes and experiment-output bytes. Bind hardware/runtime/parallelism and whether model load/preparation are included. Reference existing ModelRun/CostEvent where semantically applicable; do not fabricate their mandatory operation types for new tasks. Measured zero calls is distinct from unmeasured compute. Shared cache objects count once; theoretical FLOPs must be separately labeled estimates if added in a later version.

`EditorialChallengerDecision` contains envelope, `challengerDecisionId` (prefix `editorial_challenger`), baseline/challenger experiment refs, comparison protocol/config ref, affected tasks, paired cohort digest, decision `KEEP | REJECT | INCONCLUSIVE`, quality deltas per metric with uncertainty, compute/storage/runtime/memory deltas with units, regressions with severity/task/evidence, adjudicator pseudonym or deterministic policy identity, and evidence refs. Delta convention is always challenger minus baseline; metric direction indicates improvement. Relative delta against zero baseline is unavailable. No aggregate quality scalar across incompatible tasks.

Comparison configuration is frozen before evaluation and includes primary endpoints, minimum worthwhile gains, noninferiority margins for protected tasks, absolute/relative resource budgets, missingness/coverage limits, minimum independent groups, uncertainty method and treatment of multiple tasks. Unsupported comparisons (different labels/splits/cohorts/hardware scopes without a declared matching protocol) return INCONCLUSIVE.

- **KEEP:** required evidence and sample coverage complete, predeclared quality criteria satisfied with their uncertainty rule, protected tasks pass, resource budgets pass, no disqualifying regression.
- **REJECT:** comparable valid evidence establishes a predeclared disqualifying regression, resource violation, or failure to meet a minimum benefit with the required certainty.
- **INCONCLUSIVE:** missing labels/measurements, insufficient independent groups, ambiguous deltas, incompatible scope, failed run without a comparable quality result, or otherwise unmet evidence prerequisites. Absence of proof is not automatically REJECT or KEEP.

These records make future decisions reviewable. No numeric thresholds, improvements, challenger verdicts or model recommendations are fabricated here.
