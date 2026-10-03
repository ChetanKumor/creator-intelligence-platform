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
import { MAX_STAGED_SOURCE_BYTES } from "../packages/edit-runtime/common.js";
import type { RuntimeCall, RuntimeClock } from "../packages/edit-runtime/index.js";
import { requireCall } from "../packages/edit-runtime/call.js";
import { runtimeNow, verifyClaim } from "../packages/edit-runtime/ledger.js";

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

interface Entry { declaration: OwnerMediaDeclaration; location: string; dev: bigint; ino: bigint; deletionRequestedAt: string | null; expiresAt: string | null }
/** The declared-source identity this authority verified, without its location. */
export interface VerifiedOwnerSource { entryId: string; assetId: string; contentHash: string; sizeBytes: number; checkedAt: string }
export class OwnerMediaLifecycleAuthority {
  readonly #clock: RuntimeClock;
  readonly #registry: ReadonlyMap<string, Entry>;
  readonly #registrationDigest: string;
  readonly #renderAuthorization: OwnerRenderAuthorization;
  readonly #scope: { projectId: string; creatorId: string };
  constructor(construction: symbol, clock: RuntimeClock, registry: Map<string, Entry>, registrationDigest: string, renderAuthorization: OwnerRenderAuthorization,
    scope: { projectId: string; creatorId: string }) {
    if (construction !== CONSTRUCTION) fail("trust_handle_required", "The owner-local authority is created only by createOwnerMediaLifecycleAuthority.");
    this.#clock = clock; this.#registry = registry; this.#registrationDigest = registrationDigest;
    this.#renderAuthorization = structuredClone(renderAuthorization); this.#scope = { ...scope };
    Object.freeze(this);
  }
  static is(value: unknown): value is OwnerMediaLifecycleAuthority { return typeof value === "object" && value !== null && #registry in value; }
  /** The digest of what the owner declared, excluding locations. */
  get registrationDigest(): string { return this.#registrationDigest; }
  get renderAuthorization(): OwnerRenderAuthorization { return structuredClone(this.#renderAuthorization); }
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
  /** Re-verifies one registered source's full bytes now, through one held handle of the registered file. */
  async verify(assetId: string): Promise<VerifiedOwnerSource> {
    const entry = this.#entry(assetId);
    await verifyBytes(entry.location, entry.declaration, { dev: entry.dev, ino: entry.ino });
    const d = entry.declaration;
    return { entryId: d.entryId, assetId: d.assetId, contentHash: d.contentHash, sizeBytes: d.sizeBytes, checkedAt: this.#now() };
  }
  /**
   * The current lifecycle of one declared source at `now`, an instant of the trusted runtime clock: unknown, deleted or expired refuses.
   * It grants nothing; it can only refuse. Every observation handle re-queries through the same rule.
   */
  assertCurrent(assetId: string, now: string): void {
    if (typeof now !== "string" || !TIMESTAMP.test(now)) fail("input_invalid", "A lifecycle query instant is exact UTC milliseconds.");
    const current = this.#entry(assetId);
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
   * The post-claim, post-stage query. Claim ownership and the staged receipt are verified first, and real-media provenance is read
   * from the exact admitted records. The declared bytes are then re-verified in full inside a check window on the trusted runtime clock.
   */
  async observe(call: RuntimeCall, stagedSource: unknown): Promise<TrustedOwnerMediaLifecycleObservation> {
    const { dag, runtime, artifacts, ownership } = requireCall(call);
    const { claim } = await verifyClaim(dag, runtime, ownership);
    const receipt = stagedFor(dag, claim, stagedSource);
    const source = dag.admission.sources.find(s => s.assetId === receipt.source.assetId)!;
    const { provenance, authorization } = checkOwnerMediaProvenance(source, artifacts);
    const entry = this.#entry(source.assetId);
    if (entry.declaration.contentHash !== source.contentHash || entry.declaration.sizeBytes !== source.sizeBytes) fail("lifecycle_authority_unknown_asset",
      "The declared bytes are not the admitted bytes.");
    if (!equal(entry.declaration.authorization, authorization)) fail("lifecycle_authority_scope_invalid", "The admitted authorization is not the one the owner declared.");
    const checkStartedAt = runtimeNow(runtime);
    await verifyBytes(entry.location, entry.declaration, { dev: entry.dev, ino: entry.ino });
    const verifiedAt = runtimeNow(runtime);
    const state = { deletionRequestedAt: entry.deletionRequestedAt, expiresAt: entry.expiresAt };
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
async function verifyBytes(location: string, declaration: OwnerMediaDeclaration, expected: { dev: bigint; ino: bigint } | null): Promise<{ dev: bigint; ino: bigint }> {
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
/**
 * Creates the authority from the owner's explicit registration and verifies every declared file before anything may use it. The
 * registration and the footage manifest's directory are the only inputs: nothing is discovered, and a location is kept only to re-verify
 * the same file.
 */
export async function createOwnerMediaLifecycleAuthority(input: { registration: unknown; baseDirectory: string; clock: RuntimeClock }): Promise<OwnerMediaLifecycleAuthority> {
  if (input === null || typeof input !== "object") fail("input_invalid", "An owner registration, its base directory and a runtime clock are required.");
  if (input.clock === null || typeof input.clock !== "object" || typeof input.clock.now !== "function") fail("input_invalid", "A runtime clock is required.");
  if (typeof input.baseDirectory !== "string") fail("lifecycle_authority_scope_invalid", "The footage manifest's directory is an explicit local directory.");
  const { registration, registrationDigest, declarations } = ownerMediaDeclarations(structuredClone(input.registration));
  const requestedBase = declaredLocation(input.baseDirectory);
  await assertNoLinkedParents(requestedBase);
  let base: string;
  try { base = await realpath(requestedBase); } catch { fail("lifecycle_authority_scope_invalid", "The footage manifest's directory does not exist."); }
  if (!(await lstat(base)).isDirectory()) fail("lifecycle_authority_scope_invalid", "The footage manifest's location is a directory.");
  const registry = new Map<string, Entry>(), locations = new Set<string>();
  for (const declaration of declarations) {
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
    registry.set(declaration.assetId, { declaration, location: real, dev: identity.dev, ino: identity.ino, deletionRequestedAt: null,
      expiresAt: registration.renderAuthorization.expiresAt });
  }
  return new OwnerMediaLifecycleAuthority(CONSTRUCTION, input.clock, registry, registrationDigest, registration.renderAuthorization,
    { projectId: registration.footage.projectId, creatorId: registration.footage.creatorId });
}
