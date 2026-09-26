// Test-only Gate-7 Batch-2B helpers: replay-valid Gate 4-7 chains that name the real V0 render executor, the pinned media
// runtime and the observed local environment, built solely from accepted APIs and accepted test helpers. Nothing here starts a
// process, decodes media or reaches a network; the frame tables describe the synthetic fixtures the media suite generates.
import type { MediaMetadata } from "../../packages/reference-analyzer/protocol.js";
import { PINNED_MEDIA_RUNTIME, RENDER_ENVIRONMENT, RENDER_EXECUTOR, createRealExecutionPolicy } from "../../packages/edit-render/index.js";
import { orderedSourcesPolicy } from "./edit-execution-chains.js";
import { runtimeChainFixture, type RuntimeChainSource } from "./edit-runtime-chains.js";
import { TIME6, VIDEO_SUPPORTS, capabilitySnapshot, chosenOption, colorLook, cutAt, declaration, declarations, graphOf, member, atMost, operationNode, plan,
  planningFixture, resolution, scope, withDirection, type DeclarationBody, type GraphFixture } from "./edit-graph.js";
import { T7, admissionOf, dagOf, freshExecutorBody, freshSnapshot, type DagFixture, type ExecutionOptions } from "./edit-execution.js";

export { scope, T7 };
export const REAL_EXECUTOR = RENDER_EXECUTOR;
export const REAL_ENVIRONMENT = RENDER_ENVIRONMENT.environmentId;
export const REAL_RUNTIME = PINNED_MEDIA_RUNTIME.runtimeIdentity;
export type Look = "neutral" | "warm" | "cool" | "contrast";

const gcd = (a: number, b: number): number => b === 0 ? a : gcd(b, a % b);
/** A constant-frame-rate table exactly on the i / fps grid from 0, as the fixture generator writes it (no B-frames, exact MOV timescale). */
export function cfrMetadata(o: { seconds?: number; fps?: number; width?: number; height?: number; hasAudio?: boolean } = {}): MediaMetadata {
  const seconds = o.seconds ?? 4, fps = o.fps ?? 30, width = o.width ?? 90, height = o.height ?? 160, frameCount = seconds * fps, g = gcd(width, height);
  return { durationSeconds: seconds, width, height, codedWidth: width, codedHeight: height, fps: { numerator: fps, denominator: 1 }, frameCount,
    frameTimes: Array.from({ length: frameCount }, (_, i) => i / fps), codec: "h264", rotation: 0, aspectRatio: { width: width / g, height: height / g },
    hasAudio: o.hasAudio ?? true, variableFrameRate: false };
}
/** A variable-frame-rate table: 30 fps on [0, 2) then 10 fps on [2, 4), 80 frames; it keeps the chain's sample instants 0.5, 1.5, 2 and 3.5 s. */
export function vfrMetadata(o: { hasAudio?: boolean } = {}): MediaMetadata {
  const frameTimes = [...Array.from({ length: 60 }, (_, i) => i / 30), ...Array.from({ length: 20 }, (_, i) => 2 + i / 10)];
  return { ...cfrMetadata({ hasAudio: o.hasAudio ?? true }), fps: { numerator: 25, denominator: 1 }, frameCount: frameTimes.length, frameTimes, variableFrameRate: true };
}

/** Attributed Gate-6 declarations naming the real executor. `vfr` makes the attributed claim include variable frame timing, which the real probe must overrule. */
export function realDeclarations(o: { vfr?: boolean } = {}): DeclarationBody[] {
  const video = VIDEO_SUPPORTS.map(s => s.name === "source_frame_timing" && o.vfr ? member("source_frame_timing", "constant_frame_rate", "variable_frame_rate") : s);
  return declarations({
    timeline_video_clip: declaration("timeline_video_clip", video),
    color_look: declaration("color_look", [member("look", "neutral", "warm", "cool", "contrast"), member("target_kind", "whole_output", "clip_uses")]),
    timeline_source_audio: declaration("timeline_source_audio", [member("audio_linkage", "linked_identity"), atMost("clip_count", 120)]),
  });
}

export interface RenderGraphOptions {
  sources: readonly RuntimeChainSource[];
  /** The graph (and final) output resolution; 9:16. */
  resolution?: { width: number; height: number };
  look?: { look: Look; intensityPerMille?: number; target: "whole_output" | readonly number[] };
  cut?: boolean;
  vfr?: boolean;
  sourceAudio?: "linked_identity" | "excluded";
}
export const FINAL_RENDER_RESOLUTION = { width: 180, height: 320 }, PREVIEW_RENDER_RESOLUTION = { width: 90, height: 160 };
/** A replay-valid Gate-6 EditGraph over the given sources, in order, with at most one resolved look and one explicit cut. */
export function renderGraph(o: RenderGraphOptions): GraphFixture {
  const seconds = o.sources.reduce((sum, s) => sum + ((s.range?.endSeconds ?? 2) - (s.range?.startSeconds ?? 0)), 0);
  const x0 = planningFixture(orderedSourcesPolicy(seconds, o.sources.length), runtimeChainFixture(o.sources));
  const nodes = [...x0.source.direction.nodes];
  if (o.look) nodes.push(operationNode(x0, "node_color", { kind: "color_intention", mood: o.look.look, description: "Apply the owned look." }));
  if (o.cut) nodes.push(operationNode(x0, "node_cut", { kind: "transition_intention", relation: "clear_change", description: "A clear change." }));
  const p = plan(o.look || o.cut ? withDirection(x0, { nodes }) : x0);
  const resolutions = [];
  if (o.look) {
    const uses = chosenOption(p).uses;
    const target = o.look.target === "whole_output" ? { kind: "whole_output" } : { kind: "planning_uses", useIds: o.look.target.map(i => uses[i]!.useId) };
    resolutions.push(resolution(p, "node_color", "color_intention", colorLook(o.look.look, target, o.look.intensityPerMille ?? 500)));
  }
  if (o.cut) resolutions.push(resolution(p, "node_cut", "transition_intention", cutAt(p, 0)));
  return graphOf(p, { profile: { resolution: o.resolution ?? FINAL_RENDER_RESOLUTION }, ...(o.sourceAudio ? { policy: { sourceAudio: o.sourceAudio } } : {}),
    snapshot: capabilitySnapshot([freshExecutorBody(realDeclarations({ vfr: o.vfr ?? false }), REAL_EXECUTOR, TIME6, REAL_ENVIRONMENT)], { environment: REAL_ENVIRONMENT }),
    resolutions });
}

/**
 * Execution-time chronology for a chain whose runtime clock is `now`: every Gate-7 observation precedes the grant, the grant
 * precedes admission, and admission precedes `now`. The fixed Batch-1 chronology (T7) is used when no `now` is given.
 */
export function executionTimes(now?: string) {
  if (now === undefined) return { mediaGrant: T7.mediaGrant, capability: T7.capability, estimate: T7.estimate, receipt: T7.receipt, issued: T7.issued, admitted: T7.admitted,
    expires: T7.expires };
  const at = (offset: number) => new Date(Date.parse(now) + offset).toISOString();
  return { mediaGrant: at(-120_000), capability: at(-100_000), estimate: at(-95_000), receipt: at(-90_000), issued: at(-80_000), admitted: at(-60_000), expires: at(3_600_000) };
}
export interface RenderDagOptions extends ExecutionOptions { now?: string; resolution?: { width: number; height: number } }
/** Batch-1 admission and DAG naming the real executor, pinned runtime and local environment; everything else is the accepted synthetic evidence. */
export function renderDag(g: GraphFixture, o: RenderDagOptions = {}): DagFixture {
  const intent = o.intent ?? "final", t = executionTimes(o.now);
  const resolution = o.resolution ?? (intent === "final" ? g.profile.resolution : PREVIEW_RENDER_RESOLUTION);
  const executor = o.executor ?? REAL_EXECUTOR, environment = o.environment ?? REAL_ENVIRONMENT;
  const vfr = g.graph.capabilityRequirements.some(r => r.predicates.some(p => p.name === "source_frame_timing" && p.kind === "member" && p.value === "variable_frame_rate"));
  const snapshot = o.snapshot ?? freshSnapshot([freshExecutorBody(realDeclarations({ vfr }), executor, t.capability, environment)], { environment, asOf: t.capability });
  return dagOf(admissionOf(g, { ...o, intent, executor, environment, snapshot,
    profile: { resolution, ...o.profile }, runtime: { runtime: REAL_RUNTIME, observedAt: t.capability, ...o.runtime },
    mediaGrant: { issuedAt: t.mediaGrant, ...o.mediaGrant }, receipt: source => ({ checkedAt: t.receipt, ...o.receipt?.(source) }),
    estimate: { estimatedAt: t.estimate, ...o.estimate },
    // A new logical attempt is granted as that attempt: the grant names exactly the reservation's attempt.
    grant: { issuedAt: t.issued, expiresAt: t.expires, ...(o.budget?.attempt === undefined ? {} : { attempt: o.budget.attempt }), ...o.grant },
    admittedAt: o.admittedAt ?? t.admitted }));
}

/** The owner's Batch-2B real-execution policy; recommended defaults unless patched. */
export function realPolicy(patch: Record<string, unknown> = {}) {
  return createRealExecutionPolicy({ artifactType: "RealExecutionPolicy", artifactVersion: "0.1.0", stability: "internal_pre_stable", scope,
    author: { kind: "owner", actorId: "owner_synthetic" },
    freshness: { maxRuntimeProbeAgeMilliseconds: 30_000, maxCapabilityProbeAgeMilliseconds: 30_000, maxLifecycleObservationAgeMilliseconds: 30_000,
      maxInputConformanceAgeMilliseconds: 30_000 },
    permitLifetimeMilliseconds: 10_000, process: { maxWallClockMilliseconds: 120_000 }, output: { maxOutputBytes: 64 * 1024 * 1024 }, ...patch });
}
