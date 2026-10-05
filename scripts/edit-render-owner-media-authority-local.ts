/**
 * Gate 7 Batch 3D: the owner-local real-media lifecycle authority. It is the lifecycle authority for real media the owner explicitly
 * declares for one local run, and for nothing else. It mirrors the accepted synthetic-fixture authority, which stays unchanged and
 * still answers only for synthetic fixtures.
 *
 * - Registration: only files the owner named in an OwnerMediaRegistration, whose AuthorizedFootageSet is the same set the accepted Phase-2
 *   analyzer consumed. A path is relative to that set's own directory, by the analyzer's rule, and a link anywhere in it refuses. Each file
 *   is registered by the SHA-256 of the bytes read through one held handle, never by a caller-supplied identity. An absolute path, URL,
 *   share, pattern, traversal, link, directory, empty file, mismatch or duplicate refuses. No directory is ever listed and no pattern expanded.
 * - State: the current deletion and expiry of each registered source, in memory. Expiry starts at the owner's render-authorization
 *   expiry.
 * - Query: a post-claim, post-stage query on the trusted runtime clock that re-verifies the declared bytes in full during the check.
 *   It answers only for an admitted `creator_upload` / `owner_supplied` source whose registered bytes and authorization are exactly
 *   the admitted ones, so it never answers for synthetic media. Its handle can query the registry again at permit issuance and
 *   execution start.
 *
 * Gate 7 Batch 3E-B1B: an OwnerMediaRegistration 0.2.0 may also declare verified canonical derivatives (a 0.1.0 registration reads
 * exactly as before). Every declared original is registered and verified first. Only then is each derivative considered: it must name a
 * registered root, it is read only from its content address in the private canonical store (`<canonical workspace>/.local-media/canonical-v0/`;
 * a derivative never names a location), its bytes are re-hashed in full through one held handle and must be its derivation's output, its
 * derivation and derived authorization are revalidated, and the store's computation record must name exactly that derivation's verified
 * computation. A derivative's lifecycle is computed from its root's current state and its own at every query, so it never outlives its
 * root; its observation records derived provenance (root identity, derivation, recipe, inherited basis), never owner-supplied provenance.
 *
 * It starts no process and reaches no network. It is a local owner registry for verification runs, not a production user-media
 * lifecycle service.
 */
import { createHash, randomBytes } from "node:crypto";
import { lstat, open, realpath } from "node:fs/promises";
import { dirname, isAbsolute, join, parse, relative, resolve, sep } from "node:path";
import { canonicalSerialize } from "../packages/domain/serialization.js";
import { equal } from "../packages/editorial/common.js";
import { EditRenderError, buildOwnerMediaLifecycleObservation, checkOwnerMediaProvenance, ownerMediaDeclarations, ownerMediaRelativeSegments, sessionProofOf, stagedFor,
  type EditRenderErrorCode,
  type OwnerMediaDeclaration, type OwnerMediaLifecycleObservation, type OwnerRenderAuthorization } from "../packages/edit-render/index.js";
import { CANONICAL_STORE, OwnerMediaCanonicalRegistrationSchema, canonicalComputationRecordOf, canonicalObjectName, effectiveDerivedLifecycle, ownerMediaCanonicalDeclarations,
  ownerMediaProvenanceKindOf, type OwnerCanonicalRenderAuthorization, type OwnerMediaObservedProvenance } from "../packages/edit-render/owner-media.js";
import { MAX_STAGED_SOURCE_BYTES } from "../packages/edit-runtime/common.js";
import type { RuntimeCall, RuntimeClock } from "../packages/edit-runtime/index.js";
import { requireCall } from "../packages/edit-runtime/call.js";
import { runtimeNow, verifyClaim } from "../packages/edit-runtime/ledger.js";
import { FootageAuthorizationDerivedSchema } from "../packages/footage-analyzer/protocol.js";
import { CanonicalMediaDerivationSchema } from "../packages/media-ingest/index.js";

const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/, MAX_LOCATION_LENGTH = 1024, WINDOWS = sep === "\\";
function fail(code: EditRenderErrorCode, message: string): never { throw new EditRenderError(code, message); }
const CONSTRUCTION = Symbol("owner-media-lifecycle-authority"), OBSERVATION = Symbol("trusted-owner-media-lifecycle-observation");

/**
 * The explicit base directory (the footage manifest's own directory), by the accepted runtime's location rules: never a URL, UNC or
 * device path, relative or drive-relative path, traversal segment, pattern or NUL.
 */
function declaredLocation(value: string): string {
  if (value.length === 0 || value.length > MAX_LOCATION_LENGTH || value.includes("\0")) fail("lifecycle_authority_scope_invalid", "A bounded local location is required.");
  if (/^[A-Za-z][A-Za-z0-9+.-]*:\/\//.test(value) || /^file:/i.test(value)) fail("lifecycle_authority_scope_invalid", "A URL is never a declared source.");
  if (value.startsWith("\\\\") || value.startsWith("//")) fail("lifecycle_authority_scope_invalid", "Network, UNC and device-namespace paths are never declared sources.");
  if (WINDOWS ? !/^[A-Za-z]:[\\/]/.test(value) : !value.startsWith("/")) fail("lifecycle_authority_scope_invalid", "Only an absolute local path is declared.");
  if (value.split(/[\\/]+/).includes("..") || /[*?]/.test(value)) fail("lifecycle_authority_scope_invalid", "Traversal segments and patterns are refused.");
  return resolve(value);
}

/**
 * A live, non-serializable proof that one lifecycle observation came from this authority's query. It holds its session token in
 * memory and can query the same authority again for the same asset. The observation is a private snapshot; the getter returns a copy.
 */
export class TrustedOwnerMediaLifecycleObservation {
  readonly #token: string;
  readonly #requery: (now: string) => void;
  readonly #record: OwnerMediaLifecycleObservation;
  constructor(construction: symbol, record: OwnerMediaLifecycleObservation, token: string, requery: (now: string) => void) {
    if (construction !== OBSERVATION) fail("trust_handle_required", "An owner-media lifecycle observation handle is produced only by the owner-local authority's own query.");
    this.#token = token; this.#requery = requery; this.#record = structuredClone(record);
    Object.freeze(this);
  }
  static is(value: unknown): value is TrustedOwnerMediaLifecycleObservation { return typeof value === "object" && value !== null && #token in value; }
  /** A copy of the observation record: data only, never this handle's evidence. */
  get record(): OwnerMediaLifecycleObservation { return structuredClone(this.#record); }
  /** True only for a record equal to this handle's private snapshot and carrying its session proof. */
  proves(record: OwnerMediaLifecycleObservation): boolean {
    return record?.session?.digest === createHash("sha256").update(this.#token).digest("hex") && canonicalSerialize(record) === canonicalSerialize(this.#record);
  }
  /**
   * Queries the authority's current state for this observation's asset at `now`, an instant of the trusted runtime clock: a deletion
   * request, an ended expiry or re-registered bytes refuse. It grants nothing; it can only refuse.
   */
  reconfirm(now: string): void {
    if (typeof now !== "string" || !TIMESTAMP.test(now)) fail("input_invalid", "A lifecycle requery instant is exact UTC milliseconds.");
    this.#requery(now);
  }
  toJSON(): never { fail("trust_handle_required", "A trusted observation handle is never serialized; persist its record instead."); }
}

/** The identity a registered entry was declared with, by either registration version. */
interface DeclaredIdentity { entryId: string; assetId: string; contentHash: string; sizeBytes: number; authorization: unknown }
/** A registered derivative's lineage: its registered root, and the derivation it was declared with. */
interface Lineage { rootAssetId: string; derivationId: string; recipeId: string; derivation: unknown }
interface Entry { declaration: DeclaredIdentity; location: string; dev: bigint; ino: bigint; deletionRequestedAt: string | null; expiresAt: string | null;
  lineage: Lineage | null }
type AnyRenderAuthorization = OwnerRenderAuthorization | OwnerCanonicalRenderAuthorization;
/** The declared-source identity this authority verified, without its location. */
export interface VerifiedOwnerSource { entryId: string; assetId: string; contentHash: string; sizeBytes: number; checkedAt: string }
export class OwnerMediaLifecycleAuthority {
  readonly #clock: RuntimeClock;
  readonly #registry: ReadonlyMap<string, Entry>;
  readonly #registrationDigest: string;
  readonly #renderAuthorization: AnyRenderAuthorization;
  readonly #scope: { projectId: string; creatorId: string };
  readonly #version: "0.1.0" | "0.2.0";
  constructor(construction: symbol, clock: RuntimeClock, registry: Map<string, Entry>, registrationDigest: string, renderAuthorization: AnyRenderAuthorization,
    scope: { projectId: string; creatorId: string }, version: "0.1.0" | "0.2.0" = "0.1.0") {
    if (construction !== CONSTRUCTION) fail("trust_handle_required", "The owner-local authority is created only by createOwnerMediaLifecycleAuthority.");
    this.#clock = clock; this.#registry = registry; this.#registrationDigest = registrationDigest;
    this.#renderAuthorization = structuredClone(renderAuthorization); this.#scope = { ...scope }; this.#version = version;
    Object.freeze(this);
  }
  static is(value: unknown): value is OwnerMediaLifecycleAuthority { return typeof value === "object" && value !== null && #registry in value; }
  /** The digest of what the owner declared, excluding locations. */
  get registrationDigest(): string { return this.#registrationDigest; }
  get renderAuthorization(): AnyRenderAuthorization { return structuredClone(this.#renderAuthorization); }
  get scope(): { projectId: string; creatorId: string } { return { ...this.#scope }; }
  /** The verified declarations, in canonical asset order: identities only, never a location. */
  get declared(): { entryId: string; assetId: string; contentHash: string; sizeBytes: number }[] {
    return [...this.#registry.values()].map(e => ({ entryId: e.declaration.entryId, assetId: e.declaration.assetId, contentHash: e.declaration.contentHash,
      sizeBytes: e.declaration.sizeBytes }));
  }
  /**
   * The execution-only mapping from registered asset to its verified real location. It exists only to configure the accepted runtime's
   * source locator. It is never persisted and never enters an identity.
   */
  get sourceLocations(): { assetId: string; path: string }[] { return [...this.#registry.values()].map(e => ({ assetId: e.declaration.assetId, path: e.location })); }
  #now(): string {
    const now = this.#clock.now();
    if (typeof now !== "string" || !TIMESTAMP.test(now)) fail("input_invalid", "The authority clock must report exact UTC milliseconds.");
    return now;
  }
  #entry(assetId: string): Entry {
    const entry = this.#registry.get(assetId);
    if (entry === undefined) fail("lifecycle_authority_unknown_asset", "The owner-local authority has no declaration of this asset.");
    return entry;
  }
  /** An entry's lifecycle now: its own, or for a derivative the effective one, from its registered root's current state and its own. */
  #state(entry: Entry): { deletionRequestedAt: string | null; expiresAt: string | null } {
    const own = { deletionRequestedAt: entry.deletionRequestedAt, expiresAt: entry.expiresAt };
    if (entry.lineage === null) return own;
    const root = this.#entry(entry.lineage.rootAssetId);
    return effectiveDerivedLifecycle({ deletionRequestedAt: root.deletionRequestedAt, expiresAt: root.expiresAt }, own);
  }
  /** Re-verifies one registered source's full bytes now, through one held handle of the registered file. */
  async verify(assetId: string): Promise<VerifiedOwnerSource> {
    const entry = this.#entry(assetId);
    await verifyBytes(entry.location, entry.declaration, { dev: entry.dev, ino: entry.ino });
    const d = entry.declaration;
    return { entryId: d.entryId, assetId: d.assetId, contentHash: d.contentHash, sizeBytes: d.sizeBytes, checkedAt: this.#now() };
  }
  /**
   * The current lifecycle of one declared source at `now`, an instant of the trusted runtime clock: unknown, deleted or expired refuses.
   * A derivative is deleted or expired whenever its root is. It grants nothing; it can only refuse. Every observation handle re-queries
   * through the same rule.
   */
  assertCurrent(assetId: string, now: string): void {
    if (typeof now !== "string" || !TIMESTAMP.test(now)) fail("input_invalid", "A lifecycle query instant is exact UTC milliseconds.");
    const current = this.#state(this.#entry(assetId));
    if (current.deletionRequestedAt !== null) fail("lifecycle_deleted", "Deletion of the source has been requested.");
    if (current.expiresAt !== null && now >= current.expiresAt) fail("lifecycle_expired", "The owner's authorization for the source has ended.");
  }
  /** Records a deletion request now, on the authority's clock. */
  requestDeletion(assetId: string): void { this.#entry(assetId).deletionRequestedAt = this.#now(); }
  /** Records an earlier expiry; the owner's authorization window can only shrink here. */
  setExpiry(assetId: string, expiresAt: string): void {
    if (typeof expiresAt !== "string" || !TIMESTAMP.test(expiresAt)) fail("input_invalid", "Expiry is exact UTC milliseconds.");
    const entry = this.#entry(assetId);
    entry.expiresAt = entry.expiresAt === null || expiresAt < entry.expiresAt ? expiresAt : entry.expiresAt;
  }
  /**
   * A derivative's lineage, revalidated at its observation: the admitted provenance is the derived kind naming exactly its registered
   * root, derivation and recipe, the root is still the registered original whose authorization the lineage carries, and the declared
   * derivation and derived authorization still validate. An original is observed only with original provenance.
   */
  #lineageOf(entry: Entry, provenance: OwnerMediaObservedProvenance): void {
    if (entry.lineage === null) {
      if (provenance.sourceType !== "owner_supplied") fail("lifecycle_authority_scope_invalid", "A declared original is observed only as owner-supplied media.");
      return;
    }
    const lineage = entry.lineage, root = this.#entry(lineage.rootAssetId), derived = FootageAuthorizationDerivedSchema.safeParse(entry.declaration.authorization);
    if (provenance.sourceType !== "system_canonicalized" || !derived.success || !CanonicalMediaDerivationSchema.safeParse(lineage.derivation).success
      || root.lineage !== null || !equal(root.declaration.authorization, derived.data.derivedFrom.rootAuthorization)
      || !equal(provenance.root, { assetId: root.declaration.assetId, contentHash: root.declaration.contentHash, sizeBytes: root.declaration.sizeBytes })
      || provenance.derivationId !== lineage.derivationId || provenance.recipeId !== lineage.recipeId) {
      fail("lifecycle_authority_scope_invalid", "A declared derivative is observed only with exactly its registered lineage.");
    }
  }
  /**
   * The post-claim, post-stage query. Claim ownership and the staged receipt are verified first, and real-media provenance is read
   * from the exact admitted records. The declared bytes are then re-verified in full inside a check window on the trusted runtime clock.
   */
  async observe(call: RuntimeCall, stagedSource: unknown): Promise<TrustedOwnerMediaLifecycleObservation> {
    const { dag, runtime, artifacts, ownership } = requireCall(call);
    const { claim } = await verifyClaim(dag, runtime, ownership);
    const receipt = stagedFor(dag, claim, stagedSource);
    const source = dag.admission.sources.find(s => s.assetId === receipt.source.assetId)!;
    // A 0.1.0 registration reads provenance exactly as before; a 0.2.0 one reads either provenance kind.
    let provenance: OwnerMediaObservedProvenance, authorization: unknown;
    if (this.#version === "0.1.0") ({ provenance, authorization } = checkOwnerMediaProvenance(source, artifacts));
    else ({ provenance, authorization } = ownerMediaProvenanceKindOf(source, artifacts));
    const entry = this.#entry(source.assetId);
    if (entry.declaration.contentHash !== source.contentHash || entry.declaration.sizeBytes !== source.sizeBytes) fail("lifecycle_authority_unknown_asset",
      "The declared bytes are not the admitted bytes.");
    if (!equal(entry.declaration.authorization, authorization)) fail("lifecycle_authority_scope_invalid", "The admitted authorization is not the one the owner declared.");
    if (this.#version === "0.2.0") this.#lineageOf(entry, provenance);
    const checkStartedAt = runtimeNow(runtime);
    await verifyBytes(entry.location, entry.declaration, { dev: entry.dev, ino: entry.ino });
    const verifiedAt = runtimeNow(runtime);
    const state = this.#state(entry);
    const checkCompletedAt = runtimeNow(runtime);
    if (verifiedAt < checkStartedAt || checkCompletedAt < verifiedAt) fail("evidence_chronology_invalid", "The runtime clock ran backwards during the query.");
    const token = randomBytes(32).toString("hex");
    const record = buildOwnerMediaLifecycleObservation({ dag, claim, stagedSource: receipt, provenance, state,
      declaration: { registrationDigest: this.#registrationDigest, entryId: entry.declaration.entryId, contentHash: entry.declaration.contentHash,
        sizeBytes: entry.declaration.sizeBytes, verifiedAt },
      timing: { checkStartedAt, observedAt: checkStartedAt, checkCompletedAt, observedAtBasis: "check_started_lower_bound" }, session: sessionProofOf(token) });
    const { assetId, contentHash, sizeBytes } = source;
    const requery = (now: string) => {
      const current = this.#entry(assetId);
      if (current.declaration.contentHash !== contentHash || current.declaration.sizeBytes !== sizeBytes) fail("lifecycle_authority_unknown_asset",
        "The declared bytes changed since the observation.");
      this.assertCurrent(assetId, now);
    };
    return new TrustedOwnerMediaLifecycleObservation(OBSERVATION, record, token, requery);
  }
}

/** Hashes exactly the regular file lstat found, through one held handle, and refuses any difference from the declaration. */
async function verifyBytes(location: string, declaration: { contentHash: string; sizeBytes: number }, expected: { dev: bigint; ino: bigint } | null):
  Promise<{ dev: bigint; ino: bigint }> {
  let info;
  try { info = await lstat(location, { bigint: true }); } catch { fail("lifecycle_authority_scope_invalid", "A declared source does not exist."); }
  if (info.isSymbolicLink() || !info.isFile() || info.size === 0n) fail("lifecycle_authority_scope_invalid", "Only a non-empty regular file, never a link or directory, is a declared source.");
  if (info.size > BigInt(MAX_STAGED_SOURCE_BYTES)) fail("lifecycle_authority_scope_invalid", "A declared source exceeds the accepted local source bound.");
  if (expected !== null && (info.dev !== expected.dev || info.ino !== expected.ino)) fail("lifecycle_authority_unknown_asset", "Another file took the declared source's place.");
  const handle = await open(location, "r");
  try {
    const opened = await handle.stat({ bigint: true });
    if (!opened.isFile() || opened.ino !== info.ino || opened.dev !== info.dev) fail("lifecycle_authority_unknown_asset", "The declared source changed while it was opened.");
    const hash = createHash("sha256"), buffer = Buffer.alloc(1_048_576);
    let position = 0;
    for (;;) {
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, position);
      if (bytesRead === 0) break;
      hash.update(buffer.subarray(0, bytesRead)); position += bytesRead;
    }
    const after = await handle.stat({ bigint: true });
    if (after.size !== opened.size || after.mtimeNs !== opened.mtimeNs || BigInt(position) !== opened.size) fail("lifecycle_authority_unknown_asset",
      "The declared source changed while it was read.");
    if (position !== declaration.sizeBytes || hash.digest("hex") !== declaration.contentHash) fail("lifecycle_authority_unknown_asset",
      "The declared SHA-256 and size are not the bytes on disk.");
    return { dev: opened.dev, ino: opened.ino };
  } finally { await handle.close(); }
}
/** Refuses a link at the location or any of its parents, by the accepted Phase-2 footage rule (scripts/footage-local.ts). */
async function assertNoLinkedParents(location: string): Promise<void> {
  let current = resolve(location);
  const root = parse(current).root;
  while (current !== root) {
    let info;
    try { info = await lstat(current); } catch { fail("lifecycle_authority_scope_invalid", "A declared source does not exist."); }
    if (info.isSymbolicLink()) fail("lifecycle_authority_scope_invalid", "A link is never part of a declared source's location.");
    current = dirname(current);
  }
}
const sameLocation = (a: string, b: string) => (WINDOWS ? a.toLowerCase() === b.toLowerCase() : a === b);
/** An existing real directory, link-free, resolving exactly where it is named: the store is only ever read here, never created. */
async function exactDirectory(location: string): Promise<string> {
  await assertNoLinkedParents(location);
  let real: string;
  try { real = await realpath(location); } catch { fail("lifecycle_authority_scope_invalid", "A canonical store location does not exist."); }
  if (!sameLocation(real, location) || !(await lstat(real)).isDirectory()) fail("lifecycle_authority_scope_invalid", "A canonical store location is not exactly a real directory.");
  return real;
}
/** True when the regular, link-free file at `location` holds exactly `expected` (a bounded record). */
async function holdsExactly(location: string, expected: string): Promise<boolean> {
  let info;
  try { info = await lstat(location, { bigint: true }); } catch { return false; }
  const bytes = Buffer.from(expected, "utf8");
  if (info.isSymbolicLink() || !info.isFile() || info.size !== BigInt(bytes.length) || bytes.length > CANONICAL_STORE.maxRecordBytes) return false;
  const handle = await open(location, "r");
  try {
    const opened = await handle.stat({ bigint: true });
    if (opened.ino !== info.ino || opened.dev !== info.dev) return false;
    const found = Buffer.alloc(bytes.length);
    const { bytesRead } = await handle.read(found, 0, bytes.length, 0);
    return bytesRead === bytes.length && found.equals(bytes);
  } finally { await handle.close(); }
}
/** One declared original: the accepted path rule, no links, an exact location, and its bytes verified through one held handle. */
async function registerOriginal(base: string, declaration: { entryId: string; assetId: string; contentHash: string; sizeBytes: number; path: string; authorization: unknown },
  registry: Map<string, Entry>, locations: Set<string>, expiresAt: string | null): Promise<void> {
  const segments = ownerMediaRelativeSegments(declaration.path);
  if (segments === null) fail("lifecycle_authority_scope_invalid", "A declared source is a plain relative path under the footage manifest's directory.");
  const requested = join(base, ...segments), inside = relative(base, requested);
  if (inside === "" || inside.startsWith("..") || isAbsolute(inside)) fail("lifecycle_authority_scope_invalid", "A declared source lies inside the footage manifest's directory.");
  await assertNoLinkedParents(requested);
  let real: string;
  try { real = await realpath(requested); } catch { fail("lifecycle_authority_scope_invalid", "A declared source does not exist."); }
  if (WINDOWS ? real.toLowerCase() !== requested.toLowerCase() : real !== requested) fail("lifecycle_authority_scope_invalid",
    "A declared source resolves elsewhere than its declared location.");
  const identity = await verifyBytes(real, declaration, null);
  const key = WINDOWS ? real.toLowerCase() : real;
  if (locations.has(key)) fail("lifecycle_authority_scope_invalid", "Two declarations name one file.");
  locations.add(key);
  const { entryId, assetId, contentHash, sizeBytes, authorization } = declaration;
  registry.set(declaration.assetId, { declaration: { entryId, assetId, contentHash, sizeBytes, authorization }, location: real, dev: identity.dev, ino: identity.ino,
    deletionRequestedAt: null, expiresAt, lineage: null });
}
/**
 * Creates the authority from the owner's explicit registration and verifies every declared file before anything may use it. The
 * registration, the footage manifest's directory and, for declared derivatives, the canonical workspace are the only inputs: nothing is
 * discovered, and a location is kept only to re-verify the same file.
 */
export async function createOwnerMediaLifecycleAuthority(input: { registration: unknown; baseDirectory: string; clock: RuntimeClock; canonicalWorkspace?: string }):
  Promise<OwnerMediaLifecycleAuthority> {
  if (input === null || typeof input !== "object") fail("input_invalid", "An owner registration, its base directory and a runtime clock are required.");
  if (input.clock === null || typeof input.clock !== "object" || typeof input.clock.now !== "function") fail("input_invalid", "A runtime clock is required.");
  if (typeof input.baseDirectory !== "string") fail("lifecycle_authority_scope_invalid", "The footage manifest's directory is an explicit local directory.");
  const supplied = structuredClone(input.registration), canonicalWorkspace = input.canonicalWorkspace;
  if ((supplied as { artifactVersion?: unknown } | null)?.artifactVersion === "0.2.0") return createCanonical(supplied, input.baseDirectory, input.clock, canonicalWorkspace);
  const { registration, registrationDigest, declarations } = ownerMediaDeclarations(supplied);
  const base = await baseOf(input.baseDirectory);
  const registry = new Map<string, Entry>(), locations = new Set<string>();
  for (const declaration of declarations) await registerOriginal(base, declaration as OwnerMediaDeclaration, registry, locations, registration.renderAuthorization.expiresAt);
  return new OwnerMediaLifecycleAuthority(CONSTRUCTION, input.clock, registry, registrationDigest, registration.renderAuthorization,
    { projectId: registration.footage.projectId, creatorId: registration.footage.creatorId });
}
async function baseOf(baseDirectory: string): Promise<string> {
  const requestedBase = declaredLocation(baseDirectory);
  await assertNoLinkedParents(requestedBase);
  let base: string;
  try { base = await realpath(requestedBase); } catch { fail("lifecycle_authority_scope_invalid", "The footage manifest's directory does not exist."); }
  if (!(await lstat(base)).isDirectory()) fail("lifecycle_authority_scope_invalid", "The footage manifest's location is a directory.");
  return base;
}
/** OwnerMediaRegistration 0.2.0: every original first, then each declared derivative from the canonical store only. */
async function createCanonical(supplied: unknown, baseDirectory: string, clock: RuntimeClock, canonicalWorkspace: unknown): Promise<OwnerMediaLifecycleAuthority> {
  const declared = ownerMediaCanonicalDeclarations(supplied);
  const registration = OwnerMediaCanonicalRegistrationSchema.parse(supplied), expiresAt = registration.renderAuthorization.expiresAt;
  const base = await baseOf(baseDirectory);
  const registry = new Map<string, Entry>(), locations = new Set<string>();
  for (const declaration of declared.declarations) await registerOriginal(base, declaration, registry, locations, expiresAt);
  if (declared.derivatives.length > 0) {
    if (typeof canonicalWorkspace !== "string") fail("lifecycle_authority_scope_invalid", "A declared canonical derivative is read only from an explicit canonical workspace.");
    let store = await exactDirectory(declaredLocation(canonicalWorkspace));
    for (const name of CANONICAL_STORE.directory) store = await exactDirectory(join(store, name));
    const objects = await exactDirectory(join(store, CANONICAL_STORE.objects)), computations = await exactDirectory(join(store, CANONICAL_STORE.computations));
    for (const d of declared.derivatives) {
      // A derivative is considered only after its root is registered and verified.
      const root = registry.get(d.rootAssetId);
      if (root === undefined || root.lineage !== null) fail("lifecycle_authority_scope_invalid", "A canonical derivative is registered only after its declared root.");
      const authorization = FootageAuthorizationDerivedSchema.safeParse(d.authorization), derivation = CanonicalMediaDerivationSchema.safeParse(d.derivation);
      if (!authorization.success || !derivation.success || !equal(authorization.data.derivedFrom.rootAuthorization, root.declaration.authorization)
        || derivation.data.output.contentHash !== d.contentHash || derivation.data.output.sizeBytes !== d.sizeBytes || derivation.data.source.contentHash !== root.declaration.contentHash) {
        fail("lifecycle_authority_scope_invalid", "A declared derivative's derivation and authorization must revalidate against its registered root.");
      }
      // The store's record of the verified computation must name exactly this derivation's measured result.
      const record = canonicalComputationRecordOf(derivation.data);
      if (!(await holdsExactly(join(computations, record.name), record.bytes))) {
        fail("lifecycle_authority_scope_invalid", "A declared derivative is only a result the canonical store's verified computation names.");
      }
      // Its bytes come only from their content address, re-hashed in full through one held handle.
      const location = join(objects, canonicalObjectName(d.contentHash));
      const identity = await verifyBytes(location, d, null);
      let real: string;
      try { real = await realpath(location); } catch { fail("lifecycle_authority_scope_invalid", "A declared source does not exist."); }
      if (!sameLocation(real, location)) fail("lifecycle_authority_scope_invalid", "A canonical object resolves elsewhere than its content address.");
      const key = WINDOWS ? real.toLowerCase() : real;
      if (locations.has(key)) fail("lifecycle_authority_scope_invalid", "Two declarations name one file.");
      locations.add(key);
      registry.set(d.assetId, { declaration: { entryId: d.entryId, assetId: d.assetId, contentHash: d.contentHash, sizeBytes: d.sizeBytes, authorization: d.authorization },
        location: real, dev: identity.dev, ino: identity.ino, deletionRequestedAt: null, expiresAt,
        lineage: { rootAssetId: d.rootAssetId, derivationId: d.derivationId, recipeId: d.recipeId, derivation: d.derivation } });
    }
  }
  return new OwnerMediaLifecycleAuthority(CONSTRUCTION, clock, registry, declared.registrationDigest, registration.renderAuthorization,
    { projectId: registration.footage.projectId, creatorId: registration.footage.creatorId }, "0.2.0");
}
