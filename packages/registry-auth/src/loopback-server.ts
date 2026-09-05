/**
 * Loopback callback listener for OAuth authorization-code login.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Data from "effect/Data";
import * as Deferred from "effect/Deferred";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";

export interface LoopbackCallback {
  readonly code: string;
  readonly state: string;
  readonly iss: string;
}

export class LoopbackLoginFallback extends Data.TaggedError("LoopbackLoginFallback")<{
  readonly reason: "bind_failed" | "timeout";
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
    timeoutMs: number,
  ) => Effect.Effect<LoopbackCallback, LoopbackLoginFallback | LoopbackCallbackRejected>;
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

const page = (title: string, content: string) =>
  `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title></head><body><main style="font-family: system-ui, sans-serif; margin: 3rem auto; max-width: 34rem;"><h1>${title}</h1><p>${content}</p></main></body></html>`;

const successPage = page(
  "You’re signed in to AgentXM.ai",
  'Return to your terminal to continue. You can close this tab. <a href="https://agentxm.ai">AgentXM.ai</a>',
);
const cancellationPage = page(
  "Sign-in was cancelled",
  "No credentials were changed. Return to your terminal to try again.",
);
const errorPage = page(
  "AXM sign-in could not be completed",
  "Return to your terminal for details and recovery instructions.",
);

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

export const startLoopbackServer = (expectedState: string) =>
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

    const callback = yield* Deferred.make<
      LoopbackCallback,
      LoopbackLoginFallback | LoopbackCallbackRejected
    >();
    const listener = yield* Effect.acquireRelease(
      Effect.callback<
        { readonly server: import("node:http").Server; readonly port: number },
        LoopbackLoginFallback
      >((resume) => {
        let acquired = false;
        const server = http.createServer((request, response) => {
          const outcome = makeCallbackOutcome(request, expectedState);
          writeHtml(
            response,
            outcome._tag === "success" ? 200 : 400,
            outcome._tag === "success"
              ? successPage
              : outcome.error._tag === "LoopbackCallbackRejected" &&
                  outcome.error.reason === "access_denied"
                ? cancellationPage
                : errorPage,
          );
          Deferred.doneUnsafe(
            callback,
            outcome._tag === "success"
              ? Effect.succeed(outcome.callback)
              : Effect.fail(outcome.error),
          );
        });

        const onBindError = (cause: Error) => {
          if (acquired) return;
          acquired = true;
          resume(
            Effect.fail(
              new LoopbackLoginFallback({
                reason: "bind_failed",
                message: "Could not bind a local callback port.",
                cause,
              }),
            ),
          );
        };
        server.once("error", onBindError);

        server.listen(
          { host: "127.0.0.1", port: 0, exclusive: process.platform === "win32" },
          () => {
            if (acquired) return;
            const address = server.address();
            if (typeof address !== "object" || address === null) {
              acquired = true;
              server.close();
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

            acquired = true;
            server.off("error", onBindError);
            resume(
              Effect.succeed({
                server,
                port: address.port,
              }),
            );
          },
        );

        return Effect.sync(() => {
          if (!acquired) server.close();
        });
      }),
      ({ server }) =>
        Effect.try({
          try: () => {
            if (server.listening) server.close();
            server.closeAllConnections();
          },
          catch: () => undefined,
        }).pipe(Effect.ignore),
    );

    listener.server.on("error", (cause) => {
      Deferred.doneUnsafe(
        callback,
        Effect.fail(
          new LoopbackLoginFallback({
            reason: "bind_failed",
            message: "The local callback server failed.",
            cause,
          }),
        ),
      );
    });

    return {
      port: listener.port,
      redirectUri: `http://127.0.0.1:${listener.port}/callback`,
      awaitCallback: (timeoutMs) =>
        Deferred.await(callback).pipe(
          Effect.timeoutOrElse({
            duration: Duration.millis(timeoutMs),
            orElse: () =>
              Effect.fail(
                new LoopbackLoginFallback({
                  reason: "timeout",
                  message: "Timed out waiting for the browser callback.",
                }),
              ),
          }),
        ),
    } satisfies LoopbackServer;
  });
