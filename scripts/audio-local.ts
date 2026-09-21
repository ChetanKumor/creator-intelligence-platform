// Local process composition; contracts and pure combination remain in packages.
import { BEAT_ADAPTER_VERSION, ENERGY_ADAPTER_VERSION, STRUCTURE_ADAPTER_VERSION, STRUCTURE_MODEL_NAME, BeatAnalysisRequestSchema, BeatAnalysisResponseSchema, EnergyAnalysisRequestSchema, EnergyAnalysisResponseSchema, StructureAnalysisRequestSchema, StructureAnalysisResponseSchema, type BeatAnalysisRequest, type BeatAnalysisResponse, type EnergyAnalysisRequest, type EnergyAnalysisResponse, type StructureAnalysisRequest, type StructureAnalysisResponse } from "../packages/audio-analyzer/protocol.js";
import { BEAT_THIS_FINAL0_SHA256, type BeatAnalysisProvider } from "../packages/audio-analyzer/beat.js";
import type { EnergyAnalysisProvider } from "../packages/audio-analyzer/energy.js";
import type { StructureAnalysisProvider } from "../packages/audio-analyzer/structure.js";
import {
  SPEECH_ADAPTER_VERSION,
  SPEECH_MODEL_BIN_SHA256,
  SPEECH_MODEL_REPO,
  SPEECH_MODEL_REVISION,
  SPEECH_MODEL_SET_SHA256,
  SpeechAnalysisRequestSchema,
  SpeechAnalysisResponseSchema,
  type SpeechAnalysisRequest,
  type SpeechAnalysisResponse,
} from "../packages/audio-analyzer/speech-protocol.js";
import {
  SpeechProviderAdapter,
  type SpeechAnalysisProvider,
  type SpeechClock,
  type SpeechMediaPathResolver,
  type SpeechProviderRuntimeConfig,
} from "../packages/audio-analyzer/speech.js";
import { combineMusicPrimitives, type MusicPrimitiveAnalysis, type MusicPrimitiveInput } from "../packages/audio-analyzer/music-primitives.js";
import { combineMusicAnalysis, type MusicAnalysis, type MusicAnalysisInput } from "../packages/audio-analyzer/music-analysis.js";
import {
  AudioFingerprintAnalysisProvider,
  AudioMusicProviderAdapter,
  type AudioAnalysisClock,
  type AudioMusicMediaPathResolver,
  type AudioMusicProviderRuntimeConfig,
} from "../packages/audio-analyzer/audio-analysis.js";
import { BeatWorker, type BeatWorkerLaunch } from "./audio-beat-worker.js";
import { EnergyWorker, type EnergyWorkerLaunch } from "./audio-energy-worker.js";
import { StructureWorker, type StructureWorkerLaunch } from "./audio-structure-worker.js";
import { SpeechWorker, type SpeechWorkerLaunch } from "./audio-speech-worker.js";
export * from "../packages/audio-analyzer/index.js";
export {
  BeatWorker,
  type BeatWorkerLaunch,
  EnergyWorker,
  type EnergyWorkerLaunch,
  StructureWorker,
  type StructureWorkerLaunch,
  SpeechWorker,
  type SpeechWorkerLaunch,
};

export class LocalBeatAnalysisProvider
  implements BeatAnalysisProvider
{
  private readonly worker: BeatWorker;

  constructor(config: BeatWorkerLaunch) {
    this.worker = new BeatWorker(config);
  }

  async analyze(
    input: BeatAnalysisRequest,
  ): Promise<BeatAnalysisResponse> {
    const request =
      BeatAnalysisRequestSchema.parse(input);

    const result =
      BeatAnalysisResponseSchema.parse(
        await this.worker.request(request),
      );

    if (
      result.toolVersion !==
      BEAT_ADAPTER_VERSION
    ) {
      throw new Error(
        "BEAT_ADAPTER_VERSION_MISMATCH",
      );
    }

    if (
      result.model.checkpointSha256 !==
      BEAT_THIS_FINAL0_SHA256
    ) {
      throw new Error(
        "BEAT_CHECKPOINT_IDENTITY_MISMATCH",
      );
    }

    return result;
  }

  close(): Promise<void> {
    return this.worker.close();
  }
}

export class LocalEnergyAnalysisProvider
  implements EnergyAnalysisProvider
{
  private readonly worker:
    EnergyWorker;

  constructor(
    config: EnergyWorkerLaunch,
  ) {
    this.worker =
      new EnergyWorker(config);
  }

  async analyze(
    input: EnergyAnalysisRequest,
  ): Promise<EnergyAnalysisResponse> {
    const request =
      EnergyAnalysisRequestSchema
        .parse(input);

    const result =
      EnergyAnalysisResponseSchema
        .parse(
          await this.worker.request(
            request,
          ),
        );

    if (
      result.toolVersion !==
      ENERGY_ADAPTER_VERSION
    ) {
      throw new Error(
        "ENERGY_ADAPTER_VERSION_MISMATCH",
      );
    }

    return result;
  }

  close(): Promise<void> {
    return this.worker.close();
  }
}

export class LocalStructureAnalysisProvider
  implements StructureAnalysisProvider
{
  private readonly worker:
    StructureWorker;

  constructor(
    config:
      StructureWorkerLaunch,
  ) {
    this.worker =
      new StructureWorker(
        config,
      );
  }

  async analyze(
    input:
      StructureAnalysisRequest,
  ): Promise<
    StructureAnalysisResponse
  > {
    const request =
      StructureAnalysisRequestSchema
        .parse(input);

    const result =
      StructureAnalysisResponseSchema
        .parse(
          await this.worker
            .request(request),
        );

    if (
      result.toolVersion !==
      STRUCTURE_ADAPTER_VERSION
    ) {
      throw new Error(
        "STRUCTURE_ADAPTER_VERSION_MISMATCH",
      );
    }

    if (
      result.model.modelName !==
      STRUCTURE_MODEL_NAME
    ) {
      throw new Error(
        "STRUCTURE_MODEL_IDENTITY_MISMATCH",
      );
    }

    if (
      result.model.checkpointCount !==
      8
    ) {
      throw new Error(
        "STRUCTURE_CHECKPOINT_SET_INVALID",
      );
    }

    return result;
  }

  close(): Promise<void> {
    return this.worker.close();
  }
}

export class LocalSpeechAnalysisProvider
  implements SpeechAnalysisProvider
{
  private readonly worker:
    SpeechWorker;

  constructor(
    config:
      SpeechWorkerLaunch,
  ) {
    this.worker =
      new SpeechWorker(
        config,
      );
  }

  async analyze(
    input:
      SpeechAnalysisRequest,
  ): Promise<
    SpeechAnalysisResponse
  > {
    const request =
      SpeechAnalysisRequestSchema
        .parse(input);

    const result =
      SpeechAnalysisResponseSchema
        .parse(
          await this.worker
            .request(request),
        );

    if (
      result.toolVersion !==
      SPEECH_ADAPTER_VERSION
    ) {
      throw new Error(
        "SPEECH_ADAPTER_VERSION_MISMATCH",
      );
    }

    if (
      result.model.repository !==
        SPEECH_MODEL_REPO ||
      result.model.revision !==
        SPEECH_MODEL_REVISION ||
      result.model.modelBinSha256 !==
        SPEECH_MODEL_BIN_SHA256 ||
      result.model.modelSetSha256 !==
        SPEECH_MODEL_SET_SHA256
    ) {
      throw new Error(
        "SPEECH_MODEL_IDENTITY_MISMATCH",
      );
    }

    if (
      result.model.device !==
        request.device ||
      result.model.computeType !==
        request.computeType
    ) {
      throw new Error(
        "SPEECH_RUNTIME_IDENTITY_MISMATCH",
      );
    }

    return result;
  }

  close():
    Promise<void> {
    return this.worker.close();
  }
}


export interface LocalSpeechProviderLaunch
  extends SpeechWorkerLaunch
{
  readonly modelDirectoryWsl:
    string;

  readonly resolveMediaPath:
    SpeechMediaPathResolver;

  readonly clock:
    SpeechClock;

  readonly device?:
    SpeechProviderRuntimeConfig[
      "device"
    ];

  readonly computeType?:
    SpeechProviderRuntimeConfig[
      "computeType"
    ];

  readonly language?:
    string | null;
}


export class LocalSpeechProvider
  extends SpeechProviderAdapter
{
  private readonly localAnalysis:
    LocalSpeechAnalysisProvider;

  constructor(
    config:
      LocalSpeechProviderLaunch,
  ) {
    const analysis =
      new LocalSpeechAnalysisProvider({
        projectRootWsl:
          config.projectRootWsl,

        pythonPath:
          config.pythonPath,

        cudaLibraryPathsWsl:
          config.cudaLibraryPathsWsl,

        ...(config.timeoutMilliseconds ===
          undefined
          ? {}
          : {
              timeoutMilliseconds:
                config.timeoutMilliseconds,
            }),
      });

    super(
      analysis,

      config.resolveMediaPath,

      {
        modelDirectory:
          config.modelDirectoryWsl,

        device:
          config.device ??
          "cuda",

        computeType:
          config.computeType ??
          "float16",

        language:
          config.language ??
          null,
      },

      config.clock,
    );

    this.localAnalysis =
      analysis;
  }

  close():
    Promise<void> {
    return this.localAnalysis
      .close();
  }
}


export interface LocalMusicPrimitiveLaunch {
  readonly projectRootWsl: string;
  readonly pythonPath: string;
}

export class LocalMusicPrimitiveProvider {
  private readonly beat:
    LocalBeatAnalysisProvider;

  private readonly energy:
    LocalEnergyAnalysisProvider;

  constructor(
    config: LocalMusicPrimitiveLaunch,
  ) {
    this.beat =
      new LocalBeatAnalysisProvider({
        projectRootWsl:
          config.projectRootWsl,

        pythonPath:
          config.pythonPath,

        timeoutMilliseconds:
          180_000,
      });

    this.energy =
      new LocalEnergyAnalysisProvider({
        projectRootWsl:
          config.projectRootWsl,

        pythonPath:
          config.pythonPath,

        timeoutMilliseconds:
          60_000,
      });
  }

  async analyze(
    input: MusicPrimitiveInput,
  ): Promise<MusicPrimitiveAnalysis> {
    const beat =
      await this.beat.analyze({
        protocolVersion: "1.0.0",
        operation: "beats",
        audioPath:
          input.audioPath,
        checkpointPath:
          input.checkpointPath,
        device:
          input.device,
      });

    const energy =
      await this.energy.analyze({
        protocolVersion: "1.0.0",
        operation: "energy",
        audioPath:
          input.audioPath,
      });

    return combineMusicPrimitives(
      beat,
      energy,
    );
  }

  async close(): Promise<void> {
    await this.beat.close();
    await this.energy.close();
  }
}

export interface LocalMusicAnalysisLaunch {
  readonly projectRootWsl:
    string;

  readonly primitivePythonPath:
    string;

  readonly structurePythonPath:
    string;

  readonly structureModelDirectoryWsl:
    string;

  readonly structureWorkDirectoryWsl:
    string;
}

/*
 * One heavy CUDA model at a time.
 *
 * Primitive provider owns Beat This.
 * It is fully closed before All-In-One
 * is launched.
 *
 * This intentionally trades some model
 * reload latency for bounded 6 GB VRAM
 * behavior during the first production
 * architecture.
 */
export class LocalMusicAnalysisProvider {
  constructor(
    private readonly config:
      LocalMusicAnalysisLaunch,
  ) {}

  async analyze(
    input:
      MusicAnalysisInput,
  ): Promise<
    MusicAnalysis
  > {
    const primitiveProvider =
      new LocalMusicPrimitiveProvider({
        projectRootWsl:
          this.config
            .projectRootWsl,

        pythonPath:
          this.config
            .primitivePythonPath,
      });

    let primitives:
      MusicPrimitiveAnalysis;

    try {
      primitives =
        await primitiveProvider
          .analyze({
            audioPath:
              input.audioPath,

            checkpointPath:
              input
                .beatCheckpointPath,

            device:
              input.beatDevice,
          });

    } finally {
      await primitiveProvider
        .close();
    }

    const structureProvider =
      new LocalStructureAnalysisProvider({
        projectRootWsl:
          this.config
            .projectRootWsl,

        pythonPath:
          this.config
            .structurePythonPath,

        modelDirectoryWsl:
          this.config
            .structureModelDirectoryWsl,

        workDirectoryWsl:
          this.config
            .structureWorkDirectoryWsl,

        timeoutMilliseconds:
          300_000,
      });

    let structure:
      StructureAnalysisResponse;

    try {
      structure =
        await structureProvider
          .analyze({
            protocolVersion:
              "1.0.0",

            operation:
              "structure",

            audioPath:
              input.audioPath,

            device:
              input.structureDevice,
          });

    } finally {
      await structureProvider
        .close();
    }

    return combineMusicAnalysis(
      primitives,
      structure,
    );
  }
}
export interface LocalAudioMusicProviderLaunch
  extends LocalMusicAnalysisLaunch
{
  readonly beatCheckpointPathWsl:
    string;

  readonly resolveMediaPath:
    AudioMusicMediaPathResolver;

  readonly clock:
    AudioAnalysisClock;

  readonly beatDevice?:
    AudioMusicProviderRuntimeConfig[
      "beatDevice"
    ];

  readonly structureDevice?:
    AudioMusicProviderRuntimeConfig[
      "structureDevice"
    ];
}


/*
 * Public music-provider bridge.
 *
 * objectId is never interpreted as a path.
 * The resolver supplies execution-only local
 * media location.
 *
 * LocalMusicAnalysisProvider already guarantees
 * Beat This is closed before All-In-One starts.
 */
export class LocalAudioMusicProvider
  extends AudioMusicProviderAdapter
{
  constructor(
    config:
      LocalAudioMusicProviderLaunch,
  ) {
    const analysis =
      new LocalMusicAnalysisProvider({
        projectRootWsl:
          config.projectRootWsl,

        primitivePythonPath:
          config.primitivePythonPath,

        structurePythonPath:
          config.structurePythonPath,

        structureModelDirectoryWsl:
          config.structureModelDirectoryWsl,

        structureWorkDirectoryWsl:
          config.structureWorkDirectoryWsl,
      });

    super(
      analysis,

      config.resolveMediaPath,

      {
        beatCheckpointPath:
          config.beatCheckpointPathWsl,

        beatDevice:
          config.beatDevice ??
          "cuda",

        structureDevice:
          config.structureDevice ??
          "cuda",
      },

      config.clock,
    );
  }
}


export interface LocalAudioFingerprintProviderLaunch {
  readonly music:
    Omit<
      LocalAudioMusicProviderLaunch,
      "clock"
    >;

  readonly speech:
    Omit<
      LocalSpeechProviderLaunch,
      "clock"
    >;

  readonly clock:
    AudioAnalysisClock;
}


/*
 * Full local AudioAnalysisProvider composition.
 *
 * SpeechWorker process is created eagerly but
 * faster-whisper model loading is request-lazy.
 *
 * AudioFingerprintAnalysisProvider invokes music
 * before speech. LocalMusicAnalysisProvider has
 * already closed Beat This and All-In-One workers
 * before speech inference begins, preserving the
 * one-heavy-CUDA-model-at-a-time development rule.
 */
export class LocalAudioFingerprintProvider
  extends AudioFingerprintAnalysisProvider
{
  private readonly localSpeech:
    LocalSpeechProvider;

  constructor(
    config:
      LocalAudioFingerprintProviderLaunch,
  ) {
    const music =
      new LocalAudioMusicProvider({
        ...config.music,

        clock:
          config.clock,
      });

    const speech =
      new LocalSpeechProvider({
        ...config.speech,

        clock:
          config.clock,
      });

    super(
      music,
      speech,
      config.clock,
    );

    this.localSpeech =
      speech;
  }

  close():
    Promise<void> {
    return this.localSpeech
      .close();
  }
}
