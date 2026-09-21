import {
  MediaAssetSchema,
  ModelRunSchema,
} from "../contracts/index.js";

import type {
  MediaAsset,
  ModelRun,
} from "../domain/index.js";

import type {
  AnalysisContext,
  AnalysisResult,
  AudioAnalysisProvider,
  ProviderIdentity,
  SpeechProvider,
} from "../providers/index.js";

import {
  AUDIO_FINGERPRINT_COMPOSER_VERSION,
  composeAudioFingerprint,
} from "./audio-fingerprint.js";

import {
  MUSIC_ANALYSIS_VERSION,
  MusicAnalysisSchema,
  type MusicAnalysis,
  type MusicAnalysisInput,
} from "./music-analysis.js";


export const AUDIO_ANALYSIS_PROVIDER_VERSION =
  "audio-analysis-provider-0.1.0";


export const AUDIO_MUSIC_PROVIDER_ADAPTER_VERSION =
  "audio-music-provider-adapter-0.1.0";


export interface AudioAnalysisClock {
  now(): string;
}


export interface AudioMusicProvider
  extends ProviderIdentity
{
  analyzeMusic(
    asset:
      MediaAsset,

    context:
      AnalysisContext,
  ): Promise<
    AnalysisResult<MusicAnalysis>
  >;
}


export interface MusicAnalysisRuntime {
  analyze(
    input:
      MusicAnalysisInput,
  ): Promise<
    MusicAnalysis
  >;
}


export type AudioMusicMediaPathResolver =
  (
    asset:
      MediaAsset,
  ) =>
    Promise<string>;


export interface AudioMusicProviderRuntimeConfig {
  readonly beatCheckpointPath:
    string;

  readonly beatDevice:
    MusicAnalysisInput[
      "beatDevice"
    ];

  readonly structureDevice:
    MusicAnalysisInput[
      "structureDevice"
    ];
}


export class AudioMusicProviderAdapter
  implements AudioMusicProvider
{
  readonly id =
    "local_music";

  readonly version =
    AUDIO_MUSIC_PROVIDER_ADAPTER_VERSION;

  constructor(
    private readonly analysis:
      MusicAnalysisRuntime,

    private readonly resolveMediaPath:
      AudioMusicMediaPathResolver,

    private readonly runtime:
      AudioMusicProviderRuntimeConfig,

    private readonly clock:
      AudioAnalysisClock,
  ) {}


  async analyzeMusic(
    assetInput:
      MediaAsset,

    context:
      AnalysisContext,
  ): Promise<
    AnalysisResult<MusicAnalysis>
  > {
    const asset =
      MediaAssetSchema.parse(
        assetInput,
      );

    const startedAt =
      this.clock.now();

    /*
     * objectId remains opaque catalog identity.
     * Only the execution-layer resolver may
     * produce a machine-local media path.
     */
    const audioPath =
      await this.resolveMediaPath(
        asset,
      );

    const value =
      MusicAnalysisSchema.parse(
        await this.analysis.analyze({
          audioPath,

          beatCheckpointPath:
            this.runtime
              .beatCheckpointPath,

          beatDevice:
            this.runtime
              .beatDevice,

          structureDevice:
            this.runtime
              .structureDevice,
        }),
      );

    const endedAt =
      this.clock.now();

    const modelRun =
      ModelRunSchema.parse({
        contractType:
          "ModelRun",

        schemaVersion:
          "1.0.0",

        runId:
          `${context.operationId}.model`,

        scope:
          context.scope,

        provider:
          this.id,

        model:
          "beat_this_rms_allin1",

        modelVersion:
          MUSIC_ANALYSIS_VERSION,

        adapterVersion:
          this.version,

        operation:
          "audio_analysis",

        inputIds: [
          asset.assetId,
        ],

        /*
         * MusicAnalysis is internal owned
         * evidence and has no frozen public ID.
         */
        outputIds:
          [],

        startedAt,

        endedAt,

        status:
          "succeeded",

        errorCode:
          null,
      });

    return {
      value,
      modelRun,
    };
  }
}


function scopesEqual(
  left:
    ModelRun["scope"],

  right:
    AnalysisContext["scope"],
): boolean {
  return (
    left.projectId ===
      right.projectId &&
    left.jobId ===
      right.jobId &&
    left.creatorId ===
      right.creatorId &&
    left.environment ===
      right.environment
  );
}


export class AudioFingerprintAnalysisProvider
  implements AudioAnalysisProvider
{
  readonly id =
    "audio_analyzer";

  readonly version =
    AUDIO_ANALYSIS_PROVIDER_VERSION;

  constructor(
    private readonly music:
      AudioMusicProvider,

    private readonly speech:
      SpeechProvider,

    private readonly clock:
      AudioAnalysisClock,
  ) {}


  async analyze(
    assetInput:
      MediaAsset,

    context:
      AnalysisContext,
  ) {
    const asset =
      MediaAssetSchema.parse(
        assetInput,
      );

    const startedAt =
      this.clock.now();

    /*
     * Deliberately sequential.
     *
     * The local runtime is designed around
     * one heavy CUDA model family resident
     * at a time on the 6 GB development GPU.
     */
    const musicContext:
      AnalysisContext = {
        ...context,

        operationId:
          `${context.operationId}.music`,
      };

    const musicResult =
      await this.music
        .analyzeMusic(
          asset,
          musicContext,
        );

    const musicRun =
      ModelRunSchema.parse(
        musicResult.modelRun,
      );

    if (
      !scopesEqual(
        musicRun.scope,
        context.scope,
      )
    ) {
      throw new Error(
        "CHILD_MODELRUN_SCOPE_MISMATCH",
      );
    }

    const speechContext:
      AnalysisContext = {
        ...context,

        operationId:
          `${context.operationId}.speech`,
      };

    const speechResult =
      await this.speech
        .transcribe(
          asset,
          speechContext,
        );

    const speechRun =
      ModelRunSchema.parse(
        speechResult.modelRun,
      );

    if (
      !scopesEqual(
        speechRun.scope,
        context.scope,
      )
    ) {
      throw new Error(
        "CHILD_MODELRUN_SCOPE_MISMATCH",
      );
    }

    const endedAt =
      this.clock.now();

    const parentRunId =
      `${context.operationId}.model`;

    const fingerprint =
      composeAudioFingerprint({
        asset,

        music:
          musicResult.value,

        transcript:
          speechResult.value,

        modelRunIds: [
          musicRun.runId,
          speechRun.runId,
          parentRunId,
        ],

        createdAt:
          endedAt,
      });

    const modelRun =
      ModelRunSchema.parse({
        contractType:
          "ModelRun",

        schemaVersion:
          "1.0.0",

        runId:
          parentRunId,

        scope:
          context.scope,

        provider:
          this.id,

        model:
          "audio_fingerprint_composer",

        modelVersion:
          AUDIO_FINGERPRINT_COMPOSER_VERSION,

        adapterVersion:
          this.version,

        operation:
          "audio_analysis",

        inputIds: [
          asset.assetId,
        ],

        outputIds: [
          fingerprint.fingerprintId,
        ],

        startedAt,

        endedAt,

        status:
          "succeeded",

        errorCode:
          null,
      });

    return {
      value:
        fingerprint,

      modelRun,
    };
  }
}
