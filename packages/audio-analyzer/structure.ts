import type { StructureAnalysisRequest, StructureAnalysisResponse } from "./protocol.js";

export interface StructureAnalysisProvider {
  analyze(
    input:
      StructureAnalysisRequest,
  ): Promise<
    StructureAnalysisResponse
  >;

  close(): Promise<void>;
}
