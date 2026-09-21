export {
  AUDIO_PROTOCOL_VERSION,
  BEAT_ADAPTER_VERSION,
  ENERGY_ADAPTER_VERSION,
  ENERGY_ALGORITHM_VERSION,

  BeatAnalysisRequestSchema,
  BeatAnalysisResponseSchema,
  BeatAnalysisFailureSchema,

  EnergyAnalysisRequestSchema,
  EnergyAnalysisResponseSchema,
  EnergyAnalysisFailureSchema,

  type BeatAnalysisRequest,
  type BeatAnalysisResponse,
  type BeatAnalysisFailure,

  type EnergyAnalysisRequest,
  type EnergyAnalysisResponse,
  type EnergyAnalysisFailure,
} from "./protocol.js";

export {
  BEAT_THIS_FINAL0_SHA256,
  type BeatAnalysisProvider,
} from "./beat.js";

export {
  type EnergyAnalysisProvider,
} from "./energy.js";

export {
  MUSIC_PRIMITIVE_VERSION,
  MusicPrimitiveAnalysisSchema,
  combineMusicPrimitives,

  type MusicPrimitiveAnalysis,
  type MusicPrimitiveInput,
} from "./music-primitives.js";


export {
  STRUCTURE_ADAPTER_VERSION,
  STRUCTURE_MODEL_NAME,
  StructureAnalysisRequestSchema,
  StructureAnalysisResponseSchema,
  StructureAnalysisFailureSchema,

  type StructureAnalysisRequest,
  type StructureAnalysisResponse,
  type StructureAnalysisFailure,
} from "./protocol.js";

export {
  type StructureAnalysisProvider,
} from "./structure.js";


export {
  MUSIC_ANALYSIS_VERSION,
  MusicAnalysisSchema,
  combineMusicAnalysis,

  type MusicAnalysis,
  type MusicAnalysisInput,
} from "./music-analysis.js";

export {
  SPEECH_PROTOCOL_VERSION,
  SPEECH_ADAPTER_VERSION,
  SPEECH_MODEL_REPO,
  SPEECH_MODEL_REVISION,
  SPEECH_MODEL_BIN_SHA256,
  SPEECH_MODEL_SET_SHA256,
  SpeechAnalysisRequestSchema,
  SpeechAnalysisResponseSchema,
  SpeechAnalysisFailureSchema,
  SpeechRegionSchema,
  type SpeechAnalysisRequest,
  type SpeechAnalysisResponse,
  type SpeechAnalysisFailure,
} from "./speech-protocol.js";

export {
  SpeechProviderAdapter,
  type SpeechAnalysisProvider,
  type SpeechClock,
  type SpeechMediaPathResolver,
  type SpeechProviderRuntimeConfig,
} from "./speech.js";
