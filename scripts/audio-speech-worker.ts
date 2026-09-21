import {
  spawn,
  type ChildProcessWithoutNullStreams,
} from "node:child_process";

import {
  SpeechAnalysisFailureSchema,
  SpeechAnalysisRequestSchema,
  SpeechAnalysisResponseSchema,
  type SpeechAnalysisRequest,
  type SpeechAnalysisResponse,
} from "../packages/audio-analyzer/speech-protocol.js";

export interface SpeechWorkerLaunch {
  readonly pythonPath: string;
  readonly projectRootWsl: string;

  readonly cudaLibraryPathsWsl:
    readonly string[];

  readonly timeoutMilliseconds?:
    number;
}

export class SpeechWorker {
  private readonly child:
    ChildProcessWithoutNullStreams;

  private readonly timeoutMilliseconds:
    number;

  private pending: {
    resolve(
      value:
        SpeechAnalysisResponse,
    ): void;

    reject(
      error: Error,
    ): void;

    timer:
      ReturnType<
        typeof setTimeout
      >;
  } | null = null;

  private buffer = "";
  private stopped = false;

  private readonly finished:
    Promise<void>;

  constructor(
    config: SpeechWorkerLaunch,
  ) {
    this.timeoutMilliseconds =
      config.timeoutMilliseconds ??
      300_000;

    if (
      config.cudaLibraryPathsWsl
        .length > 8 ||
      config.cudaLibraryPathsWsl
        .some(
          (value) =>
            value.length < 1 ||
            value.length > 4096 ||
            value.includes("\n"),
        )
    ) {
      throw new Error(
        "CUDA_LIBRARY_PATH_INVALID",
      );
    }

    const pythonPath =
      `${config.projectRootWsl}/python`;

    const cudaLibraryPath = [
      ...config
        .cudaLibraryPathsWsl,

      "/usr/lib/wsl/lib",
    ].join(":");

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

      TRANSFORMERS_OFFLINE:
        "1",

      LD_LIBRARY_PATH:
        cudaLibraryPath,
    };

    if (
      process.platform ===
      "win32"
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

          "TRANSFORMERS_OFFLINE=1",

          `LD_LIBRARY_PATH=${cudaLibraryPath}`,

          config.pythonPath,

          "-B",
          "-u",
          "-m",

          "speech_analyzer",
        ],
        {
          shell: false,

          stdio: [
            "pipe",
            "pipe",
            "pipe",
          ],

          windowsHide:
            true,
        },
      );

    } else {
      this.child = spawn(
        config.pythonPath,

        [
          "-B",
          "-u",
          "-m",
          "speech_analyzer",
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
              this.buffer
                .indexOf("\n")
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

          this.pending =
            null;

          try {
            const raw: unknown =
              JSON.parse(line);

            const failure =
              SpeechAnalysisFailureSchema
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
              SpeechAnalysisResponseSchema
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

    // Native/model diagnostics may
    // include machine-local paths.
    // Drain stderr; never persist it.
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
            this.stopped =
              true;

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

  private terminate():
    void {
    if (
      this.stopped
    ) {
      return;
    }

    this.stopped = true;
    this.child.kill();
  }

  request(
    input:
      SpeechAnalysisRequest,
  ): Promise<
    SpeechAnalysisResponse
  > {
    const request =
      SpeechAnalysisRequestSchema
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

            this
              .timeoutMilliseconds,
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
    if (
      this.stopped
    ) {
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
