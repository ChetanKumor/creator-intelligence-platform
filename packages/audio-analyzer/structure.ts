import {
  STRUCTURE_ADAPTER_VERSION,
  STRUCTURE_MODEL_NAME,
  StructureAnalysisRequestSchema,
  StructureAnalysisResponseSchema,
  type StructureAnalysisRequest,
  type StructureAnalysisResponse,
} from "./protocol.js";

import {
  StructureWorker,
  type StructureWorkerLaunch,
} from "./structure-worker.js";

export interface StructureAnalysisProvider {
  analyze(
    input:
      StructureAnalysisRequest,
  ): Promise<
    StructureAnalysisResponse
  >;

  close(): Promise<void>;
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
