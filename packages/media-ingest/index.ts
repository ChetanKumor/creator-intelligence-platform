/**
 * Gate 7 Batch 3E-B1A: canonical media ingest, pure contract only. Classification of an already-parsed probe as DIRECT, NORMALIZE_N1
 * or REFUSE, the bounded recipe list, the pinned toolchain, and the CanonicalMediaDerivation record with its computation and
 * derivation identities. Nothing here starts a process, reads a file, clock or environment, or reaches a network.
 */
export { CANONICALIZER, CANONICALIZER_DESCRIPTOR, CANONICAL_COMPUTATION_IDENTITY, CANONICAL_DERIVATION_IDENTITY, CANONICAL_RECIPES, CANONICAL_REFUSALS, CANONICAL_TOOLCHAIN,
  CanonicalClassificationSchema, CanonicalMediaDerivationSchema, DIRECT_REASON, IngestVideoFactsSchema, MEDIA_INGEST_ERROR_CODES, MEDIA_INGEST_VERSION, MediaIngestError,
  N1_ARGV_TEMPLATE, N1_ASSUMPTION, N1_BOUNDS, N1_REASON, N1_RECIPE, N1_SEMANTICS, REFUSAL_BASES, buildCanonicalDerivedAuthorization, buildCanonicalMediaDerivation,
  canonicalComputationIdOf, classifyCanonicalIngest, type CanonicalClassification, type CanonicalMediaDerivation, type CanonicalRecipe, type CanonicalRefusal,
  type CanonicalToolchain, type IngestVideoFacts, type MediaIngestErrorCode } from "./canonical.js";
