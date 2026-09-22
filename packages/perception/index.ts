// Internal Phase 5 Gate 1 substrate. Lookup is pure with respect to production computation.
export {
  PERCEPTION_VERSION,
  COMPUTATION_IDENTITY_VERSION,
  ComputationKeySchema,
  OrderedInputIdentitySchema,
  ComputationIdentitySchema,
  PerceptionAttemptSchema,
  PerceptionOutputSelectionSchema,
  PerceptionArtifactEntrySchema,
  PerceptionAccessRequestSchema,
  PerceptionReuseReceiptSchema,
  computationKey,
  computationDependencies,
  type ComputationIdentity,
  type PerceptionAttempt,
  type PerceptionOutputSelection,
  type PerceptionArtifactEntry,
  type PerceptionAccessRequest,
  type PerceptionReuseReceipt,
} from "./identity.js";
export {
  PerceptionEvidenceStore,
  PerceptionIntegrityError,
  type PerceptionLookupResult,
} from "./store.js";
