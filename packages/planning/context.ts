import { z } from "zod";
import { ArtifactRefSchema, EditorialArtifactMap, ensure, equal, type ArtifactRef, type SuppliedArtifact } from "../editorial/common.js";
import { EditorialCandidateSetSchema, validateCandidateSet } from "../editorial/decision.js";
import { type EditorialToken } from "../editorial/token.js";
import { FootageAnalysisSchema } from "../footage-analyzer/protocol.js";
import { CandidateSummarySchema, DirectorRequestSchema, IntentSpecSchema, validateCreativeDirectionGraph, type CreativeDirectionGraph, type IntentSpec } from "../director/index.js";
import { ComputeBudgetSchema, budget } from "../routing/index.js";
import { WorldSnapshotSchema, WorldViewSchema, validateGroundedSupport, type GroundedSupport, type WorldSnapshot, type WorldView } from "../world-model/index.js";
import { PlanningAlternativesSchema, PlanningDecisionSchema, PlanningPolicySchema, type PlanningContext, type PlanningPolicy, type PlanningUse } from "./common.js";

type FootageAnalysis = z.infer<typeof FootageAnalysisSchema>;

export function exact(map: EditorialArtifactMap, refInput: ArtifactRef, kind: string, version = "0.1.0"): unknown {
  const ref = ArtifactRefSchema.parse(refInput);
  ensure(ref.artifactType === kind && ref.artifactVersion === version, `Exact ${kind} reference required.`);
  return map.get(ref);
}
export interface PlanningInputs {
  context: PlanningContext; contextRef: ArtifactRef; policy: PlanningPolicy; direction: CreativeDirectionGraph; intent: IntentSpec;
  world: WorldSnapshot; view: WorldView; tokens: Map<string, EditorialToken>; analyses: Map<string, FootageAnalysis>;
  map: EditorialArtifactMap; preceding: PlanningUse[]; computeBudget: z.infer<typeof ComputeBudgetSchema>;
}

/** Previous decisions have already been replayed by the bounded caller in index.ts. */
export function resolvePlanningInputs(context: PlanningContext, contextRef: ArtifactRef, artifacts: readonly SuppliedArtifact[], map: EditorialArtifactMap): PlanningInputs {
  const policy = PlanningPolicySchema.parse(exact(map, context.policy, "PlanningPolicy"));
  ensure(equal(policy.scope, context.scope), "Planning policy scope mismatch.");
  const direction = validateCreativeDirectionGraph(exact(map, context.direction, "CreativeDirectionGraph"), context.directorRequest, { artifacts, worldQuery: context.worldQuery });
  const request = DirectorRequestSchema.parse(exact(map, context.directorRequest, "DirectorRequest"));
  const summary = CandidateSummarySchema.parse(exact(map, request.candidateSummaryView, "DirectorCandidateSummary"));
  ensure(equal(direction.scope, context.scope) && equal(request.scope, context.scope), "Planning project/creator/purpose mismatch.");
  ensure(equal(context.worldSnapshot, direction.worldSnapshot) && equal(context.candidateUniverse, direction.candidateUniverse)
    && equal(context.worldView, request.worldView) && equal(context.worldSnapshot, summary.worldSnapshot), "Planning exact snapshot/view/universe mismatch.");
  const world = WorldSnapshotSchema.parse(exact(map, context.worldSnapshot, "ProjectWorldModel"));
  const view = WorldViewSchema.parse(exact(map, context.worldView, "ProjectWorldView"));
  const intent = IntentSpecSchema.parse(exact(map, request.intent, "IntentSpec"));
  const { set, tokens } = validateCandidateSet(EditorialCandidateSetSchema.parse(exact(map, context.candidateUniverse, "EditorialCandidateSet")), map);
  ensure(equal(set.candidates, context.candidates), "Planning must bind the complete exact candidate universe and token snapshots.");
  const analyses = new Map<string, FootageAnalysis>();
  for (const entry of context.candidates) {
    const token = tokens.get(entry.candidateId)!;
    const analysis = FootageAnalysisSchema.parse(exact(map, token.analysis.artifact, "FootageAnalysis", "1.0.0"));
    ensure(analysis.authorization.projectId === context.scope.projectId && analysis.authorization.creatorId === context.scope.creatorId
      && analysis.authorization.allowedPurposes.includes(context.scope.purpose as never), "Planning source scope unavailable.");
    ensure(world.tokenLinks.some(link => link.candidateId === entry.candidateId && equal(link.token, entry.token)), "Planning token is outside pinned world.");
    analyses.set(entry.candidateId, analysis);
  }
  const computeBudget = ComputeBudgetSchema.parse(exact(map, context.computeBudget, "ComputeBudget"));
  const { budgetId: _id, ...budgetBody } = computeBudget;
  ensure(equal(budget(budgetBody, artifacts), computeBudget) && equal(computeBudget.scope, context.scope), "Planning budget authorization mismatch.");
  ensure(computeBudget.cpuMilliseconds > 0 && computeBudget.wallClockMilliseconds > 0 && computeBudget.peakRamBytes > 0, "Planning has no authorized CPU, elapsed time or memory.");
  const preceding: PlanningUse[] = [];
  for (const prior of context.previousDecisions) {
    const decision = PlanningDecisionSchema.parse(exact(map, prior, "PlanningDecision"));
    ensure(equal(decision.scope, context.scope), "Previous planning decision scope mismatch.");
  }
  for (const useRef of context.precedingUses) {
    ensure(context.previousDecisions.some(ref => equal(ref, useRef.decision)), "Preceding use requires an exact previous decision ref.");
    const decision = PlanningDecisionSchema.parse(exact(map, useRef.decision, "PlanningDecision"));
    ensure(decision.outcome.kind === "chosen" && decision.outcome.optionId === useRef.optionId, "Preceding use cannot invent a winner from a tie or abstention.");
    const manifest = PlanningAlternativesSchema.parse(exact(map, decision.alternativesConsidered, "PlanningAlternatives"));
    const use = manifest.options.find(o => o.option.optionId === useRef.optionId)?.option.uses.find(u => u.useId === useRef.useId);
    ensure(use && context.candidates.some(c => c.candidateId === use.candidateId && equal(c.token, use.token)), "Unknown preceding use or different exact token snapshot.");
    preceding.push(use);
  }
  return { context, contextRef, policy, direction, intent, world, view, tokens, analyses, map, preceding, computeBudget };
}

export function candidateBinding(input: PlanningInputs, candidateId: string, tokenRef?: ArtifactRef) {
  const binding = input.context.candidates.find(c => c.candidateId === candidateId);
  ensure(binding && (!tokenRef || equal(binding.token, tokenRef)), "Unknown candidate or wrong exact token snapshot in pinned universe.");
  return binding;
}
export function groundedCandidate(input: PlanningInputs, candidateId: string): { support: GroundedSupport; entityIndex: number } | undefined {
  const binding = candidateBinding(input, candidateId), token = input.tokens.get(candidateId)!;
  for (const link of input.world.candidateLinks.filter(l => l.candidateId === candidateId && equal(l.token, binding.token))) {
    const entityIndex = input.view.returned.findIndex(e => e.entityId === link.entityId);
    if (entityIndex < 0) continue;
    const entity = input.view.returned[entityIndex]!;
    if (entity.support.state !== "present") continue;
    const support = validateGroundedSupport(entity.support.value, input.map);
    if (!equal(support.analysis, token.analysis.artifact) || support.sourceHash !== token.sourceHash || support.assetId !== token.candidate.assetId || support.shotId !== token.candidate.shotId) continue;
    if (support.range.startSeconds <= token.candidate.sourceRange.startSeconds && support.range.endSeconds >= token.candidate.sourceRange.endSeconds) return { support, entityIndex };
  }
  return undefined;
}
