// Gate 7 Batch 3D: focused hostile tests of the owner-local real-media lifecycle authority and of its place in the unchanged permit
// binder. They run over opaque test bytes, not media. Registration tests declare those bytes as owner_supplied only to exercise the
// registry's own checks. The positive real-media path (a live owner handle reaching a permit) needs owner real footage, its accepted
// Phase-2 analysis and the pinned runtime, so it is exercised only by the owner-local Batch-3D run. No process, media, model or network.
import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { mkdir, mkdtemp, rename, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ts from "typescript";
import { identify, type SuppliedArtifact } from "../packages/editorial/common.js";
import { EditRuntimeError, acquireExecutionClaim, openValidatedDag, registerDagAttempt, stageClaimedSource, type ClaimOwnership, type ExecutionClaim,
  type RuntimeCall, type StagedSourceReceipt, type ValidatedExecutionDag } from "../packages/edit-runtime/index.js";
import { EDIT_RENDER_ERROR_CODES, EditRenderError, FIXTURE_AUTHORITY_DIGEST, OWNER_MEDIA_AUTHORITY_DIGEST, OWNER_RENDER_AUTHORIZATION_STATEMENT, PINNED_MEDIA_RUNTIME,
  RENDER_ENVIRONMENT, SYNTHETIC_FIXTURE_LIFECYCLE_AUTHORITY, buildFixtureLifecycleObservation, buildOwnerMediaLifecycleObservation, buildRealCapabilityProbe,
  buildRealRuntimeProbe, buildStagedInputConformance, checkOwnerMediaProvenance, compileRenderProgram, evaluateRealExecutionEvidence, ownerMediaDeclarations,
  type CheckTiming, type OwnerMediaLifecycleObservation, type RealEvidenceBundle, type RuntimeObservation } from "../packages/edit-render/index.js";
import { OwnerMediaLifecycleAuthority, TrustedOwnerMediaLifecycleObservation, createOwnerMediaLifecycleAuthority } from "../scripts/edit-render-owner-media-authority-local.js";
import { issueExecutablePermit } from "../scripts/edit-render-local.js";
import { mergeArtifacts, type DagFixture } from "./support/edit-execution.js";
import { RUNTIME_EVIDENCE, deterministicBytes, runtimeEnv, sha256Hex, type RuntimeEnv } from "./support/edit-runtime.js";
import { cfrMetadata, realPolicy, renderDag, renderGraph } from "./support/edit-render.js";
import { artifact } from "./support/planning.js";

// ---------------------------------------------------------------- helpers
async function refusal(run: () => unknown): Promise<string> {
  try { await run(); } catch (error) {
    if (error instanceof EditRenderError) { assert.ok((EDIT_RENDER_ERROR_CODES as readonly string[]).includes(error.code), error.code); return error.code; }
    if (error instanceof EditRuntimeError) return `runtime:${error.code}`;
    assert.fail(`expected an owned refusal, received ${String(error)}`);
  }
  assert.fail("expected an owned refusal");
}
/** Coordinated forgery: mutate a copy, then recompute its own content identity so only semantic checks can object. */
function reidentify<T extends object>(value: T, key: string, namespace: string, mutate: (copy: T) => void): T {
  const copy = structuredClone(value); mutate(copy);
  const body = { ...copy } as Record<string, unknown>; delete body[key];
  return identify(namespace, key, body) as unknown as T;
}
const timingAt = (t: string): CheckTiming => ({ checkStartedAt: t, observedAt: t, checkCompletedAt: t, observedAtBasis: "check_started_lower_bound" });
const SESSION = { scheme: "sha256_of_ephemeral_session_token_v0" as const, digest: sha256Hex("batch3d-lifecycle-test-session") };
const OWNER_SCOPE = { creatorId: "creator_batch3d_test", projectId: "project_batch3d_test" };
const OWNER_PROVENANCE = { mediaOrigin: "creator_upload" as const, sourceType: "owner_supplied" as const, authorizationBasis: "owner_created" as const };

// Real-shaped pinned-runtime evidence, copied in minimal form from the accepted Batch-2B pure tests (tests/edit-render.test.ts).
const listing = (title: string, legend: string[], separator: string, rows: string[]) => [`${title}:`, ...legend, separator, ...rows].join("\n");
const CODEC_LEGEND = [" V..... = Video", " A..... = Audio", " S..... = Subtitle", " .F.... = Frame-level multithreading", " ..S... = Slice-level multithreading",
  " ...X.. = Codec is experimental", " ....B. = Supports draw_horiz_band", " .....D = Supports direct rendering method 1"];
const FILTER_NAMES = ["trim", "atrim", "setpts", "asetpts", "scale", "setsar", "format", "aformat", "concat", "settb", "asettb", "split", "asplit", "null", "colorchannelmixer", "eq"];
const FORMAT_LEGEND = [" D.. = Demuxing supported", " .E. = Muxing supported", " ..d = Is a device"];
function observation(): RuntimeObservation {
  return { ffmpeg: { sha256: PINNED_MEDIA_RUNTIME.ffmpeg.sha256, sizeBytes: PINNED_MEDIA_RUNTIME.ffmpeg.sizeBytes,
    versionText: `ffmpeg version ${PINNED_MEDIA_RUNTIME.ffmpeg.reportedVersion} Copyright (c) 2000-2026 the FFmpeg developers\nbuilt with gcc 16.1.0\nconfiguration: --enable-gpl --enable-libx264`,
    buildConfigurationText: "\n  configuration:\n    --enable-gpl\n    --enable-version3\n    --enable-libx264\n" },
  ffprobe: { sha256: PINNED_MEDIA_RUNTIME.ffprobe.sha256, sizeBytes: PINNED_MEDIA_RUNTIME.ffprobe.sizeBytes,
    versionText: `ffprobe version ${PINNED_MEDIA_RUNTIME.ffprobe.reportedVersion} Copyright (c) 2007-2026 the FFmpeg developers` },
  listings: {
    encoders: listing("Encoders", CODEC_LEGEND, " ------", [" V....D libx264              libx264 H.264 / AVC / MPEG-4 AVC / MPEG-4 part 10 (codec h264)",
      " A....D aac                  AAC (Advanced Audio Coding)", " A....D pcm_s16le            PCM signed 16-bit little-endian"]),
    decoders: listing("Decoders", CODEC_LEGEND, " ------", [" VFS..D h264                 H.264 / AVC / MPEG-4 AVC / MPEG-4 part 10",
      " A....D aac                  AAC (Advanced Audio Coding)", " A....D pcm_s16le            PCM signed 16-bit little-endian"]),
    filters: listing("Filters", ["  T.. = Timeline support", "  .S. = Slice threading", "  A = Audio input/output", "  V = Video input/output",
      "  N = Dynamic number and/or type of input/output", "  | = Source or sink filter"], "  ------", FILTER_NAMES.map(n => ` .. ${n.padEnd(16)} V->V       The ${n} filter.`)),
    muxers: listing("Formats", FORMAT_LEGEND, " ---", ["  E  mov             QuickTime / MOV", "  E  mp4             MP4 (MPEG-4 Part 14)"]),
    demuxers: listing("Formats", FORMAT_LEGEND, " ---", [" D   mov,mp4,m4a,3gp,3g2,mj2 QuickTime / MOV"]),
    protocols: ["Supported file protocols:", "Input:", "  fd", "  file", "Output:", "  fd", "  file"].join("\n") },
  platform: RENDER_ENVIRONMENT.platform, arch: RENDER_ENVIRONMENT.arch };
}
function sourceProbeJson(audio: boolean): string {
  const streams: unknown[] = [{ index: 0, codec_name: "h264", codec_type: "video", width: 90, height: 160, sample_aspect_ratio: "1:1", pix_fmt: "yuv420p", time_base: "1/15360", start_pts: 0 }];
  if (audio) streams.push({ index: 1, codec_name: "pcm_s16le", codec_type: "audio", sample_rate: "48000", channels: 2, channel_layout: "stereo", time_base: "1/48000", start_pts: 0 });
  const list: unknown[] = Array.from({ length: 120 }, (_, i) => ({ stream_index: 0, pts: i * 512 }));
  if (audio) for (let s = 0; s < 192_000; s += 1024) list.push({ stream_index: 1, pts: s, nb_samples: Math.min(1024, 192_000 - s) });
  return JSON.stringify({ frames: list, programs: [], stream_groups: [], streams, format: { format_name: "mov,mp4,m4a,3gp,3g2,mj2" } });
}

// A replay-valid two-source synthetic chain over opaque bytes, claimed and staged through the accepted Batch-2A runtime.
const SIZE_A = 3_000_001, SIZE_B = 2_000_003;
const bytesA = deterministicBytes("gate7-batch3d-lifecycle-a", SIZE_A), bytesB = deterministicBytes("gate7-batch3d-lifecycle-b", SIZE_B);
const graphAB = renderGraph({ sources: [{ key: "b3d_a", hash: sha256Hex(bytesA), sizeBytes: SIZE_A, metadata: cfrMetadata() },
  { key: "b3d_b", hash: sha256Hex(bytesB), sizeBytes: SIZE_B, metadata: cfrMetadata(), range: { startSeconds: 1, endSeconds: 3 } }], cut: true });
const finalAB: DagFixture = renderDag(graphAB);
interface Claimed { env: RuntimeEnv; v: ValidatedExecutionDag; claim: ExecutionClaim; ownership: ClaimOwnership; call: RuntimeCall }
async function claimed(t: TestContext): Promise<Claimed> {
  const v = openValidatedDag({ dag: finalAB.dagArtifact.ref }, finalAB.artifacts), byAsset = new Map([bytesA, bytesB].map(b => [`asset_${sha256Hex(b)}`, b]));
  const env = await runtimeEnv({ sources: v.admission.sources.map((s, i) => ({ assetId: s.assetId, bytes: byAsset.get(s.assetId)!, name: `take_${i}.bin` })) });
  t.after(env.cleanup);
  await registerDagAttempt(v, finalAB.artifacts, env.runtime);
  const { claim, ownership } = await acquireExecutionClaim(v, { workerId: "worker_batch3d" }, env.runtime);
  return { env, v, claim, ownership, call: { dag: v, runtime: env.runtime, ownership, artifacts: mergeArtifacts(finalAB.artifacts, RUNTIME_EVIDENCE) } };
}
async function stageAll(c: Claimed): Promise<StagedSourceReceipt[]> {
  const staged: StagedSourceReceipt[] = [];
  for (const source of c.v.admission.sources) staged.push(await stageClaimedSource(c.call, { assetId: source.assetId }));
  return staged;
}
/** Every non-lifecycle record as the trusted adapters build them, at the runtime clock's current instant. */
function probesAt(c: Claimed, staged: readonly StagedSourceReceipt[]): Omit<RealEvidenceBundle, "lifecycle"> {
  const timing = timingAt(c.env.runtime.clock.now()), program = compileRenderProgram(c.v, c.call.artifacts), obs = observation();
  return { policy: realPolicy(), program, staged,
    runtimeProbe: buildRealRuntimeProbe({ dag: c.v, claim: c.claim, observation: obs, timing, session: SESSION }),
    capabilityProbe: buildRealCapabilityProbe({ dag: c.v, artifacts: c.call.artifacts, claim: c.claim, observation: obs, timing, session: SESSION }),
    conformance: staged.map(s => buildStagedInputConformance({ dag: c.v, claim: c.claim, stagedSource: s, program,
      probeJson: sourceProbeJson(program.inputs.find(i => i.assetId === s.source.assetId)!.audio.required), timing, session: SESSION })) };
}
function ownerRecord(c: Claimed, s: StagedSourceReceipt, o: { state?: { deletionRequestedAt: string | null; expiresAt: string | null } } = {}): OwnerMediaLifecycleObservation {
  const now = c.env.runtime.clock.now();
  return buildOwnerMediaLifecycleObservation({ dag: c.v, claim: c.claim, stagedSource: s, provenance: OWNER_PROVENANCE,
    declaration: { registrationDigest: "e".repeat(64), entryId: "entry_declared", contentHash: s.expected.contentHash, sizeBytes: s.expected.sizeBytes, verifiedAt: now },
    state: o.state ?? { deletionRequestedAt: null, expiresAt: null }, timing: timingAt(now), session: SESSION });
}
const fixtureRecord = (c: Claimed, s: StagedSourceReceipt) => buildFixtureLifecycleObservation({ dag: c.v, claim: c.claim, stagedSource: s,
  state: { deletionRequestedAt: null, expiresAt: null }, timing: timingAt(c.env.runtime.clock.now()), session: SESSION });
async function stagedAfterClaim(t: TestContext) {
  const c = await claimed(t), staged = await stageAll(c);
  c.env.clock.advance(250);
  return { c, staged };
}

// Owner registrations over files written into a fresh temporary directory. Declared paths are relative to that directory, exactly as
// the accepted Phase-2 analyzer resolves an AuthorizedFootageSet's paths; nothing is discovered.
async function scratch(t: TestContext): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "gate7-b3d-owner-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}
interface Declared { entryId: string; path: string; abs: string; bytes: Uint8Array; authorization?: Record<string, unknown> }
function registration(files: readonly Declared[], patch: { renderAuthorization?: Record<string, unknown> } = {}) {
  return { artifactType: "OwnerMediaRegistration", artifactVersion: "0.1.0", stability: "internal_pre_stable",
    footage: { manifestType: "AuthorizedFootageSet", schemaVersion: "1.0.0", ...OWNER_SCOPE,
      assets: files.map(f => ({ entryId: f.entryId, path: f.path, authorization: { manifestType: "AuthorizedFootage", schemaVersion: "1.0.0", contentHash: sha256Hex(f.bytes),
        sizeBytes: f.bytes.length, sourceType: "owner_supplied", authorizationBasis: "owner_created", allowedPurposes: ["local_footage_analysis", "local_evaluation"],
        dateAdded: "2026-09-29T00:00:00.000Z", ...OWNER_SCOPE, ...f.authorization } })) },
    renderAuthorization: { statement: OWNER_RENDER_AUTHORIZATION_STATEMENT, owner: { kind: "owner", actorId: "owner_batch3d_test" }, renderIntents: ["final"],
      authorizedAt: "2026-09-29T00:00:00.000Z", expiresAt: null, ...patch.renderAuthorization } };
}
const CLOCK = Object.freeze({ now: () => "2026-09-29T12:00:00.000Z" });
async function written(directory: string, name: string, bytes: Uint8Array): Promise<Declared> {
  const abs = join(directory, ...name.split("/")); await mkdir(join(abs, ".."), { recursive: true }); await writeFile(abs, bytes);
  return { entryId: name.replace(/[^A-Za-z0-9]/g, "_"), path: name, abs, bytes };
}
const create = (directory: string, files: readonly Declared[], patch: Parameters<typeof registration>[1] = {}, clock: { now(): string } = CLOCK) =>
  createOwnerMediaLifecycleAuthority({ registration: registration(files, patch), baseDirectory: directory, clock });

// ================================================================ 1 exact manifest identity
test("3D-L01 owner media registers only by its exact declared identity; identities never carry a location", async t => {
  const directory = await scratch(t), a = await written(directory, "clip_a.mp4", deterministicBytes("b3d-owner-a", 4099)), b = await written(directory, "clip_b.mp4",
    deterministicBytes("b3d-owner-b", 5003));
  const authority = await create(directory, [a, b]);
  assert.ok(OwnerMediaLifecycleAuthority.is(authority));
  const expected = [a, b].map(f => ({ entryId: f.entryId, assetId: `asset_${sha256Hex(f.bytes)}`, contentHash: sha256Hex(f.bytes), sizeBytes: f.bytes.length }))
    .sort((x, y) => x.assetId < y.assetId ? -1 : 1);
  assert.deepEqual(authority.declared, expected);
  for (const d of expected) assert.deepEqual(await authority.verify(d.assetId), { ...d, checkedAt: CLOCK.now() });
  // Declaring the same bytes at other locations changes no identity: the registration digest excludes every location.
  const a2 = await written(directory, "moved/clip_a.mp4", a.bytes), b2 = await written(directory, "moved/clip_b.mp4", b.bytes);
  const again = await create(directory, [{ ...a2, entryId: a.entryId }, { ...b2, entryId: b.entryId }]);
  assert.equal(again.registrationDigest, authority.registrationDigest);
  assert.equal(ownerMediaDeclarations(registration([a2, b2].map((f, i) => ({ ...f, entryId: [a, b][i]!.entryId })))).registrationDigest, authority.registrationDigest);
  assert.ok(!JSON.stringify({ digest: authority.registrationDigest, declared: authority.declared }).includes(directory), "no location enters an identity");
  assert.deepEqual(authority.sourceLocations.map(l => l.path).sort(), [a.abs, b.abs].sort(), "locations exist only as execution-only data");
});

// ================================================================ 2 wrong SHA-256 / 3 changed bytes
test("3D-L02 a declared SHA-256 or size that is not the bytes on disk refuses before any use", async t => {
  const directory = await scratch(t), a = await written(directory, "clip_a.mp4", deterministicBytes("b3d-owner-a", 4099));
  const other = deterministicBytes("b3d-owner-other", 4099);
  assert.equal(await refusal(() => create(directory, [{ ...a, authorization: { contentHash: sha256Hex(other) } }])), "lifecycle_authority_unknown_asset");
  assert.equal(await refusal(() => create(directory, [{ ...a, authorization: { sizeBytes: 4100 } }])), "lifecycle_authority_unknown_asset");
  // A correct filename naming another file's bytes is the same refusal: identity is the bytes, never the name.
  const b = await written(directory, "clip_b.mp4", other);
  assert.equal(await refusal(() => create(directory, [{ ...a, path: b.path }])), "lifecycle_authority_unknown_asset");
});
test("3D-L03 bytes changed after declaration, after registration or by replacement refuse; originals are never written", async t => {
  const directory = await scratch(t), bytes = deterministicBytes("b3d-owner-a", 4099), a = await written(directory, "clip_a.mp4", bytes);
  const changed = Uint8Array.from(bytes); changed[17] = (changed[17]! + 1) % 256;
  await writeFile(a.abs, changed);
  assert.equal(await refusal(() => create(directory, [a])), "lifecycle_authority_unknown_asset");
  await writeFile(a.abs, bytes);
  const authority = await create(directory, [a]), assetId = `asset_${sha256Hex(bytes)}`;
  await writeFile(a.abs, changed);
  assert.equal(await refusal(() => authority.verify(assetId)), "lifecycle_authority_unknown_asset", "same file, changed bytes");
  // The replacement is written beside the original and renamed over it, so it is certainly another file object.
  await writeFile(`${a.abs}.new`, bytes); await rename(`${a.abs}.new`, a.abs);
  assert.equal(await refusal(() => authority.verify(assetId)), "lifecycle_authority_unknown_asset", "identical bytes in a replacement file are another file");
  assert.equal(createHash("sha256").update(readFileSync(a.abs)).digest("hex"), sha256Hex(bytes), "the authority wrote nothing");
});

// ================================================================ 4 undeclared / 5 non-local / 6 no discovery
test("3D-L04 an undeclared asset is unknown to every query", async t => {
  const directory = await scratch(t), a = await written(directory, "clip_a.mp4", deterministicBytes("b3d-owner-a", 4099));
  const authority = await create(directory, [a]);
  const undeclared = `asset_${sha256Hex(deterministicBytes("b3d-owner-undeclared", 10))}`;
  assert.equal(await refusal(() => authority.verify(undeclared)), "lifecycle_authority_unknown_asset");
  assert.equal(await refusal(() => authority.assertCurrent(undeclared, CLOCK.now())), "lifecycle_authority_unknown_asset");
  assert.equal(await refusal(() => authority.requestDeletion(undeclared)), "lifecycle_authority_unknown_asset");
  assert.deepEqual(authority.sourceLocations.map(s => s.assetId), [`asset_${sha256Hex(a.bytes)}`], "only declared assets have an execution-only location");
});
test("3D-L05 an absolute path, URL, share, drive, traversal, pattern or device name is never a declared source; the base is explicit and local", async t => {
  const directory = await scratch(t), a = await written(directory, "clip_a.mp4", deterministicBytes("b3d-owner-a", 4099));
  for (const path of [a.abs, "https://example.com/clip_a.mp4", "http://127.0.0.1/clip_a.mp4", "file:///tmp/clip_a.mp4", "\\\\server\\share\\clip_a.mp4",
    "//server/share/clip_a.mp4", "C:\\clip_a.mp4", "C:clip_a.mp4", "./clip_a.mp4", "../x/clip_a.mp4", "sub//clip_a.mp4", "*.mp4", "clip_?.mp4", "con.mp4", "clip_a.mp4.",
    "clip_a.mp4 ", "clip\u0001.mp4"]) {
    assert.equal(await refusal(() => create(directory, [{ ...a, path }])), "lifecycle_authority_scope_invalid", JSON.stringify(path));
  }
  for (const base of ["relative/base", "https://example.com/media", "\\\\server\\share", `${directory}/../x`, join(directory, "absent")]) {
    assert.equal(await refusal(() => createOwnerMediaLifecycleAuthority({ registration: registration([a]), baseDirectory: base, clock: CLOCK })), "lifecycle_authority_scope_invalid", base);
  }
});
test("3D-L06 directory discovery is absent: a directory, a missing file or a link anywhere refuses, and the adapter lists nothing", async t => {
  const directory = await scratch(t), a = await written(directory, "clip_a.mp4", deterministicBytes("b3d-owner-a", 4099));
  await mkdir(join(directory, "folder"));
  assert.equal(await refusal(() => create(directory, [{ ...a, path: "folder" }])), "lifecycle_authority_scope_invalid");
  assert.equal(await refusal(() => create(directory, [{ ...a, path: "absent.mp4" }])), "lifecycle_authority_scope_invalid");
  let linked = true;
  try { await symlink(a.abs, join(directory, "link.mp4")); await symlink(directory, join(directory, "linked_dir")); } catch { linked = false; }
  if (linked) {
    assert.equal(await refusal(() => create(directory, [{ ...a, path: "link.mp4" }])), "lifecycle_authority_scope_invalid", "a linked file");
    assert.equal(await refusal(() => create(directory, [{ ...a, path: "linked_dir/clip_a.mp4" }])), "lifecycle_authority_scope_invalid", "a linked parent");
  }
  // Static proof: the adapter imports only hashing, file and path primitives, and names no listing, watching, network or process API.
  const source = ts.createSourceFile("owner.ts", readFileSync("scripts/edit-render-owner-media-authority-local.ts", "utf8"), ts.ScriptTarget.Latest, true);
  const imports: string[] = [], names = new Set<string>();
  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier) && !node.moduleSpecifier.text.startsWith(".")) imports.push(node.moduleSpecifier.text);
    if (ts.isIdentifier(node)) names.add(node.text);
    ts.forEachChild(node, visit);
  };
  visit(source);
  assert.deepEqual(imports.sort(), ["node:crypto", "node:fs/promises", "node:path"]);
  for (const forbidden of ["readdir", "opendir", "glob", "watch", "fetch", "request", "spawn", "exec", "execFile", "fork", "Socket", "connect"]) {
    assert.ok(!names.has(forbidden), `the adapter names ${forbidden}`);
  }
});

// ================================================================ 7 fake creator_upload / synthetic relabelled as real
test("3D-L07 synthetic or inconsistently labelled media is never owner media: registration, eligibility, query and binder all refuse", async t => {
  const directory = await scratch(t), a = await written(directory, "clip_a.mp4", deterministicBytes("b3d-owner-a", 4099));
  for (const authorization of [{ sourceType: "synthetic", authorizationBasis: "synthetic_generated" }, { creatorId: "creator_other" }, { projectId: "project_other" },
    { allowedPurposes: ["local_reference_analysis"] }]) {
    assert.equal(await refusal(() => create(directory, [{ ...a, authorization }])), "lifecycle_authority_scope_invalid", JSON.stringify(authorization));
  }
  const second = await written(directory, "clip_a_copy.mp4", a.bytes);
  assert.equal(await refusal(() => create(directory, [a, { ...second, entryId: "copy" }])), "lifecycle_authority_scope_invalid", "one content declared twice");
  assert.equal(await refusal(() => create(directory, [a, { ...a, entryId: "again", bytes: deterministicBytes("b3d-x", 3) }])), "lifecycle_authority_scope_invalid",
    "one path declared twice");

  // Eligibility over declared labels only (a predicate test: these records are inputs, not evidence of any real media).
  const { c, staged } = await stagedAfterClaim(t), source = c.v.admission.sources[0]!;
  const mediaRef = source.mediaAsset, analysisRef = source.analysis, artifacts = c.call.artifacts as SuppliedArtifact[];
  const mediaValue = artifacts.find(x => x.ref.objectId === mediaRef.objectId)!.value as Record<string, unknown>;
  const analysisValue = artifacts.find(x => x.ref.objectId === analysisRef.objectId)!.value as { authorization: Record<string, unknown> } & Record<string, unknown>;
  const relabel = (media: Record<string, unknown>, authorization: Record<string, unknown>) => {
    const m = artifact("b3d_media_labelled", "MediaAsset", { ...mediaValue, ...media }, "1.0.0");
    const f = artifact("b3d_analysis_labelled", "FootageAnalysis", { ...analysisValue, authorization: { ...analysisValue.authorization, ...authorization } }, "1.0.0");
    return () => checkOwnerMediaProvenance({ ...source, mediaAsset: m.ref, analysis: f.ref }, [m, f]);
  };
  const real = { sourceType: "owner_supplied", authorizationBasis: "owner_created" };
  assert.deepEqual(relabel({ origin: "creator_upload" }, real)().provenance, OWNER_PROVENANCE, "exactly consistent declared labels are eligible");
  assert.equal(await refusal(relabel({ origin: "synthetic" }, real)), "lifecycle_authority_scope_invalid", "synthetic origin");
  assert.equal(await refusal(relabel({ origin: "creator_upload" }, { sourceType: "synthetic", authorizationBasis: "synthetic_generated" })), "lifecycle_authority_scope_invalid");
  assert.equal(await refusal(relabel({ origin: "creator_upload" }, { ...real, sizeBytes: source.sizeBytes + 1 })), "lifecycle_authority_scope_invalid", "other bytes");
  assert.equal(await refusal(relabel({ origin: "creator_upload", assetId: "asset_other" }, real)), "lifecycle_authority_scope_invalid", "another asset");

  // The authority's own query refuses the admitted synthetic source, even though these opaque bytes are registered as declared.
  const declared = await Promise.all(c.v.admission.sources.map(async (s, i) => written(directory, `take_${i}.bin`,
    s.assetId === `asset_${sha256Hex(bytesA)}` ? bytesA : bytesB)));
  const authority = await create(directory, declared.map((d, i) => ({ ...d, entryId: `take_${i}` })), {}, c.env.runtime.clock);
  assert.equal(await refusal(() => authority.observe(c.call, staged[0])), "lifecycle_authority_scope_invalid");

  // The binder: an owner-local record forged for the synthetic sources passes every identity, claim, freshness and lifecycle check,
  // then refuses on the provenance it re-reads from the admitted records.
  const e = probesAt(c, staged);
  assert.equal(await refusal(() => evaluateRealExecutionEvidence(c.call, { ...e, lifecycle: staged.map(s => ownerRecord(c, s)) })), "lifecycle_authority_scope_invalid");
});

// ================================================================ 8 the synthetic-fixture path is unchanged
test("3D-L08 the synthetic-fixture lifecycle path binds exactly as before, and one execution never mixes authorities", async t => {
  const { c, staged } = await stagedAfterClaim(t), e = probesAt(c, staged);
  const binding = await evaluateRealExecutionEvidence(c.call, { ...e, lifecycle: staged.map(s => fixtureRecord(c, s)) });
  assert.equal(binding.lifecycleAuthority, SYNTHETIC_FIXTURE_LIFECYCLE_AUTHORITY);
  assert.deepEqual(Object.keys(binding).sort(), ["admission", "artifactType", "artifactVersion", "attemptRegistration", "authorizedAt", "basis", "bindingId", "capabilityProbe",
    "claim", "claimTarget", "dag", "editGraph", "environment", "evidenceGrade", "executionGrant", "executor", "lifecycleAuthority", "logicalOperation", "mediaExecution",
    "policy", "program", "recorder", "renderComputationId", "renderIntent", "renderProfile", "reservation", "runtime", "runtimeProbe", "scope", "sources", "stability",
    "validUntil", "validity"], "the binding's shape is unchanged");
  assert.equal(FIXTURE_AUTHORITY_DIGEST, "9fbf9b601725554d30501c3721f48eba0dd412cef509afc6e29f975cdcd4a861", "the fixture authority's descriptor is unchanged");
  assert.notEqual(OWNER_MEDIA_AUTHORITY_DIGEST, FIXTURE_AUTHORITY_DIGEST);
  assert.equal(await refusal(() => evaluateRealExecutionEvidence(c.call, { ...e, lifecycle: [fixtureRecord(c, staged[0]!), ownerRecord(c, staged[1]!)] })),
    "lifecycle_observation_invalid");
  // A record that is neither kind is read, and refused, exactly as the fixture reader always did.
  assert.equal(await refusal(() => evaluateRealExecutionEvidence(c.call, { ...e, lifecycle: [{ artifactType: "SomethingElse" }, fixtureRecord(c, staged[1]!)] as never })),
    "lifecycle_observation_invalid");
});

// ================================================================ 9 stale / 10 deleted or expired / 11 wrong claim or staging
test("3D-L09 a stale owner-local observation refuses", async t => {
  const { c, staged } = await stagedAfterClaim(t), lifecycle = staged.map(s => ownerRecord(c, s));
  c.env.clock.advance(realPolicy().freshness.maxLifecycleObservationAgeMilliseconds + 1);
  assert.equal(await refusal(() => evaluateRealExecutionEvidence(c.call, { ...probesAt(c, staged), lifecycle })), "lifecycle_stale");
});
test("3D-L10 deletion and expiry refuse, in the authority's current state and in an observation", async t => {
  const directory = await scratch(t), a = await written(directory, "clip_a.mp4", deterministicBytes("b3d-owner-a", 4099)), assetId = `asset_${sha256Hex(a.bytes)}`;
  const authority = await create(directory, [a]);
  authority.assertCurrent(assetId, CLOCK.now());
  authority.setExpiry(assetId, "2026-09-29T12:30:00.000Z");
  authority.assertCurrent(assetId, "2026-09-29T12:29:59.999Z");
  assert.equal(await refusal(() => authority.assertCurrent(assetId, "2026-09-29T12:30:00.000Z")), "lifecycle_expired");
  authority.setExpiry(assetId, "2026-09-30T00:00:00.000Z");
  assert.equal(await refusal(() => authority.assertCurrent(assetId, "2026-09-29T12:30:00.000Z")), "lifecycle_expired", "expiry only ever shrinks");
  authority.requestDeletion(assetId);
  assert.equal(await refusal(() => authority.assertCurrent(assetId, "2026-09-29T12:00:00.000Z")), "lifecycle_deleted");
  const ended = await create(directory, [a], { renderAuthorization: { expiresAt: "2026-09-29T06:00:00.000Z" } });
  assert.equal(await refusal(() => ended.assertCurrent(assetId, CLOCK.now())), "lifecycle_expired", "the owner's authorization window bounds the lifecycle");

  const { c, staged } = await stagedAfterClaim(t), now = c.env.runtime.clock.now(), e = probesAt(c, staged);
  assert.equal(await refusal(() => evaluateRealExecutionEvidence(c.call, { ...e, lifecycle: staged.map(s => ownerRecord(c, s, { state: { deletionRequestedAt: now, expiresAt: null } })) })),
    "lifecycle_deleted");
  assert.equal(await refusal(() => evaluateRealExecutionEvidence(c.call, { ...e, lifecycle: staged.map(s => ownerRecord(c, s, { state: { deletionRequestedAt: null, expiresAt: now } })) })),
    "lifecycle_expired");
});
test("3D-L11 an owner-local observation of another claim, staging, staged object, size or authority is refused", async t => {
  const { c, staged } = await stagedAfterClaim(t), e = probesAt(c, staged), good = staged.map(s => ownerRecord(c, s));
  const forged = (mutate: (copy: OwnerMediaLifecycleObservation) => void) => [reidentify(good[0]!, "observationId", "owner_media_lifecycle_observation_v0", mutate), good[1]!];
  assert.equal(await refusal(() => evaluateRealExecutionEvidence(c.call, { ...e, lifecycle: forged(o => { o.claim.claimId = "claim_other"; }) })), "claim_mismatch");
  assert.equal(await refusal(() => evaluateRealExecutionEvidence(c.call, { ...e, lifecycle: forged(o => { o.stagedSource.stagedSourceReceiptId = "staged_other"; }) })),
    "lifecycle_observation_invalid");
  assert.equal(await refusal(() => evaluateRealExecutionEvidence(c.call, { ...e, lifecycle: forged(o => { o.stagedSource.stagedObjectId = "staged_object_other"; }) })),
    "lifecycle_observation_invalid");
  assert.equal(await refusal(() => evaluateRealExecutionEvidence(c.call, { ...e, lifecycle: forged(o => { o.source.sizeBytes += 1; o.declaration.sizeBytes += 1; }) })),
    "lifecycle_observation_invalid");
  assert.equal(await refusal(() => evaluateRealExecutionEvidence(c.call, { ...e, lifecycle: forged(o => { o.source.analysis = o.source.mediaAsset; }) })),
    "lifecycle_observation_invalid");
  assert.equal(await refusal(() => evaluateRealExecutionEvidence(c.call, { ...e, lifecycle: forged(o => { o.observer.implementationDigest = FIXTURE_AUTHORITY_DIGEST; }) })),
    "lifecycle_observation_invalid", "another authority's digest");
  assert.equal(await refusal(() => evaluateRealExecutionEvidence(c.call, { ...e, lifecycle: forged(o => {
    (o as unknown as { authorityScope: string }).authorityScope = "synthetic_fixture_assets_only_v0"; }) })), "lifecycle_observation_invalid", "another authority's scope");
  // A record cannot even be built for a staged receipt of another claim.
  const other = await claimed(t), otherStaged = await stageAll(other);
  assert.equal(await refusal(() => ownerRecord(c, otherStaged[0]!)), "claim_mismatch");
});

// ================================================================ 12 records never substitute for live handles
test("3D-L12 a serialized or constructed record never substitutes for a live owner-local handle", async t => {
  const { c, staged } = await stagedAfterClaim(t), record = ownerRecord(c, staged[0]!);
  for (const value of [record, JSON.parse(JSON.stringify(record)) as unknown, structuredClone(record), Object.create(TrustedOwnerMediaLifecycleObservation.prototype) as unknown]) {
    assert.equal(TrustedOwnerMediaLifecycleObservation.is(value), false);
  }
  assert.equal(await refusal(() => new TrustedOwnerMediaLifecycleObservation(Symbol("forged"), record, "token", () => undefined)), "trust_handle_required");
  assert.equal(await refusal(() => new OwnerMediaLifecycleAuthority(Symbol("forged"), CLOCK, new Map(), "e".repeat(64), {} as never, OWNER_SCOPE)), "trust_handle_required");
  assert.equal(await refusal(() => issueExecutablePermit({ call: c.call, media: {} as never, staged, lifecycle: [record, ownerRecord(c, staged[1]!)] as never, conformance: [],
    policy: realPolicy() })), "trust_handle_required");
});
