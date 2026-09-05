import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";
import YAML from "yaml";

import { handleInstallMcpServer } from "axm.sh/specification-harness";

import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import { makeSpecWorkspace } from "../../../support/install-harness.js";
import { makeSpecRegistry } from "../../../support/registry-fixture.js";

export const specification = defineSpecification({
  requirement: "cli/mcps/install/local-connection-names-share-source-resolution",
  title: "One registry MCP source supports multiple independently named local connections",
  statement:
    "Installing a Registry MCP server under a local name with --as shall add one connection per name, sharing one accepted resolution per source, and shall use each local name verbatim as the agent-native key.",
  class: "functional",
  role: "experience",
  goals: ["extension-adoption", "workspace-intent-fidelity", "agent-interoperability"],
  methods: ["example"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Install locally named MCP connections", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  const setup = () => {
    const registry = makeSpecRegistry();
    registry.writeMcp("context", [{ version: "1.0.0" }]);
    const workspace = makeSpecWorkspace({ settings: { sources: [registry.source] } });
    cleanups.push(workspace.cleanup, registry.cleanup);
    return { workspace };
  };

  const install = (
    workspace: ReturnType<typeof makeSpecWorkspace>,
    source: string,
    localName: string,
  ) =>
    handleInstallMcpServer(
      {
        source: Option.some(source),
        localName: Option.some(localName),
        env: [],
      },
      { yes: true, force: false, preview: false },
    ).pipe(Effect.provide(workspace.layer));

  it.effect("records two local settings entries and one accepted source resolution", () =>
    Effect.gen(function* () {
      const { workspace } = setup();

      yield* install(workspace, "@acme/mcps/context", "work-context");
      yield* install(workspace, "@acme/mcps/context", "personal-context");

      expect(workspace.readSettings()).toMatchObject({
        mcpServers: {
          "work-context": "agentxm:@acme/mcps/context",
          "personal-context": "agentxm:@acme/mcps/context",
        },
      });
      const lockfile: unknown = YAML.parse(workspace.readLockfileText());
      expect(lockfile).toMatchObject({ lockfileVersion: 7 });
      if (typeof lockfile !== "object" || lockfile === null || !("mcpServers" in lockfile)) {
        throw new Error("Expected an MCP resolution map");
      }
      expect(Object.keys(lockfile.mcpServers ?? {})).toHaveLength(1);
    }),
  );

  it.effect("uses each local name verbatim as the agent-native MCP key", () =>
    Effect.gen(function* () {
      const { workspace } = setup();

      yield* install(workspace, "@acme/mcps/context", "work-context");
      yield* install(workspace, "@acme/mcps/context", "personal-context");

      const projection: unknown = JSON.parse(workspace.readFile(".mcp.json"));
      expect(projection).toMatchObject({
        mcpServers: {
          "work-context": expect.anything(),
          "personal-context": expect.anything(),
        },
      });
    }),
  );
});
