import { execFile } from "node:child_process";
import { copyFile, mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { hashAsset } from "../../packages/reference-analyzer/features.js";
import { FootageManifestSchema, type FootageAuthorization, type FootageManifest } from "../../packages/footage-analyzer/protocol.js";
import { localBytes, localPaths, PROJECT_ROOT, atomicJson } from "../../scripts/reference-local.js";

export async function mediaCommand(executable: string, args: string[], allowFailure = false) {
  return new Promise<{ stdout: string; stderr: string; exitCode: number }>((accept, reject) => {
    execFile(executable, args, { cwd: PROJECT_ROOT, shell: false, windowsHide: true, timeout: 240000, maxBuffer: 2 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error && !allowFailure) reject(new Error(`Synthetic media command failed: ${stderr.slice(0, 1000)}`));
      else accept({ stdout, stderr, exitCode: error ? typeof error.code === "number" ? error.code : 1 : 0 });
    });
  });
}
export async function authorizedFootageEntry(directory: string, name: string): Promise<FootageManifest["assets"][number]> {
  const identity = await hashAsset(localBytes(join(directory, name)));
  const authorization: FootageAuthorization = { manifestType: "AuthorizedFootage", schemaVersion: "1.0.0", contentHash: identity.contentHash, sizeBytes: identity.sizeBytes,
    sourceType: "synthetic", authorizationBasis: "synthetic_generated", allowedPurposes: ["local_footage_analysis", "local_evaluation"], dateAdded: "2026-09-13T00:00:00.000Z", creatorId: "creator_footage_media", projectId: "project_footage_media" };
  return { entryId: `entry_${name.replace(/[^a-z0-9]/gi, "_")}`, path: name, authorization };
}
export async function createFootageMedia(extended = false) {
  const base = join(PROJECT_ROOT, ".test-artifacts"); await mkdir(base, { recursive: true });
  const directory = await mkdtemp(join(base, "footage-media-"));
  const prefix = ["-hide_banner", "-loglevel", "error", "-nostdin", "-y"];
  const encode = ["-c:v", "libx264", "-pix_fmt", "yuv420p", "-threads", "1"];
  const generate = (args: string[], file: string) => mediaCommand(localPaths.ffmpeg, [...prefix, ...args, ...encode, join(directory, file)]);
  const primary = "synthetic takes & (local).mp4";
  await generate(["-f", "lavfi", "-i", "color=c=red:s=90x160:r=10:d=1", "-f", "lavfi", "-i", "color=c=white:s=90x160:r=10:d=1", "-f", "lavfi", "-i", "color=c=blue:s=90x160:r=10:d=1", "-filter_complex", "[0:v][1:v][2:v]concat=n=3:v=1:a=0[out]", "-map", "[out]"], primary);
  const names = [primary];
  if (extended) {
    await generate(["-f", "lavfi", "-i", "color=c=black:s=160x90:r=4:d=150"], "long-static.mp4");
    await generate(["-f", "lavfi", "-i", "color=c=black:s=64x64:r=10:d=0.1"], "single-frame.mp4");
    await generate(["-f", "lavfi", "-i", "testsrc2=s=160x90:r=10:d=4", "-vf", "gblur=sigma=12:enable='gte(t,2)'"], "moving-blurred.mp4");
    await generate(["-f", "lavfi", "-i", "testsrc2=s=90x160:r=10:d=2", "-vf", "setpts=if(lt(N\\,10)\\,N/(10*TB)\\,1/TB+(N-10)/(5*TB))", "-fps_mode", "vfr"], "variable.mp4");
    await copyFile(join(directory, primary), join(directory, "duplicate.mp4"));
    await writeFile(join(directory, "corrupt.mp4"), "Generated corrupt synthetic fixture.");
    await writeFile(join(directory, "unsupported.txt"), "Generated unsupported synthetic fixture.");
    names.push("long-static.mp4", "single-frame.mp4", "moving-blurred.mp4", "variable.mp4", "duplicate.mp4", "corrupt.mp4", "unsupported.txt");
  }
  const manifest = FootageManifestSchema.parse({ manifestType: "AuthorizedFootageSet", schemaVersion: "1.0.0", creatorId: "creator_footage_media", projectId: "project_footage_media", assets: await Promise.all(names.map((name) => authorizedFootageEntry(directory, name))) });
  const manifestPath = join(directory, "authorized-footage.json"); await atomicJson(manifestPath, manifest);
  return { directory, manifest, manifestPath, primary };
}
