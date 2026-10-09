// Precisely undo only the owner-authorized E–F seams when testing the accepted pre-C–D prefix.
// Each literal delta must occur exactly once. The original hash remains the expected value.
import { acceptedGSourceText } from "./canonical-lossless-g-preservation.js";
export function acceptedIngestPrefixText(text: string): string {
  text = acceptedGSourceText("scripts/media-ingest-local.ts", text);
  const swaps: [string, string][] = [
    ['    const boundedTimeout = losslessRemainingTime(ctx, timeoutMilliseconds);\n', ''],
    ['const run = await supervise(child, boundedTimeout, stdoutLimit);', 'const run = await supervise(child, timeoutMilliseconds, stdoutLimit);'],
    ['interface StoredRecord { bytes: string; outputHash: string; outputSize: number; physical?: { dev: bigint; ino: bigint } }', 'interface StoredRecord { bytes: string; outputHash: string; outputSize: number }'],
    ['async function readRecord(store: Store, computationId: string, losslessPlan?: ChromaSafeReencodePlan): Promise<StoredRecord | undefined> {', 'async function readRecord(store: Store, computationId: string): Promise<StoredRecord | undefined> {'],
    ['if (losslessPlan === undefined && `${canonicalSerialize(value)}\\n` !== text)', 'if (`${canonicalSerialize(value)}\\n` !== text)'],
    [`    if (losslessPlan !== undefined) {
      let compact: CanonicalLosslessComputationRecord;
      try { compact = parseLosslessComputationRecordBytes(text, losslessPlan); } catch { fail("cache_corrupt", "The compact lossless computation record is incompatible."); }
      if (compact.computationId !== computationId) fail("cache_corrupt", "The lossless record belongs to another computation.");
      await reconfirm(anchor, "cache_corrupt");
      return { bytes: text, outputHash: compact.output.contentHash, outputSize: compact.output.sizeBytes, physical: { dev: anchor.dev, ino: anchor.ino } };
    }
`, ''],
    [`async function publishRecord(store: Store, name: string, bytes: string, heldLossless = false): Promise<void> {
  if (heldLossless) return publishHeldLosslessRecord(store, name, bytes);`, 'async function publishRecord(store: Store, name: string, bytes: string): Promise<void> {'],
    ['  | CanonicalLosslessPublishedResult\n', ''],
    [`planning?: CanonicalPlanningResult;
    chromaPlanning?: ChromaPlanningResult; deferredReason?: "pcm_retime_unproved" }`, 'planning?: CanonicalPlanningResult }'],
    ['    if (planning.outcome === "DEFER") return await routeChromaSafeLossless(ctx, request, source, observed, classification, planning);\n', ''],
  ];
  for (const [added, original] of swaps) {
    if (text.split(added).length !== 2) throw new Error("Unexpected E–F preservation delta: " + added.slice(0, 90));
    text = text.replace(added, original);
  }
  return text;
}
