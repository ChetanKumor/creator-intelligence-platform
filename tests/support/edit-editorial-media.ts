import assert from "node:assert/strict";
import type { TestContext } from "node:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { acquireExecutionClaim, openValidatedDag, registerDagAttempt, stageClaimedSource, type RuntimeCall, type StagedSourceReceipt } from "../../packages/edit-runtime/index.js";
import { createSyntheticFixtureLifecycleAuthority, type TrustedLifecycleObservation } from "../../scripts/edit-render-fixture-authority-local.js";
import { createLocalEditRuntime, systemRuntimeClock } from "../../scripts/edit-runtime-local.js";
import { executeAuthorizedSegmentedRender, issueExecutablePermit, probePinnedMediaRuntime, probeStagedInputs } from "../../scripts/edit-render-local.js";
import { runTechnicalMediaQc } from "../../scripts/edit-media-qc-local.js";
import { createReviewPolicy, planReview } from "../../packages/edit-review/index.js";
import { observeReviewTargets } from "../../scripts/edit-observation-local.js";
import { type SegmentedRenderExecutionReceipt, type TechnicalMediaQcReceipt } from "../../packages/edit-render/index.js";
import type { DagFixture } from "./edit-execution.js";
import { cfrMetadata, realPolicy, renderGraph } from "./edit-render.js";
import { PINNED_TOOL_ROOT, PROJECT_ROOT, generateSource } from "./edit-render-media.js";

export async function editorialMedia(t: TestContext, preserveForReview = false) {
  await mkdir(join(PROJECT_ROOT, ".test-artifacts"), { recursive: true });
  const base = await mkdtemp(join(PROJECT_ROOT, ".test-artifacts", "b3c-media-"));
  if (!preserveForReview) t.after(() => rm(base, { recursive: true, force: true }));
  const authority = await createSyntheticFixtureLifecycleAuthority({ root: base, clock: systemRuntimeClock });
  const paths: string[] = [], fixtures = [];
  for (const name of ["a", "b"]) {
    paths.push(await generateSource(authority.fixtureDirectory, `${name}.mov`, { video: name === "a" ? { pattern: "testsrc2" }
      : { pattern: "color", color: "0x3060c0" }, tone: null }));
    fixtures.push(await authority.registerGeneratedFixture(`${name}.mov`));
  }
  const root = join(base, "runtime"); await mkdir(root);
  const runtime = await createLocalEditRuntime({ runtimeRoot: root, allowedSourceRoots: [authority.fixtureDirectory], clock: systemRuntimeClock,
    sources: fixtures.map((f, i) => ({ assetId: f.assetId, path: paths[i]! })) });
  const g = renderGraph({ sources: fixtures.map((f, i) => ({ key: `b3c_${i}`, hash: f.contentHash, sizeBytes: f.sizeBytes,
    metadata: cfrMetadata({ hasAudio: false }), range: i === 0 ? { startSeconds: 0, endSeconds: 2 } : { startSeconds: 1, endSeconds: 3 } })), cut: true });
  return { base, runtime, authority, g, fixtures };
}
export type EditorialMedia = Awaited<ReturnType<typeof editorialMedia>>;
export async function prepareEditorialMedia(m: EditorialMedia, x: DagFixture) {
  const v = openValidatedDag({ dag: x.dagArtifact.ref }, x.artifacts);
  await registerDagAttempt(v, x.artifacts, m.runtime);
  const { ownership } = await acquireExecutionClaim(v, { workerId: "worker_batch3c" }, m.runtime);
  const call: RuntimeCall = { dag: v, runtime: m.runtime, ownership, artifacts: x.artifacts }, staged: StagedSourceReceipt[] = [];
  for (const s of v.admission.sources) staged.push(await stageClaimedSource(call, { assetId: s.assetId }));
  const lifecycle: TrustedLifecycleObservation[] = []; for (const s of staged) lifecycle.push(await m.authority.observe(call, s));
  const media = await probePinnedMediaRuntime(call, { toolRoot: PINNED_TOOL_ROOT }), conformance = await probeStagedInputs(call, media, staged);
  return { v, request: { call, media, staged, lifecycle, conformance, policy: realPolicy() } };
}
export async function renderEditorialParent(m: EditorialMedia, x: DagFixture) {
  const p = await prepareEditorialMedia(m, x), result = await executeAuthorizedSegmentedRender(await issueExecutablePermit(p.request));
  assert.equal(result.outcome, "succeeded"); if (result.outcome !== "succeeded") throw new Error("parent render failed");
  const qc = await runTechnicalMediaQc({ dag: p.v, receipt: result.receipt, runtime: m.runtime, toolRoot: PINNED_TOOL_ROOT }); assert.equal(qc.verdict, "pass");
  return { ...p, result, receipt: result.receipt, qc };
}
export async function observeEditorialOutput(m: EditorialMedia, x: DagFixture, receipt: SegmentedRenderExecutionReceipt, qc: TechnicalMediaQcReceipt) {
  const dag = openValidatedDag({ dag: x.dagArtifact.ref }, x.artifacts);
  const policy = createReviewPolicy({ scope: dag.dag.scope, author: { kind: "owner", actorId: "owner_synthetic" },
    windows: { boundaryHalfWindowFrames: 15, globalWindowFrames: 30, interiorSamples: 3 },
    budget: { maxObservations: 16, maxDeliveredFrames: 64, maxDecodedPixelFrames: 1_000_000_000, maxEvidenceBytes: 8_388_608, maxFindings: 32,
      maxExplanationCharacters: 400, maxReviewAttempts: 2, maxTranscriptCharacters: 16384, maxDecodeMilliseconds: 120000 } });
  const plan = planReview({ dag, artifacts: x.artifacts, receipt, qc, policy });
  return observeReviewTargets({ dag, artifacts: x.artifacts, receipt, qc, policy, plan, runtime: m.runtime, toolRoot: PINNED_TOOL_ROOT });
}
