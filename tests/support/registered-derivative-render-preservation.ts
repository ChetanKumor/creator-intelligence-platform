// H's exact inverse delta. Historical hash expectations stay unchanged; every authorized insertion must occur exactly once.
import assert from "node:assert/strict";
const additions = [
  "  // H: awaited staged-byte validation cannot leave a live lifecycle change behind the issuance boundary.\n  const confirming = runtimeNow(runtime);\n  confirmPermitBindingCurrent(binding, confirming);\n  for (const observation of lifecycle) observation.reconfirm(confirming);\n",
  "    // H: requery after awaited binary/input validation, before consuming the durable execution claim.\n    try { for (const observation of lifecycle) observation.reconfirm(startedAt); }\n    catch (error) { return failed(\"authority_recheck\", code(error, \"permit_required\")); }\n",
  "      // H: a change while publishing the start or inside instrumentation is a consumed-claim failure, never a spawn.\n      try { for (const observation of lifecycle) observation.reconfirm(spawnedAt); }\n      catch (error) { return failed(\"authority_recheck\", code(error, \"permit_required\")); }\n",
  "    // H: the same permit can enter this accepted path; close its awaited pre-start lifecycle window.\n    try { for (const observation of lifecycle) observation.reconfirm(startedAt); }\n    catch (error) { return failed(\"authority_recheck\", code(error, \"permit_required\")); }\n",
  "      // H: only the first media process is a pre-execution boundary; already-started execution semantics stay unchanged.\n      if (processes.length === 0) for (const observation of lifecycle) observation.reconfirm(spawnedAt);\n",
] as const;
export function acceptedHRendererBytes(path: string, bytes: Buffer): Buffer {
  if (path !== "scripts/edit-render-local.ts") return bytes;
  let text = bytes.toString("utf8");
  for (const addition of additions) {
    assert.equal(text.split(addition).length - 1, 1, "H's literal lifecycle requery addition occurs exactly once");
    text = text.replace(addition, "");
  }
  return Buffer.from(text);
}
