# Synthetic fixtures

All fixture metadata is authored in `fixtures.ts`. No source video/audio/image file exists, and none was downloaded. Object IDs and people/scene descriptions are synthetic. The Telugu caption is authored sample text. Null quality/embedding values mean unmeasured/unavailable.

`fixtures/` contains generated readable JSON for one reference fingerprint, five segments (including multiple segments from the same asset), one audio fingerprint, one four-clip edit plan, five media catalog entries, four decision events, and one frozen synthetic benchmark. Run `npm run schemas:generate` to refresh generated snapshots and `npm run schemas:check` to detect drift. Released benchmark/schema versions must not be silently overwritten.

`pipeline.ts` is a fixed fixture-planner demonstration. It validates source/decision joins, passes only the plan to a renderer port, runs independent plan QC, and records synthetic decision/feedback/cost events. `demo.ts` prints canonical JSON. There is no actual analyzer, matcher, ML planner, renderer, user action, or measured business metric.

Dry-run media checks stay unverified. Synthetic acceptance illustrates telemetry ingestion in a separate environment; it does not advance the job or establish customer acceptance. Contract-test doubles that report media/QC shapes exist only to exercise state gates.
