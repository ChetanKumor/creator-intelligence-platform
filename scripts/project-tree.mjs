import { readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const excluded = new Set(["node_modules", "dist", ".npm-cache", ".git", "coverage", ".tools", ".venv", "venv", "venvs", ".uv-cache", ".reference-cache", ".local-media", "local-media", ".local-runs", ".test-artifacts", "__pycache__", ".pytest_cache", "checkpoints", "weights", "model-cache", "datasets", "generated-media"]);
// Keep private environment/media/model files out of the publishable source inventory.
const excludedFile = (name) => (name === ".env" || name.startsWith(".env.")) && name !== ".env.example"
  || /\.(?:log|pyc|mp4|mov|mkv|webm|avi|m4v|mts|m2ts|wav|mp3|flac|aac|m4a|safetensors|pt|pth|onnx|ckpt|pb)$/.test(name)
  || /\.data-.*-of-/.test(name) || name === "variables.index" || name === "checkpoint";
const lines = ["creator-intelligence-platform/"];
async function walk(directory, prefix) {
  const entries = (await readdir(directory, { withFileTypes: true })).filter((entry) => !excluded.has(entry.name) && !excludedFile(entry.name) && !(entry.name === "huggingface" && directory === join(root, ".cache"))).sort((left, right) => Number(right.isDirectory()) - Number(left.isDirectory()) || (left.name < right.name ? -1 : left.name > right.name ? 1 : 0));
  for (const [index, entry] of entries.entries()) {
    if (entry.isSymbolicLink()) throw new Error("Project tree refuses to follow symbolic links.");
    const last = index === entries.length - 1;
    lines.push(`${prefix}${last ? "└── " : "├── "}${entry.name}${entry.isDirectory() ? "/" : ""}`);
    if (entry.isDirectory()) await walk(join(directory, entry.name), `${prefix}${last ? "    " : "│   "}`);
  }
}
await walk(root, "");
const output = `${lines.join("\n")}\n\nIgnored/generated directories omitted: ${[...excluded].map((name) => name + "/").join(", ")}, .cache/huggingface/.\nPrivate environment files, media, model weights, logs and Python bytecode omitted; .env.example remains eligible.\n`;
if (process.argv.includes("--write")) await writeFile(join(root, "docs", "project-tree.txt"), output, "utf8");
process.stdout.write(output);
