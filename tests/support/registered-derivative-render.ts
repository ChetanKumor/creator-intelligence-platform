// H generated-media fixture only. Reuses accepted G registration and Gate 3D graph/grant builders.
// Source bytes, verification, staging, runtime/conformance probes, lifecycle handles, rendering and QC are native.
// Analysis sampling/measurements and the 1152-wide backend are explicitly STRUCTURAL/STUB, never model evidence.
import assert from "node:assert/strict";
import { readFile, mkdir } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { analyzeFootage } from "../../packages/footage-analyzer/index.js";
import { DEFAULT_FOOTAGE_CONFIG, FootageAuthorizationDerivedSchema, type FootageManifest } from "../../packages/footage-analyzer/protocol.js";
import { siglipConfiguration } from "../../packages/reference-analyzer/models.js";
import type { EmbeddingBackend } from "../../packages/reference-analyzer/embeddings.js";
import { canonicalizeLocalMedia, type CanonicalLosslessPublishedResult } from "../../scripts/media-ingest-local.js";
import { createOwnerMediaLifecycleAuthority, type OwnerMediaLifecycleAuthority } from "../../scripts/edit-render-owner-media-authority-local.js";
import { createLocalEditRuntime, systemRuntimeClock, type LocalEditRuntime } from "../../scripts/edit-runtime-local.js";
import { acquireExecutionClaim, openValidatedDag, registerDagAttempt, stageClaimedSource, type RuntimeCall, type RuntimeClock, type StagedSourceReceipt } from "../../packages/edit-runtime/index.js";
import { issueExecutablePermit, probePinnedMediaRuntime, probeStagedInputs } from "../../scripts/edit-render-local.js";
import { OWNER_MEDIA_AUTHORITY, OWNER_MEDIA_AUTHORITY_DIGEST } from "../../packages/edit-render/index.js";
import { cdBase, cdSeed } from "./canonical-lossless-cd.js";
import { PINNED_TOOL_ROOT } from "./edit-render-media.js";
import { cfrMetadata } from "./edit-render.js";
import { footageEnvironment } from "./footage.js";
import { OWNER, OWNER_SCOPE, rootOf, registration02, type Json } from "./owner-media-canonical.js";
import * as R from "./edit-real-footage.js";

class StructuralBackend implements EmbeddingBackend {
  async embed(ids: readonly string[]) {
    return { vectors: ids.map((sampleId, i) => ({ sampleId, vector: Array.from({ length: 1152 }, (_, k) => ((k * 7 + i * 13) % 17) / 17 + 0.01) })),
      version: "test-backend-not-a-model", device: "cpu" as const, fallback: false };
  }
}
export interface RegisteredFixture {
  base: string; sources: string; workspace: string; rootPath: string; betaPath: string;
  publication: CanonicalLosslessPublishedResult; registration: Json; execution: R.RealExecution;
}
export const makeAuthority = (f: Pick<RegisteredFixture, "registration" | "sources" | "workspace">, clock: RuntimeClock = systemRuntimeClock, registration = f.registration, workspace = f.workspace) =>
  createOwnerMediaLifecycleAuthority({ registration, baseDirectory: f.sources, canonicalWorkspace: workspace, canonicalToolRoot: PINNED_TOOL_ROOT, clock });

export async function registeredFixture(prefix = "h-generated-"): Promise<RegisteredFixture> {
  const base = await cdBase(prefix), sources = join(base, "sources"), workspace = join(base, "canonical");
  await mkdir(sources); await mkdir(workspace);
  const rootPath = await cdSeed(sources, "hevc", 90, 160, 30), betaPath = await cdSeed(sources, "h264", 90, 160, 30);
  const root = rootOf(await readFile(rootPath)), beta = rootOf(await readFile(betaPath));
  const publication = await canonicalizeLocalMedia({ sourcePath: rootPath, workspaceRoot: workspace, rootAuthorization: root, toolRoot: PINNED_TOOL_ROOT, clock: systemRuntimeClock });
  assert.equal(publication.outcome, "PUBLISHED_VERIFIED_NOT_AUTHORIZED");
  if (publication.outcome !== "PUBLISHED_VERIFIED_NOT_AUTHORIZED") assert.fail("generated HEVC did not publish a verified 0.4 derivative");
  const { canonicalizationConsent: _consent, ...inherited } = root;
  // Explicit fixture-owner declaration, independent of the non-authorizing ingest result.
  const authorization = FootageAuthorizationDerivedSchema.parse({ ...inherited, contentHash: publication.output.contentHash, sizeBytes: publication.output.sizeBytes,
    sourceType: "system_canonicalized", dateAdded: "2026-09-02T00:00:00.000Z",
    derivedFrom: { rootAuthorization: root, derivationId: publication.derivation.derivationId, recipeId: publication.derivation.plan.planId } });
  const registration: Json = { ...registration02({ originals: [{ entryId: "root", path: basename(rootPath), authorization: root },
    { entryId: "beta", path: basename(betaPath), authorization: beta }], derivatives: [{ entryId: "derived", rootEntryId: "root", authorization: authorization as unknown as Json,
      derivation: publication.derivation as unknown as Json }] }), artifactVersion: "0.3.0" };
  const preliminary = { base, sources, workspace, rootPath, betaPath, publication, registration };
  const authority = await makeAuthority(preliminary);
  const derivativeLocation = authority.sourceLocations.find(s => s.assetId === publication.output.assetId)!;
  const contents = { alpha: await readFile(derivativeLocation.path), beta: await readFile(betaPath) };
  const env = await footageEnvironment(["alpha", "beta"], 1);
  env.contents.set("alpha", contents.alpha); env.contents.set("beta", contents.beta);
  const manifest: FootageManifest = { ...env.manifest, assets: env.manifest.assets.map(a => ({ ...a, authorization: a.entryId === "entry_alpha" ? authorization : beta })) };
  const services = { ...env.services, async open(...args: Parameters<typeof env.services.open>) {
    const opened = await env.services.open(...args);
    return { ...opened, backend: new StructuralBackend(), expectedDimensions: async () => 1152,
      media: { ...opened.media, metadata: async () => ({ value: cfrMetadata({ seconds: 1, fps: 30, hasAudio: false }), version: "generated-fixture-table-native-conformance-required" }) } };
  } };
  const config = { ...DEFAULT_FOOTAGE_CONFIG, embedding: siglipConfiguration("so400m") }, jobId = "footage_00000000-0000-4000-8000-00000000b2b2";
  const analyzed = await analyzeFootage(manifest, config, jobId, services);
  assert.equal(analyzed.analyses.length, 2, "structural analyzer must admit both exact generated byte identities");
  const record = { jobId, status: "succeeded", modelRuns: env.telemetry.modelRuns(), events: [], timings: analyzed.timings, cache: analyzed.cacheStats, configuration: config };
  const timelineSources = analyzed.analyses.map((analysis, i) => ({ entryId: manifest.assets[i]!.entryId, analysis })) as [R.TimelineSource, R.TimelineSource];
  const plan = R.planOutput(timelineSources, { sourceAudio: "excluded", outputResolution: null, realMedia: false }), { chosen } = R.selectTimeline(timelineSources, [null, null], plan);
  const at = (offset: number) => new Date(Date.now() + offset).toISOString();
  const rootChain = R.buildRealChain({ scope: OWNER_SCOPE, owner: OWNER, run: { jobId, record }, plan, sourceAudio: "excluded", retentionExpiresAt: null,
    timeline: [{ ...timelineSources[0], candidateId: chosen[0].candidateId }, { ...timelineSources[1], candidateId: chosen[1].candidateId }],
    times: { world: at(-180_000), capability: at(-170_000) } });
  const graph = R.rootGraphChain(rootChain), mediaGrant = systemRuntimeClock.now();
  const verified = [];
  for (const assetId of [...new Set(graph.graph.clipUses.map(c => c.source.assetId))]) verified.push(await authority.verify(assetId));
  const verificationEvidence = new Map(verified.map((v, i) => [v.assetId, R.artifactOf(`h_native_source_verification_${i}`, "Evidence",
    { scope: rootChain.scope, basis: "registered_generated_source_full_byte_verification", registrationDigest: authority.registrationDigest, ...v })]));
  const now = systemRuntimeClock.now();
  const execution = R.buildExecution(graph, { owner: OWNER, authorityEvidence: R.artifactOf("h_explicit_render_authorization", "Evidence",
    { scope: rootChain.scope, basis: "explicit_generated_fixture_owner_registration_0_3", renderAuthorization: registration.renderAuthorization, registrationDigest: authority.registrationDigest }),
    resolver: { resolverId: OWNER_MEDIA_AUTHORITY.observerId, version: OWNER_MEDIA_AUTHORITY.version, implementationDigest: OWNER_MEDIA_AUTHORITY_DIGEST },
    verified, verificationEvidence, renderIntents: ["final"], mediaGrantExpiresAt: null,
    times: { mediaGrant, capability: now, estimate: now, issued: now, admitted: now, expires: at(3_600_000) }, attempt: 1, prefix: "h_registered_generated" });
  return { ...preliminary, execution };
}

export interface ClaimedRegistered {
  fixture: RegisteredFixture; authority: OwnerMediaLifecycleAuthority; runtime: LocalEditRuntime; call: RuntimeCall; staged: StagedSourceReceipt[];
}
export async function claimRegistered(fixture: RegisteredFixture, options: { clock?: RuntimeClock; authority?: OwnerMediaLifecycleAuthority;
  mappings?: { assetId: string; path: string }[]; execution?: R.RealExecution; runtimePrefix?: string } = {}): Promise<ClaimedRegistered> {
  const clock = options.clock ?? systemRuntimeClock, authority = options.authority ?? await makeAuthority(fixture, clock);
  const execution = options.execution ?? fixture.execution, dag = openValidatedDag({ dag: execution.dagArtifact.ref }, execution.artifacts);
  const allowed = new Set(dag.admission.sources.map(s => s.assetId)), locations = authority.sourceLocations.filter(s => allowed.has(s.assetId));
  const runtimeRoot = await cdBase(options.runtimePrefix ?? "h-runtime-");
  const runtime = await createLocalEditRuntime({ runtimeRoot, allowedSourceRoots: [fixture.sources, dirname(locations.find(s => s.assetId === fixture.publication.output.assetId)!.path)],
    sources: options.mappings ?? locations, clock });
  await registerDagAttempt(dag, execution.artifacts, runtime);
  const { ownership } = await acquireExecutionClaim(dag, { workerId: "worker_h_generated" }, runtime);
  const call: RuntimeCall = { dag, runtime, ownership, artifacts: execution.artifacts }, staged = [];
  for (const s of dag.admission.sources) staged.push(await stageClaimedSource(call, { assetId: s.assetId }));
  return { fixture, authority, runtime, call, staged };
}
export async function prepareRegistered(c: ClaimedRegistered) {
  const lifecycle = [];
  for (const s of c.staged) lifecycle.push(await c.authority.observe(c.call, s));
  const media = await probePinnedMediaRuntime(c.call, { toolRoot: PINNED_TOOL_ROOT }), conformance = await probeStagedInputs(c.call, media, c.staged);
  return { call: c.call, media, staged: c.staged, lifecycle, conformance, policy: R.realExecutionPolicyFor(c.call.dag.dag.scope, OWNER) };
}
export const permitRegistered = async (c: ClaimedRegistered) => issueExecutablePermit(await prepareRegistered(c));
