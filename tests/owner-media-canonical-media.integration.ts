// Gate 7 Batch 3E-B1B: B1B-P07 and B1B-P08 through the live trusted boundary. The owner-media registry's own handles observe a declared
// canonical derivative and an original; the pinned runtime is really probed (FFmpeg and ffprobe report their own version and component
// listings; nothing is decoded); permits are requested through the unchanged issueExecutablePermit. The chain and the derivative's bytes are
// the STRUCTURAL fixtures of tests/support/owner-media-canonical.ts (opaque bytes, label digests): no permit can be valid over them and none
// is sought. What is proven: a deleted, expired or stale lineage refuses at issuance, before any render process exists, and nothing but a
// genuine permit can start a render. A real derived source rendered end to end is NOT claimed here (3E-C).
import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { mkdtemp, readdir, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EDIT_RENDER_ERROR_CODES, EditRenderError, createRealExecutionPolicy } from "../packages/edit-render/index.js";
import { EditRuntimeError } from "../packages/edit-runtime/index.js";
import { createOwnerMediaLifecycleAuthority, type TrustedOwnerMediaLifecycleObservation } from "../scripts/edit-render-owner-media-authority-local.js";
import { executeAuthorizedRender, issueExecutablePermit, probePinnedMediaRuntime } from "../scripts/edit-render-local.js";
import { observeMediaSpawns, PINNED_TOOL_ROOT } from "./support/edit-render-media.js";
import * as R from "./support/edit-real-footage.js";
import { OWNER, claimStructural, derivedStructuralChain, structuralRegistry, type Claimed, type DerivedStructuralChain } from "./support/owner-media-canonical.js";

async function refusal(run: () => unknown): Promise<string> {
  try { await run(); } catch (error) {
    if (error instanceof EditRenderError) { assert.ok((EDIT_RENDER_ERROR_CODES as readonly string[]).includes(error.code), error.code); return error.code; }
    if (error instanceof EditRuntimeError) return `runtime:${error.code}`;
    assert.fail(`expected an owned refusal, received ${String(error)}`);
  }
  assert.fail("expected an owned refusal");
}
async function scratch(t: TestContext): Promise<string> {
  const directory = await realpath(await mkdtemp(join(tmpdir(), "gate7-b1b-permit-")));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}
async function entries(path: string): Promise<string[] | null> { try { return (await readdir(path)).sort(); } catch { return null; } }
let chain: Promise<DerivedStructuralChain> | undefined;
/** One claimed attempt of the structural derived chain, its registry, live observations of both sources and a real pinned-runtime probe. */
async function live(t: TestContext) {
  const c: Claimed = await claimStructural(t, await (chain ??= derivedStructuralChain()));
  const r = await structuralRegistry(await scratch(t), await chain);
  const authority = await createOwnerMediaLifecycleAuthority({ registration: r.registration, baseDirectory: r.base, clock: c.env.runtime.clock, canonicalWorkspace: r.workspace });
  const handles: TrustedOwnerMediaLifecycleObservation[] = [];
  for (const s of c.staged) handles.push(await authority.observe(c.call, s));
  return { c, r, authority, handles };
}
/** The harness policy with only the lifecycle-observation window lowered (the runtime and capability windows stay 60 s). */
function policyWith(c: Claimed, lifecycleMilliseconds: number) {
  const body = structuredClone(R.realExecutionPolicyFor(c.v.dag.scope, OWNER)) as unknown as Record<string, unknown>;
  delete body.policyId;
  return createRealExecutionPolicy({ ...body, freshness: { ...(body.freshness as object), maxLifecycleObservationAgeMilliseconds: lifecycleMilliseconds } });
}
const RENDER_MARKS = ["-filter_complex", "h264_metadata=sample_aspect_ratio=1/1", "rawvideo", "framemd5"];

test("B1B-P07 a deleted, expired or stale root refuses at permit issuance, before any render", async t => {
  // The current lineage passes the lifecycle checks and reaches the conformance requirement (none is supplied: no permit is sought).
  const current = await live(t), media = await probePinnedMediaRuntime(current.c.call, { toolRoot: PINNED_TOOL_ROOT });
  assert.deepEqual(media.capabilityProbe.findings.filter(f => f.state !== "AVAILABLE"), [], "the pinned runtime offers every capability the chain needs");
  const issue = (x: Awaited<ReturnType<typeof live>>, m: typeof media, policy = R.realExecutionPolicyFor(x.c.v.dag.scope, OWNER)) =>
    issueExecutablePermit({ call: x.c.call, media: m, staged: x.c.staged, lifecycle: x.handles, conformance: [], policy });
  assert.equal(await refusal(() => issue(current, media)), "input_conformance_missing", "the control passes every lineage check");
  // Deleted: the root, which is not itself in the timeline, is deleted after its derivative was observed.
  current.authority.requestDeletion(current.r.rootId);
  assert.equal(await refusal(() => issue(current, media)), "lifecycle_deleted");
  // Expired: a fresh registry whose root's authorization ends now.
  const expiring = await live(t), expiringMedia = await probePinnedMediaRuntime(expiring.c.call, { toolRoot: PINNED_TOOL_ROOT });
  expiring.authority.setExpiry(expiring.r.rootId, expiring.c.env.runtime.clock.now());
  assert.equal(await refusal(() => issue(expiring, expiringMedia)), "lifecycle_expired");
  // Stale: observations older than the owner's lifecycle window refuse even though nothing was deleted (the runtime probe is fresh).
  const stale = await live(t);
  stale.c.env.clock.advance(2_000);
  const staleMedia = await probePinnedMediaRuntime(stale.c.call, { toolRoot: PINNED_TOOL_ROOT });
  assert.equal(await refusal(() => issue(stale, staleMedia, policyWith(stale.c, 1_000))), "lifecycle_stale");
  for (const x of [current, expiring, stale]) {
    assert.deepEqual(((await entries(join(x.c.env.runtimeRoot, "render-execution-starts"))) ?? []).length, 0, "no execution start was ever recorded");
    assert.deepEqual(((await entries(join(x.c.env.runtimeRoot, "render-outputs"))) ?? []).length, 0, "no output exists");
  }
});

test("B1B-P08 no render process starts without a valid permit", async t => {
  const observer = observeMediaSpawns(); t.after(observer.restore);
  const x = await live(t), media = await probePinnedMediaRuntime(x.c.call, { toolRoot: PINNED_TOOL_ROOT });
  const queries = observer.calls.length;
  assert.ok(queries > 0, "the pinned runtime was really probed");
  x.authority.requestDeletion(x.r.rootId);
  assert.equal(await refusal(() => issueExecutablePermit({ call: x.c.call, media, staged: x.c.staged, lifecycle: x.handles, conformance: [],
    policy: R.realExecutionPolicyFor(x.c.v.dag.scope, OWNER) })), "lifecycle_deleted");
  for (const forged of [undefined, null, {}, { binding: {} }, media, x.handles[0]]) {
    assert.equal(await refusal(() => executeAuthorizedRender(forged as never)), "permit_required", "only a genuine permit can start a render");
  }
  observer.restore();
  assert.equal(observer.calls.length, queries, "no process started after the runtime probe");
  assert.deepEqual(observer.calls.filter(c => RENDER_MARKS.some(mark => c.arguments.includes(mark))), [], "no render, canonicalization or decode process ever ran");
  assert.deepEqual(((await entries(join(x.c.env.runtimeRoot, "render-execution-starts"))) ?? []).length, 0);
  assert.deepEqual(((await entries(join(x.c.env.runtimeRoot, "render-outputs"))) ?? []).length, 0);
});
