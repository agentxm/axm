import * as path from "node:path";
import * as fs from "node:fs/promises";
import { startDeviceAuthServer } from "@agentxm/client-e2e-utils/registry";
import * as Schema from "effect/Schema";
import {
  assertOutput,
  assertSuccessful,
  writeJson,
  type BenchmarkScenario,
  type ScenarioContext,
} from "./fixtures.js";

const tokenId = "tok_01h455vb4pexka56gq5w2r7cpc";
const tokenSecret = "axm_pat_disposable_benchmark";
const tokenCreated = "2026-01-01T00:00:00.000Z";
const tokenExpires = "2099-01-01T00:00:00.000Z";
// Exercise restricted-file persistence in the disposable home, never a host keychain.
const persistedAuthEnvironment = { CI: "", SSH_CONNECTION: "benchmark" };
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
  const server = await startDeviceAuthServer(
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
            if (operationId !== "login") {
              assertSuccessful(
                await context.run(
                  [
                    "login",
                    "--device-code",
                    "--wait-for-human",
                    "5",
                    "--json",
                    "--non-interactive",
                  ],
                  { env: persistedAuthEnvironment },
                ),
              );
            }
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
              verify: (result) => {
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
          const pendingFile = path.join(context.home, ".axm", "pending-login.json");
          try {
            if (flow !== "approved-new") {
              assertSuccessful(
                await context.run(
                  [
                    "login",
                    "--device-code",
                    ...(retained ? ["--wait-for-human", "5"] : []),
                    "--json",
                    "--non-interactive",
                  ],
                  { env: persistedAuthEnvironment },
                ),
              );
            }
            const pendingBefore = pending ? await fs.readFile(pendingFile, "utf8") : undefined;
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
                  server.requests
                    .slice(requestsBefore)
                    .some((request) => request.path === "/v1/auth/device/code")
                )
                  throw new Error("Resuming sign-in created an unrelated device authorization");
                if (pending) {
                  if ((await fs.readFile(pendingFile, "utf8")) !== pendingBefore)
                    throw new Error("Pending sign-in reuse changed its authorization");
                } else {
                  if (
                    await fs.stat(pendingFile).then(
                      () => true,
                      (error: unknown) => {
                        if (error instanceof Error && "code" in error && error.code === "ENOENT")
                          return false;
                        throw error;
                      },
                    )
                  )
                    throw new Error("Settled device authorization was not removed");
                  if (!expired) {
                    const stored = await context.run(
                      ["token", "show", "--plain", "--non-interactive"],
                      { env: persistedAuthEnvironment },
                    );
                    assertSuccessful(stored);
                    if (stored.stdout !== "axm_ses_e2e\n")
                      throw new Error("Approved session was not persisted across processes");
                  }
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
