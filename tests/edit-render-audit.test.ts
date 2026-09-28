// Gate-7 Batch-2B workspace-audit policy: per-file subprocess capabilities. Each case copies the audited surface into a fixture,
// changes exactly one file, runs the audit there with the current Node binary (never a shell) and restores the file. Nothing here
// decodes or renders media; the only process started is the audit itself, as in the accepted workspace-boundary test.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFile, mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const root = fileURLToPath(new URL("../../", import.meta.url));

async function fixture(): Promise<string> {
  await mkdir(join(root, ".test-artifacts"), { recursive: true });
  const directory = await mkdtemp(join(root, ".test-artifacts", "batch2b-audit-"));
  const files = ["scripts/audit-workspace.mjs", ".npmrc", ".gitignore", "package.json", "python/reference_analyzer/siglip.py", "python/reference_analyzer/__main__.py"];
  for (const filename of await readdir(join(root, "scripts"))) if (filename.endsWith(".ts")) files.push(`scripts/${filename}`);
  for (const filename of files) {
    await mkdir(dirname(join(directory, filename)), { recursive: true });
    await copyFile(join(root, filename), join(directory, filename));
  }
  for (const name of ["packages/audio-analyzer", "packages/footage-analyzer", "samples", "tests"]) await mkdir(join(directory, name), { recursive: true });
  return directory;
}

function audit(directory: string): { status: number | null; output: string } {
  const result = spawnSync(process.execPath, [join(directory, "scripts/audit-workspace.mjs")], { cwd: directory, encoding: "utf8", shell: false, windowsHide: true });
  assert.equal(result.error, undefined);
  return { status: result.status, output: result.stdout + result.stderr };
}

/** Replace one registered adapter with `source`, audit, then restore the accepted bytes. */
async function refusedAdapter(directory: string, filename: string, source: string, message: RegExp): Promise<void> {
  const path = join(directory, "scripts", filename);
  await writeFile(path, source);
  const result = audit(directory);
  await copyFile(join(root, "scripts", filename), path);
  assert.notEqual(result.status, 0, `${filename}: ${source}`);
  assert.match(result.output, message, `${filename}: ${source}`);
}

const SPAWN = 'import { spawn } from "node:child_process";\nconst binary = { path: "verified" };\n';

test("B2B-A1 the unmodified audited surface passes and names exactly the subprocess-capable adapters", async () => {
  const directory = await fixture();
  const result = audit(directory);
  assert.equal(result.status, 0, result.output);
  assert.match(result.output, /15 explicit local runtime adapters with per-file capabilities \(subprocess-capable: reference-local\.ts, transnetv2-local\.ts, audio-beat-worker\.ts, audio-energy-worker\.ts, audio-structure-worker\.ts, audio-speech-worker\.ts, edit-render-local\.ts, edit-media-qc-local\.ts, edit-observation-local\.ts\)/);
  // A direct, verified spawn with a literal shell: false and a property named exec (a RegExp method) are not over-flagged.
  const path = join(directory, "scripts", "edit-render-local.ts");
  await writeFile(path, `${SPAWN}spawn(binary.path, ["-version"], { shell: false, windowsHide: true });\nexport const digits = /\\d+/.exec("7");\n`);
  const positive = audit(directory);
  assert.equal(positive.status, 0, positive.output);
});

test("B2B-A2 the strict renderer adapter may import and call only spawn, directly, with a verified executable and a literal shell: false", async () => {
  const directory = await fixture();
  const cases: [string, RegExp][] = [
    ['import { exec } from "node:child_process";', /Subprocess entry point exec is not granted to scripts\/edit-render-local\.ts/],
    ['import { execFile } from "node:child_process";', /Subprocess entry point execFile is not granted/],
    ['import { fork } from "node:child_process";', /Subprocess entry point fork is not granted/],
    ['import { spawnSync } from "node:child_process";', /Subprocess entry point spawnSync is not granted/],
    // The unprefixed specifier is not on any exact allowlist.
    ['import { spawn } from "child_process";', /Unexpected local runtime dependency: child_process in scripts\/edit-render-local\.ts/],
    ['import * as processes from "node:child_process";', /Subprocess functions are imported by name only/],
    ['import processes from "node:child_process";', /Subprocess functions are imported by name only/],
    ['import { spawn as run } from "node:child_process";', /Subprocess entry points are not renamed/],
    [`${SPAWN}spawn(binary.path, [], { shell: true });`, /Local subprocesses must not use a shell/],
    [`${SPAWN}spawn(binary.path, []);`, /Every spawn must pass a literal shell: false/],
    [`${SPAWN}spawn(binary.path, [], { windowsHide: true });`, /Every spawn must pass a literal shell: false/],
    [`${SPAWN}const options = { shell: false };\nspawn(binary.path, [], options);`, /Every spawn must pass a literal shell: false/],
    [`${SPAWN}const extra = {};\nspawn(binary.path, [], { shell: false, ...extra });`, /Every spawn must pass a literal shell: false/],
    [`${SPAWN}const key = "shell";\nspawn(binary.path, [], { shell: false, [key]: true });`, /Every spawn must pass a literal shell: false/],
    [`${SPAWN}const shell = false;\nspawn(binary.path, [], { shell });`, /Local subprocesses must not use a shell/],
    [`${SPAWN}spawn(binary.path, [], { "shell": true });`, /Local subprocesses must not use a shell/],
    [`${SPAWN}spawn(binary.path, [], { shell: false, ["shell"]: true });`, /Local subprocesses must not use a shell/],
    [`${SPAWN}spawn(binary.path, [], { shell: false, get shell() { return true; } });`, /Local subprocesses must not use a shell/],
    [`${SPAWN}spawn("ffmpeg", [], { shell: false });`, /never an inline command/],
    [`${SPAWN}const root = "x";\nspawn(\`\${root}/ffmpeg.exe\`, [], { shell: false });`, /never an inline command/],
    [`${SPAWN}const root = "x";\nspawn(root + "/ffmpeg.exe", [], { shell: false });`, /never an inline command/],
    [`${SPAWN}const run = spawn;\nrun(binary.path, [], { shell: false });`, /spawn is only ever called directly/],
    [`${SPAWN}Reflect.apply(spawn, undefined, [binary.path, [], { shell: false }]);`, /spawn is only ever called directly/],
    ['const run = eval;', /Forbidden process or evaluation name eval/],
    ['export const x = require;', /Forbidden process or evaluation name require/],
    ['declare const spawnSync: () => void;\nspawnSync();', /Forbidden process or evaluation name spawnSync/],
    ['await import("node:child_process");', /Dynamic import in scripts\/edit-render-local\.ts/],
    ['new Function("return 1");', /Dynamic code in scripts\/edit-render-local\.ts/],
    ['process.binding("spawn_sync");', /Native process bindings/],
    ['import { get } from "node:https";', /Unexpected local runtime dependency: node:https in scripts\/edit-render-local\.ts/],
    ['import { readFileSync } from "node:fs";', /Unexpected local runtime dependency: node:fs in scripts\/edit-render-local\.ts/],
    ['import { Worker } from "node:worker_threads";', /Unexpected local runtime dependency: node:worker_threads/],
    ['import { z } from "zod";', /Unexpected local runtime dependency: zod in scripts\/edit-render-local\.ts/],
    ['export const value: any = 1;', /Explicit any in scripts\/edit-render-local\.ts/],
  ];
  for (const [source, message] of cases) await refusedAdapter(directory, "edit-render-local.ts", source, message);
});

test("B2B-A3 the technical QC adapter has the same strict spawn capability and its own exact import allowlist", async () => {
  const directory = await fixture();
  for (const [source, message] of [
    ['import { execFile } from "node:child_process";', /Subprocess entry point execFile is not granted to scripts\/edit-media-qc-local\.ts/],
    [`${SPAWN}spawn(binary.path, [], { shell: true });`, /Local subprocesses must not use a shell/],
    [`${SPAWN}spawn("ffprobe", [], { shell: false });`, /never an inline command/],
    ['import { performance } from "node:perf_hooks";', /Unexpected local runtime dependency: node:perf_hooks in scripts\/edit-media-qc-local\.ts/],
  ] as [string, RegExp][]) await refusedAdapter(directory, "edit-media-qc-local.ts", source, message);
});

test("B2B-A4 adapters without a process capability cannot import child_process at all", async () => {
  const directory = await fixture();
  for (const filename of ["edit-runtime-local.ts", "edit-render-fixture-authority-local.ts", "analyze-footage.ts", "footage-local.ts", "audio-local.ts", "analyze-reference.ts"]) {
    await refusedAdapter(directory, filename, 'import { spawn } from "node:child_process";',
      new RegExp(`Unexpected local runtime dependency: node:child_process in scripts/${filename.replace(/\./g, "\\.")}`));
  }
  // The Batch-2A runtime adapter and the fixture authority keep exact filesystem-only allowlists.
  for (const filename of ["edit-runtime-local.ts", "edit-render-fixture-authority-local.ts"]) {
    for (const module of ["node:fs", "node:url", "node:perf_hooks", "zod"]) {
      await refusedAdapter(directory, filename, `import * as m from "${module}";`, new RegExp(`Unexpected local runtime dependency: ${module} in scripts/`));
    }
  }
});

test("B2B-A5 accepted process adapters keep spawn and execFile only; shell and exec-family entry points stay refused", async () => {
  const directory = await fixture();
  for (const filename of ["reference-local.ts", "transnetv2-local.ts", "audio-beat-worker.ts", "audio-energy-worker.ts", "audio-structure-worker.ts", "audio-speech-worker.ts"]) {
    await refusedAdapter(directory, filename, 'import { exec } from "node:child_process";', /Subprocess entry point exec is not granted/);
    await refusedAdapter(directory, filename, 'import { fork } from "node:child_process";', /Subprocess entry point fork is not granted/);
    await refusedAdapter(directory, filename, 'const options = { shell: true };', /Local subprocesses must not use a shell/);
    await refusedAdapter(directory, filename, 'const shell = true;\nconst options = { shell };', /Local subprocesses must not use a shell/);
    await refusedAdapter(directory, filename, 'const options = { "shell": true };', /Local subprocesses must not use a shell/);
  }
});

test("B2B-A6 no unregistered file anywhere under scripts, tests, packages or samples may import child_process", async () => {
  const directory = await fixture();
  for (const [relativePath, source, message] of [
    ["scripts/new-helper.ts", 'import { spawn } from "node:child_process";\n', /Unregistered subprocess import in scripts\/new-helper\.ts/],
    ["scripts/new-helper.mjs", 'const { spawn } = await import("node:child_process");\n', /Unregistered subprocess import in scripts\/new-helper\.mjs/],
    ["scripts/audio-energy-smoke.ts", 'import { execFile } from "child_process";\n', /Unregistered subprocess import in scripts\/audio-energy-smoke\.ts/],
    ["tests/other.test.ts", 'import { execFile } from "child_process";\n', /Unregistered subprocess import in tests\/other\.test\.ts/],
    ["tests/support/nested/helper.ts", 'export { spawn } from "node:child_process";\n', /Unregistered subprocess import in tests\/support\/nested\/helper\.ts/],
    ["tests/fixtures/generator.ts", 'import { spawn } from "node:child_process";\n', /Unregistered subprocess import in tests\/fixtures\/generator\.ts/],
    ["samples/tool.mjs", 'import { spawn } from "node:child_process";\n', /Unregistered subprocess import in samples\/tool\.mjs/],
  ] as [string, string, RegExp][]) {
    const path = join(directory, relativePath);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, source);
    const result = audit(directory);
    if (relativePath.startsWith("scripts/audio-energy-smoke")) await copyFile(join(root, relativePath), path);
    else await rm(path);
    assert.notEqual(result.status, 0, relativePath);
    assert.match(result.output, message, relativePath);
  }
  assert.equal(audit(directory).status, 0);
});

test("B2B-A7 every registered adapter must exist: a removed renderer adapter fails the audit instead of being skipped", async () => {
  const directory = await fixture();
  for (const filename of ["edit-render-local.ts", "edit-media-qc-local.ts", "edit-render-fixture-authority-local.ts", "edit-runtime-local.ts"]) {
    await rm(join(directory, "scripts", filename));
    const result = audit(directory);
    await copyFile(join(root, "scripts", filename), join(directory, "scripts", filename));
    assert.notEqual(result.status, 0, filename);
    assert.match(result.output, /ENOENT/, filename);
  }
});
