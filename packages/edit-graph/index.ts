/** Phase 5 Gate 6: internal EditGraph V0, supplied-capability assessment and a refusal-first UEP compatibility boundary. */
export { EDIT_GRAPH_VERSION, EDIT_GRAPH_ERROR_CODES, EditGraphError, supplied, type EditGraphErrorCode } from "./common.js";
export { EditOutputProfileSchema, EditGraphPolicySchema, createEditOutputProfile, createEditGraphPolicy, type EditOutputProfile, type EditGraphPolicy } from "./profile.js";
export { CAPABILITY_IDS, CAPABILITY_STATES, CapabilityAttestationSchema, CapabilitySnapshotSchema, CapabilityRequirementSchema, CapabilityAssessmentSchema,
  createCapabilityAttestation, createCapabilitySnapshot, type CapabilityAttestation, type CapabilitySnapshot, type CapabilityRequirement, type CapabilityAssessment,
  type CapabilityState } from "./capability.js";
export { TechniqueResolutionSchema, createTechniqueResolution, type TechniqueResolution } from "./resolution.js";
export { AUDIO_TRACK, VIDEO_TRACK, EXECUTION_BUDGET_SUBJECT, EditGraphSchema, ClipUseSchema, OperationSchema, buildEditGraph, validateEditGraph,
  type EditGraph, type EditGraphRequest, type ClipUse, type VideoClipUse, type AudioClipUse, type Operation, type Obligation } from "./graph.js";
export { UEP_V1, UEP_DIMENSIONS, UEP_FINDING_CODES, UepProjectionPolicySchema, UepCompatibilityReportSchema, createUepProjectionPolicy, assessUepCompatibility,
  validateUepCompatibilityReport, type UepProjectionPolicy, type UepCompatibilityReport, type UepProjectionRequest } from "./compatibility.js";
export { GRAPH_DIFF_OPERATIONS, GRAPH_DIFF_VERSION, MAX_GRAPH_DIFF_OPERATIONS, MAX_GRAPH_REVISION, EditGraphRevisionSchema, GraphDiffSchema, applyGraphDiff, createGraphDiff,
  parseAnyEditGraph, trimSelectionOf, validateAnyEditGraph, validateEditGraphRevision, type AnyEditGraph, type EditGraphRevision, type GraphDiff,
  type GraphDiffOperation } from "./revision.js";
