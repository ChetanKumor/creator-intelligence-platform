/**
 * Phase 5 Gate 7 Batch 3B: the bounded repair chain from one exact CriticFinding to a new immutable EditGraph revision, and the derived
 * dependency impact that decides what execution may reuse. A critic, a planner or a model never mutates the project: a RepairPlan compiles to
 * a typed GraphDiff, and only the EditGraph's pure application of that GraphDiff to its exact parent makes a revision. Pure: no clock, file,
 * network, model or child program. One bounded cycle; nothing here loops, retries, renders or reviews.
 */
export { EDIT_REPAIR_ERROR_CODES, EDIT_REPAIR_VERSION, EditRepairError, REPAIR_ACTIONS, REPAIR_HARD_LIMITS, REPAIR_IMPLEMENTATION, type EditRepairErrorCode } from "./common.js";
export { FINDING_PRODUCERS, RepairPolicySchema, createRepairPolicy, type RepairPolicy } from "./policy.js";
export { RepairActionSchema, RepairPlanSchema, planRepair, requireRepairPlan, validateRepairPlan, type RepairAction, type RepairPlan, type RepairPlannerIdentity,
  type RepairPlannerInput, type RepairPlannerPort, type RepairPlanningInput } from "./plan.js";
export { applyRepairPlan, compileRepairPlan, validateRepairLineage, validateRepairRevision, type RepairLineageStep } from "./revision.js";
export { DependencyImpactSchema, deriveDependencyImpact, type DependencyImpact, type ImpactSide } from "./impact.js";
