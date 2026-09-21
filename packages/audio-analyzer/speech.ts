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
  SpeechProvider,
  Transcript,
} from "../providers/index.js";

import {
  SPEECH_ADAPTER_VERSION,
  SPEECH_MODEL_REVISION,
  SPEECH_PROTOCOL_VERSION,
  SpeechAnalysisRequestSchema,
  SpeechAnalysisResponseSchema,
  type SpeechAnalysisRequest,
  type SpeechAnalysisResponse,
} from "./speech-protocol.js";


export interface SpeechAnalysisProvider {
  analyze(
    input: SpeechAnalysisRequest,
  ): Promise<SpeechAnalysisResponse>;

  close(): Promise<void>;
}


export interface SpeechClock {
  now(): string;
}


export type SpeechMediaPathResolver =
  (
    asset: MediaAsset,
  ) =>
    Promise<string>;


export interface SpeechProviderRuntimeConfig {
  readonly modelDirectory:
    string;

  readonly device:
    SpeechAnalysisRequest[
      "device"
    ];

  readonly computeType:
    SpeechAnalysisRequest[
      "computeType"
    ];

  readonly language:
    string | null;
}


export class SpeechProviderAdapter
  implements SpeechProvider
{
  readonly id =
    "local_speech";

  readonly version =
    SPEECH_ADAPTER_VERSION;

  constructor(
    private readonly analysis:
      SpeechAnalysisProvider,

    private readonly resolveMediaPath:
      SpeechMediaPathResolver,

    private readonly runtime:
      SpeechProviderRuntimeConfig,

    private readonly clock:
      SpeechClock,
  ) {}

  async transcribe(
    assetInput:
      MediaAsset,

    context:
      AnalysisContext,
  ): Promise<
    AnalysisResult<Transcript>
  > {
    const asset =
      MediaAssetSchema.parse(
        assetInput,
      );

    const startedAt =
      this.clock.now();

    const mediaPath =
      await this.resolveMediaPath(
        asset,
      );

    const request =
      SpeechAnalysisRequestSchema
        .parse({
          protocolVersion:
            SPEECH_PROTOCOL_VERSION,

          operation:
            "transcribe",

          mediaPath,

          modelDirectory:
            this.runtime
              .modelDirectory,

          device:
            this.runtime.device,

          computeType:
            this.runtime
              .computeType,

          language:
            this.runtime.language,
        });

    const result =
      SpeechAnalysisResponseSchema
        .parse(
          await this.analysis
            .analyze(request),
        );

    const transcript:
      Transcript = {
        assetId:
          asset.assetId,

        language:
          result.value.language,

        regions:
          result.value.regions.map(
            (region) => ({
              startSeconds:
                region.startSeconds,

              endSeconds:
                region.endSeconds,

              text:
                region.text,

              confidence:
                region.confidence,
            }),
          ),
      };

    const modelRun:
      ModelRun =
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
            "faster-whisper-small",

          modelVersion:
            SPEECH_MODEL_REVISION,

          adapterVersion:
            this.version,

          operation:
            "speech",

          inputIds: [
            asset.assetId,
          ],

          // Transcript has no owned
          // identifier in the frozen
          // public contract.
          outputIds:
            [],

          startedAt,

          endedAt:
            this.clock.now(),

          status:
            "succeeded",

          errorCode:
            null,
        });

    return {
      value:
        transcript,

      modelRun,
    };
  }
}
