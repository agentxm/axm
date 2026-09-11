import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { afterEach } from "vitest";

import { defineSpecification } from "@agentxm/specification-metadata";
import { McpServerManifestSchema } from "@agentxm/extension-model/unstable/mcps/manifest-schema";

import { CreateExtension } from "../../create/create-extension.js";
import {
  applyExecution,
  authoringWorkspaceLayer,
  makeAuthoringWorkspace,
} from "../../test-support/authoring-workspace.js";

export const specification = defineSpecification({
  requirement: "cli/mcps/new/creates-enabled-workspace-content",
  title: "Creating an MCP server records editable workspace content",
  statement:
    "When a person runs mcps new, AXM shall create its type-specific manifest and starter content in the workspace authoring directory and register it as enabled workspace-authored content with the supplied authoring options.",
  class: "functional",
  role: "experience",
  goals: ["authoring-and-creation", "workspace-intent-fidelity"],
  methods: ["example"],
  boundary: "memory",
  boundaryRationale:
    "The manifest, the declaration, and the connection's projection are all written by the creation use case over the workspace-state services; a real project directory observes each one.",
  derivedFrom: ["packages/core/extension-authoring/src/create/scaffolds/mcp-server.ts"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Creating an MCP server", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  it.effect("creates editable content and an enabled workspace declaration", () =>
    Effect.gen(function* () {
      const created = makeAuthoringWorkspace({ owner: "@acme", agents: ["claude-code"] });
      cleanups.push(created.cleanup);

      yield* Effect.gen(function* () {
        const candidate = yield* CreateExtension.prepare({
          type: "mcp-server",
          name: "review",
          owner: Option.none(),
          description: Option.some("Workspace server"),
          nonInteractive: true,
        });
        return yield* CreateExtension.previewOrApply(candidate, applyExecution);
      }).pipe(Effect.provide(authoringWorkspaceLayer(created)));

      const manifest = Schema.decodeUnknownSync(McpServerManifestSchema)(
        JSON.parse(created.read("mcps/review/mcp.json") ?? "null"),
      );
      expect(manifest).toMatchObject({
        owner: "@acme",
        type: "mcp-server",
        name: "review",
        description: "Workspace server",
        server: {
          description: "Workspace server",
          packages: [expect.objectContaining({ transport: { type: "stdio" } })],
        },
      });
      expect(created.settings()).toMatchObject({ mcpServers: { review: "workspace" } });
      expect(JSON.stringify(created.settings())).not.toContain('"enabled":false');
    }),
  );
});
