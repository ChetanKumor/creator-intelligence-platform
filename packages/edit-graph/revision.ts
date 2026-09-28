/**
 * Gate 7 Batch 3B: the only mutation path of the EditGraph. A GraphDiff is a typed, content-identified list of mechanical operations bound to
 * exactly one parent graph (identity, revision and exact bytes); every operation compares and swaps an exact expected prior value. Applying it
 * is pure: the parent is validated by replay, every operation is checked against it, and the accepted construction is re-run with the exact
 * per-use source selection the operations imply, so every dependent field (placement, linked audio, joins, operation extents and identities,
 * requirements, assessments, readiness, duration, identity) is derived, never supplied. The result is a new immutable EditGraph revision
 * (record 0.3.0) that names its exact parent and GraphDiff and validates only by re-applying that GraphDiff to that parent. Unregistered
 * operations fail closed. The origin names the RepairPlan that proposed the change: provenance for the repair layer, never authority here.
 */
import { z } from "zod";
import { IdSchema } from "../contracts/common.js";
import { ArtifactRefSchema, EditorialArtifactMap, checkIdentity, equal, identify, type SuppliedArtifact } from "../editorial/common.js";
import { FootageAnalysisSchema } from "../footage-analyzer/protocol.js";
import type { BoundaryAuthoritySchema } from "../planning/common.js";
import { EDIT_GRAPH_RECORD_VERSION, EDIT_GRAPH_REVISION_RECORD_VERSION, ScopeSchema, SourceRangeSchema, check, compareTimes, convertTime, decodeLegacySeconds, exactArtifact,
  guard, parse, parseCanonical, rateOf, refuse, sameInstant, sameScope, secondsOf, supplied, type ExactTime, type Rate } from "./common.js";
import { EditGraphBodySchema, EditGraphSchema, constructEditGraphBody, graphIssues, validateEditGraph, type EditGraph, type SourceSelection,
  type VideoClipUse } from "./graph.js";

export const GRAPH_DIFF_VERSION = "0.1.0" as const;
/** The registered V0 operations. Anything else is refused, never ignored: the union is extended only with its own validated semantics. */
export const GRAPH_DIFF_OPERATIONS = ["trim_clip_source_range"] as const;
export const MAX_GRAPH_DIFF_OPERATIONS = 16;
export const MAX_GRAPH_REVISION = 256;

const RevisionNumber = z.number().int().min(0).max(MAX_GRAPH_REVISION);
/** Trim an existing video clip use to an exact subrange of its own authorized source range; its linked audio follows by derivation. */
const TrimClipSourceRangeSchema = z.strictObject({ op: z.literal("trim_clip_source_range"), clipUseId: IdSchema,
  expected: z.strictObject({ range: SourceRangeSchema }), replacement: z.strictObject({ range: SourceRangeSchema }) });
const OperationSchema = z.discriminatedUnion("op", [TrimClipSourceRangeSchema]);
export type GraphDiffOperation = z.infer<typeof OperationSchema>;
/** Who proposed the change. V0 has one origin; an editor's action would be another member with its own authority rules. */
const OriginSchema = z.discriminatedUnion("kind", [z.strictObject({ kind: z.literal("repair_plan"), repairPlan: ArtifactRefSchema, repairPlanId: IdSchema })
  .refine(o => o.repairPlan.artifactType === "RepairPlan" && o.repairPlan.objectId === o.repairPlanId, "The origin names its exact RepairPlan.")]);
/** The parent is named three ways that must agree: identity, revision and the exact artifact reference (its bytes). */
const parentNamed = (p: { editGraph: z.infer<typeof ArtifactRefSchema>; editGraphId: string; revision: number }) => p.editGraph.objectId === p.editGraphId
  && p.editGraph.artifactType === "EditGraph" && p.editGraph.artifactVersion === (p.revision === 0 ? EDIT_GRAPH_RECORD_VERSION : EDIT_GRAPH_REVISION_RECORD_VERSION);
const GraphDiffBodySchema = z.strictObject({
  artifactType: z.literal("GraphDiff"), artifactVersion: z.literal(GRAPH_DIFF_VERSION), stability: z.literal("internal_pre_stable"), scope: ScopeSchema,
  parent: z.strictObject({ editGraph: ArtifactRefSchema, editGraphId: IdSchema, revision: RevisionNumber.max(MAX_GRAPH_REVISION - 1) })
    .refine(parentNamed, "The parent is named by its exact EditGraph reference."),
  operations: z.array(OperationSchema).min(1).max(MAX_GRAPH_DIFF_OPERATIONS)
    .refine(ops => new Set(ops.map(o => o.clipUseId)).size === ops.length, "At most one operation per graph node."),
  origin: OriginSchema, semantics: z.literal("typed_graph_diff_v0"),
});
export const GraphDiffSchema = GraphDiffBodySchema.extend({ graphDiffId: IdSchema }).refine(v => checkIdentity(v, "graphDiffId", "graph_diff_v0"), "GraphDiff identity mismatch.");
export type GraphDiff = z.infer<typeof GraphDiffSchema>;

// ---------------------------------------------------------------- EditGraph 0.3.0: a revision of an exact parent by an exact GraphDiff
const RevisionParentSchema = z.strictObject({ state: z.literal("present"), editGraph: ArtifactRefSchema, editGraphId: IdSchema, revision: RevisionNumber.max(MAX_GRAPH_REVISION - 1) });
const RevisionChangeSetSchema = z.strictObject({ kind: z.literal("graph_diff"), graphDiff: ArtifactRefSchema, graphDiffId: IdSchema });
const EditGraphRevisionBodySchema = EditGraphBodySchema.extend({
  artifactVersion: z.literal(EDIT_GRAPH_REVISION_RECORD_VERSION), version: z.literal(EDIT_GRAPH_REVISION_RECORD_VERSION),
  revision: RevisionNumber.min(1), parent: RevisionParentSchema, changeSet: RevisionChangeSetSchema,
});
type EditGraphRevisionBody = z.infer<typeof EditGraphRevisionBodySchema>;
function revisionIssues(graph: EditGraphRevisionBody): string[] {
  const issues: string[] = [];
  if (graph.revision !== graph.parent.revision + 1) issues.push("A revision increments its parent's revision exactly once.");
  if (!parentNamed(graph.parent)) issues.push("The parent is named by its exact EditGraph reference.");
  const change = graph.changeSet;
  if (change.graphDiff.objectId !== change.graphDiffId || change.graphDiff.artifactType !== "GraphDiff" || change.graphDiff.artifactVersion !== GRAPH_DIFF_VERSION) {
    issues.push("The change set names its exact GraphDiff reference.");
  }
  return issues;
}
export const EditGraphRevisionSchema = EditGraphRevisionBodySchema.extend({ editGraphId: IdSchema }).superRefine((graph, ctx) => {
  for (const message of [...graphIssues(graph), ...revisionIssues(graph)]) ctx.addIssue({ code: "custom", message });
});
export type EditGraphRevision = z.infer<typeof EditGraphRevisionSchema>;
/** Any authoritative EditGraph record: an initial graph (0.2.0) or a revision (0.3.0). They share every composition field. */
export type AnyEditGraph = EditGraph | EditGraphRevision;

type BoundaryAuthority = z.infer<typeof BoundaryAuthoritySchema>;

// ---------------------------------------------------------------- reading any EditGraph record version
const versionOf = (input: unknown) => input !== null && typeof input === "object" ? (input as Record<string, unknown>).artifactVersion : undefined;
/** Parses either record version by its own schema; any other EditGraph version is refused, never reinterpreted. */
export function parseAnyEditGraph(input: unknown): AnyEditGraph {
  if (versionOf(input) === EDIT_GRAPH_REVISION_RECORD_VERSION) return parse(EditGraphRevisionSchema, input);
  const record = input !== null && typeof input === "object" ? input as { artifactType?: unknown } : undefined;
  if (record?.artifactType === "EditGraph" && versionOf(input) !== EDIT_GRAPH_RECORD_VERSION) {
    refuse("graph_version_unsupported", `EditGraph ${String(versionOf(input))} is neither the exact-time initial schema ${EDIT_GRAPH_RECORD_VERSION} nor a revision `
      + `${EDIT_GRAPH_REVISION_RECORD_VERSION}; a legacy float-second graph is never reinterpreted. Rebuild it from its Gate-5 decision.`);
  }
  return parse(EditGraphSchema, input);
}
/** The two validation paths: an initial graph replays from its Gate-5 decision; a revision replays from its exact parent and GraphDiff. */
export function validateAnyEditGraph(input: unknown, artifacts: readonly SuppliedArtifact[]): AnyEditGraph {
  return versionOf(input) === EDIT_GRAPH_REVISION_RECORD_VERSION ? validateEditGraphRevision(input, artifacts) : validateEditGraph(input, artifacts);
}

// ---------------------------------------------------------------- GraphDiff creation: typed operations only
/** Operation names are read first: an unregistered operation (a JSON patch, a pointer path, a future edit) is refused as unsupported. */
function refuseUnsupported(input: unknown): void {
  const operations = input !== null && typeof input === "object" ? (input as Record<string, unknown>).operations : undefined;
  if (!Array.isArray(operations)) return;
  for (const operation of operations) {
    const op = operation !== null && typeof operation === "object" ? (operation as Record<string, unknown>).op : undefined;
    check(typeof op === "string" && (GRAPH_DIFF_OPERATIONS as readonly string[]).includes(op), "graph_diff_operation_unsupported",
      "Only registered typed GraphDiff operations exist; JSON patches, pointer paths and unregistered edits are refused, never ignored.");
  }
}
export function createGraphDiff(input: unknown): GraphDiff {
  refuseUnsupported(input);
  return parse(GraphDiffSchema, identify("graph_diff_v0", "graphDiffId", parse(GraphDiffBodySchema, input, "graph_diff_invalid")), "graph_diff_invalid");
}
function requireGraphDiff(input: unknown): GraphDiff {
  refuseUnsupported(input);
  return parseCanonical(GraphDiffSchema, input, "graph_diff_invalid");
}

// ---------------------------------------------------------------- application: compare-and-swap, then the accepted construction derives everything
const requestOf = (g: AnyEditGraph) => ({ planningDecision: g.lineage.planningDecision, policy: g.policy, outputProfile: g.outputProfile,
  techniqueResolutions: g.techniqueResolutions, capabilitySnapshot: g.capability.snapshot });
/**
 * A changed endpoint must be an instant the graph clock represents exactly (it becomes output ticks) and an admitted source frame: the exact
 * legacy decoding, at the graph clock, of one entry of the clip's own analysis frame table. The derived double only locates the candidate
 * entry; the exact decoding decides. Nothing is snapped to a nearby frame.
 */
function frameAuthority(clip: VideoClipUse, instant: ExactTime, clock: Rate, map: EditorialArtifactMap): BoundaryAuthority {
  guard("time_not_representable", () => convertTime(instant, clock, "exact"));
  const analysis = parse(FootageAnalysisSchema, exactArtifact(map, clip.source.analysis, "FootageAnalysis", "1.0.0", "graph_diff_invalid"), "graph_diff_invalid");
  check(analysis.assetId === clip.source.assetId && analysis.contentHash === clip.source.sourceHash, "graph_diff_invalid", "The clip's analysis names another source.");
  const frameIndex = analysis.metadata.frameTimes.indexOf(secondsOf(instant));
  const decoded = frameIndex < 0 ? undefined : decodeLegacySeconds(analysis.metadata.frameTimes[frameIndex]!, clock);
  check(decoded !== undefined && sameInstant(decoded, instant), "graph_diff_endpoint_not_a_frame", "A changed endpoint must be an admitted source frame; nothing is snapped.");
  return { kind: "frame_pts", frameIndex, evidence: { artifact: clip.source.analysis, pointer: `/metadata/frameTimes/${frameIndex}` } };
}
/**
 * One trim checked against its exact parent: a video clip use of this parent, compare-and-swap on its exact range, a real change, inside the
 * parent's range, and exact frame authority for every changed endpoint. Returns the use's new exact selection. The repair layer validates a
 * proposal with exactly this rule before it becomes a GraphDiff.
 */
export function trimSelectionOf(parent: AnyEditGraph, operation: GraphDiffOperation, artifacts: readonly SuppliedArtifact[] | EditorialArtifactMap):
  { useId: string; selection: SourceSelection } {
  const clip = parent.clipUses.find(c => c.clipUseId === operation.clipUseId);
  check(clip !== undefined && clip.medium === "video", "graph_diff_target_invalid", "The operation names no video clip use of the exact parent; linked audio follows its video.");
  const prior = clip.source.range, next = operation.replacement.range;
  check(equal(prior, operation.expected.range), "graph_diff_expected_mismatch", "Compare-and-swap failed: the parent's exact source range is not the expected one.");
  check(!equal(next, prior), "graph_diff_noop", "A trim that changes nothing is not an edit.");
  check(compareTimes(prior.start, next.start) <= 0 && compareTimes(next.end, prior.end) <= 0, "graph_diff_outside_authorized_range",
    "A trim selects only inside the parent's exact source range; it never extends source authority.");
  const map = artifacts instanceof EditorialArtifactMap ? artifacts : guard("input_invalid", () => new EditorialArtifactMap(artifacts));
  const clock = rateOf(parent.output.clock.ticksPerSecond);
  const startAuthority = sameInstant(next.start, prior.start) ? clip.source.startAuthority : frameAuthority(clip, next.start, clock, map);
  const endAuthority = sameInstant(next.end, prior.end) ? clip.source.endAuthority : frameAuthority(clip, next.end, clock, map);
  return { useId: clip.planningUse.useId, selection: { range: next, startAuthority, endAuthority,
    precision: startAuthority.kind === "frame_pts" && endAuthority.kind === "frame_pts" ? "frame_pts_exact" : "source_seconds" } };
}
/** The exact source selection of every use after the operations: the parent's own selection, with each operation compared and swapped. */
function selectionsAfter(parent: AnyEditGraph, diff: GraphDiff, artifacts: readonly SuppliedArtifact[]): Map<string, SourceSelection> {
  const video = parent.clipUses.filter((c): c is VideoClipUse => c.medium === "video");
  const selections = new Map<string, SourceSelection>(video.map(c => [c.planningUse.useId,
    { range: c.source.range, startAuthority: c.source.startAuthority, endAuthority: c.source.endAuthority, precision: c.source.precision }]));
  const map = guard("input_invalid", () => new EditorialArtifactMap(artifacts));
  for (const operation of diff.operations) {
    const { useId, selection } = trimSelectionOf(parent, operation, map);
    selections.set(useId, selection);
  }
  return selections;
}
/**
 * Applies one GraphDiff to its exact parent. Pure: no clock, file, network or randomness; the parent object is never mutated. The parent is
 * validated by replay, the diff must name exactly it (identity, revision and bytes), every operation compares and swaps, and the accepted
 * construction derives every dependent field. The result is a new immutable revision naming the exact parent and GraphDiff.
 */
export function applyGraphDiff(parentInput: unknown, diffInput: unknown, artifacts: readonly SuppliedArtifact[]): EditGraphRevision {
  const diff = requireGraphDiff(diffInput);
  const parent = validateAnyEditGraph(parentInput, artifacts);
  check(sameScope(diff.scope, parent.scope), "scope_mismatch", "A GraphDiff never crosses project, creator or purpose.");
  const parentRef = supplied(parent, parent.editGraphId).ref;
  check(equal(diff.parent, { editGraph: parentRef, editGraphId: parent.editGraphId, revision: parent.revision }), "graph_diff_parent_mismatch",
    "The GraphDiff is bound to another graph, revision or parent bytes; a stale diff is refused, never merged.");
  check(parent.revision < MAX_GRAPH_REVISION, "limit_exceeded", `At most ${MAX_GRAPH_REVISION} revisions.`);
  const body = constructEditGraphBody(requestOf(parent), artifacts, selectionsAfter(parent, diff, artifacts));
  const child = { ...body, artifactVersion: EDIT_GRAPH_REVISION_RECORD_VERSION, version: EDIT_GRAPH_REVISION_RECORD_VERSION, revision: parent.revision + 1,
    parent: { state: "present", editGraph: parentRef, editGraphId: parent.editGraphId, revision: parent.revision },
    changeSet: { kind: "graph_diff", graphDiff: supplied(diff, diff.graphDiffId).ref, graphDiffId: diff.graphDiffId } };
  return parse(EditGraphRevisionSchema, identify("edit_graph_v0", "editGraphId", child));
}
/** Semantic replay of a revision: its exact parent (itself validated, down to the Gate-5 root) and its exact GraphDiff must reproduce it. */
export function validateEditGraphRevision(input: unknown, artifacts: readonly SuppliedArtifact[]): EditGraphRevision {
  const child = parse(EditGraphRevisionSchema, input);
  const map = guard("input_invalid", () => new EditorialArtifactMap(artifacts));
  const parent = exactArtifact(map, child.parent.editGraph, "EditGraph", child.parent.editGraph.artifactVersion, "graph_replay_mismatch");
  const diff = exactArtifact(map, child.changeSet.graphDiff, "GraphDiff", GRAPH_DIFF_VERSION, "graph_replay_mismatch");
  check(equal(applyGraphDiff(parent, diff, artifacts), child), "graph_replay_mismatch",
    "The revision contradicts deterministic re-application of its exact GraphDiff to its exact parent.");
  return structuredClone(child);
}
