import {
  ENERGY_ADAPTER_VERSION,
  EnergyAnalysisRequestSchema,
  EnergyAnalysisResponseSchema,
  type EnergyAnalysisRequest,
  type EnergyAnalysisResponse,
} from "./protocol.js";

import {
  EnergyWorker,
  type EnergyWorkerLaunch,
} from "./energy-worker.js";

export interface EnergyAnalysisProvider {
  analyze(
    input: EnergyAnalysisRequest,
  ): Promise<EnergyAnalysisResponse>;

  close(): Promise<void>;
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

export {
  EnergyWorker,
  type EnergyWorkerLaunch,
} from "./energy-worker.js";
