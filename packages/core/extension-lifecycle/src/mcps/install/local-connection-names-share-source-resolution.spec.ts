import * as Effect from "effect/Effect";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";
import YAML from "yaml";

import { defineSpecification } from "@agentxm/specification-metadata";

import {
  applyInstall,
  installRequest,
  makeInstallWorld,
  readSettings,
  type InstallWorld,
} from "../../install/test-helpers.js";

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

  const setup = (): InstallWorld => {
    const world = makeInstallWorld();
    cleanups.push(world.cleanup);
    world.registry.writeMcp("context", [{ version: "1.0.0" }]);
    return world;
  };

  /** The request `axm mcps install <source> --as <name>` builds. */
  const install = (source: string, localName: string) =>
    applyInstall(
      installRequest({
        type: "mcp-server",
        subject: { kind: "source", source },
        localName,
      }),
    );

  it.effect("records two local settings entries and one accepted source resolution", () => {
    const { workspace } = setup();
    return workspace
      .provide(
        Effect.gen(function* () {
          yield* install("@acme/mcps/context", "work-context");
          yield* install("@acme/mcps/context", "personal-context");

          expect(readSettings(workspace)).toMatchObject({
            mcpServers: {
              "work-context": "agentxm:@acme/mcps/context",
              "personal-context": "agentxm:@acme/mcps/context",
            },
          });
          const lockfile: unknown = YAML.parse(workspace.readFile("axm-lock.yaml"));
          expect(lockfile).toMatchObject({ lockfileVersion: 7 });
          if (typeof lockfile !== "object" || lockfile === null || !("mcpServers" in lockfile)) {
            throw new Error("Expected an MCP resolution map");
          }
          expect(Object.keys(lockfile.mcpServers ?? {})).toHaveLength(1);
        }),
      )
      .pipe(Effect.provide(NodeServices.layer));
  });

  it.effect("uses each local name verbatim as the agent-native MCP key", () => {
    const { workspace } = setup();
    return workspace
      .provide(
        Effect.gen(function* () {
          yield* install("@acme/mcps/context", "work-context");
          yield* install("@acme/mcps/context", "personal-context");

          const projection: unknown = JSON.parse(workspace.readFile(".mcp.json"));
          expect(projection).toMatchObject({
            mcpServers: {
              "work-context": expect.anything(),
              "personal-context": expect.anything(),
            },
          });
        }),
      )
      .pipe(Effect.provide(NodeServices.layer));
  });
});
