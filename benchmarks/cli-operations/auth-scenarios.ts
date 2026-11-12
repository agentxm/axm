import * as path from "node:path";
import * as fs from "node:fs/promises";
import { startBenchmarkDeviceAuthServer } from "./http-fixture.js";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import {
  assertOutput,
  assertSuccessful,
  writeJson,
  type BenchmarkScenario,
  type ProcessResult,
  type ScenarioContext,
} from "./fixtures.js";

const tokenId = "tok_01h455vb4pexka56gq5w2r7cpc";
const tokenSecret = "axm_pat_disposable_benchmark";
const tokenCreated = "2026-01-01T00:00:00.000Z";
const tokenExpires = "2099-01-01T00:00:00.000Z";
// Exercise restricted-file persistence in the disposable home, never a host keychain.
// Credential tier selection recognizes SSH_CLIENT/SSH_TTY, not SSH_CONNECTION.
const persistedAuthEnvironment = { CI: "", SSH_CLIENT: "benchmark" };

class AuthFixtureFailed extends Data.TaggedError("AuthFixtureFailed")<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

const observe = <A>(message: string, action: () => Promise<A>) =>
  Effect.tryPromise({ try: action, catch: (cause) => new AuthFixtureFailed({ message, cause }) });

const credentialFile = (context: ScenarioContext) =>
  path.join(context.home, ".config", "axm", "credentials.json");
const pendingFile = (context: ScenarioContext) =>
  path.join(context.home, ".axm", "pending-login.json");

const absent = (file: string) =>
  Effect.runPromise(
    observe(`Could not inspect ${file}`, async () => {
      try {
        await fs.lstat(file);
        return false;
      } catch (cause) {
        if (cause instanceof Error && "code" in cause && cause.code === "ENOENT") return true;
        throw cause;
      }
    }).pipe(
      Effect.flatMap((missing) =>
        missing
          ? Effect.void
          : Effect.fail(new AuthFixtureFailed({ message: `Unexpected auth state: ${file}` })),
      ),
    ),
  );

const restrictedFile = (file: string) =>
  Effect.gen(function* () {
    const info = yield* observe(`Required local auth file is missing: ${file}`, () =>
      fs.lstat(file),
    );
    if (!info.isFile())
      return yield* new AuthFixtureFailed({
        message: `Auth state is not a regular local file: ${file}`,
      });
    if (process.platform !== "win32" && (info.mode & 0o777) !== 0o600)
      return yield* new AuthFixtureFailed({
        message: `Auth file is not restricted to its owner: ${file}`,
      });
    return yield* observe(`Could not read local auth file: ${file}`, () =>
      fs.readFile(file, "utf8"),
    );
  });

const pendingSchema = Schema.Struct({
  version: Schema.Literal(3),
  registryUrl: Schema.String,
  deviceCode: Schema.Literal("device-secret"),
  userCode: Schema.Literal("ABCD-1234"),
  verificationUri: Schema.String,
  verificationUriComplete: Schema.String,
  interval: Schema.Literal(1),
  expiresAt: Schema.String,
});

const verifyPending = (context: ScenarioContext, registryUrl: string) =>
  Effect.runPromise(
    Effect.gen(function* () {
      const content = yield* restrictedFile(pendingFile(context));
      const pending = yield* Schema.decodeUnknownEffect(Schema.fromJsonString(pendingSchema))(
        content,
      );
      if (
        pending.registryUrl !== registryUrl ||
        pending.verificationUri !== `${registryUrl}/device` ||
        pending.verificationUriComplete !== `${registryUrl}/device?user_code=ABCD-1234` ||
        !(Date.parse(pending.expiresAt) > Date.now())
      )
        return yield* new AuthFixtureFailed({
          message: "Pending sign-in does not belong to the live fixture authorization",
        });
      return content;
    }),
  );

const sessionSchema = Schema.Struct({
  version: Schema.Literal(1),
  registries: Schema.Record(
    Schema.String,
    Schema.Struct({
      accounts: Schema.Record(
        Schema.String,
        Schema.Struct({
          access_token: Schema.Literal("axm_ses_e2e"),
          refresh_token: Schema.Literal("axm_ref_e2e"),
          expires_at: Schema.String,
          active: Schema.Literal(true),
        }),
      ),
    }),
  ),
});

const verifySession = (context: ScenarioContext, registryUrl: string) =>
  Effect.runPromise(
    Effect.gen(function* () {
      const content = yield* restrictedFile(credentialFile(context));
      const file = yield* Schema.decodeUnknownEffect(Schema.fromJsonString(sessionSchema))(content);
      const accounts = file.registries[registryUrl]?.accounts;
      if (
        Object.keys(file.registries).length !== 1 ||
        accounts === undefined ||
        Object.keys(accounts).length !== 1 ||
        accounts["@alice"]?.expires_at !== tokenExpires
      )
        return yield* new AuthFixtureFailed({
          message: "Local credentials do not contain only the approved fixture session",
        });
      return content;
    }),
  );

const loginDocument = Schema.Struct({
  ok: Schema.Literal(true),
  result: Schema.Struct({
    status: Schema.String,
    registryHost: Schema.String,
    flow: Schema.optionalKey(Schema.String),
    handle: Schema.optionalKey(Schema.String),
    userCode: Schema.optionalKey(Schema.String),
  }),
});

const verifyLoginJson = (
  result: ProcessResult,
  registryUrl: string,
  status: "pending-human" | "logged-in" | "already-logged-in",
  flow?: "started" | "re-emitted",
) => {
  assertSuccessful(result);
  const document = Schema.decodeUnknownSync(Schema.fromJsonString(loginDocument))(result.stdout);
  if (
    document.result.status !== status ||
    document.result.registryHost !== new URL(registryUrl).host ||
    (flow !== undefined && document.result.flow !== flow) ||
    (status === "pending-human"
      ? document.result.userCode !== "ABCD-1234"
      : document.result.handle !== "@alice")
  )
    throw new AuthFixtureFailed({
      message: `Expected ${status}${flow === undefined ? "" : ` (${flow})`} from fixture login; observed ${document.result.status}`,
    });
};

const prepareLogin = async (context: ScenarioContext, registryUrl: string, approved: boolean) => {
  const result = await context.run(
    [
      "login",
      "--device-code",
      ...(approved ? ["--wait-for-human", "5"] : []),
      "--json",
      "--non-interactive",
    ],
    { env: persistedAuthEnvironment },
  );
  try {
    verifyLoginJson(
      result,
      registryUrl,
      approved ? "logged-in" : "pending-human",
      approved ? undefined : "started",
    );
    if (approved) {
      await verifySession(context, registryUrl);
      await absent(pendingFile(context));
    } else {
      await verifyPending(context, registryUrl);
      await absent(credentialFile(context));
    }
  } catch (cause) {
    // The fixture issues only disposable credentials; preserve its process result for diagnosis.
    throw new AuthFixtureFailed({
      message: `Fixture login preparation did not establish ${approved ? "a local session" : "a pending authorization"}: ${String(cause)}\n${result.stdout}\n${result.stderr}`,
      cause,
    });
  }
};

const requireRequest = (
  requests: ReadonlyArray<{
    readonly method: string;
    readonly path: string;
    readonly status: number;
  }>,
  method: string,
  requestPath: string,
  status: number,
) => {
  if (
    !requests.some(
      (request) =>
        request.method === method && request.path === requestPath && request.status === status,
    )
  )
    throw new AuthFixtureFailed({
      message: `Auth fixture did not observe ${method} ${requestPath} returning ${status}`,
    });
};
const createRequest = Schema.Struct({
  name: Schema.String,
  expiresIn: Schema.Number,
  permissions: Schema.Struct({
    permission: Schema.Literals(["read", "publish", "admin"]),
    owners: Schema.optional(Schema.Array(Schema.String)),
    extensions: Schema.optional(Schema.Array(Schema.String)),
  }),
});

const authFixture = async (context: ScenarioContext, approved: boolean) => {
  const tokens = new Map<
    string,
    {
      readonly id: string;
      readonly name: string;
      readonly type: string;
      readonly permissions: {
        readonly permission: string;
        readonly owners: ReadonlyArray<string>;
        readonly extensions: ReadonlyArray<string>;
      };
      readonly createdAt: string;
      readonly expiresAt: string;
      readonly lastUsedAt: string | null;
    }
  >();
  tokens.set(tokenId, {
    id: tokenId,
    name: "benchmark-token",
    type: "pat",
    permissions: { permission: "read", owners: ["all"], extensions: [] },
    createdAt: tokenCreated,
    expiresAt: tokenExpires,
    lastUsedAt: null,
  });
  const server = await startBenchmarkDeviceAuthServer(
    approved ? "approved" : "pending",
    async (request, response) => {
      const pathname = new URL(request.url ?? "/", "http://localhost").pathname;
      if (!pathname.startsWith("/v1/tokens")) return false;
      const send = (status: number, body: unknown) => {
        response.writeHead(status, { "content-type": "application/json" });
        response.end(JSON.stringify(body));
      };
      if (pathname === "/v1/tokens" && request.method === "GET") {
        send(200, { tokens: [...tokens.values()], cursor: null, hasMore: false });
        return true;
      }
      if (pathname === "/v1/tokens" && request.method === "POST") {
        const chunks: Buffer[] = [];
        for await (const chunk of request) {
          if (!Buffer.isBuffer(chunk)) throw new Error("Invalid token fixture body");
          chunks.push(chunk);
        }
        const body = Schema.decodeUnknownSync(Schema.fromJsonString(createRequest))(
          Buffer.concat(chunks).toString("utf8"),
        );
        const token = {
          id: tokenId,
          name: body.name,
          type: "pat",
          permissions: {
            permission: body.permissions.permission,
            owners: body.permissions.owners ?? ["all"],
            extensions: body.permissions.extensions ?? [],
          },
          createdAt: tokenCreated,
          expiresAt: tokenExpires,
          lastUsedAt: null,
        };
        tokens.set(tokenId, token);
        send(201, { ...token, token: tokenSecret });
        return true;
      }
      if (pathname === `/v1/tokens/${tokenId}` && request.method === "DELETE") {
        tokens.delete(tokenId);
        response.writeHead(204);
        response.end();
        return true;
      }
      send(404, { error: "not_found" });
      return true;
    },
  );
  await writeJson(path.join(context.home, ".axm", "workspace", "axm.json"), {
    sources: [{ name: "fixture", type: "registry", location: server.url }],
    defaultRegistry: "fixture",
  });
  return { ...server, tokens };
};

export const authScenarios = (): ReadonlyArray<BenchmarkScenario> => {
  const scenarios: BenchmarkScenario[] = [];
  for (const modeId of ["default", "json"]) {
    const output = modeId === "json" ? ["--json"] : [];
    for (const operationId of ["login", "logout", "whoami", "token list", "token revoke"]) {
      scenarios.push({
        id: `auth:${operationId}:${modeId}`,
        operationId,
        modeId,
        fixtureId: "loopback-auth-v1",
        dimensions: {
          scope: "none",
          source: "none",
          selection: operationId === "token list" ? "bulk" : "targeted",
          view: "filesystem",
          output: modeId === "json" ? "json" : "human",
          state: operationId === "whoami" || operationId === "token list" ? "query" : "changed",
          format: modeId === "json" ? "result-json" : "terminal-text",
          kinds: [],
        },
        description:
          operationId === "login"
            ? "Persist a new device authorization; no human wait"
            : "Use a disposable signed-in session and loopback Registry",
        prepare: async (context) => {
          const server = await authFixture(context, operationId !== "login");
          try {
            if (operationId !== "login") await prepareLogin(context, server.url, true);
            const credentialsBefore =
              operationId === "login" ? undefined : await verifySession(context, server.url);
            const requestsBefore = server.requests.length;
            const args = [
              ...operationId.split(" "),
              ...(operationId === "login" ? ["--device-code"] : []),
              ...(operationId === "token revoke" ? [tokenId] : []),
              ...output,
              "--non-interactive",
            ];
            return {
              args,
              env: persistedAuthEnvironment,
              expectedExitCode: 0,
              dispose: server.close,
              metrics: () => ({ requests: server.requests.length - requestsBefore, userWaitMs: 0 }),
              verify: async (result) => {
                assertSuccessful(result);
                assertOutput(
                  result,
                  operationId === "login"
                    ? "ABCD-1234"
                    : operationId === "logout"
                      ? modeId === "json"
                        ? "logged-out"
                        : "Logged out"
                      : operationId === "token revoke"
                        ? tokenId
                        : operationId === "token list"
                          ? "benchmark-token"
                          : "@alice",
                );
                if (operationId === "token revoke" && server.tokens.has(tokenId))
                  throw new Error("Token was not revoked");
                if (operationId === "login") {
                  requireRequest(
                    server.requests.slice(requestsBefore),
                    "POST",
                    "/v1/auth/device/code",
                    200,
                  );
                  if (modeId === "json")
                    verifyLoginJson(result, server.url, "pending-human", "started");
                  await verifyPending(context, server.url);
                  await absent(credentialFile(context));
                } else if (operationId === "logout") {
                  if (modeId === "json") {
                    const loggedOut = Schema.decodeUnknownSync(
                      Schema.fromJsonString(loginDocument),
                    )(result.stdout);
                    if (
                      loggedOut.result.status !== "logged-out" ||
                      loggedOut.result.registryHost !== new URL(server.url).host ||
                      loggedOut.result.handle !== "@alice"
                    )
                      throw new AuthFixtureFailed({
                        message: "Logout did not report the fixture session's completed revocation",
                      });
                  } else {
                    assertOutput(result, `Logged out of ${new URL(server.url).host} as @alice.`);
                  }
                  requireRequest(
                    server.requests.slice(requestsBefore),
                    "POST",
                    "/v1/auth/revoke",
                    200,
                  );
                  await absent(credentialFile(context));
                  await absent(pendingFile(context));
                } else if ((await verifySession(context, server.url)) !== credentialsBefore) {
                  throw new AuthFixtureFailed({
                    message: "Authenticated query or token operation changed the saved session",
                  });
                }
              },
            };
          } catch (error) {
            await server.close();
            throw error;
          }
        },
      });
    }
  }
  for (const flow of [
    "approved-new",
    "approved-resume",
    "pending-reuse",
    "retained-session",
    "expired",
  ] as const) {
    for (const modeId of ["default", "json"]) {
      const pending = flow === "pending-reuse";
      const retained = flow === "retained-session";
      const expired = flow === "expired";
      scenarios.push({
        id: `auth:login:${flow}:${modeId}`,
        operationId: "login",
        modeId,
        fixtureId: "loopback-auth-v1",
        dimensions: {
          scope: "none",
          source: "none",
          selection: "targeted",
          view: "filesystem",
          output: modeId === "json" ? "json" : "human",
          state: pending || retained ? "no-op" : expired ? "refused" : "changed",
          format: modeId === "json" ? "result-json" : "terminal-text",
          kinds: [],
        },
        description: `Device sign-in ${flow}; approval is controlled with no human wait`,
        prepare: async (context) => {
          const server = await authFixture(context, retained || flow === "approved-new");
          try {
            if (flow !== "approved-new") await prepareLogin(context, server.url, retained);
            const pendingBefore = pending ? await verifyPending(context, server.url) : undefined;
            const credentialsBefore = retained
              ? await verifySession(context, server.url)
              : undefined;
            if (flow === "approved-resume") server.setOutcome("approved");
            if (expired) server.setOutcome("expired");
            const requestsBefore = server.requests.length;
            return {
              args: [
                "login",
                "--device-code",
                ...(pending || retained ? [] : ["--wait-for-human", "5"]),
                ...(modeId === "json" ? ["--json"] : []),
                "--non-interactive",
              ],
              env: persistedAuthEnvironment,
              expectedExitCode: expired ? 14 : 0,
              dispose: server.close,
              metrics: () => ({ requests: server.requests.length - requestsBefore, userWaitMs: 0 }),
              verify: async (result) => {
                const measuredRequests = server.requests.slice(requestsBefore);
                if (expired && modeId === "json")
                  Schema.decodeUnknownSync(
                    Schema.fromJsonString(
                      Schema.Struct({
                        ok: Schema.Literal(false),
                        code: Schema.Literal("auth_expired"),
                      }),
                    ),
                  )(result.stdout);
                if (!expired && modeId === "json")
                  verifyLoginJson(
                    result,
                    server.url,
                    pending ? "pending-human" : retained ? "already-logged-in" : "logged-in",
                    pending ? "re-emitted" : undefined,
                  );
                if (!expired && !pending && !retained && modeId === "default")
                  assertOutput(
                    result,
                    `Signed in to ${new URL(server.url).host} as alice@example.com`,
                  );
                if (retained && modeId === "default")
                  assertOutput(
                    result,
                    `Already logged in to ${new URL(server.url).host} as @alice.`,
                  );
                assertOutput(
                  result,
                  pending
                    ? "ABCD-1234"
                    : expired
                      ? modeId === "json"
                        ? "auth_expired"
                        : "expired"
                      : modeId === "json" || retained
                        ? "@alice"
                        : "alice@example.com",
                );
                if (
                  flow !== "approved-new" &&
                  measuredRequests.some((request) => request.path === "/v1/auth/device/code")
                )
                  throw new Error("Resuming sign-in created an unrelated device authorization");
                if (pending) {
                  if (measuredRequests.length !== 0)
                    throw new AuthFixtureFailed({
                      message: "Pending sign-in reuse unexpectedly contacted the Registry",
                    });
                  if ((await verifyPending(context, server.url)) !== pendingBefore)
                    throw new Error("Pending sign-in reuse changed its authorization");
                  await absent(credentialFile(context));
                } else {
                  requireRequest(
                    measuredRequests,
                    retained ? "GET" : "POST",
                    retained ? "/v1/auth/me" : "/v1/auth/token",
                    expired ? 400 : 200,
                  );
                  if (flow === "approved-new")
                    requireRequest(measuredRequests, "POST", "/v1/auth/device/code", 200);
                  if (!expired && !retained)
                    requireRequest(measuredRequests, "GET", "/v1/auth/me", 200);
                  if (
                    retained &&
                    measuredRequests.some((request) => request.path === "/v1/auth/token")
                  )
                    throw new AuthFixtureFailed({
                      message: "Retaining a current session requested new tokens",
                    });
                  await absent(pendingFile(context));
                  if (!expired) {
                    const credentialsAfter = await verifySession(context, server.url);
                    if (retained && credentialsAfter !== credentialsBefore)
                      throw new AuthFixtureFailed({
                        message: "Retaining a session changed its local credential file",
                      });
                    const stored = await context.run(
                      ["token", "show", "--plain", "--non-interactive"],
                      { env: persistedAuthEnvironment },
                    );
                    assertSuccessful(stored);
                    if (stored.stdout !== "axm_ses_e2e\n")
                      throw new Error("Approved session was not persisted across processes");
                  } else await absent(credentialFile(context));
                }
              },
            };
          } catch (error) {
            await server.close();
            throw error;
          }
        },
      });
    }
  }
  for (const operationId of ["token show", "token create"]) {
    for (const modeId of ["default", "plain"]) {
      scenarios.push({
        id: `auth:${operationId}:${modeId}`,
        operationId,
        modeId,
        fixtureId: "loopback-auth-v1",
        dimensions: {
          scope: "none",
          source: "none",
          selection: "targeted",
          view: "filesystem",
          output: modeId === "plain" ? "plain" : "human",
          state:
            modeId === "default" ? "refused" : operationId === "token create" ? "changed" : "query",
          format: modeId === "plain" ? "raw-credential-line" : "terminal-refusal",
          kinds: [],
        },
        description:
          modeId === "plain"
            ? "Export the effective or newly created disposable token through the required pipe output mode"
            : "Refuse unspecified credential output mode before token work in a noninteractive pipe",
        prepare: async (context) => {
          const server = await authFixture(context, true);
          const args = [
            ...operationId.split(" "),
            ...(operationId === "token create" ? ["benchmark-issued", "--permission", "read"] : []),
            ...(modeId === "plain" ? ["--plain"] : []),
            "--non-interactive",
          ];
          return {
            args,
            env: { AXM_TOKEN: tokenSecret },
            expectedExitCode: modeId === "plain" ? 0 : 2,
            dispose: server.close,
            metrics: () => ({ requests: server.requests.length, userWaitMs: 0 }),
            verify: (result) => {
              if (modeId === "default") {
                assertOutput(result, "--plain");
                if (
                  server.requests.length !== 0 ||
                  (result.stdout + result.stderr).includes(tokenSecret)
                )
                  throw new Error(
                    "Unspecified credential output performed token work or leaked a secret",
                  );
                return;
              }
              if (result.stdout !== `${tokenSecret}\n`)
                throw new Error("Token output did not match disposable fixture secret");
              if (
                operationId === "token create" &&
                server.tokens.get(tokenId)?.name !== "benchmark-issued"
              )
                throw new Error("Token creation did not persist requested fixture name");
            },
          };
        },
      });
    }
    scenarios.push({
      id: `auth:${operationId}:json-refused`,
      dimensions: {
        scope: "none",
        source: "none",
        selection: "targeted",
        view: "filesystem",
        output: "json",
        state: "refused",
        format: "error-json",
        kinds: [],
      },
      operationId,
      modeId: "json",
      fixtureId: "loopback-auth-v1",
      description:
        "JSON is an explicitly unsupported credential-output mode; verify secret-free refusal",
      prepare: async (context) => {
        const server = await authFixture(context, true);
        return {
          args: [
            ...operationId.split(" "),
            ...(operationId === "token create" ? ["benchmark-issued", "--permission", "read"] : []),
            "--json",
            "--non-interactive",
          ],
          env: { AXM_TOKEN: tokenSecret },
          expectedExitCode: 2,
          dispose: server.close,
          metrics: () => ({ requests: server.requests.length }),
          verify: (result) => {
            assertOutput(result, "--plain");
            if ((result.stdout + result.stderr).includes(tokenSecret))
              throw new Error("Unsupported output leaked a fixture secret");
          },
        };
      },
    });
  }
  return scenarios;
};
