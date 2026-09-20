# ReferenceFingerprint 1.1.0

The project owner authorized this reference-only evolution on 2026-09-13. `ReferenceFingerprintSchema` and `CONTRACT_VERSION` continue to mean the frozen 1.0.0 contract. `ReferenceFingerprintV11Schema` is separately registered; `AnyReferenceFingerprintSchema` accepts exactly 1.0.0 or 1.1.0. Other versions fail closed.

| Reference-specific field | 1.0.0 | 1.1.0 |
| --- | --- | --- |
| schemaVersion | `1.0.0` | `1.1.0` |
| shots[].role and structure[].role | Existing semantic roles | Existing roles plus `unknown` |
| shots[].transitionOut | Cut or dissolve | Cut, dissolve, or `{ "type": "unknown" }` |
| shots[].semanticEmbedding | No field | Required nullable existing `EmbeddingReference` |

Here `unknown` includes unmeasured or insufficient evidence; it is not `supporting`, `cut`, or a zero confidence claim. An empty structure means no semantic regions have been assigned. The reference transition represents an observation, so the analyzer does not infer cut/dissolve classification from every detector boundary or manufacture a terminal transition. All Phase 1 transition labels currently remain unknown.

`migrateReferenceV1ToV11(input)` first validates the old version, clones it through parsing, preserves known roles/transitions and all other existing observations, changes the reference schema version, and assigns null embeddings to every shot. It does not accept an already migrated record. There is no automatic downgrade of unknown semantics. Consumers needing both versions must explicitly select the union schema/type. Existing Phase 0 consumers and fixtures retain their original contract.

The global RoleSchema, TransitionSchema, EmbeddingReferenceSchema, and other Phase 0 contracts are unchanged. The provider interface gained defaulted generic input/output parameters, preserving its original ClipSegment-to-EmbeddingReference signature for existing implementations. The Phase 1 implementation uses the same port for a batch of reference samples and shot references; it does not construct fake footage segments.

Timing and pacing invariants are preserved: complete ordered shot partition, unique shot IDs, no gaps/overlaps, positive durations, final boundary at media duration within 1 microsecond, consistent average shot length and shots per second. Limits remain 600 seconds, 1–120 fps with the existing rational bounds, and at most 1000 shots. JSON Schema describes structure; TypeScript/Zod additionally enforce semantic invariants before persistence.

Vectors remain in ignored local artifacts. The existing embedding reference's space ID identifies a configuration recorded in `analysis.json`: model, immutable revision, input preprocessing, aggregation, device policy and implementation versions. No Hugging Face object or vector array enters the fingerprint.
