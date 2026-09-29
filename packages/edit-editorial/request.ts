import { z } from "zod";
import { IdSchema } from "../contracts/common.js";
import { canonicalSerialize } from "../domain/serialization.js";
import { ArtifactRefSchema, equal, type SuppliedArtifact } from "../editorial/common.js";
import { Nat, OwnerSchema, ScopeSchema, SourceRangeSchema } from "../edit-graph/common.js";
import { supplied, trimSelectionOf, type AnyEditGraph } from "../edit-graph/index.js";
import { LocationFreeVersionSchema } from "../edit-execution/common.js";
import { EditorialControlError, LIMITS, canonical, check, envelope, frozen, header, identity, parse, record } from "./common.js";
import { GraphBindingSchema, IntervalSchema, TargetSchema, graphBinding, graphForTarget, stateRef, type EditorialState } from "./state.js";

export const EditingHeadSchema = z.strictObject({ ...envelope("EditingHead"), scope: ScopeSchema, headRevision: Nat.max(LIMITS.headRevisions),
  currentGraph: GraphBindingSchema, currentState: ArtifactRefSchema, previousHead: ArtifactRefSchema.nullable(),
  transition: z.discriminatedUnion("kind", [z.strictObject({ kind: z.literal("initial") }),
    z.strictObject({ kind: z.literal("state_only"), diff: ArtifactRefSchema }),
    z.strictObject({ kind: z.literal("rendered_revision"), diff: ArtifactRefSchema, receipt: ArtifactRefSchema, qc: ArtifactRefSchema })]),
  headId: IdSchema }).refine(identity("headId", "editing_head_v0"));
export type EditingHead = z.infer<typeof EditingHeadSchema>;
export const headRef = (head: EditingHead) => supplied(head, head.headId).ref;
export function createEditingHead(graph: AnyEditGraph, state: EditorialState, previous: EditingHead | null,
  transition: EditingHead["transition"]): EditingHead {
  check(equal(graphBinding(graph), state.currentGraph) && equal(graph.scope, state.scope), "head_graph_state_mismatch");
  if (previous === null) check(state.stateRevision === 0 && transition.kind === "initial", "head_transition_invalid");
  else {
    check(equal(previous.scope, state.scope) && equal(previous.currentState, state.parentState), "head_transition_invalid");
    check(transition.kind !== "initial", "head_transition_invalid");
    if (transition.kind === "state_only") check(equal(previous.currentGraph, graphBinding(graph)) && state.change.kind === "state_diff"
      && equal(state.change.diff, transition.diff), "head_transition_invalid");
    else check(graph.parent.state === "present" && equal(graph.parent.editGraph, previous.currentGraph.artifact)
      && state.change.kind === "graph_rebase" && equal(state.change.diff, transition.diff), "head_transition_invalid");
  }
  return record(EditingHeadSchema, "headId", "editing_head_v0", { ...header("EditingHead"), scope: graph.scope,
    headRevision: previous === null ? 0 : previous.headRevision + 1, currentGraph: graphBinding(graph), currentState: stateRef(state),
    previousHead: previous === null ? null : headRef(previous), transition });
}
export const AllowedScopeSchema = z.strictObject({ graph: GraphBindingSchema, clipUseIds: z.array(IdSchema).min(1).max(16)
  .refine(v => new Set(v).size === v.length), interval: IntervalSchema, ticksPerSecond: z.number().int().positive().safe() });
export const EditorialRequestSchema = z.strictObject({ ...envelope("EditorialRequest"), scope: ScopeSchema, requestKey: IdSchema,
  rawUserText: z.string().min(1).max(LIMITS.text).refine(v => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(v)),
  baseHead: ArtifactRefSchema, baseGraph: GraphBindingSchema, baseState: ArtifactRefSchema, selectedTarget: TargetSchema.nullable(),
  referencedRevision: GraphBindingSchema.nullable(), allowedScope: AllowedScopeSchema.nullable(), requestId: IdSchema })
  .refine(identity("requestId", "editorial_request_v0"));
export type EditorialRequest = z.infer<typeof EditorialRequestSchema>;
export function createEditorialRequest(input: Omit<EditorialRequest, "requestId" | "artifactType" | "artifactVersion" | "stability">): EditorialRequest {
  return record(EditorialRequestSchema, "requestId", "editorial_request_v0", { ...header("EditorialRequest"), ...input });
}
export interface CurrentEditingContext { head: EditingHead; graph: AnyEditGraph; state: EditorialState; artifacts: readonly SuppliedArtifact[] }
export function validateCurrentRequest(requestInput: unknown, c: CurrentEditingContext): EditorialRequest {
  const r = canonical(EditorialRequestSchema, requestInput);
  check(equal(r.scope, c.head.scope) && equal(c.graph.scope, r.scope) && equal(c.state.scope, r.scope), "editorial_scope_mismatch");
  check(equal(c.head.currentState, stateRef(c.state)) && equal(c.head.currentGraph, graphBinding(c.graph)), "head_graph_state_mismatch");
  check(equal(r.baseHead, headRef(c.head)) && equal(r.baseGraph, c.head.currentGraph) && equal(r.baseState, c.head.currentState), "stale_editing_head");
  if (r.selectedTarget) {
    graphForTarget(r.selectedTarget, c.graph, c.artifacts, true);
    if (!equal(r.selectedTarget.graph, c.head.currentGraph)) check(equal(r.referencedRevision, r.selectedTarget.graph), "editorial_revision_reference_required");
  }
  if (r.referencedRevision) check(r.selectedTarget && equal(r.selectedTarget.graph, r.referencedRevision), "editorial_revision_reference_invalid");
  if (r.allowedScope) {
    const s = r.allowedScope;
    check(equal(s.graph, c.head.currentGraph) && s.ticksPerSecond === c.graph.output.clock.ticksPerSecond
      && s.interval.endTicks <= c.graph.output.durationTicks && s.clipUseIds.every(id => c.graph.clipUses.some(v => v.medium === "video" && v.clipUseId === id)),
    "editorial_scope_invalid");
  }
  return r;
}
export const IntentActionSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("lock_target"), target: TargetSchema }),
  z.strictObject({ kind: z.literal("unlock_target"), lockId: IdSchema }),
  z.strictObject({ kind: z.literal("set_preference"), target: TargetSchema, value: z.enum(["liked", "rejected"]) }),
  z.strictObject({ kind: z.literal("clear_preference"), target: TargetSchema }),
  z.strictObject({ kind: z.literal("request_edit"), target: TargetSchema, operation: z.literal("trim_clip_source_range"), keep: SourceRangeSchema }),
  z.strictObject({ kind: z.literal("unsupported"), reason: z.enum(["unsupported_capability", "ambiguous_request", "compound_request"]) }),
]);
export type IntentAction = z.infer<typeof IntentActionSchema>;
export const ProducerSchema = z.strictObject({ implementationId: IdSchema, version: LocationFreeVersionSchema,
  basis: z.enum(["deterministic_fixture", "manual_typed_action"]) });
export const EditorialIntentSchema = z.strictObject({ ...envelope("EditorialIntent"), scope: ScopeSchema, request: ArtifactRefSchema,
  producer: ProducerSchema, action: IntentActionSchema, intentId: IdSchema }).refine(identity("intentId", "editorial_intent_v0"));
export type EditorialIntent = z.infer<typeof EditorialIntentSchema>;
export interface EditorialInterpreterPort {
  readonly identity: z.infer<typeof ProducerSchema>;
  interpret(context: Readonly<{ request: EditorialRequest; graph: AnyEditGraph; state: EditorialState }>): Promise<unknown>;
}
export function createEditorialIntent(requestInput: unknown, actionInput: unknown, producer: unknown, c: CurrentEditingContext): EditorialIntent {
  const request = validateCurrentRequest(requestInput, c), action = parse(IntentActionSchema, actionInput, "editorial_intent_invalid");
  if (action.kind === "unlock_target") {
    const lock = c.state.hardLocks.find(l => l.lockId === action.lockId);
    check(lock && equal(lock.target, request.selectedTarget), "editorial_target_invalid");
  } else if (action.kind !== "unsupported") {
    check(equal(action.target, request.selectedTarget), "editorial_target_invalid");
    graphForTarget(action.target, c.graph, c.artifacts, action.kind === "set_preference" || action.kind === "clear_preference");
    if (action.kind === "request_edit") {
      check(request.allowedScope !== null && request.allowedScope.clipUseIds.includes(action.target.clipUseId), "editorial_scope_required");
      const clip = c.graph.clipUses.find(v => v.clipUseId === action.target.clipUseId)!;
      trimSelectionOf(c.graph, { op: action.operation, clipUseId: action.target.clipUseId, expected: { range: clip.source.range }, replacement: { range: action.keep } }, c.artifacts);
    }
  }
  return record(EditorialIntentSchema, "intentId", "editorial_intent_v0", { ...header("EditorialIntent"), scope: request.scope,
    request: supplied(request, request.requestId).ref, producer: parse(ProducerSchema, producer), action });
}
export async function interpretEditorialRequest(request: unknown, context: CurrentEditingContext, interpreter: EditorialInterpreterPort): Promise<EditorialIntent> {
  // Snapshot every caller-owned input, including producer identity, before the first await.
  const c = structuredClone(context), r = validateCurrentRequest(structuredClone(request), c), producer = parse(ProducerSchema, interpreter.identity);
  let response: unknown;
  try { response = await interpreter.interpret(frozen({ request: r, graph: c.graph, state: c.state })); }
  catch { throw new EditorialControlError("editorial_interpreter_failed"); }
  let encoded: string;
  try { encoded = canonicalSerialize(response); }
  catch { throw new EditorialControlError("editorial_intent_invalid"); }
  check(new TextEncoder().encode(encoded).length <= LIMITS.responseBytes, "editorial_budget_exceeded");
  return createEditorialIntent(r, response, producer, c);
}
export const EditorialPolicySchema = z.strictObject({ ...envelope("EditorialPolicy"), scope: ScopeSchema, author: OwnerSchema,
  limits: z.strictObject({ graphOperations: z.literal(1), stateOperations: z.literal(1), interpretedActions: z.literal(1), responseBytes: z.literal(16384) }),
  policyId: IdSchema }).refine(identity("policyId", "editorial_policy_v0"));
export type EditorialPolicy = z.infer<typeof EditorialPolicySchema>;
export function createEditorialPolicy(scope: unknown, author: unknown): EditorialPolicy {
  return record(EditorialPolicySchema, "policyId", "editorial_policy_v0", { ...header("EditorialPolicy"), scope, author,
    limits: { graphOperations: 1, stateOperations: 1, interpretedActions: 1, responseBytes: 16384 } });
}
