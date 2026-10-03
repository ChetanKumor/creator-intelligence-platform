// Gate 7 Batch 3D: the OWNER-LOCAL real-footage verification runner. It is run only by the owner, on the owner's machine, with the
// pinned Windows media runtime; the cloud never runs it and no default test glob (*.test.js, *-media.integration.js) includes it.
//
//   npm run build
//   node --import ./scripts/no-network.mjs dist/tests/edit-real-footage.local.js --manifest <absolute path of the run manifest>
//
// It reads exactly: the run manifest; the accepted Phase-2 AuthorizedFootageSet it names; the files that set declares, only through the
// owner-local lifecycle authority (exact relative path, SHA-256 and size; nothing is discovered, listed or downloaded); and the accepted
// analyzer's outputs under .local-runs/<analysisJobId>/. Source bytes are only ever read. It writes only under the git-ignored
// .local-runs/phase5-gate7/b3d-<instant>-<nonce>/: receipt.json (the one bounded receipt), evidence.json,
// timings.json and runtime/ (staged copies of the declared sources, render outputs and segment artifacts, kept for owner review).
//
// Every render goes through the accepted boundary: admission, media grants, full-byte source receipts, claim, staging, the owner-local
// lifecycle observation, the pinned-runtime and staged-input probes, issueExecutablePermit, the pinned FFmpeg, independent technical
// QC, observation and critic, and the accepted EditorialState / EditingHead / GraphDiff / CAS publication. Direction and edit requests
// are deterministic verification input; nothing here measures creative or editing quality, and no Director model runs.
import { createHash, randomBytes } from "node:crypto";
import { appendFile, chmod, lstat, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { performance } from "node:perf_hooks";
import { canonicalSerialize } from "../packages/domain/serialization.js";
import { equal, type SuppliedArtifact } from "../packages/editorial/common.js";
import * as E from "../packages/edit-editorial/index.js";
import { compileRenderProgram, ownerMediaDeclarations, type SegmentedRenderExecutionReceipt, type TechnicalMediaQcReceipt } from "../packages/edit-render/index.js";
import { acquireExecutionClaim, openValidatedDag, registerDagAttempt, stageClaimedSource, type RuntimeCall, type StagedSourceReceipt,
  type ValidatedExecutionDag } from "../packages/edit-runtime/index.js";
import { planReview, runCriticReview, type CriticReport } from "../packages/edit-review/index.js";
import { FootageAnalysisSchema, FootageInventorySchema, FootageManifestSchema } from "../packages/footage-analyzer/protocol.js";
import { assertNoLinkedParents } from "../scripts/footage-local.js";
import { createOwnerMediaLifecycleAuthority, type OwnerMediaLifecycleAuthority, type TrustedOwnerMediaLifecycleObservation } from "../scripts/edit-render-owner-media-authority-local.js";
import { createLocalEditRuntime, systemRuntimeClock, type LocalEditRuntime } from "../scripts/edit-runtime-local.js";
import { executeAuthorizedSegmentedRender, issueExecutablePermit, probePinnedMediaRuntime, probeStagedInputs } from "../scripts/edit-render-local.js";
import { runTechnicalMediaQc } from "../scripts/edit-media-qc-local.js";
import { observeReviewTargets } from "../scripts/edit-observation-local.js";
import { openLocalEditingProject, type LocalEditingProject } from "../scripts/edit-editorial-local.js";
import { PINNED_TOOL_ROOT, PROJECT_ROOT, observeMediaSpawns } from "./support/edit-render-media.js";
import * as R from "./support/edit-real-footage.js";

type Scenario = (typeof R.SCENARIOS)[number];
type Status = (typeof R.STATUSES)[number];
const sha256 = (bytes: Uint8Array | string) => createHash("sha256").update(bytes).digest("hex");
const now = () => systemRuntimeClock.now();
const MAX_MANIFEST_BYTES = 262_144, MAX_ANALYSIS_BYTES = 16 * 1024 * 1024, MAX_RUNTIME_ROOT_LENGTH = 160;

// ---------------------------------------------------------------- bookkeeping: every scenario starts NOT_EXERCISED and is set exactly once
const scenarios = Object.fromEntries(R.SCENARIOS.map(s => [s, { status: "NOT_EXERCISED" as Status, detail: "Not reached." }])) as Record<Scenario, { status: Status; detail: string }>;
const set = (scenario: Scenario, status: Status, detail: string) => { scenarios[scenario] = { status, detail: detail.slice(0, 400) }; };
/** A path-free description of a failure for the receipt: typed codes and harness reasons only. The full message goes to the console. */
function describe(error: unknown): string {
  if (error instanceof R.HarnessRefusal) return `${error.code}: ${error.reasons.join("; ")}`;
  const code = error !== null && typeof error === "object" && "code" in error && typeof error.code === "string" ? error.code : undefined;
  const name = error instanceof Error ? error.name : "UnknownError";
  // A schema refusal names the failing fields and checks, never the values (which may be private paths).
  const issues = error !== null && typeof error === "object" && "issues" in error && Array.isArray(error.issues)
    ? (error.issues as { path?: unknown; code?: unknown }[]).slice(0, 8).map(i => `${Array.isArray(i.path) ? i.path.join(".") || "(root)" : "?"}:${String(i.code)}`) : [];
  return issues.length > 0 ? `${name}: ${issues.join(", ")}` : code === undefined ? name : `${name}:${code}`;
}
function blockAfter(failed: Scenario, dependents: readonly Scenario[]) {
  for (const s of dependents) if (scenarios[s].status === "NOT_EXERCISED") set(s, "NOT_EXERCISED", `Prerequisite ${failed} did not pass.`);
}

// ---------------------------------------------------------------- exact local inputs (no discovery, no links, bounded)
/** A private manifest inside this repository must live in a git-ignored directory; outside it, the owner's own location is used as given. */
function assertPrivateLocation(path: string, label: string) {
  const refusal = R.privateLocationRefusal(relative(PROJECT_ROOT, path), label);
  if (refusal !== null) throw refusal;
}
/** One regular, unlinked file, read once: its exact bytes' SHA-256 and its parsed JSON. */
async function readExactJson(path: string, maxBytes: number, label: string): Promise<{ value: unknown; sha256: string }> {
  await assertNoLinkedParents(path);
  const info = await lstat(path);
  if (!info.isFile() || info.size === 0 || info.size > maxBytes) throw new R.HarnessRefusal("input_file_invalid", [`${label} must be a regular, non-empty file of at most ${maxBytes} bytes.`]);
  const bytes = await readFile(path);
  if (bytes.length !== info.size) throw new R.HarnessRefusal("input_file_changed", [`${label} changed while it was read.`]);
  try { return { value: JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown, sha256: sha256(bytes) }; } catch {
    throw new R.HarnessRefusal("input_file_invalid", [`${label} is not UTF-8 JSON.`]);
  }
}
/** The checked-out commit, read from the repository's own metadata files; null when there is no plain .git directory (never invented). */
async function gitHead(): Promise<string | null> {
  try {
    const head = (await readFile(join(PROJECT_ROOT, ".git", "HEAD"), "utf8")).trim();
    if (/^[a-f0-9]{40}$/.test(head)) return head;
    const ref = /^ref: (refs\/heads\/[A-Za-z0-9._/-]+)$/.exec(head)?.[1];
    if (ref === undefined || ref.split("/").includes("..")) return null;
    try { const value = (await readFile(join(PROJECT_ROOT, ".git", ...ref.split("/")), "utf8")).trim(); if (/^[a-f0-9]{40}$/.test(value)) return value; } catch { /* packed */ }
    for (const line of (await readFile(join(PROJECT_ROOT, ".git", "packed-refs"), "utf8")).split(/\r?\n/)) {
      const [value, name] = line.split(" ");
      if (name === ref && value !== undefined && /^[a-f0-9]{40}$/.test(value)) return value;
    }
    return null;
  } catch { return null; }
}

// ---------------------------------------------------------------- one execution attempt through the accepted trusted boundary
interface Prepared { v: ValidatedExecutionDag; request: { call: RuntimeCall; media: Awaited<ReturnType<typeof probePinnedMediaRuntime>>; staged: StagedSourceReceipt[];
  lifecycle: TrustedOwnerMediaLifecycleObservation[]; conformance: Awaited<ReturnType<typeof probeStagedInputs>>; policy: ReturnType<typeof R.realExecutionPolicyFor> } }
async function prepare(runtime: LocalEditRuntime, authority: OwnerMediaLifecycleAuthority, x: R.RealExecution, policy: Prepared["request"]["policy"]): Promise<Prepared> {
  const v = openValidatedDag({ dag: x.dagArtifact.ref }, x.artifacts);
  await registerDagAttempt(v, x.artifacts, runtime);
  const { ownership } = await acquireExecutionClaim(v, { workerId: "worker_batch3d_owner_local" }, runtime);
  const call: RuntimeCall = { dag: v, runtime, ownership, artifacts: x.artifacts }, staged: StagedSourceReceipt[] = [];
  for (const s of v.admission.sources) staged.push(await stageClaimedSource(call, { assetId: s.assetId }));
  const lifecycle: TrustedOwnerMediaLifecycleObservation[] = [];
  for (const s of staged) lifecycle.push(await authority.observe(call, s));
  const media = await probePinnedMediaRuntime(call, { toolRoot: PINNED_TOOL_ROOT });
  const unavailable = media.capabilityProbe.findings.filter(f => f.state !== "AVAILABLE");
  if (unavailable.length > 0) throw new R.HarnessRefusal("pinned_runtime_capability_unavailable", unavailable.map(f => `${f.capabilityId}:${f.reasonCode}`));
  const conformance = await probeStagedInputs(call, media, staged);
  const refused = conformance.map(c => c.record).filter(r => r.outcome.state !== "conforms");
  if (refused.length > 0) throw new R.HarnessRefusal("staged_input_nonconforming", refused.map(r => `${r.source.assetId}:${r.outcome.state === "nonconforming" ? r.outcome.reasonCode : "?"}`));
  return { v, request: { call, media, staged, lifecycle, conformance, policy } };
}

async function main(): Promise<number> {
  const timings: Record<string, number> = {}, evidence: Record<string, unknown> = {};
  const timed = async <T>(label: string, run: () => Promise<T>): Promise<T> => { const at = performance.now(); try { return await run(); } finally { timings[label] = performance.now() - at; } };
  const manifestPath = R.manifestArgument(process.argv.slice(2));
  // Short on purpose: the accepted runtime bounds its root path at 160 characters, and the repository's own location counts toward it.
  const stamp = now().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z"), runDirectory = join(PROJECT_ROOT, ".local-runs", "phase5-gate7",
    `b3d-${stamp}-${randomBytes(2).toString("hex")}`);
  const runtimeRoot = join(runDirectory, "runtime");
  await mkdir(runtimeRoot, { recursive: true });
  const receipt = { git: { head: await gitHead(), clean: null as boolean | null }, manifest: { runManifestSha256: null as string | null,
    footageManifestSha256: null as string | null, registrationDigest: null as string | null }, runtime: null as { ffmpegSha256: string; ffprobeSha256: string } | null, sources: [] as R.Batch3DReceipt["sources"],
    records: { rootEditGraph: null, rootEditorialState: null, rootEditingHead: null, baselineDag: null, baselineProgram: null, baselineOutputSha256: null, baselineQc: null,
      baselineObservations: [], criticReport: null, lockRequest: null, lockIntent: null, lockedHead: null, editorialRequest: null, intent: null, revisionPlan: null, graphDiff: null,
      childEditGraph: null, childEditorialState: null, childEditingHead: null, childDag: null, childProgram: null, reusedSegments: [], recomputedSegments: [],
      childOutputSha256: null, childQc: null, preferenceHead: null, finalCurrentHead: null } as R.Batch3DReceipt["records"],
    refusals: { lockedTarget: null as string | null, staleRequest: null as string | null }, renderCounts: {} as R.Batch3DReceipt["renderCounts"],
    critic: { execution: "NOT_EXERCISED" as Status, semanticCritic: null as R.Batch3DReceipt["critic"]["semanticCritic"], findings: null as number | null,
      actionableRepairFinding: "NOT_EXERCISED" as R.Batch3DReceipt["critic"]["actionableRepairFinding"], autoRepair: "NOT_EXERCISED" as R.Batch3DReceipt["critic"]["autoRepair"] } };
  let observer: ReturnType<typeof observeMediaSpawns> | null = null;
  const counted = async <T>(label: string, run: () => Promise<T>): Promise<T> => {
    const before = observer?.calls.length ?? 0;
    try { return await timed(label, run); } finally {
      const calls = observer?.calls.slice(before) ?? [];
      receipt.renderCounts[label] = { ffmpegRender: calls.filter(c => c.tool === "ffmpeg" && c.arguments.includes("-benchmark")).length,
        ffmpegOther: calls.filter(c => c.tool === "ffmpeg" && !c.arguments.includes("-benchmark")).length, ffprobe: calls.filter(c => c.tool === "ffprobe").length };
    }
  };
  try {
    // ================================================================ 1. manifest, owner registration, exact byte verification
    let manifest: R.RealFootageRunManifest, authority: OwnerMediaLifecycleAuthority, footagePath: string;
    let sources: { entryId: string; assetId: string; analysis: R.FootageAnalysis; analysisSha256: string; candidateId: string | null }[];
    let run: { jobId: string; record: unknown };
    try {
      assertPrivateLocation(manifestPath, "The run manifest");
      const read = await readExactJson(manifestPath, MAX_MANIFEST_BYTES, "The run manifest");
      receipt.manifest.runManifestSha256 = read.sha256; manifest = R.RealFootageRunManifestSchema.parse(read.value);
      footagePath = R.absoluteLocalPath(manifest.footageManifest, "The footage manifest");
      assertPrivateLocation(footagePath, "The footage manifest");
      const footageRead = await readExactJson(footagePath, MAX_MANIFEST_BYTES, "The footage manifest");
      receipt.manifest.footageManifestSha256 = footageRead.sha256; const footage = FootageManifestSchema.parse(footageRead.value);
      const registration = { artifactType: "OwnerMediaRegistration", artifactVersion: "0.1.0", stability: "internal_pre_stable", footage,
        renderAuthorization: manifest.renderAuthorization };
      const declared = ownerMediaDeclarations(registration);
      authority = await timed("source_verification", () => createOwnerMediaLifecycleAuthority({ registration, baseDirectory: dirname(footagePath), clock: systemRuntimeClock }));
      receipt.manifest.registrationDigest = authority.registrationDigest;
      // The accepted analyzer's outputs for exactly this footage manifest.
      const runDirectoryOf = join(PROJECT_ROOT, ".local-runs", manifest.analysisJobId);
      const runRead = await readExactJson(join(runDirectoryOf, "run.json"), MAX_ANALYSIS_BYTES, "The analysis run record");
      const record = runRead.value as { jobId?: unknown; status?: unknown };
      if (record.jobId !== manifest.analysisJobId || record.status !== "succeeded") throw new R.HarnessRefusal("analysis_run_not_succeeded",
        ["The analysis run record must be the named job and have succeeded over every declared source."]);
      run = { jobId: manifest.analysisJobId, record: runRead.value };
      const inventory = FootageInventorySchema.parse((await readExactJson(join(runDirectoryOf, "FootageInventory.json"), MAX_ANALYSIS_BYTES, "The footage inventory")).value);
      if (inventory.creatorId !== footage.creatorId || inventory.projectId !== footage.projectId) throw new R.HarnessRefusal("analysis_scope_mismatch",
        ["The analysis belongs to another creator or project."]);
      const entries = new Map(declared.declarations.map(d => [d.entryId, d]));
      sources = [];
      for (const [position, entry] of manifest.timeline.entries()) {
        const d = entries.get(entry.entryId);
        if (d === undefined) throw new R.HarnessRefusal("timeline_entry_undeclared", [`Timeline position ${position + 1} names no declared footage entry.`]);
        const asset = inventory.assets.find(a => a.assetId === d.assetId);
        if (asset === undefined || !/^[a-z][a-z0-9_]{0,127}$/.test(asset.analysisId)) throw new R.HarnessRefusal("analysis_missing",
          [`${entry.entryId}: the named analysis job has no analysis of the declared bytes.`]);
        const analysisRead = await readExactJson(join(runDirectoryOf, "assets", `${asset.analysisId}.json`), MAX_ANALYSIS_BYTES, `The analysis of ${entry.entryId}`);
        const analysis = FootageAnalysisSchema.parse(analysisRead.value);
        if (analysis.analysisId !== asset.analysisId || analysis.assetId !== d.assetId || analysis.contentHash !== d.contentHash || !equal(analysis.authorization, d.authorization)) {
          throw new R.HarnessRefusal("analysis_not_of_declared_bytes", [`${entry.entryId}: the analysis does not bind exactly the declared bytes and authorization.`]);
        }
        sources.push({ entryId: entry.entryId, assetId: d.assetId, analysis, analysisSha256: analysisRead.sha256, candidateId: entry.candidateId });
        receipt.sources.push({ entryId: entry.entryId, assetId: d.assetId, contentHash: d.contentHash, sizeBytes: d.sizeBytes, analysisId: analysis.analysisId,
          analysis: null, mediaAsset: null, candidateId: null });
      }
      evidence.analysisFiles = sources.map(s => ({ entryId: s.entryId, analysisId: s.analysis.analysisId, fileSha256: s.analysisSha256 }));
      set("manifest_and_source_verification", "PASS", `${declared.declarations.length} declared source(s) re-hashed in full; analyses bind exactly the declared bytes and authorization.`);
    } catch (error) {
      set("manifest_and_source_verification", "FAIL", describe(error)); console.error(error);
      blockAfter("manifest_and_source_verification", R.SCENARIOS); return finish();
    }

    // ================================================================ 2. admissibility against the V0 rules (inspected, never repaired)
    let plan: R.OutputPlan, chosen: [R.CandidateFacts, R.CandidateFacts];
    try {
      const timeline = [sources[0]!, sources[1]!] as const;
      plan = R.planOutput(timeline, { sourceAudio: manifest.sourceAudio, outputResolution: manifest.outputResolution, realMedia: true });
      ({ chosen } = R.selectTimeline(timeline, [timeline[0].candidateId, timeline[1].candidateId], plan));
      chosen.forEach((c, i) => { receipt.sources[i]!.candidateId = c.candidateId; });
      evidence.outputPlan = plan; evidence.chosen = chosen;
      set("source_admissibility", "PASS", `${plan.frameRate.numerator}/${plan.frameRate.denominator} fps CFR on grid, ${plan.resolution.width}x${plan.resolution.height}, `
        + `audio ${plan.linkedAudio ? "linked" : "excluded by owner policy"}, clock ${plan.ticksPerSecond} ticks/s.`);
    } catch (error) {
      set("source_admissibility", "FAIL", describe(error)); console.error(error);
      blockAfter("source_admissibility", R.SCENARIOS); return finish();
    }
    try { await lstat(join(PINNED_TOOL_ROOT, "bin", "ffmpeg.exe")); await lstat(join(PINNED_TOOL_ROOT, "bin", "ffprobe.exe")); } catch {
      for (const s of R.SCENARIOS) if (scenarios[s].status === "NOT_EXERCISED") set(s, "UNAVAILABLE", "The pinned media runtime is not installed at the accepted tool root.");
      return finish();
    }

    // ================================================================ 3. revision-zero EditGraph and the baseline render
    const owner = manifest.renderAuthorization.owner, scope = { ...authority.scope, purpose: "local_evaluation" };
    const policy = R.realExecutionPolicyFor(scope, owner);
    let runtime: LocalEditRuntime, root: R.RealChain;
    try {
      if (runtimeRoot.length > MAX_RUNTIME_ROOT_LENGTH) throw new R.HarnessRefusal("runtime_root_path_too_long", [`The runtime root is ${runtimeRoot.length} characters; `
        + `the accepted runtime allows ${MAX_RUNTIME_ROOT_LENGTH}. Move the repository to a shorter path.`]);
      runtime = await createLocalEditRuntime({ runtimeRoot, allowedSourceRoots: [dirname(footagePath)], clock: systemRuntimeClock, sources: authority.sourceLocations });
    } catch (error) {
      set("baseline_render", "FAIL", `runtime: ${describe(error)}`); console.error(error); blockAfter("baseline_render", R.SCENARIOS); return finish();
    }
    try {
      root = await timed("chain", async () => R.buildRealChain({ scope: authority.scope, owner, run, plan, sourceAudio: manifest.sourceAudio,
        retentionExpiresAt: manifest.renderAuthorization.expiresAt, timeline: [{ ...sources[0]!, candidateId: chosen[0].candidateId }, { ...sources[1]!, candidateId: chosen[1].candidateId }],
        times: { world: now(), capability: now() } }));
      root.analyses.forEach(a => { for (const s of receipt.sources) if (s.assetId === a.assetId) { s.analysis = a.analysis; s.mediaAsset = a.media; } });
    } catch (error) {
      set("baseline_render", "FAIL", `revision-zero chain: ${describe(error)}`); console.error(error); blockAfter("baseline_render", R.SCENARIOS); return finish();
    }
    const authorityEvidence = R.artifactOf("b3d_owner_render_authorization", "Evidence", { scope, basis: "owner_explicit_render_authorization_v0",
      ...manifest.renderAuthorization, registrationDigest: authority.registrationDigest });
    let attempt = 0;
    /** Admission and DAG for one attempt, over bytes the owner-local authority re-verified in full after the media grants were issued. */
    const execution = async (chain: R.GraphChain) => {
      attempt += 1;
      const mediaGrant = now();
      if (manifest.renderAuthorization.authorizedAt > mediaGrant) throw new R.HarnessRefusal("render_authorization_not_in_effect", ["The owner's render authorization starts later."]);
      const assets = [...new Set(chain.graph.clipUses.filter(c => c.medium === "video").map(c => c.source.assetId))].sort();
      const verified: R.VerifiedSource[] = [], verificationEvidence = new Map<string, SuppliedArtifact>();
      for (const assetId of assets) {
        const v = await authority.verify(assetId);
        verified.push(v);
        verificationEvidence.set(assetId, R.artifactOf(`b3d_verification_${attempt}_${verified.length}`, "Evidence", { scope,
          basis: "owner_local_authority_full_byte_sha256_verification_v0", registrationDigest: authority.registrationDigest, ...v }));
      }
      const capability = now(), estimate = now(), issued = now(), admitted = now();
      return R.buildExecution(chain, { owner, authorityEvidence, resolver: R.OWNER_RESOLVER, verified, verificationEvidence,
        renderIntents: manifest.renderAuthorization.renderIntents, mediaGrantExpiresAt: manifest.renderAuthorization.expiresAt,
        times: { mediaGrant, capability, estimate, issued, admitted, expires: new Date(Date.parse(issued) + 3_600_000).toISOString() }, attempt, prefix: `b3d_attempt_${attempt}` });
    };
    observer = observeMediaSpawns();
    const rootChain = R.rootGraphChain(root);
    let parent: { x: R.RealExecution; v: ValidatedExecutionDag; receipt: SegmentedRenderExecutionReceipt; qc: TechnicalMediaQcReceipt };
    try {
      parent = await counted("baseline", async () => {
        const x = await execution(rootChain), p = await prepare(runtime, authority, x, policy);
        receipt.runtime = { ffmpegSha256: p.request.media.runtimeProbe.binaries.ffmpeg.sha256, ffprobeSha256: p.request.media.runtimeProbe.binaries.ffprobe.sha256 };
        const result = await executeAuthorizedSegmentedRender(await issueExecutablePermit(p.request));
        if (result.outcome !== "succeeded") throw new R.HarnessRefusal("baseline_render_failed", [`${result.failure.stage}:${result.failure.failureCode}`]);
        receipt.records.baselineDag = x.dag.dagId; receipt.records.baselineProgram = compileRenderProgram(p.v, x.artifacts).programId;
        receipt.records.baselineOutputSha256 = result.receipt.output.contentHash;
        set("baseline_render", "PASS", `Output ${result.receipt.output.sizeBytes} bytes, ${result.receipt.segments.length} segment(s), permit bound to the owner-local lifecycle authority.`);
        const qc = await runTechnicalMediaQc({ dag: p.v, receipt: result.receipt, runtime, toolRoot: PINNED_TOOL_ROOT });
        receipt.records.baselineQc = qc.qcReceiptId;
        if (qc.verdict !== "pass") { set("baseline_technical_qc", "FAIL", `QC verdict ${qc.verdict}.`); throw new R.HarnessRefusal("baseline_qc_failed", [qc.verdict]); }
        set("baseline_technical_qc", "PASS", "Independent technical QC passed.");
        evidence.baseline = { admission: x.admission, dag: x.dag, receipt: result.receipt, qc };
        return { x, v: p.v, receipt: result.receipt, qc };
      });
    } catch (error) {
      if (scenarios.baseline_render.status === "NOT_EXERCISED") set("baseline_render", "FAIL", describe(error));
      console.error(error); blockAfter("baseline_render", R.SCENARIOS); return finish();
    }

    // ================================================================ 4. observation and the critic (deterministic checks; no semantic critic port is authorized)
    const reviewPolicy = R.reviewPolicyFor(scope, owner, plan.resolution);
    try {
      const report: CriticReport = await counted("observation_and_critic", async () => {
        const reviewPlan = planReview({ dag: parent.v, artifacts: parent.x.artifacts, receipt: parent.receipt, qc: parent.qc, policy: reviewPolicy });
        const observed = await observeReviewTargets({ dag: parent.v, artifacts: parent.x.artifacts, receipt: parent.receipt, qc: parent.qc, policy: reviewPolicy, plan: reviewPlan,
          runtime, toolRoot: PINNED_TOOL_ROOT });
        receipt.records.baselineObservations = observed.observations.map(o => o.observationId);
        set("baseline_observation", "PASS", `${observed.observations.length} observation(s) decoded by the pinned runtime from the verified output.`);
        const r = await runCriticReview({ dag: parent.v, artifacts: parent.x.artifacts, receipt: parent.receipt, qc: parent.qc, policy: reviewPolicy,
          observations: observed.observations, attempt: 1 });
        evidence.review = { plan: reviewPlan, observations: observed.observations, report: r };
        return r;
      });
      receipt.records.criticReport = report.reportId;
      receipt.critic = { execution: "PASS", semanticCritic: report.semanticCritic.state === "present" ? "present" : "not_computed_no_semantic_critic_port",
        findings: report.findings.length, actionableRepairFinding: report.findings.length === 0 ? "NONE_OBSERVED" : "OBSERVED",
        autoRepair: report.findings.length === 0 ? "NOT_EXERCISED_NO_VALID_FINDING" : "NOT_EXERCISED_OUTSIDE_BATCH_3D_SCOPE" };
      set("critic_execution", "PASS", `Critic ran its deterministic checks: ${report.findings.length} finding(s); semantic critic not computed (no port authorized).`);
    } catch (error) {
      if (scenarios.baseline_observation.status === "NOT_EXERCISED") set("baseline_observation", "FAIL", describe(error));
      else set("critic_execution", "FAIL", describe(error));
      receipt.critic.execution = scenarios.critic_execution.status; console.error(error);
    }

    // ================================================================ 5. EditingHead and the state-only HARD_EXACT lock
    let project: LocalEditingProject, h0: E.CurrentEditingContext, h1: E.CurrentEditingContext;
    const interpret = (p: LocalEditingProject, request: E.EditorialRequest, action: E.IntentAction) =>
      p.interpret(request, { identity: R.VERIFICATION_INTERPRETER, async interpret() { return action; } });
    try {
      project = await openLocalEditingProject({ root: runtime.layout.root, scope, policy: E.createEditorialPolicy(scope, owner) });
      h0 = await project.initialize(root.graph, parent.x.artifacts);
      receipt.records.rootEditGraph = h0.graph.editGraphId; receipt.records.rootEditorialState = h0.state.stateId; receipt.records.rootEditingHead = h0.head.headId;
      set("editing_head_initialization", "PASS", "Revision-zero EditGraph, root EditorialState and initial EditingHead published.");
    } catch (error) { set("editing_head_initialization", "FAIL", describe(error)); console.error(error); blockAfter("editing_head_initialization", R.SCENARIOS); return finish(); }
    const a = E.targetOf(h0.graph, R.videoClip(h0, 0).clipUseId);
    try {
      h1 = await counted("state_only_lock", async () => {
        const request = R.verificationRequest(h0, "b3d_lock_first", "Keep the first shot exactly as it is.", a);
        const intent = await interpret(project, request, { kind: "lock_target", target: a });
        const files = await readdir(join(runtime.layout.root, "render-outputs")), next = await project.applyStateIntent(request, intent);
        const unchanged = equal(await readdir(join(runtime.layout.root, "render-outputs")), files);
        receipt.records.lockRequest = request.requestId; receipt.records.lockIntent = intent.intentId; receipt.records.lockedHead = next.head.headId;
        if (next.graph.editGraphId !== h0.graph.editGraphId || next.state.hardLocks.length !== 1 || !unchanged) throw new R.HarnessRefusal("lock_not_state_only", ["The lock changed more than state."]);
        return next;
      });
      const spawned = receipt.renderCounts.state_only_lock!;
      if (spawned.ffmpegRender + spawned.ffmpegOther + spawned.ffprobe !== 0) throw new R.HarnessRefusal("lock_started_media_process", ["A state-only lock started a media process."]);
      set("state_only_lock", "PASS", "HARD_EXACT lock published as a state-only head: same graph, no output change, no media process.");
    } catch (error) { set("state_only_lock", "FAIL", describe(error)); console.error(error); blockAfter("state_only_lock", R.SCENARIOS); return finish(); }

    // ================================================================ 6. failure atomicity, then the published trim revision (localized reuse)
    const childExecution = async (proposed: ReturnType<typeof E.proposeEditorialRevision>) => {
      const x = await execution(R.revisionGraphChain(rootChain, proposed.child, proposed.artifacts));
      return { x, v: openValidatedDag({ dag: x.dagArtifact.ref }, x.artifacts) };
    };
    const headId = async () => (await project.current()).head.headId;
    let firstProposal: Awaited<ReturnType<LocalEditingProject["propose"]>> | null = null, firstTrim: ReturnType<typeof R.trimRequest> | null = null;
    // The identities of the published trim's edit, from its first attempt: what the QC-failure attempt must differ from (R02-E).
    let trimA: R.RevisionIdentity | null = null;
    try {
      firstTrim = R.trimRequest(h1, "b3d_trim_second_a", plan);
      firstProposal = await project.propose(firstTrim.request, await interpret(project, firstTrim.request, firstTrim.action));
    } catch (error) {
      set("render_failure_atomicity", "FAIL", `trim proposal: ${describe(error)}`); set("cas_loser_refused", "NOT_EXERCISED", "The trim proposal failed.");
      set("qc_failure_atomicity", "NOT_EXERCISED", "The trim proposal failed."); console.error(error);
    }
    if (firstProposal !== null) try {
      await counted("render_failure", async () => {
        const c = await childExecution(firstProposal!), authorization = await project.authorize({ ...firstProposal, artifacts: c.x.artifacts, parentDag: parent.v, childDag: c.v });
        trimA = R.revisionIdentity(firstProposal!, c.x.dag, compileRenderProgram(c.v, c.x.artifacts));
        const p = await timed("render_failure.prepare", () => prepare(runtime, authority, c.x, policy));
        const outcome = await timed("render_failure.execute", () => project.execute(authorization, { ...p.request, toolRoot: PINNED_TOOL_ROOT, prior: { receipt: parent.receipt, qc: parent.qc },
          instrumentation: { async beforeAssembly() { throw new Error("Deliberate verification fault: render failure injected before assembly."); } } }));
        const current = await headId();
        if (outcome.outcome !== "render_failed" || current !== h1.head.headId) throw new R.HarnessRefusal("render_failure_advanced_head", [outcome.outcome]);
        set("render_failure_atomicity", "PASS", "An injected render failure returned render_failed; the current head did not advance.");
      });
    } catch (error) { if (scenarios.render_failure_atomicity.status === "NOT_EXERCISED") set("render_failure_atomicity", "FAIL", describe(error)); console.error(error); }
    // QC failure (R02-E): its own revision 0 -> 1 attempt while the locked revision-zero head is current, with an exact trim strictly smaller than
    // the published one. Its injected corruption touches only this attempt's output, whose identity no later scenario can produce.
    if (firstProposal !== null) try {
      await counted("qc_failure", async () => {
        const c0 = await project.current(), published = trimA, first = firstTrim;
        if (c0.head.headId !== h1.head.headId || published === null || first === null) {
          throw new R.HarnessRefusal("qc_failure_parent_not_current", ["The QC-failure attempt runs only from the locked revision-zero head, once the published trim's edit is known."]);
        }
        const parentExecution = R.revisionParent(c0, { v: parent.v, receipt: parent.receipt, qc: parent.qc });
        const distinct = R.trimRequest(c0, "b3d_trim_second_qc", plan, 1, first.trim.removedFrames);
        const proposed = await project.propose(distinct.request, await interpret(project, distinct.request, distinct.action)), c = await childExecution(proposed);
        const program = compileRenderProgram(c.v, c.x.artifacts), own = R.revisionIdentity(proposed, c.x.dag, program);
        const notDistinct = R.distinctRevisionRefusal(own, published, compileRenderProgram(parent.v, parent.x.artifacts));
        if (notDistinct.length > 0) throw new R.HarnessRefusal("qc_failure_child_not_distinct", notDistinct);
        const authorization = await project.authorize({ ...proposed, artifacts: c.x.artifacts, parentDag: parentExecution.parentDag, childDag: c.v });
        const p = await timed("qc_failure.prepare", () => prepare(runtime, authority, c.x, policy)), outputs = join(runtime.layout.root, "render-outputs");
        const existing = new Set(await readdir(outputs));
        const outcome = await timed("qc_failure.execute", () => project.execute(authorization, { ...p.request, toolRoot: PINNED_TOOL_ROOT, prior: parentExecution.prior,
          qcInstrumentation: { async afterIdentityEstablished() {
            const name = (await readdir(outputs)).find(n => !existing.has(n) && n.endsWith(".mp4"));
            if (name === undefined) throw new Error("Deliberate QC fault: this attempt published no new output.");
            await chmod(join(outputs, name), 0o666); await appendFile(join(outputs, name), new Uint8Array([0, 1, 2, 3]));
            evidence.qcFaultInjection = { output: name, appendedBytes: 4, basis: "deliberate_verification_fault_after_qc_identity_established" };
          } } }));
        const headAfter = await headId();
        evidence.qcFailure = { headBefore: c0.head.headId, headAfter, outcome: outcome.outcome, removedFrames: distinct.trim.removedFrames, keep: distinct.trim.keep,
          parent: { editGraphId: c0.graph.editGraphId, revision: c0.graph.revision, dagId: parent.v.dag.dagId, receiptId: parent.receipt.receiptId, qcReceiptId: parent.qc.qcReceiptId },
          child: { ...own, programId: program.programId }, distinctFrom: { ...published, removedFrames: first.trim.removedFrames },
          render: outcome.outcome === "render_failed" ? null : { receiptId: outcome.result.receipt.receiptId, output: outcome.result.receipt.output,
            segments: outcome.result.receipt.segments.map(s => ({ position: s.position, disposition: s.disposition })) },
          qc: outcome.outcome === "render_failed" ? null : outcome.qc };
        if (outcome.outcome !== "qc_failed" || headAfter !== c0.head.headId) throw new R.HarnessRefusal("qc_failure_advanced_head", [outcome.outcome]);
        set("qc_failure_atomicity", "PASS", `A distinct revision 0 -> 1 trim (${distinct.trim.removedFrames} frames) rendered; its output bytes changed after QC fixed their identity; `
          + "QC failed and the current head did not advance.");
      });
    } catch (error) { if (scenarios.qc_failure_atomicity.status === "NOT_EXERCISED") set("qc_failure_atomicity", "FAIL", describe(error)); console.error(error); }
    let h1p = h1;
    if (firstProposal !== null) try {
      await counted("cas_loser", async () => {
        const c = await childExecution(firstProposal!), authorization = await project.authorize({ ...firstProposal, artifacts: c.x.artifacts, parentDag: parent.v, childDag: c.v });
        const p = await timed("cas_loser.prepare", () => prepare(runtime, authority, c.x, policy));
        let concurrent: string | null = null, refusal: string | null = null;
        try {
          await timed("cas_loser.execute", () => project.execute(authorization, { ...p.request, toolRoot: PINNED_TOOL_ROOT, prior: { receipt: parent.receipt, qc: parent.qc }, instrumentation: { async beforeAssembly() {
            const request = R.verificationRequest(h1, "b3d_concurrent_preference", "Concurrent state-only action while a render runs.", a);
            concurrent = (await project.applyStateIntent(request, await interpret(project, request, { kind: "set_preference", target: a, value: "liked" }))).head.headId;
          } } }));
        } catch (error) { refusal = error instanceof E.EditorialControlError ? error.code : describe(error); }
        h1p = await project.current();
        if (refusal !== "stale_editing_head" || concurrent === null || h1p.head.headId !== concurrent) {
          throw new R.HarnessRefusal("cas_loser_became_current", [String(refusal)]);
        }
        set("cas_loser_refused", "PASS", "A render whose base head was superseded during execution was refused at CAS (stale_editing_head); the concurrent head stayed current.");
      });
    } catch (error) { if (scenarios.cas_loser_refused.status === "NOT_EXERCISED") set("cas_loser_refused", "FAIL", describe(error)); console.error(error); h1p = await project.current(); }
    let h2: E.CurrentEditingContext | null = null, second: ReturnType<typeof R.trimRequest> | null = null, secondIntent: E.EditorialIntent | null = null;
    try {
      h2 = await counted("trim_revision", async () => {
        second = R.trimRequest(h1p, "b3d_trim_second_b", plan); secondIntent = await interpret(project, second.request, second.action);
        const proposed = await project.propose(second.request, secondIntent), c = await childExecution(proposed);
        const parentProgram = compileRenderProgram(parent.v, parent.x.artifacts), childProgram = compileRenderProgram(c.v, c.x.artifacts);
        const authorization = await project.authorize({ ...proposed, artifacts: c.x.artifacts, parentDag: parent.v, childDag: c.v });
        const p = await timed("trim_revision.prepare", () => prepare(runtime, authority, c.x, policy));
        const accepted = await timed("trim_revision.execute", () => project.execute(authorization, { ...p.request, toolRoot: PINNED_TOOL_ROOT,
          prior: { receipt: parent.receipt, qc: parent.qc } }));
        if (accepted.outcome !== "published") throw new R.HarnessRefusal("trim_revision_not_published", [accepted.outcome]);
        const r = receipt.records;
        r.editorialRequest = second.request.requestId; r.intent = secondIntent.intentId; r.revisionPlan = proposed.plan.planId; r.graphDiff = proposed.diff.graphDiffId;
        r.childEditGraph = accepted.current.graph.editGraphId; r.childEditorialState = accepted.current.state.stateId; r.childEditingHead = accepted.current.head.headId;
        r.childDag = c.x.dag.dagId; r.childProgram = childProgram.programId; r.childOutputSha256 = accepted.result.receipt.output.contentHash; r.childQc = accepted.qc.qcReceiptId;
        const segments = accepted.result.receipt.segments;
        r.reusedSegments = segments.filter(s => s.disposition === "reused_verified_prior_artifact").map(s => childProgram.segments[s.position]!.segmentComputationId);
        r.recomputedSegments = segments.filter(s => s.disposition === "computed_by_this_execution").map(s => childProgram.segments[s.position]!.segmentComputationId);
        evidence.trim = { request: second.request, intent: secondIntent, plan: proposed.plan, diff: proposed.diff, keep: second.trim, impact: authorization.impact,
          parentProgram, childProgram, receipt: accepted.result.receipt, qc: accepted.qc, head: accepted.current.head, state: accepted.current.state };
        set("trim_revision_published", "PASS", `Exact-time trim of ${second.trim.removedFrames} frame(s) from the unlocked clip published through GraphDiff, child render, `
          + "independent QC and CAS; the lock was rebased unchanged.");
        const sameFirst = parentProgram.segments[0]!.segmentComputationId === childProgram.segments[0]!.segmentComputationId;
        const dispositions = segments.map(s => s.disposition).join(",");
        return { accepted, sameFirst, dispositions };
      }).then(({ accepted, sameFirst, dispositions }) => {
        const counts = receipt.renderCounts.trim_revision!;
        if (sameFirst && dispositions === "reused_verified_prior_artifact,computed_by_this_execution" && counts.ffmpegRender === 2) {
          set("localized_reuse", "PASS", "The locked clip's segment was reused by computation identity; only the changed segment and the assembly ran (2 render processes).");
        } else set("localized_reuse", "FAIL", `dispositions ${dispositions}; first segment identity ${sameFirst ? "unchanged" : "changed"}; render processes ${counts.ffmpegRender}.`);
        return accepted.current;
      });
    } catch (error) {
      if (scenarios.trim_revision_published.status === "NOT_EXERCISED") set("trim_revision_published", "FAIL", describe(error));
      console.error(error); blockAfter("trim_revision_published", ["localized_reuse"]);
    }

    // ================================================================ 7. refusals and the historical preference (state only)
    if (h2 !== null) {
      const current = h2;
      try {
        const before = observer.calls.length, locked = R.trimRequest(current, "b3d_trim_locked", plan, 0);
        const request = locked.request, intent = await interpret(project, request, locked.action);
        let code: string | null = null;
        try { await project.propose(request, intent); } catch (error) { code = error instanceof E.EditorialControlError ? error.code : describe(error); }
        receipt.refusals.lockedTarget = code;
        if (code !== "hard_lock_conflict" || await headId() !== current.head.headId || observer.calls.length !== before) throw new R.HarnessRefusal("locked_target_not_refused", [String(code)]);
        set("locked_target_refusal", "PASS", "A trim of the HARD_EXACT-locked clip was refused (hard_lock_conflict) with no media process and no head change.");
      } catch (error) { if (scenarios.locked_target_refusal.status === "NOT_EXERCISED") set("locked_target_refusal", "FAIL", describe(error)); console.error(error); }
      try {
        const before = observer.calls.length;
        const request = R.verificationRequest(current, "b3d_historical_preference", "I liked the intro from revision 0.", a);
        const h3 = await project.applyStateIntent(request, await interpret(project, request, { kind: "set_preference", target: a, value: "liked" }));
        receipt.records.preferenceHead = h3.head.headId;
        if (h3.graph.editGraphId !== current.graph.editGraphId || !equal(h3.state.preferences.at(-1)?.target, a) || observer.calls.length !== before) {
          throw new R.HarnessRefusal("preference_not_state_only", ["The historical preference changed more than state."]);
        }
        set("historical_preference_state_only", "PASS", "A preference about revision 0's first clip was recorded as a state-only head; the graph and outputs did not change.");
      } catch (error) { if (scenarios.historical_preference_state_only.status === "NOT_EXERCISED") set("historical_preference_state_only", "FAIL", describe(error)); console.error(error); }
      try {
        let code: string | null = null;
        if (second === null || secondIntent === null) throw new R.HarnessRefusal("stale_request_unavailable", ["No superseded request exists."]);
        const before = await headId();
        try { await project.propose((second as { request: E.EditorialRequest }).request, secondIntent); } catch (error) { code = error instanceof E.EditorialControlError ? error.code : describe(error); }
        receipt.refusals.staleRequest = code;
        if (code !== "stale_editing_head" || await headId() !== before) throw new R.HarnessRefusal("stale_request_not_refused", [String(code)]);
        set("stale_request_refusal", "PASS", "Re-proposing the request made against a superseded head was refused (stale_editing_head).");
      } catch (error) { if (scenarios.stale_request_refusal.status === "NOT_EXERCISED") set("stale_request_refusal", "FAIL", describe(error)); console.error(error); }
    } else blockAfter("trim_revision_published", ["locked_target_refusal", "historical_preference_state_only", "stale_request_refusal"]);
    receipt.records.finalCurrentHead = await headId();
    return finish();
  } catch (error) {
    console.error(error);
    for (const s of R.SCENARIOS) if (scenarios[s].status === "NOT_EXERCISED" && scenarios[s].detail === "Not reached.") set(s, "NOT_EXERCISED", `Stopped: ${describe(error)}`);
    return finish();
  } finally { observer?.restore(); }

  async function finish(): Promise<number> {
    const body = { receiptType: "Batch3DRealFootageReceipt", receiptVersion: "0.1.0", harness: R.HARNESS, git: receipt.git,
      evidenceClass: "owner_local_real_footage_run_pending_owner_review", direction: R.VERIFICATION_INPUT, manifest: receipt.manifest, runtime: receipt.runtime,
      sources: receipt.sources, records: receipt.records, refusals: receipt.refusals, renderCounts: receipt.renderCounts, critic: { ...receipt.critic, execution: scenarios.critic_execution.status },
      scenarios, claims: { realFootageVerified: "PENDING_OWNER_REVIEW", professionalEditingQuality: "NOT_VERIFIED", creativeQuality: "NOT_VERIFIED", autonomousDirector: "NOT_VERIFIED" } };
    const parsed = R.Batch3DReceiptSchema.safeParse(body), text = `${canonicalSerialize(parsed.success ? parsed.data : { invalidReceipt: body, issues: parsed.error.issues })}\n`;
    if (text.length > R.MAX_RECEIPT_BYTES) throw new Error("The receipt exceeds its bound.");
    await writeFile(join(runDirectory, "receipt.json"), text);
    await writeFile(join(runDirectory, "evidence.json"), JSON.stringify(evidence, (key, value: unknown) => key === "artifacts" || key === "bytes" ? undefined : value, 2));
    await writeFile(join(runDirectory, "timings.json"), JSON.stringify({ basis: "wall_clock_milliseconds_nondeterministic_not_part_of_receipt", timings }, null, 2));
    const passed = R.SCENARIOS.every(s => scenarios[s].status === "PASS");
    process.stdout.write(`${JSON.stringify({ receipt: relative(PROJECT_ROOT, join(runDirectory, "receipt.json")), valid: parsed.success,
      scenarios: Object.fromEntries(R.SCENARIOS.map(s => [s, scenarios[s].status])), allPassed: passed })}\n`);
    return parsed.success && passed ? 0 : 1;
  }
}

process.exitCode = await main().catch(error => { console.error(error); return 1; });
