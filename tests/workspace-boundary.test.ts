import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFile, mkdir, mkdtemp, readdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const root = fileURLToPath(new URL("../../", import.meta.url));

async function fixture(): Promise<string> {
  await mkdir(join(root, ".test-artifacts"), { recursive: true });
  const directory = await mkdtemp(join(root, ".test-artifacts", "workspace-boundary-"));
  const files = ["scripts/audit-workspace.mjs", ".npmrc", ".gitignore", "package.json",
    "python/reference_analyzer/siglip.py", "python/reference_analyzer/__main__.py"];
  for (const filename of await readdir(join(root, "scripts"))) {
    if (filename.endsWith(".ts")) files.push(`scripts/${filename}`);
  }
  for (const filename of files) {
    await mkdir(dirname(join(directory, filename)), { recursive: true });
    await copyFile(join(root, filename), join(directory, filename));
  }
  for (const name of ["packages/audio-analyzer", "packages/footage-analyzer", "samples"]) {
    await mkdir(join(directory, name), { recursive: true });
  }
  return directory;
}

function audit(directory: string): { status: number | null; output: string } {
  const result = spawnSync(process.execPath, [join(directory, "scripts/audit-workspace.mjs")], {
    cwd: directory, encoding: "utf8", shell: false, windowsHide: true,
  });
  assert.equal(result.error, undefined);
  return { status: result.status, output: result.stdout + result.stderr };
}

test("workspace audit permits contracts with processes confined to local adapters", async () => {
  const directory = await fixture();
  await writeFile(join(directory, "packages/audio-analyzer/protocol.ts"), 'import { z } from "zod"; export const Value = z.string();\n');
  const result = audit(directory);
  assert.equal(result.status, 0, result.output);
});

test("workspace audit rejects direct process imports and reverse adapter dependencies", async () => {
  const directory = await fixture();
  const path = join(directory, "packages/audio-analyzer/worker.ts");
  for (const source of [
    'import { spawn } from "node:child_process";',
    'export { BeatWorker } from "../../scripts/audio-beat-worker.js";',
  ]) {
    await writeFile(path, source);
    const result = audit(directory);
    assert.notEqual(result.status, 0);
    assert.match(result.output, /Unapproved runtime import|Application import of a local runtime adapter/);
  }
});

test("relocated audio and TransNet adapters retain dependency and no-shell checks", async () => {
  const directory = await fixture();
  for (const filename of ["audio-local.ts", "audio-beat-worker.ts", "audio-energy-worker.ts", "audio-structure-worker.ts", "transnetv2-local.ts"]) {
    const path = join(directory, "scripts", filename);
    for (const source of ['import { get } from "node:https";', 'const options = { shell: true };']) {
      await writeFile(path, source);
      const result = audit(directory);
      assert.notEqual(result.status, 0);
      assert.match(result.output, /Unexpected local runtime dependency|Local subprocesses must not use a shell/);
    }
    await copyFile(join(root, "scripts", filename), path);
  }
});
