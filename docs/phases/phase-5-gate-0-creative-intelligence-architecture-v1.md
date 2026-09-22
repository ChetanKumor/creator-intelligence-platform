# Phase 5 Gate 0 - Creative Intelligence Architecture v1 Freeze

Architecture revision: `creative-intelligence-architecture-1.0.0`.
Date: 2026-09-22. Scope: normative documentation only.
Execution authorized by the owner's Phase 5 Gate 0 instruction. Verification initially pending; the dated acceptance record in section 31 records the eventual result. Owner review remains required before commit; no publication or later implementation is authorized here.

## 1. Gate purpose

Freeze responsibilities, authority, identities, invariants and migration boundaries for Phase 5+ without implementing them. MUST, MUST NOT and REQUIRED are normative. Pseudotypes describe future internal representations, not production declarations, released schemas or permission to execute. Architecture v1 is a document revision; it does not version-bump any existing artifact.

The owned intelligence is contextual editorial decision making and its consented decision data. Pretrained perception is reusable evidence. A valid architecture is not evidence of creative quality, model performance or an executable editor.

## 2. Current repository baseline

Before the first edit:

| Item | Locally observed truth |
| --- | --- |
| HEAD | `2c8cdd1771dfc538f2ce6813b61ce592e210a30f` |
| Commit subject | `docs: close Phase 4 Matcher V0` |
| Branch | `phase/5-edit-planner-v0` |
| `git status --short` | Empty: no tracked modifications or nonignored untracked files |
| Local `origin/main` and `origin/HEAD` | Both equal HEAD |
| Expected pushed baseline | Matches the owner-supplied SHA exactly; zero local commit difference |
| Live remote state | Not queried. Remote-tracking refs are local evidence, not fresh GitHub verification |
| Preservation baseline | SHA-256 captured for all 213 tracked files before editing |

Git metadata exists. Git was absent from PATH; the installed Visual Studio Git executable was used by absolute path (section 31). No Git initialization, branch change, reset, fetch, commit, push or PR occurred. Ignored local media, caches, environment and historical evidence exist; clean Git status does not assert their absence.

Baseline authority is [CURRENT_PHASE](../CURRENT_PHASE.md), its preserved Phase 4 Gates 0-4 closure, and current source. Historical supporting authority includes the [Session 1 architecture](phase-2.6a-session-1-architecture.md), [editorial contracts](phase-2.6a-editorial-contracts.md), [Session 2 handoff](phase-2.6a-session-2-handoff.md), [baseline audit](phase-2.6a-repository-baseline-audit-20260920.md), [acceptance repair](phase-2.6a-acceptance-repair-20260920.md), [Phase 2.6B report](phase-2.6b-real-footage.md), [speech component report](phase-3-speech-asr.md), and [Phase 2 closure](phase-2.5-final-closure.md). Their earlier failures and earlier phase statuses remain historical, not current blockers or rewritten successes.

Proven baseline distinctions:

- Phase 2 is CLOSED; Phase 2.6A and 2.6B are COMPLETE; Phase 3 Audio Analyzer V0 and Phase 4 Matcher V0 are COMPLETE within their accepted scopes. Phase 5 runtime is not started.
- Phase 4 has internal `EditorialToken`, `EditorialCandidateSet`, context/decision/linkage records, deterministic technical ranking, owned cosine comparison, evaluation-authorized reference-semantic ranking, and an explicit two-mode dispatcher. It has no audio-aware ranking, score fusion, fallback or planner. Ranking evidence is not a winner, human judgment or calibrated confidence.
- `ArtifactRef` binds exact bytes, type and version; `EvidenceRef` adds a JSON pointer. `EditorialArtifactMap` verifies bytes and parsed value before resolving explicit inputs. Content IDs alone do not bind every legacy analysis/run field.
- `EditorialToken` 0.1.0 includes source/candidate identity and exact analysis/run references. Its five future channels accept missingness only. Candidate IDs can remain identical across distinct token snapshots; token identity binds the producing snapshot.
- `LLMProvider.generate` currently offers four public output contracts, including UEP, rather than only UEP. `Matcher.rank` and `EditPlanner.plan` expose public plan-bound `DecisionEvent` seams; accepted internal Phase 4 intentionally does not implement that telemetry output.
- UEP 1.0.0 accepts **15-30 seconds**, exact 9:16 output, and bounded constant-speed clip operations. It does not already support Architecture A's whole 30-60 second target. Exactly 30 seconds overlaps; longer outputs need separately authorized contract/executor evolution. No truncation is permitted to conceal this gap.
- Existing footage workers have bounded per-asset limits (approximately ten minutes in the documented path). Architecture A's 5-30 minute raw-project target is not proof that a single 30-minute source already passes those limits. Any later chunking/limit evolution must preserve original source coordinates and have its own gate.
- Phase 4's historical canonical verification reports 303 TypeScript, six media and 15 Python tests, plus 33 generated artifacts. Its real technical smoke hydrated/ranked 872 candidates from persisted real evidence, with no fresh inference. No compatible authorized real reference pair was available. None of these runs is repeated or presented as fresh Gate 0 evidence.
- The accepted semantic checkpoint remains `google/siglip2-so400m-patch16-naflex`, revision `cc24074f717b612951c2dead130904ab9b65a81e`, CPU, 256 patches, 1152 real dimensions, space `space_58bd790c6dc94ee22f001fadec49ff85cb3178eef47a856ca421948b3d06f687`. Routing design grants no exception to these pins or guards.
- TransNetV2 is selectable, not the default. PySceneDetect remains default. The audio composer does not establish a public music drop or phrases: `mainDropSeconds` remains null and phrase boundaries empty under its current projection policy.

These findings correct potential research assumptions; they are not implementation defects to fix in Gate 0. No fresh inference, media decoding, generalization, human creative review or professional edit-quality evidence is produced here.

## 3. Authority hierarchy

**Creative interpretation can reference factual evidence but cannot overwrite factual evidence.** Authority is enforced by separate tagged representations, write permissions and validation; it is not inferred from prose, numeric confidence or the name of a producer.

| Layer | Authority / permitted writer | Cannot do |
| --- | --- | --- |
| MediaTruth | Trusted ingestion/timebase and authorization services: exact source hash/size, asset identity, duration, source coordinates, available frame/sample boundaries, grants and lifecycle state | Accept creative assertions as physical facts or turn a content hash into permission |
| ObservedFact | Registered deterministic/perception producer: a recorded observation with evidence, actual producer/configuration and run lineage | Claim infallibility, change source duration/timebase, derive authority from a Director response |
| DerivedObservation | Registered derivation over grounded observations, retaining dependencies, method and uncertainty | Replace its inputs or promote a hypothesis to observation |
| CreativeHypothesis | Director/editor: editorial intention grounded where possible in evidence | Change MediaTruth, ObservedFact or DerivedObservation; invent trusted source coordinates |

Model-produced observations are evidence that a producer detected something, not ground truth that the detection is correct. For example, a detector proposes a cut index; MediaTruth maps that index through the actual PTS table. The observation retains detector uncertainty. Canonical time mapping does not certify detector accuracy. ASR region times are producer observations validated against source duration/timebase, not newly authored physical timing truth.

MediaTruth is a logical authority boundary over existing source/metadata/authorization artifacts, not a claim that a new unified store already exists. Immutable physical snapshots coexist with separately versioned authorization/retention status. Current deletion or expiry overrides access even when an old snapshot was authorized. Corrections to ingestion evidence require new trusted snapshots and invalidation of dependent views; no creative writer can perform that correction.

## 4. Core invariants

1. Unknown asset: fail before consumption, planning or execution.
2. Unknown candidate: fail; never substitute a similar ID or nearest interval.
3. Incompatible or contradictory evidence: fail; do not reclassify corruption as harmless missingness.
4. Missing capability: explicit unavailable/unsupported assessment; no invented execution node.
5. Director output cannot fabricate MediaTruth.
6. Director output cannot invent trusted source timestamps or frame/sample membership.
7. Creative hypotheses never mutate observed facts or their derived evidence.
8. Provider response objects, vendor finish reasons and token payloads cannot enter owned schemas.
9. Cache reuse requires exact compatible computation identity, payload integrity and current access eligibility.
10. Missing evidence never becomes zero, false, an empty observation set or a negative label by default.
11. Unsupported EditGraph-to-UEP projection fails explicitly, with affected nodes and reasons.
12. Cost/routing policy, estimates, budget authorization and actual attempts are recorded.
13. Model selection is recorded with eligible alternatives and reasons.
14. No silent model fallback, checkpoint substitution or cross-space comparison.
15. No hidden automatic quality downgrade, coverage reduction or lossy export.
16. No fake plan, slot, winner, confidence or public DecisionEvent before real planning context exists.
17. Content identity, exact-byte identity, candidate identity, snapshot identity and operation-attempt identity remain distinct.
18. Existing half-open membership, locality, authorization, deterministic tie groups and complete candidate-universe accounting survive every adapter.
19. Accepted Phase 4 source, public schemas, fixtures, provider seams, cache formulas and model guards remain unchanged by this gate.
20. Historical failures, synthetic evidence, cached real-model evidence, fresh real-model evidence, real footage, human-reviewed evidence and unverified claims remain distinguishable.

## 5. End-to-end logical architecture

```text
RAW PROJECT
  -> MediaTruth
  -> PerceptionArtifactIndex
  -> Budgeted Multi-Resolution Perception
  -> ProjectWorldModel
  -> IntentSpec / EditingDNA / EditorialCanon views
  -> Universal Director (through DirectorProvider)
  -> CreativeDirectionGraph
  -> Candidate Retrieval
  -> Sequence Search
  -> Boundary Optimizer
  -> Capability Planner
  -> PlanningDecision
  -> EditGraph
  -> Deterministic Validator
  -> Execution DAG
  -> Incremental Preview
  -> Multimodal Critic
  -> Local Repair / bounded Director revision
  -> Final QC / Export
  -> EditorDecisionGraph
  -> Preference / ranking / critic learning
```

This is a dependency/authority flow, not an implemented linear service chain. The index is consulted before expensive work; successful perception publishes artifacts back to it. Candidate summaries may be supplied to the Director before post-direction retrieval. Retrieval/search can revisit a bounded evidence view, but cannot silently fetch new evidence or run models. The Boundary Optimizer chooses source coordinates within grounded candidates using trusted source timebases; the Capability Planner proves executor support before accepting a plan.

IntentSpec holds an explicitly supplied goal, domain, audience, output requirements, must-include/exclude constraints and their author/revision. EditingDNA is an optional creator-scoped preference/style snapshot with consent, evidence, uncertainty and derivation version; it is not inferred permission or universal truth. Neither is implemented here.

The Execution DAG is a deterministic compilation of a validated graph plus pinned capabilities/settings into allowlisted executor tasks. Task dependencies and content identities support selective rendering. Render success does not bypass independent final QC. EditorDecisionGraph later records actual exposures, edits, replacements and final survival with original context; it must reuse the accepted distinctions between available, presented, inspected, selected and explicitly rejected. It is not fabricated from unselected ranking options.

## 6. ProjectWorldModel

Responsibility: an immutable, scoped, queryable logical graph of the project's source evidence and interpretations, with explicit completeness. It connects evidence across time and modality so consumers can request bounded views without re-analyzing media.

```ts
type Scope = { projectId: Id; creatorId: Id };
type WorldSnapshot = {
  artifactType: "ProjectWorldModel"; artifactVersion: Version;
  worldId: Id; scope: Scope; revision: number;
  parent: Availability<ArtifactRef>; asOf: Timestamp;
  mediaTruthRefs: ArtifactRef[];
  observedRefs: ArtifactRef[]; derivedRefs: ArtifactRef[];
  entities: EntityRef[]; relationships: RelationshipRef[];
  perceptionIndexSnapshot: ArtifactRef;
  tokenRefs: ArtifactRef[]; candidateSetRefs: ArtifactRef[];
  coverage: EvidenceRef; changeSet: EvidenceRef;
  builder: Producer;
};
```

Entity categories include asset, source shot, frame/sample, candidate, speech region, music beat/section, subject observation, track, mask and source event. Categories unsupported today remain absent with explicit channel/coverage missingness. A track identifier is a scoped observation identity, not a verified personal identity. Every entity reference names its authority class and exact artifact; scope is checked through original authorization even for legacy tokens without an inline creator field.

Temporal relationships include source `before`, `overlaps`, `contains`, `adjacent_to`, `aligned_with`, and observation associations such as `same_track_as`. Source ordering and actual clock alignment are distinguished from creative ordering. Any cross-asset/audio alignment binds an explicit clock-map artifact, units, support and error bounds. No global synchronized clock is inferred from filenames or similar content. A likely reaction or continuity link is a DerivedObservation; an intended reaction order lives in CreativeDirectionGraph.

Factual and derived collections are disjoint. The world model does not embed a creative graph; consumers may join a separately versioned hypothesis overlay by world snapshot ID. Queries return authority tags and missingness rather than flattening all claims into "facts." Conflicting observations are retained with conflict references; a derivation may adjudicate them under a versioned method without deleting inputs.

Incremental updates publish a new snapshot: additions, superseded evidence, invalidated dependency closure and unchanged references are explicit. Parent IDs are acyclic. A failed update leaves the previous snapshot intact and records failure; it cannot publish a complete view. Snapshots never become "latest" inside an already-bound request. Current access/retention is rechecked independently of snapshot time.

Persistence boundary: immutable manifests plus protected content-addressed payloads; later relational tables can index entities/edges and snapshot membership. Ordinary TypeScript structures suffice for an initial logical graph. Neo4j or any graph database is not required. Physical indexes are rebuildable projections, not competing truth. Publication of a snapshot and its dependency inventory must be atomic or expose incomplete status.

Views bind snapshot ID/hash, query/policy version, authorized purpose, selected fields, source ranges, modality coverage, pagination/limits, missing dependencies and output digest. Typical views are candidate evidence, speech/music structure, source chronology, continuity support and technique prerequisites. Bounded omission must be disclosed; an incomplete view cannot imply a whole-project negative finding.

Not stored here: raw media bytes, full vectors, decoder buffers, provider payloads, credentials, executable commands, renderer projects, billing ledger copies, fitted model weights, human labels injected into prediction-time evidence, or an executable timeline. Protected transcripts and content are separate referenced artifacts. EditorialToken remains a candidate-specific snapshot view; the world model links it without changing its identity or treating it as the entire world.

## 7. PerceptionArtifactIndex

Responsibility: discover reusable, immutable computation outputs within an authorized scope. It is an index over artifacts and attempts, not an implicit computation API. **Analyze expensive evidence once; reuse it across edits, variants and revisions.** This applies equally to successful transcripts, embeddings, music analysis, and later tracks/masks.

```ts
type ComputationIdentity = {
  identityVersion: Version; operationKind: Id;
  inputs: OrderedInputIdentity[]; // exact source/artifact dependencies
  producer: { toolId: Id; implementationVersion: Version;
    implementationDigest: Hash; adapterId: Id; adapterVersion: Version };
  model: Availability<{ modelId: Id; providerId: Id;
    exactRevision: string; revisionEvidence: ArtifactRef }>;
  preprocessing: { version: Version; configurationDigest: Hash };
  configurationDigest: Hash;
  semanticExecutionSettings: EvidenceRef;
  outputSchema: { artifactType: Id; version: Version };
  determinismPolicy: EvidenceRef;
};
type PerceptionArtifactEntry = {
  computationKey: Hash; identity: ComputationIdentity;
  output: Availability<ArtifactRef>; dependencies: ArtifactRef[];
  attemptRefs: ArtifactRef[]; producerLifecycleRef: ArtifactRef;
  accessBindingRefs: ArtifactRef[];
};
```

The key is SHA-256 of the validated canonical identity under a versioned namespace. Inputs bind source hash/size, original asset identity, exact source range or frame/sample identities and PTS/timebase snapshot where applicable, extracted content hash, ordered temporal support, proxy mapping and all consumed artifact digests. A source hash alone is insufficient for a temporal operation. A frame-content cache may reuse identical pixels only under a declared pixel-only computation policy, preserving separate temporal occurrence IDs in lineage. Semantic aggregations bind contributing embedding IDs, order and aggregation policy.

Models require an immutable exact revision, not "latest" or a mutable alias. A cloud profile without reproducible revision evidence is ineligible for this cache contract until an approved adapter can bind it; do not claim exact reuse. Deterministic tools use `not_applicable` model identity, with a pinned implementation. Prompt/template, context-view digest, response schema, decoding/sampling configuration and seed where supported belong in identities for future generative work. No sensitive raw prompt belongs in an index key record; its protected artifact digest does.

Device, precision, quantization, kernels and runtime settings MUST bind identity when they can change output semantics/compatibility. Pure performance-only hardware observations remain attempt metadata under an explicit compatibility policy; unknown equivalence is incompatible. Existing accepted device/cache formulas are never weakened retroactively.

Separate request identity from output identity: stochastic runs can share a computation request key yet produce different immutable output digests. The index must retain all attempts and select one explicitly accepted output by a pinned selection receipt, never last-writer-wins. Reuse replays an existing result; it does not claim fresh deterministic inference. Conflicting deterministic outputs produce an integrity failure pending investigation.

| Lookup result | Exact meaning / permitted next step |
| --- | --- |
| CACHE HIT | Exact key, compatible producer/schema/space, complete valid payload/dependencies, pinned output selection, and current authorized access. Return reference and reuse receipt; no inference |
| CACHE MISS | No accepted output for the exact key. Return missingness; computation requires a separate recorded scheduling/budget decision |
| INCOMPATIBLE CACHE | Related entry exists but revision/config/schema/space/input or integrity differs. Reject reuse and name mismatches; corruption is a hard integrity error |
| FAILED ARTIFACT | A recorded attempt failed; no successful payload may be consumed from it. Retain error/cost evidence; retry only under explicit bounded policy |
| STALE/RETIRED PRODUCER | Producer no longer satisfies the selected consumer policy. Historical evidence remains addressable where permitted, but is not automatically eligible. An explicitly pinned historical evaluation may use it only if that policy allows; security/licensing revocation cannot be waived by cache reuse |

Lookup is side-effect-free with respect to production computation. No silent recomputation, provider loading, frame repair or fallback is hidden in resolution. Current legacy cache repair behavior is preserved in source; a later index adapter must expose that potential work as separately authorized/recorded work, not claim that the legacy path already obeys this future interface.

## 8. ObservedFact / DerivedObservation / CreativeHypothesis

Shared sketches reuse the semantics of existing `ArtifactRef`, `EvidenceRef`, `Producer` and `Availability<T>`; they do not extend the accepted schemas. Missing states are `not_computed`, `unavailable`, `not_applicable`, `failed`, `unsupported`, each with a reason and supporting references; failed states require error evidence. A present empty detection list means an actual completed search over declared coverage found none.

```ts
type Uncertainty = Availability<{
  kind: "measurement_error" | "model_score" | "calibrated_probability"
      | "ordinal_assessment" | "self_reported";
  valueRef: EvidenceRef; meaning: Id; methodVersion: Version;
  calibration: Availability<ArtifactRef>;
}>;
type ObservedFact = {
  kind: "observed_fact"; factId: Id; version: Version; scope: Scope;
  subject: GroundedEntityRef; sourceSupport: GroundedSupportRef[];
  observationType: Id; value: Availability<EvidenceRef>;
  evidenceRefs: NonEmpty<EvidenceRef>; producer: Producer;
  computationKey: Hash; uncertainty: Uncertainty;
};
type DerivedObservation = {
  kind: "derived_observation"; observationId: Id; version: Version;
  scope: Scope; dependencies: NonEmpty<ObservedRef | DerivedRef>;
  interpretationType: Id; value: Availability<EvidenceRef>;
  derivation: Producer; computationKey: Hash;
  uncertainty: Uncertainty; conflicts: ArtifactRef[];
};
type CreativeHypothesis = {
  kind: "creative_hypothesis"; hypothesisId: Id; version: Version;
  scope: Scope; worldSnapshot: ArtifactRef;
  proposition: CreativeProposition;
  grounding: (MediaTruthRef | ObservedRef | DerivedRef)[];
  groundingState: "grounded" | "partially_grounded" | "ungrounded";
  priorHypotheses: HypothesisRef[];
  author: DirectorRunRef | EditorAuthorshipRef;
  uncertainty: Uncertainty; alternatives: HypothesisRef[];
};
```

GroundedSupportRef resolves an actual source range/sample/frame in a trusted snapshot with asset/hash/timebase, not an arbitrary Director-supplied numeric interval. An ObservedFact may consume earlier observation artifacts for preprocessing, but must represent the direct output of a registered observational producer. Camera-motion classification, aesthetic score, reaction likelihood and continuity inference are always DerivedObservation regardless of whether one model emits them directly. Routing an interpretation through a provider does not promote its authority class.

Legal dependency rules: observations can reference MediaTruth and preceding observation artifacts; derivations reference observations/earlier derivations and must transitively reach observed evidence and MediaTruth. Neither can depend on CreativeHypothesis as factual support. A hypothesis can reference factual evidence and prior hypotheses, but the latter are creative dependencies, not evidence grounding. A Director proposal may schedule a future observation request; only a separately authorized producer's actual output can create that observation. No casting or copying of a hypothesis into a fact is valid.

Dependency cycles, foreign scope, unresolved IDs, wrong authority tags and mismatched support fail. Uncertainty propagates through an explicit method; missing input uncertainty never becomes certainty. Scores retain units/meaning and cannot be labeled probabilities without calibration evidence. A human correction creates a separately attributed observation/annotation or hypothesis according to what was actually supplied; it never silently rewrites prior evidence.

## 9. ModelProfile / ModelSelector

ModelProfile is provider-neutral capability metadata, not a vendor response schema:

```ts
type ModelProfile = {
  profileId: Id; version: Version;
  modelId: Id; exactRevision: string; revisionEvidence: ArtifactRef;
  adapter: { adapterId: Id; version: Version; implementationDigest: Hash };
  capabilities: CapabilityRequirement[];
  modalities: ("text" | "image" | "audio" | "video")[];
  deployment: "local" | "cloud";
  qualityTier: Id; qualityEvidence: Availability<ArtifactRef>;
  contextLimits: EvidenceRef; // explicit units and modality limits
  expectedLatency: Availability<Estimate>;
  estimatedCost: Availability<Estimate>;
  resourceRequirements: EvidenceRef;
  licensing: EvidenceRef; commercialEligibility: Availability<boolean>;
  availability: Availability<EvidenceRef>; observedAt: Timestamp;
};
type ModelSelection = {
  selectionId: Id; scope: Scope; requestedCapability: CapabilityRequirement;
  qualityRequirement: EvidenceRef; budget: ArtifactRef;
  candidateProfiles: ArtifactRef[];
  eligibleProfiles: ArtifactRef[]; excluded: ExclusionWithReason[];
  costEstimates: EstimateRef[]; latencyEstimates: EstimateRef[];
  chosen: Availability<ArtifactRef>;
  policy: EvidenceRef; rationaleCodes: Id[];
  fallbackEscalationPolicy: EvidenceRef;
  availabilitySnapshot: ArtifactRef; inputViewDigest: Hash;
};
```

ModelSelector is a pure decision contract over pinned profile, requirement, budget and availability snapshots. It records every evaluated profile's eligibility/rejection and deterministic ordering/tie policy. If selection uses stochastic policy, it records seed and exact policy state; the choice must be replayable from captured inputs. External availability can change, so execution rechecks it and records a new selection if needed. Reproducible selection is not a promise of reproducible model outputs.

No invisible `auto`. Cheap-model-first means choose the least-cost eligible profile meeting the declared quality and resource constraints, according to the recorded policy. Quality tiers are versioned owned requirements, not vendor product names or unproven quality rankings. A tier with no evaluation evidence cannot claim a measured quality guarantee. All retries, fallback and escalation require trigger evidence, allowed alternatives, remaining budgets and maximum attempts. A change of model or quality tier produces a new recorded selection; no hidden downgrade. Empty eligibility returns explicit unavailable with reasons.

## 10. ComputeBudget / CostTrace

```ts
type ComputeBudget = {
  budgetId: Id; version: Version; scope: Scope;
  authorizationRef: ArtifactRef; qualityTier: Id;
  cpuMilliseconds: number; gpuMilliseconds: number;
  peakRamBytes: number; peakVramBytes: number;
  apiSpendInrMicros: number; totalCostInrMicros: number;
  wallClockMilliseconds: number; modelCalls: number;
  renderWork: { frames: number; pixelFrames: number; audioMilliseconds: number };
  premiumOperations: { capabilityId: Id; allowed: boolean; maxCalls: number }[];
  retryLimit: number; directorRevisionLimit: number;
  childAllocations: ArtifactRef[]; reservationPolicy: EvidenceRef;
};
type CostTrace = {
  traceId: Id; scope: Scope; operationId: Id; attempt: number;
  parentOperation: Availability<Id>; computationKey: Hash;
  selectionRef: Availability<ArtifactRef>; budgetRef: ArtifactRef;
  projectedCost: Availability<Estimate>; expectedLatency: Availability<Estimate>;
  authorizedReservation: ArtifactRef;
  observedLatency: Availability<Measurement>;
  resourceObservations: Availability<EvidenceRef>;
  costEventRef: Availability<ArtifactRef>; modelRunRef: Availability<ArtifactRef>;
  outcome: "succeeded" | "failed" | "cancelled" | "reused";
  reusedArtifact: Availability<ArtifactRef>; originalAttempt: Availability<ArtifactRef>;
};
```

All limits are finite, nonnegative integers in declared units; zero forbids that resource/operation, not "unlimited." An incomplete authorization cannot execute until limits are supplied. Budgets bound a whole job/revision and explicitly allocated children; parallel reservations cannot overspend a parent. RAM/VRAM are peak/concurrency limits, CPU/GPU time is cumulative, wall clock is elapsed deadline including retries, and render work is workload rather than money. Existing capacity guards remain an independent prerequisite even with adequate budget.

An estimate records value/unit, model or rate-card version, workload assumptions, estimate time/validity, scope and uncertainty. A measurement records actual scope, method and time. Projected cost is a pre-execution estimate; authorized budget is permission, not expenditure; measured cost is observed accounting; estimated cost remains estimated after execution when pricing/resources are incomplete. Unknown costs are missing, never zero. Numeric ceilings and tier economics are deployment configuration to be authorized/evaluated later, not invented here.

CostTrace links the existing `CostEvent` ledger instead of creating a second bill. Existing CostEvent already binds project/job/creator/environment, operation/attempt, provider/tool/model, duration, units, `costInrMicros` and measured/estimated/synthetic basis. One INR is 1,000,000 microrupees. One complete CostEvent per operation attempt remains the accounting boundary; exact repeated event IDs deduplicate, conflicting IDs or duplicate attempts fail. CostTrace must not add the linked amount a second time.

Missing billing remains unavailable in CostTrace; do not create a zero-valued public event to satisfy its mandatory fields. Future operations that do not fit the frozen OperationSchema must retain internal trace evidence pending deliberate telemetry evolution; never mislabel an operation to force export. Partial billing reconciliation needs a separately approved append-only reconciliation design, not mutation of old CostEvents.

Cache hits record retrieval/validation/storage work actually done and link the original computation cost without charging it twice. Failed and retried work consume budget and remain in complete cohorts. Shared perception cost allocation across variants needs an explicit allocation policy; marginal cost and amortized total cost are distinct. Later quality-improvement-per-rupee comparisons bind paired quality dimensions, cohort/protocol, baseline/challenger traces, allocation policy and uncertainty. Zero incremental cost or missing quality/cost produces an explicit undefined/unavailable ratio, not infinity or a fabricated benefit.

## 11. DirectorRequest / DirectorResult

```ts
type DirectorRequest = {
  requestId: Id; version: Version; scope: Scope;
  intent: ArtifactRef; worldView: ArtifactRef;
  candidateSummaryView: ArtifactRef; // exact candidate set + token snapshots
  audioMusicView: Availability<ArtifactRef>;
  referenceGrammar: Availability<ArtifactRef>;
  canonView: ArtifactRef; editingDNA: Availability<ArtifactRef>;
  computeBudget: ArtifactRef; capabilitySnapshot: ArtifactRef;
  modelSelection: ArtifactRef; outputRequirements: EvidenceRef;
  priorDirection: Availability<ArtifactRef>;
  revisionScope: Availability<EvidenceRef>;
};
type DirectorResult = {
  resultId: Id; version: Version; request: ArtifactRef; scope: Scope;
  outcome: "succeeded" | "partial" | "abstained" | "failed";
  direction: Availability<ArtifactRef>; // CreativeDirectionGraph
  unresolvedRequirements: RequirementFinding[];
  uncertainty: Uncertainty; groundingReport: ArtifactRef;
  producerRun: ArtifactRef; modelRun: Availability<ArtifactRef>;
  selection: ArtifactRef; costTrace: ArtifactRef;
  failure: Availability<SanitizedFailure>;
};
```

DirectorProvider accepts this owned request and returns this owned result. The adapter resolves only authorized bounded views and translates them into its private provider request. No provider object escapes. Runtime-owned receipts report actual model/profile/revision, adapter/template/configuration, input/output digests and attempts; the model cannot author its own trusted billing, run status or identity.

The Director may identify candidates, evidence IDs, editorial ordering, desired relative duration/pacing and output goals. It cannot author trusted source timestamps, issue path/URL fetches, extend candidate bounds or turn text such as "at 12 seconds" into an executable source range. A numeric source-time proposal is rejected at the owned result boundary; a quoted timestamp in source content remains untrusted text. The planner later resolves exact candidate/evidence references and derives valid ranges from MediaTruth. Requested but unseen material is an unresolved requirement with no candidate ID, never an invented candidate.

Succeeded requires a complete valid direction under the request's required coverage. Partial is explicit and cannot satisfy omitted hard constraints; abstained carries no pretend plan; failed retains sanitized evidence. A syntactically valid graph with foreign/missing references is a failure. A model's self-reported confidence is at most a labeled uncertain assessment, never a trusted probability or public decision confidence.

## 12. CreativeDirectionGraph

This graph specifies **what the edit should become**, not an executable timeline.

```ts
type CreativeDirectionGraph = {
  directionId: Id; version: Version; scope: Scope;
  request: ArtifactRef; worldSnapshot: ArtifactRef;
  candidateUniverse: ArtifactRef; revision: number;
  parent: Availability<ArtifactRef>;
  nodes: DirectionNode[]; edges: DirectionEdge[];
  constraints: CreativeConstraint[]; alternatives: AlternativeBranch[];
  hypotheses: HypothesisRef[]; unresolvedRequirements: RequirementFinding[];
};
```

Node types cover narrative objective, story beat, emotional progression, sequence intention, shot-role intention, pacing target, reaction relationship, music relationship, transition, sound design, graphics, color and technique intention. Each node carries an owned typed intent, hard/soft priority, scope, evidence/hypothesis refs and uncertainty. Content-bearing descriptions are protected project content, not telemetry.

Edges express intended order, supports, reacts-to, builds-toward, synchronizes-with, alternative-to and requires. A reaction edge between known candidates expresses editorial intent; it does not assert a factual reaction or source chronology. Music links use known beat/section IDs and a desired relation; missing drops remain missing. Relative pacing targets and output-duration constraints never constitute trusted source ranges.

Known candidate references MUST belong to the pinned universe and resolve to exact token snapshots. Alternatives reference complete intended branches with declared mutually exclusive choices, not an ambiguous bag of nodes. Dependency/intended-order cycles, duplicate IDs, conflicting hard constraints and unknown evidence fail validation. Soft conflicts remain explicit unresolved findings until the planner records an actual choice. Technique intention may be valid even when capability is unavailable, but it cannot pass into execution without capability resolution.

## 13. Editorial Canon

EditorialCanon is the owned, versioned knowledge layer: narrative grammar, editing techniques, domain grammar, known failure patterns, prerequisites, compatible/incompatible techniques, evaluation criteria, examples and execution recipes.

A CanonEntry binds `entryId`, version, authorship/license/source evidence, domain applicability, grammar/technique type, typed prerequisites, compatible/conflicting entry refs, failure modes, evaluation-rubric refs, example refs and recipe refs. A CanonView binds the exact selected entries, selection policy and digest. Editorial principles are guidance/knowledge, not observations about a user's project.

Examples need authorized content/provenance and cannot leak evaluation labels into prediction input. Recipes reference TechniqueGraph primitives and capability requirements rather than executable code or provider instructions. Canon updates create new revisions; every Director request pins its view. No giant knowledge base, retrieval service or recipe implementation is populated here.

## 14. TechniqueGraph

An owned compositional description of editing/VFX operations. It is separate from both desire and executor availability.

```ts
type TechniqueGraph = {
  techniqueId: Id; version: Version;
  nodes: { nodeId: Id; primitive: PrimitiveRef; parameters: TypedParameters;
    inputs: TypedPortBinding[]; preconditions: PredicateRef[];
    requiredCapabilities: CapabilityRequirement[];
    expectedCost: Availability<Estimate>; risk: RiskAssessment;
    evidenceRefs: EvidenceRef[] }[];
  dependencies: PortEdge[]; outputPorts: TypedPort[];
  validationPolicy: ArtifactRef; fallbacks: FallbackRelationship[];
};
```

Primitive vocabulary can cover cut, trim, speed, time remap, crop, transform, rotate, scale, perspective, warp, blur, opacity, blend, mask, track, roto, key, depth, text, shape, sound, music, color, camera, particle and generative transform. Listing a primitive does not implement or approve it.

Each primitive is registered/versioned with typed input/output ports, parameter schema, units, coordinate/color/time spaces and bounds. Preconditions include source handles, supported time mapping, mask/track coverage, temporal consistency, font/license and modality requirements. Dependencies form an acyclic evaluation graph; iterative techniques need explicit bounded iteration primitives, not arbitrary cycles.

Deterministic recipe identity binds primitive versions, canonical parameters, ordered topology, dependencies and validation policy. An instantiated execution identity additionally binds resolved inputs, executor/settings/output profile and seed policy. Deterministic identity is not a claim that a generative primitive is deterministic. Validation rejects unknown primitives/parameters, unresolved ports, incompatible units, missing dependencies or unmet prerequisites.

Fallback edges name an alternative recipe, triggering condition, quality/semantic difference, capability requirements, cost delta and approval policy. They are possibilities, not automatic substitution. A planner must record the chosen alternative and any authorized relaxation of intent; an essential effect without acceptable fallback blocks planning.

## 15. CapabilityGraph

CapabilityGraph describes what actual executors can perform, with `snapshotId`, version, scope/environment, `asOf`, executor ID/version/implementation digest, supported primitives/profiles, parameter/format/resource limits, dependency edges, license eligibility and conformance evidence. Requirements are owned capability identifiers and predicates; vendor implementation details live in adapter descriptors.

| Status | Meaning |
| --- | --- |
| AVAILABLE | All requested predicates are supported and required resources/configuration/conformance evidence are present in this snapshot |
| PARTIAL | A specifically enumerated subset is supported; unmet predicates remain explicit. The original full request cannot execute |
| UNAVAILABLE | The capability is known but temporarily inaccessible, unconfigured, unverified or lacks resources/permission; reason and next check required |
| UNSUPPORTED | No registered executor/version can represent the requirement under the requested profile |
| FAILED | An actual capability check or execution failed; reference the sanitized attempt evidence |

Assessments bind exact requirement, executor snapshot and proof, not just a name such as "supports effects." Desired technique is not capability. Capability planning produces a resolved mapping or an explicit blocked result. Any partial fallback requires a new recorded choice, satisfied hard constraints and authorized quality policy. Executor availability is checked again immediately before use; changed state invalidates the prior executable assessment. No probing or executor work is performed in Gate 0.

## 16. PlanningDecision

Internal evidence of an **actual** planner/search decision after the relevant context exists. It is separate from Phase 4 ranking predictions, accepted human/editorial observations and public DecisionEvent.

```ts
type PlanningDecision = {
  planningDecisionId: Id; version: Version; scope: Scope;
  searchRun: ArtifactRef; contextSnapshot: ArtifactRef;
  direction: ArtifactRef; candidateUniverse: ArtifactRef;
  alternativesConsidered: ArtifactRef; scoresAndMissingness: EvidenceRef;
  policy: EvidenceRef; constraintsChecked: EvidenceRef;
  outcome: { kind: "chosen"; optionId: Id }
         | { kind: "tie"; optionIds: NonEmpty<Id> }
         | { kind: "abstained" | "infeasible"; reasonCode: Id };
  confidence: Uncertainty; evidenceRefs: EvidenceRef[];
  budgetTrace: ArtifactRef; previousDecisions: ArtifactRef[];
};
```

Search context binds world/candidate snapshots, preceding uses, objective/score definitions, capability constraints, seed/tie rules, bounds and stopping reason. Retain all actually considered options and their pruning reasons; a bounded search is not exhaustive optimality. Referenced manifests can hold large sets without truncating public telemetry to 256 candidates. Planned-but-unrun search has a request, not PlanningDecision evidence.

No mandatory `planId` or `slotId` appears here. A later plan-binding record is created only when a concrete plan revision and clip/use slots exist, linking decisions to them without rewriting decision history. Chosen options must exist; ties do not invent a winner. Heuristic scores and model self-reports do not supply missing public confidence.

Public telemetry export requires real plan/revision/slot, a compatible decision kind, the complete considered candidate list within public bounds, actual winner and meaningful confidence under a declared policy. If these do not exist, export is unavailable/unsupported; do not emit DecisionEvent. UEP validation currently requires such selection events, so missing truthful telemetry can block UEP export even when graph operations themselves fit. This is an explicit compatibility constraint requiring a later gate, not permission to fabricate events.

Avoid hash cycles: PlanningDecision binds prior search context, EditGraph references that decision, and a later immutable export bundle binds graph digest, actual assigned plan/clip/event IDs and validated outputs. UEP IDs are not retroactively inserted into the earlier content-addressed decision. Human feedback remains a separate observation of actual behavior.

## 17. EditGraph

The future rich internal editable timeline, above the released UEP. It describes resolved operations and source use, retaining creative/evidence/decision lineage.

```ts
type EditGraph = {
  editGraphId: Id; version: Version; scope: Scope;
  revision: number; parent: Availability<ArtifactRef>;
  outputProfile: ArtifactRef; mediaTruthSnapshot: ArtifactRef;
  tracks: Track[]; clipUses: ClipUseNode[];
  operations: TechniqueInstance[]; dependencies: PortEdge[];
  directionRef: ArtifactRef; planningDecisionRefs: ArtifactRef[];
  capabilityRequirements: CapabilityRequirement[];
  changeSet: ArtifactRef;
};
```

Tracks are typed video/audio/music/graphics/captions with stable IDs and explicit composition order. Every clip use has a unique occurrence ID, source asset/hash/evidence/candidate refs, selected source range, output range, time mapping and decision refs. Repeated use of one candidate has distinct occurrence IDs. Source and output clocks are different types: exact rational ticks/timebases with actual PTS/frame/sample mappings where available. Missing frame/sample evidence prevents frame-exact claims. UEP seconds conversion must meet its arithmetic tolerance and cannot imply precision beyond the source.

Time mappings support constant speed and later validated time-remap curves. J/L cuts require independently ranged/timed linked video and audio uses. Transforms/keyframes declare coordinate spaces, interpolation and units; masks, tracking, roto and depth remain artifact refs with temporal coverage. Compositing declares layer order, opacity/blend and color space. Audio automation, music, captions, typography/font assets, graphics and effect chains bind typed parameters and authorized content. TechniqueGraph instances and executor requirements attach to operations. No shell/filter-graph/vendor project code belongs here.

Validation checks source authorization/retention, exact references, candidate containment unless a separately authorized new proposal exists, time-map domain/range, track topology, explicit overlap, audio/video synchronization, dependency closure, capability support and budget feasibility. Unsatisfied execution requirements produce a non-executable graph/result, never a successful execution DAG. Rich unsupported operations cannot be discarded to make validation pass.

Revisions are immutable with parent and change-set references. Unchanged subgraphs retain content identity; edited instances retain logical occurrence lineage with new revision content. No mutation of source bytes or prior plans. A change set exposes affected output/source regions and transitive dependents for incremental rendering and critic rechecks. Global operations may invalidate the entire output; localized rendering is an optimization requiring dependency proof.

## 18. CriticReport

A multidimensional evaluation of an exact edit graph/revision and, for media findings, an exact rendered artifact. It does not collapse into one scalar quality number and does not grant export authority.

```ts
type CriticReport = {
  reportId: Id; version: Version; scope: Scope;
  editGraph: ArtifactRef; render: Availability<ArtifactRef>;
  direction: ArtifactRef; intent: ArtifactRef; protocol: ArtifactRef;
  producer: Producer; modelSelection: Availability<ArtifactRef>;
  costTrace: ArtifactRef; coverage: EvidenceRef;
  dimensions: { dimension: CriticDimension; assessment: Availability<EvidenceRef> }[];
  findings: { findingId: Id; dimension: CriticDimension;
    severity: "info" | "minor" | "major" | "blocking";
    uncertainty: Uncertainty; evidenceRefs: NonEmpty<EvidenceRef>;
    affectedOutput: Availability<OutputRegion>; graphNodeIds: Id[];
    repairScope: "local" | "sequence" | "global" | "none";
    deterministicRepairPossible: Availability<boolean>;
    localRepairPossible: Availability<boolean>;
    directorReconsideration: "required" | "not_required" | "undetermined";
    suggestedRepair: Availability<EvidenceRef> }[];
};
```

Required dimension vocabulary: story, material selection, coherence, emotion, reaction timing, pacing, rhythm, music sync, trim timing, continuity, motion continuity, eye trace, subject coverage, visual variety, technical quality, reference fidelity, style, sound, graphics, user/client requirements, over-editing and under-editing. Each is assessed under a versioned rubric or explicitly not computed/not applicable/unavailable. No finding is not proof that a dimension passed if coverage is incomplete.

Confidence/uncertainty retains meaning and calibration limits. Findings identify measured/observed versus inferred concerns. Media claims require media evidence; a graph-only critic cannot claim it inspected pixels or audio. Unknown nodes, foreign renders or stale revisions fail. Output regions use the evaluated output clock, not invented source times.

Repair is a proposal, never a bypass: apply only an authorized bounded operation, create a new revision, revalidate, render affected dependency closure and re-evaluate affected dimensions. Deterministic/local repair must identify satisfied preconditions. Director reconsideration receives the prior result, findings and bounded revision scope, consumes the remaining budget, and cannot alter factual evidence. Attempts/deadline/convergence policy bound the loop; exhausting it yields explicit unresolved findings. Final QC independently checks technical delivery requirements against the active render.

## 19. UEP compatibility boundary

`packages/contracts/edit-plan.ts` and UniversalEditPlan 1.0.0 remain frozen. UEP is the released V1 contract for existing V0 behavior, not the future frontier representation. A future pure projection returns either the validated plan plus lineage report, or explicit unsupported/incompatible findings. No automatic baking, flattening, truncation, dropping effects or quality reduction is a lossless projection.

| EditGraph content | UEP lossless subset / boundary |
| --- | --- |
| Output | Exact 9:16; rational FPS within 1-120; bounded resolution; **15-30 second** target, with 1 microsecond timeline tolerance |
| Video | 1-120 ordered clips; starts at zero, continuous except declared dissolve overlaps; positive contained source ranges |
| Time mapping | Constant speed in [0.25, 4]; no speed ramps, freeze/reverse or arbitrary remap curves |
| Crop | Static cover/contain, normalized focal point, scale [1, 4]; no arbitrary transforms, rotation, perspective or keyframes |
| Source sound | Gain [0, 2] on its clip; no independent J/L timing or gain automation |
| Transitions | Cut or dissolve up to two seconds; incoming+outgoing overlap shorter than each clip; final clip ends with cut; no implicit source handles |
| Music | At most one source range with output start, gain [0, 2] and fitting fades; no looping, stretching or multitrack mix |
| Captions | Up to 120, bounded text/language/range; upper/middle/lower, clean/emphasis |
| Graphics | Up to 32 bounded text overlays in supported positions; no arbitrary typography/font layout, shapes or motion graphics |
| Color | Up to 16 neutral/warm/cool preset effects, intensity [0, 1]; no general grading/effect chain |
| Provenance | Existing planner/version/model-run/reference metadata, actual clip decision IDs, reasons and confidence; additional graph lineage retained in an explicit sidecar |
| Rich operations | Multitrack compositing, masks/tracks/depth, blend chains, keyframes, automation, advanced VFX/3D/generation and professional interchange: unsupported by UEP |

"Lossless" means the supported editable operation/timing semantics are preserved; UEP is not a container for the full graph's metadata. Preserve the original graph and an exact graph-node-to-plan-item mapping sidecar, including which non-executable metadata stays outside UEP. No intended rendered or editable operation may disappear. Pixel-exact equivalence still requires future renderer conformance for rounding, padding, fonts and transitions; current source does not prove that conformance.

Projection also runs `UniversalEditPlanSchema`, `validatePlanWithInputs`, relevant telemetry joins and capability validation. Note that `validatePlanWithInputs` currently parses ReferenceFingerprint 1.0.0, whereas Phase 4 reference-semantic ranking uses 1.1.0. A 1.1.0-only reference cannot silently flow through the old plan validator; deliberate compatibility/version evolution is required if that reference is needed for export. Missing real decisions/confidence, count overflow, unsupported duration or reference version must fail explicitly. No public schema is changed here.

## 20. Existing EditorialToken migration boundary

Decision: **B - separate perception artifacts referenced by ProjectWorldModel.** Do not continually widen EditorialToken into an all-purpose evidence object.

Keep accepted EditorialToken 0.1.0 byte-for-byte and keep its `future.temporalMotion`, `qualityAesthetic`, `speechAudio`, `music`, `referenceStyle` missing-only. Rich evidence is stored in separately versioned artifacts and joined by exact source/shot/range/sample/candidate identities in a new world snapshot/view. A populated world channel does not retroactively populate a legacy token slot.

Later ingestion must validate original artifact bytes, legacy descriptor/envelope, analysis/run/configuration joins and original candidate/proposal/token IDs. It may wrap a legacy artifact with a new immutable descriptor linking its exact bytes; it must never claim an old ID used a new hash formula. If implementation identity, authorization or dependencies are absent, mark that import incomplete or ineligible for the requested reuse. Migration is not permission to repair by inference.

Phase 4 consumers continue to consume their exact accepted tokens/sets. New consumers bind a world view plus token/candidate set, with feature-selection policy and snapshot digest; enriched retrieval/ranking creates a new prediction/version, not a changed Gate 4 score. Existing locality is preserved, including a borrowed frame at the excluded end with zero interval distance. Richer evidence does not relabel historical borrowed support as in-window.

No token version is introduced in this decision. A future token shape change would require a separately authorized explicit version/migration, not automatic activation of reserved fields. Separate artifacts permit new perception capabilities and selective recomputation without invalidating every token or duplicating vectors/transcripts.

## 21. Provider-neutrality rules

Current `LLMProvider`, public Matcher and EditPlanner remain unchanged. Migration direction:

```text
legacy planning seam: LLMProvider -> UniversalEditPlan
future reasoning seam: DirectorProvider -> DirectorResult / CreativeDirectionGraph
future planning: owned retrieval/search/boundaries/capabilities -> EditGraph
future compatibility: explicit validated EditGraph -> UniversalEditPlan projection
```

The old generic LLM seam also exposes analysis contracts; this sketch changes only the architectural planning direction. Provider replacement must not change WorldModel, direction, technique, capability or edit schemas. Owned model/provider IDs are opaque identity strings, not SDK types. Vendor response objects, vendor-specific finish reasons and token payloads terminate inside adapters. Adapters map to owned failure/outcome codes and sanitized accounting units while retaining protected diagnostic references where authorized. Unknown vendor states fail mapping rather than escaping as arbitrary JSON.

Core modules remain independent of provider SDKs, process/filesystem/network access and secret configuration. Composition roots inject adapters/resolvers. No new provider, SDK, API key access or LLM invocation occurs here.

## 22. Caching and recomputation rules

Every expensive future operation needs a ComputationIdentity (section 7) or its versioned operation-specific extension, with an immutable output digest and CostTrace. A retrieval request that cannot prove a cache identity cannot silently execute expensive work.

| Operation | Identity dependencies beyond common producer/schema/settings |
| --- | --- |
| Proxy / decode / sampled frames | Source hash, original timebase and selected range/frame IDs, decoder/version, rotation/color/audio conversion, output format; source-to-proxy mapping |
| Transcript / speech | Audio source/hash/range, extraction/resampling, language/task config, exact model revision and alignment policy |
| Embedding / temporal features | Source/frame content and ordered occurrence refs as required, model/revision/preprocessing/space, pooling/configuration |
| Music analysis / tracks / masks / depth | Source modality/range, sampling/coordinate/time-map policies, exact dependent artifacts, producer/model/settings |
| World views / retrieval / ranking | World/candidate/index snapshot, query/features/policy, required space, bound coverage and missingness |
| Director | Request/view/canon/DNA/intent digests, model/adapter/template/revision, sampling/seed/output schema |
| Sequence / boundary / capability planning | Exact options/context/direction/constraints, source timebases, search bounds/seed/objective, capability snapshot |
| Execution / preview / render | Validated graph subgraph and dependency digests, source ranges/proxies, executor/version, fonts/effects/color/output settings |
| Critic / repair / final QC | Exact graph/render/intent/evidence/rubric, producer/selection/settings and requested region/coverage |

Perception reuse across edits/variants/revisions uses unchanged source dependencies regardless of later creative intent. Changed intent invalidates creative descendants, not source embeddings. Changed source/preprocessing/revision invalidates only affected perception and transitive derived descendants. A track crossing an edited source interval can require broader recomputation; dependencies, not guessed locality, determine scope.

Changed-region rendering includes overlapping clips, transitions, temporal filter handles, audio tails and global dependencies. Preview and final output settings are distinct identities; lower-resolution previews cannot masquerade as final renders. Proxies have distinct identity plus exact mapping to originals; never replace source hashes with proxy hashes. Reusable artifact storage has integrity, quota and lifecycle controls; persistence is not perpetual retention.

## 23. Cost and latency rules

Every expensive attempt eventually exposes computation key, expected cost, measured/estimated actual cost or explicit missingness, expected/observed latency, model/tool identity, retry attempt and reuse status. Requests reserve finite budgets before dispatch. Deadline/resource checks occur before model load and between bounded operations. Unexpected exhaustion stops affected work with receipts; it does not authorize changing machine memory settings, killing user processes or bypassing repository guards.

Multi-resolution perception declares coverage targets, minimum coverage, selected resolutions and escalation criteria in policy. If a budget cannot satisfy a required minimum, fail or return an explicitly incomplete result. Optional reductions can proceed only under previously authorized quality policy and must be recorded. Later premium operations require explicit capability/purpose eligibility and budget allocation; no pricing-plan implementation is introduced.

A retry is a new attempt with measured consumed work, not an erased failure. Expected latency is an estimate, observed latency is measured; warm-cache time is not cold-model time. Measurement scope must identify loading, preprocessing, inference, IPC, storage and render work included/excluded. Missing GPU attribution is not zero GPU use. No numeric price/performance claims or vendor recommendations are made by this freeze.

## 24. Failure semantics

```ts
type SanitizedFailure = {
  code: Id; stage: Id; retryable: boolean;
  affectedRefs: ArtifactRef[]; evidenceRefs: NonEmpty<EvidenceRef>;
  dependencyFailures: ArtifactRef[];
};
```

Hard integrity/scope errors (unknown source/candidate, mismatched digest, incompatible space/version, fabricated times, foreign ownership) stop the consuming operation. They do not trigger alternate models. Optional evidence missingness may yield a partial result only when the consumer's declared policy permits it; required missingness blocks that task. Missing access is not rescued from another project's identical content hash.

No capability produces UNAVAILABLE/UNSUPPORTED; a failed attempt produces FAILED. Capacity or budget exhaustion is an environmental/resource condition, not automatically an implementation defect. Provider truncation/refusal/invalid output maps to owned partial/abstained/failed semantics with sanitized evidence; invalid or incomplete creative output cannot become a success through default values.

Retries, recomputation, fallback and Director revision are explicit policy actions with attempt/deadline limits, budget reservations and new receipts. Failure never replaces source facts, a previous successful artifact or the prior valid graph. Partial graph publication must enumerate unresolved nodes and cannot claim export readiness. Unknown versions and fields fail closed at strict readers until deliberate support exists.

## 25. Provenance

Required factual lineage remains:

```text
authorization + source asset/hash + MediaTruth snapshot
 -> source shot/range -> sampled frame/sample ID + actual PTS
 -> extracted content hash -> measurement + producer/config/run
 -> embedding reference + immutable space -> aggregation/support/locality
 -> candidate/proposal -> pruning/dedupe evidence -> exact analysis/run artifact
 -> token/candidate-set snapshot -> world view
```

Future creative/execution lineage continues from that view through request/selection/cost, hypothesis/direction, considered alternatives, PlanningDecision, clip use/EditGraph revision, capability resolution, execution DAG, render receipt, critic/QC, actual editor feedback and purpose-authorized learning labels. Each join binds exact type/version/digest and entity identity, not timestamp coincidence. Missing required joins prevent a complete-provenance claim.

Producer provenance distinguishes deterministic, synthetic/stub, cached real-model, fresh real-model, human annotation and unverified computation; media basis independently distinguishes real footage, synthetic and unverified. Human review requires an actual attributed review artifact; assistant mechanical review is not silently upgraded to external human creative-quality review. A reuse receipt preserves original fresh-run provenance but labels current consumption as reuse. Synthetic stubs cannot contaminate real embedding spaces or production cost/learning cohorts.

## 26. Versioning and evolution

Existing public versions, exact bytes and identity algorithms remain authoritative. New architecture representations get separately registered internal type/version/envelope and ID namespace in later gates. They must use strict readers and the existing canonical finite-JSON convention; it is not claimed to be full RFC 8785. Exact-byte hashes remain separate from semantic content IDs.

New content identity binds all declared semantic fields, envelope/version and dependency identities except its own ID. Sort declared sets before hashing; preserve ordered sequences, temporal support and operations. Do not strip timestamps generically: source receipts and `asOf` can be identity-bearing. Mutable availability observations and attempt receipts are separate snapshots, not hidden mutations of immutable results.

Additive fields/alternatives require deliberate new version readers because old strict readers reject them. Changed meaning/units or incompatible semantics require major evolution. Producer improvements change producer/policy identity and cache keys even when schema shape survives. Migrations are explicit, pure, tested transforms with origin refs; no lazy inference or silent coercion. Preserve old bytes where retention allows. Graph parents/dependency manifests must avoid self-referential content hashes and cycles.

## 27. Architecture A -> B -> C migration

| Stage | Intended capability and evidence gate | Representations retained |
| --- | --- | --- |
| A - Shippable | 5-30 minutes raw project to 30-60 second vertical edit; college/event/creator montage and simple talking-head. MediaTruth, explicitly configured TransNetV2, frozen SigLIP2/current speech/audio, cheap CV, persistent index, WorldModel-lite, Canon v0, DirectorProvider, direction v0, retrieval, bounded sequence search/exact planner, EditGraph v0, deterministic execution, critic and localized revision | All authority tags, exact artifact refs, computation identities, budgets/traces, profile/selection receipts, direction/technique/capability/planning/edit/critic boundaries start here |
| B - Professional | Separately evaluate temporal features, person/object tracks, masks/depth, reference grammar, EditingDNA, multitrack/J-L cuts, automation/keyframes, TechniqueGraph execution, professional interchange, stronger critic and telemetry | Extend registered node/primitive/capability/view versions. Keep A source/candidate/artifact identities, snapshots and decision lineage readable; unsupported old readers fail rather than lose data |
| C - Frontier | Add only with comparative evidence: proprietary ranker, boundary model, reaction/continuity intelligence, distilled Director/Critic, personalization, multi-Director search, long-form planning, advanced VFX/3D, learned quality/cost routing and larger search | New producers/policies/search candidates consume the same evidence, direction and EditGraph boundaries. Retraining/provider replacement does not redefine MediaTruth, cache compatibility or creative authority |

The A target is an aspiration with explicit gaps, not existing functionality. It does not change today's detector default, model pins, audio semantics, per-asset limits or UEP 15-30 second limit. A can first prove the shared 30-second compatible subset; shipping 31-60 seconds requires a distinct authorized export/contract gate or a separately specified rich executor. Never reduce a requested duration silently.

B/C are additive capability/version releases rather than replacement world models or timelines. An A artifact remains immutable and consumable by its original readers; a newer view can combine it with new evidence without rewriting it. An A-only executor reports unsupported B/C operations. Every stage needs domain quality, cost, latency, privacy and regression evidence before expansion. No stage is accepted merely because schemas exist.

## 28. Security, privacy and media authority

Only explicitly authorized sources are discoverable/consumable. Validate project/creator, purpose, hash/size and current lifecycle before metadata/content access, expensive work, cloud transmission, rendering and export. Local analysis/evaluation permission does not imply cloud processing, redistribution, training or publication. Director text, captions, transcripts, reference instructions and retrieved knowledge are untrusted content and cannot grant permissions, request arbitrary tools or override budgets/authority rules.

Source bytes remain immutable. Source/object IDs are opaque identity, not paths or fetchable URLs. Inject execution-only resolvers and allowlisted arguments at composition boundaries; no model-generated commands, arbitrary URI fetch or source-directory search. Prompt injection cannot escape the owned result schema or cause factual writes.

Protect transcripts, embeddings, tracks, masks, preferences and descriptive text as derived user content; hashes and pseudonyms are not anonymization. The index can deduplicate computation bytes only with independently valid scope/purpose grants; cross-creator cache existence must not leak content or identity. Global shared lookup is not implied.

Deletion/retention applies transitively to dependent content, indexes, caches, future backups and learning snapshots under explicit policy. Tombstones preserve only legally/policy-permitted minimal joins; deletion of payloads makes dependent queries unavailable without rewriting historical facts. Cancel queued work and recheck at execution to handle revocation after planning. Learning consent is never inferred from acceptance/download. Credentials and raw provider responses are excluded from core/telemetry; sanitized diagnostics remain access-controlled.

## 29. Explicit non-goals

No production TypeScript/schema declarations; no runtime, database, storage service, model selector implementation, Director connection, LLM call, perception/video/audio model execution, media decode, dependency installation, provider SDK, network verification, generated schema/fixture update, public contract edit, new benchmark/labels/training, renderer, critic or UI. No Perception Evidence Store or ProjectWorldModel runtime is begun. No original source-media, local environment or historical evidence is modified. No commit, push or PR.

All new named representations are normative designs and remain unimplemented. Existing engineering tests and historical artifacts establish their own accepted scopes only. This document does not prove a 30-60 second editor, professional editing quality, generalization, profitability or a complete pipeline.

## 30. Later implementation gates

Every gate below requires separate explicit authorization, a bounded execution specification and evidence before closure. This order establishes dependencies without authorizing the later phases in the public roadmap.

| Proposed gate | Required scope/evidence before acceptance |
| --- | --- |
| Perception Evidence Store | Implement the bounded artifact index/storage boundary over supplied evidence: exact identity, integrity, scope, missingness, lifecycle, idempotency and explicit no-recompute tests; preserve Phase 4 bytes/semantics |
| ProjectWorldModel-lite | Immutable factual/derived snapshots and bounded views; exact joins, temporal/authority validation, incremental invalidation and legacy-token adapter checks |
| Budgeted perception / model routing | Explicit budgets, profile selection and trace accounting; separately authorized model/capability evaluations, cache reuse and guard evidence |
| Canon v0 / Director boundary | Small licensed/owned knowledge set, provider-neutral request/result validation, adversarial unknown-ID/timestamp/payload checks; real model execution requires explicit authorization |
| Retrieval / sequence / exact boundary planning | Actual search context, bounded choices, PlanningDecision lineage, source-grounded ranges, no fabricated public events |
| EditGraph / capability / compatibility projection | Typed operations, capability proofs, explicit lossless UEP subset and refusal cases, truthful telemetry mapping; separately authorize duration/reference-contract evolution if required |
| Execution / preview / critic / repair / QC | Future Phase 6+ scope: deterministic conformance, dependency-based incremental rendering, multidimensional evaluation and bounded revision, independent actual-media QC |
| Professional / frontier / learning | Subsequent roadmap phases and their own quality/cost/consent/evaluation gates; no automatic expansion from A |

Deferred execution choices include numeric budgets and tier thresholds, storage transaction implementation, producer registrations/cloud revision evidence, exact pixel/audio executor semantics, critic rubrics/calibration, domain evaluation cohorts, retention periods and professional interchange formats. Their obligations and boundaries are frozen here; choosing or implementing them is not necessary to pass this documentation gate.

## 31. Gate-0 acceptance checklist and verification record

Initial execution status: documentation authorized; acceptance pending verification. Acceptance means the documentation conditions pass, not that any proposed runtime exists. Owner review precedes any commit/publication and later authorization.

| Acceptance condition | Normative evidence / verification |
| --- | --- |
| Every core representation is provider neutral | Sections 6-18 and 21: owned identifiers/references/typed fields; no SDK response type |
| MediaTruth distinct from observations and interpretation | Sections 3, 4, 8: legal writers, tagged layers and dependency constraints |
| Director cannot fabricate source/candidate/timestamp truth | Sections 4, 11, 12, 16, 24 |
| Every expensive operation has cache identity | Sections 7 and 22: source/dependency/producer/model/revision/config/schema/semantic-settings matrix |
| Compute, cost and latency are first-class | Sections 9, 10, 23: finite budgets, actual attempt evidence and accounting reuse |
| Routing/model selection is auditable; no hidden fallback | Sections 9, 15, 23, 24 |
| UEP unchanged and explicitly bounded projection | Sections 2, 17, 19; hash preservation below |
| No fake DecisionEvent before planning | Sections 2, 16, 19; truthful export eligibility includes confidence/count bounds |
| Missing executor support is explicit | Section 15: all five required states |
| A survives B/C | Sections 20, 26, 27: immutable artifacts and deliberate versioned capability extensions |
| Phase 4/public source, dependencies, schemas and fixtures unchanged | Before/after SHA-256 and Git changed-path checks below |
| No model/media/network/runtime operation introduced | Docs-only changes; inspected static audit only, no application/test/media/model entry point invoked |
| Previous evidence preserved | Only current status/pointers and this new spec are edited; no prior closure narrative rewritten |
| Unimplemented scope and authorization explicit | Sections 1, 29, 30; review stop, no next-gate execution |

### Read inventory

Read/inspected before writing: `AGENTS.md`; `docs/CURRENT_PHASE.md`, `architecture.md`, `phases.md`, `contracts.md`, `data-learning.md`, `footage-analyzer.md`, `footage-evaluation.md`, `footage-verification.md`; the eight historical phase documents linked in section 2; all ten `packages/editorial/*.ts` surfaces (resolver/taxonomy inspected for relevant joins); `packages/providers/index.ts`; `packages/contracts/{common,creative,audio,edit-plan,events,reference-v11}.ts`; `packages/validation/index.ts`; `packages/telemetry/index.ts`; relevant Phase 4 tests (`tests/editorial-{common,token,decisions,ranking,semantic,reference-ranking,matcher}.test.ts`, with detailed Matcher assertions and cross-suite case inventory); `tests/fixtures/phase0-frozen-digests.json`; `package.json`; `scripts/audit-workspace.mjs`; `scripts/no-network.mjs`; local Git metadata/refs. Package manifests/locks and all tracked files were hashed without executing them.

Historical local reports/receipt metadata were inspected as historical evidence: `.local-runs/phase2_6a_session1_20260915/baseline.json`, `.local-runs/phase2_6b_20260920/final-receipt.json`, and `.local-runs/phase2_5_resume_20260915/{verification-report.md,real-verification.json,final-source-audit.json,review/review-index.json,successful-smoke-receipt.json}`. No receipt inspection constitutes rerunning its verification; no frame/media or vector payload was consumed for inference. The historically missing Session 1 verification receipt is not reconstructed.

### Preservation evidence and safe commands

Git executable for this session:
`C:/Program Files/Microsoft Visual Studio/18/Community/Common7/IDE/CommonExtensions/Microsoft/TeamFoundation/Team Explorer/Git/cmd/git.exe`.

Commands use that executable as `$gateGit`, without altering system PATH:

```powershell
& $gateGit branch --show-current
& $gateGit rev-parse HEAD
& $gateGit status --short
& $gateGit log -3 --format='%H %s'
& $gateGit for-each-ref --format='%(refname) %(objectname)' refs/remotes
& $gateGit ls-files | ForEach-Object { Get-FileHash -Algorithm SHA256 -LiteralPath $_ }
& $gateGit diff --check
& $gateGit diff --name-only
& $gateGit diff --cached --name-only
node --import ./scripts/no-network.mjs scripts/audit-workspace.mjs
```

The full tracked-file SHA-256 inventory is compared in memory before/after. The frozen fixture manifest is separately checked against actual file bytes. Only the three existing documentation files named below may differ; the sole new file is this specification. The new file is checked separately for whitespace because ordinary `git diff` excludes untracked files. No `npm run verify`, build, media test, Python test, model smoke or schema generator is run: the canonical verification script includes media/Python execution and is inappropriate for this gate.

Selected pre-edit byte identities (post-edit equality required):

| File | SHA-256 |
| --- | --- |
| `packages/contracts/edit-plan.ts` | `7411177393d826bfe8af27084c68ee721206fc40c5c494422fac8e86f2d1babb` |
| `packages/contracts/events.ts` | `9d8c09ea88de03aec5a7dcdc337fd3153d46434c3c23f86816e2ab120a2abb3b` |
| `packages/contracts/common.ts` | `d97f0b05ac818cc7d721c96446c7b830a6a294145b486287edc2fd8e9e09a172` |
| `packages/contracts/creative.ts` | `c7e4fc7228d8af1286f7dbdf70f7cb110910c64d0b03ba508b5e4228791e22f6` |
| `packages/contracts/audio.ts` | `aafb21fbe5f78e42c237b1e8d0ad15df59c9dd76ed31994efb2902655911694a` |
| `packages/contracts/reference-v11.ts` | `a38723c81191e027409804d3405d49874b4f43c38dcd374f2bf5f0dca452625f` |
| `packages/providers/index.ts` | `ab997b4d4820c0c573e4d35b5f0d2db25c10e374df1bf7350148339de5845d33` |
| `packages/editorial/token.ts` | `78e387c45a80ce96c8651e8bed5f8f16ab1eeb22d18c878b9647ead13e27b2ee` |
| `packages/editorial/matcher.ts` | `97f5cce2d8fe8f4a2ae97370fd98381af89216b1ee85eba45ecf7b49f6a6f83d` |
| `package.json` | `4789fe849b56e800b402bbbe2a6a67871e7ee398fecd4132f11248cad1269084` |
| `package-lock.json` | `96a41979781463cb304934b47bb0de6685af01c953eef0618467a0e590059691` |
| `pyproject.toml` | `05afc78374425d6c49f0fa2cc47789aad38981940cc627b5663350cce9931c02` |
| `uv.lock` | `4eafb2252205a328124401e319c87e8c4d55defa110f57967a427fe3d84a13b2` |
| `tests/fixtures/phase0-frozen-digests.json` | `ca181c940e72c62d709e54d82f761da514d93a5f926c80ce3750d0442e2729ea` |

Intended changed files: this specification, `docs/CURRENT_PHASE.md`, `docs/phases.md`, `docs/architecture.md`. Final verification result will be appended after the checks pass. No commit or push is authorized.

### Dated verification result - 2026-09-22

**GATE 0 STATUS: PASS - documentation verification. Owner review pending.**

All acceptance rows above were reviewed against the final normative definitions and inspected source. This is a self-review and mechanical preservation result, not an independent reviewer acceptance or runtime conformance result.

| Check actually performed | Result |
| --- | --- |
| Pre-edit local HEAD / branch / status | Exact requested baseline; `phase/5-edit-planner-v0`; clean |
| Before/after tracked SHA-256 comparison | 213 files accounted for; exactly the three intended existing docs differ; **210/210 protected files byte-identical**, none missing |
| Frozen Phase 0 digest fixture vs actual bytes | **28/28 PASS**, including public contracts, generated V1 schemas and fixtures |
| Source/provider/editorial/validation/telemetry preservation | PASS within the full protected inventory |
| Package manifests/lockfiles | `package.json`, `package-lock.json`, `pyproject.toml`, `uv.lock` byte-identical; no dependency added |
| Generated schemas / tests / fixtures / historical closure docs | Byte-identical within the protected inventory; none regenerated |
| Changed-path audit | Only this new spec and the three intended documentation updates; staged diff empty |
| `git diff --check` | PASS, exit 0 |
| New untracked spec checks | Required sections 1-31 in exact sequence; nine local links resolve; code fences balanced; no trailing whitespace |
| Static workspace audit under no-network guard | PASS, exit 0: **56 application TypeScript files / nine explicit runtime adapters**, plus existing offline-loading/dependency checks; adapters parsed, not executed |
| Model/media/application execution | None; no LLM, pretrained model, decoder, media analysis, build, test suite or schema generator invoked |
| Remote/publication actions | None; no fresh remote claim, commit, push or PR |

Aggregate byte evidence: the 210 protected-file manifest has SHA-256
`47c09987b214316e4b57fc88437b98474dacf174364730f516d73a2327f53c23`.
Its encoding is UTF-8 without BOM, in `git ls-files` order, one `path + TAB + lowercase SHA256 + LF` row per tracked file excluding only `docs/CURRENT_PHASE.md`, `docs/architecture.md`, `docs/phases.md`. It binds source, schemas, tests, historical docs and dependency manifests; individual selected hashes above also match. The new untracked specification is outside that pre-existing-file manifest by definition.

The initial unqualified Git commands failed because Git was not on PATH; using the installed executable completed the checks without changing the environment. No repository defect was inferred. No architecture/runtime test result or old failure was rewritten. The earlier pending execution text above is retained as chronology; this dated result supplies the final verification ruling.

Unresolved Gate 0 blockers: **none**. Later implementation choices and known compatibility gaps are explicitly assigned in sections 19, 27 and 30, not waived by this PASS. Phase 2/2.6A/2.6B/3/4 closure stands. Phase 5 runtime remains unimplemented. The worktree is left uncommitted for owner review; the next gate is **Perception Evidence Store**, requiring separate authorization and not started here.
