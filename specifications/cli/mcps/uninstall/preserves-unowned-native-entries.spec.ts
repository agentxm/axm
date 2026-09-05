import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import * as fs from "node:fs";
import * as path from "node:path";

import { handleMcpsAdd, handleUninstallMcpServer } from "axm.sh/specification-harness";

import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import { makeSpecWorkspace } from "../../../support/install-harness.js";

export const specification = defineSpecification({
  requirement: "cli/mcps/uninstall/preserves-unowned-native-entries",
  title: "Uninstalling an MCP server preserves native entries AXM does not own",
  statement:
    "When an MCP server is uninstalled, AXM shall remove that server's configuration from axm.json and its projection from every agent's native configuration, and shall preserve every native entry it does not own.",
  class: "functional",
  role: "experience",
  goals: ["workspace-intent-fidelity"],
  methods: ["example"],
  derivedFrom: ["cli/mcps/inline-lifecycle-is-idempotent"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Uninstall an MCP server beside unowned native entries", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) {
      cleanup();
    }
  });

  const addUnownedNativeEntry = (workspace: ReturnType<typeof makeSpecWorkspace>) => {
    const config: unknown = JSON.parse(workspace.readFile(".mcp.json"));
    if (typeof config !== "object" || config === null || !("mcpServers" in config)) {
      throw new Error("Expected .mcp.json with an mcpServers map");
    }
    const servers = config.mcpServers;
    if (typeof servers !== "object" || servers === null) {
      throw new Error("Expected the mcpServers map to be an object");
    }
    const next = {
      ...config,
      mcpServers: { ...servers, keep: { command: "node", args: ["keep.js"] } },
    };
    fs.writeFileSync(path.join(workspace.root, ".mcp.json"), `${JSON.stringify(next, null, 2)}\n`);
  };

  it.effect(
    "uninstalling removes the configuration and its projection while preserving unowned entries",
    () =>
      Effect.gen(function* () {
        const workspace = makeSpecWorkspace({ machine: true, flags: { json: true } });
        cleanups.push(workspace.cleanup);
        yield* handleMcpsAdd({
          name: "demo",
          command: Option.some("node server.js"),
          url: Option.none(),
          env: [],
          header: [],
          force: false,
          preview: false,
        }).pipe(Effect.provide(workspace.layer));
        addUnownedNativeEntry(workspace);

        yield* handleUninstallMcpServer({ serverName: "demo" }, { preview: false }).pipe(
          Effect.provide(workspace.layer),
        );

        expect(JSON.stringify(workspace.readSettings())).not.toContain('"demo"');
        const nativeConfig: unknown = JSON.parse(workspace.readFile(".mcp.json"));
        expect(nativeConfig).toMatchObject({
          mcpServers: { keep: { command: "node", args: ["keep.js"] } },
        });
        expect(JSON.stringify(nativeConfig)).not.toContain('"demo"');
      }),
  );
});
