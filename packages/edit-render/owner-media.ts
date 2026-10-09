/**
 * Gate 7 Batch 3D: the pure contract of the owner-local real-media lifecycle authority, the second lifecycle authority the Batch-2B
 * trusted execution boundary accepts. The synthetic-fixture authority and its FixtureLifecycleObservation are unchanged.
 *
 * - Registration reuses the accepted Phase-2 vocabulary: an AuthorizedFootageSet names each source's exact path, and its
 *   AuthorizedFootage names the exact SHA-256, size and owner provenance. Analysis or evaluation authorization never renders
 *   (Batch 1), so rendering needs the owner's separate, explicit render authorization.
 * - Eligibility: only an admitted source whose MediaAsset origin is `creator_upload`, whose analysis authorization is
 *   `owner_supplied` (`owner_created` or `permission_granted`) and binds exactly the admitted bytes, and which the owner declared
 *   with exactly that authorization. Synthetic media never qualifies; the fixture authority still answers only for synthetic media.
 * - The observation is a post-claim, post-stage record of one source's current lifecycle and of a full re-verification of the
 *   declared bytes. Like every Batch-2B record it is only data: only the adapter's live handle can present it to the permit issuer.
 *
 * Nothing here reads a file, clock or environment. The adapter scripts/edit-render-owner-media-authority-local.ts registers files,
 * hashes bytes and answers queries.
 *
 * Gate 7 Batch 3E-B1A extends the pure contract only (the adapter is unchanged until B1B):
 * - the original path above stays exactly AuthorizedFootage 1.0.0, so the unchanged adapter and permit keep their exact accepted set;
 * - an OwnerMediaRegistration 0.2.0 can also declare canonical derivatives, each bound to its declared root, its derived
 *   authorization and its CanonicalMediaDerivation, under a distinct derived-capable render statement;
 * - two provenance kinds (original and derived), and the pure lifecycle rule by which a derivative never outlives its root.
 *
 * Gate 7 Batch 3E-B1B wires it: the one authority's descriptor states its declared verified canonical derivatives and their lineage
 * lifecycle; the observation's provenance is either the accepted original record, unchanged, or the derived record (an additive
 * variant); and the private canonical store is named here, as names only.
 */
import { z } from "zod";
import { IdSchema, MediaAssetSchema, TimestampSchema } from "../contracts/common.js";
import { canonicalSerialize } from "../domain/serialization.js";
import { ArtifactRefSchema, checkIdentity, compareText, equal, identify, type SuppliedArtifact } from "../editorial/common.js";
import { HashSchema, OwnerSchema, ScopeSchema } from "../edit-graph/common.js";
import { PositiveSafeInt, RenderIntentSchema } from "../edit-execution/common.js";
import { RuntimeArtifacts } from "../edit-runtime/common.js";
import type { ExecutionClaim } from "../edit-runtime/records.js";
import { requireValidated, type ValidatedExecutionDag } from "../edit-runtime/validated.js";
import { FootageAnalysisSchema, FootageAuthorizationDerivedSchema, FootageAuthorizationSchema, FootageAuthorizationV1Schema, FootageManifestSchema,
  type FootageAuthorization, type FootageAuthorizationDerived, type FootageAuthorizationRoot, type FootageAuthorizationV1 } from "../footage-analyzer/protocol.js";
import { CanonicalMediaDerivationSchema, type CanonicalMediaDerivation } from "../media-ingest/canonical.js";
import { AnyCanonicalMediaDerivationSchema, CanonicalMediaPlanDerivationSchema, type CanonicalMediaPlanDerivation } from "../media-ingest/plan.js";
import { CheckTimingSchema, EDIT_RENDER_VERSION, MAX_RENDER_SOURCES, ORDERED_CHECK, RenderImplementationSchema, RENDER_IMPLEMENTATION, SessionProofSchema, check, envelope,
  header, orderedCheck, parse, refuse, sha256, type CheckTiming, type SessionProof } from "./common.js";
import { ClaimBindingSchema, claimBinding, stagedFor } from "./records.js";

/**
 * The owner-local authority's identity. Its records say `owner_declared_real_media_assets_only_v0`, and its bindings name the literal below.
 * 3E-B1B: the one authority also answers for declared, verified canonical derivatives (read only from their content address in the canonical
 * store, registered only after their root, re-hashed in full at every query), whose lifecycle is computed from their root's at query time.
 */
export const OWNER_MEDIA_AUTHORITY = { observerId: "owner_local_media_manifest_registry", version: "0.1.0",
  descriptor: { authority: "owner_local_media_manifest_registry_v0", registration: "explicit_owner_declared_path_exact_sha256_and_size_one_held_handle_v0",
    derivatives: "declared_verified_canonical_derivatives_by_content_identity_in_the_canonical_store_registered_only_after_their_root_v0",
    scope: "owner_declared_real_media_assets_only_v0", state: "in_memory_current_deletion_and_owner_declared_expiry",
    lineage: "derived_lifecycle_effective_from_root_and_derivative_at_query_time_never_outlives_root_v0",
    query: "trusted_runtime_clock_check_window_full_byte_reverification_at_observation",
    eligibility: "creator_upload_origin_and_owner_supplied_or_declared_system_canonicalized_authorization_only",
    discovery: "none_no_directory_listing_no_globbing_no_network" } } as const;
export const OWNER_MEDIA_AUTHORITY_DIGEST = sha256(canonicalSerialize(OWNER_MEDIA_AUTHORITY.descriptor));
/** What an executable permit binding names when every source's lifecycle evidence comes from the owner-local authority. */
export const OWNER_MEDIA_LIFECYCLE_AUTHORITY = "owner_local_media_manifest_registry_not_production_v0" as const;

// ---------------------------------------------------------------- the owner's explicit registration (execution-only local input)
export const OWNER_RENDER_AUTHORIZATION_STATEMENT = "owner_authorizes_local_render_of_exactly_the_declared_sources_v0" as const;
/** The explicit owner authorization marker: the owner, the render intents and the window in which the declared sources may be rendered. */
export const OwnerRenderAuthorizationSchema = z.strictObject({
  statement: z.literal(OWNER_RENDER_AUTHORIZATION_STATEMENT), owner: OwnerSchema,
  renderIntents: z.array(RenderIntentSchema).min(1).max(2).refine(v => new Set(v).size === v.length, "Duplicate render intent."),
  authorizedAt: TimestampSchema, expiresAt: TimestampSchema.nullable(),
}).refine(v => v.expiresAt === null || v.expiresAt > v.authorizedAt, "A render authorization must end after it begins.");
export type OwnerRenderAuthorization = z.infer<typeof OwnerRenderAuthorizationSchema>;
/**
 * The accepted Phase-2 footage path rule (scripts/footage-local.ts, resolveFootagePath), reused verbatim in meaning: a declared source
 * path is relative to the AuthorizedFootageSet's own directory and made of plain segments. An absolute, drive, URL, share or device
 * path, an empty, `.` or `..` segment, a control character, a pattern character or a trailing dot or space refuses. The adapter then
 * also refuses links anywhere in the resolved path.
 */
export function ownerMediaRelativeSegments(path: string): string[] | null {
  const parts = path.split(/[\\/]/);
  if (path.length === 0 || path.length > 1024 || parts.some(part => !part || part === "." || part === ".." || /[:\x00-\x1f*?]/.test(part) || /[. ]$/.test(part)
    || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part))) return null;
  return parts;
}
const OWNER_BASES = ["owner_created", "permission_granted"] as const;
/**
 * The accepted original-declaration rules (paths, owner-supplied authorization, scope, uniqueness), shared by both registration
 * versions. `read` decides which AuthorizedFootage forms a version accepts. Returns the parsed owner-supplied declarations and every
 * declared content hash.
 */
function checkDeclaredOriginals(footage: z.infer<typeof FootageManifestSchema>, read: (value: unknown) => FootageAuthorization | null, issue: (message: string) => void):
  { originals: { entryId: string; authorization: FootageAuthorizationV1 | FootageAuthorizationRoot }[]; hashes: Set<string> } {
  const hashes = new Set<string>(), paths = new Set<string>(), originals: { entryId: string; authorization: FootageAuthorizationV1 | FootageAuthorizationRoot }[] = [];
  for (const asset of footage.assets) {
    const segments = ownerMediaRelativeSegments(asset.path);
    if (segments === null) issue("A declared source is a plain relative path under the footage manifest's directory, never absolute, a URL, share, pattern or traversal.");
    const a = read(asset.authorization);
    if (a === null) { issue("Every declared source carries a valid AuthorizedFootage record."); continue; }
    if (a.sourceType !== "owner_supplied" || !(OWNER_BASES as readonly string[]).includes(a.authorizationBasis)) issue("Only owner-supplied, owner-authorized real media is declared here.");
    if (a.creatorId !== footage.creatorId || a.projectId !== footage.projectId) issue("Every authorization belongs to the set's creator and project.");
    const key = (segments ?? [asset.path]).join("/").toLowerCase();
    if (hashes.has(a.contentHash) || paths.has(key)) issue("Duplicate or conflicting source declarations are refused.");
    hashes.add(a.contentHash); paths.add(key);
    if (a.sourceType === "owner_supplied") originals.push({ entryId: asset.entryId, authorization: a });
  }
  return { originals, hashes };
}
/** 3E-B1A: the original path reads exactly AuthorizedFootage 1.0.0, as it did before the 1.1.0 forms existed. */
const readV1 = (value: unknown): FootageAuthorizationV1 | null => { const result = FootageAuthorizationV1Schema.safeParse(value); return result.success ? result.data : null; };
export const OwnerMediaRegistrationSchema = z.strictObject({
  ...envelope("OwnerMediaRegistration"),
  /** The accepted Phase-2 AuthorizedFootageSet, reused verbatim: the same object the accepted footage analyzer consumes. */
  footage: FootageManifestSchema,
  renderAuthorization: OwnerRenderAuthorizationSchema,
}).superRefine((value, ctx) => {
  checkDeclaredOriginals(value.footage, readV1, message => ctx.addIssue({ code: "custom", message }));
});
export type OwnerMediaRegistration = z.infer<typeof OwnerMediaRegistrationSchema>;
export interface OwnerMediaDeclaration { entryId: string; assetId: string; contentHash: string; sizeBytes: number; path: string; authorization: FootageAuthorizationV1 }
/** The validated declarations, in canonical asset order. The path is execution-only data for the adapter; it enters no identity. */
export function ownerMediaDeclarations(input: unknown): { registration: OwnerMediaRegistration; registrationDigest: string; declarations: OwnerMediaDeclaration[] } {
  const registration = parse(OwnerMediaRegistrationSchema, input, "lifecycle_authority_scope_invalid");
  const declarations = registration.footage.assets.map(asset => {
    const authorization = FootageAuthorizationV1Schema.parse(asset.authorization);
    return { entryId: asset.entryId, assetId: `asset_${authorization.contentHash}`, contentHash: authorization.contentHash, sizeBytes: authorization.sizeBytes,
      path: asset.path, authorization };
  }).sort((a, b) => compareText(a.assetId, b.assetId));
  // The digest binds what was declared, excluding locations: moving a file changes no identity, and a path never becomes one.
  const registrationDigest = sha256(canonicalSerialize({ renderAuthorization: registration.renderAuthorization, creatorId: registration.footage.creatorId,
    projectId: registration.footage.projectId, sources: declarations.map(d => ({ entryId: d.entryId, assetId: d.assetId, contentHash: d.contentHash,
      sizeBytes: d.sizeBytes, authorization: d.authorization })) }));
  return { registration, registrationDigest, declarations };
}

// ---------------------------------------------------------------- eligibility: truthful creator_upload / owner_supplied provenance only
export const OwnerMediaProvenanceSchema = z.strictObject({ mediaOrigin: z.literal("creator_upload"), sourceType: z.literal("owner_supplied"),
  authorizationBasis: z.enum(OWNER_BASES) });
export type OwnerMediaProvenance = z.infer<typeof OwnerMediaProvenanceSchema>;
interface AdmittedSource { assetId: string; contentHash: string; sizeBytes: number; mediaAsset: unknown; analysis: unknown }
/**
 * The admitted MediaAsset and FootageAnalysis of one source, read from the exact supplied artifacts, must state truthful real-media
 * provenance for exactly the admitted bytes. Synthetic media, or a creator_upload label whose analysis says otherwise, is refused.
 */
export function checkOwnerMediaProvenance(source: AdmittedSource, artifacts: readonly SuppliedArtifact[]): { provenance: OwnerMediaProvenance; authorization: FootageAuthorizationV1 } {
  const supplied = new RuntimeArtifacts(artifacts);
  let media, analysis, a;
  try {
    media = MediaAssetSchema.parse(supplied.exact(source.mediaAsset, "MediaAsset", "1.0.0", "input_invalid"));
    analysis = FootageAnalysisSchema.parse(supplied.exact(source.analysis, "FootageAnalysis", "1.0.0", "input_invalid"));
    // 3E-B1A: the original path answers only for AuthorizedFootage 1.0.0, exactly as before the 1.1.0 forms existed.
    a = FootageAuthorizationV1Schema.parse(analysis.authorization);
  } catch { refuse("lifecycle_authority_scope_invalid", "The owner-local authority answers only for exactly supplied MediaAsset and FootageAnalysis records."); }
  check(media.origin === "creator_upload" && media.assetId === source.assetId && analysis.assetId === source.assetId && analysis.contentHash === source.contentHash,
    "lifecycle_authority_scope_invalid", "The owner-local authority answers only for creator_upload media of exactly the admitted bytes.");
  check(a.sourceType === "owner_supplied" && (OWNER_BASES as readonly string[]).includes(a.authorizationBasis) && a.contentHash === source.contentHash
    && a.sizeBytes === source.sizeBytes, "lifecycle_authority_scope_invalid", "The owner-local authority answers only for owner-supplied, owner-authorized real media.");
  return { provenance: { mediaOrigin: "creator_upload", sourceType: "owner_supplied", authorizationBasis: a.authorizationBasis as OwnerMediaProvenance["authorizationBasis"] },
    authorization: a };
}

/** The derived provenance kind: creator-origin media whose bytes the system canonicalized from exactly one declared root. */
export const OwnerMediaDerivedProvenanceSchema = z.strictObject({ mediaOrigin: z.literal("creator_upload"), sourceType: z.literal("system_canonicalized"),
  authorizationBasis: z.enum(OWNER_BASES), root: z.strictObject({ assetId: IdSchema, contentHash: HashSchema, sizeBytes: PositiveSafeInt }), derivationId: IdSchema,
  recipeId: IdSchema });
export type OwnerMediaDerivedProvenance = z.infer<typeof OwnerMediaDerivedProvenanceSchema>;
/**
 * 3E-B1B: what an observation records. The accepted original record is one variant, unchanged, so every accepted observation keeps its
 * exact meaning; a declared canonical derivative records the derived variant, never an owner-supplied one.
 */
export const OwnerMediaObservedProvenanceSchema = z.union([OwnerMediaProvenanceSchema, OwnerMediaDerivedProvenanceSchema]);
export type OwnerMediaObservedProvenance = z.infer<typeof OwnerMediaObservedProvenanceSchema>;

// ---------------------------------------------------------------- the observation record
const LifecycleBodySchema = z.strictObject({
  ...envelope("OwnerMediaLifecycleObservation"), scope: ScopeSchema, claim: ClaimBindingSchema,
  stagedSource: z.strictObject({ stagedSourceReceiptId: IdSchema, stagedAt: TimestampSchema, stagedObjectId: IdSchema }),
  source: z.strictObject({ assetId: IdSchema, contentHash: HashSchema, sizeBytes: PositiveSafeInt, mediaAsset: ArtifactRefSchema, analysis: ArtifactRefSchema,
    sourceAccessReceipt: ArtifactRefSchema }),
  declaration: z.strictObject({ registrationDigest: HashSchema, entryId: IdSchema, contentHash: HashSchema, sizeBytes: PositiveSafeInt, verifiedAt: TimestampSchema,
    verification: z.literal("full_byte_sha256_through_one_held_handle_during_this_check_v0") }),
  provenance: OwnerMediaObservedProvenanceSchema,
  lifecycle: z.strictObject({ deletionRequestedAt: TimestampSchema.nullable(), expiresAt: TimestampSchema.nullable() }),
  ...CheckTimingSchema.shape,
  observer: z.strictObject({ kind: z.literal("real_authoritative_observation"), observerId: z.literal(OWNER_MEDIA_AUTHORITY.observerId),
    version: z.literal(OWNER_MEDIA_AUTHORITY.version), implementationDigest: HashSchema, basis: z.literal("authoritative_media_lifecycle_record_query_v0") }),
  authorityScope: z.literal("owner_declared_real_media_assets_only_v0"), recorder: RenderImplementationSchema, session: SessionProofSchema,
  basis: z.literal("post_claim_post_stage_owner_manifest_lifecycle_query_v0"),
});
export const OwnerMediaLifecycleObservationSchema = LifecycleBodySchema.extend({ observationId: IdSchema }).refine(orderedCheck, ORDERED_CHECK)
  .refine(v => v.observer.implementationDigest === OWNER_MEDIA_AUTHORITY_DIGEST, "The observer is the owner-local media registry.")
  .refine(v => v.declaration.contentHash === v.source.contentHash && v.declaration.sizeBytes === v.source.sizeBytes, "The declaration names exactly the observed bytes.")
  .refine(v => v.checkStartedAt <= v.declaration.verifiedAt && v.declaration.verifiedAt <= v.checkCompletedAt, "The bytes were re-verified during this check.")
  .refine(v => v.provenance.sourceType !== "system_canonicalized" || (v.provenance.root.contentHash !== v.source.contentHash
    && v.provenance.root.assetId === `asset_${v.provenance.root.contentHash}`), "A derivative's root is other bytes than the derivative.")
  .refine(v => checkIdentity(v, "observationId", "owner_media_lifecycle_observation_v0"), "Owner media lifecycle observation identity mismatch.");
export type OwnerMediaLifecycleObservation = z.infer<typeof OwnerMediaLifecycleObservationSchema>;

function timingFor(timing: CheckTiming, notBefore: readonly string[]): CheckTiming {
  const parsed = parse(CheckTimingSchema, timing, "evidence_chronology_invalid");
  check(orderedCheck(parsed), "evidence_chronology_invalid", ORDERED_CHECK);
  check(notBefore.every(bound => parsed.checkStartedAt >= bound), "evidence_chronology_invalid", "A post-claim source check starts only after its claim and staging.");
  return parsed;
}
/** One owner-local lifecycle observation of one staged admitted source, under exactly this claim. */
export function buildOwnerMediaLifecycleObservation(input: { dag: ValidatedExecutionDag; claim: ExecutionClaim; stagedSource: unknown;
  declaration: { registrationDigest: string; entryId: string; contentHash: string; sizeBytes: number; verifiedAt: string }; provenance: OwnerMediaObservedProvenance;
  state: { deletionRequestedAt: string | null; expiresAt: string | null }; timing: CheckTiming; session: SessionProof }): OwnerMediaLifecycleObservation {
  const v = requireValidated(input.dag), claim = claimBinding(v, input.claim), staged = stagedFor(v, input.claim, input.stagedSource);
  const timing = timingFor(input.timing, [input.claim.claimedAt, staged.stagedAt]);
  const source = v.admission.sources.find(s => s.assetId === staged.source.assetId)!;
  const body = { ...header("OwnerMediaLifecycleObservation"), scope: v.dag.scope, claim,
    stagedSource: { stagedSourceReceiptId: staged.stagedSourceReceiptId, stagedAt: staged.stagedAt, stagedObjectId: staged.stagedObject.stagedObjectId },
    source: { assetId: source.assetId, contentHash: source.contentHash, sizeBytes: source.sizeBytes, mediaAsset: source.mediaAsset, analysis: source.analysis,
      sourceAccessReceipt: source.receipt },
    declaration: { ...input.declaration, verification: "full_byte_sha256_through_one_held_handle_during_this_check_v0" }, provenance: input.provenance,
    lifecycle: input.state, ...timing,
    observer: { kind: "real_authoritative_observation", observerId: OWNER_MEDIA_AUTHORITY.observerId, version: OWNER_MEDIA_AUTHORITY.version,
      implementationDigest: OWNER_MEDIA_AUTHORITY_DIGEST, basis: "authoritative_media_lifecycle_record_query_v0" },
    authorityScope: "owner_declared_real_media_assets_only_v0", recorder: RENDER_IMPLEMENTATION, session: input.session,
    basis: "post_claim_post_stage_owner_manifest_lifecycle_query_v0" };
  return parse(OwnerMediaLifecycleObservationSchema, identify("owner_media_lifecycle_observation_v0", "observationId", parse(LifecycleBodySchema, body,
    "lifecycle_observation_invalid")), "lifecycle_observation_invalid");
}

// ---------------------------------------------------------------- 3E-B1A: declared canonical derivatives (pure; the adapter is wired in B1B)
/** The owner's distinct, explicit authorization to render declared, verified canonical derivatives of declared sources, as well as the sources. */
export const OWNER_CANONICAL_RENDER_AUTHORIZATION_STATEMENT =
  "owner_authorizes_local_render_of_exactly_the_declared_sources_and_their_declared_verified_canonical_derivatives_v0" as const;
export const OwnerCanonicalRenderAuthorizationSchema = z.strictObject({
  statement: z.literal(OWNER_CANONICAL_RENDER_AUTHORIZATION_STATEMENT), owner: OwnerSchema,
  renderIntents: z.array(RenderIntentSchema).min(1).max(2).refine(v => new Set(v).size === v.length, "Duplicate render intent."),
  authorizedAt: TimestampSchema, expiresAt: TimestampSchema.nullable(),
}).refine(v => v.expiresAt === null || v.expiresAt > v.authorizedAt, "A render authorization must end after it begins.");
export type OwnerCanonicalRenderAuthorization = z.infer<typeof OwnerCanonicalRenderAuthorizationSchema>;
/** Either variant. The original statement keeps exactly its accepted scope; neither statement alone ever authorizes a hash. */
export const AnyOwnerRenderAuthorizationSchema = z.union([OwnerRenderAuthorizationSchema, OwnerCanonicalRenderAuthorizationSchema]);

export const OWNER_MEDIA_CANONICAL_REGISTRATION_VERSION = "0.2.0" as const;
const OwnerMediaCanonicalDerivativeSchema = z.strictObject({ entryId: IdSchema, rootEntryId: IdSchema, authorization: FootageAuthorizationDerivedSchema,
  derivation: AnyCanonicalMediaDerivationSchema });
const recipeIdOf = (d: CanonicalMediaDerivation | CanonicalMediaPlanDerivation): string => d.artifactVersion === "0.1.0" ? d.recipe.recipeId : d.plan.planId;
const readAny = (value: unknown): FootageAuthorization | null => { const result = FootageAuthorizationSchema.safeParse(value); return result.success ? result.data : null; };
/**
 * OwnerMediaRegistration 0.2.0: the owner's declared originals (1.0.0 or 1.1.0 root authorizations) and their declared canonical
 * derivatives. A derivative names no location: the canonical store is content-addressed. It is accepted only if all of these hold:
 * - it sits beside its declared root, and its lineage carries exactly that root's authorization, which consented to canonicalization;
 * - its derivation's source and output are exactly the root's bytes and its own;
 * - its lineage names exactly that derivation and recipe;
 * - it stays in the set's scope;
 * - the owner gave the derived-capable render statement.
 */
export const OwnerMediaCanonicalRegistrationSchema = z.strictObject({
  artifactType: z.literal("OwnerMediaRegistration"), artifactVersion: z.literal(OWNER_MEDIA_CANONICAL_REGISTRATION_VERSION), stability: z.literal("internal_pre_stable"),
  footage: FootageManifestSchema, canonicalDerivatives: z.array(OwnerMediaCanonicalDerivativeSchema).max(MAX_RENDER_SOURCES),
  renderAuthorization: AnyOwnerRenderAuthorizationSchema,
}).superRefine((value, ctx) => {
  const issue = (message: string) => ctx.addIssue({ code: "custom", message });
  const { originals, hashes } = checkDeclaredOriginals(value.footage, readAny, issue);
  const roots = new Map(originals.map(o => [o.entryId, o.authorization])), entries = new Set(value.footage.assets.map(a => a.entryId)), rootRecipes = new Set<string>();
  for (const declared of value.canonicalDerivatives) {
    const { authorization: b, derivation } = declared, root = roots.get(declared.rootEntryId);
    if (entries.has(declared.entryId)) issue("Every declaration has its own entry identity.");
    entries.add(declared.entryId);
    if (hashes.has(b.contentHash)) issue("Duplicate or conflicting source declarations are refused.");
    hashes.add(b.contentHash);
    if (root === undefined) issue("A canonical derivative is declared only beside its declared root source.");
    else {
      if (!equal(b.derivedFrom.rootAuthorization, root)) issue("A derivative's root authorization is exactly the declared root's authorization.");
      if (root.schemaVersion !== "1.1.0" || root.canonicalizationConsent !== "local_media_canonicalization") {
        issue("Only a root whose owner consented to canonicalization has a derivative.");
      }
      const s = derivation.source;
      if (s.assetId !== `asset_${root.contentHash}` || s.contentHash !== root.contentHash || s.sizeBytes !== root.sizeBytes || !equal(s.rootAuthorization, root)) {
        issue("The derivation's source is exactly the declared root's bytes, asset and authorization.");
      }
      const pair = canonicalSerialize([declared.rootEntryId, recipeIdOf(derivation)]);
      if (rootRecipes.has(pair)) issue("A declared root has at most one derivative per recipe.");
      rootRecipes.add(pair);
    }
    const o = derivation.output;
    if (o.contentHash !== b.contentHash || o.sizeBytes !== b.sizeBytes || o.assetId !== `asset_${b.contentHash}`) {
      issue("The derivation's output is exactly the declared derivative's bytes and asset.");
    }
    if (b.derivedFrom.derivationId !== derivation.derivationId || b.derivedFrom.recipeId !== recipeIdOf(derivation)) {
      issue("A derivative's lineage names exactly its derivation and recipe.");
    }
    if (b.creatorId !== value.footage.creatorId || b.projectId !== value.footage.projectId || derivation.scope.creatorId !== value.footage.creatorId
      || derivation.scope.projectId !== value.footage.projectId) issue("Every derivative belongs to the set's creator and project.");
  }
  if (value.canonicalDerivatives.length > 0 && value.renderAuthorization.statement !== OWNER_CANONICAL_RENDER_AUTHORIZATION_STATEMENT) {
    issue("Rendering a declared canonical derivative needs the owner's derived-capable render authorization.");
  }
});
export type OwnerMediaCanonicalRegistration = z.infer<typeof OwnerMediaCanonicalRegistrationSchema>;
export interface OwnerMediaOriginalDeclaration { entryId: string; assetId: string; contentHash: string; sizeBytes: number; path: string;
  authorization: FootageAuthorizationV1 | FootageAuthorizationRoot }
export interface OwnerMediaCanonicalDerivative { entryId: string; assetId: string; contentHash: string; sizeBytes: number; rootEntryId: string; rootAssetId: string;
  derivationId: string; computationId: string; recipeId: string; authorization: FootageAuthorizationDerived; derivation: CanonicalMediaDerivation | CanonicalMediaPlanDerivation }
export interface OwnerMediaRenderScope { statement: string; assetIds: string[] }
/**
 * The validated declarations of either registration version, in canonical asset order. A 0.1.0 registration reads exactly as
 * ownerMediaDeclarations reads it, with no derivatives. The render scope covers exactly the declared originals; under the derived-capable
 * statement only, it also covers the declared verified derivatives, and never any other hash. The digest binds what was declared and
 * never a location.
 */
export function ownerMediaCanonicalDeclarations(input: unknown): { registrationDigest: string; declarations: OwnerMediaOriginalDeclaration[];
  derivatives: OwnerMediaCanonicalDerivative[]; renderScope: OwnerMediaRenderScope } {
  if (typeof input === "object" && input !== null && (input as { artifactVersion?: unknown }).artifactVersion === EDIT_RENDER_VERSION) {
    const legacy = ownerMediaDeclarations(input);
    return { registrationDigest: legacy.registrationDigest, declarations: legacy.declarations, derivatives: [],
      renderScope: { statement: legacy.registration.renderAuthorization.statement, assetIds: legacy.declarations.map(d => d.assetId) } };
  }
  const registration = parse(OwnerMediaCanonicalRegistrationSchema, input, "lifecycle_authority_scope_invalid");
  const declarations = registration.footage.assets.map(asset => {
    const authorization = readAny(asset.authorization);
    check(authorization !== null && authorization.sourceType === "owner_supplied", "lifecycle_authority_scope_invalid", "Every original is owner-supplied.");
    return { entryId: asset.entryId, assetId: `asset_${authorization.contentHash}`, contentHash: authorization.contentHash, sizeBytes: authorization.sizeBytes,
      path: asset.path, authorization };
  }).sort((a, b) => compareText(a.assetId, b.assetId));
  const byEntry = new Map(declarations.map(d => [d.entryId, d]));
  const derivatives = registration.canonicalDerivatives.map(d => {
    const root = byEntry.get(d.rootEntryId);
    check(root !== undefined, "lifecycle_authority_scope_invalid", "A canonical derivative is declared only beside its declared root source.");
    return { entryId: d.entryId, assetId: `asset_${d.authorization.contentHash}`, contentHash: d.authorization.contentHash, sizeBytes: d.authorization.sizeBytes,
      rootEntryId: d.rootEntryId, rootAssetId: root.assetId, derivationId: d.derivation.derivationId, computationId: d.derivation.computationId,
      recipeId: recipeIdOf(d.derivation), authorization: d.authorization, derivation: d.derivation };
  }).sort((a, b) => compareText(a.assetId, b.assetId));
  const registrationDigest = sha256(canonicalSerialize({ artifactVersion: OWNER_MEDIA_CANONICAL_REGISTRATION_VERSION, renderAuthorization: registration.renderAuthorization,
    creatorId: registration.footage.creatorId, projectId: registration.footage.projectId,
    sources: declarations.map(d => ({ entryId: d.entryId, assetId: d.assetId, contentHash: d.contentHash, sizeBytes: d.sizeBytes, authorization: d.authorization })),
    derivatives: derivatives.map(d => ({ entryId: d.entryId, rootEntryId: d.rootEntryId, assetId: d.assetId, contentHash: d.contentHash, sizeBytes: d.sizeBytes,
      authorization: d.authorization, derivationId: d.derivationId, computationId: d.computationId })) }));
  const covered = registration.renderAuthorization.statement === OWNER_CANONICAL_RENDER_AUTHORIZATION_STATEMENT ? [...declarations, ...derivatives] : declarations;
  return { registrationDigest, declarations, derivatives,
    renderScope: { statement: registration.renderAuthorization.statement, assetIds: covered.map(d => d.assetId).sort(compareText) } };
}

// (OwnerMediaDerivedProvenanceSchema, the derived provenance kind, is defined beside the observation record above, unchanged.)
export type OwnerMediaProvenanceKind = { kind: "original"; provenance: OwnerMediaProvenance; authorization: FootageAuthorizationV1 | FootageAuthorizationRoot }
  | { kind: "derived"; provenance: OwnerMediaDerivedProvenance; authorization: FootageAuthorizationDerived };
/**
 * The provenance kind of one admitted source, read from its exact MediaAsset and FootageAnalysis. ORIGINAL is creator_upload with
 * an owner-supplied 1.0.0 or 1.1.0 root authorization. DERIVED is creator_upload with a system_canonicalized authorization. Anything
 * else, or any mismatch with the admitted bytes, is refused. The original check above is unchanged and stays 1.0.0 only.
 */
export function ownerMediaProvenanceKindOf(source: AdmittedSource, artifacts: readonly SuppliedArtifact[]): OwnerMediaProvenanceKind {
  const supplied = new RuntimeArtifacts(artifacts);
  let media, analysis;
  try {
    media = MediaAssetSchema.parse(supplied.exact(source.mediaAsset, "MediaAsset", "1.0.0", "input_invalid"));
    analysis = FootageAnalysisSchema.parse(supplied.exact(source.analysis, "FootageAnalysis", "1.0.0", "input_invalid"));
  } catch { refuse("lifecycle_authority_scope_invalid", "The owner-local authority answers only for exactly supplied MediaAsset and FootageAnalysis records."); }
  const a = analysis.authorization;
  check(media.origin === "creator_upload" && media.assetId === source.assetId && analysis.assetId === source.assetId && analysis.contentHash === source.contentHash
    && a.contentHash === source.contentHash && a.sizeBytes === source.sizeBytes, "lifecycle_authority_scope_invalid",
  "The owner-local authority answers only for creator_upload media of exactly the admitted bytes.");
  if (a.sourceType === "system_canonicalized") {
    const root = a.derivedFrom.rootAuthorization;
    return { kind: "derived", authorization: a, provenance: { mediaOrigin: "creator_upload", sourceType: "system_canonicalized", authorizationBasis: a.authorizationBasis,
      root: { assetId: `asset_${root.contentHash}`, contentHash: root.contentHash, sizeBytes: root.sizeBytes }, derivationId: a.derivedFrom.derivationId,
      recipeId: a.derivedFrom.recipeId } };
  }
  check(a.sourceType === "owner_supplied" && (OWNER_BASES as readonly string[]).includes(a.authorizationBasis), "lifecycle_authority_scope_invalid",
    "The owner-local authority answers only for owner-supplied or system-canonicalized, owner-authorized real media.");
  return { kind: "original", authorization: a, provenance: { mediaOrigin: "creator_upload", sourceType: "owner_supplied",
    authorizationBasis: a.authorizationBasis as OwnerMediaProvenance["authorizationBasis"] } };
}

const LifecycleStateSchema = z.strictObject({ deletionRequestedAt: TimestampSchema.nullable(), expiresAt: TimestampSchema.nullable() });
export type OwnerMediaLifecycleState = z.infer<typeof LifecycleStateSchema>;
const earlier = (a: string | null, b: string | null): string | null => (a === null ? b : b === null || a <= b ? a : b);
/**
 * The effective lifecycle of a declared derivative, from its root's state and its own. A deletion request on either makes it
 * unavailable. Its expiry is the earlier non-null expiry, so it never outlives its root. The result has the shape of the observation's
 * lifecycle field. It is pure: the adapter applies its trusted runtime clock to the result (B1B).
 */
export function effectiveDerivedLifecycle(root: unknown, derived: unknown): OwnerMediaLifecycleState {
  const r = parse(LifecycleStateSchema, root, "lifecycle_observation_invalid"), d = parse(LifecycleStateSchema, derived, "lifecycle_observation_invalid");
  return { deletionRequestedAt: earlier(r.deletionRequestedAt, d.deletionRequestedAt), expiresAt: earlier(r.expiresAt, d.expiresAt) };
}

// ---------------------------------------------------------------- 3E-B1B: the private canonical store, as names only
/**
 * The content-addressed canonical store under one explicit local workspace: `<workspace>/.local-media/canonical-v0/`. A trusted object is
 * named by its exact SHA-256; the internal record of one verified computation is named by the digest of its computation identity. These
 * are names, never locations: the media-ingest adapter (scripts/media-ingest-local.ts) is the only writer, and the owner-media adapter
 * only reads.
 */
export const CANONICAL_STORE = { directory: [".local-media", "canonical-v0"], objects: "objects", computations: "computations", pending: "pending",
  maxRecordBytes: 262_144 } as const;
const OBJECT_HASH = /^[a-f0-9]{64}$/;
export function canonicalObjectName(contentHash: string): string {
  check(typeof contentHash === "string" && OBJECT_HASH.test(contentHash), "lifecycle_authority_scope_invalid", "A canonical object is named only by its exact SHA-256.");
  return `${contentHash}.mp4`;
}
export function canonicalComputationRecordName(computationId: string): string {
  check(IdSchema.safeParse(computationId).success, "lifecycle_authority_scope_invalid", "A computation record is named only by its computation identity.");
  return `${sha256(computationId)}.json`;
}
export const CANONICAL_COMPUTATION_RECORD_IDENTITY = "canonical_computation_record_v0" as const;
export const CANONICAL_PLAN_COMPUTATION_RECORD_IDENTITY = "canonical_computation_record_v1" as const;
/**
 * The canonical store's internal record of one verified computation: exactly the scope-free part of a derivation (the computation, the
 * source bytes, the classification, the recipe, the toolchain and the verified output). It names no creator, project, root authorization,
 * derivation or location, and it authorizes nothing: it lets the adapter find a verified result again, and lets the owner-media registry
 * confirm that a declared derivation is one the adapter measured. Its bytes are a pure function of the derivation, so any two
 * derivations of one computation, whatever their scope, have exactly one record.
 */
export function canonicalComputationRecordOf(input: unknown): { name: string; bytes: string; record: Record<string, unknown> } {
  if (typeof input === "object" && input !== null && (input as { artifactVersion?: unknown }).artifactVersion === "0.2.0") {
    const d = parse(CanonicalMediaPlanDerivationSchema, input, "lifecycle_authority_scope_invalid"), s = d.source;
    const record = identify(CANONICAL_PLAN_COMPUTATION_RECORD_IDENTITY, "recordId", { artifactType: "CanonicalComputationRecord", artifactVersion: "0.2.0",
      stability: "internal_pre_stable", computationId: d.computationId, source: { assetId: s.assetId, contentHash: s.contentHash, sizeBytes: s.sizeBytes,
        factsDigest: s.factsDigest, evaluation: s.evaluation }, plan: d.plan, toolchain: d.toolchain, output: d.output });
    const bytes = `${canonicalSerialize(record)}\n`;
    check(new TextEncoder().encode(bytes).length <= CANONICAL_STORE.maxRecordBytes, "limit_exceeded", "A computation record exceeds its bound.");
    return { name: canonicalComputationRecordName(d.computationId), bytes, record };
  }
  const derivation = parse(CanonicalMediaDerivationSchema, input, "lifecycle_authority_scope_invalid");
  const { computationId, source, classification, recipe, toolchain, output } = derivation;
  const record = identify(CANONICAL_COMPUTATION_RECORD_IDENTITY, "recordId", { artifactType: "CanonicalComputationRecord", artifactVersion: "0.1.0",
    stability: "internal_pre_stable", computationId, source: { assetId: source.assetId, contentHash: source.contentHash, sizeBytes: source.sizeBytes }, classification,
    recipe, toolchain, output });
  const bytes = `${canonicalSerialize(record)}\n`;
  check(new TextEncoder().encode(bytes).length <= CANONICAL_STORE.maxRecordBytes, "limit_exceeded", "A computation record exceeds its bound.");
  return { name: canonicalComputationRecordName(computationId), bytes, record };
}

// ---------------------------------------------------------------- B2-B2 G: additive registration; old schemas and identities above stay exact.
import { ChromaSafeDerivationSchema, type ChromaSafeDerivation } from "../media-ingest/chroma.js";
export const OWNER_MEDIA_LOSSLESS_REGISTRATION_VERSION = "0.3.0" as const;
/** Explicit 0.4 declarations only. This is owner-supplied data, never proof of fresh verification or a render permit. */
export const OwnerMediaLosslessRegistrationSchema = z.strictObject({
  artifactType: z.literal("OwnerMediaRegistration"), artifactVersion: z.literal(OWNER_MEDIA_LOSSLESS_REGISTRATION_VERSION), stability: z.literal("internal_pre_stable"),
  footage: FootageManifestSchema,
  canonicalDerivatives: z.array(z.strictObject({ entryId: IdSchema, rootEntryId: IdSchema,
    authorization: FootageAuthorizationDerivedSchema, derivation: ChromaSafeDerivationSchema })).max(MAX_RENDER_SOURCES),
  renderAuthorization: AnyOwnerRenderAuthorizationSchema,
}).superRefine((value, ctx) => {
  const issue = (message: string) => ctx.addIssue({ code: "custom", message });
  const { originals, hashes } = checkDeclaredOriginals(value.footage, readAny, issue);
  const roots = new Map(originals.map(o => [o.entryId, o.authorization])), entries = new Set(value.footage.assets.map(a => a.entryId)), plans = new Set<string>();
  for (const d of value.canonicalDerivatives) {
    const a = d.authorization, s = d.derivation.sampleDerivation, root = roots.get(d.rootEntryId);
    if (entries.has(d.entryId)) issue("Every declaration has its own entry identity.");
    entries.add(d.entryId);
    if (hashes.has(a.contentHash)) issue("Duplicate or conflicting source declarations are refused.");
    hashes.add(a.contentHash);
    if (root === undefined) issue("A canonical derivative is declared only beside its declared root source.");
    else {
      if (root.schemaVersion !== "1.1.0" || root.canonicalizationConsent !== "local_media_canonicalization") issue("The declared root must consent to canonicalization.");
      if (!equal(a.derivedFrom.rootAuthorization, root) || !equal(s.source.rootAuthorization, root)
        || s.source.assetId !== `asset_${root.contentHash}` || s.source.contentHash !== root.contentHash || s.source.sizeBytes !== root.sizeBytes)
        issue("The full 0.4 derivation and authorization name exactly the declared original root.");
      const pair = canonicalSerialize([d.rootEntryId, d.derivation.plan.planId]);
      if (plans.has(pair)) issue("A declared root has at most one derivative per plan.");
      plans.add(pair);
    }
    if (s.output.contentHash !== a.contentHash || s.output.sizeBytes !== a.sizeBytes || s.output.assetId !== `asset_${a.contentHash}`)
      issue("The output names exactly the declared derivative bytes.");
    if (a.derivedFrom.derivationId !== d.derivation.derivationId || a.derivedFrom.recipeId !== d.derivation.plan.planId)
      issue("The lineage names the actual 0.4 derivation and Plan 1.1.0 identity.");
    if (a.creatorId !== value.footage.creatorId || a.projectId !== value.footage.projectId
      || s.scope.creatorId !== value.footage.creatorId || s.scope.projectId !== value.footage.projectId) issue("Every derivative keeps the declared creator and project.");
  }
  if (value.canonicalDerivatives.length > 0 && value.renderAuthorization.statement !== OWNER_CANONICAL_RENDER_AUTHORIZATION_STATEMENT)
    issue("A canonical derivative needs the owner's explicit derived-capable render declaration.");
});
export type OwnerMediaLosslessRegistration = z.infer<typeof OwnerMediaLosslessRegistrationSchema>;
export interface OwnerMediaLosslessDerivative extends Omit<OwnerMediaCanonicalDerivative, "derivation"> { derivation: ChromaSafeDerivation }
/** Version-specific projection; legacy declaration parsing and digest serialization remain unchanged. */
export function ownerMediaLosslessDeclarations(input: unknown): { registrationDigest: string; declarations: OwnerMediaOriginalDeclaration[];
  derivatives: OwnerMediaLosslessDerivative[]; renderScope: OwnerMediaRenderScope } {
  const registration = parse(OwnerMediaLosslessRegistrationSchema, input, "lifecycle_authority_scope_invalid");
  const declarations = registration.footage.assets.map(a => {
    const authorization = readAny(a.authorization);
    check(authorization !== null && authorization.sourceType === "owner_supplied", "lifecycle_authority_scope_invalid", "Every original is owner-supplied.");
    return { entryId: a.entryId, assetId: `asset_${authorization.contentHash}`, contentHash: authorization.contentHash,
      sizeBytes: authorization.sizeBytes, path: a.path, authorization };
  }).sort((a, b) => compareText(a.assetId, b.assetId));
  const roots = new Map(declarations.map(d => [d.entryId, d]));
  const derivatives = registration.canonicalDerivatives.map(d => ({ entryId: d.entryId, rootEntryId: d.rootEntryId,
    rootAssetId: roots.get(d.rootEntryId)!.assetId, assetId: `asset_${d.authorization.contentHash}`, contentHash: d.authorization.contentHash,
    sizeBytes: d.authorization.sizeBytes, authorization: d.authorization, derivation: d.derivation, derivationId: d.derivation.derivationId,
    computationId: d.derivation.computationId, recipeId: d.derivation.plan.planId })).sort((a, b) => compareText(a.assetId, b.assetId));
  const registrationDigest = sha256(canonicalSerialize({ artifactVersion: OWNER_MEDIA_LOSSLESS_REGISTRATION_VERSION,
    renderAuthorization: registration.renderAuthorization, creatorId: registration.footage.creatorId, projectId: registration.footage.projectId,
    sources: declarations.map(d => ({ entryId: d.entryId, assetId: d.assetId, contentHash: d.contentHash, sizeBytes: d.sizeBytes, authorization: d.authorization })),
    derivatives: derivatives.map(d => ({ entryId: d.entryId, rootEntryId: d.rootEntryId, assetId: d.assetId, contentHash: d.contentHash,
      sizeBytes: d.sizeBytes, authorization: d.authorization, derivationId: d.derivationId, computationId: d.computationId })) }));
  const covered = registration.renderAuthorization.statement === OWNER_CANONICAL_RENDER_AUTHORIZATION_STATEMENT ? [...declarations, ...derivatives] : declarations;
  return { registrationDigest, declarations, derivatives, renderScope: { statement: registration.renderAuthorization.statement, assetIds: covered.map(d => d.assetId).sort(compareText) } };
}
