/**
 * Explicit execution-media authority and execution-time source evidence. Footage analysis or evaluation authorization is
 * a different artifact and never authorizes rendering. The core validates supplied receipts only: it opens, reads and
 * hashes nothing, and a path string is never domain authority.
 */
import { z } from "zod";
import { IdSchema, TimestampSchema } from "../contracts/common.js";
import { ArtifactRefSchema, checkIdentity, compareText, identify } from "../editorial/common.js";
import { HashSchema, OwnerSchema, evidenceSet } from "../edit-graph/common.js";
import { ActorSchema, LocationFreeVersionSchema, PositiveSafeInt, RenderIntentSchema, ScopeSchema, envelope, parse } from "./common.js";

const MediaGrantBodySchema = z.strictObject({
  ...envelope("ExecutionMediaGrant"), scope: ScopeSchema,
  grant: z.literal("render_authorized_source_media_v0"),
  source: z.strictObject({ assetId: IdSchema, contentHash: HashSchema }),
  // An explicit set: preview, final, or both. A preview-only grant never authorizes a final render.
  renderIntents: z.array(RenderIntentSchema).min(1).max(2).refine(v => new Set(v).size === v.length, "Duplicate render intent.")
    .transform(v => [...v].sort(compareText)),
  authority: z.strictObject({ actor: OwnerSchema, evidence: evidenceSet(8, 1) }),
  issuedAt: TimestampSchema, expiresAt: TimestampSchema.nullable(),
});
export const ExecutionMediaGrantSchema = MediaGrantBodySchema.extend({ grantId: IdSchema })
  .refine(v => v.expiresAt === null || v.expiresAt > v.issuedAt, "A media grant must expire after it is issued.")
  .refine(v => checkIdentity(v, "grantId", "execution_media_grant_v0"), "Execution media grant identity mismatch.");
export type ExecutionMediaGrant = z.infer<typeof ExecutionMediaGrantSchema>;
export function createExecutionMediaGrant(input: unknown): ExecutionMediaGrant {
  return parse(ExecutionMediaGrantSchema, identify("execution_media_grant_v0", "grantId", parse(MediaGrantBodySchema, input)));
}

const ReceiptBodySchema = z.strictObject({
  ...envelope("SourceAccessReceipt"), scope: ScopeSchema, editGraph: ArtifactRefSchema, renderIntent: RenderIntentSchema,
  source: z.strictObject({ assetId: IdSchema, mediaAsset: ArtifactRefSchema, analysis: ArtifactRefSchema }),
  mediaGrant: ArtifactRefSchema,
  expected: z.strictObject({ contentHash: HashSchema, sizeBytes: PositiveSafeInt }),
  observed: z.strictObject({ contentHash: HashSchema, sizeBytes: PositiveSafeInt, hashScope: z.literal("full_source_bytes") }),
  checkedAt: TimestampSchema,
  resolver: z.strictObject({ resolverId: IdSchema, version: LocationFreeVersionSchema, implementationDigest: HashSchema }),
  attester: ActorSchema, basis: z.literal("runtime_resolver_supplied_full_byte_hash_no_core_io"),
  evidence: evidenceSet(8, 1),
});
export const SourceAccessReceiptSchema = ReceiptBodySchema.extend({ receiptId: IdSchema })
  .refine(v => checkIdentity(v, "receiptId", "source_access_receipt_v0"), "Source access receipt identity mismatch.");
export type SourceAccessReceipt = z.infer<typeof SourceAccessReceiptSchema>;
export function createSourceAccessReceipt(input: unknown): SourceAccessReceipt {
  return parse(SourceAccessReceiptSchema, identify("source_access_receipt_v0", "receiptId", parse(ReceiptBodySchema, input)));
}
