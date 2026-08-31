import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { handleInstall } from "axm.sh/specification-harness";

import { defineSpecification } from "../../support/contract.js";
import { makeSpecWorkspace } from "../../support/install-harness.js";

export const specification = defineSpecification({
  requirement: "cli/install/inline-mcp-configuration-not-acquirable",
  title: "Workspace install treats inline MCP configuration as sync-owned, not acquirable",
  class: "functional",
  role: "experience",
  goals: ["workspace-intent-fidelity", "actionable-diagnostics"],
  methods: ["example"],
});

describe("Inline MCP configuration during workspace install", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) {
      cleanup();
    }
  });

  it.effect("reports the inline entry as not applicable without failing or locking it", () =>
    Effect.gen(function* () {
      const workspace = makeSpecWorkspace({
        machine: true,
        flags: { json: true },
        settings: {
          mcps: { "local-tool": { command: "echo local-tool" } },
        },
      });
      cleanups.push(workspace.cleanup);

      yield* handleInstall({
        source: Option.none(),
        yes: true,
        force: false,
        preview: false,
      }).pipe(Effect.provide(workspace.layer));

      const [entry] = workspace.rendererState.results;
      expect(entry).toBeDefined();
      const rendered = JSON.stringify(entry?.data);
      expect(rendered).toContain("local-tool");
      expect(rendered).toContain("sync");

      expect(workspace.readLockfileText()).not.toContain("local-tool");
      const settings = workspace.readSettings();
      expect(settings).toMatchObject({
        mcpServers: { "local-tool": { command: "echo local-tool" } },
      });
    }),
  );
});
