import {
  spawn,
  type ChildProcessWithoutNullStreams,
} from "node:child_process";

import {
  StructureAnalysisFailureSchema,
  StructureAnalysisRequestSchema,
  StructureAnalysisResponseSchema,
  type StructureAnalysisRequest,
  type StructureAnalysisResponse,
} from "../packages/audio-analyzer/protocol.js";

export interface StructureWorkerLaunch {
  readonly pythonPath: string;
  readonly projectRootWsl: string;
  readonly modelDirectoryWsl: string;
  readonly workDirectoryWsl: string;
  readonly timeoutMilliseconds?: number;
}

export class StructureWorker {
  private readonly child:
    ChildProcessWithoutNullStreams;

  private readonly timeoutMilliseconds:
    number;

  private pending: {
    resolve(
      value: StructureAnalysisResponse,
    ): void;

    reject(error: Error): void;

    timer:
      ReturnType<typeof setTimeout>;
  } | null = null;

  private buffer = "";
  private stopped = false;

  private readonly finished:
    Promise<void>;

  constructor(
    config: StructureWorkerLaunch,
  ) {
    this.timeoutMilliseconds =
      config.timeoutMilliseconds ??
      300_000;

    const pythonPath =
      `${config.projectRootWsl}/python`;

    const environment = {
      ...process.env,

      PYTHONPATH:
        pythonPath,

      PYTHONNOUSERSITE:
        "1",

      PYTHONDONTWRITEBYTECODE:
        "1",

      PYTHONUTF8:
        "1",

      HF_HUB_OFFLINE:
        "1",

      HF_HUB_DISABLE_TELEMETRY:
        "1",

      AIO_MODEL_DIR:
        config.modelDirectoryWsl,

      AIO_WORK_ROOT:
        config.workDirectoryWsl,
    };

    if (
      process.platform === "win32"
    ) {
      const command =
        `${process.env.SystemRoot ??
          "C:\\Windows"}\\System32\\wsl.exe`;

      this.child = spawn(
        command,
        [
          "-e",
          "/usr/bin/env",

          `PYTHONPATH=${pythonPath}`,

          "PYTHONNOUSERSITE=1",

          "PYTHONDONTWRITEBYTECODE=1",

          "PYTHONUTF8=1",

          "HF_HUB_OFFLINE=1",

          "HF_HUB_DISABLE_TELEMETRY=1",

          `AIO_MODEL_DIR=${config.modelDirectoryWsl}`,

          `AIO_WORK_ROOT=${config.workDirectoryWsl}`,

          config.pythonPath,

          "-B",
          "-u",
          "-m",

          "audio_analyzer.structure_worker",
        ],
        {
          shell: false,

          stdio: [
            "pipe",
            "pipe",
            "pipe",
          ],

          windowsHide: true,
        },
      );

    } else {
      this.child = spawn(
        config.pythonPath,

        [
          "-B",
          "-u",
          "-m",
          "audio_analyzer.structure_worker",
        ],

        {
          shell: false,

          stdio: [
            "pipe",
            "pipe",
            "pipe",
          ],

          env:
            environment,
        },
      );
    }

    this.child.stdout.setEncoding(
      "utf8",
    );

    this.child.stdout.on(
      "data",

      (chunk: string) => {
        this.buffer += chunk;

        if (
          this.buffer.length >
          16 * 1024 * 1024
        ) {
          this.fail(
            "WORKER_OUTPUT_LIMIT",
          );

          this.terminate();
          return;
        }

        let newline: number;

        while (
          (
            newline =
              this.buffer.indexOf(
                "\n",
              )
          ) >= 0
        ) {
          const line =
            this.buffer.slice(
              0,
              newline,
            );

          this.buffer =
            this.buffer.slice(
              newline + 1,
            );

          const pending =
            this.pending;

          if (
            pending === null
          ) {
            this.terminate();
            return;
          }

          clearTimeout(
            pending.timer,
          );

          this.pending = null;

          try {
            const raw: unknown =
              JSON.parse(line);

            const failure =
              StructureAnalysisFailureSchema
                .safeParse(raw);

            if (
              failure.success
            ) {
              pending.reject(
                new Error(
                  failure.data
                    .error.code,
                ),
              );

              continue;
            }

            const result =
              StructureAnalysisResponseSchema
                .parse(raw);

            pending.resolve(
              result,
            );

          } catch {
            pending.reject(
              new Error(
                "INTERCHANGE_INVALID",
              ),
            );
          }
        }
      },
    );

    // Native libraries can emit warnings and
    // machine-local paths. Drain; do not persist.
    this.child.stderr.resume();

    this.child.on(
      "error",
      () => {
        this.stopped = true;

        this.fail(
          "WORKER_UNAVAILABLE",
        );
      },
    );

    this.child.stdin.on(
      "error",
      () => {
        this.fail(
          "WORKER_UNAVAILABLE",
        );
      },
    );

    this.finished =
      new Promise((resolve) => {
        this.child.once(
          "close",
          () => {
            this.stopped = true;

            this.fail(
              "WORKER_EXITED",
            );

            resolve();
          },
        );
      });
  }

  private fail(
    code: string,
  ): void {
    const pending =
      this.pending;

    this.pending = null;

    if (
      pending !== null
    ) {
      clearTimeout(
        pending.timer,
      );

      pending.reject(
        new Error(code),
      );
    }
  }

  private terminate(): void {
    if (this.stopped) {
      return;
    }

    this.stopped = true;

    this.child.kill();
  }

  request(
    input:
      StructureAnalysisRequest,
  ): Promise<
    StructureAnalysisResponse
  > {
    const request =
      StructureAnalysisRequestSchema
        .parse(input);

    if (
      this.pending !== null ||
      this.stopped
    ) {
      return Promise.reject(
        new Error(
          "WORKER_UNAVAILABLE",
        ),
      );
    }

    return new Promise(
      (
        resolve,
        reject,
      ) => {
        const timer =
          setTimeout(
            () => {
              this.fail(
                "WORKER_TIMEOUT",
              );

              this.terminate();
            },

            this.timeoutMilliseconds,
          );

        this.pending = {
          resolve,
          reject,
          timer,
        };

        this.child.stdin.write(
          `${JSON.stringify(
            request,
          )}\n`,
        );
      },
    );
  }

  async close():
    Promise<void> {
    if (this.stopped) {
      return;
    }

    this.child.stdin.end();

    const timer =
      setTimeout(
        () =>
          this.terminate(),
        2_000,
      );

    await this.finished;

    clearTimeout(timer);
  }
}
