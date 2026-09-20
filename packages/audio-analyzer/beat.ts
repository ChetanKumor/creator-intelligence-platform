import {
  BEAT_ADAPTER_VERSION,
  BeatAnalysisRequestSchema,
  BeatAnalysisResponseSchema,
  type BeatAnalysisRequest,
  type BeatAnalysisResponse,
} from "./protocol.js";

import {
  BeatWorker,
  type BeatWorkerLaunch,
} from "./worker.js";

export const BEAT_THIS_FINAL0_SHA256 =
  "8c328b45f59d8dd3dff219253ff6a8d6482be57d0133a29140e2febbf8eb8331";

export interface BeatAnalysisProvider {
  analyze(
    input: BeatAnalysisRequest,
  ): Promise<BeatAnalysisResponse>;

  close(): Promise<void>;
}

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
