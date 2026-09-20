import {
  execFile,
  spawn,
  type ChildProcessWithoutNullStreams,
} from "node:child_process";

import {
  join,
} from "node:path";

import {
  TransNetV2DetectionFailureSchema,
  TransNetV2DetectionRequestSchema,
  TransNetV2DetectionResponseSchema,

  type TransNetV2DetectionRequest,
  type TransNetV2DetectionResponse,
} from "../packages/footage-analyzer/transnetv2-protocol.js";


export interface TransNetV2Launch {
  readonly projectRootWsl:
    string;

  readonly pythonPathWsl:
    string;

  readonly repositoryPathWsl:
    string;

  readonly weightsPathWsl:
    string;

  readonly timeoutMilliseconds?:
    number;
}


export class TransNetV2WorkerError
  extends Error {
  constructor(
    public readonly code:
      string,
  ) {
    super(
      `TransNetV2 worker failed (${code}).`,
    );

    this.name =
      "TransNetV2WorkerError";
  }
}


export class LocalTransNetV2Detector {
  private readonly child:
    ChildProcessWithoutNullStreams;

  private pending: {
    resolve(
      value:
        TransNetV2DetectionResponse,
    ): void;

    reject(
      error:
        Error,
    ): void;

    timer:
      ReturnType<typeof setTimeout>;
  } | null = null;

  private buffer = "";

  private stopped = false;

  private readonly finished:
    Promise<void>;

  private readonly timeout:
    number;


  constructor(
    launch:
      TransNetV2Launch,
  ) {
    this.timeout =
      launch.timeoutMilliseconds ??
      300_000;


    if (
      process.platform ===
      "win32"
    ) {
      const wsl =
        join(
          process.env[
            "SystemRoot"
          ] ??
            "C:\\Windows",

          "System32",

          "wsl.exe",
        );

      this.child =
        spawn(
          wsl,

          [
            "-e",

            "/usr/bin/env",

            `PYTHONPATH=${
              launch.projectRootWsl
            }/python`,

            "PYTHONNOUSERSITE=1",
            "PYTHONDONTWRITEBYTECODE=1",
            "PYTHONUTF8=1",

            "TF_CPP_MIN_LOG_LEVEL=2",
            "TF_FORCE_GPU_ALLOW_GROWTH=true",
            "CUDA_VISIBLE_DEVICES=0",

            `TRANSNET_REPO=${
              launch.repositoryPathWsl
            }`,

            `TRANSNET_WEIGHTS=${
              launch.weightsPathWsl
            }`,

            launch.pythonPathWsl,

            "-B",
            "-u",
            "-m",
            "transnet_detector",
          ],

          {
            shell: false,

            windowsHide:
              true,

            stdio: [
              "pipe",
              "pipe",
              "pipe",
            ],
          },
        );

    } else {
      this.child =
        spawn(
          launch.pythonPathWsl,

          [
            "-B",
            "-u",
            "-m",
            "transnet_detector",
          ],

          {
            shell: false,

            windowsHide:
              true,

            stdio: [
              "pipe",
              "pipe",
              "pipe",
            ],

            env: {
              ...process.env,

              PYTHONPATH:
                `${launch.projectRootWsl}/python`,

              PYTHONNOUSERSITE:
                "1",

              PYTHONDONTWRITEBYTECODE:
                "1",

              PYTHONUTF8:
                "1",

              TF_CPP_MIN_LOG_LEVEL:
                "2",

              TF_FORCE_GPU_ALLOW_GROWTH:
                "true",

              CUDA_VISIBLE_DEVICES:
                "0",

              TRANSNET_REPO:
                launch.repositoryPathWsl,

              TRANSNET_WEIGHTS:
                launch.weightsPathWsl,
            },
          },
        );
    }


    this.child.stdout
      .setEncoding("utf8");

    this.child.stdout.on(
      "data",

      (
        chunk:
          string,
      ) => {
        this.buffer +=
          chunk;

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

        let newline:
          number;

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
            const raw:
              unknown =
                JSON.parse(
                  line,
                );

            const failure =
              TransNetV2DetectionFailureSchema
                .safeParse(
                  raw,
                );

            if (
              failure.success
            ) {
              pending.reject(
                new TransNetV2WorkerError(
                  failure.data
                    .error.code,
                ),
              );

              continue;
            }

            const result =
              TransNetV2DetectionResponseSchema
                .parse(
                  raw,
                );

            pending.resolve(
              result,
            );

          } catch {
            pending.reject(
              new TransNetV2WorkerError(
                "INTERCHANGE_INVALID",
              ),
            );
          }
        }
      },
    );


    // Potential paths/native diagnostics
    // are deliberately not persisted.
    this.child.stderr.resume();


    this.child.on(
      "error",

      () => {
        this.stopped =
          true;

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
      new Promise(
        (
          done,
        ) => {
          this.child.once(
            "close",

            () => {
              this.stopped =
                true;

              this.fail(
                "WORKER_EXITED",
              );

              done();
            },
          );
        },
      );
  }


  private fail(
    code:
      string,
  ): void {
    const pending =
      this.pending;

    this.pending =
      null;

    if (
      pending !== null
    ) {
      clearTimeout(
        pending.timer,
      );

      pending.reject(
        new TransNetV2WorkerError(
          code,
        ),
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

    this.stopped =
      true;

    if (
      process.platform ===
        "win32" &&
      this.child.pid !==
        undefined
    ) {
      execFile(
        join(
          process.env[
            "SystemRoot"
          ] ??
            "C:\\Windows",

          "System32",

          "taskkill.exe",
        ),

        [
          "/PID",
          String(
            this.child.pid,
          ),
          "/T",
          "/F",
        ],

        {
          windowsHide:
            true,
        },

        () => {},
      );

    } else {
      this.child.kill();
    }
  }


  detect(
    input:
      TransNetV2DetectionRequest,
  ): Promise<
    TransNetV2DetectionResponse
  > {
    const request =
      TransNetV2DetectionRequestSchema
        .parse(
          input,
        );

    if (
      this.pending !==
        null ||
      this.stopped
    ) {
      return Promise.reject(
        new TransNetV2WorkerError(
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

            this.timeout,
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
      await this.finished;

      return;
    }

    this.child.stdin.end();

    const timer =
      setTimeout(
        () =>
          this.terminate(),
        5000,
      );

    await this.finished;

    clearTimeout(
      timer,
    );
  }
}
