import type { EnergyAnalysisRequest, EnergyAnalysisResponse } from "./protocol.js";

export interface EnergyAnalysisProvider {
  analyze(
    input: EnergyAnalysisRequest,
  ): Promise<EnergyAnalysisResponse>;

  close(): Promise<void>;
}
