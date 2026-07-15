/**
 * Loopback callback listener for OAuth authorization-code login.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Data from "effect/Data";
import * as Effect from "effect/Effect";

export interface LoopbackCallback {
  readonly code: string;
  readonly state: string;
  readonly iss: string;
}

export class LoopbackLoginFallback extends Data.TaggedError("LoopbackLoginFallback")<{
  readonly reason: "bind_failed" | "browser_unavailable" | "timeout";
  readonly message: string;
  readonly cause?: unknown;
}> {}

export class LoopbackCallbackRejected extends Data.TaggedError("LoopbackCallbackRejected")<{
  readonly reason: "access_denied" | "invalid_callback";
  readonly message: string;
}> {}

export interface LoopbackServer {
  readonly port: number;
  readonly redirectUri: string;
  readonly awaitCallback: (
    expectedState: string,
    timeoutMs: number,
  ) => Effect.Effect<LoopbackCallback, LoopbackLoginFallback | LoopbackCallbackRejected>;
  readonly close: Effect.Effect<void>;
}

type AwaitSuccess = {
  readonly _tag: "success";
  readonly callback: LoopbackCallback;
};

type AwaitFailure = {
  readonly _tag: "failure";
  readonly error: LoopbackLoginFallback | LoopbackCallbackRejected;
};

type AwaitOutcome = AwaitSuccess | AwaitFailure;

const successPage = `<!doctype html><html><head><meta charset="utf-8"><title>Signed-in to AgentXM.ai</title></head><body><main style="font-family: system-ui, sans-serif; margin: 3rem auto; max-width: 34rem;"><h1>Signed-in to AgentXM.ai</h1><p>You can close this window.</p></main></body></html>`;
const errorPage = `<!doctype html><html><head><meta charset="utf-8"><title>AXM sign-in failed</title></head><body><main style="font-family: system-ui, sans-serif; margin: 3rem auto; max-width: 34rem;"><h1>AXM sign-in failed</h1><p>Return to your terminal and try again.</p></main></body></html>`;

interface IncomingRequest {
  readonly method?: string | undefined;
  readonly url?: string | undefined;
  readonly headers: {
    readonly host?: string | undefined;
  };
}

interface OutgoingResponse {
  readonly writeHead: (statusCode: number, headers: Readonly<Record<string, string>>) => void;
  readonly end: (body: string) => void;
}

const writeHtml = (response: OutgoingResponse, statusCode: number, body: string): void => {
  response.writeHead(statusCode, {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store",
  });
  response.end(body);
};

const makeCallbackOutcome = (request: IncomingRequest, expectedState: string): AwaitOutcome => {
  if (request.method !== "GET") {
    return {
      _tag: "failure",
      error: new LoopbackCallbackRejected({
        reason: "invalid_callback",
        message: "Unexpected callback method.",
      }),
    };
  }

  const host = request.headers.host ?? "127.0.0.1";
  const url = new URL(request.url ?? "/", `http://${host}`);
  if (url.pathname !== "/callback") {
    return {
      _tag: "failure",
      error: new LoopbackCallbackRejected({
        reason: "invalid_callback",
        message: "Unexpected callback path.",
      }),
    };
  }

  const state = url.searchParams.get("state");
  if (state !== expectedState) {
    return {
      _tag: "failure",
      error: new LoopbackCallbackRejected({
        reason: "invalid_callback",
        message: "OAuth state did not match.",
      }),
    };
  }

  const error = url.searchParams.get("error");
  if (error !== null) {
    return {
      _tag: "failure",
      error: new LoopbackCallbackRejected({
        reason: error === "access_denied" ? "access_denied" : "invalid_callback",
        message: `Authorization failed: ${error}.`,
      }),
    };
  }

  const code = url.searchParams.get("code");
  const iss = url.searchParams.get("iss");
  if (code === null || iss === null) {
    return {
      _tag: "failure",
      error: new LoopbackCallbackRejected({
        reason: "invalid_callback",
        message: "Authorization callback was incomplete.",
      }),
    };
  }

  return {
    _tag: "success",
    callback: { code, state, iss },
  };
};

export const startLoopbackServer = (): Effect.Effect<LoopbackServer, LoopbackLoginFallback> =>
  Effect.gen(function* () {
    const http = yield* Effect.tryPromise({
      try: () => import("node:http"),
      catch: (cause) =>
        new LoopbackLoginFallback({
          reason: "bind_failed",
          message: "Could not load the local HTTP server.",
          cause,
        }),
    });

    return yield* Effect.callback<LoopbackServer, LoopbackLoginFallback>((resume) => {
      let complete: ((outcome: AwaitOutcome) => void) | undefined;
      let timeout: ReturnType<typeof setTimeout> | undefined;

      const server = http.createServer((request, response) => {
        if (complete === undefined) {
          writeHtml(response, 404, errorPage);
          return;
        }

        const outcome = makeCallbackOutcome(request, activeExpectedState);
        writeHtml(
          response,
          outcome._tag === "success" ? 200 : 400,
          outcome._tag === "success" ? successPage : errorPage,
        );
        complete(outcome);
      });

      let activeExpectedState = "";

      server.once("error", (cause) => {
        resume(
          Effect.fail(
            new LoopbackLoginFallback({
              reason: "bind_failed",
              message: "Could not bind a local callback port.",
              cause,
            }),
          ),
        );
      });

      server.listen({ host: "127.0.0.1", port: 0, exclusive: process.platform === "win32" }, () => {
        const address = server.address();
        if (typeof address !== "object" || address === null) {
          resume(
            Effect.fail(
              new LoopbackLoginFallback({
                reason: "bind_failed",
                message: "Could not determine the local callback port.",
              }),
            ),
          );
          return;
        }

        const close = Effect.sync(() => {
          if (timeout !== undefined) clearTimeout(timeout);
          server.close();
        });

        const awaitCallback: LoopbackServer["awaitCallback"] = (expectedState, timeoutMs) =>
          Effect.callback<LoopbackCallback, LoopbackLoginFallback | LoopbackCallbackRejected>(
            (resumeCallback) => {
              activeExpectedState = expectedState;
              timeout = setTimeout(() => {
                server.close();
                resumeCallback(
                  Effect.fail(
                    new LoopbackLoginFallback({
                      reason: "timeout",
                      message: "Timed out waiting for the browser callback.",
                    }),
                  ),
                );
              }, timeoutMs);

              complete = (outcome) => {
                if (timeout !== undefined) clearTimeout(timeout);
                server.close();
                if (outcome._tag === "success") {
                  resumeCallback(Effect.succeed(outcome.callback));
                } else {
                  resumeCallback(Effect.fail(outcome.error));
                }
              };
            },
          );

        resume(
          Effect.succeed({
            port: address.port,
            redirectUri: `http://127.0.0.1:${address.port}/callback`,
            awaitCallback,
            close,
          }),
        );
      });
    });
  });
