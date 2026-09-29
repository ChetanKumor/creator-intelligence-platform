/** Batch 3C internal intent/control records. No time, filesystem, network or provider effects. */
import { z } from "zod";
import { canonicalSerialize } from "../domain/serialization.js";
import { checkIdentity, equal, identify } from "../editorial/common.js";
export const VERSION = "0.1.0" as const;
export const header = <T extends string>(artifactType: T) => ({ artifactType, artifactVersion: VERSION, stability: "internal_pre_stable" as const });
export const envelope = <T extends string>(artifactType: T) => ({ artifactType: z.literal(artifactType), artifactVersion: z.literal(VERSION), stability: z.literal("internal_pre_stable") });
export const LIMITS = Object.freeze({ text: 4096, responseBytes: 16384, recordBytes: 262144, stateEntries: 64, headRevisions: 128, artifacts: 1024,
  actions: 1, stateOperations: 1, graphOperations: 1, selectedTargets: 1, referencedRevisions: 1 });
export class EditorialControlError extends Error {
  constructor(public readonly code: string) { super(code); this.name = "EditorialControlError"; }
}
export function check(value: unknown, code: string): asserts value { if (!value) throw new EditorialControlError(code); }
export function parse<S extends z.ZodType>(schema: S, value: unknown, code = "editorial_input_invalid"): z.output<S> {
  const result = schema.safeParse(value); check(result.success, code); return result.data;
}
export function canonical<S extends z.ZodType>(schema: S, value: unknown, code = "editorial_input_invalid"): z.output<S> {
  const result = parse(schema, value, code); check(equal(result, value), code); return result;
}
export function record<S extends z.ZodType>(schema: S, key: string, prefix: string, body: object): z.output<S> {
  const value = identify(prefix, key, body); check(canonicalSerialize(value).length <= LIMITS.recordBytes, "editorial_budget_exceeded");
  return parse(schema, value);
}
export const identity = (key: string, prefix: string) => (value: object) => checkIdentity(value, key, prefix);
export function frozen<T>(value: T): T {
  const copy = structuredClone(value);
  const freeze = (v: unknown): void => { if (v && typeof v === "object") { Object.values(v).forEach(freeze); Object.freeze(v); } };
  freeze(copy); return copy;
}
