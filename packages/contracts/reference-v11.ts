import { z } from "zod";
import { EmbeddingReferenceSchema, RoleSchema, TimeRangeSchema, TransitionSchema } from "./common.js";
import { ReferenceFingerprintSchema } from "./creative.js";

// Reference-only evolution. The released 1.0.0 schemas remain unchanged.
export const ReferenceRoleV11Schema = z.union([RoleSchema, z.literal("unknown")]);
export const ReferenceTransitionV11Schema = z.union([TransitionSchema, z.strictObject({ type: z.literal("unknown") })]);
export const ReferenceFingerprintV11Schema = z.strictObject({
  ...ReferenceFingerprintSchema.shape,
  schemaVersion: z.literal("1.1.0"),
  shots: z.array(z.strictObject({
    ...ReferenceFingerprintSchema.shape.shots.element.shape,
    role: ReferenceRoleV11Schema,
    transitionOut: ReferenceTransitionV11Schema,
    semanticEmbedding: EmbeddingReferenceSchema.nullable(),
  })).min(1).max(1000),
  structure: z.array(z.strictObject({ role: ReferenceRoleV11Schema, range: TimeRangeSchema })).max(100),
}).superRefine((reference, ctx) => {
  const seen = new Set<string>();
  reference.shots.forEach((shot, index) => {
    const previousEnd = reference.shots[index - 1]?.sourceRange.endSeconds ?? 0;
    if (seen.has(shot.shotId)) ctx.addIssue({ code: "custom", path: ["shots", index, "shotId"], message: "Duplicate shot ID." });
    seen.add(shot.shotId);
    if (Math.abs(shot.sourceRange.startSeconds - previousEnd) > 0.000001 || shot.sourceRange.endSeconds > reference.durationSeconds) {
      ctx.addIssue({ code: "custom", path: ["shots", index, "sourceRange"], message: "Reference shots must partition the full reference without gaps or overlaps." });
    }
  });
  if (Math.abs((reference.shots.at(-1)?.sourceRange.endSeconds ?? 0) - reference.durationSeconds) > 0.000001) {
    ctx.addIssue({ code: "custom", path: ["shots"], message: "Shots must end at reference duration." });
  }
  reference.structure.forEach((section, index) => {
    if (section.range.endSeconds > reference.durationSeconds || (index > 0 && section.range.startSeconds < (reference.structure[index - 1]?.range.endSeconds ?? 0))) {
      ctx.addIssue({ code: "custom", path: ["structure", index], message: "Structural sections must be ordered, non-overlapping, and inside the reference." });
    }
  });
  if (Math.abs(reference.pacing.averageShotLengthSeconds - reference.durationSeconds / reference.shots.length) > 0.000001 ||
      Math.abs(reference.pacing.shotsPerSecond - reference.shots.length / reference.durationSeconds) > 0.000001) {
    ctx.addIssue({ code: "custom", path: ["pacing"], message: "Pacing summaries must agree with the shot partition." });
  }
});

export const referenceFingerprintVersions = { "1.0.0": ReferenceFingerprintSchema, "1.1.0": ReferenceFingerprintV11Schema } as const;
export const AnyReferenceFingerprintSchema = z.union([ReferenceFingerprintSchema, ReferenceFingerprintV11Schema]);
export function migrateReferenceV1ToV11(input: unknown): z.infer<typeof ReferenceFingerprintV11Schema> {
  const source = ReferenceFingerprintSchema.parse(input);
  return ReferenceFingerprintV11Schema.parse({ ...source, schemaVersion: "1.1.0", shots: source.shots.map((shot) => ({ ...shot, semanticEmbedding: null })) });
}
