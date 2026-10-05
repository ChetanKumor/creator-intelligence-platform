// Gate 7 Batch 3E-B1B: the owner-media registry over declared canonical derivatives (B1B-L01..L10), the derived lifecycle observation
// (B1B-O01, O02), the authority's descriptor (B1B-D01) and the permit binder's provenance rule (B1B-P01..P06). No process, media, model or
// network. Registry fixtures are OPAQUE TEST BYTES declared owner_supplied or system_canonicalized only to exercise the registry's own
// checks; their canonical store entries are written exactly as the media-ingest adapter publishes them, from LABEL digests. Chains are the
// STRUCTURAL creator_upload fixture of tests/support/owner-media-canonical.ts, never real footage or a real canonical FootageAnalysis.
import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { mkdir, mkdtemp, realpath, rename, rm, symlink, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { identify } from "../packages/editorial/common.js";
import { EDIT_RENDER_ERROR_CODES, EditRenderError, ExecutablePermitBindingSchema, FixtureLifecycleObservationSchema, OWNER_MEDIA_AUTHORITY, OWNER_MEDIA_AUTHORITY_DIGEST,
  OWNER_MEDIA_LIFECYCLE_AUTHORITY, OwnerMediaLifecycleObservationSchema, evaluateRealExecutionEvidence, ownerMediaDeclarations } from "../packages/edit-render/index.js";
import * as ownerMedia from "../packages/edit-render/owner-media.js";
import { EditRuntimeError } from "../packages/edit-runtime/index.js";
import * as ingest from "../packages/media-ingest/index.js";
import { createOwnerMediaLifecycleAuthority, type OwnerMediaLifecycleAuthority } from "../scripts/edit-render-owner-media-authority-local.js";
import { deterministicBytes, sha256Hex } from "./support/edit-runtime.js";
import { ORIGINAL_PROVENANCE, claimStructural, derivedProvenanceOf, derivedStructuralChain, evidenceAt, ownerRecordFor, plantCanonical, registration02, rootOf, sha,
  storeOf, structuralChain, structuralDerivation, structuralRegistry, v1Of, type DerivedStructuralChain, type Json, type StructuralChain } from "./support/owner-media-canonical.js";

// ---------------------------------------------------------------- helpers
async function refusal(run: () => unknown): Promise<string> {
  try { await run(); } catch (error) {
    if (error instanceof EditRenderError) { assert.ok((EDIT_RENDER_ERROR_CODES as readonly string[]).includes(error.code), error.code); return error.code; }
    if (error instanceof EditRuntimeError) return `runtime:${error.code}`;
    assert.fail(`expected an owned refusal, received ${String(error)}`);
  }
  assert.fail("expected an owned refusal");
}
const CLOCK = Object.freeze({ now: () => "2026-09-29T12:00:00.000Z" });
const clone = <T>(value: T): T => structuredClone(value);
async function scratch(t: TestContext): Promise<string> {
  const directory = await realpath(await mkdtemp(join(tmpdir(), "gate7-b1b-owner-")));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}
type Create = (input: Record<string, unknown>) => Promise<OwnerMediaLifecycleAuthority>;
const create = createOwnerMediaLifecycleAuthority as unknown as Create;
/** Root A (an owner file) and its declared canonical derivative B (opaque bytes planted in the store exactly as the adapter publishes them). */
async function canonicalSetup(t: TestContext, o: { rootPatch?: Json } = {}) {
  const dir = await scratch(t), base = join(dir, "owner"), workspace = join(dir, "workspace");
  await mkdir(base); await mkdir(workspace);
  const rootBytes = deterministicBytes("b1b-root-a", 4099), derivedBytes = deterministicBytes("b1b-canonical-b", 4111);
  await writeFile(join(base, "clip_a.mp4"), rootBytes);
  const root = rootOf(rootBytes, o.rootPatch ?? {}), chain = structuralDerivation(root, derivedBytes), planted = await plantCanonical(workspace, chain.derivation, derivedBytes);
  const derivative = { entryId: "clip_a_canonical", rootEntryId: "clip_a", ...chain };
  const registration = registration02({ originals: [{ entryId: "clip_a", path: "clip_a.mp4", authorization: root }], derivatives: [derivative] });
  return { dir, base, workspace, rootBytes, derivedBytes, root, ...chain, derivative, planted, registration, rootId: `asset_${sha256Hex(rootBytes)}`,
    derivedId: `asset_${sha256Hex(derivedBytes)}` };
}
const make = (s: { registration: Json; base: string; workspace?: string }, clock: { now(): string } = CLOCK) =>
  create({ registration: s.registration, baseDirectory: s.base, clock, ...(s.workspace === undefined ? {} : { canonicalWorkspace: s.workspace }) });
const registrationV1 = (assets: { entryId: string; path: string; authorization: Json }[]): Json => ({ artifactType: "OwnerMediaRegistration", artifactVersion: "0.1.0",
  stability: "internal_pre_stable", footage: { manifestType: "AuthorizedFootageSet", schemaVersion: "1.0.0", creatorId: "creator_footage_test", projectId: "project_footage_test",
    assets }, renderAuthorization: { statement: ownerMedia.OWNER_RENDER_AUTHORIZATION_STATEMENT, owner: { kind: "owner", actorId: "owner_b1b_test" }, renderIntents: ["final"],
    authorizedAt: "2026-09-29T00:00:00.000Z", expiresAt: null } });

// ================================================================ the original paths
test("B1B-L01 the 0.1.0 original registration remains accepted exactly as before", async t => {
  const dir = await scratch(t), a = deterministicBytes("b1b-l01-a", 4099), b = deterministicBytes("b1b-l01-b", 5003);
  await writeFile(join(dir, "clip_a.mp4"), a); await writeFile(join(dir, "clip_b.mp4"), b);
  const registration = registrationV1([{ entryId: "clip_a", path: "clip_a.mp4", authorization: v1Of(a) }, { entryId: "clip_b", path: "clip_b.mp4", authorization: v1Of(b) }]);
  const authority = await create({ registration, baseDirectory: dir, clock: CLOCK });
  assert.equal(authority.registrationDigest, ownerMediaDeclarations(registration).registrationDigest);
  assert.deepEqual(authority.declared.map(d => d.assetId).sort(), [`asset_${sha256Hex(a)}`, `asset_${sha256Hex(b)}`].sort());
  for (const d of authority.declared) assert.deepEqual(await authority.verify(d.assetId), { ...d, checkedAt: CLOCK.now() });
  assert.equal(authority.renderAuthorization.statement, ownerMedia.OWNER_RENDER_AUTHORIZATION_STATEMENT);
  // The 0.1.0 path still reads only AuthorizedFootage 1.0.0, exactly as before 1.1.0 existed.
  assert.equal(await refusal(() => create({ registration: registrationV1([{ entryId: "clip_a", path: "clip_a.mp4", authorization: rootOf(a) }]), baseDirectory: dir, clock: CLOCK })),
    "lifecycle_authority_scope_invalid");
});

test("B1B-L02 a 0.2.0 original-only registration works, with 1.0.0 and consenting 1.1.0 originals and no store", async t => {
  const dir = await scratch(t), a = deterministicBytes("b1b-l02-a", 4099), b = deterministicBytes("b1b-l02-b", 5003);
  await writeFile(join(dir, "clip_a.mp4"), a); await writeFile(join(dir, "clip_b.mp4"), b);
  for (const statement of [ownerMedia.OWNER_RENDER_AUTHORIZATION_STATEMENT, ownerMedia.OWNER_CANONICAL_RENDER_AUTHORIZATION_STATEMENT]) {
    const registration = registration02({ originals: [{ entryId: "clip_a", path: "clip_a.mp4", authorization: v1Of(a) }, { entryId: "clip_b", path: "clip_b.mp4", authorization: rootOf(b) }],
      statement });
    const authority = await make({ registration, base: dir });
    assert.equal(authority.registrationDigest, ownerMedia.ownerMediaCanonicalDeclarations(registration).registrationDigest);
    assert.deepEqual(authority.declared.map(d => d.assetId).sort(), [`asset_${sha256Hex(a)}`, `asset_${sha256Hex(b)}`].sort());
    for (const d of authority.declared) { assert.equal((await authority.verify(d.assetId)).contentHash, d.contentHash); authority.assertCurrent(d.assetId, CLOCK.now()); }
  }
});

// ================================================================ derivatives: order, location, bytes, lineage
test("B1B-L03 a derivative registers only after its root is verified, and only beside a declared root", async t => {
  const s = await canonicalSetup(t);
  const authority = await make(s);
  assert.deepEqual(authority.declared.map(d => d.assetId).sort(), [s.rootId, s.derivedId].sort(), "root and derivative both registered");
  // The root is verified first: a wrong root refuses as the root, even when the derivative's store entry is also missing.
  await writeFile(join(s.base, "clip_a.mp4"), deterministicBytes("b1b-other-root", 4099));
  await unlink(s.planted.objectPath);
  assert.equal(await refusal(() => make(s)), "lifecycle_authority_unknown_asset");
  const t2 = await canonicalSetup(t);
  const orphan = registration02({ originals: [{ entryId: "clip_a", path: "clip_a.mp4", authorization: t2.root }],
    derivatives: [{ ...t2.derivative, rootEntryId: "clip_missing" }] });
  assert.equal(await refusal(() => make({ ...t2, registration: orphan })), "lifecycle_authority_scope_invalid", "no declared root");
  assert.equal(await refusal(() => make({ registration: t2.registration, base: t2.base })), "lifecycle_authority_scope_invalid", "a derivative needs the canonical store");
});

test("B1B-L04 a derivative exists only at its content-addressed location in the canonical store", async t => {
  const s = await canonicalSetup(t);
  await make(s);
  // (a) the bytes beside the root, not in the store
  await writeFile(join(s.base, "clip_a_canonical.mp4"), s.derivedBytes);
  await unlink(s.planted.objectPath);
  assert.equal(await refusal(() => make(s)), "lifecycle_authority_scope_invalid");
  await writeFile(s.planted.objectPath, s.derivedBytes);
  // (b) the object without the computation record that names it
  await unlink(s.planted.recordPath);
  assert.equal(await refusal(() => make(s)), "lifecycle_authority_scope_invalid");
  await writeFile(s.planted.recordPath, s.planted.recordBytes);
  await make(s);
  // (c) a directory at the object's name
  await unlink(s.planted.objectPath); await mkdir(s.planted.objectPath);
  assert.equal(await refusal(() => make(s)), "lifecycle_authority_scope_invalid");
  await rm(s.planted.objectPath, { recursive: true }); await writeFile(s.planted.objectPath, s.derivedBytes);
  // (d) the objects namespace replaced by a junction to a directory holding the very same bytes
  const elsewhere = join(s.dir, "elsewhere"), objects = storeOf(s.workspace, ownerMedia.CANONICAL_STORE.objects);
  await rename(objects, elsewhere); await symlink(elsewhere, objects, "junction");
  assert.equal(await refusal(() => make(s)), "lifecycle_authority_scope_invalid");
  await unlink(objects); await rename(elsewhere, objects);
  await make(s);
  // (e) a canonical workspace that is not an explicit local directory
  for (const workspace of ["relative/workspace", "https://example.com/workspace", "\\\\server\\share", join(s.dir, "absent"), `${s.workspace}\\..\\workspace`]) {
    assert.equal(await refusal(() => make({ ...s, workspace })), "lifecycle_authority_scope_invalid", workspace);
  }
  // (f) a location is never part of a derivative's declaration
  const located = registration02({ originals: [{ entryId: "clip_a", path: "clip_a.mp4", authorization: s.root }], derivatives: [{ ...s.derivative, path: "clip_a_canonical.mp4" } as never] });
  assert.equal(await refusal(() => make({ ...s, registration: located })), "lifecycle_authority_scope_invalid");
});

test("B1B-L05 a derivative's bytes are re-hashed in full at registration, verification and observation", async t => {
  const s = await canonicalSetup(t), changed = Uint8Array.from(s.derivedBytes); changed[100] = (changed[100]! + 1) % 256;
  await writeFile(s.planted.objectPath, changed);
  assert.equal(await refusal(() => make(s)), "lifecycle_authority_unknown_asset", "changed before registration");
  await writeFile(s.planted.objectPath, s.derivedBytes);
  const authority = await make(s);
  assert.equal((await authority.verify(s.derivedId)).contentHash, sha256Hex(s.derivedBytes));
  await writeFile(s.planted.objectPath, changed);
  assert.equal(await refusal(() => authority.verify(s.derivedId)), "lifecycle_authority_unknown_asset", "changed after registration");
  await writeFile(`${s.planted.objectPath}.new`, s.derivedBytes); await unlink(s.planted.objectPath); await rename(`${s.planted.objectPath}.new`, s.planted.objectPath);
  assert.equal(await refusal(() => authority.verify(s.derivedId)), "lifecycle_authority_unknown_asset", "identical bytes in another file object");
});

// ================================================================ the derived lifecycle: B never outlives A
test("B1B-L06 a deletion request on the root makes the derivative unavailable at once", async t => {
  const s = await canonicalSetup(t), authority = await make(s);
  authority.assertCurrent(s.derivedId, CLOCK.now());
  authority.requestDeletion(s.rootId);
  assert.equal(await refusal(() => authority.assertCurrent(s.derivedId, CLOCK.now())), "lifecycle_deleted");
  assert.equal(await refusal(() => authority.assertCurrent(s.rootId, CLOCK.now())), "lifecycle_deleted");
});

test("B1B-L07 a deletion request on the derivative makes it unavailable and leaves its root current", async t => {
  const s = await canonicalSetup(t), authority = await make(s);
  authority.requestDeletion(s.derivedId);
  assert.equal(await refusal(() => authority.assertCurrent(s.derivedId, CLOCK.now())), "lifecycle_deleted");
  authority.assertCurrent(s.rootId, CLOCK.now());
});

test("B1B-L08 the earlier expiry governs, whichever is earlier, and the owner's render window bounds both", async t => {
  const s = await canonicalSetup(t), authority = await make(s);
  authority.setExpiry(s.derivedId, "2026-09-29T20:00:00.000Z");
  authority.setExpiry(s.rootId, "2026-09-29T14:00:00.000Z");
  authority.assertCurrent(s.derivedId, "2026-09-29T13:59:59.999Z");
  assert.equal(await refusal(() => authority.assertCurrent(s.derivedId, "2026-09-29T14:00:00.000Z")), "lifecycle_expired", "the root's earlier expiry");
  const u = await canonicalSetup(t), other = await make(u);
  other.setExpiry(u.rootId, "2026-09-29T20:00:00.000Z");
  other.setExpiry(u.derivedId, "2026-09-29T14:00:00.000Z");
  assert.equal(await refusal(() => other.assertCurrent(u.derivedId, "2026-09-29T14:00:00.000Z")), "lifecycle_expired", "the derivative's own earlier expiry");
  other.assertCurrent(u.rootId, "2026-09-29T14:00:00.000Z");
  const w = await canonicalSetup(t), ended = await make({ ...w, registration: { ...w.registration, renderAuthorization: { ...(w.registration.renderAuthorization as Json),
    expiresAt: "2026-09-29T06:00:00.000Z" } } });
  assert.equal(await refusal(() => ended.assertCurrent(w.derivedId, CLOCK.now())), "lifecycle_expired");
});

test("B1B-L09 a forged derivation lineage refuses, however its identities are recomputed", async t => {
  const s = await canonicalSetup(t);
  await make(s);
  // (a) the same derivation with fabricated verification digests: every identity recomputes, but no verified computation names it
  const forged = structuralDerivation(s.root, s.derivedBytes, "fabricated");
  assert.notEqual(forged.derivation.derivationId, s.derivation.derivationId);
  assert.equal(await refusal(() => make({ ...s, registration: registration02({ originals: [{ entryId: "clip_a", path: "clip_a.mp4", authorization: s.root }],
    derivatives: [{ entryId: "clip_a_canonical", rootEntryId: "clip_a", ...forged }] }) })), "lifecycle_authority_scope_invalid");
  // (b) the derivative's lineage repointed at another derivation, or its root replaced by another consenting root
  const repointed = { ...clone(s.authorization), derivedFrom: { ...(s.authorization.derivedFrom as Json), derivationId: forged.derivation.derivationId } };
  assert.equal(await refusal(() => make({ ...s, registration: registration02({ originals: [{ entryId: "clip_a", path: "clip_a.mp4", authorization: s.root }],
    derivatives: [{ ...s.derivative, authorization: repointed }] }) })), "lifecycle_authority_scope_invalid");
  const otherRoot = rootOf(s.rootBytes, { authorizationBasis: "permission_granted" });
  assert.equal(await refusal(() => make({ ...s, registration: registration02({ originals: [{ entryId: "clip_a", path: "clip_a.mp4", authorization: otherRoot }],
    derivatives: [s.derivative] }) })), "lifecycle_authority_scope_invalid");
  // (d) another project's derivation of the very same bytes: one computation, one scope-free record, but never this project's derivative
  const elsewhere = structuralDerivation(rootOf(s.rootBytes, { creatorId: "creator_other", projectId: "project_other" }), s.derivedBytes);
  assert.equal(ownerMedia.canonicalComputationRecordOf(elsewhere.derivation).bytes, s.planted.recordBytes, "cache identity is shared across projects");
  assert.equal(await refusal(() => make({ ...s, registration: registration02({ originals: [{ entryId: "clip_a", path: "clip_a.mp4", authorization: s.root }],
    derivatives: [{ entryId: "clip_a_canonical", rootEntryId: "clip_a", ...elsewhere }] }) })), "lifecycle_authority_scope_invalid", "authorization identity is not");
  // (c) another computation's record copied under this computation's name
  const other = structuralDerivation(rootOf(deterministicBytes("b1b-root-other", 999)), deterministicBytes("b1b-canonical-other", 777), "other");
  await writeFile(s.planted.recordPath, ownerMedia.canonicalComputationRecordOf(other.derivation).bytes);
  assert.equal(await refusal(() => make(s)), "lifecycle_authority_scope_invalid");
});

test("B1B-L10 forged owner-supplied canonical bytes refuse as a derivative", async t => {
  const s = await canonicalSetup(t);
  await make(s);
  const relabelled = { ...clone(s.authorization), sourceType: "owner_supplied" };
  assert.equal(await refusal(() => make({ ...s, registration: registration02({ originals: [{ entryId: "clip_a", path: "clip_a.mp4", authorization: s.root }],
    derivatives: [{ ...s.derivative, authorization: relabelled }] }) })), "lifecycle_authority_scope_invalid");
  const attested = v1Of(s.derivedBytes);
  assert.equal(await refusal(() => make({ ...s, registration: registration02({ originals: [{ entryId: "clip_a", path: "clip_a.mp4", authorization: s.root }],
    derivatives: [{ ...s.derivative, authorization: attested }] }) })), "lifecycle_authority_scope_invalid");
});

// ================================================================ the derived observation, through the registry's own query
let derived: Promise<DerivedStructuralChain> | undefined, original: Promise<StructuralChain> | undefined;
/** alpha: a declared canonical derivative of an opaque root; beta: a consenting 1.1.0 original. Built once. */
const derivedChain = () => (derived ??= derivedStructuralChain());
/** alpha and beta: AuthorizedFootage 1.0.0 originals. Built once. */
const originalChain = () => (original ??= structuralChain(contents => ({ alpha: v1Of(contents.alpha), beta: v1Of(contents.beta) })));
const registryFor = async (t: TestContext, chain: DerivedStructuralChain) => structuralRegistry(await scratch(t), chain);

test("B1B-O01 a derived observation records its root, derivation, recipe and inherited basis, and is never presented as owner-supplied", async t => {
  const chain = await derivedChain(), c = await claimStructural(t, chain), r = await registryFor(t, chain);
  const authority = await create({ registration: r.registration, baseDirectory: r.base, clock: c.env.runtime.clock, canonicalWorkspace: r.workspace });
  const stagedAlpha = c.staged.find(s => s.source.assetId === chain.assetOf.alpha)!, stagedBeta = c.staged.find(s => s.source.assetId === chain.assetOf.beta)!;
  const alpha = await authority.observe(c.call, stagedAlpha), beta = await authority.observe(c.call, stagedBeta);
  const d = chain.alpha;
  assert.deepEqual(alpha.record.provenance, { mediaOrigin: "creator_upload", sourceType: "system_canonicalized", authorizationBasis: "owner_created",
    root: { assetId: r.rootId, contentHash: r.rootId.slice(6), sizeBytes: 4099 }, derivationId: d.derivation.derivationId, recipeId: ingest.N1_RECIPE.recipeId });
  assert.deepEqual(beta.record.provenance, ORIGINAL_PROVENANCE, "an original's observation keeps its exact accepted provenance");
  assert.equal(alpha.record.declaration.contentHash, sha256Hex(chain.contents.alpha));
  assert.equal(alpha.record.declaration.verification, "full_byte_sha256_through_one_held_handle_during_this_check_v0");
  assert.ok(OwnerMediaLifecycleObservationSchema.safeParse(alpha.record).success && alpha.proves(alpha.record));
  // Root lifecycle is current at query time: the root's deletion reaches an observation already taken, and every later observation.
  alpha.reconfirm(c.env.runtime.clock.now());
  authority.requestDeletion(r.rootId);
  assert.equal(await refusal(() => alpha.reconfirm(c.env.runtime.clock.now())), "lifecycle_deleted");
  beta.reconfirm(c.env.runtime.clock.now());
  const after = await authority.observe(c.call, stagedAlpha);
  assert.equal(after.record.lifecycle.deletionRequestedAt, c.env.runtime.clock.now(), "the observed state is the effective one, from the root");
});

test("B1B-O02 a derivative's observation refuses an admitted record that claims other provenance or another lineage", async t => {
  // The registry declares alpha as a derivative, but the admitted analysis attests alpha's bytes as owner_supplied originals.
  const original = await originalChain(), c = await claimStructural(t, original), derived = await derivedChain(), r = await registryFor(t, derived);
  const authority = await create({ registration: r.registration, baseDirectory: r.base, clock: c.env.runtime.clock, canonicalWorkspace: r.workspace });
  assert.equal(await refusal(() => authority.observe(c.call, c.staged.find(s => s.source.assetId === original.assetOf.alpha)!)), "lifecycle_authority_scope_invalid");
  // The admitted analysis names alpha as a derivative of another root than the one the owner declared.
  const foreign = await structuralChain(contents => ({ alpha: structuralDerivation(rootOf(deterministicBytes("b1b-foreign-root", 4099)), contents.alpha, "foreign").authorization,
    beta: rootOf(contents.beta) }));
  const f = await claimStructural(t, foreign);
  const second = await create({ registration: r.registration, baseDirectory: r.base, clock: f.env.runtime.clock, canonicalWorkspace: r.workspace });
  assert.equal(await refusal(() => second.observe(f.call, f.staged.find(s => s.source.assetId === foreign.assetOf.alpha)!)), "lifecycle_authority_scope_invalid");
});

// ================================================================ the authority's descriptor
test("B1B-D01 the owner-media authority states originals, verified canonical derivatives and their lineage lifecycle; the binding literal is unchanged", () => {
  assert.equal(OWNER_MEDIA_AUTHORITY_DIGEST, "0cd89b68e42aca92acdfba826dff4c1dfe471134506712f20188343cec0a2f37", "was e154b615… before 3E-B1B");
  const d = OWNER_MEDIA_AUTHORITY.descriptor as Record<string, string>;
  assert.equal(d.registration, "explicit_owner_declared_path_exact_sha256_and_size_one_held_handle_v0", "originals keep their accepted registration");
  assert.match(d.derivatives ?? "", /declared_verified_canonical_derivatives_by_content_identity/);
  assert.match(d.lineage ?? "", /never_outlives_root/);
  assert.equal(d.query, "trusted_runtime_clock_check_window_full_byte_reverification_at_observation");
  assert.equal(OWNER_MEDIA_LIFECYCLE_AUTHORITY, "owner_local_media_manifest_registry_not_production_v0");
  const binding = ExecutablePermitBindingSchema.shape.lifecycleAuthority;
  assert.deepEqual(binding.options, ["synthetic_fixture_registry_only_not_production_v0", "owner_local_media_manifest_registry_not_production_v0"]);
  assert.equal(FixtureLifecycleObservationSchema.shape.authorityScope.value, "synthetic_fixture_assets_only_v0");
  // The observation carries exactly two provenance variants; the original record itself never widens.
  const provenance = OwnerMediaLifecycleObservationSchema.shape.provenance as unknown as { safeParse(v: unknown): { success: boolean } };
  const derived = { mediaOrigin: "creator_upload", sourceType: "system_canonicalized", authorizationBasis: "owner_created", root: { assetId: `asset_${"a".repeat(64)}`,
    contentHash: "a".repeat(64), sizeBytes: 1 }, derivationId: `canonical_media_derivation_v0_${"d".repeat(64)}`, recipeId: ingest.N1_RECIPE.recipeId };
  assert.equal(provenance.safeParse(ORIGINAL_PROVENANCE).success, true);
  assert.equal(provenance.safeParse(derived).success, true);
  assert.equal(provenance.safeParse({ ...derived, sourceType: "owner_supplied" }).success, false);
  assert.equal(provenance.safeParse({ ...ORIGINAL_PROVENANCE, sourceType: "synthetic" }).success, false);
  assert.equal(ownerMedia.OwnerMediaProvenanceSchema.safeParse(derived).success, false);
});

// ================================================================ the permit binder re-derives provenance from the admitted records
type Evidence = ReturnType<typeof evidenceAt>;
const bind = (c: Awaited<ReturnType<typeof claimStructural>>, e: Evidence, lifecycle: unknown[]) => evaluateRealExecutionEvidence(c.call, { ...e, lifecycle } as never);

test("B1B-P01 the permit accepts matching original provenance exactly as before, and nothing else for an original", async t => {
  const chain = await originalChain(), c = await claimStructural(t, chain), e = evidenceAt(c);
  const binding = await bind(c, e, c.staged.map(s => ownerRecordFor(c, s, ORIGINAL_PROVENANCE)));
  assert.equal(binding.lifecycleAuthority, OWNER_MEDIA_LIFECYCLE_AUTHORITY);
  assert.deepEqual(binding.sources.map(s => s.assetId).sort(), [chain.assetOf.alpha, chain.assetOf.beta].sort());
  const fake = { mediaOrigin: "creator_upload", sourceType: "system_canonicalized", authorizationBasis: "owner_created", root: { assetId: `asset_${"a".repeat(64)}`,
    contentHash: "a".repeat(64), sizeBytes: 1 }, derivationId: `canonical_media_derivation_v0_${"d".repeat(64)}`, recipeId: ingest.N1_RECIPE.recipeId };
  assert.equal(await refusal(() => bind(c, e, c.staged.map((s, i) => ownerRecordFor(c, s, i === 0 ? fake : ORIGINAL_PROVENANCE)))), "lifecycle_authority_scope_invalid",
    "an original is never observed as derived");
  assert.equal(await refusal(() => bind(c, e, c.staged.map(s => ownerRecordFor(c, s, { ...ORIGINAL_PROVENANCE, authorizationBasis: "permission_granted" })))),
    "lifecycle_authority_scope_invalid");
});

/** The derived chain's matching records, and a binder over them with one source's provenance replaced. */
async function derivedBinding(t: TestContext) {
  const chain = await derivedChain(), c = await claimStructural(t, chain), e = evidenceAt(c), d = chain.alpha;
  const matching = derivedProvenanceOf(d.authorization);
  const records = (alpha: unknown) => c.staged.map(s => ownerRecordFor(c, s, s.source.assetId === chain.assetOf.alpha ? alpha : ORIGINAL_PROVENANCE));
  return { chain, c, e, matching, records };
}

test("B1B-P02 the permit accepts matching derived provenance beside a matching original", async t => {
  const { c, e, matching, records } = await derivedBinding(t);
  const binding = await bind(c, e, records(matching));
  assert.equal(binding.lifecycleAuthority, OWNER_MEDIA_LIFECYCLE_AUTHORITY);
  assert.equal(binding.sources.length, 2);
});

test("B1B-P03 a derived observation naming another root refuses", async t => {
  const { chain, c, e, matching, records } = await derivedBinding(t);
  await bind(c, e, records(matching));
  const otherRoot = sha("b1b-other-root");
  assert.equal(await refusal(() => bind(c, e, records({ ...matching, root: { assetId: `asset_${otherRoot}`, contentHash: otherRoot, sizeBytes: 4099 } }))),
    "lifecycle_authority_scope_invalid");
  assert.equal(await refusal(() => bind(c, e, records({ ...matching, root: { ...(matching.root as Json), sizeBytes: 4100 } }))), "lifecycle_authority_scope_invalid");
  // A derivative is never its own root: such a record cannot even be built.
  const own = sha256Hex(chain.contents.alpha);
  assert.equal(await refusal(() => bind(c, e, records({ ...matching, root: { assetId: `asset_${own}`, contentHash: own, sizeBytes: chain.contents.alpha.length } }))),
    "lifecycle_observation_invalid");
});

test("B1B-P04 a derived observation naming another derivation refuses", async t => {
  const { c, e, matching, records } = await derivedBinding(t);
  await bind(c, e, records(matching));
  assert.equal(await refusal(() => bind(c, e, records({ ...matching, derivationId: `canonical_media_derivation_v0_${"0".repeat(64)}` }))), "lifecycle_authority_scope_invalid");
});

test("B1B-P05 a derived observation naming another recipe refuses", async t => {
  const { c, e, matching, records } = await derivedBinding(t);
  await bind(c, e, records(matching));
  assert.equal(await refusal(() => bind(c, e, records({ ...matching, recipeId: "canonical_n2_reencode" }))), "lifecycle_authority_scope_invalid");
});

test("B1B-P06 a derived observation with another rights basis, or presented as owner-supplied, refuses", async t => {
  const { c, e, matching, records } = await derivedBinding(t);
  await bind(c, e, records(matching));
  assert.equal(await refusal(() => bind(c, e, records({ ...matching, authorizationBasis: "permission_granted" }))), "lifecycle_authority_scope_invalid");
  assert.equal(await refusal(() => bind(c, e, records(ORIGINAL_PROVENANCE))), "lifecycle_authority_scope_invalid", "a derivative is never observed as owner-supplied");
  // A forged record whose identity is recomputed changes nothing: the binder re-derives provenance from the admitted records.
  const tampered = records(matching).map(r => {
    if ((r.provenance as { sourceType: string }).sourceType !== "system_canonicalized") return r;
    const copy = clone(r) as unknown as Record<string, unknown>; delete copy.observationId; (copy.provenance as Json).derivationId = `canonical_media_derivation_v0_${"1".repeat(64)}`;
    return identify("owner_media_lifecycle_observation_v0", "observationId", copy);
  });
  assert.equal(await refusal(() => bind(c, e, tampered)), "lifecycle_authority_scope_invalid");
});
