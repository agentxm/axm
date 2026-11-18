import * as nodePath from "node:path";

import { afterEach, describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import type { McpServerExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/mcp-server";
import { materializeAuthoredMcpServer } from "@agentxm/extension-kinds/mcp-connections";
import { FileSystemRecorder } from "@agentxm/test-support";
import { McpServerManager } from "@agentxm/workspace-kernel/materialization";

import { authoringTypeFor, writeAuthoringPackage } from "./test-support/authoring-packages.js";
import { applyExecution, makeAuthoringWorkspace } from "./test-support/authoring-workspace.js";
import { recordingAuthoringWorkspaceLayer } from "./test-support/recording-authoring-workspace.js";
import { ForkExtension } from "./fork/fork-extension.js";

/**
 * An install that the authored declaration did not just precede must still
 * set an unchanged MCP entry, because only that publication normalizes an
 * `axm.json` a person wrote in a form the settings writer would not.
 */
describe("MCP install of an unchanged entry over a non-normalized axm.json", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  /** The one distribution the package offers, as install selects and publishes it. */
  const selected = {
    kind: "package",
    registryType: "npm",
    registryBaseUrl: "https://registry.npmjs.org",
    identifier: "@acme/original",
    runtimeHint: "npx",
    transport: "stdio",
  } as const;

  const settingsWith = (entry: Readonly<Record<string, unknown>>) => ({
    owner: "@acme",
    agents: ["claude-code"],
    instructionFiles: {},
    mcpServers: { custom: entry },
  });

  const text = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;

  /**
   * Author `custom` as a workspace MCP server, rewrite its entry with the
   * default activation spelled out, then run `install` against it and measure
   * the settings publications.
   */
  const installedOverVerboseEntry = <E, R>(
    install: (ref: McpServerExtensionRef) => Effect.Effect<unknown, E, R>,
  ) => {
    const created = makeAuthoringWorkspace({ owner: "@acme", agents: ["claude-code"] });
    cleanups.push(created.cleanup);
    created.writeSettings(settingsWith({ distribution: selected }));
    const source = writeAuthoringPackage(created.root, authoringTypeFor("mcp-server"), "original");
    const settingsPath = nodePath.join(created.root, "axm.json");
    return Effect.gen(function* () {
      const candidate = yield* ForkExtension.prepare({
        source,
        target: "@acme/mcps/custom",
        from: Option.none(),
        enable: true,
        nonInteractive: true,
      });
      yield* ForkExtension.previewOrApply(candidate, applyExecution);
      const normalized = created.read("axm.json");
      // The same entry, with the activation the settings writer leaves implicit.
      created.write(
        "axm.json",
        text(settingsWith({ distribution: selected, source: "workspace", enabled: true })),
      );
      const manager = yield* McpServerManager;
      const ref = (yield* manager.listMaterializable()).find(
        (candidateRef) => candidateRef.refType === "workspace" && candidateRef.name === "custom",
      );
      expect(ref).toBeDefined();
      if (ref === undefined) return yield* Effect.die("The authored server is not materializable");
      const recording = yield* FileSystemRecorder;
      recording.reset();
      yield* install(ref);
      return {
        normalized,
        settings: created.read("axm.json"),
        publications: recording
          .calls({ method: "rename" })
          .filter((call) => call.toPath === settingsPath).length,
      };
    }).pipe(Effect.scoped, Effect.provide(recordingAuthoringWorkspaceLayer(created)));
  };

  const normalizedEntry = text(settingsWith({ distribution: selected, source: "workspace" }));

  it.effect("normalizes it on the authored materialization that leaves the option unset", () =>
    Effect.gen(function* () {
      const measured = yield* installedOverVerboseEntry((ref) =>
        materializeAuthoredMcpServer({ ref, nonInteractive: true }),
      );
      expect(measured.normalized).toBe(normalizedEntry);
      expect(measured.settings).toBe(normalizedEntry);
      expect(measured.publications).toBe(1);
    }),
  );

  it.effect("normalizes it on the reconciliation install of a declared server", () =>
    Effect.gen(function* () {
      const measured = yield* installedOverVerboseEntry((ref) =>
        Effect.gen(function* () {
          const manager = yield* McpServerManager;
          return yield* manager.installConnection({
            name: "install-mcp-server",
            args: { ref, nonInteractive: true, force: false },
          });
        }),
      );
      expect(measured.normalized).toBe(normalizedEntry);
      expect(measured.settings).toBe(normalizedEntry);
      expect(measured.publications).toBe(1);
    }),
  );
});
