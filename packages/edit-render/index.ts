/**
 * Phase 5 Gate 7 Batch 2B: the pure core of the first real media execution through the EditGraph execution architecture. Typed
 * RenderProgram compilation from a replay-validated ExecutionDag, the trusted FFmpeg argument compiler, the finite Gate-6 capability
 * map, strict real-evidence records, permit-binding evaluation over the accepted Batch-2A authority, execution receipts, truthful
 * accounting and independent technical-QC logic. Nothing here starts a process, reads a file, clock or environment, or reaches a
 * network: probing, spawning and publishing live in the audited adapters scripts/edit-render-local.ts, scripts/edit-media-qc-local.ts
 * and scripts/edit-render-fixture-authority-local.ts. A record or binding from this module is data and never executes anything.
 */
export { EDIT_RENDER_ERROR_CODES, EDIT_RENDER_VERSION, EditRenderError, MAX_CAPTURED_DIAGNOSTIC_BYTES, MAX_FFMPEG_ARGUMENTS, MAX_FILTERGRAPH_BYTES, MAX_PROBE_OUTPUT_BYTES,
  RENDER_IMPLEMENTATION, sessionProofOf, type CheckTiming, type EditRenderErrorCode, type SessionProof } from "./common.js";
export { CAPABILITY_REASON_CODES, PINNED_MEDIA_RUNTIME, PROBE_IMPLEMENTATION, PROBE_IMPLEMENTATION_DIGEST, RENDER_ENVIRONMENT, RENDER_EXECUTOR, RENDER_SEMANTICS,
  RENDER_SEMANTICS_DIGEST, assessCapabilityRequirement, colorLookStep, type CapabilityFinding, type ComponentInventory, type Look } from "./semantics.js";
export { componentInventoryOf, evaluateInputConformance, frameTableIdOf, parseBenchmark, parseBuildConfiguration, parseComponentListing, parseProbeJson, parseVersionBanner,
  type Benchmark, type ConformanceInput, type ProbeReport, type RuntimeListings } from "./probe.js";
export { RenderProgramSchema, compileRenderProgram, compileRenderProgramFromDag, requireProgram, type RenderProgram, type SourceFacts } from "./program.js";
export { argvDigestOf, compileFfmpegArguments, type DescriptorLayout } from "./ffmpeg.js";
export { FIXTURE_AUTHORITY, FIXTURE_AUTHORITY_DIGEST, FixtureLifecycleObservationSchema, RealCapabilityProbeSchema, RealExecutionPolicySchema, RealRuntimeProbeSchema,
  StagedInputConformanceSchema, buildFixtureLifecycleObservation, buildRealCapabilityProbe, buildRealRuntimeProbe, buildStagedInputConformance, claimBinding,
  createRealExecutionPolicy, observedEnvironment, stagedFor, type FixtureLifecycleObservation, type RealCapabilityProbe, type RealExecutionPolicy, type RealRuntimeProbe,
  type RuntimeObservation, type StagedInputConformance } from "./records.js";
export { ExecutablePermitBindingSchema, confirmPermitBindingCurrent, evaluateRealExecutionEvidence, type ExecutablePermitBinding, type RealEvidenceBundle } from "./authorize.js";
export { AccountingExecutionSchema, AccountingSchema, COVERAGES, DIMENSIONS, FAILURE_STAGES, RenderExecutionFailureSchema, RenderExecutionReceiptSchema, RenderExecutionStartSchema,
  accountingFrom, accountingOfReceipt, buildExecutionStart, buildFailureReceipt, buildSuccessReceipt, ceilingsOf, deriveAccounting, deriveOutputByteBound,
  deriveRenderTimeoutMilliseconds, diagnosticsOf, outputArtifactIdOf, sanitizeDiagnostics, workOf, type Accounting, type AccountingExecution, type Diagnostics,
  type FailureOutput, type Measurements, type ProcessEvidence, type RenderExecutionFailure, type RenderExecutionReceipt, type RenderExecutionStart } from "./receipts.js";
export { QC_CHECKS, QC_IMPLEMENTATION, TechnicalMediaQcReceiptSchema, buildQcReceipt, deriveQcExpectation, evaluateTechnicalQc, type QcExpectation, type QcObservation,
  type TechnicalMediaQcReceipt } from "./qc.js";
