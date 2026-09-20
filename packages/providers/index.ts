import type { AudioFingerprint, ClipSegment, Contracts, EmbeddingReference, EventScope, JobState, MediaAsset, ModelRun, ProcessingStage, ReferenceFingerprint, RenderResult, UniversalEditPlan } from "../domain/index.js";

export interface ProviderIdentity { readonly id: string; readonly version: string }
export interface AnalysisContext { readonly scope: EventScope; readonly operationId: string; readonly attempt: number }
export interface AnalysisResult<T> { readonly value: T; readonly modelRun: ModelRun }
export interface VisionProvider extends ProviderIdentity {
  analyzeReference(asset: MediaAsset, context: AnalysisContext): Promise<AnalysisResult<ReferenceFingerprint>>;
  analyzeFootage(asset: MediaAsset, context: AnalysisContext): Promise<AnalysisResult<readonly ClipSegment[]>>;
}
export interface VideoEmbeddingProvider<Input = ClipSegment, Output = EmbeddingReference> extends ProviderIdentity {
  embed(segment: Input, context: AnalysisContext): Promise<AnalysisResult<Output>>;
}
export interface MotionProvider extends ProviderIdentity {
  analyze(segment: ClipSegment, context: AnalysisContext): Promise<AnalysisResult<Pick<ClipSegment, "motion" | "poseTags" | "motionEmbedding">>>;
}
export interface SpeechRegion { readonly startSeconds: number; readonly endSeconds: number; readonly text: string; readonly confidence: number | null }
export interface Transcript { readonly assetId: string; readonly language: string | null; readonly regions: readonly SpeechRegion[] }
export interface SpeechProvider extends ProviderIdentity {
  transcribe(asset: MediaAsset, context: AnalysisContext): Promise<AnalysisResult<Transcript>>;
}
export interface AudioAnalysisProvider extends ProviderIdentity {
  analyze(asset: MediaAsset, context: AnalysisContext): Promise<AnalysisResult<AudioFingerprint>>;
}
export interface LLMProvider extends ProviderIdentity {
  generate<K extends "ReferenceFingerprint" | "ClipSegment" | "AudioFingerprint" | "UniversalEditPlan">(request: { readonly instruction: string; readonly inputIds: readonly string[]; readonly outputContract: K; readonly schemaVersion: "1.0.0" }, context: AnalysisContext): Promise<AnalysisResult<Contracts[K]>>;
}
export interface Renderer extends ProviderIdentity {
  readonly mode: "dry_run" | "media";
  // Execution context/asset resolution is injected into the adapter, never encoded as commands in the plan.
  render(plan: UniversalEditPlan): Promise<RenderResult>;
}
export interface ObjectStorage {
  read(objectId: string): AsyncIterable<Uint8Array>;
  write(objectId: string, bytes: AsyncIterable<Uint8Array>, metadata: { readonly mimeType: string; readonly expiresAt: string | null }): Promise<void>;
  delete(objectId: string): Promise<void>;
}
export interface JobTask {
  readonly jobId: string;
  readonly projectId: string;
  readonly stage: ProcessingStage;
  readonly attempt: number;
  readonly deduplicationKey: string;
  readonly availableAt: string;
}
export interface JobLease { readonly leaseId: string; readonly task: JobTask; readonly expiresAt: string }
export interface JobQueue {
  enqueue(task: JobTask): Promise<void>;
  claim(workerId: string): Promise<JobLease | null>;
  acknowledge(leaseId: string): Promise<void>;
  renew(leaseId: string, expiresAt: string): Promise<void>;
  retry(leaseId: string, availableAt: string): Promise<void>;
}
export interface JobRepository {
  get(jobId: string): Promise<JobState | null>;
  compareAndSet(job: JobState, expectedStateVersion: number): Promise<boolean>;
}

// Owned seams for later phases; no matching, planning, or memory algorithm is implemented here.
export interface MatchingRequest { readonly reference: ReferenceFingerprint | null; readonly segments: readonly ClipSegment[]; readonly audio: AudioFingerprint | null }
export interface Matcher { rank(request: MatchingRequest, context: AnalysisContext): Promise<readonly Contracts["DecisionEvent"][]> }
export interface EditPlanner { plan(request: MatchingRequest, decisions: readonly Contracts["DecisionEvent"][], instruction: string | null): Promise<UniversalEditPlan> }
export interface CreatorMemory { preferences(creatorId: string, revisionId: string | null): Promise<readonly Contracts["CreatorPreferenceEvent"][]> }
