import { createHash } from "node:crypto";
import { z } from "zod";
import { IdSchema, VersionLabelSchema } from "../contracts/common.js";
import { HashSchema } from "../reference-analyzer/protocol.js";
import { contentId } from "../reference-analyzer/features.js";
import { canonicalSerialize } from "../domain/serialization.js";

export const EDITORIAL_VERSION = "0.1.0" as const;
export function editorialEnvelope<const K extends string>(artifactType: K) {
  return { artifactType: z.literal(artifactType), artifactVersion: z.literal(EDITORIAL_VERSION), stability: z.literal("internal_pre_stable") };
}
export function ensure(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
export const equal = (a: unknown, b: unknown): boolean => canonicalSerialize(a) === canonicalSerialize(b);
export function unique(ids: readonly string[]): boolean { return new Set(ids).size === ids.length; }
export const IdListSchema = z.array(IdSchema).max(4096).refine(unique, "Duplicate IDs.");
export const IdSetSchema = IdListSchema.transform((ids) => [...ids].sort());
export const ArtifactRefSchema = z.strictObject({ objectId: IdSchema, sha256: HashSchema, artifactType: VersionLabelSchema, artifactVersion: VersionLabelSchema });
export type ArtifactRef = z.infer<typeof ArtifactRefSchema>;
export const EvidenceRefSchema = z.strictObject({
  artifact: ArtifactRefSchema,
  pointer: z.string().max(1024).regex(/^(?:\/(?:[^~]|~[01])*)*$/),
});
export type EvidenceRef = z.infer<typeof EvidenceRefSchema>;
export const EvidenceRefsSchema = z.array(EvidenceRefSchema).max(4096)
  .refine((refs) => unique(refs.map(canonicalSerialize)), "Duplicate evidence references.")
  .transform((refs) => [...refs].sort((a, b) => compareText(canonicalSerialize(a), canonicalSerialize(b))));
export const ArtifactRefsSchema = z.array(ArtifactRefSchema).max(4096)
  .refine((refs) => unique(refs.map((r) => r.objectId)), "Duplicate artifact object IDs.")
  .transform((refs) => [...refs].sort((a, b) => compareText(a.objectId, b.objectId)));
export function compareText(a: string, b: string): number { return a < b ? -1 : a > b ? 1 : 0; }
export const MissingStateSchema = z.enum(["not_computed", "unavailable", "not_applicable", "failed", "unsupported"]);
export const MissingSchema = z.strictObject({ state: MissingStateSchema, reasonCode: IdSchema, evidenceRefs: EvidenceRefsSchema })
  .refine((v) => v.state !== "failed" || v.evidenceRefs.length > 0, "Failed states require error evidence.");
export type Missing = z.infer<typeof MissingSchema>;
export function availability<T extends z.ZodType>(schema: T) {
  return z.union([z.strictObject({ state: z.literal("present"), value: schema }), MissingSchema]);
}
export type Availability<T> = { state: "present"; value: T } | Missing;
export function present<T>(value: T): { state: "present"; value: T } { return { state: "present", value }; }
export function missing(state: Missing["state"], reasonCode: string, evidenceRefs: EvidenceRef[] = []): Missing {
  return MissingSchema.parse({ state, reasonCode, evidenceRefs });
}
export const ProducerSchema = z.strictObject({
  producerId: IdSchema, producerVersion: VersionLabelSchema, configuration: EvidenceRefSchema,
  implementation: availability(EvidenceRefSchema), sourceEvidence: EvidenceRefsSchema.refine((refs) => refs.length > 0, "Source evidence required."),
  mediaBasis: z.enum(["real_footage", "synthetic", "unverified"]),
  computationBasis: z.enum(["deterministic", "cached_real_model", "fresh_real_model", "synthetic_stub", "human_annotation", "unverified"]),
  runEvidence: availability(EvidenceRefsSchema),
}).refine((p) => p.computationBasis !== "synthetic_stub" || p.mediaBasis === "synthetic", "Stub features require synthetic media provenance.");
export type Producer = z.infer<typeof ProducerSchema>;
export function feature<T extends z.ZodType>(schema: T) { return z.strictObject({ provenance: ProducerSchema, data: availability(schema) }); }
export type Feature<T> = { provenance: Producer; data: Availability<T> };

/** All fields except the artifact's own ID bind identity. Schemas canonicalize sets first.
 * No generic timestamp stripping: source receipt hashes and context asOf are evidence.
 */
export function identify<T extends object, K extends string>(prefix: string, key: K, body: T): T & Record<K, string> {
  ensure(!Object.hasOwn(body, key), "Identity body must not contain its own ID.");
  return { ...body, [key]: contentId(prefix, body) } as T & Record<K, string>;
}
export function checkIdentity(value: object, key: string, prefix: string): boolean {
  const body = { ...value } as Record<string, unknown>;
  const id = body[key]; delete body[key];
  return id === contentId(prefix, body);
}
export function exactDigest(bytes: Uint8Array): string { return createHash("sha256").update(bytes).digest("hex"); }

/** Explicit, caller-supplied JSON artifacts only. Construction neither reads nor discovers files.
 * Bytes stay at this boundary and are never copied into editorial artifacts.
 */
export interface SuppliedArtifact { readonly ref: ArtifactRef; readonly bytes: Uint8Array; readonly value: unknown }
export class EditorialArtifactMap {
  private readonly values = new Map<string, { ref: ArtifactRef; value: unknown }>();
  constructor(artifacts: readonly SuppliedArtifact[]) {
    for (const item of artifacts) {
      const ref = ArtifactRefSchema.parse(item.ref);
      ensure(!this.values.has(ref.objectId), "Duplicate artifact object ID.");
      ensure(exactDigest(item.bytes) === ref.sha256, "Exact artifact hash mismatch.");
      const bytes = item.bytes;
      const text = bytes[0] === 255 && bytes[1] === 254
        ? new TextDecoder("utf-16le", { fatal: true }).decode(bytes)
        : bytes[0] === 254 && bytes[1] === 255
          ? new TextDecoder("utf-16be", { fatal: true }).decode(bytes)
          : new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      const parsed: unknown = JSON.parse(text);
      ensure(equal(parsed, item.value), "Parsed artifact differs from supplied bytes.");
      if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
        const p = parsed as Record<string, unknown>;
        if ("artifactType" in p) ensure(p.artifactType === ref.artifactType && p.artifactVersion === ref.artifactVersion, "Native artifact envelope mismatch.");
        else if ("contractType" in p) ensure(p.contractType === ref.artifactType && p.schemaVersion === ref.artifactVersion, "Native contract envelope mismatch.");
      }
      this.values.set(ref.objectId, { ref, value: parsed });
    }
  }
  get(refInput: ArtifactRef): unknown {
    const ref = ArtifactRefSchema.parse(refInput), entry = this.values.get(ref.objectId);
    ensure(entry !== undefined, `Missing explicitly supplied artifact: ${ref.objectId}`);
    ensure(equal(entry.ref, ref), "Conflicting artifact identity.");
    return structuredClone(entry.value);
  }
  resolve(input: EvidenceRef): unknown {
    const ref = EvidenceRefSchema.parse(input);
    let value = this.get(ref.artifact);
    for (const encoded of ref.pointer === "" ? [] : ref.pointer.slice(1).split("/")) {
      const key = encoded.replace(/~1/g, "/").replace(/~0/g, "~");
      ensure(value !== null && typeof value === "object" && Object.hasOwn(value, key), "Unresolved JSON pointer.");
      if (Array.isArray(value)) ensure(/^(0|[1-9][0-9]*)$/.test(key), "Invalid array JSON pointer.");
      value = (value as Record<string, unknown>)[key];
    }
    return value;
  }
}
