import { fixtureFailure } from "./observability-contract.js";
/** Successful authentication against the shared loopback Registry protocol fixture. */
import * as fs from "node:fs";
import * as path from "node:path";
import * as Effect from "effect/Effect";
import { startDeviceAuthServer } from "@agentxm/test-support/auth-server";
import type {
  IndependentWorkExpectation,
  ObservabilityScenario,
  PrepareInvocation,
  WorkspaceTemplate,
} from "./observability-fixtures.js";

export const prepareAuthObservabilityFixtures = Effect.fnUntraced(function* (options: {
  readonly root: string;
  readonly base: WorkspaceTemplate;
  readonly invoke: PrepareInvocation;
  readonly copy: (source: WorkspaceTemplate, destination: string) => WorkspaceTemplate;
}) {
  const server = yield* Effect.acquireRelease(startDeviceAuthServer("approved"), (server) =>
    server.close.pipe(Effect.orDie),
  );
  const anonymous = options.copy(options.base, path.join(options.root, "anonymous"));
  fs.writeFileSync(
    path.join(anonymous.workspace, "axm.json"),
    JSON.stringify({
      owner: "@alice",
      agents: ["claude-code"],
      defaultRegistry: "auth",
      sources: [{ name: "auth", type: "registry", location: server.url }],
    }) + "\n",
  );
  const condition = {
    source: "local",
    extensions: 0,
    cache: "not-applicable",
    network: "baseline",
    archiveBodyDelayMillis: 0,
  } as const;
  const cases = [
    {
      command: "login",
      args: ["login", "--device-code", "--wait-for-human", "5"],
      template: anonymous,
    },
    { command: "whoami", args: ["whoami"], template: anonymous },
    {
      command: "token show",
      args: ["token", "show", "--plain"],
      json: false,
      template: anonymous,
    },
    {
      command: "token create",
      args: [
        "token",
        "create",
        "fixture-token",
        "--permission",
        "read",
        "--owner",
        "@alice",
        "--plain",
      ],
      json: false,
      template: anonymous,
    },
    { command: "token list", args: ["token", "list"], template: anonymous },
    {
      command: "token revoke",
      args: ["token", "revoke", server.seededTokenId],
      template: anonymous,
    },
    { command: "logout", args: ["logout"], template: anonymous },
  ];
  return cases.map((item): ObservabilityScenario => ({
    ...item,
    id: "auth/" + item.command.replaceAll(" ", "-"),
    condition,
    environment: { CI: "0" },
    // A copied home does not isolate a native keychain. Clear only this
    // ephemeral Registry's session, then restore the owned sample home so
    // sign-out's refresh-lock file cannot change the measured starting state.
    // Preparation is outside timing and the server request reset below.
    prepare: (fixture, invoke) =>
      Effect.gen(function* () {
        yield* invoke(fixture, ["logout"], { environment: { CI: "0" } });
        yield* Effect.sync(() => {
          fs.rmSync(fixture.home, { recursive: true, force: true });
          fs.cpSync(anonymous.home, fixture.home, {
            recursive: true,
            verbatimSymlinks: true,
            preserveTimestamps: true,
          });
        });
        if (item.command !== "login")
          yield* invoke(fixture, ["login", "--device-code", "--wait-for-human", "5"], {
            environment: { CI: "0" },
          });
      }),
    external: { reset: server.reset, snapshot: server.snapshot },
    requests: () =>
      server.requests().map((request) => ({
        startedAtMs: 0,
        finishedAtMs: 0,
        key: request.method + " " + request.pathname,
        status: request.status,
        responseBytes: request.responseBytes,
        archiveBody: false,
      })),
    workExpectations: () => {
      const counts = new Map<string, number>();
      for (const request of server.requests()) {
        const key = request.method + " " + request.pathname;
        const purpose =
          key === "POST /v1/auth/device/code"
            ? "device-authorization"
            : key === "POST /v1/auth/token"
              ? "device-token"
              : key === "POST /v1/auth/revoke"
                ? "token-revoke"
                : key === "GET /v1/auth/me"
                  ? "identity"
                  : key === "GET /v1/tokens"
                    ? "token-list"
                    : key === "POST /v1/tokens"
                      ? "token-create"
                      : request.method === "DELETE" &&
                          request.pathname === "/v1/tokens/" + server.seededTokenId
                        ? "token-delete"
                        : undefined;
        if (purpose === undefined)
          throw fixtureFailure("Authentication fixture observed an unmapped protocol operation.");
        counts.set(purpose, (counts.get(purpose) ?? 0) + 1);
      }
      const expected: IndependentWorkExpectation[] = [
        {
          kind: "axm.auth.request",
          count: server.requests().length,
          requested: server.requests().length,
          executed: server.requests().length,
        },
        ...[...counts].map(([purpose, count]) => ({
          kind: "axm.auth.request",
          dimensions: { "axm.auth.purpose": purpose },
          count,
          requested: count,
          executed: count,
          ...(item.command === "whoami"
            ? { ownerName: "axm.cli.operation", ownerAttributes: { "axm.operation.mode": "query" } }
            : {}),
        })),
      ];
      return expected;
    },
    verify: () =>
      Effect.sync(() => {
        const requests = server.requests();
        const tokens = server.snapshot().tokens;
        const require = (condition: boolean, message: string) => {
          if (!condition) throw fixtureFailure(message);
        };
        if (item.command === "login")
          require(requests.some(
            (request) => request.pathname === "/v1/auth/token" && request.status === 200,
          ), "Successful device grant was not observed.");
        if (item.command === "token create")
          require(tokens.length === 2 &&
            tokens[0]?.name ===
              "fixture-token", "Token creation did not change the independent Registry inventory.");
        if (item.command === "token revoke")
          require(!tokens.some(
            (token) => token.id === server.seededTokenId,
          ), "Token revocation did not remove the seeded token.");
        if (item.command === "whoami")
          require(requests.some(
            (request) => request.pathname === "/v1/auth/me" && request.status === 200,
          ), "Identity was not retrieved through the authenticated protocol.");
        return {
          assertions: [
            "Real compiled CLI completed the selected authentication operation against the loopback Registry; independent request and token-state records retained.",
          ],
        };
      }),
  }));
});
