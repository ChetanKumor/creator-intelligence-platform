# Phase 5 Gate 7 Batch 3C — EditorialState and conversational revision

Implementation verification: **PASS** (2026-09-29). Independent owner source review: **PASS**. Owner acceptance: **OWNER-ACCEPTED**.
Architecture V2 stays frozen; Gate 7 overall is not yet complete; Batch 3D is not started. At the implementation-verification checkpoint, nothing was staged, committed or pushed.

## Baseline and reconnaissance

Branch `phase/5-edit-planner-v0`; local HEAD `2686367e5566fea6accb965686c81e975e825eec`. The worktree had no tracked or staged changes.
The 17 untracked owner filenames were recorded without opening or hashing them. No Git mutation is authorized or performed.

Independent live remote verification used the connected GitHub GET endpoint
`repos/ChetanKumor/creator-intelligence-platform/git/ref/heads/phase/5-edit-planner-v0`:
its object SHA was exactly the required baseline. The local origin-tracking ref also matched. Ordinary Git access failed first (sandbox connection
failure, then GitHub "Repository not found"); the CLI account reported invalid authentication. These failures are not reclassified as successful Git access.

The accepted 3B record and CURRENT_PHASE establish owner acceptance, including OR1 and the owner-run 1016/1016 safe suite. Those are historical results,
not fresh 3C verification. 3A-F supplies the exact time vocabulary. The authoritative implementation sites are:

- `edit-graph/revision.ts`: GraphDiff 0.1.0 accepts only RepairPlan origin; EditGraph 0.3.0 explicitly requires GraphDiff 0.1.0 and parent 0.2.0/0.3.0.
- `edit-repair/revision.ts`: plan-to-diff compilation and complete OR1 repair lineage replay.
- `edit-repair/impact.ts`: dependency-derived clip changes, placement changes, changed region and segment computation decisions.
- `edit-runtime/ports.ts`, `scripts/edit-runtime-local.ts`: trusted root, synced bytes, exclusive hard-link publication and immutable ownership handles.
- `scripts/edit-render-local.ts`: executable permit is the last repair-authorization gate. Rendering produces immutable content-addressed bytes before separate QC.
- `editorial/common.ts`: strict exact-byte ArtifactRef, semantic identity and supplied-artifact replay. These records are not signatures.

## Bounded design

`packages/edit-editorial/` is pure. EditorialState stores intent and constraints only: scope, state revision, current graph reference, parent state,
typed transition reference, HARD_EXACT locks and current effective grounded preferences. It contains no composition, render command, execution receipt,
media, model vectors or conversation history. EditGraph remains the sole timeline authority.

State mutations are exactly add hard lock, remove hard lock, set preference and clear preference, one operation per diff. Parents and revisions compare
exactly. Replay reconstructs the child. Duplicate locks refuse. Clearing/removing an absent entry refuses. Like/reject replaces only the explicitly
named exact target's effective value. Neither preference constrains mutation.

The V0 target union has one typed member, `clip_region`, with exact graph/ref/revision, clip-use ID, tick interval and declared clock. Preferences can
select valid subregions. HARD_EXACT supports the entire selected clip only; partial locks refuse rather than implying unsupported semantics. This
discriminated target boundary can be versioned for future capabilities without adding speculative motion/audio schemas now.

Locks bind creation provenance and a digest of source selection, placement, duration, mapping, framing, linked audio and every touching operation's
parameters/extent. Cut boundary semantics do not duplicate the neighbour's source authority. Rebase follows the existing planning-use correspondence,
requires exactly one child target and identical protected semantics, and retains the original lock ID/provenance. Dependency impact also must show the
locked clip unchanged and its segment computation reusable. Uncertainty refuses; final-container identity alone does not invalidate an unrelated lock.

Preferences retain their exact historical targets through graph revisions. Setting a historical preference must resolve a real ancestor through the
actual parent chain in the same scope. It never restores or copies an ancestor timeline. No taste ranking, weights or learning are implemented.

## Requests, intents and planning

EditorialRequest binds head, graph, state, scope, bounded raw text, at most one explicit selected target, one referenced revision and an explicit allowed
revision scope. Raw text is provenance; no operation reads it as commands or executable authority. EditorialInterpreterPort returns one strict typed
action. Acceptance uses prescribed deterministic fixtures, not regex parsing or a model. Manual typed actions enter the same intent validation boundary.

Intents are lock, unlock, set/clear preference, request the existing exact source-range trim, or structured unsupported/ambiguous/compound abstention.
The planner is mechanical: it receives current state (including preferences), validates the exact intent and binds an immutable EditorialRevisionPlan
to request, intent, policy, graph, state, head, allowed scope and implementation identity. It invents no preference weights.

Limits: 4,096 text characters; one interpreted action, state operation or graph operation; one selected target/referenced revision; 16,384 response bytes;
64 state entries per kind; 128 head/state transitions; 1,024 explicitly supplied control artifacts; 262,144 canonical text code units per constructed
control record and 262,144 UTF-8 bytes per persisted head slot. Runtime execution
continues to enforce its own accepted artifact bound. Time uses canonical exact instants and the existing frame/sample rules; no float trim authority.

## Version ruling

| Artifact | Ruling |
|---|---|
| GraphDiff 0.1.0 | Preserved strict repair-only reader and semantics. |
| GraphDiff 0.2.0 | New explicit union of repair and editorial-plan origins; same registered trim primitive. |
| EditGraph root 0.2.0 | Unchanged. |
| EditGraph revision 0.3.0 | Preserved strict 3B reader and GraphDiff 0.1.0 binding. |
| EditGraph revision 0.4.0 | New reader for GraphDiff 0.2.0 and supported 0.2.0/0.3.0/0.4.0 parents. |
| New control records | Internal pre-stable 0.1.0; independent content identities. |
| RepairPlan/RepairPolicy | Unchanged critic-specific meaning. No user request fabricates critic provenance. |
| DAG, RenderProgram, execution/QC/review records | Existing exact ArtifactRef/revision fields already represent the new graph reference. Readers dispatch to the graph's explicit version. No record-meaning or render-semantics change. |

## Current authority, CAS and publication

`scripts/edit-editorial-local.ts` owns one current head per selected scope under the configured runtime's `editing-control` directory. Configuration is a
trusted composition boundary, not a request field. Separate runtime roots are separate authority domains, as in accepted Batch 2A; this is not a
distributed or multi-user authority service.

Artifact files are verified by exact digest. A transition slot is published only by linking complete synced pending bytes to the next exclusive slot.
Each slot names the previous exact head. The highest contiguous valid slot is current. An alternative self-identified head/state record has no slot
authority. Initialization cannot replace an existing head. No raw head/state setter, rollback, merge, history browsing or undo service exists.

Initialization accepts only a validated revision-zero graph. An unrendered child cannot be made current by creating a fresh initial head. The pure
state/head constructors can describe historical records but confer no store authority. Importing an existing repaired project into this new authority
domain would need a separately specified bootstrap protocol; it is not silently accepted by this batch.

State-only actions load current state internally, validate the request and publish a state-only CAS with the same graph. They do not compile a
RenderProgram or invoke media. Graph proposals remain non-authoritative. Both revision origins validate complete lineage, exact current head/state,
rebased locks and dependency-derived scope before receiving a live nonserializable execution authorization. The repair branch preserves OR1 replay
of each RepairPlan's actual parent-render/finding/QC/policy bindings. Historical 3B execution remains available under its historical rules.

Graph-edit publication occurs after the existing segmented renderer and independent Technical QC succeed. The adapter itself obtains these results;
callers cannot submit success JSON to publish a head. Graph and rebased state enter one CAS. Failed render, QC, rebase or CAS leaves the accepted pair
unchanged. A CAS loser may have produced non-authoritative output bytes. State-only changes can invalidate an in-flight render's request just as graph
changes can. No automatic rebase or broader-scope confirmation flow exists.

Graph validity proves deterministic composition replay. Revision authorization additionally proves the appropriate origin chain. Current-project
authority additionally requires the configured store's current pair, lock/scope checks, successful execution/QC for edits, and winning CAS.

## Verification chronology (append-only)

1. `batch3c-first-red-build.log`: build passed with unchanged 3B production code.
2. `batch3c-first-red.log`: J01 failed on unsupported GraphDiff 0.2.0/editorial origin, not an import/setup failure.
3. Initial implementation typecheck found three TypeScript errors; corrected. Later media-helper typecheck required an explicit string-array annotation.
4. `batch3c-first-implementation.log`: initial five focused tests passed, including durable reopening and exactly one concurrent CAS winner.
5. `batch3c-media-initial.log`: fixture setup refused duplicate byte-identical source assets at different paths. Corrected B to a distinct generated pattern.
6. `batch3c-media-second.log`: real child render/QC completed, then a test used the wrong spelling of the existing reuse disposition. Corrected the assertion.
7. Expanded acceptance, hostile review and final regressions are pending; no final PASS is recorded yet.

8. `batch3c-acceptance-pure.log`: 27/27 PASS. `batch3c-acceptance-media.log`: 4/4 PASS, including the five-turn actual scenario and render/QC/CAS failures.
9. `batch3c-hostile-red.log`: 6/9 PASS, three real defects reproduced on a successful build. HR1 replaced the interpreter producer/callable while the local
   service awaited current state; HR2 initialized an unrendered child as a new root head; HR3 leaked a generic serialization error for a BigInt response.
10. Minimal repairs: snapshot producer/callable before the service's first await; require revision zero for initialization; normalize provider/response
    errors to structured control refusals. `batch3c-hostile-green.log`: 9/9 PASS. The red log remains unchanged.
11. `batch3c-expanded-pure.log`: 38/38 PASS after adding look/extents/audio checks, response budgets, state-only artifact assertions and mixed
    repair/editorial ancestry. All have zero fail/cancelled/skipped/todo.
12. `batch3c-pin-updates.json`: 15 SHA literal updates in four accepted tests, solely for authorized changed paths and their chained test pins. No
    assertion was removed. The audit adapter-count literal changes from 15 to 16 because the new filesystem adapter is explicitly registered as
    `process: none`; the subprocess-capable adapter set is unchanged.
13. The first final-runner invocation failed before any test because Windows PowerShell decoded a Unicode regex literal incorrectly. The runner now
    uses an ASCII Unicode escape. This is harness setup evidence, not a product RED. The regression matrix is running sequentially under the network
    guard, avoiding the historical parallel-suite memory pressure. Earlier media receipts were copied to `batch3c-pre-regression-test-artifacts/`.
14. The additional media-comparison helper initially compared complete observation media bindings, which correctly differ on new DAG/program/receipt
    and QC identities. Source inspection confirmed `RenderComputationIdentity` binds the exact admission and execution grant; it is not a cross-attempt
    pixel identity. `batch3c-final-media-comparison.log` preserves the failed helper assertion. The corrected comparison checks the intended media hashes
    and observation computation identities, excluding fresh execution bindings; it changes no product code or accepted test expectation.

## Hostile review matrix

The named cases below are in the `tests/edit-editorial*.test.ts` files unless prefixed M (actual media integration). A shared test can exercise several
distinct attacks; the table records each requested attack explicitly.

| Attack | Evidence / ruling |
|---|---|
| C1 alternate unlocked state | HC1: a valid explicitly unlocked alternate state cannot pass the stored head's exact refs. |
| C2 alternate valid head | HC1, E01 and HR2: an unpersisted head has no authority; initialization is exclusive and root-only. HR2 RED then GREEN. |
| C3 stale after graph change | M01 turn 5 and P02 baseGraph. |
| C4 stale after state-only change | E01 and HC1; graph equality does not rescue stale head/state refs. |
| C5 model unlock plus edit | G03: one strict dominant action; no compound action and no state mutation in graph plans. |
| C6 critic bypass | K01: valid accepted RepairPlan/GraphDiff refuses against the stored lock. |
| C7 GraphDiff deletes lock | HC3: unregistered graph operation refuses. |
| C8 graph duplicates locks | HC4: strict EditGraph replay refuses extra lock fields. |
| C9 state duplicates timeline | A02/A03, HC4: strict schema refuses composition/execution payloads. |
| C10 source change hidden by ID | C03/C04: exact source semantics and dependency impact, not just clip ID. |
| C11 placement shift | C03 locks B then trims upstream A; refusal despite reusable segment computation. |
| C12 changed render semantics | C04 checks look intensity, operation extent, linked audio, profile and cut boundary. |
| C13 dropped lock during rebase | HC2 reidentifies a dropped-lock state; replay refuses. |
| C14 wrong rebase target | HC2 reidentifies a retargeted lock; replay refuses. |
| C15 preference blocks mutation | D02: both preference values permit their own target to be trimmed. |
| C16 rejected becomes prohibition | D02 rejected. |
| C17 liked becomes immutable | D02 liked. |
| C18 foreign branch history | D03 sibling revision refuses; graph ancestry is traversed, not asserted. |
| C19 nonexistent historical range | D03 invalid range/fabricated ref refuses. |
| C20 prose becomes GraphDiff | HC3; plans consume the typed intent, not raw text. |
| C21 arbitrary interpreter JSON | G03/HR3: strict action union; malformed non-JSON becomes structured refusal. HR3 RED then GREEN. |
| C22 await-time mutation | G01 and HR1: request/context/producer/callable captured before await; accepted response parsed into owned data. HR1 RED then GREEN. |
| C23 widened planner scope | H01/G03: immutable plan replays against the request's exact allowed scope; an extra scope field is refused. |
| C24 impact outside scope | L01: A-only trim shifts B and is refused without any lock. |
| C25 fake repair origin | HC3 and accepted 3B OR1: graph replay alone cannot mint execution authorization. |
| C26 skipped editorial plan | I01/HC3/HR2: exact plan/request resolution and replay mandatory; bootstrap bypass repaired. |
| C27 weakened OR1 | HC7 keeps all repair evidence mandatory in mixed ancestry; K01 combines that valid lineage with lock refusal. |
| C28 historical repair invalid | Fresh 3B regression required below; HC7 also validates a legacy repair step. |
| C29 silently reinterpreted records | J01/J02 and strict legacy readers: explicit 0.2.0 diff / 0.4.0 child; old schemas reject new records. |
| C30 state-only FFmpeg | N01 and M01: actual spawn observer sees zero; no new RenderProgram, receipt or output. |
| C31 failed lock advances head | M01 turn 3 and K01: exact stored head remains unchanged. |
| C32 partial graph failure advances state | M02 render/QC failures retain the old coherent graph/state pair. |
| C33 graph with old state | HC4 plus E01, M01: graph/state refs and deterministic rebase required in one transition. |
| C34 two winners | E01: exactly one concurrent state CAS succeeds; M02-cas: graph publication loses to a state-only transition. |
| C35 repeated state diff | B01/B03: exact parent/revision rejects applying the same diff to its child. |
| C36 float authority | HC5/G03: floats, off-clock endpoints and non-frame endpoints refuse; M01 uses exact 1/2 second. |
| C37 only-this-section spill | L01 and M01: dependency-derived exact changed interval must fit structured scope; prose cannot widen it. |
| C38 unsupported becomes trim | G02: three unsupported creative requests abstain and cannot produce a plan. |
| C39 executable payload | F01/H01/HC6: raw executable-looking text remains provenance; command/path/code fields never enter typed authority. |
| C40 future architecture blocked | HC6 plus schema review: one versioned `clip_region` discriminator now; unknown future targets fail closed and need explicit schema evolution. |

No real model, natural-language competence, preference learning or professional editing quality is inferred from these deterministic fixtures.

Local logs live under `.local-runs/phase5-gate7/`. The actual scenario records exact identities and measured work under
`.test-artifacts/phase5-gate7-batch3c/`, with final identity evidence archived separately. All media are authorized generated test patterns. No real footage,
frontier provider, paid inference, preference learning or professional-editing-quality evidence is claimed.

## Actual synthetic scenario and retained evidence

The final 3C media suite passed 4/4; pure tests passed 38/38. M01 uses two generated, no-audio 4-second sources, A as a test pattern and B as a blue
frame. The graph initially selects A [0,2) and B [1,3), yielding four seconds at 30 fps, 180x320, with a 1,000,000,000-tick clock. The typed half-second
trim keeps B [1,5/2); output becomes 3.5 seconds. Scope is exactly the removed output tail [3.5,4), associated with B. No speech or transcript is required.

| Turn | Accepted transition / refusal |
|---|---|
| 1 lock A | H0(G0,S0) -> H1(G0,S1), zero process calls, same output inventory. |
| 2 trim B by exact 1/2 s | Proposed G1/S2, complete authorization, actual render and independent QC, then H2(G1,S2). Lock A survives. |
| 3 trim A | hard_lock_conflict; H2 unchanged, zero additional processes. |
| 4 like G0 intro | Exact historical G0 target, S3 and H3(G1,S3); no restoration or render. |
| 5 retry H1 request | stale_editing_head; H3 unchanged, zero additional processes. |

The child receipt records A as reused_verified_prior_artifact and B as computed_by_this_execution. The independent spawn observer recorded exactly
two rendering FFmpeg processes: B's stage plus assembly. Both outputs pass QC. Six new bounded observations are decoded from the child output through
the accepted 3A observation adapter. No taste/semantic quality conclusion is inferred.

Retained test root: `C:/Users/KOUSHIK VARDHON/creator-intelligence-platform/.test-artifacts/b3c-media-EOW7Pr`.
Its generated `a.mov`/`b.mov`, staged inputs, segment bytes, output bytes, runtime receipts and current-head store remain available for owner review.
The authoritative current head was independently reopened and replayed by `batch3c-report.mjs`: four immutable slots, head revisions [0,1,2,3], state
revisions [0,1,2,3], graph revisions [0,0,1,1]. Each slot names its exact predecessor; current is H3/G1/S3 with the original lock ID retained.

Evidence:
- `.test-artifacts/phase5-gate7-batch3c/scenario.json`: native records, exact refs, observations, dependency impact, actual render spawn arguments and measured work.
- `.local-runs/phase5-gate7/batch3c-final-identities.json`: exact IDs and SHA-256 ArtifactRefs, output hashes and current-head evidence.
- `batch3c-final-identity-check2.log`: independent reopening and output-byte verification. The initial report helper had an incorrect relative import;
  `batch3c-final-identity-check.log` preserves that setup failure; no product/test result is reclassified.
- `batch3c-final-3c-pure.log`, `batch3c-final-3c-media.log`: zero fail/cancelled/skipped/todo.
- `batch3c-first-green-evidence/scenario.json`: earlier first-green scenario, preserved separately.

### Exact identities

| Record | Native identity |
|---|---|
| Initial graph G0 | `edit_graph_v0_d2e4f0c641a25763b285d33a9722446994a01360bc2bdf0b19ad76b06fd3f759` |
| Initial EditorialState S0 | `editorial_state_v0_55d89c62ef466e4b36987c99a860f9a08d24729c5bc6ae088f7121916e485d03` |
| Initial EditingHead H0 | `editing_head_v0_b8e069ebe228a0ed7ee12a7b65c7a773eb2d089668e81894a7747b97b868c6b4` |
| Locked state S1 | `editorial_state_v0_0bff62def87408f852ff847c22130c594d72e05c84f8412c435f0b5cd1d62b60` |
| Head H1 | `editing_head_v0_4d69e7988acc35dae54d5ec062688435887dcfe1152cde17180f4b7c950c89b8` |
| User revision request | `editorial_request_v0_d0518ef646730551c08832762e8b4fe71c56b64ae47e553d581e772602cc34a1` |
| EditorialIntent | `editorial_intent_v0_be80afc423ef1c39a16a16b0f60b7b5efc70ee54c10587d07d12cb0aef409454` |
| EditorialRevisionPlan | `editorial_revision_plan_v0_1c950ec6d18be0c88509969254371dcd28794187584bdabae880549d589db83c` |
| GraphDiff | `graph_diff_v0_dd68f1b3defb962acc76dffbf586a20ab514cb48bcf1af14bd95efd8f5169169` |
| Child graph G1 | `edit_graph_v0_371cf86629d0d87621581258732dc3537e2bec34c765f60007cc09026b793e75` |
| Rebased state S2 | `editorial_state_v0_7f8509a29e00d120078f66445aa1d222fdaea16fbb269dbe2bb02b346cf4789e` |
| Head H2 | `editing_head_v0_948f36228d025f234e82818856be3c61b5d5f0453e255cdadda0dceaa74c45f3` |
| Historical preference state S3 | `editorial_state_v0_e45eff2c8f7d07a135e5fe5c6079c1eb8c09822d406a539c14d651eaa145aa4b` |
| Head H3 | `editing_head_v0_94d080775f608e361949170f19f3f248e8ab5b95ebf50afe6ccfe9b9c14b88d9` |
| Parent RenderProgram | `render_program_v0_55f4ada50f941bd6fbdd74c8033bdf18a21b59a407539211f8e5d321e067004c` |
| Child RenderProgram | `render_program_v0_3b947a6caf79e4ae3c0b868b6b572b92e34b73ce4beec8985700e644f996d026` |
| Parent QC (PASS) | `technical_media_qc_receipt_v0_7d939338eb45adc0e1f31fdbe0adba68c2119bdd785390d52867d5050328c1dd` |
| Child QC (PASS) | `technical_media_qc_receipt_v0_72661cd8e1ca1fdb54e89efcb86d5c97c314f6707641fa9c190542392b07658c` |
| Changed segment, parent | `render_segment_computation_v0_da8f533a74af33e7e4f7546f23cb4ba61c3b9b3bc98795053b42f1de652f7b1d` |
| Changed segment, child | `render_segment_computation_v0_b24289d98e573ac504a96f5b7ffc0dd59bf3acf05e697c13053f3edd7bbd6884` |
| Preserved locked segment, both | `render_segment_computation_v0_9196856417c61a8ce526a85d6d3fc6821f5fb818bcc11c89dd2ba3ac4c3bf107` |
| Parent output SHA-256 | `e1f2cad282a8ce5a9092241bbe71e70a86489edc09d1af18111ca76218e13f7d` |
| Child output SHA-256 | `da23615aa43eec3e1f63ae9e1406ac4e6606c1fd4c09f8c2aff7c827253f9998` |

### Measured work

Single synthetic run on this workstation; milliseconds below are observations, not latency targets or performance-improvement claims.

| Boundary | Measured ms / work |
|---|---:|
| State-only lock application (including initial output-directory inventory; excludes interpretation) | 2337.3678 |
| Fixture body time, four calls combined | 0.0760 |
| Revision proposal, including current replay, plan, GraphDiff, child and state derivation | 3766.0590 |
| Lock/scope/current-head authorization, including lineage replay and program compilation | 7724.7518 |
| Whole child execution/publication call | 6685.3840 |
| Segmented render wall time | 541.8446 |
| Independent QC | 387.9774 |
| Head transition, including replay and durable publication | 3225.2905 |
| Rendering FFmpeg processes | 2 |
| Segments actually reused / recomputed | 1 / 1 |

Validation boundaries are measured inclusively; the report does not claim to isolate lock fingerprint CPU time or natural-language interpretation
cost. Source generation, runtime/input probes and output observations are outside the count of two rendering processes.

## Required authority ruling

1. **Current EditorialState** is the exact state reference in the highest contiguous accepted head slot under the configured scope/root. It replays from
   supplied exact artifact bytes and governs exactly that head's graph. Content identity alone does not make it current.
2. **Alternate unlocked state** cannot be selected by a revision caller: the local adapter loads state itself, and requests/plans must match head,
   graph and state refs. HC1 supplies a valid alternate unlocked state/head and is refused.
3. **Current EditingHead** is determined by the configured authority store and immutable predecessor-linked slots, never by a caller's valid JSON.
   E01 rejects reinitialization; HR2 rejects child-graph bootstrap; a fresh root is a separate trusted configuration domain, not a request option.
4. **CAS** compares the exact previous head and exclusively publishes the next slot. E01 proves exactly one concurrent winner. A loser cannot retry
   against a newer head silently; M02-cas proves a completed render loses publication to a state-only advance.
5. **Locks on both origins**: rebase compares protected semantics; accepted dependency impact also must prove no protected content, placement or
   segment-computation change. The editorial path and valid critic RepairPlan path share this current-authority gate (C03/K01/M01).
6. **Graph validity** is deterministic parent/diff replay. **Revision authorization** additionally validates the correct origin chain (including OR1's
   full repair evidence). **Current project authority** additionally requires current head/state, locks, allowed scope, execution/QC and winning CAS.
7. **State-only changes** use typed state diffs and the same CAS, with an unchanged graph. N01 checks lock/preference/unlock/clear with zero native
   spawns and no new render artifact. M01 also checks the output directory.
8. **Failed render/QC** cannot publish: only the local adapter's actual successful execution and independently passing QC reach graph/state CAS.
   M02-render and M02-qc leave the old head; invalid rebase and scope fail earlier. A CAS-losing output is non-authoritative.

## Bounded limitations and future seams

- Single trusted local runtime-root authority; no distributed writers, arbitrary store-root selection by requests, OS-administrator tamper protection,
  signatures, power-loss directory-fsync guarantee, branch service, merge or undo. Exclusive file publication follows the accepted local runtime pattern.
- Initialization supports revision-zero graphs only. Historical 3B records still replay and execute historically; no lock-aware provenance is added to them.
- One intent and one trim operation per editorial turn. HARD_EXACT supports whole current video clips and their existing linked/render semantics;
  uncertain/global-operation effects refuse conservatively. Preferences may describe exact subregions and valid ancestors.
- Selected targets/revisions and allowed scope are supplied explicitly. The interpreter port has deterministic fixtures only; no product language
  parser or real model. Manual typed actions need no interpreter.
- The planner receives preferences through the exact current state but invents no taste weights or learning. A historical like does not restore a version.
- Existing typed operations, exact frame/sample semantics, runtime authority, FFmpeg execution, QC and observation stay separate. Future operations,
  targets and providers require explicit schema/validation evolution; no motion, AudioGraph, preview or manual editor is implemented.

## Final verification closure — 2026-09-29

This closure supersedes the earlier pending checkpoints without deleting their chronology. Production and test bytes were frozen before the final
matrix and remained identical throughout all 236 checked source files. The full safe suite is **1054/1054 PASS**: the accepted 1016 plus 38 new pure
3C cases. Actual-media integrations are separate from that count. Every test gate below has zero fail, cancelled, skipped and todo.

`batch3c-final-gates.json` records exact commands, start/end timestamps, exit codes and counts. Each row has the corresponding
`batch3c-final-<gate>.log`. Test commands use `node --import ./scripts/no-network.mjs --test --test-concurrency=1`; the exact file lists are in the
gate receipt and `batch3c-final-runner.ps1`. No model/network access is needed by core or acceptance tests.

| Gate | Named suite / command | PASS | Seconds |
|---|---|---:|---:|
| typecheck | `npm run typecheck` | exit 0 | 7.790 |
| build | `npm run build` | exit 0 | 9.166 |
| 3c-pure | `edit-editorial`, `edit-editorial-contracts`, `edit-editorial-head`, `edit-editorial-hostile` | 38/38 | 156.253 |
| 3c-media | `edit-editorial-media.integration` | 4/4 | 146.831 |
| 3b-pure | `edit-repair` | 49/49 | 170.983 |
| 3b-media | `edit-repair-media.integration`, including OR1/M04 | 4/4 | 100.580 |
| 3af | `edit-time` | 35/35 | 39.710 |
| 3a-pure | `edit-review` | 46/46 | 109.739 |
| 3a-media | `edit-review-media.integration` | 8/8 | 53.211 |
| 2b-pure | `edit-render` | 43/43 | 20.964 |
| 2b-media | `edit-render-media.integration` | 34/34 | 143.302 |
| audit-policy | `edit-render-audit`, `workspace-boundary` | 10/10 | 38.945 |
| 2a | `edit-runtime` | 130/130 | 75.832 |
| batch1 | `edit-execution` | 81/81 | 392.989 |
| gate6 | `edit-graph` | 79/79 | 84.034 |
| gate5 | `planning` | 97/97 | 103.592 |
| routing | `budgeted-perception-routing` | 33/33 | 0.637 |
| compatibility | 16 accepted suites listed in gate receipt | 377/377 | 17.176 |
| legacy-seams | `contracts`, `integration`, `jobs`, `telemetry` | 39/39 | 0.979 |
| full-safe | `dist/tests/*.test.js` | 1054/1054 | 1158.246 |
| workspace-audit | `npm run audit:workspace` | exit 0 | 1.060 |
| diff-check | `git diff --check` | exit 0, no output | 0.735 |

Additional evidence, appended to the chronology:

15. All final gates passed. The runner's optional test-count parser reported six null-input errors when parsing the correctly empty `git diff --check`
    log. The command itself exited zero. No test gate lacked its count. The final documentation audit reruns the diff check directly, without that parser.
16. `batch3c-final-media-comparison2.log` preserves a second helper setup error: the cuts/montage receipts do not expose the speech receipt's observations
    array. The bounded corrected helper compares only fields actually present. `batch3c-final-media-comparison3.log` is PASS for five comparisons:
    Batch-2B canonical bytes, its determinism pair, six looks; seven Batch-3A speech-observation computation identities and sampled media hashes;
    Batch-3B parent/child output hashes. Cuts and montage remain covered by the complete 8/8 fresh media suite, not this extra hash comparison.
17. `batch3c-final-origin.json` independently rechecks the live remote branch after all regressions; its SHA still equals the baseline.
18. `batch3c-pre-documentation-preservation.json` passes: 324 tracked files checked, 309 unchanged before the CURRENT_PHASE update, only 15 authorized
    tracked paths modified, all 236 frozen source files unchanged, empty index and no unexpected untracked files. The final preservation audit includes
    CURRENT_PHASE: 308/324 tracked files unchanged, 16 authorized modifications, 14 added files. Owner files are compared by filename only.

## Owner-review manifest

### Files added (14)

- `packages/edit-editorial/common.ts`: strict identity, bounds and refusal helpers.
- `packages/edit-editorial/index.ts`: pure package exports.
- `packages/edit-editorial/state.ts`: targets, protected semantics, state/diffs, replay and rebase.
- `packages/edit-editorial/request.ts`: head/request/intent/policy contracts and provider-neutral interpreter port.
- `packages/edit-editorial/plan.ts`: bounded plan, GraphDiff compilation, origin dispatch and dependency-derived scope/lock validation.
- `scripts/edit-editorial-local.ts`: authoritative local head store, opaque execution authorization and render/QC-before-CAS orchestration.
- `tests/edit-editorial.test.ts`.
- `tests/edit-editorial-contracts.test.ts`.
- `tests/edit-editorial-head.test.ts`.
- `tests/edit-editorial-hostile.test.ts`.
- `tests/edit-editorial-media.integration.ts`.
- `tests/support/edit-editorial.ts`.
- `tests/support/edit-editorial-media.ts`.
- `docs/phases/phase-5-gate-7-batch-3c-editorial-state-conversational-revision.md` (this record).

### Files modified / protected accepted files modified (16)

Every modified source/test path below is accepted baseline material. The changes are limited to the explicit 3C authorization; no invariant outside
that authorization was changed. Earlier phase records, public `packages/contracts/`, dependency manifests and lockfiles are byte-identical.

| File | Bounded reason |
|---|---|
| `packages/edit-execution/admission.ts` | Read the graph's actual explicit revision version. |
| `packages/edit-execution/dag.ts` | Same explicit graph-version dispatch. |
| `packages/edit-graph/index.ts` | Export evolved diff/revision schemas. |
| `packages/edit-graph/revision.ts` | New strict diff 0.2.0 and graph 0.4.0; preserve old readers and trim semantics. |
| `packages/edit-render/records.ts` | Bind validated actual graph version. |
| `packages/edit-repair/impact.ts` | Accept versioned diff/graph inputs without weakening derived impact. |
| `packages/edit-repair/revision.ts` | Repair-only origin validation and repair after a new-version parent; preserve OR1. |
| `scripts/audit-workspace.mjs` | Register one new filesystem adapter with no process capability. |
| `scripts/edit-render-local.ts` | Accept opaque live 3C authority; historical repair execution still requires OR1. |
| `tests/edit-execution.test.ts` | Authorized source hash-pin updates only. |
| `tests/edit-render-audit.test.ts` | Explicit adapter count 15 -> 16. |
| `tests/edit-render.test.ts` | Authorized source/test hash-pin updates only. |
| `tests/edit-review.test.ts` | Authorized source/test hash-pin updates only. |
| `tests/edit-runtime.test.ts` | Authorized source/test hash-pin updates only. |
| `tests/support/edit-render-media.ts` | Independent native-spawn observation for actual no-render/render accounting. |
| `docs/CURRENT_PHASE.md` | Current 3C verification PASS / owner OWNER-ACCEPTED; retain historical closures. |

### Contracts, capabilities and evidence

- **Public contracts added:** none in the frozen public contract package. **Internal contracts added:** EditorialState, EditorialStateDiff, EditingHead,
  EditorialRequest, EditorialIntent, EditorialPolicy, EditorialRevisionPlan, their strict grounded targets/scopes and EditorialInterpreterPort.
- **Schema versions changed:** added GraphDiff 0.2.0 and EditGraph revision 0.4.0 readers; all new editorial records are internal 0.1.0.
  Old GraphDiff 0.1.0, root EditGraph 0.2.0 and revision 0.3.0 remain historically valid under their original strict readers.
- **EditorialState operations:** `add_hard_lock`, `remove_hard_lock`, `set_preference`, `clear_preference`.
- **Graph operations:** existing `trim_clip_source_range` only; zero new physical edit primitives.
- **Editing head:** per configured root/scope, immutable linked slots and exclusive CAS publication; graph changes publish only after actual render/QC.
- **Process-capable adapters:** none added. Existing `edit-render-local.ts` changes authorization only; its existing process capability remains.
  New `edit-editorial-local.ts` is registered `process: none`. The workspace audit checks 127 application files, 16 adapters and the unchanged nine
  subprocess-capable adapters. The test spawn observer is test infrastructure.
- **New dependencies:** NONE. **Lockfile changes:** NONE. **Owner files touched:** NONE (17 existing filenames only; no owner content read or hash).
- **Tests:** five new test files plus two support files above; 38 pure and four actual-media cases. All required earlier suites rerun as listed.
- **Synthetic media:** two authorized generated no-speech sources, retained parent/child outputs, segments, QC and six new output observations.
- **Evidence/receipts:** first meaningful RED, implementation GREEN, three real hostile RED/GREEN repairs, final gates, exact identities, current-head
  replay, output hashes, protected bytes, native process counts and measured work under `.local-runs/phase5-gate7/batch3c-*` and the retained test root.
- **Documentation:** this bounded implementation record and CURRENT_PHASE only. Historical verification records remain unchanged.
- **Final Git status / diff stat:** captured verbatim in `batch3c-final-preservation.json`; branch and HEAD unchanged, index empty. Git's tracked diff
  stat excludes the 14 untracked new files, whose individual line counts and SHA-256 hashes are included separately in that receipt.

### Owner acceptance closure — 2026-09-29

The independent owner source review is **PASS** and the owner has accepted Batch 3C. Implementation verification remains **PASS**; the full safe suite is **1054/1054 PASS**. Earlier pending and review-readiness statements in the verification chronology describe their original checkpoints.

Architecture V2 is **FROZEN**. Gate 7 Batches 3A, 3A-F, 3B and 3C are **OWNER-ACCEPTED**. Gate 7 and Vibe Editing are **NOT YET COMPLETE**. Batch 3D is **NOT STARTED**; real-footage Gate 7 closure is **NOT YET RUN**. No later work is authorized by this closure.
