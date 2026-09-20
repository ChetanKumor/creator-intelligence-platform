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
// Side effects are confined to the explicitly named local composition boundary.
const runtimeImports = new Set(["zod", "node:child_process", "node:fs", "node:fs/promises", "node:path", "node:url", "node:crypto", "node:perf_hooks"]);
const localAdapters = ["scripts/reference-local.ts", "scripts/analyze-reference.ts", "scripts/footage-local.ts", "scripts/analyze-footage.ts", "scripts/transnetv2-local.ts", "scripts/audio-local.ts", "scripts/audio-beat-worker.ts", "scripts/audio-energy-worker.ts", "scripts/audio-structure-worker.ts"];
for (const filename of localAdapters) {
  const source = ts.createSourceFile(filename, await readFile(join(projectRoot, filename), "utf8"), ts.ScriptTarget.Latest, true);
  function inspectRuntime(node) {
    assert.notEqual(node.kind, ts.SyntaxKind.AnyKeyword, `Explicit any in ${filename}`);
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const name = node.moduleSpecifier.text;
      assert.ok(name.startsWith(".") || runtimeImports.has(name), `Unexpected local runtime dependency: ${name}`);
    }
    if (ts.isPropertyAssignment(node) && node.name.getText(source) === "shell") assert.equal(node.initializer.kind, ts.SyntaxKind.FalseKeyword, "Local subprocesses must not use a shell.");
    ts.forEachChild(node, inspectRuntime);
  }
  inspectRuntime(source);
}
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
process.stdout.write(`Also checked the ${localAdapters.length} explicit local runtime adapters, Python offline loading policy, and local artifact exclusions.\n`);
