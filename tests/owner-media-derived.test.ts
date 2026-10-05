// Gate 7 Batch 3E-B1A, Part 4: the pure owner-media contract for declared canonical derivatives, the derived lifecycle rule, the two
// render-authorization variants, the two provenance kinds and the hostile lineage corpus. Pure: records only. No media, file, process,
// clock or network. The owner-media adapter is unchanged in B1A, so nothing here registers a file; B1B wires the adapter. New exports
// are read through module namespaces, so each new behaviour fails in its own test against the pre-B1A bytes, while the B1A-O tests
// are invariants of the unchanged original path that hold before and after.
import assert from "node:assert/strict";
import { test } from "node:test";
import { canonicalSerialize } from "../packages/domain/serialization.js";
import * as ownerMedia from "../packages/edit-render/owner-media.js";
import { EditRenderError, OWNER_MEDIA_AUTHORITY, OWNER_MEDIA_AUTHORITY_DIGEST, OWNER_RENDER_AUTHORIZATION_STATEMENT, OwnerMediaRegistrationSchema,
  OwnerRenderAuthorizationSchema, checkOwnerMediaProvenance, ownerMediaDeclarations } from "../packages/edit-render/index.js";
import { identify } from "../packages/editorial/common.js";
import { contentId } from "../packages/reference-analyzer/features.js";
import * as protocol from "../packages/footage-analyzer/protocol.js";
import * as ingest from "../packages/media-ingest/index.js";
import { artifact, tokenFixture } from "./support/editorial.js";
import { ANALYSIS, CANONICALIZATION, CREATOR, DAY0, DAY1, DAY2, DAY3, EVALUATION, HASH_A, HASH_B, HASH_C, PROJECT, SIZE_A, SIZE_B, SIZE_C, canonicalChain,
  canonicalStatement, clone, derivative, derivedRecord, original, registrationV1, registrationV2, reidentified, renderAuthorization, repointed, root, rootWithoutConsent,
  sha, v1, type Json } from "./support/canonical-media.js";

// ---------------------------------------------------------------- helpers
interface Issue { message: string; code?: string; errors?: Issue[][] }
const flatten = (issues: readonly Issue[]): string[] => issues.flatMap(issue => [issue.message, ...(issue.errors ?? []).flatMap(flatten)]);
function issuesOf(registration: unknown): string[] {
  const result = ownerMedia.OwnerMediaCanonicalRegistrationSchema.safeParse(registration);
  return result.success ? [] : flatten(result.error.issues as unknown as Issue[]);
}
function accepted(registration: unknown): void { assert.deepEqual(issuesOf(registration), [], "the positive control is accepted"); }
function refusedBy(registration: unknown, fragment: string): void {
  const messages = issuesOf(registration);
  assert.ok(messages.some(message => message.includes(fragment)), `expected "${fragment}" among ${JSON.stringify(messages)}`);
  assert.equal(code(() => ownerMedia.ownerMediaCanonicalDeclarations(registration)), "lifecycle_authority_scope_invalid", "the declared-media entry point refuses it too");
}
function code(run: () => unknown): string | null {
  try { run(); return null; } catch (error) { return error instanceof EditRenderError ? error.code : `foreign: ${String(error)}`; }
}
const withDerivative = (entry: Json, originals?: Json[]): Json => registrationV2({ derivatives: [entry], ...(originals === undefined ? {} : { originals }) });
/** A coordinated derivation forgery whose identities recompute, with the derived authorization re-pointed at it. */
function forged(mutateDerivation: (d: Json) => void, mutateAuthorization: (a: Json) => void = () => undefined): Json {
  const chain = canonicalChain(), derivation = reidentified(chain.derivation, mutateDerivation), authorization = repointed(chain.authorization, derivation);
  mutateAuthorization(authorization);
  return derivative("clip_a_canonical", "clip_a", { authorization, derivation });
}
const sourceOf = (d: Json): Json => d.source as Json;
const outputOf = (d: Json): Json => d.output as Json;
/** A derivation whose recorded scope was forged (identities recomputed) while every authorization stays in the set's scope. */
const forgedScope = (): Json => withDerivative(forged(d => { (d.scope as Json).projectId = "project_other"; }));

// ================================================================ the unchanged original path (invariants: true before and after B1A)
test("B1A-O01 the 0.1.0 registration, its digest and its declarations are byte-identical to the baseline, and the authority is the pinned one", () => {
  const registration = registrationV1([original("clip_a", "clip_a.mp4", v1({ contentHash: "a".repeat(64), sizeBytes: 4099 })),
    original("clip_b", "nested/clip_b.mp4", v1({ contentHash: "b".repeat(64), sizeBytes: 5003 }))]);
  const declared = ownerMediaDeclarations(registration);
  assert.equal(declared.registrationDigest, "18fcc06dccf3b47efe2fa4737ff7690bd685bf1774e883d1d60861b26e50c438", "frozen from the unmodified 86d2a10 build");
  assert.deepEqual(declared.declarations.map(d => [d.entryId, d.assetId, d.sizeBytes]), [["clip_a", `asset_${"a".repeat(64)}`, 4099], ["clip_b", `asset_${"b".repeat(64)}`, 5003]]);
  // Gate 7 Batch 3E-B1B (owner-authorized): the one authority now also states declared verified canonical derivatives and their lineage
  // lifecycle. Its 3D/B1A digest was e154b61538988ed347210ced01fc4ea16a408500ca38a1511bd371edf28579c0.
  assert.equal(OWNER_MEDIA_AUTHORITY_DIGEST, "0cd89b68e42aca92acdfba826dff4c1dfe471134506712f20188343cec0a2f37");
  assert.equal(OWNER_MEDIA_AUTHORITY.descriptor.eligibility, "creator_upload_origin_and_owner_supplied_or_declared_system_canonicalized_authorization_only");
});

test("B1A-O02 the 0.1.0 path refuses AuthorizedFootage 1.1.0 records exactly as before 1.1.0 existed", () => {
  for (const authorization of [root(), root({ allowedPurposes: [ANALYSIS] }), derivedRecord()]) {
    const registration = registrationV1([original("clip_a", "clip_a.mp4", authorization)]);
    assert.equal(OwnerMediaRegistrationSchema.safeParse(registration).success, false, JSON.stringify(authorization).slice(0, 80));
    assert.equal(code(() => ownerMediaDeclarations(registration)), "lifecycle_authority_scope_invalid");
  }
  assert.equal(OwnerMediaRegistrationSchema.safeParse(registrationV1([original("clip_a", "clip_a.mp4", v1())])).success, true, "1.0.0 is still accepted");
});

const SCOPE_REFUSAL = "The owner-local authority answers only for exactly supplied MediaAsset and FootageAnalysis records.";
/** One admitted source: a valid FootageAnalysis (the accepted synthetic fixture) relabelled with the given authorization, and its MediaAsset. */
function admitted(authorization: Json, origin = "creator_upload") {
  const base = tokenFixture().analysis, hash = base.contentHash;
  const analysis = { ...clone(base), authorization: { ...clone(authorization), contentHash: hash, sizeBytes: 1 } };
  const media = { contractType: "MediaAsset", schemaVersion: "1.0.0", assetId: base.assetId, projectId: PROJECT, creatorId: CREATOR, kind: "video", objectId: "object_media_b1a",
    durationSeconds: 4, origin, retention: { expiresAt: null, deletionRequestedAt: null } };
  const m = artifact("b1a_media", "MediaAsset", media, "1.0.0"), f = artifact("b1a_analysis", "FootageAnalysis", analysis, "1.0.0");
  return { source: { assetId: base.assetId, contentHash: hash, sizeBytes: 1, mediaAsset: m.ref, analysis: f.ref }, artifacts: [m, f] };
}

test("B1A-O03 the original provenance check refuses 1.1.0 authorizations with the same code and message, and keeps 1.0.0 exactly", () => {
  for (const authorization of [root(), derivedRecord()]) {
    const { source, artifacts } = admitted(authorization);
    assert.throws(() => checkOwnerMediaProvenance(source, artifacts),
      (error: unknown) => error instanceof EditRenderError && error.code === "lifecycle_authority_scope_invalid" && error.message === SCOPE_REFUSAL);
  }
  const { source, artifacts } = admitted(v1());
  assert.deepEqual(checkOwnerMediaProvenance(source, artifacts).provenance, { mediaOrigin: "creator_upload", sourceType: "owner_supplied", authorizationBasis: "owner_created" });
});

// ================================================================ B1A-14 and the derived declaration lineage (B1A-28 .. B1A-38)
test("B1A-14 relabelling canonical bytes as owner_supplied never makes them a declared derivative", () => {
  accepted(registrationV2());
  const chain = canonicalChain(), relabelled = { ...clone(chain.authorization), sourceType: "owner_supplied" };
  assert.equal(protocol.FootageAuthorizationDerivedSchema.safeParse(relabelled).success, false);
  assert.equal(protocol.FootageAuthorizationSchema.safeParse(relabelled).success, false, "owner_supplied with lineage is no form at all");
  const attested: Json = { ...clone(relabelled), schemaVersion: "1.0.0" }; delete attested.derivedFrom;
  const parsed = protocol.FootageAuthorizationSchema.parse(attested);
  assert.deepEqual([parsed.schemaVersion, parsed.sourceType, "derivedFrom" in parsed], ["1.0.0", "owner_supplied", false], "an owner attestation of those bytes is only an original");
  for (const authorization of [attested, { ...attested, schemaVersion: "1.1.0", canonicalizationConsent: CANONICALIZATION }]) {
    refusedBy(withDerivative(derivative("clip_b", "clip_a", { authorization, derivation: chain.derivation })), "system_canonicalized");
    const asOriginal = ownerMedia.ownerMediaCanonicalDeclarations(registrationV2({ derivatives: [], originals: [original("clip_b", "clip_b.mp4", authorization)] }));
    assert.deepEqual([asOriginal.declarations.length, asOriginal.derivatives.length], [1, 0], "declared as an original it is an original, never a derivative");
  }
});

test("B1A-28 a canonical derivative registers only beside its declared root", () => {
  accepted(registrationV2());
  refusedBy(withDerivative(derivative("clip_a_canonical", "clip_missing", canonicalChain())), "declared root source");
  refusedBy(registrationV2({ originals: [original("clip_c", "clip_c.mp4", root({ contentHash: HASH_C, sizeBytes: SIZE_C }))] }), "declared root source");
  refusedBy(withDerivative(derivative("clip_a", "clip_a", canonicalChain())), "its own entry identity");
  refusedBy(registrationV2({ derivatives: [derivative("clip_a_canonical", "clip_a", canonicalChain()),
    derivative("clip_a_canonical_again", "clip_a", canonicalChain({ outputHash: HASH_C, outputSize: SIZE_C }))] }), "at most one derivative per recipe");
  assert.equal(OwnerMediaRegistrationSchema.safeParse({ ...registrationV1([original("clip_a", "clip_a.mp4", v1())]), canonicalDerivatives: [] }).success, false,
    "a 0.1.0 registration can never carry derivatives");
});

test("B1A-29 a derivative's root authorization is exactly the declared root's authorization", () => {
  accepted(registrationV2());
  for (const declared of [root({ dateAdded: DAY0 }), root({ allowedPurposes: [EVALUATION, ANALYSIS] }), root({ authorizationBasis: "permission_granted" })]) {
    refusedBy(registrationV2({ originals: [original("clip_a", "clip_a.mp4", declared)] }), "exactly the declared root's authorization");
  }
});

test("B1A-30 the derivation's source is exactly the declared root's bytes and asset", () => {
  accepted(registrationV2());
  const other = canonicalChain({ root: root({ contentHash: HASH_C, sizeBytes: SIZE_C }) }), chain = canonicalChain();
  refusedBy(withDerivative(derivative("clip_a_canonical", "clip_a", { authorization: repointed(chain.authorization, other.derivation), derivation: other.derivation })),
    "derivation's source");
  refusedBy(withDerivative(forged(d => { sourceOf(d).sizeBytes = SIZE_A + 1; (sourceOf(d).rootAuthorization as Json).sizeBytes = SIZE_A + 1; })), "derivation's source");
});

test("B1A-31 the derivation's output is exactly the declared derivative's bytes and asset", () => {
  accepted(registrationV2());
  const chain = canonicalChain();
  for (const elsewhere of [canonicalChain({ outputHash: HASH_C, outputSize: SIZE_C }), canonicalChain({ outputSize: SIZE_B + 1 })]) {
    refusedBy(withDerivative(derivative("clip_a_canonical", "clip_a", { authorization: repointed(chain.authorization, elsewhere.derivation), derivation: elsewhere.derivation })),
      "derivation's output");
  }
});

test("B1A-32 both identities recompute, and the derivative's lineage names exactly its derivation and recipe", () => {
  accepted(registrationV2());
  const chain = canonicalChain(), flip = (id: string): string => `${id.slice(0, -1)}${id.endsWith("0") ? "1" : "0"}`;
  for (const key of ["derivationId", "computationId"]) {
    const derivation = clone(chain.derivation); derivation[key] = flip(String(derivation[key]));
    refusedBy(withDerivative(derivative("clip_a_canonical", "clip_a", { authorization: chain.authorization, derivation })), "identity");
  }
  const sibling = canonicalChain({ audio: "aac" });
  refusedBy(withDerivative(derivative("clip_a_canonical", "clip_a", { authorization: repointed(chain.authorization, sibling.derivation), derivation: chain.derivation })),
    "names exactly its derivation");
  const otherRecipe = clone(chain.authorization); (otherRecipe.derivedFrom as Json).recipeId = "canonical_other_recipe";
  refusedBy(withDerivative(derivative("clip_a_canonical", "clip_a", { authorization: otherRecipe, derivation: chain.derivation })), "names exactly its derivation");
});

test("B1A-33 only a registered canonical recipe is accepted", () => {
  accepted(registrationV2());
  for (const mutate of [(r: Json) => { r.recipeVersion = "0.2.0"; }, (r: Json) => { r.recipeId = "canonical_n2_reencode"; }, (r: Json) => { (r.parameters as Json).audio = "resample"; },
    (r: Json) => { r.semanticsDigest = sha("other semantics"); }, (r: Json) => { r.argvTemplateDigest = sha("other argv"); }]) {
    refusedBy(withDerivative(forged(d => mutate(d.recipe as Json))), "registered canonical recipe");
  }
});

test("B1A-34 only the pinned canonical toolchain is accepted", () => {
  accepted(registrationV2());
  for (const mutate of [(t: Json) => { (t.ffmpeg as Json).sha256 = sha("other ffmpeg"); }, (t: Json) => { (t.ffmpeg as Json).sizeBytes = 1; },
    (t: Json) => { (t.ffprobe as Json).sha256 = sha("other ffprobe"); }, (t: Json) => { (t.ffprobe as Json).reportedVersion = "9.0.2"; },
    (t: Json) => { (t.canonicalizer as Json).implementationDigest = sha("other canonicalizer"); }, (t: Json) => { (t.environment as Json).arch = "arm64"; },
    (t: Json) => { (t.runtime as Json).implementationDigest = sha("other runtime"); }]) {
    refusedBy(withDerivative(forged(d => mutate(d.toolchain as Json))), "pinned canonical toolchain");
  }
});

test("B1A-35 a derivative keeps exactly its root's creator, project and basis", () => {
  accepted(registrationV2());
  const chain = canonicalChain();
  for (const patch of [{ creatorId: "creator_other" }, { projectId: "project_other" }, { authorizationBasis: "permission_granted" }]) {
    assert.ok(issuesOf(withDerivative(derivative("clip_a_canonical", "clip_a", { authorization: { ...clone(chain.authorization), ...patch }, derivation: chain.derivation })))
      .length > 0, JSON.stringify(patch));
  }
  const foreignRoot = root({ creatorId: "creator_other" });
  refusedBy(registrationV2({ originals: [original("clip_a", "clip_a.mp4", foreignRoot)], derivatives: [derivative("clip_a_canonical", "clip_a", canonicalChain({ root: foreignRoot }))] }),
    "creator and project");
  refusedBy(forgedScope(), "creator and project");
  const granted = root({ authorizationBasis: "permission_granted" });
  accepted(registrationV2({ originals: [original("clip_a", "clip_a.mp4", granted)], derivatives: [derivative("clip_a_canonical", "clip_a", canonicalChain({ root: granted }))] }));
});

test("B1A-36 a root without the owner's explicit canonicalization consent never has a derivative", () => {
  accepted(registrationV2());
  const noConsent = rootWithoutConsent(), chain = canonicalChain();
  assert.equal(protocol.FootageAuthorizationSchema.safeParse({ ...clone(chain.authorization),
    derivedFrom: { ...(chain.authorization.derivedFrom as Json), rootAuthorization: noConsent } }).success, false);
  refusedBy(registrationV2({ originals: [original("clip_a", "clip_a.mp4", v1())] }), "consented to canonicalization");
  refusedBy(registrationV2({ originals: [original("clip_a", "clip_a.mp4", noConsent)] }), "valid AuthorizedFootage record");
  assert.throws(() => canonicalChain({ root: noConsent }), (error: unknown) => error instanceof ingest.MediaIngestError, "it cannot even be built");
});

test("B1A-37 derivation depth is exactly one", () => {
  accepted(registrationV2());
  const first = canonicalChain();
  refusedBy(registrationV2({ derivatives: [derivative("clip_a_canonical", "clip_a", first),
    derivative("clip_a_canonical_2", "clip_a_canonical", canonicalChain({ outputHash: HASH_C, outputSize: SIZE_C }))] }), "declared root source");
  assert.equal(protocol.FootageAuthorizationSchema.safeParse(derivedRecord({ contentHash: HASH_C }, { rootAuthorization: derivedRecord() })).success, false);
  refusedBy(registrationV2({ originals: [original("clip_a", "clip_a.mp4", root()), original("clip_b", "clip_b.mp4", first.authorization)] }), "owner-supplied");
});

test("B1A-38 a forged owner-supplied record never passes the derived path", () => {
  accepted(registrationV2());
  const chain = canonicalChain(), relabelled = { ...clone(chain.authorization), sourceType: "owner_supplied" };
  refusedBy(withDerivative(derivative("clip_a_canonical", "clip_a", { authorization: relabelled, derivation: chain.derivation })), "system_canonicalized");
  refusedBy(registrationV2({ originals: [original("clip_a", "clip_a.mp4", root()), original("clip_b", "clip_b.mp4", root({ contentHash: HASH_B, sizeBytes: SIZE_B }))] }),
    "Duplicate or conflicting");
});

// ================================================================ the derived lifecycle rule (B1A-39 .. B1A-44)
type State = { deletionRequestedAt: string | null; expiresAt: string | null };
const S = (deletionRequestedAt: string | null, expiresAt: string | null): State => ({ deletionRequestedAt, expiresAt });
const effective = (rootState: unknown, derivedState: unknown): State => ownerMedia.effectiveDerivedLifecycle(rootState, derivedState);
const earliest = (values: readonly (string | null)[]): string | null => values.filter((v): v is string => v !== null).sort()[0] ?? null;

test("B1A-39 with no deletion and no expiry on either, the derivative is current and unexpiring", () => {
  assert.deepEqual(effective(S(null, null), S(null, null)), S(null, null));
});

test("B1A-40 a deletion request on the root makes the derivative unavailable, whatever the derivative's own state", () => {
  for (const derived of [S(null, null), S(null, DAY3), S(DAY3, null), S(DAY0, DAY3)]) {
    const result = effective(S(DAY1, null), derived);
    assert.equal(result.deletionRequestedAt, earliest([DAY1, derived.deletionRequestedAt]), JSON.stringify(derived));
    assert.notEqual(result.deletionRequestedAt, null);
  }
});

test("B1A-41 a deletion request on the derivative alone makes it unavailable", () => {
  for (const rootState of [S(null, null), S(null, DAY3)]) assert.equal(effective(rootState, S(DAY2, null)).deletionRequestedAt, DAY2);
});

test("B1A-42 with both expiries the earlier one governs, in either order", () => {
  assert.equal(effective(S(null, DAY2), S(null, DAY3)).expiresAt, DAY2);
  assert.equal(effective(S(null, DAY3), S(null, DAY2)).expiresAt, DAY2);
  assert.equal(effective(S(null, DAY2), S(null, DAY2)).expiresAt, DAY2);
});

test("B1A-43 with one expiry that expiry governs, so the derivative never outlives its root", () => {
  assert.equal(effective(S(null, DAY2), S(null, null)).expiresAt, DAY2, "the root's expiry binds an unexpiring derivative");
  assert.equal(effective(S(null, null), S(null, DAY2)).expiresAt, DAY2);
});

test("B1A-44 the rule is pure and clock-free: total over every combination, deterministic, non-mutating and strict about its inputs", () => {
  const values = [null, DAY1, DAY2];
  for (const rd of values) for (const re of values) for (const dd of values) for (const de of values) {
    const r = S(rd, re), d = S(dd, de), before = canonicalSerialize([r, d]), result = effective(r, d);
    assert.equal(canonicalSerialize([r, d]), before, "inputs are never modified");
    assert.ok(result !== (r as object) && result !== (d as object), "a fresh record");
    assert.deepEqual(result, effective(clone(r), clone(d)));
    assert.deepEqual(result, S(earliest([rd, dd]), earliest([re, de])));
    if (re !== null) assert.ok(result.expiresAt !== null && result.expiresAt <= re, "never outlives the root");
    if (rd !== null) assert.notEqual(result.deletionRequestedAt, null, "a root deletion always propagates");
  }
  for (const bad of [undefined, null, {}, S("2026-10-01", null), S(null, "tomorrow"), { ...S(null, null), extra: 1 }]) {
    assert.equal(code(() => effective(bad, S(null, null))), "lifecycle_observation_invalid", JSON.stringify(bad));
    assert.equal(code(() => effective(S(null, null), bad)), "lifecycle_observation_invalid", JSON.stringify(bad));
  }
});

// ================================================================ the render-authorization variants
test("B1A-R01 the original statement keeps exactly its scope: the declared sources, never a derivative", () => {
  assert.equal(OwnerRenderAuthorizationSchema.safeParse(renderAuthorization(canonicalStatement())).success, false, "the original variant never accepts the new statement");
  assert.equal(code(() => ownerMediaDeclarations(registrationV1([original("clip_a", "clip_a.mp4", v1())], canonicalStatement()))), "lifecycle_authority_scope_invalid");
  refusedBy(registrationV2({ statement: OWNER_RENDER_AUTHORIZATION_STATEMENT }), "derived-capable render authorization");
  const plain = ownerMedia.ownerMediaCanonicalDeclarations(registrationV2({ statement: OWNER_RENDER_AUTHORIZATION_STATEMENT, derivatives: [] }));
  assert.deepEqual(plain.renderScope, { statement: OWNER_RENDER_AUTHORIZATION_STATEMENT, assetIds: [`asset_${HASH_A}`] });
  const legacy = registrationV1([original("clip_a", "clip_a.mp4", v1())]), viaNew = ownerMedia.ownerMediaCanonicalDeclarations(legacy), viaOld = ownerMediaDeclarations(legacy);
  assert.deepEqual([viaNew.registrationDigest, viaNew.declarations, viaNew.derivatives], [viaOld.registrationDigest, viaOld.declarations, []], "0.1.0 reads identically");
});

test("B1A-R02 the derived-capable statement covers exactly the declared originals and their declared verified derivatives", () => {
  const declared = ownerMedia.ownerMediaCanonicalDeclarations(registrationV2());
  assert.deepEqual(declared.renderScope, { statement: canonicalStatement(), assetIds: [`asset_${HASH_A}`, `asset_${HASH_B}`].sort() });
  assert.deepEqual(declared.derivatives.map(d => [d.entryId, d.assetId, d.rootEntryId, d.rootAssetId, d.recipeId]),
    [["clip_a_canonical", `asset_${HASH_B}`, "clip_a", `asset_${HASH_A}`, ingest.N1_RECIPE.recipeId]]);
  assert.equal(declared.renderScope.assetIds.includes(`asset_${HASH_C}`), false, "an undeclared hash is never covered");
  assert.deepEqual(ownerMedia.ownerMediaCanonicalDeclarations(registrationV2({ derivatives: [] })).renderScope.assetIds, [`asset_${HASH_A}`],
    "the statement never covers a derivative that is not declared");
  const again = ownerMedia.ownerMediaCanonicalDeclarations(registrationV2());
  assert.equal(again.registrationDigest, declared.registrationDigest, "a deterministic registration identity");
  assert.notEqual(declared.registrationDigest, ownerMedia.ownerMediaCanonicalDeclarations(registrationV2({ derivatives: [] })).registrationDigest);
});

test("B1A-R03 the derived-capable statement never authorizes by itself: lineage is still required", () => {
  const chain = canonicalChain(), broken = canonicalChain({ outputSize: SIZE_B + 1 });
  refusedBy(withDerivative(derivative("clip_a_canonical", "clip_a", { authorization: repointed(chain.authorization, broken.derivation), derivation: broken.derivation })),
    "derivation's output");
  refusedBy(withDerivative(derivative("clip_a_canonical", "clip_a", { authorization: chain.authorization, derivation: canonicalChain({ audio: "none" }).derivation })),
    "names exactly its derivation");
});

test("B1A-R04 the derived-capable variant has the original variant's field rules and no near-miss statement", () => {
  const variant = ownerMedia.OwnerCanonicalRenderAuthorizationSchema, any = ownerMedia.AnyOwnerRenderAuthorizationSchema;
  assert.ok(variant.safeParse(renderAuthorization(canonicalStatement(), { expiresAt: DAY3, renderIntents: ["final", "preview"] })).success);
  for (const statement of [canonicalStatement().toUpperCase(), `${canonicalStatement()}_extra`, "owner_authorizes_local_render_of_any_derivative_v0", ""]) {
    assert.equal(any.safeParse(renderAuthorization(statement)).success, false, statement);
  }
  for (const patch of [{ renderIntents: ["final", "final"] }, { renderIntents: [] }, { expiresAt: DAY1 }, { expiresAt: DAY0 }, { owner: { kind: "creator", actorId: "x" } },
    { scope: "all" }]) {
    assert.equal(variant.safeParse(renderAuthorization(canonicalStatement(), patch)).success, false, JSON.stringify(patch));
  }
  assert.ok(any.safeParse(renderAuthorization(OWNER_RENDER_AUTHORIZATION_STATEMENT)).success, "the original variant is one of the two");
});

// ================================================================ the two provenance kinds
test("B1A-K01 ORIGINAL: creator_upload with an owner_supplied 1.0.0 or 1.1.0 root authorization", () => {
  for (const authorization of [v1(), root(), root({ authorizationBasis: "permission_granted" })]) {
    const { source, artifacts } = admitted(authorization), kind = ownerMedia.ownerMediaProvenanceKindOf(source, artifacts);
    assert.equal(kind.kind, "original");
    assert.deepEqual(kind.provenance, { mediaOrigin: "creator_upload", sourceType: "owner_supplied", authorizationBasis: authorization.authorizationBasis });
  }
  const { source, artifacts } = admitted(v1());
  assert.deepEqual(ownerMedia.ownerMediaProvenanceKindOf(source, artifacts).provenance, checkOwnerMediaProvenance(source, artifacts).provenance, "the same answer as the original check");
});

test("B1A-K02 DERIVED: creator_upload with a system_canonicalized authorization that names its root and derivation", () => {
  const chain = canonicalChain(), { source, artifacts } = admitted(chain.authorization), kind = ownerMedia.ownerMediaProvenanceKindOf(source, artifacts);
  assert.equal(kind.kind, "derived");
  assert.deepEqual(kind.provenance, { mediaOrigin: "creator_upload", sourceType: "system_canonicalized", authorizationBasis: "owner_created",
    root: { assetId: `asset_${HASH_A}`, contentHash: HASH_A, sizeBytes: SIZE_A }, derivationId: chain.derivation.derivationId, recipeId: ingest.N1_RECIPE.recipeId });
  assert.ok(ownerMedia.OwnerMediaDerivedProvenanceSchema.safeParse(kind.provenance).success);
  assert.equal(ownerMedia.OwnerMediaProvenanceSchema.safeParse(kind.provenance).success, false, "the original provenance record never widens to derived media");
});

test("B1A-K03 synthetic, mislabelled or mismatched sources have no owner-media provenance kind", () => {
  const chain = canonicalChain();
  const cases: [string, ReturnType<typeof admitted>][] = [["synthetic", admitted(v1({ sourceType: "synthetic", authorizationBasis: "synthetic_generated" }))],
    ["synthetic origin, derived authorization", admitted(chain.authorization, "synthetic")], ["synthetic origin, root authorization", admitted(root(), "synthetic")]];
  for (const [label, { source, artifacts }] of cases) assert.equal(code(() => ownerMedia.ownerMediaProvenanceKindOf(source, artifacts)), "lifecycle_authority_scope_invalid", label);
  const { source, artifacts } = admitted(root());
  assert.equal(code(() => ownerMedia.ownerMediaProvenanceKindOf({ ...source, sizeBytes: 2 }, artifacts)), "lifecycle_authority_scope_invalid", "other bytes");
  assert.equal(code(() => ownerMedia.ownerMediaProvenanceKindOf({ ...source, assetId: `asset_${HASH_C}` }, artifacts)), "lifecycle_authority_scope_invalid", "another asset");
});

// ================================================================ hostile lineage corpus: every attack refuses
test("B1A-H01 source hash changed", () => {
  accepted(registrationV2());
  refusedBy(withDerivative(forged(d => { Object.assign(sourceOf(d), { contentHash: HASH_C, assetId: `asset_${HASH_C}` }); (sourceOf(d).rootAuthorization as Json).contentHash = HASH_C; })),
    "derivation's source");
});
test("B1A-H02 output hash changed", () => {
  refusedBy(withDerivative(forged(d => { Object.assign(outputOf(d), { contentHash: HASH_C, assetId: `asset_${HASH_C}` }); })), "derivation's output");
});
test("B1A-H03 source size changed", () => {
  refusedBy(withDerivative(forged(d => { sourceOf(d).sizeBytes = SIZE_A + 7; (sourceOf(d).rootAuthorization as Json).sizeBytes = SIZE_A + 7; })), "derivation's source");
});
test("B1A-H04 output size changed", () => {
  refusedBy(withDerivative(forged(d => { outputOf(d).sizeBytes = SIZE_B + 7; })), "derivation's output");
});
test("B1A-H05 root authorization changed", () => {
  refusedBy(withDerivative(forged(() => undefined, a => { ((a.derivedFrom as Json).rootAuthorization as Json).dateAdded = DAY0; })), "exactly the declared root's authorization");
});
test("B1A-H06 canonicalization consent removed from the root", () => {
  refusedBy(withDerivative(derivative("clip_a_canonical", "clip_a", canonicalChain()), [original("clip_a", "clip_a.mp4", v1())]), "consented to canonicalization");
  const noConsent = rootWithoutConsent();
  assert.ok(issuesOf(withDerivative(forged(d => { sourceOf(d).rootAuthorization = noConsent; }, a => { (a.derivedFrom as Json).rootAuthorization = noConsent; }),
    [original("clip_a", "clip_a.mp4", noConsent)])).length > 0, "consent stripped from every copy of the root: no form accepts it");
});
test("B1A-H07 purpose widened beyond the root, to canonicalization, or by a consent field", () => {
  const narrow = root({ allowedPurposes: [ANALYSIS] }), chain = canonicalChain({ root: narrow });
  accepted(withDerivative(derivative("clip_a_canonical", "clip_a", chain), [original("clip_a", "clip_a.mp4", narrow)]));
  for (const patch of [{ allowedPurposes: [ANALYSIS, EVALUATION] }, { allowedPurposes: [ANALYSIS, CANONICALIZATION] }, { canonicalizationConsent: CANONICALIZATION }]) {
    assert.ok(issuesOf(withDerivative(derivative("clip_a_canonical", "clip_a", { authorization: { ...clone(chain.authorization), ...patch }, derivation: chain.derivation }),
      [original("clip_a", "clip_a.mp4", narrow)])).length > 0, JSON.stringify(patch));
  }
});
test("B1A-H08 creator changed", () => {
  const chain = canonicalChain();
  assert.ok(issuesOf(withDerivative(derivative("clip_a_canonical", "clip_a", { authorization: { ...clone(chain.authorization), creatorId: "creator_other" }, derivation: chain.derivation })))
    .length > 0);
  assert.ok(issuesOf(withDerivative(forged(d => { (d.scope as Json).creatorId = "creator_other"; }))).length > 0);
});
test("B1A-H09 project changed", () => {
  const chain = canonicalChain();
  assert.ok(issuesOf(withDerivative(derivative("clip_a_canonical", "clip_a", { authorization: { ...clone(chain.authorization), projectId: "project_other" }, derivation: chain.derivation })))
    .length > 0);
  refusedBy(forgedScope(), "creator and project");
});
test("B1A-H10 basis changed", () => {
  const chain = canonicalChain();
  assert.ok(issuesOf(withDerivative(derivative("clip_a_canonical", "clip_a", { authorization: { ...clone(chain.authorization), authorizationBasis: "permission_granted" },
    derivation: chain.derivation }))).length > 0);
});
test("B1A-H11 derivation identity changed", () => {
  const chain = canonicalChain(), derivation = { ...clone(chain.derivation), derivationId: `canonical_media_derivation_v0_${"0".repeat(64)}` };
  refusedBy(withDerivative(derivative("clip_a_canonical", "clip_a", { authorization: repointed(chain.authorization, derivation), derivation })), "identity");
});
test("B1A-H12 recipe identity changed", () => {
  refusedBy(withDerivative(forged(d => { (d.recipe as Json).recipeId = "canonical_n1_square_sample_aspect_v2"; })), "registered canonical recipe");
});
test("B1A-H13 tool digest changed", () => {
  refusedBy(withDerivative(forged(d => { ((d.toolchain as Json).ffmpeg as Json).sha256 = sha("patched ffmpeg"); })), "pinned canonical toolchain");
});
test("B1A-H14 a nested derived root", () => {
  const first = canonicalChain();
  refusedBy(registrationV2({ derivatives: [derivative("clip_a_canonical", "clip_a", first),
    derivative("clip_nested", "clip_a_canonical", canonicalChain({ outputHash: HASH_C, outputSize: SIZE_C }))] }), "declared root source");
  assert.ok(issuesOf(withDerivative(forged(() => undefined, a => { (a.derivedFrom as Json).rootAuthorization = clone(first.authorization); }))).length > 0);
});
test("B1A-H15 the same bytes as source and output", () => {
  assert.throws(() => canonicalChain({ outputHash: HASH_A, outputSize: SIZE_A }), (error: unknown) => error instanceof ingest.MediaIngestError);
  assert.ok(issuesOf(withDerivative(forged(d => { Object.assign(outputOf(d), { contentHash: HASH_A, assetId: `asset_${HASH_A}`, sizeBytes: SIZE_A }); },
    a => { Object.assign(a, { contentHash: HASH_A, sizeBytes: SIZE_A }); }))).length > 0);
});
test("B1A-H16 an absolute path or location injected anywhere", () => {
  const entry = derivative("clip_a_canonical", "clip_a", canonicalChain());
  assert.ok(issuesOf(withDerivative({ ...entry, path: "C:\\media\\canonical\\b.mp4" })).length > 0, "a derivative names no location");
  assert.ok(issuesOf(withDerivative(forged(d => { (d.output as Json).location = "/abs/b.mp4"; }))).length > 0, "nor does its derivation");
  for (const path of ["C:\\owner\\clip_a.mp4", "/owner/clip_a.mp4", "..\\clip_a.mp4", "\\\\share\\clip_a.mp4"]) {
    assert.ok(issuesOf(registrationV2({ originals: [original("clip_a", path, root())] })).length > 0, path);
  }
  assert.ok(issuesOf(withDerivative(forged(d => { (d.recipe as Json).recipeId = "C:\\recipes\\n1"; }))).length > 0);
});
test("B1A-H17 timing injected into the computation identity", () => {
  assert.ok(issuesOf(withDerivative(forged(d => { d.computedAt = DAY3; }))).length > 0, "no time field exists to carry it");
  // An attacker binds a clock reading into the computation identity and re-identifies the record around it.
  const chain = canonicalChain(), body = clone(chain.derivation), source = sourceOf(body);
  delete body.derivationId;
  body.computationId = contentId(ingest.CANONICAL_COMPUTATION_IDENTITY, { source: { assetId: source.assetId, contentHash: source.contentHash, sizeBytes: source.sizeBytes },
    recipe: body.recipe, toolchain: body.toolchain, computedAt: DAY3 });
  const timed = identify(ingest.CANONICAL_DERIVATION_IDENTITY, "derivationId", body);
  refusedBy(withDerivative(derivative("clip_a_canonical", "clip_a", { authorization: repointed(chain.authorization, timed), derivation: timed })), "identity");
});
test("B1A-H18 a forged owner_supplied derivative", () => {
  const chain = canonicalChain();
  refusedBy(withDerivative(derivative("clip_a_canonical", "clip_a", { authorization: { ...clone(chain.authorization), sourceType: "owner_supplied" }, derivation: chain.derivation })),
    "system_canonicalized");
});
test("B1A-H19 the root's deletion and expiry cannot be bypassed", () => {
  assert.notEqual(effective(S(DAY1, null), S(null, null)).deletionRequestedAt, null, "a deleted root takes its derivative with it");
  assert.equal(effective(S(null, DAY1), S(null, DAY3)).expiresAt, DAY1, "a later derivative expiry never extends the root's");
  assert.equal(code(() => effective(undefined, S(null, null))), "lifecycle_observation_invalid", "a derivative's state is never computed without its root's");
  refusedBy(withDerivative(derivative("clip_a_canonical", "clip_missing", canonicalChain())), "declared root source");
  const result = effective(S(null, DAY2), S(null, null)); result.expiresAt = null;
  assert.equal(effective(S(null, DAY2), S(null, null)).expiresAt, DAY2, "no state is shared between calls");
});
