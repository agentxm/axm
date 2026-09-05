import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { handleInstallMcpServer } from "axm.sh/specification-harness";

import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import { makeSpecWorkspace } from "../../support/install-harness.js";
import { makeSpecRegistry } from "../../support/registry-fixture.js";

export const specification = defineSpecification({
  requirement: "cli/mcps/secret-namespaces-include-local-and-source-identity",
  title: "MCP secrets stay in a per-connection keychain namespace and out of workspace files",
  statement:
    "When a locally named MCP connection is installed with a secret input, AXM shall keep the secret in the system keychain under a namespace unique to the workspace, the local connection name, the source, and the input name, and shall write the secret value into neither axm.json, any agent's native configuration, nor the reported result.",
  class: "quality",
  characteristic: "security",
  role: "supporting",
  goals: ["workspace-intent-fidelity", "safe-repetition"],
  methods: ["example"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [
    "The specification runtime has no system keychain, so the keychain write is reported as failed while the workspace files and the reported result remain observable.",
  ],
  openQuestions: [],
  limitations: [
    {
      limitation:
        "In-memory execution cannot observe the system keychain, so the namespace under which each connection's secret is kept is not evidenced here; the derivation is verified by an internal test beside the deriving module.",
      retirementCondition:
        "The specification harness composes an observable secret store whose namespaces specifications can read.",
    },
  ],
});

const SOURCE = "@acme/mcps/context";
const SECRET_INPUT = "API_TOKEN";

const connections = [
  { localName: "work-context", secret: "work-secret-value" },
  { localName: "personal-context", secret: "personal-secret-value" },
] as const;

describe("MCP secrets for locally named connections", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  const installBoth = () =>
    Effect.gen(function* () {
      const registry = makeSpecRegistry();
      registry.writeMcp("context", [{ version: "1.0.0", secretInput: SECRET_INPUT }]);
      const workspace = makeSpecWorkspace({
        machine: true,
        flags: { json: true },
        settings: { sources: [registry.source] },
      });
      cleanups.push(workspace.cleanup, registry.cleanup);
      for (const connection of connections) {
        yield* handleInstallMcpServer(
          {
            source: Option.some(SOURCE),
            localName: Option.some(connection.localName),
            env: [`${SECRET_INPUT}=${connection.secret}`],
          },
          { force: false, preview: false },
        ).pipe(Effect.provide(workspace.layer));
      }
      return workspace;
    });

  it.effect("writes no connection's secret value into axm.json", () =>
    Effect.gen(function* () {
      const workspace = yield* installBoth();

      const settings = workspace.readFile("axm.json");
      expect(workspace.readSettings()).toMatchObject({
        mcpServers: {
          "work-context": expect.anything(),
          "personal-context": expect.anything(),
        },
      });
      for (const connection of connections) {
        expect(settings).not.toContain(connection.secret);
      }
    }),
  );

  it.effect("projects a secret reference, never the value, for every connection", () =>
    Effect.gen(function* () {
      const workspace = yield* installBoth();

      const nativeConfig = workspace.readFile(".mcp.json");
      expect(JSON.parse(nativeConfig)).toMatchObject({
        mcpServers: {
          "work-context": expect.anything(),
          "personal-context": expect.anything(),
        },
      });
      expect(nativeConfig).toContain(`\${${SECRET_INPUT}}`);
      for (const connection of connections) {
        expect(nativeConfig).not.toContain(connection.secret);
      }
    }),
  );

  it.effect("reports the keychain outcome for each connection without the secret value", () =>
    Effect.gen(function* () {
      const workspace = yield* installBoth();

      const results = JSON.stringify(workspace.rendererState.results.map((entry) => entry.data));
      expect(results).toContain(`${SECRET_INPUT} could not be saved to the system keychain`);
      for (const connection of connections) {
        expect(results).not.toContain(connection.secret);
      }
    }),
  );
});
