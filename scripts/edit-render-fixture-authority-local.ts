/**
 * The synthetic-fixture lifecycle authority for Gate 7 Batch 2B: the sole, current lifecycle authority for synthetic test fixtures
 * that it registered itself, and nothing else. It registers only regular files it reads inside its own freshly created fixture
 * directory (the identity is the SHA-256 of the bytes it reads, never a caller-supplied identity), keeps their current deletion and
 * expiry state in memory, and answers a post-claim, post-stage query on the trusted runtime clock. It serves only assets whose
 * admitted MediaAsset is of synthetic origin and whose analysis authorization is synthetic-generated, so it can never answer for a
 * customer or user asset. Its observations are real authoritative queries of this registry, and each observation handle can query it
 * again at execution time; they prove the Batch-2B lifecycle mechanism, not any production user-media lifecycle service. It starts no
 * process and reaches no network.
 */
import { createHash, randomBytes } from "node:crypto";
import { lstat, mkdir, open, realpath } from "node:fs/promises";
import { isAbsolute, join, relative, sep } from "node:path";
import { canonicalSerialize } from "../packages/domain/serialization.js";
import { MediaAssetSchema } from "../packages/contracts/common.js";
import { FootageAnalysisSchema } from "../packages/footage-analyzer/protocol.js";
import { EditRenderError, buildFixtureLifecycleObservation, sessionProofOf, stagedFor, type EditRenderErrorCode, type FixtureLifecycleObservation } from "../packages/edit-render/index.js";
import type { RuntimeCall, RuntimeClock } from "../packages/edit-runtime/index.js";
import { RuntimeArtifacts } from "../packages/edit-runtime/common.js";
import { requireCall } from "../packages/edit-runtime/call.js";
import { runtimeNow, verifyClaim } from "../packages/edit-runtime/ledger.js";

const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/, NAME = /^[A-Za-z0-9_][A-Za-z0-9_.-]{0,99}$/;
function fail(code: EditRenderErrorCode, message: string): never { throw new EditRenderError(code, message); }
function within(root: string, target: string): boolean { const path = relative(root, target); return path !== "" && !path.startsWith("..") && !isAbsolute(path) && !path.includes(`..${sep}`); }
const CONSTRUCTION = Symbol("synthetic-fixture-lifecycle-authority"), OBSERVATION = Symbol("trusted-lifecycle-observation");

/**
 * A live, non-serializable proof that one lifecycle observation came from this authority's query, holding its session token in
 * memory, and the means to query the same authority again for the same asset at execution time. The observation is a private
 * snapshot taken by the query; the public getter returns a copy, so mutating it never changes what this handle certifies.
 */
export class TrustedLifecycleObservation {
  readonly #token: string;
  readonly #requery: (now: string) => void;
  readonly #record: FixtureLifecycleObservation;
  constructor(construction: symbol, record: FixtureLifecycleObservation, token: string, requery: (now: string) => void) {
    if (construction !== OBSERVATION) fail("trust_handle_required", "A lifecycle observation handle is produced only by the fixture authority's own query.");
    this.#token = token; this.#requery = requery; this.#record = structuredClone(record);
    Object.freeze(this);
  }
  static is(value: unknown): value is TrustedLifecycleObservation { return typeof value === "object" && value !== null && #token in value; }
  /** A copy of the observation record: data only, never this handle's evidence. */
  get record(): FixtureLifecycleObservation { return structuredClone(this.#record); }
  /** True only for a record equal to this handle's private snapshot and carrying its session proof. */
  proves(record: FixtureLifecycleObservation): boolean {
    return record?.session?.digest === createHash("sha256").update(this.#token).digest("hex") && canonicalSerialize(record) === canonicalSerialize(this.#record);
  }
  /**
   * Queries the authority's current state for this observation's asset at `now`, an instant of the trusted runtime clock: a deletion
   * request, an ended retention or other registered bytes recorded since the observation refuse. It grants nothing; it can only refuse.
   */
  reconfirm(now: string): void {
    if (typeof now !== "string" || !TIMESTAMP.test(now)) fail("input_invalid", "A lifecycle requery instant is exact UTC milliseconds.");
    this.#requery(now);
  }
  toJSON(): never { fail("trust_handle_required", "A trusted observation handle is never serialized; persist its record instead."); }
}
interface Entry { contentHash: string; sizeBytes: number; deletionRequestedAt: string | null; expiresAt: string | null }
export class SyntheticFixtureLifecycleAuthority {
  readonly #directory: string;
  readonly #clock: RuntimeClock;
  readonly #registry = new Map<string, Entry>();
  constructor(construction: symbol, directory: string, clock: RuntimeClock) {
    if (construction !== CONSTRUCTION) fail("trust_handle_required", "The fixture authority is created only by createSyntheticFixtureLifecycleAuthority.");
    this.#directory = directory; this.#clock = clock;
    Object.freeze(this);
  }
  static is(value: unknown): value is SyntheticFixtureLifecycleAuthority { return typeof value === "object" && value !== null && #registry in value; }
  /** The authority's own fixture directory: the only place a fixture generator may write bytes it asks this authority to register. */
  get fixtureDirectory(): string { return this.#directory; }
  #now(): string {
    const now = this.#clock.now();
    if (typeof now !== "string" || !TIMESTAMP.test(now)) fail("input_invalid", "The authority clock must report exact UTC milliseconds.");
    return now;
  }
  /** Registers a regular file inside the fixture directory by the SHA-256 of the bytes read from one opened handle. */
  async registerGeneratedFixture(name: string): Promise<{ assetId: string; contentHash: string; sizeBytes: number }> {
    if (typeof name !== "string" || !NAME.test(name) || name.includes("..")) fail("lifecycle_authority_scope_invalid", "Only a plain file name inside the fixture directory registers.");
    const path = join(this.#directory, name);
    let info;
    try { info = await lstat(path, { bigint: true }); } catch { fail("lifecycle_authority_scope_invalid", "No such fixture inside the fixture directory."); }
    if (info.isSymbolicLink() || !info.isFile() || info.size === 0n) fail("lifecycle_authority_scope_invalid", "Only a non-empty regular fixture file registers.");
    let real: string;
    try { real = await realpath(path); } catch { fail("lifecycle_authority_scope_invalid", "The fixture could not be resolved."); }
    if (!within(this.#directory, real)) fail("lifecycle_authority_scope_invalid", "The fixture resolves outside the fixture directory.");
    const handle = await open(real, "r");
    try {
      const opened = await handle.stat({ bigint: true });
      if (!opened.isFile() || opened.ino !== info.ino || opened.dev !== info.dev) fail("lifecycle_authority_scope_invalid", "The fixture changed while it was registered.");
      const hash = createHash("sha256"), buffer = Buffer.alloc(1_048_576);
      let position = 0;
      for (;;) {
        const { bytesRead } = await handle.read(buffer, 0, buffer.length, position);
        if (bytesRead === 0) break;
        hash.update(buffer.subarray(0, bytesRead)); position += bytesRead;
      }
      const contentHash = hash.digest("hex"), assetId = `asset_${contentHash}`;
      this.#registry.set(assetId, { contentHash, sizeBytes: position, deletionRequestedAt: this.#registry.get(assetId)?.deletionRequestedAt ?? null,
        expiresAt: this.#registry.get(assetId)?.expiresAt ?? null });
      return { assetId, contentHash, sizeBytes: position };
    } finally { await handle.close(); }
  }
  #entry(assetId: string): Entry {
    const entry = this.#registry.get(assetId);
    if (entry === undefined) fail("lifecycle_authority_unknown_asset", "The fixture authority has no record of this asset.");
    return entry;
  }
  /** Records a deletion request now, on the authority's clock. */
  requestDeletion(assetId: string): void { this.#entry(assetId).deletionRequestedAt = this.#now(); }
  /** Records a retention expiry. */
  setExpiry(assetId: string, expiresAt: string): void {
    if (typeof expiresAt !== "string" || !TIMESTAMP.test(expiresAt)) fail("input_invalid", "Expiry is exact UTC milliseconds.");
    this.#entry(assetId).expiresAt = expiresAt;
  }
  /**
   * The post-claim, post-stage query: claim ownership and the staged receipt are verified first, eligibility is checked from the
   * admitted MediaAsset and analysis, and the registry is read inside a check window measured on the trusted runtime clock.
   */
  async observe(call: RuntimeCall, stagedSource: unknown): Promise<TrustedLifecycleObservation> {
    const { dag, runtime, artifacts, ownership } = requireCall(call);
    const { claim } = await verifyClaim(dag, runtime, ownership);
    const receipt = stagedFor(dag, claim, stagedSource);
    const source = dag.admission.sources.find(s => s.assetId === receipt.source.assetId)!;
    const supplied = new RuntimeArtifacts(artifacts);
    let eligible = false;
    try {
      const media = MediaAssetSchema.parse(supplied.exact(source.mediaAsset, "MediaAsset", "1.0.0", "input_invalid"));
      const analysis = FootageAnalysisSchema.parse(supplied.exact(source.analysis, "FootageAnalysis", "1.0.0", "input_invalid"));
      eligible = media.origin === "synthetic" && analysis.authorization.sourceType === "synthetic" && analysis.authorization.authorizationBasis === "synthetic_generated";
    } catch { eligible = false; }
    if (!eligible) fail("lifecycle_authority_scope_invalid", "The fixture authority answers only for synthetic, synthetic-generated fixture assets.");
    const checkStartedAt = runtimeNow(runtime);
    const entry = this.#entry(source.assetId);
    if (entry.contentHash !== source.contentHash || entry.sizeBytes !== source.sizeBytes) fail("lifecycle_authority_unknown_asset", "The registered bytes are not the admitted bytes.");
    const state = { deletionRequestedAt: entry.deletionRequestedAt, expiresAt: entry.expiresAt };
    const checkCompletedAt = runtimeNow(runtime);
    if (checkCompletedAt < checkStartedAt) fail("evidence_chronology_invalid", "The runtime clock ran backwards during the query.");
    const token = randomBytes(32).toString("hex");
    const record = buildFixtureLifecycleObservation({ dag, claim, stagedSource: receipt, state,
      timing: { checkStartedAt, observedAt: checkStartedAt, checkCompletedAt, observedAtBasis: "check_started_lower_bound" }, session: sessionProofOf(token) });
    const { assetId, contentHash, sizeBytes } = source;
    const requery = (now: string) => {
      const current = this.#entry(assetId);
      if (current.contentHash !== contentHash || current.sizeBytes !== sizeBytes) fail("lifecycle_authority_unknown_asset", "The registered bytes changed since the observation.");
      if (current.deletionRequestedAt !== null) fail("lifecycle_deleted", "Deletion of the source has been requested since it was observed.");
      if (current.expiresAt !== null && now >= current.expiresAt) fail("lifecycle_expired", "The source's retention has ended.");
    };
    return new TrustedLifecycleObservation(OBSERVATION, record, token, requery);
  }
}
/** Creates a fresh, exclusively created fixture directory inside an existing local root, and the authority that owns it. */
export async function createSyntheticFixtureLifecycleAuthority(input: { root: string; clock: RuntimeClock }): Promise<SyntheticFixtureLifecycleAuthority> {
  if (typeof input.root !== "string" || !isAbsolute(input.root)) fail("input_invalid", "The fixture authority root is an absolute local directory.");
  if (input.clock === null || typeof input.clock !== "object" || typeof input.clock.now !== "function") fail("input_invalid", "A runtime clock is required.");
  const root = await realpath(input.root);
  const directory = join(root, `synthetic-fixtures-${randomBytes(8).toString("hex")}`);
  await mkdir(directory);
  return new SyntheticFixtureLifecycleAuthority(CONSTRUCTION, await realpath(directory), input.clock);
}
