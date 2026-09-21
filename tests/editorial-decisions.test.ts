import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { test } from "node:test";
import ts from "typescript";
import { missing, present } from "../packages/editorial/common.js";
import { EditorialCandidateSetSchema, EditorialContextSchema, EditorialDecisionSchema, EditorialTimelineLinkageSchema, ObservationSchema, createEditorialCandidateSet, createEditorialContext, createEditorialDecision, createEditorialTimelineLinkage, editorialExposure, validateCandidateSet, validateEditorialContext, validateEditorialDecision, validateTimelineLinkage } from "../packages/editorial/decision.js";
import { createEditorialToken } from "../packages/editorial/token.js";
import { taskRef } from "../packages/editorial/taxonomy.js";
import { TIME, artifact, decisionFixture } from "./support/editorial.js";

function taskBindingFixture(task: "keep_reject" | "technical_usability" | "aesthetic_usability" | "trim_boundary_selection" | "moment_selection") {
  const f = decisionFixture(), candidate = f.set.candidates[0]!;
  const token = f.tokenArtifacts.find((a) => a.ref.objectId === candidate.token.objectId)!.value as typeof f.token;
  const provenance = { basis: "synthetic_fixture" as const, sourceEvidence: [f.policyRef], labelProtocol: f.policyRef };
  f.body.task = taskRef(task);
  f.body.options = [{ optionId: "option_0", kind: "candidate", candidateId: candidate.candidateId }];
  if (task === "keep_reject") {
    f.body.decisionType = "keep_reject";
    f.body.judgment = present({ kind: "keep_reject", candidateId: candidate.candidateId, label: "keep", ...provenance });
  } else if (task === "trim_boundary_selection") {
    f.body.decisionType = "trim";
    f.body.options = [{ optionId: "option_0", kind: "trim", use: { useId: "use_trim", ...candidate, sourceRange: token.candidate.sourceRange } }];
    f.body.judgment = present({ kind: "trim", candidateId: candidate.candidateId, acceptableRanges: [token.candidate.sourceRange], ...provenance });
  } else if (task === "moment_selection") {
    f.body.decisionType = "select_moment";
    f.body.judgment = present({ kind: "moments", assetId: token.candidate.assetId, sourceHash: token.sourceHash, shotId: token.candidate.shotId, ranges: [token.candidate.sourceRange], candidateIds: [candidate.candidateId], ...provenance });
  } else {
    const rubric = artifact("object_rubric", "UsabilityRubric", { version: "0.1.0", dimension: task, labels: ["usable", "unusable"] });
    f.supplied.push(rubric);
    f.body.decisionType = "assess_usability";
    f.body.judgment = present({ kind: "usability", candidateId: candidate.candidateId, dimension: task, rubric: { artifact: rubric.ref, pointer: "" }, label: "usable", ...provenance });
  }
  return f;
}
for (const task of ["keep_reject", "technical_usability", "aesthetic_usability", "trim_boundary_selection", "moment_selection"] as const) {
  test(`correction B: ${task} accepts matching candidate correspondence`, () => {
    const f = taskBindingFixture(task);
    const decision = validateEditorialDecision(createEditorialDecision(f.body), f.map());
    assert.deepEqual(decision.observed.rejectedCandidateIds, []);
  });
  test(`correction B: ${task} rejects judgment on a different available candidate`, () => {
    const f = taskBindingFixture(task), other = f.set.candidates[1]!;
    assert.ok(f.body.judgment.state === "present"); const judgment = f.body.judgment.value;
    if ("candidateId" in judgment) judgment.candidateId = other.candidateId;
    if (judgment.kind === "moments") judgment.candidateIds = [other.candidateId];
    if (judgment.kind === "trim") judgment.acceptableRanges = [(f.tokenArtifacts.find((a) => a.ref.objectId === other.token.objectId)!.value as typeof f.token).candidate.sourceRange];
    assert.throws(() => validateEditorialDecision(createEditorialDecision(f.body), f.map()), /task candidate|candidate options/);
  });
}
test("correction B: trim options cannot span candidates even without judgment", () => {
  const f = taskBindingFixture("trim_boundary_selection"), other = f.set.candidates[1]!;
  f.body.options.push({ optionId: "option_1", kind: "trim", use: { useId: "use_other", ...other, sourceRange: (f.tokenArtifacts.find((a) => a.ref.objectId === other.token.objectId)!.value as typeof f.token).candidate.sourceRange } });
  f.body.judgment = missing("unavailable", "not_recorded");
  assert.throws(() => validateEditorialDecision(createEditorialDecision(f.body), f.map()), /one task candidate/);
});
test("correction B: empty moment candidate correspondence remains legal", () => {
  const f = taskBindingFixture("moment_selection");
  assert.ok(f.body.judgment.state === "present" && f.body.judgment.value.kind === "moments");
  f.body.judgment.value.candidateIds = [];
  assert.doesNotThrow(() => validateEditorialDecision(createEditorialDecision(f.body), f.map()));
});
test("correction B: every acceptable trim range stays inside the task candidate", () => {
  const f = taskBindingFixture("trim_boundary_selection");
  assert.ok(f.body.judgment.state === "present" && f.body.judgment.value.kind === "trim");
  f.body.judgment.value.acceptableRanges.push({ startSeconds: 0, endSeconds: 4 });
  assert.throws(() => validateEditorialDecision(createEditorialDecision(f.body), f.map()), /extends beyond candidate/);
});

for (const universe of ["explicit_subset", "retained", "all_proposed"] as const) test(`correction A: succeeded declaration over partial run fails (${universe})`, () => {
  const f = decisionFixture("partial"), { candidateSetId: _id, ...body } = f.set;
  assert.throws(() => validateCandidateSet(createEditorialCandidateSet({ ...body, universe }), f.map()), /source run status/);
});
for (const universe of ["retained", "all_proposed"] as const) test(`correction A: incomplete ${universe} snapshot fails`, () => {
  const f = decisionFixture(), { candidateSetId: _id, ...body } = f.set;
  assert.throws(() => validateCandidateSet(createEditorialCandidateSet({ ...body, universe, candidates: body.candidates.slice(0, 1) }), f.map()), /universe/);
});
for (const universe of ["retained", "all_proposed"] as const) test(`correction A: complete ${universe} snapshot passes`, () => {
  const f = decisionFixture(), { candidateSetId: _id, ...body } = f.set;
  assert.doesNotThrow(() => validateCandidateSet(createEditorialCandidateSet({ ...body, universe }), f.map()));
});
test("correction A: explicit subset remains legal without rejection labels", () => {
  const f = decisionFixture(), { candidateSetId: _id, ...body } = f.set;
  assert.doesNotThrow(() => validateCandidateSet(createEditorialCandidateSet({ ...body, candidates: body.candidates.slice(0, 1) }), f.map()));
});
test("correction A: mixed partial/succeeded snapshot requires honest partial status and failure evidence", () => {
  const f = decisionFixture("partial"), { candidateSetId: _id, ...body } = f.set;
  const partial = { ...body, sourceRunStatus: "partial" as const, failureEvidence: [{ artifact: f.token.producingRun.artifact, pointer: "/status" }] };
  assert.doesNotThrow(() => validateCandidateSet(createEditorialCandidateSet(partial), f.map()));
  assert.throws(() => createEditorialCandidateSet({ ...partial, failureEvidence: [] }));
  for (const universe of ["retained", "all_proposed"] as const) assert.throws(() => createEditorialCandidateSet({ ...partial, universe }));
});
test("correction A: partial declaration over succeeded snapshot fails", () => {
  const f = decisionFixture(), { candidateSetId: _id, ...body } = f.set;
  assert.throws(() => validateCandidateSet(createEditorialCandidateSet({ ...body, sourceRunStatus: "partial", failureEvidence: [f.policyRef] }), f.map()), /source run status/);
});

test("candidate ranking validates a total order without plan or slot IDs", () => {
  const f = decisionFixture();
  assert.deepEqual(validateEditorialDecision(f.decision, f.map()), f.decision);
  const json = JSON.stringify(f.decision);
  for (const field of ["planId", "slotId", "revision", "winnerCandidateId"]) assert.equal(json.includes(`"${field}"`), false);
});
test("ranking tie groups preserve ties without manufacturing selections or rejections", () => {
  const f = decisionFixture(); assert.ok(f.body.judgment.state === "present" && f.body.judgment.value.kind === "ranking");
  f.body.judgment.value.tieGroups = [["option_1", "option_0"]];
  const d = validateEditorialDecision(createEditorialDecision(f.body), f.map());
  assert.deepEqual(d.observed.selectedCandidateIds, []); assert.deepEqual(d.observed.rejectedCandidateIds, []);
});
test("partial ranking explicitly carries unjudged options", () => {
  const f = decisionFixture(); assert.ok(f.body.judgment.state === "present" && f.body.judgment.value.kind === "ranking");
  f.body.judgment.value = { ...f.body.judgment.value, tieGroups: [["option_0"]], unjudgedOptionIds: ["option_1"], completeness: "partial" };
  assert.doesNotThrow(() => validateEditorialDecision(createEditorialDecision(f.body), f.map()));
  assert.deepEqual(f.body.observed.rejectedCandidateIds, []);
});
test("ranking abstention leaves every option explicitly unjudged", () => {
  const f = decisionFixture(); assert.ok(f.body.judgment.state === "present" && f.body.judgment.value.kind === "ranking");
  f.body.observed.completion = "abstained";
  f.body.judgment.value = { ...f.body.judgment.value, tieGroups: [], unjudgedOptionIds: ["option_0", "option_1"], completeness: "partial" };
  assert.doesNotThrow(() => validateEditorialDecision(createEditorialDecision(f.body), f.map()));
});
for (const groups of [[["option_0"], ["option_0"]], [["option_0"], ["foreign"]], [["option_0"]], [[]]]) test(`invalid ranking partition ${JSON.stringify(groups)} fails`, () => {
  const f = decisionFixture(); assert.ok(f.body.judgment.state === "present" && f.body.judgment.value.kind === "ranking");
  f.body.judgment.value.tieGroups = groups; assert.throws(() => createEditorialDecision(f.body));
});
test("complete ranking cannot contain unjudged options", () => {
  const f = decisionFixture(); assert.ok(f.body.judgment.state === "present" && f.body.judgment.value.kind === "ranking");
  f.body.judgment.value.tieGroups = [["option_0"]]; f.body.judgment.value.unjudgedOptionIds = ["option_1"];
  assert.throws(() => createEditorialDecision(f.body));
});
test("ranking rejects eligible-set substitution and duplicate candidate options", () => {
  const f = decisionFixture(); f.body.options[1] = { optionId: "option_1", kind: "candidate", candidateId: "foreign_candidate" };
  assert.throws(() => validateEditorialDecision(createEditorialDecision(f.body), f.map()), /eligible/);
  f.body.options[1] = { ...f.body.options[0]!, optionId: "option_1" };
  assert.throws(() => validateEditorialDecision(createEditorialDecision(f.body), f.map()), /fixed eligible/);
});
test("candidate sets reject duplicate IDs and canonicalize set order", () => {
  const f = decisionFixture(), { candidateSetId: _id, ...body } = f.set;
  assert.equal(createEditorialCandidateSet({ ...body, candidates: [...body.candidates].reverse() }).candidateSetId, f.set.candidateSetId);
  assert.throws(() => createEditorialCandidateSet({ ...body, candidates: [body.candidates[0]!, body.candidates[0]!] }));
});
test("cross-project candidate set fails at referenced token join", () => {
  const f = decisionFixture(), { candidateSetId: _id, ...body } = f.set;
  assert.throws(() => validateCandidateSet(createEditorialCandidateSet({ ...body, projectId: "foreign" }), f.map()), /project/);
});
test("candidate set cannot silently substitute another representation", () => {
  const f = decisionFixture(), { candidateSetId: _id, ...body } = f.set;
  assert.throws(() => validateCandidateSet(createEditorialCandidateSet({ ...body, candidates: [{ ...body.candidates[0]!, token: body.candidates[1]!.token }] }), f.map()), /candidate/);
});
test("partial source runs cannot claim whole-project universe", () => {
  const f = decisionFixture(), { candidateSetId: _id, ...body } = f.set;
  assert.throws(() => createEditorialCandidateSet({ ...body, sourceRunStatus: "partial", universe: "all_proposed", failureEvidence: [f.policyRef] }));
});
test("available, presented, inspected, chosen and rejected remain separate", () => {
  const f = decisionFixture();
  f.body.presentation = present({ order: ["option_1", "option_0"], protocol: f.policyRef, seed: missing("not_applicable", "no_randomization") });
  f.body.observed.observations = [{ observationId: "inspection", ordinal: 1, occurredAt: present(TIME), evidenceRefs: [f.policyRef], action: { kind: "inspected", optionId: "option_1" } }];
  const d = validateEditorialDecision(createEditorialDecision(f.body), f.map()), exposure = editorialExposure(d);
  assert.equal(f.set.candidates.length, 2); assert.deepEqual(exposure.presented, ["option_1", "option_0"]);
  assert.equal(exposure.observations.length, 1); assert.deepEqual(exposure.chosenOptionIds, []); assert.deepEqual(exposure.explicitlyRejectedCandidateIds, []);
  f.body.presentation.value.order.reverse(); assert.notEqual(createEditorialDecision(f.body).decisionId, d.decisionId);
});
test("explicit rejection needs evidence and stays disjoint from chosen/selected", () => {
  const f = decisionFixture(), option = f.body.options[0]!; assert.ok(option.kind === "candidate");
  f.body.observed.rejectedCandidateIds = [option.candidateId];
  assert.throws(() => validateEditorialDecision(createEditorialDecision(f.body), f.map()), /explicit/);
  f.body.observed.observations = [{ observationId: "rejection", ordinal: 1, occurredAt: present(TIME), evidenceRefs: [f.policyRef], action: { kind: "rejected", optionId: option.optionId } }];
  assert.doesNotThrow(() => validateEditorialDecision(createEditorialDecision(f.body), f.map()));
  f.body.observed.selectedCandidateIds = [option.candidateId]; assert.throws(() => createEditorialDecision(f.body), /disjoint/);
  f.body.observed.selectedCandidateIds = []; f.body.observed.chosenOptionIds = [option.optionId]; f.body.observed.rejectedOptionIds = [option.optionId]; assert.throws(() => createEditorialDecision(f.body), /disjoint/);
});
test("task input, decision type and judgment kind must agree", () => {
  const f = decisionFixture();
  assert.throws(() => createEditorialDecision({ ...f.body, decisionType: "trim" }));
  assert.throws(() => createEditorialDecision({ ...f.body, task: taskRef("transition_compatibility"), decisionType: "assess_transition" }));
  assert.throws(() => createEditorialDecision({ ...f.body, task: taskRef("reference_style_compatibility"), decisionType: "assess_usability" }));
});
test("pairwise ties express preference without absolute rejection", () => {
  const f = decisionFixture(); assert.ok(f.body.judgment.state === "present"); const j = f.body.judgment.value;
  const d = createEditorialDecision({ ...f.body, task: taskRef("pairwise_preference"), decisionType: "compare", judgment: present({ kind: "pairwise", leftOptionId: "option_0", rightOptionId: "option_1", outcome: "tie", basis: j.basis, sourceEvidence: j.sourceEvidence, labelProtocol: j.labelProtocol }) });
  assert.doesNotThrow(() => validateEditorialDecision(d, f.map())); assert.deepEqual(d.observed.rejectedCandidateIds, []);
});
test("prediction context rejects inline future labels and preserves preceding use order", () => {
  const f = decisionFixture();
  const uses = f.set.candidates.map((c, i) => ({ useId: `use_${i}`, candidateId: c.candidateId, token: c.token, sourceRange: (f.tokenArtifacts.find((a) => a.ref.objectId === c.token.objectId)!.value as typeof f.token).candidate.sourceRange }));
  const body = { artifactType: "EditorialContext" as const, artifactVersion: "0.1.0" as const, stability: "internal_pre_stable" as const, projectId: f.set.projectId, asOf: TIME, precedingUses: uses, previousDecisionRefs: [], brief: missing("not_computed", "no_brief"), timelineSnapshot: missing("not_applicable", "no_plan"), completeness: "complete" as const };
  const context = createEditorialContext(body); assert.doesNotThrow(() => validateEditorialContext(context, f.map()));
  assert.notEqual(context.contextId, createEditorialContext({ ...body, precedingUses: [...uses].reverse() }).contextId);
  assert.equal(EditorialContextSchema.safeParse({ ...context, winner: "option_0" }).success, false);
});
test("future context cannot be supplied to an earlier observation", () => {
  const f = decisionFixture();
  const context = createEditorialContext({ artifactType: "EditorialContext", artifactVersion: "0.1.0", stability: "internal_pre_stable", projectId: f.set.projectId, asOf: "2026-09-22T00:00:00.000Z", precedingUses: [], previousDecisionRefs: [], brief: missing("not_computed", "no_brief"), timelineSnapshot: missing("not_applicable", "no_plan"), completeness: "partial" });
  const stored = artifact("object_context", "EditorialContext", context, "0.1.0"); f.supplied.push(stored);
  f.body.previousContext = present(stored.ref); f.body.observed.observations = [{ observationId: "inspect", ordinal: 1, occurredAt: present(TIME), evidenceRefs: [f.policyRef], action: { kind: "inspected", optionId: "option_0" } }];
  assert.throws(() => validateEditorialDecision(createEditorialDecision(f.body), f.map()), /context follows/);
});
test("observation order and reorder permutations are strict", () => {
  const f = decisionFixture();
  assert.equal(ObservationSchema.safeParse({ observationId: "reorder", ordinal: 1, occurredAt: present(TIME), evidenceRefs: [f.policyRef], action: { kind: "reordered", beforeUseIds: ["a", "b"], afterUseIds: ["a", "c"] } }).success, false);
  f.body.observed.observations = [2, 1].map((ordinal) => ({ observationId: `inspect_${ordinal}`, ordinal, occurredAt: present(TIME), evidenceRefs: [f.policyRef], action: { kind: "inspected", optionId: "option_0" } }));
  assert.throws(() => createEditorialDecision(f.body), /ordinal/);
});
test("timeline linkage refuses exact mappings without explicit real plan and clip data", () => {
  const f = decisionFixture();
  const body = { artifactType: "EditorialTimelineLinkage" as const, artifactVersion: "0.1.0" as const, stability: "internal_pre_stable" as const, projectId: f.set.projectId, finalEdit: f.policyRef.artifact, alignmentProducer: f.adapter, configuration: f.policyRef, mappings: [{ useId: "use_test", candidate: missing("unavailable", "unknown"), assetId: f.token.candidate.assetId, sourceHash: f.token.sourceHash, sourceRange: f.token.candidate.sourceRange, outputRange: { startSeconds: 0, endSeconds: 2 }, planClipId: missing("unavailable", "no_plan"), decision: missing("unavailable", "no_decision"), mappingKind: "exact" as const, evidenceRefs: [f.policyRef] }], unmappedOutput: [], unmappedSource: [], unknownSurvival: missing("unavailable", "no_alignment") };
  assert.throws(() => createEditorialTimelineLinkage(body), /real plan/);
  const estimated = createEditorialTimelineLinkage({ ...body, mappings: body.mappings.map((m) => ({ ...m, mappingKind: "estimated" as const })) });
  assert.ok(EditorialTimelineLinkageSchema.safeParse(estimated).success); assert.doesNotThrow(() => validateTimelineLinkage(estimated, f.map()));
});
test("internal schemas reject unknown versions and extra fields", () => {
  const f = decisionFixture();
  for (const [schema, value] of [[EditorialCandidateSetSchema, f.set], [EditorialDecisionSchema, f.decision]] as const) {
    assert.equal(schema.safeParse({ ...value, artifactVersion: "0.2.0" }).success, false);
    assert.equal(schema.safeParse({ ...value, planId: "invented" }).success, false);
  }
});
test("editorial import closure is pure and cannot reach model/provider execution", async () => {
  const allowed = new Set(["zod", "node:crypto"]), seen = new Set<string>();
  async function inspect(path: string) {
    if (seen.has(path)) return; seen.add(path);
    const text = await readFile(path, "utf8"), source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true);
    const imports: string[] = [];
    function visit(n: ts.Node) {
      if ((ts.isImportDeclaration(n) || ts.isExportDeclaration(n)) && n.moduleSpecifier && ts.isStringLiteral(n.moduleSpecifier)) {
        if (ts.isImportDeclaration(n) && n.importClause?.isTypeOnly) return;
        const spec = n.moduleSpecifier.text;
        if (spec.startsWith(".")) {
          const parts = path.split("/"); parts.pop(); for (const part of spec.replace(/\.js$/, ".ts").split("/")) { if (part === "..") parts.pop(); else if (part !== ".") parts.push(part); }
          imports.push(parts.join("/"));
        } else assert.ok(allowed.has(spec), `${path}: ${spec}`);
      }
      if (path.startsWith("packages/editorial/")) {
        if (ts.isCallExpression(n)) assert.ok(!/^(fetch|eval|require|import)$/.test(n.expression.getText(source)) && !/\.(embed|analyze|transcribe|spawn|exec|readFile|readdir)\s*$/.test(n.expression.getText(source)), n.getText(source));
        if (ts.isPropertyAccessExpression(n)) assert.ok(!["process.env", "Date.now", "Math.random"].includes(n.getText(source)));
        if (ts.isNewExpression(n)) assert.ok(!["Date", "Function", "Worker"].includes(n.expression.getText(source)));
      }
      ts.forEachChild(n, visit);
    }
    visit(source); for (const dependency of imports) await inspect(dependency);
  }
  for (const name of await readdir("packages/editorial")) if (name.endsWith(".ts")) await inspect(`packages/editorial/${name}`);
  assert.ok(seen.size >= 6);
});
test("conflicting source hash in a reidentified token fails", () => {
  const f = decisionFixture(), { tokenId: _id, ...body } = f.token;
  assert.throws(() => createEditorialToken({ ...body, sourceHash: "b".repeat(64) }));
});
