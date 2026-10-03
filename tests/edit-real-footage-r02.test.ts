// Gate 7 Batch 3D R02-B: the runner's private-location rule admits exactly the repository's git-ignored private media and run locations.
// The accepted Phase-2 AuthorizedFootageSet lives at local-media/phase2-real/authorized-footage.json; .gitignore ignores local-media/ as
// well as .local-media/ and .local-runs/. Tracked locations are still refused, and outside the repository the owner's own location rule
// is unchanged.
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { PROJECT_ROOT } from "./support/edit-render-media.js";
import * as R from "./support/edit-real-footage.js";

test("3D-R02B a private manifest may live under local-media/, .local-media/ or .local-runs/, never in a tracked location", async () => {
  const ignored = (await readFile(join(PROJECT_ROOT, ".gitignore"), "utf8")).split(/\r?\n/).map(line => line.trim());
  const outcome = (inside: string) => R.privateLocationRefusal(inside, "The footage manifest")?.code ?? "accepted";
  const cases = {
    // The accepted Phase-2 set, as path.relative() reports it on Windows and on POSIX, and the other git-ignored private locations.
    "local-media\\phase2-real\\authorized-footage.json": "accepted", "local-media/phase2-real/authorized-footage.json": "accepted",
    ".local-media/batch3d/authorized-footage.json": "accepted", ".local-runs/phase5-gate7/run.json": "accepted",
    // Tracked repository locations, including names that only resemble a private location.
    "docs/authorized-footage.json": "private_manifest_not_git_ignored", "tests/run.json": "private_manifest_not_git_ignored", "run.json": "private_manifest_not_git_ignored",
    "local-media-copy/authorized-footage.json": "private_manifest_not_git_ignored", "media/local-media/authorized-footage.json": "private_manifest_not_git_ignored",
    // Outside the repository the owner's own location is used as given.
    "../owner/run.json": "accepted", "..\\owner\\run.json": "accepted", "D:\\owner\\run.json": "accepted",
  };
  assert.deepEqual({ ...Object.fromEntries(Object.keys(cases).map(inside => [inside, outcome(inside)])),
    gitIgnored: [".local-media/", "local-media/", ".local-runs/"].filter(location => ignored.includes(location)) },
  { ...cases, gitIgnored: [".local-media/", "local-media/", ".local-runs/"] });
});

// Gate 7 Batch 3D R02-D: the runner authorizes a revision against the execution of the revision the current head publishes. The first R02
// real-footage run passed the revision-0 DAG for a revision of the published revision 1, and production refused it (impact_input_invalid).
test("3D-R02D a revision proposed after publication authorizes against the published child's DAG, receipt and QC, never revision 0", () => {
  const graph = (revision: number) => ({ editGraphId: `edit_graph_r${revision}`, revision });
  const head = (revision: number) => ({ graph: graph(revision), head: { currentGraph: { artifact: { objectId: `edit_graph_r${revision}` }, revision } } });
  const execution = (revision: number, tag = "") => {
    const g = graph(revision), dagId = `dag_r${revision}${tag}`, renderComputationId = `render_r${revision}${tag}`, receiptId = `receipt_r${revision}${tag}`;
    return { v: { dag: { dagId, graph: g, renderIdentity: { renderComputationId } } }, receipt: { receiptId, renderComputationId, dag: { dagId }, editGraph: g },
      qc: { verdict: "pass", execution: { receiptId, renderComputationId, dagId } } };
  };
  const baseline = execution(0), published = execution(1), other = execution(1, "_other");
  const outcome = (current: ReturnType<typeof head>, parent: ReturnType<typeof execution>) => {
    try {
      const chosen = R.revisionParent(current, parent);
      return chosen.parentDag === parent.v && chosen.prior.receipt === parent.receipt && chosen.prior.qc === parent.qc ? "parent" : "other";
    } catch (error) { return error instanceof R.HarnessRefusal ? error.code : "unexpected"; }
  };
  assert.deepEqual({
    publishedChildAfterPublication: outcome(head(1), published),
    baselineAfterPublication: outcome(head(1), baseline),
    baselineBeforePublication: outcome(head(0), baseline),
    receiptOfAnotherExecution: outcome(head(1), { ...published, receipt: other.receipt }),
    qcOfAnotherReceipt: outcome(head(1), { ...published, qc: other.qc }),
    failedQc: outcome(head(1), { ...published, qc: { ...published.qc, verdict: "fail" } }),
    contextNotTheHeadGraph: outcome({ ...head(1), head: head(0).head }, published),
  }, {
    publishedChildAfterPublication: "parent", baselineAfterPublication: "revision_parent_mismatch", baselineBeforePublication: "parent",
    receiptOfAnotherExecution: "revision_parent_mismatch", qcOfAnotherReceipt: "revision_parent_mismatch", failedQc: "revision_parent_mismatch",
    contextNotTheHeadGraph: "revision_parent_mismatch",
  });
});
