/**
 * Gate 7 Batch 3E-B1A pure fixtures: AuthorizedFootage records, already-parsed ffprobe-shaped facts, canonical derivations and owner
 * registrations. Nothing here touches media, a process, a clock or a network. Hashes are digests of labels, never of real bytes.
 * New B1A exports are read through module namespaces, so a missing export fails the calling test rather than the whole file.
 */
import { createHash } from "node:crypto";
import * as ownerMedia from "../../packages/edit-render/owner-media.js";
import { identify } from "../../packages/editorial/common.js";
import * as ingest from "../../packages/media-ingest/index.js";

export type Json = Record<string, unknown>;
export const sha = (text: string): string => createHash("sha256").update(text).digest("hex");
export const clone = <T>(value: T): T => structuredClone(value);

export const HASH_A = sha("b1a-root-bytes"), HASH_B = sha("b1a-canonical-bytes"), HASH_C = sha("b1a-other-bytes");
export const SIZE_A = 4099, SIZE_B = 4111, SIZE_C = 5003;
export const CREATOR = "creator_b1a", PROJECT = "project_b1a";
export const DAY0 = "2026-09-30T00:00:00.000Z", DAY1 = "2026-10-01T00:00:00.000Z", DAY2 = "2026-10-02T00:00:00.000Z", DAY3 = "2026-10-03T00:00:00.000Z";
export const ANALYSIS = "local_footage_analysis", EVALUATION = "local_evaluation", CANONICALIZATION = "local_media_canonicalization";

// ---------------------------------------------------------------- authorization records
/** An accepted AuthorizedFootage 1.0.0 record (owner-supplied real media). */
export const v1 = (patch: Json = {}): Json => ({ manifestType: "AuthorizedFootage", schemaVersion: "1.0.0", contentHash: HASH_A, sizeBytes: SIZE_A,
  sourceType: "owner_supplied", authorizationBasis: "owner_created", allowedPurposes: [ANALYSIS, EVALUATION], dateAdded: DAY1, creatorId: CREATOR,
  projectId: PROJECT, ...patch });
/** A 1.1.0 root: owner-supplied, with the owner's explicit consent to canonicalization in its own field (never an allowed purpose). */
export const root = (patch: Json = {}): Json => v1({ schemaVersion: "1.1.0", canonicalizationConsent: CANONICALIZATION, ...patch });
/** A 1.1.0-shaped root with the consent field removed: not an authorization (an owner who does not consent uses 1.0.0). */
export const rootWithoutConsent = (patch: Json = {}): Json => { const value = root(patch); delete value.canonicalizationConsent; return value; };
/** A 1.1.0 derived record at the authorization level only (its derivation identity is not checked by the authorization schema). */
export const derivedRecord = (patch: Json = {}, lineage: Json = {}): Json => ({ manifestType: "AuthorizedFootage", schemaVersion: "1.1.0", contentHash: HASH_B,
  sizeBytes: SIZE_B, sourceType: "system_canonicalized", authorizationBasis: "owner_created", allowedPurposes: [ANALYSIS, EVALUATION], dateAdded: DAY2,
  creatorId: CREATOR, projectId: PROJECT,
  derivedFrom: { rootAuthorization: root(), derivationId: `canonical_media_derivation_v0_${"d".repeat(64)}`, recipeId: "canonical_n1_square_sample_aspect", ...lineage },
  ...patch });

// ---------------------------------------------------------------- ffprobe-shaped facts (already parsed; the renderer's strict probe vocabulary)
export interface ProbeOptions {
  frames?: number; sar?: string | null; codec?: string; pixFmt?: string; width?: number | null; height?: number; rate?: string | null; timeBase?: string | null;
  pts?: (i: number) => number; startPts?: number | null; sideData?: Json[]; frameSideData?: Json[]; audio?: "pcm" | "aac" | "none"; audioCodec?: string;
  sampleRate?: number | null; channels?: number; channelLayout?: string; audioStart?: number; audioSamples?: number; audioGapAt?: number; extraStreams?: Json[];
  format?: string;
}
/** 30 fps exactly on the MOV 1/15360 grid (frame i at pts 512 i), 1080x1920, 48 kHz stereo audio in 1024-sample packets unless patched. */
export function probeOf(o: ProbeOptions = {}): Json {
  const frames = o.frames ?? 60, pts = o.pts ?? ((i: number) => i * 512), audio = o.audio ?? "pcm";
  const video: Json = { index: 0, codec_type: "video", codec_name: o.codec ?? "h264", profile: "High", width: o.width ?? 1080, height: o.height ?? 1920,
    pix_fmt: o.pixFmt ?? "yuv420p", time_base: "1/15360", start_pts: pts(0), r_frame_rate: "30/1", avg_frame_rate: "30/1" };
  if (o.sar !== null) video.sample_aspect_ratio = o.sar ?? "1:1";
  if (o.width === null) delete video.width;
  if (o.rate === null) delete video.r_frame_rate; else if (o.rate !== undefined) video.r_frame_rate = o.rate;
  if (o.timeBase === null) delete video.time_base; else if (o.timeBase !== undefined) video.time_base = o.timeBase;
  if (o.startPts === null) delete video.start_pts; else if (o.startPts !== undefined) video.start_pts = o.startPts;
  if (o.sideData !== undefined) video.side_data_list = o.sideData;
  const streams: Json[] = [video];
  if (audio !== "none") {
    const rate = o.sampleRate === undefined ? 48_000 : o.sampleRate, channels = o.channels ?? 2;
    const stream: Json = { index: 1, codec_type: "audio", codec_name: o.audioCodec ?? (audio === "aac" ? "aac" : "pcm_s16le"), channels,
      channel_layout: o.channelLayout ?? (channels === 2 ? "stereo" : "mono"), time_base: `1/${rate ?? 48_000}`, start_pts: o.audioStart ?? 0 };
    if (rate !== null) stream.sample_rate = String(rate);
    streams.push(stream);
  }
  for (const extra of o.extraStreams ?? []) streams.push({ ...extra, index: streams.length });
  const list: Json[] = Array.from({ length: frames }, (_, i) => ({ stream_index: 0, pts: pts(i),
    ...(o.frameSideData !== undefined && i === 0 ? { side_data_list: o.frameSideData } : {}) }));
  if (audio !== "none") {
    const total = o.audioSamples ?? 96_000, start = o.audioStart ?? 0;
    for (let s = 0; s < total; s += 1024) {
      list.push({ stream_index: 1, pts: start + s + (o.audioGapAt !== undefined && s >= o.audioGapAt ? 1024 : 0), nb_samples: Math.min(1024, total - s) });
    }
  }
  return { frames: list, programs: [], stream_groups: [], streams, format: { format_name: o.format ?? "mov,mp4,m4a,3gp,3g2,mj2" } };
}
/** Progressive SDR BT.709: the ingest-only facts the renderer's probe does not carry. */
export const FACTS: Json = { fieldOrder: "progressive", colorTransfer: "bt709", colorPrimaries: "bt709" };
export const classify = (probe: unknown, facts: unknown = FACTS) => ingest.classifyCanonicalIngest({ probe, facts });

// ---------------------------------------------------------------- canonical chains
export interface ChainOptions { root?: Json; audio?: "pcm" | "aac" | "none"; outputHash?: string; outputSize?: number; dateAdded?: string;
  decoded?: { sourceDigest: string; outputDigest: string }; audioPackets?: { sourceDigest: string; outputDigest: string } | null }
/** Root A (an N1 source) -> canonical B (the same probe with an explicit 1:1 SAR), with its derivation and derived authorization. */
export function canonicalChain(o: ChainOptions = {}) {
  const audio = o.audio ?? "pcm";
  const source = classify(probeOf({ sar: null, audio })), output = classify(probeOf({ sar: "1:1", audio }));
  const derivation = ingest.buildCanonicalMediaDerivation({ rootAuthorization: o.root ?? root(), source, output: { contentHash: o.outputHash ?? HASH_B,
    sizeBytes: o.outputSize ?? SIZE_B, classification: output, decodedVideo: o.decoded ?? { sourceDigest: sha("decoded-frames"), outputDigest: sha("decoded-frames") },
    audioPackets: o.audioPackets !== undefined ? o.audioPackets : audio === "none" ? null : { sourceDigest: sha("audio-packets"), outputDigest: sha("audio-packets") } } });
  const authorization = ingest.buildCanonicalDerivedAuthorization({ derivation, dateAdded: o.dateAdded ?? DAY2 });
  return { source, output, derivation: derivation as unknown as Json, authorization: authorization as unknown as Json };
}
/**
 * A coordinated forgery: mutate a derivation, then recompute both of its identities exactly as an attacker with the public algorithm
 * could. Only the rule under test can then refuse it.
 */
export function reidentified(derivation: Json, mutate: (d: Json) => void): Json {
  const d = clone(derivation);
  delete d.derivationId;
  mutate(d);
  const source = d.source as Json;
  d.computationId = ingest.canonicalComputationIdOf({ source: { assetId: source.assetId as string, contentHash: source.contentHash as string,
    sizeBytes: source.sizeBytes as number }, recipe: d.recipe as never, toolchain: d.toolchain as never });
  return identify(ingest.CANONICAL_DERIVATION_IDENTITY, "derivationId", d);
}
/** The derived authorization re-pointed at another derivation (a coordinated lineage forgery). */
export const repointed = (authorization: Json, derivation: Json): Json => ({ ...clone(authorization),
  derivedFrom: { ...(authorization.derivedFrom as Json), derivationId: derivation.derivationId } });

// ---------------------------------------------------------------- owner registrations
export const OWNER = { kind: "owner", actorId: "owner_b1a" } as const;
export const renderAuthorization = (statement: string, patch: Json = {}): Json => ({ statement, owner: OWNER, renderIntents: ["final"], authorizedAt: DAY1,
  expiresAt: null, ...patch });
export const original = (entryId: string, path: string, authorization: Json): Json => ({ entryId, path, authorization });
export const derivative = (entryId: string, rootEntryId: string, chain: { authorization: Json; derivation: Json }): Json => ({ entryId, rootEntryId,
  authorization: chain.authorization, derivation: chain.derivation });
/** The derived-capable statement, read through the namespace at call time. */
export const canonicalStatement = (): string => ownerMedia.OWNER_CANONICAL_RENDER_AUTHORIZATION_STATEMENT;
/** An OwnerMediaRegistration 0.2.0: declared originals (the AuthorizedFootageSet) and declared canonical derivatives. */
export function registrationV2(o: { originals?: Json[]; derivatives?: Json[]; statement?: string; creatorId?: string; projectId?: string } = {}): Json {
  const derivatives = o.derivatives ?? [derivative("clip_a_canonical", "clip_a", canonicalChain())];
  return { artifactType: "OwnerMediaRegistration", artifactVersion: "0.2.0", stability: "internal_pre_stable",
    footage: { manifestType: "AuthorizedFootageSet", schemaVersion: "1.0.0", creatorId: o.creatorId ?? CREATOR, projectId: o.projectId ?? PROJECT,
      assets: o.originals ?? [original("clip_a", "clip_a.mp4", root())] },
    canonicalDerivatives: derivatives, renderAuthorization: renderAuthorization(o.statement ?? canonicalStatement()) };
}
/** An OwnerMediaRegistration 0.1.0 (the unchanged original path). */
export function registrationV1(assets: Json[], statement: string = ownerMedia.OWNER_RENDER_AUTHORIZATION_STATEMENT): Json {
  return { artifactType: "OwnerMediaRegistration", artifactVersion: "0.1.0", stability: "internal_pre_stable",
    footage: { manifestType: "AuthorizedFootageSet", schemaVersion: "1.0.0", creatorId: CREATOR, projectId: PROJECT, assets },
    renderAuthorization: renderAuthorization(statement) };
}
