/**
 * Exact derived render work. An output instant is on the frame grid only when ticks × numerator is divisible by
 * ticksPerSecond × denominator, evaluated in arbitrary precision; nothing is rounded to fit. Quantities that cannot be
 * derived from the graph (CPU, GPU, memory, elapsed time, cost) are never computed here.
 */
import type { EditGraph } from "../edit-graph/index.js";
import { check, refuse } from "./common.js";
import type { ExecutionRenderProfile } from "./policy.js";

export interface FrameGrid { readonly ticksPerSecond: number; readonly numerator: number; readonly denominator: number }
const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER);
function exact(value: number, what: string): bigint {
  check(Number.isSafeInteger(value) && value >= 0, "limit_exceeded", `${what} must be a nonnegative safe integer.`);
  return BigInt(value);
}
function safeNumber(value: bigint, what: string): number {
  check(value <= MAX_SAFE, "limit_exceeded", `${what} exceeds exact safe-integer arithmetic.`);
  return Number(value);
}
/** The exact output frame index of a tick instant, or undefined when the instant falls between frames. */
export function frameIndexAt(ticks: number, grid: FrameGrid): number | undefined {
  const scaled = exact(ticks, "Output ticks") * exact(grid.numerator, "Frame-rate numerator");
  const unit = exact(grid.ticksPerSecond, "Output clock") * exact(grid.denominator, "Frame-rate denominator");
  check(unit > 0n, "limit_exceeded", "The frame grid needs a positive clock and denominator.");
  return scaled % unit === 0n ? safeNumber(scaled / unit, "Output frame index") : undefined;
}
export function exactProduct(what: string, ...factors: readonly number[]): number {
  return safeNumber(factors.reduce((product, factor) => product * exact(factor, what), 1n), what);
}
/** Whole milliseconds for work accounting only: the exact duration rounded up, so work is never understated. */
export function ceilingMilliseconds(ticks: number, ticksPerSecond: number): number {
  const unit = exact(ticksPerSecond, "Output clock");
  check(unit > 0n, "limit_exceeded", "The output clock must be positive.");
  return safeNumber((exact(ticks, "Linked audio ticks") * 1000n + unit - 1n) / unit, "Linked audio milliseconds");
}

/**
 * Every declared output instant (clip boundaries, operation extents and joins, total duration) must lie on the render
 * frame grid; otherwise the refusal is explicit. Only then are frame, pixel and linked-audio work derived.
 */
export function deriveRenderWork(graph: EditGraph, profile: ExecutionRenderProfile) {
  const ticksPerSecond = graph.output.clock.ticksPerSecond, grid: FrameGrid = { ticksPerSecond, ...profile.frameRate };
  const instants = new Set<number>([0, graph.output.durationTicks]);
  for (const use of graph.clipUses) { instants.add(use.output.startTicks); instants.add(use.output.endTicks); }
  for (const operation of graph.operations) {
    if (operation.primitive === "color_look") for (const extent of operation.extents) { instants.add(extent.startTicks); instants.add(extent.endTicks); }
    else instants.add(operation.atTicks);
  }
  for (const instant of [...instants].sort((a, b) => a - b)) {
    if (frameIndexAt(instant, grid) === undefined) {
      refuse("output_frame_alignment_unproven", `Output instant ${instant} at ${ticksPerSecond} ticks per second is not on the ${grid.numerator}/${grid.denominator} frame grid.`);
    }
  }
  const outputFrames = frameIndexAt(graph.output.durationTicks, grid)!;
  const video = graph.clipUses.filter(use => use.medium === "video"), audio = graph.clipUses.filter(use => use.medium === "source_audio");
  const audioTicks = safeNumber(audio.reduce((sum, use) => sum + exact(use.output.endTicks - use.output.startTicks, "Linked audio ticks"), 0n), "Linked audio ticks");
  const work = {
    renderIntent: profile.intent, ticksPerSecond, outputDurationTicks: graph.output.durationTicks, frameRate: profile.frameRate, outputFrames,
    resolution: profile.resolution, pixelFrames: exactProduct("Pixel frames", outputFrames, profile.resolution.width, profile.resolution.height),
    linkedSourceAudio: { ticks: audioTicks, milliseconds: ceilingMilliseconds(audioTicks, ticksPerSecond), rounding: "ceiling_of_exact_linked_duration" as const },
    uniqueSourceAssets: new Set(video.map(use => use.source.assetId)).size, videoClipUses: video.length, audioClipUses: audio.length, operations: graph.operations.length,
  };
  return { work, frames: { conformance: "exact_output_frame_grid" as const, checkedInstants: instants.size } };
}
export type RenderWork = ReturnType<typeof deriveRenderWork>["work"];
