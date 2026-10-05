// Gate 7 Batch 3E-B1B: pure checks of the canonical-ingest adapter, scripts/media-ingest-local.ts. Process supervision is driven by
// controlled stand-ins for an already-spawned child (the accepted Batch-2B method, tests/edit-render-media.integration.ts M24/M34), so no
// executable starts here; the static boundary is read from the adapter's source. No media, process, model or network.
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { readFileSync } from "node:fs";
import { PassThrough } from "node:stream";
import { test } from "node:test";
import ts from "typescript";
import * as local from "../scripts/media-ingest-local.js";

type Run = { spawnError: string | null; errorAfterSpawn: string | null; exitCode: number | null; signal: string | null; timedOut: boolean; terminationConfirmed: boolean;
  stdout: Buffer; stdoutOverflow: boolean };
const A = local as unknown as Record<string, unknown>;
const supervise = (child: unknown, limits: object) => (A["superviseCanonicalChild"] as (c: unknown, l: object) => Promise<Run>)(child, limits);
const failureOf = (run: Run) => (A["canonicalRunFailure"] as (r: Run) => string | null)(run);
const standIn = (onKill: () => void) => Object.assign(new EventEmitter(), { stdout: new PassThrough(), stderr: new PassThrough(), kill: () => { onKill(); return true; } });
const failure = (code: string) => Object.assign(new Error(code), { code });

test("B1B-S01 only a clean, observed exit 0 is evidence: never-started, killed, signalled, errored, unconfirmed and overflowing runs are not", async () => {
  const limits = { timeoutMilliseconds: 40, terminationGraceMilliseconds: 150, stdoutLimit: 8 };
  type Scenario = [string, () => { child: ReturnType<typeof standIn>; kills: () => number }];
  const scenarios: Scenario[] = [
    ["clean_exit_zero", () => { const child = standIn(() => assert.fail("a completed child is never killed")); setImmediate(() => { child.emit("spawn");
      child.stdout.write("ok"); setTimeout(() => child.emit("close", 0, null), 5); }); return { child, kills: () => 0 }; }],
    ["never_spawned_error", () => { const child = standIn(() => undefined); setImmediate(() => child.emit("error", failure("ENOENT"))); return { child, kills: () => 0 }; }],
    ["nonzero_exit", () => { const child = standIn(() => undefined); setImmediate(() => { child.emit("spawn"); child.emit("close", 1, null); }); return { child, kills: () => 0 }; }],
    ["killed_by_signal", () => { const child = standIn(() => undefined); setImmediate(() => { child.emit("spawn"); child.emit("close", null, "SIGKILL"); }); return { child, kills: () => 0 }; }],
    ["timeout_then_close", () => { let kills = 0; const child: ReturnType<typeof standIn> = standIn(() => { kills += 1; setTimeout(() => child.emit("close", null, "SIGTERM"), 5); });
      setImmediate(() => child.emit("spawn")); return { child, kills: () => kills }; }],
    ["timeout_no_close", () => { let kills = 0; const child = standIn(() => { kills += 1; }); setImmediate(() => child.emit("spawn")); return { child, kills: () => kills }; }],
    ["error_while_running_no_close", () => { let kills = 0; const child = standIn(() => { kills += 1; });
      setImmediate(() => { child.emit("spawn"); setTimeout(() => child.emit("error", failure("EPIPE")), 5); }); return { child, kills: () => kills }; }],
    ["stdout_overflow", () => { const child = standIn(() => undefined); setImmediate(() => { child.emit("spawn"); child.stdout.write("0123456789");
      setTimeout(() => child.emit("close", 0, null), 5); }); return { child, kills: () => 0 }; }],
  ];
  const observed: Record<string, unknown> = {};
  for (const [name, make] of scenarios) {
    const { child, kills } = make();
    const run = await Promise.race([supervise(child, limits), new Promise<"still_pending">(resolve => setTimeout(() => resolve("still_pending"), 2_000))]);
    if (run === "still_pending") { observed[name] = run; continue; }
    observed[name] = { exitCode: run.exitCode, signal: run.signal, spawnError: run.spawnError, errorAfterSpawn: run.errorAfterSpawn, timedOut: run.timedOut,
      terminationConfirmed: run.terminationConfirmed, stdoutOverflow: run.stdoutOverflow, kills: kills(), failure: failureOf(run) };
  }
  assert.deepEqual(observed, {
    clean_exit_zero: { exitCode: 0, signal: null, spawnError: null, errorAfterSpawn: null, timedOut: false, terminationConfirmed: true, stdoutOverflow: false, kills: 0, failure: null },
    never_spawned_error: { exitCode: null, signal: null, spawnError: "ENOENT", errorAfterSpawn: null, timedOut: false, terminationConfirmed: true, stdoutOverflow: false, kills: 0,
      failure: "process_failed" },
    nonzero_exit: { exitCode: 1, signal: null, spawnError: null, errorAfterSpawn: null, timedOut: false, terminationConfirmed: true, stdoutOverflow: false, kills: 0,
      failure: "process_failed" },
    killed_by_signal: { exitCode: null, signal: "SIGKILL", spawnError: null, errorAfterSpawn: null, timedOut: false, terminationConfirmed: true, stdoutOverflow: false, kills: 0,
      failure: "process_failed" },
    timeout_then_close: { exitCode: null, signal: "SIGTERM", spawnError: null, errorAfterSpawn: null, timedOut: true, terminationConfirmed: true, stdoutOverflow: false, kills: 1,
      failure: "process_timeout" },
    timeout_no_close: { exitCode: null, signal: null, spawnError: null, errorAfterSpawn: null, timedOut: true, terminationConfirmed: false, stdoutOverflow: false, kills: 1,
      failure: "process_timeout" },
    error_while_running_no_close: { exitCode: null, signal: null, spawnError: null, errorAfterSpawn: "EPIPE", timedOut: false, terminationConfirmed: false, stdoutOverflow: false,
      kills: 1, failure: "process_failed" },
    stdout_overflow: { exitCode: 0, signal: null, spawnError: null, errorAfterSpawn: null, timedOut: false, terminationConfirmed: true, stdoutOverflow: true, kills: 0,
      failure: "process_failed" },
  });
});

test("B1B-S03 every caller-owned request field is read exactly once, before any await", async () => {
  const reads: Record<string, number> = {};
  const counted = <T>(name: string, value: T) => () => { reads[name] = (reads[name] ?? 0) + 1; return value; };
  const clock = Object.defineProperty({}, "now", { get: counted("clock.now", () => "2026-10-05T08:00:00.000Z"), enumerable: true });
  const root = { manifestType: "AuthorizedFootage", schemaVersion: "1.1.0", contentHash: "a".repeat(64), sizeBytes: 1, sourceType: "owner_supplied", authorizationBasis: "owner_created",
    allowedPurposes: ["local_footage_analysis", "local_evaluation"], dateAdded: "2026-10-01T00:00:00.000Z", creatorId: "creator_s03", projectId: "project_s03",
    canonicalizationConsent: "local_media_canonicalization" };
  const request: Record<string, unknown> = {};
  for (const [name, value] of Object.entries({ sourcePath: "C:\\b1b-s03\\absent.mp4", rootAuthorization: root, toolRoot: "C:\\b1b-s03\\not-the-approved-root", workspaceRoot: "C:\\b1b-s03",
    clock, allowedPurposes: ["local_evaluation"], limits: { canonicalizationTimeoutMilliseconds: 60_000 }, instrumentation: {} })) {
    Object.defineProperty(request, name, { get: counted(name, value), enumerable: true });
  }
  // The request is read, then the tool root (not the approved one) refuses before anything else happens.
  const code = await (A["canonicalizeLocalMedia"] as (r: unknown) => Promise<unknown>)(request).then(() => "accepted", (e: { code?: string }) => e.code ?? String(e));
  assert.equal(code, "runtime_config_invalid");
  assert.deepEqual(reads, { sourcePath: 1, rootAuthorization: 1, toolRoot: 1, workspaceRoot: 1, clock: 1, "clock.now": 1, allowedPurposes: 1, limits: 1, instrumentation: 1 });
});

test("B1B-S02 the adapter's static boundary: exact imports, spawn only, no listing, watching, network or evaluation names", () => {
  const text = readFileSync("scripts/media-ingest-local.ts", "utf8"), source = ts.createSourceFile("media-ingest-local.ts", text, ts.ScriptTarget.Latest, true);
  const imports: string[] = [], processNames: string[] = [], names = new Set<string>();
  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const specifier = node.moduleSpecifier.text;
      if (!specifier.startsWith(".")) imports.push(specifier);
      else assert.match(specifier, /^\.\.\/packages\/(domain|edit-render|editorial|edit-runtime|footage-analyzer|media-ingest)\//, `internal import ${specifier}`);
      if (specifier === "node:child_process") for (const element of (node.importClause?.namedBindings as ts.NamedImports).elements) processNames.push(element.name.text);
    }
    // Bare names only: a property such as RegExp.prototype.exec is not a process entry point.
    if (ts.isIdentifier(node) && !(ts.isPropertyAccessExpression(node.parent) && node.parent.name === node)) names.add(node.text);
    ts.forEachChild(node, visit);
  };
  visit(source);
  assert.deepEqual([...new Set(imports)].sort(), ["node:child_process", "node:crypto", "node:fs/promises", "node:path", "node:url"]);
  assert.deepEqual(processNames, ["spawn"]);
  for (const forbidden of ["readdir", "opendir", "glob", "watch", "fetch", "exec", "execSync", "execFile", "execFileSync", "spawnSync", "fork", "Socket", "createConnection",
    "eval", "require", "rename", "copyFile", "writeFileSync"]) assert.ok(!names.has(forbidden), `the adapter names ${forbidden}`);
  assert.equal((text.match(/\bspawn\(/g) ?? []).length, 2, "two direct spawns: one supervised measurement and the recipe");
  assert.equal((text.match(/shell: false/g) ?? []).length, 2);
  assert.doesNotMatch(text, /shell: true|process\.env\[(?!"SystemRoot")|Math\.random|Date\.now|new Date\(/);
});
