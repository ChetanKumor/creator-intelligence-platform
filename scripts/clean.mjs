import { rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// A fixed project-relative build directory; never accepts a user-supplied path.
const projectRoot = resolve(fileURLToPath(new URL("../", import.meta.url)));
const buildDirectory = resolve(projectRoot, "dist");
if (dirname(buildDirectory) !== projectRoot) throw new Error("Build cleanup escaped the project root.");
rmSync(buildDirectory, { recursive: true, force: true });
