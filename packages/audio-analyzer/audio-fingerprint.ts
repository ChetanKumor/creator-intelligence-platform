import {
  createHash,
} from "node:crypto";

import {
  AudioFingerprintSchema,
  MediaAssetSchema,
} from "../contracts/index.js";

import type {
  AudioFingerprint,
  MediaAsset,
} from "../domain/index.js";

import {
  canonicalSerialize,
} from "../domain/serialization.js";

import type {
  Transcript,
} from "../providers/index.js";

import {
  MusicAnalysisSchema,
  type MusicAnalysis,
} from "./music-analysis.js";


export const AUDIO_FINGERPRINT_COMPOSER_VERSION =
  "audio-fingerprint-composer-0.1.0";


export const AUDIO_STRUCTURE_PROJECTION_POLICY =
  "structure-not-projected-v1";


export interface AudioFingerprintComposerInput {
  readonly asset:
    MediaAsset;

  readonly music:
    MusicAnalysis;

  readonly transcript:
    Transcript;

  readonly modelRunIds:
    readonly string[];

  readonly createdAt:
    string;
}


function contentId(
  prefix:
    string,

  value:
    unknown,
): string {
  return (
    `${prefix}_` +
    createHash("sha256")
      .update(
        canonicalSerialize(
          value,
        ),
      )
      .digest("hex")
  );
}


export function composeAudioFingerprint(
  input:
    AudioFingerprintComposerInput,
): AudioFingerprint {
  const asset =
    MediaAssetSchema.parse(
      input.asset,
    );

  const music =
    MusicAnalysisSchema.parse(
      input.music,
    );

  if (
    input.transcript.assetId !==
    asset.assetId
  ) {
    throw new Error(
      "TRANSCRIPT_ASSET_ID_MISMATCH",
    );
  }

  const duration =
    music.primitives.audio
      .durationSeconds;

  /*
   * Execution-layer PCM proxies are represented
   * by an integer number of audio samples.
   *
   * After the proxy is explicitly aligned to the
   * canonical MediaAsset duration, the nearest
   * representable PCM duration may differ by up
   * to half one sample.
   *
   * This does NOT permit raw audio-stream/container
   * duration drift. A multi-millisecond discrepancy
   * must still fail.
   */
  const durationToleranceSeconds =
    1e-6 +
    (
      0.5 /
      music.primitives.audio
        .sampleRate
    );

  if (
    Math.abs(
      duration -
      asset.durationSeconds,
    ) >
    durationToleranceSeconds
  ) {
    throw new Error(
      "AUDIO_DURATION_MISMATCH",
    );
  }

  if (
    new Set(
      input.modelRunIds,
    ).size !==
    input.modelRunIds.length
  ) {
    throw new Error(
      "DUPLICATE_MODEL_RUN_ID",
    );
  }

  /*
   * No authorized mapping currently exists from
   * All-In-One structural labels into the frozen
   * mainDropSeconds / phraseBoundariesSeconds fields.
   *
   * Preserve uncertainty instead of fabricating it.
   */
  const mainDropSeconds =
    null;

  const phraseBoundariesSeconds:
    number[] = [];

  const publicValue = {
    assetId:
      asset.assetId,

    durationSeconds:
      asset.durationSeconds,

    bpm:
      music.primitives
        .beat.bpm,

    beatsSeconds:
      music.primitives
        .beat.beatsSeconds,

    downbeatsSeconds:
      music.primitives
        .beat.downbeatsSeconds,

    energy:
      music.primitives
        .energy.points,

    mainDropSeconds,

    phraseBoundariesSeconds,

    speechRegions:
      input.transcript
        .regions.map(
          (region) => ({
            startSeconds:
              region.startSeconds,

            endSeconds:
              region.endSeconds,
          }),
        ),

    language:
      input.transcript.language,
  };

  const fingerprintId =
    contentId(
      "audio",
      {
        composerVersion:
          AUDIO_FINGERPRINT_COMPOSER_VERSION,

        structureProjectionPolicy:
          AUDIO_STRUCTURE_PROJECTION_POLICY,

        sourceSha256:
          music.primitives.audio
            .sha256,

        value:
          publicValue,
      },
    );

  return AudioFingerprintSchema.parse({
    contractType:
      "AudioFingerprint",

    schemaVersion:
      "1.0.0",

    fingerprintId,

    ...publicValue,

    provenance: {
      producer:
        "audio_fingerprint_composer",

      producerVersion:
        AUDIO_FINGERPRINT_COMPOSER_VERSION,

      modelRunIds:
        [...input.modelRunIds],

      createdAt:
        input.createdAt,
    },
  });
}
