/**
 * The explicit local composition boundary for the Gate-7 Batch-2A runtime: the system UTC clock, ownership-token entropy, the
 * durable runtime ledger, content-addressed staging and the execution-only source locator, over local files only. It starts no
 * process, opens no socket, decodes nothing and interprets no identifier as a location or an invocation. Every runtime file name
 * derives from an owned content digest; source locations are execution-only configuration, never domain authority, and never
 * appear in a runtime record or error message.
 *
 * Publication primitive: a complete record or object is written to a private pending file created exclusively (`wx`), synced,
 * then published by a hard link to its owned final name. Linking fails when the final name exists, so exactly one concurrent
 * publisher wins and nothing is ever overwritten; the final name appears only after its bytes are complete and synced. The
 * directory entry itself is not synced (not supported for directories here), so power-loss durability of a just-published name
 * is not claimed.
 */
import { randomBytes } from "node:crypto";
import { link, lstat, mkdir, open, realpath, unlink, type FileHandle } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { EditRuntimeError, MAX_RUNTIME_RECORD_BYTES, MAX_STAGED_SOURCE_BYTES, STORAGE_DURABILITY, type ByteReader, type EditRuntime, type EditRuntimeErrorCode,
  type LedgerNamespace, type PendingStagedObject, type ResolvedSource, type RuntimeClock, type RuntimeEntropy, type RuntimeLedger, type SourceLocator,
  type StagedObjectLocation, type StagedObjectOpen, type StagingStore, type StoredRead } from "../packages/edit-runtime/index.js";

const DURABILITY = STORAGE_DURABILITY[0];
const OWNED_KEY = /^[a-f0-9]{64}$/, ASSET_ID = /^[A-Za-z][A-Za-z0-9._:-]{0,127}$/;
/** Bounded so every owned name stays well inside the platform path limit: root + separator + namespace + separator + 64 hex + extension. */
const MAX_ROOT_PATH_LENGTH = 160, MAX_LOCATION_LENGTH = 1024, MAX_ALLOWED_ROOTS = 16, MAX_MAPPED_SOURCES = 256;
const WINDOWS = sep === "\\";

function fail(code: EditRuntimeErrorCode, message: string): never { throw new EditRuntimeError(code, message); }
function errno(error: unknown): string | undefined {
  return error instanceof Error && "code" in error && typeof error.code === "string" ? error.code : undefined;
}
/** Runs a filesystem step, replacing any foreign failure (whose message may carry a location) by one owned refusal. */
async function owned<T>(code: EditRuntimeErrorCode, message: string, run: () => Promise<T>): Promise<T> {
  try { return await run(); } catch (error) {
    if (error instanceof EditRuntimeError) throw error;
    fail(code, message);
  }
}
function ownedName(key: string): string {
  if (typeof key !== "string" || !OWNED_KEY.test(key)) fail("input_invalid", "Only an owned 64-hex content digest names runtime state.");
  return key;
}
const pendingName = () => `${randomBytes(16).toString("hex")}.pending`;

/** A local absolute location: never a URL, UNC or device path, relative or drive-relative path, traversal segment or NUL. */
function localLocation(value: unknown, code: "runtime_root_invalid" | "source_location_invalid"): string {
  if (typeof value !== "string" || value.length === 0 || value.length > MAX_LOCATION_LENGTH || value.includes("\0")) fail(code, "A bounded local location is required.");
  if (/^[A-Za-z][A-Za-z0-9+.-]*:\/\//.test(value) || /^file:/i.test(value)) fail(code, "A URL is never a local location.");
  if (value.startsWith("\\\\") || value.startsWith("//")) fail(code, "Network, UNC and device-namespace paths are never local locations.");
  if (WINDOWS ? !/^[A-Za-z]:[\\/]/.test(value) : !value.startsWith("/")) fail(code, "Only an absolute local path is accepted.");
  if (value.split(/[\\/]+/).includes("..")) fail(code, "Traversal segments are refused.");
  return resolve(value);
}
function within(root: string, target: string): boolean {
  const path = relative(root, target);
  return path !== "" && path !== ".." && !path.startsWith(`..${sep}`) && !isAbsolute(path);
}

// ---------------------------------------------------------------- the runtime root: fixed namespaces under one real local directory
export interface RuntimeLayout {
  readonly root: string;
  readonly attemptRegistrations: string;
  readonly executionClaims: string;
  readonly ledgerPending: string;
  readonly stagedObjects: string;
  readonly stagingPending: string;
}
async function ownedDirectory(root: string, name: string): Promise<string> {
  const path = join(root, name);
  try { await mkdir(path); } catch (error) { if (errno(error) !== "EEXIST") fail("runtime_storage_unavailable", "A runtime namespace could not be created."); }
  const info = await owned("runtime_storage_corrupt", "A runtime namespace could not be inspected.", () => lstat(path));
  if (info.isSymbolicLink() || !info.isDirectory()) fail("runtime_storage_corrupt", "A runtime namespace is not a real directory.");
  return path;
}
async function openRuntimeRoot(rootPath: string): Promise<RuntimeLayout> {
  const requested = localLocation(rootPath, "runtime_root_invalid");
  const info = await owned("runtime_root_invalid", "The runtime root must be an existing local directory.", () => lstat(requested));
  if (info.isSymbolicLink() || !info.isDirectory()) fail("runtime_root_invalid", "The runtime root must be a real directory, not a link.");
  const root = await owned("runtime_root_invalid", "The runtime root could not be resolved.", () => realpath(requested));
  if (root.length > MAX_ROOT_PATH_LENGTH) fail("runtime_root_invalid", "The runtime root path is too long for the bounded layout.");
  return Object.freeze({ root, attemptRegistrations: await ownedDirectory(root, "attempt-registrations"), executionClaims: await ownedDirectory(root, "execution-claims"),
    ledgerPending: await ownedDirectory(root, "ledger-pending"), stagedObjects: await ownedDirectory(root, "staged-objects"),
    stagingPending: await ownedDirectory(root, "staging-pending") });
}

// ---------------------------------------------------------------- the one publication primitive: exclusive pending file, sync, hard-link publication
async function linkWithoutOverwrite(from: string, to: string): Promise<"published" | "exists"> {
  try { await link(from, to); return "published"; } catch (error) {
    if (errno(error) === "EEXIST") return "exists";
    fail("runtime_storage_unavailable", "No-overwrite publication is unavailable on this storage.");
  }
}
/**
 * Removes one private pending name. An owned final name is never removed. A pending name that cannot be removed is inert
 * garbage: nothing ever reads a pending directory as authority or as a staged object.
 */
async function removePending(path: string): Promise<void> {
  await unlink(path).catch(() => undefined);
}
class LocalByteReader implements ByteReader {
  constructor(private readonly handle: FileHandle, readonly sizeBytes: number) {}
  async read(target: Uint8Array, position: number): Promise<number> {
    return owned("source_unavailable", "The opened file could not be read.", async () => (await this.handle.read(target, 0, target.length, position)).bytesRead);
  }
  async close(): Promise<void> { await this.handle.close(); }
}
/** Opens exactly the regular file found by lstat, refusing if another file took its name in between. */
async function openRegular(path: string): Promise<{ state: "absent" } | { state: "unusable"; reason: "symbolic_link" | "directory" | "not_regular_file" | "changed_during_read" }
  | { state: "present"; handle: FileHandle; size: bigint }> {
  let info;
  try { info = await lstat(path, { bigint: true }); } catch (error) {
    if (errno(error) === "ENOENT") return { state: "absent" };
    fail("runtime_storage_unavailable", "Runtime state could not be inspected.");
  }
  if (info.isSymbolicLink()) return { state: "unusable", reason: "symbolic_link" };
  if (info.isDirectory()) return { state: "unusable", reason: "directory" };
  if (!info.isFile()) return { state: "unusable", reason: "not_regular_file" };
  const handle = await owned("runtime_storage_unavailable", "Runtime state could not be opened.", () => open(path, "r"));
  const current = await owned("runtime_storage_unavailable", "Runtime state could not be inspected.", () => handle.stat({ bigint: true })).catch(async error => {
    await handle.close(); throw error;
  });
  if (!current.isFile() || current.ino !== info.ino || current.dev !== info.dev) { await handle.close(); return { state: "unusable", reason: "changed_during_read" }; }
  return { state: "present", handle, size: current.size };
}

class LocalRuntimeLedger implements RuntimeLedger {
  readonly durability = DURABILITY;
  constructor(private readonly layout: RuntimeLayout) {}
  private recordPath(namespace: LedgerNamespace, key: string): string {
    const directory = namespace === "attempt_registration" ? this.layout.attemptRegistrations : namespace === "execution_claim" ? this.layout.executionClaims
      : fail("input_invalid", "Unknown runtime ledger namespace.");
    return join(directory, `${ownedName(key)}.json`);
  }
  async publishExclusive(namespace: LedgerNamespace, key: string, bytes: Uint8Array): Promise<"published" | "exists"> {
    const target = this.recordPath(namespace, key);
    if (!(bytes instanceof Uint8Array) || bytes.length === 0 || bytes.length > MAX_RUNTIME_RECORD_BYTES) fail("limit_exceeded", "A runtime record must be complete and bounded.");
    const pending = join(this.layout.ledgerPending, pendingName());
    const handle = await owned("runtime_storage_unavailable", "A private pending record could not be created.", () => open(pending, "wx"));
    try {
      await owned("runtime_storage_unavailable", "A pending record could not be written and synced.", async () => {
        try { await handle.writeFile(bytes); await handle.sync(); } finally { await handle.close(); }
      });
      return await linkWithoutOverwrite(pending, target);
    } finally { await removePending(pending); }
  }
  async read(namespace: LedgerNamespace, key: string, maximumBytes: number): Promise<StoredRead> {
    const opened = await openRegular(this.recordPath(namespace, key));
    if (opened.state !== "present") return opened;
    const { handle, size } = opened;
    try {
      if (size > BigInt(Math.min(maximumBytes, MAX_RUNTIME_RECORD_BYTES))) return { state: "unusable", reason: "oversized" };
      const bytes = new Uint8Array(Number(size) + 1);
      let total = 0;
      for (;;) {
        const { bytesRead } = await owned("runtime_storage_unavailable", "A runtime record could not be read.", () => handle.read(bytes, total, bytes.length - total, total));
        if (bytesRead === 0) break;
        total += bytesRead;
        if (total >= bytes.length) break;
      }
      return total === Number(size) ? { state: "present", bytes: bytes.subarray(0, total) } : { state: "unusable", reason: "changed_during_read" };
    } finally { await handle.close(); }
  }
}

class LocalPendingObject implements PendingStagedObject {
  #position = 0;
  #state: "open" | "sealed" | "discarded" = "open";
  constructor(private readonly handle: FileHandle, private readonly path: string, private readonly objects: string) {}
  async write(bytes: Uint8Array): Promise<void> {
    if (this.#state !== "open") fail("runtime_storage_unavailable", "A sealed pending object cannot be written.");
    await owned("runtime_storage_unavailable", "A pending object could not be written.", async () => {
      for (let offset = 0; offset < bytes.length;) {
        const { bytesWritten } = await this.handle.write(bytes, offset, bytes.length - offset, this.#position);
        offset += bytesWritten;
        this.#position += bytesWritten;
      }
    });
  }
  async seal(): Promise<void> {
    if (this.#state !== "open") fail("runtime_storage_unavailable", "A pending object is sealed once.");
    this.#state = "sealed";
    await owned("runtime_storage_unavailable", "A pending object could not be synced and sealed.", async () => {
      try { await this.handle.sync(); await this.handle.chmod(0o444); } finally { await this.handle.close(); }
    });
  }
  async publish(key: string): Promise<"published" | "exists"> {
    if (this.#state !== "sealed") fail("runtime_storage_unavailable", "Only a sealed pending object can be published.");
    return linkWithoutOverwrite(this.path, join(this.objects, `${ownedName(key)}.bin`));
  }
  async discard(): Promise<void> {
    if (this.#state === "open") await this.handle.close().catch(() => undefined);
    this.#state = "discarded";
    await removePending(this.path);
  }
}
class LocalStagingStore implements StagingStore {
  readonly durability = DURABILITY;
  constructor(private readonly layout: RuntimeLayout) {}
  async createPending(): Promise<PendingStagedObject> {
    const path = join(this.layout.stagingPending, pendingName());
    const handle = await owned("runtime_storage_unavailable", "A private pending object could not be created.", () => open(path, "wx"));
    return new LocalPendingObject(handle, path, this.layout.stagedObjects);
  }
  async openFinal(key: string): Promise<StagedObjectOpen> {
    const opened = await openRegular(join(this.layout.stagedObjects, `${ownedName(key)}.bin`));
    if (opened.state !== "present") return opened;
    return { state: "present", reader: new LocalByteReader(opened.handle, Number(opened.size)) };
  }
  locate(key: string): StagedObjectLocation {
    return Object.freeze({ localPath: join(this.layout.stagedObjects, `${ownedName(key)}.bin`) });
  }
}

// ---------------------------------------------------------------- the execution-only source locator
class LocalResolvedSource implements ResolvedSource {
  readonly #location: string;
  readonly #identity: { dev: bigint; ino: bigint };
  constructor(readonly assetId: string, location: string, identity: { dev: bigint; ino: bigint }) {
    this.#location = location; this.#identity = identity;
    Object.freeze(this);
  }
  /** Opens the resolved real file and proves the opened handle is that same file: a replacement in between is refused. */
  async openExact(): Promise<ByteReader> {
    const handle = await owned("source_unavailable", "The source could not be opened.", () => open(this.#location, "r"));
    try {
      const info = await owned("source_unavailable", "The opened source could not be inspected.", () => handle.stat({ bigint: true }));
      if (!info.isFile() || info.ino !== this.#identity.ino || info.dev !== this.#identity.dev) fail("source_changed", "The file opened is not the file resolved; the source was replaced.");
      return new LocalByteReader(handle, Number(info.size));
    } catch (error) { await handle.close().catch(() => undefined); throw error; }
  }
}
export interface LocalSourceLocatorConfig {
  /** Explicit local directories; a source's real location must lie inside one of them. */
  allowedRoots: readonly string[];
  /** Execution-only mapping of admitted asset identity to a candidate local file. */
  sources: readonly { assetId: string; path: string }[];
  maxSourceBytes?: number;
}
class LocalSourceLocator implements SourceLocator {
  constructor(private readonly roots: readonly string[], private readonly locations: ReadonlyMap<string, string>, private readonly maxSourceBytes: number) {}
  async resolve(assetId: string): Promise<ResolvedSource> {
    const location = this.locations.get(assetId);
    if (location === undefined) fail("source_unavailable", "No execution-only source location is configured for this asset.");
    const requested = localLocation(location, "source_location_invalid");
    let info;
    try { info = await lstat(requested, { bigint: true }); } catch { fail("source_unavailable", "The source is not available."); }
    if (info.isSymbolicLink()) fail("source_symlink", "A link is never a source; its final component must be a regular file.");
    if (!info.isFile()) fail("source_not_regular", "Only a regular local file can be a source.");
    if (info.size === 0n) fail("source_empty", "An empty file is never an authorized source.");
    if (info.size > BigInt(this.maxSourceBytes)) fail("limit_exceeded", "The source exceeds the configured source size bound.");
    const real = await owned("source_unavailable", "The source could not be resolved.", () => realpath(requested));
    if (!this.roots.some(root => within(root, real))) fail("source_outside_allowed_root", "The source's real location is outside every allowed source root.");
    const confirmed = await owned("source_unavailable", "The source could not be inspected.", () => lstat(real, { bigint: true }));
    if (!confirmed.isFile() || confirmed.ino !== info.ino || confirmed.dev !== info.dev) fail("source_changed", "The source changed while it was being resolved.");
    return new LocalResolvedSource(assetId, real, { dev: confirmed.dev, ino: confirmed.ino });
  }
  async open(resolved: ResolvedSource): Promise<ByteReader> {
    if (!(resolved instanceof LocalResolvedSource)) fail("source_unavailable", "Only a source resolved by this locator can be opened.");
    return resolved.openExact();
  }
}
export async function createLocalSourceLocator(config: LocalSourceLocatorConfig): Promise<SourceLocator> {
  const maxSourceBytes = config.maxSourceBytes ?? MAX_STAGED_SOURCE_BYTES;
  if (!Number.isSafeInteger(maxSourceBytes) || maxSourceBytes < 1 || maxSourceBytes > MAX_STAGED_SOURCE_BYTES) {
    fail("limit_exceeded", "The source size bound must be positive and within the accepted local source limit.");
  }
  if (config.allowedRoots.length < 1 || config.allowedRoots.length > MAX_ALLOWED_ROOTS) fail("source_location_invalid", "One to sixteen explicit source roots are required.");
  if (config.sources.length > MAX_MAPPED_SOURCES) fail("limit_exceeded", "Too many execution-only source mappings.");
  const roots: string[] = [];
  for (const root of config.allowedRoots) {
    const real = await owned("source_location_invalid", "An allowed source root must be an existing local directory.", () => realpath(localLocation(root, "source_location_invalid")));
    const info = await owned("source_location_invalid", "An allowed source root must be an existing local directory.", () => lstat(real));
    if (!info.isDirectory()) fail("source_location_invalid", "An allowed source root must be a directory.");
    roots.push(real);
  }
  const locations = new Map<string, string>();
  for (const source of config.sources) {
    if (typeof source.assetId !== "string" || !ASSET_ID.test(source.assetId) || locations.has(source.assetId)) fail("source_location_invalid", "Each asset maps to one location.");
    if (typeof source.path !== "string") fail("source_location_invalid", "A source location is a string.");
    locations.set(source.assetId, source.path);
  }
  return new LocalSourceLocator(Object.freeze(roots), locations, maxSourceBytes);
}

// ---------------------------------------------------------------- the local runtime
export const systemRuntimeClock: RuntimeClock = Object.freeze({ now: () => new Date().toISOString() });
export const systemRuntimeEntropy: RuntimeEntropy = Object.freeze({ ownershipToken: () => randomBytes(32).toString("hex") });
export interface LocalEditRuntimeConfig {
  runtimeRoot: string;
  allowedSourceRoots: readonly string[];
  sources: readonly { assetId: string; path: string }[];
  clock?: RuntimeClock;
  entropy?: RuntimeEntropy;
  maxSourceBytes?: number;
}
export interface LocalEditRuntime extends EditRuntime { readonly layout: RuntimeLayout }
export async function createLocalEditRuntime(config: LocalEditRuntimeConfig): Promise<LocalEditRuntime> {
  const sources = await createLocalSourceLocator({ allowedRoots: config.allowedSourceRoots, sources: config.sources,
    ...(config.maxSourceBytes === undefined ? {} : { maxSourceBytes: config.maxSourceBytes }) });
  const layout = await openRuntimeRoot(config.runtimeRoot);
  return Object.freeze({ clock: config.clock ?? systemRuntimeClock, entropy: config.entropy ?? systemRuntimeEntropy, ledger: new LocalRuntimeLedger(layout),
    staging: new LocalStagingStore(layout), sources, layout });
}
