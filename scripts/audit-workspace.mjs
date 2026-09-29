import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const projectRoot = resolve(fileURLToPath(new URL("../", import.meta.url)));
const allowedExternalImports = new Set(["zod", "node:crypto"]);
const forbiddenIdentifiers = new Set(["fetch", "WebSocket", "XMLHttpRequest", "eval", "require"]);
let filesChecked = 0;

async function inspectDirectory(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    assert.equal(entry.isSymbolicLink(), false, `Unexpected symbolic link: ${path}`);
    if (entry.isDirectory()) await inspectDirectory(path);
    else if (entry.isFile() && entry.name.endsWith(".ts")) {
      filesChecked += 1;
      const source = ts.createSourceFile(path, await readFile(path, "utf8"), ts.ScriptTarget.Latest, true);
      function visit(node) {
        assert.notEqual(node.kind, ts.SyntaxKind.AnyKeyword, `Explicit any type in ${path}`);
        if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
          const specifier = node.moduleSpecifier;
          if (specifier !== undefined) {
            assert.ok(ts.isStringLiteral(specifier), `Nonliteral import in ${path}`);
            if (specifier.text.startsWith(".")) {
              const target = relative(projectRoot, resolve(dirname(path), specifier.text));
              assert.ok(!target.startsWith(".."), `Import outside the workspace: ${path}`);
              assert.ok(!target.startsWith(`scripts/`) && !target.startsWith(`scripts\\`), `Application import of a local runtime adapter: ${path}`);
            } else assert.ok(allowedExternalImports.has(specifier.text), `Unapproved runtime import ${specifier.text} in ${path}`);
          }
        }
        if (ts.isCallExpression(node)) {
          assert.notEqual(node.expression.kind, ts.SyntaxKind.ImportKeyword, `Dynamic import in ${path}`);
          if (ts.isIdentifier(node.expression)) assert.ok(!forbiddenIdentifiers.has(node.expression.text), `Network/evaluation call in ${path}`);
        }
        if (ts.isNewExpression(node) && ts.isIdentifier(node.expression)) assert.ok(!["Function", "WebSocket", "Date"].includes(node.expression.text), `Uninjected execution/time source in ${path}`);
        if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression)) {
          assert.ok(!["Math.random", "Date.now", "process.env"].includes(`${node.expression.text}.${node.name.text}`), `Hidden nondeterministic input in ${path}`);
        }
        ts.forEachChild(node, visit);
      }
      visit(source);
    }
  }
}
for (const directory of ["packages", "samples"]) await inspectDirectory(join(projectRoot, directory));
const config = await readFile(join(projectRoot, ".npmrc"), "utf8");
for (const setting of ["cache=.npm-cache", "logs-dir=.npm-cache/_logs", "ignore-scripts=true", "audit=false", "update-notifier=false"]) assert.ok(config.split(/\r?\n/).includes(setting), `Missing local npm setting: ${setting}`);
const manifest = JSON.parse(await readFile(join(projectRoot, "package.json"), "utf8"));
assert.equal(manifest.private, true);
assert.deepEqual(Object.keys(manifest.dependencies).sort(), ["zod"]);
assert.deepEqual(Object.keys(manifest.devDependencies).sort(), ["@types/node", "typescript"]);
// Side effects are confined to the explicitly named local composition boundary, with per-file capabilities (Gate 7 Batch 2B).
// Each registered local runtime adapter may import only its own allowlist, and only an entry granted a process capability may
// import node:child_process. The accepted adapters keep their accepted import ceiling; the Batch-2A and Batch-2B adapters have
// exact allowlists. "legacy" process adapters may use spawn or execFile; "strict_spawn" adapters may import and call only spawn,
// with a literal `shell: false` options object and an executable that is never an inline string, template or concatenation.
const acceptedCeiling = ["zod", "node:child_process", "node:fs", "node:fs/promises", "node:path", "node:url", "node:crypto", "node:perf_hooks"];
const adapterPolicy = {
  "scripts/reference-local.ts": { imports: acceptedCeiling, process: "legacy" },
  "scripts/analyze-reference.ts": { imports: acceptedCeiling, process: "none" },
  "scripts/footage-local.ts": { imports: acceptedCeiling, process: "none" },
  "scripts/analyze-footage.ts": { imports: acceptedCeiling, process: "none" },
  "scripts/transnetv2-local.ts": { imports: acceptedCeiling, process: "legacy" },
  "scripts/audio-local.ts": { imports: acceptedCeiling, process: "none" },
  "scripts/audio-beat-worker.ts": { imports: acceptedCeiling, process: "legacy" },
  "scripts/audio-energy-worker.ts": { imports: acceptedCeiling, process: "legacy" },
  "scripts/audio-structure-worker.ts": { imports: acceptedCeiling, process: "legacy" },
  // Already spawned its worker before Batch 2B but was not enumerated; it is now registered and audited like its siblings.
  "scripts/audio-speech-worker.ts": { imports: acceptedCeiling, process: "legacy" },
  "scripts/edit-runtime-local.ts": { imports: ["node:crypto", "node:fs/promises", "node:path"], process: "none" },
  "scripts/edit-editorial-local.ts": { imports: ["node:crypto", "node:fs/promises", "node:path", "node:perf_hooks"], process: "none" },
  "scripts/edit-render-fixture-authority-local.ts": { imports: ["node:crypto", "node:fs/promises", "node:path"], process: "none" },
  "scripts/edit-render-local.ts": { imports: ["node:child_process", "node:crypto", "node:fs/promises", "node:path", "node:perf_hooks", "node:url"], process: "strict_spawn" },
  "scripts/edit-media-qc-local.ts": { imports: ["node:child_process", "node:crypto", "node:fs/promises", "node:path", "node:url"], process: "strict_spawn" },
  "scripts/edit-observation-local.ts": { imports: ["node:child_process", "node:crypto", "node:fs/promises", "node:path", "node:url"], process: "strict_spawn" },
};
// Test harness files that start processes (fixture generation with the pinned tool, or running this audit in a fixture).
const testProcessFiles = new Set(["tests/workspace-boundary.test.ts", "tests/reference-media.integration.ts", "tests/support/footage-media.ts", "tests/support/edit-render-media.ts",
  "tests/edit-render-audit.test.ts"]);
const processModules = new Set(["node:child_process", "child_process"]);
const legacyProcessNames = new Set(["spawn", "execFile"]), strictProcessNames = new Set(["spawn"]);
const forbiddenProcessNames = new Set(["exec", "execSync", "execFileSync", "spawnSync", "fork"]);
const keyOf = name => ts.isComputedPropertyName(name) ? (ts.isStringLiteralLike(name.expression) ? name.expression.text : undefined) : name.text;
for (const [filename, policy] of Object.entries(adapterPolicy)) {
  const allowed = new Set(policy.imports.filter(name => policy.process !== "none" || !processModules.has(name)));
  const source = ts.createSourceFile(filename, await readFile(join(projectRoot, filename), "utf8"), ts.ScriptTarget.Latest, true);
  function inspectRuntime(node) {
    assert.notEqual(node.kind, ts.SyntaxKind.AnyKeyword, `Explicit any in ${filename}`);
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const name = node.moduleSpecifier.text;
      assert.ok(name.startsWith(".") || allowed.has(name), `Unexpected local runtime dependency: ${name} in ${filename}`);
      if (processModules.has(name)) {
        const clause = node.importClause;
        assert.ok(clause !== undefined && clause.name === undefined && clause.namedBindings !== undefined && ts.isNamedImports(clause.namedBindings),
          `Subprocess functions are imported by name only in ${filename}`);
        for (const element of clause.namedBindings.elements) {
          if (clause.isTypeOnly || element.isTypeOnly) continue;
          const imported = (element.propertyName ?? element.name).text;
          assert.ok((policy.process === "strict_spawn" ? strictProcessNames : legacyProcessNames).has(imported), `Subprocess entry point ${imported} is not granted to ${filename}`);
          assert.ok(policy.process !== "strict_spawn" || element.propertyName === undefined, `Subprocess entry points are not renamed in ${filename}`);
        }
      }
    }
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) assert.fail(`Dynamic import in ${filename}`);
    if (ts.isIdentifier(node) && (forbiddenProcessNames.has(node.text) || ["eval", "require"].includes(node.text))
      && !(ts.isPropertyAccessExpression(node.parent) && node.parent.name === node)) assert.fail(`Forbidden process or evaluation name ${node.text} in ${filename}`);
    if (ts.isNewExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "Function") assert.fail(`Dynamic code in ${filename}`);
    if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "process" && ["binding", "_linkedBinding", "dlopen"].includes(node.name.text)) {
      assert.fail(`Native process bindings in ${filename}`);
    }
    // A shell key is recognized however it is spelled (identifier, string or literal computed key); its only permitted value is `false`.
    if ((ts.isPropertyAssignment(node) || ts.isShorthandPropertyAssignment(node)) && keyOf(node.name) === "shell") {
      assert.ok(ts.isPropertyAssignment(node) && node.initializer.kind === ts.SyntaxKind.FalseKeyword, "Local subprocesses must not use a shell.");
    }
    if (policy.process === "strict_spawn" && ts.isIdentifier(node) && node.text === "spawn" && !ts.isImportSpecifier(node.parent)) {
      assert.ok(ts.isCallExpression(node.parent) && node.parent.expression === node, `spawn is only ever called directly in ${filename}`);
      const [executable, , options] = node.parent.arguments;
      assert.ok(executable !== undefined && (ts.isIdentifier(executable) || ts.isPropertyAccessExpression(executable)),
        `The spawned executable must be a verified value, never an inline command, in ${filename}`);
      const properties = options !== undefined && ts.isObjectLiteralExpression(options) ? options.properties : [];
      const shells = properties.filter(p => p.name !== undefined && keyOf(p.name) === "shell");
      assert.ok(shells.every(p => ts.isPropertyAssignment(p) && p.initializer.kind === ts.SyntaxKind.FalseKeyword), "Local subprocesses must not use a shell.");
      assert.ok(options !== undefined && ts.isObjectLiteralExpression(options) && shells.length === 1
        && properties.every(p => !ts.isSpreadAssignment(p) && p.name !== undefined && keyOf(p.name) !== undefined), `Every spawn must pass a literal shell: false in ${filename}`);
    }
    ts.forEachChild(node, inspectRuntime);
  }
  inspectRuntime(source);
}
// No other file may start a process: every subprocess import outside the registered adapters and test harness files is refused.
async function scanForProcesses(directory, relativeRoot) {
  let entries;
  try { entries = await readdir(directory, { withFileTypes: true }); } catch (error) { if (error.code === "ENOENT") return; throw error; }
  for (const entry of entries) {
    const path = join(directory, entry.name), name = `${relativeRoot}/${entry.name}`;
    if (entry.isDirectory()) { if (entry.name !== "node_modules") await scanForProcesses(path, name); continue; }
    if (!/\.(ts|mts|cts|mjs|cjs|js)$/.test(entry.name)) continue;
    const text = await readFile(path, "utf8");
    const imports = /(?:from\s*|import\s*\(\s*|require\s*\(\s*|import\s+)["'](?:node:)?child_process["']/.test(text);
    const granted = (adapterPolicy[name] !== undefined && adapterPolicy[name].process !== "none") || testProcessFiles.has(name);
    assert.ok(!imports || granted, `Unregistered subprocess import in ${name}`);
  }
}
for (const directory of ["packages", "samples", "scripts", "tests"]) await scanForProcesses(join(projectRoot, directory), directory);
const siglip = await readFile(join(projectRoot, "python/reference_analyzer/siglip.py"), "utf8");
for (const entry of await readdir(join(projectRoot, "packages/footage-analyzer"))) {
  if (!entry.endsWith(".ts")) continue;
  const text = await readFile(join(projectRoot, "packages/footage-analyzer", entry), "utf8");
  assert.ok(!/ReferenceFingerprint|analyzeReference/.test(text), `Footage must not depend on a reference: ${entry}`);
  if (entry === "aggregation.ts") assert.ok(!/\.embed\s*\(|EmbeddingBackend|SiglipProvider|VideoEmbeddingProvider/.test(text), "Candidate aggregation cannot invoke an embedding provider.");
}
assert.equal((siglip.match(/local_files_only=True/g) ?? []).length, 2);
assert.equal((siglip.match(/trust_remote_code=False/g) ?? []).length, 2);
assert.ok(!/snapshot_download|hf_hub_download|InferenceClient/.test(siglip));
assert.ok((await readFile(join(projectRoot, "python/reference_analyzer/__main__.py"), "utf8")).includes("enforce_offline()"));
for (const ignored of [".venv/", ".tools/", ".uv-cache/", ".reference-cache/", ".local-media/", ".local-runs/", ".test-artifacts/"]) assert.ok((await readFile(join(projectRoot, ".gitignore"), "utf8")).split(/\r?\n/).includes(ignored));
process.stdout.write(`Audited ${filesChecked} application TypeScript files: bounded imports, no network clients or subprocess imports, no explicit any, no hidden clock/random/environment inputs. npm cache/logs are project-local; dependency scripts are disabled.\n`);
const processAdapters = Object.entries(adapterPolicy).filter(([, p]) => p.process !== "none").map(([f]) => f.replace("scripts/", ""));
process.stdout.write(`Also checked the ${Object.keys(adapterPolicy).length} explicit local runtime adapters with per-file capabilities (subprocess-capable: ${processAdapters.join(", ")}), `
  + `the ${testProcessFiles.size} registered test harness process files, no subprocess import anywhere else, Python offline loading policy, and local artifact exclusions.\n`);
