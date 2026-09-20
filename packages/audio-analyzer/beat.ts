import type { BeatAnalysisRequest, BeatAnalysisResponse } from "./protocol.js";

export const BEAT_THIS_FINAL0_SHA256 =
  "8c328b45f59d8dd3dff219253ff6a8d6482be57d0133a29140e2febbf8eb8331";

export interface BeatAnalysisProvider {
  analyze(
    input: BeatAnalysisRequest,
  ): Promise<BeatAnalysisResponse>;

  close(): Promise<void>;
}
