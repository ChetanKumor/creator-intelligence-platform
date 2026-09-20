import { spawn, execFile, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createReadStream } from "node:fs";
import { mkdir, readFile, writeFile, rename, lstat, realpath } from "node:fs/promises";
import { resolve, join, dirname, relative, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { ReferenceAnalysisError, type ReferenceMediaProvider } from "../packages/reference-analyzer/index.js";
import { PROTOCOL_VERSION, WorkerFailureSchema, WorkerRequestSchema, WorkerResponseSchema, type WorkerRequest, type WorkerResponse, type DetectorConfig, type MediaMetadata, type Sample, type EmbeddingConfig } from "../packages/reference-analyzer/protocol.js";
import type { ArtifactCache, Clock, EmbeddingBackend, EmbeddingDevice } from "../packages/reference-analyzer/embeddings.js";
import { canonicalSerialize } from "../packages/domain/serialization.js";

export const PROJECT_ROOT = fileURLToPath(new URL("../../", import.meta.url));
export const localClock: Clock = { now: () => new Date().toISOString(), milliseconds: () => performance.now() };
export const localPaths = {
  python: resolve(PROJECT_ROOT, ".venv/Scripts/python.exe"),
  ffmpeg: resolve(PROJECT_ROOT, ".tools/ffmpeg/ffmpeg-9.0.1-essentials_build/bin/ffmpeg.exe"),
  ffprobe: resolve(PROJECT_ROOT, ".tools/ffmpeg/ffmpeg-9.0.1-essentials_build/bin/ffprobe.exe"),
  frames: resolve(PROJECT_ROOT, ".reference-cache/frames"), models: resolve(PROJECT_ROOT, ".reference-cache/models"),
};
export function containedPath(root: string, name: string): string {
  const target = resolve(root, name), diff = relative(resolve(root), target);
  if (diff.startsWith("..") || isAbsolute(diff) || !diff) throw new Error("Artifact path escaped its root.");
  return target;
}
function isNetworkPath(filename: string): boolean { return filename.startsWith("\\\\") || filename.startsWith("//") || /^[a-z]+:\/\//i.test(filename); }
export async function readLocalJson(filename: string, maximumBytes: number): Promise<unknown> {
  if (isNetworkPath(filename)) throw new Error("Only local JSON files are supported.");
  const info = await lstat(filename);
  if (!info.isFile() || info.isSymbolicLink() || info.size <= 0 || info.size > maximumBytes) throw new Error("Invalid JSON input bounds.");
  return JSON.parse(await readFile(filename, "utf8")) as unknown;
}
export async function atomicJson(filename: string, value: unknown): Promise<void> {
  await mkdir(dirname(filename), { recursive: true });
  const temporary = `${filename}.${randomUUID()}.pending`;
  await writeFile(temporary, `${canonicalSerialize(value)}\n`, { encoding: "utf8", flag: "wx" });
  await rename(temporary, filename);
}
export class FileArtifactCache implements ArtifactCache {
  constructor(private readonly root = resolve(PROJECT_ROOT, ".reference-cache/embeddings"), private readonly maximumBytes = 2 * 1024 * 1024) {}
  private filename(key: string): string {
    if (!/^cache_[a-f0-9]{64}$/.test(key)) throw new Error("Invalid artifact key.");
    return containedPath(this.root, `${key}.json`);
  }
  async read(key: string): Promise<unknown | null> {
    try {
      const filename = this.filename(key);
      const info = await lstat(filename);
      if (!info.isFile() || info.isSymbolicLink() || info.size > this.maximumBytes) return { corrupt: true };
      try { return JSON.parse(await readFile(filename, "utf8")) as unknown; } catch (error) { if (error instanceof SyntaxError) return { corrupt: true }; throw error; }
    } catch (error) { if (isErrno(error, "ENOENT")) return null; throw error; }
  }
  async write(key: string, value: unknown): Promise<void> { await atomicJson(this.filename(key), value); }
}
function isErrno(error: unknown, code: string): boolean { return error instanceof Error && "code" in error && error.code === code; }
export async function authorizedLocalPath(filename: string): Promise<string> {
  try {
    if (isNetworkPath(filename)) throw new Error("Only local media files are supported.");
    const absolute = resolve(filename), info = await lstat(absolute);
    if (!info.isFile() || info.isSymbolicLink() || info.size <= 0 || info.size > 8 * 1024 ** 3) throw new Error("Invalid file.");
    return await realpath(absolute);
  } catch { throw new ReferenceAnalysisError("identity", "MEDIA_UNREADABLE", "An accessible regular local media file is required."); }
}
export function localBytes(filename: string): AsyncIterable<Uint8Array> { return createReadStream(filename); }

export class PythonWorker {
  private readonly child: ChildProcessWithoutNullStreams;
  private pending: { operation: WorkerRequest["operation"]; resolve(value: WorkerResponse): void; reject(error: Error): void; timer: ReturnType<typeof setTimeout> } | null = null;
  private buffer = "";
  private stopped = false;
  private readonly finished: Promise<void>;
  constructor(private readonly timeoutMilliseconds = 180000, footageCapacityReport?: string) {
    this.child = spawn(localPaths.python, ["-B", "-u", "-m", "reference_analyzer"], {
      cwd: PROJECT_ROOT, shell: false, windowsHide: true, stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, PYTHONPATH: join(PROJECT_ROOT, "python"), PYTHONNOUSERSITE: "1", PYTHONDONTWRITEBYTECODE: "1", PYTHONUTF8: "1",
        HF_HOME: localPaths.models, HF_HUB_CACHE: localPaths.models, HF_HUB_OFFLINE: "1", TRANSFORMERS_OFFLINE: "1", HF_HUB_DISABLE_TELEMETRY: "1", TOKENIZERS_PARALLELISM: "false", OMP_NUM_THREADS: "2", MKL_NUM_THREADS: "2",
        ...(footageCapacityReport === undefined ? {} : { CREATOR_FOOTAGE_MEMORY_GUARD: "1", CREATOR_FOOTAGE_CAPACITY_REPORT: footageCapacityReport }) },
    });
    this.child.stdout.setEncoding("utf8");
    this.child.stdout.on("data", (chunk: string) => {
      this.buffer += chunk;
      if (this.buffer.length > 32 * 1024 * 1024) { this.fail("WORKER_OUTPUT_LIMIT"); this.terminate(); return; }
      let newline: number;
      while ((newline = this.buffer.indexOf("\n")) >= 0) {
        const line = this.buffer.slice(0, newline); this.buffer = this.buffer.slice(newline + 1);
        const pending = this.pending;
        if (pending === null) { this.terminate(); return; }
        clearTimeout(pending.timer); this.pending = null;
        try {
          const raw: unknown = JSON.parse(line);
          const failure = WorkerFailureSchema.safeParse(raw);
          if (failure.success) {
            pending.reject(new ReferenceAnalysisError(pending.operation, failure.data.error.code, failure.data.error.diagnostic));
          } else {
            const result = WorkerResponseSchema.parse(raw);
            if (result.operation !== pending.operation) throw new Error("Operation mismatch.");
            pending.resolve(result);
          }
        } catch { pending.reject(new ReferenceAnalysisError(pending.operation, "INTERCHANGE_INVALID", "Worker output failed the owned interchange schema.")); }
      }
    });
    // stderr may contain local media paths or metadata. Drain without logging or persisting it.
    this.child.stderr.resume();
    this.child.on("error", () => { this.stopped = true; this.fail("WORKER_UNAVAILABLE"); });
    this.child.stdin.on("error", () => this.fail("WORKER_UNAVAILABLE"));
    this.finished = new Promise((done) => { this.child.once("close", () => { this.stopped = true; this.fail("WORKER_EXITED"); done(); }); });
  }
  private fail(code: string): void {
    const pending = this.pending; this.pending = null;
    if (pending !== null) { clearTimeout(pending.timer); pending.reject(new ReferenceAnalysisError(pending.operation, code, "Local worker could not complete the operation.")); }
  }
  private terminate(): void {
    this.stopped = true;
    if (process.platform === "win32" && this.child.pid !== undefined) execFile(join(process.env["SystemRoot"] ?? "C:\\Windows", "System32/taskkill.exe"), ["/PID", String(this.child.pid), "/T", "/F"], { windowsHide: true }, () => {});
    else this.child.kill();
  }
  request(input: WorkerRequest, timeoutMilliseconds = this.timeoutMilliseconds): Promise<WorkerResponse> {
    const request = WorkerRequestSchema.parse(input);
    if (this.pending !== null || this.stopped) return Promise.reject(new ReferenceAnalysisError(request.operation, "WORKER_UNAVAILABLE"));
    return new Promise((accept, reject) => {
      const timer = setTimeout(() => { this.fail("WORKER_TIMEOUT"); this.terminate(); }, Math.max(1, Math.min(this.timeoutMilliseconds, timeoutMilliseconds)));
      this.pending = { operation: request.operation, resolve: accept, reject, timer };
      this.child.stdin.write(`${JSON.stringify(request)}\n`);
    });
  }
  async close(): Promise<void> {
    this.child.stdin.end();
    const timer = setTimeout(() => this.terminate(), 2000);
    await this.finished; clearTimeout(timer);
  }
}

export class LocalReferenceMedia implements ReferenceMediaProvider, EmbeddingBackend {
  constructor(private readonly worker: Pick<PythonWorker, "request">, private readonly mediaPath: string, private readonly frameRoot = localPaths.frames) {}
  async metadata() {
    const result = await this.worker.request({ protocolVersion: PROTOCOL_VERSION, operation: "metadata", mediaPath: this.mediaPath, ffprobePath: localPaths.ffprobe });
    if (result.operation !== "metadata") throw new ReferenceAnalysisError("metadata", "INTERCHANGE_INVALID");
    return { value: result.value, version: result.toolVersion };
  }
  async detect(metadata: MediaMetadata, config: DetectorConfig) {
    const result = await this.worker.request({ protocolVersion: PROTOCOL_VERSION, operation: "detect", mediaPath: this.mediaPath, config, frameCount: metadata.frameCount });
    if (result.operation !== "detect") throw new ReferenceAnalysisError("detect", "INTERCHANGE_INVALID");
    return { cuts: result.value, version: result.toolVersion };
  }
  async sample(samples: readonly Sample[]) {
    const result = await this.worker.request({ protocolVersion: PROTOCOL_VERSION, operation: "sample", mediaPath: this.mediaPath, frameRoot: this.frameRoot, ffmpegPath: localPaths.ffmpeg, samples: [...samples] });
    if (result.operation !== "sample") throw new ReferenceAnalysisError("sample", "INTERCHANGE_INVALID");
    return { measurements: result.value, version: result.toolVersion };
  }
  async embed(sampleIds: readonly string[], config: EmbeddingConfig) {
    const vectors: { sampleId: string; vector: number[] }[] = [];
    const devices = new Set<"cpu" | "cuda">();
    let version: string | null = null, fallback = false;
    // Bound IPC size and each inference timeout, while the worker retains its model.
    for (let offset = 0; offset < sampleIds.length; offset += 8) {
      const result = await this.worker.request({ protocolVersion: PROTOCOL_VERSION, operation: "embed", frameRoot: this.frameRoot, modelRoot: localPaths.models, config, sampleIds: sampleIds.slice(offset, offset + 8) });
      if (result.operation !== "embed" || (version !== null && version !== result.toolVersion)) throw new ReferenceAnalysisError("embed", "INTERCHANGE_INVALID");
      version = result.toolVersion; devices.add(result.device); fallback ||= result.fallback;
      vectors.push(...result.value);
    }
    if (version === null) throw new ReferenceAnalysisError("embed", "EMBEDDING_FAILED", "At least one representative sample is required.");
    const device: EmbeddingDevice = devices.size > 1 ? "mixed" : devices.has("cuda") ? "cuda" : "cpu";
    return { vectors, version, device, fallback };
  }
}
