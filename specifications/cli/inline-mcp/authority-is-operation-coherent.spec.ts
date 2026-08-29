import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { getAppError, handleMcpsAdd, handleSync } from "axm.sh/unstable/specification-harness";

import { defineSpecification } from "../../support/contract.js";
import { makeSpecWorkspace } from "../../support/install-harness.js";

export const specification = defineSpecification({
  requirement: "cli/inline-mcp/authority-is-operation-coherent",
  title: "Inline MCP entries stay authoritative workspace configuration realized only by sync",
  class: "functional",
  intents: ["workspace-intent-fidelity", "agent-interoperability", "actionable-diagnostics"],
  methods: ["example", "decision-table"],
  cases: {
    "round-trip-preserves-authored-form":
      "a settings change preserves the authored form of untouched inline entries",
    "sync-projects-supported-agents": "sync reconciles inline entries into agent configuration",
    "no-lock-row": "inline entries never gain a lock row",
    "disabled-not-projected": "a disabled inline entry is not projected into agent configuration",
  },
});

/** Authored inline entries exactly as a person would write them in `axm.json`. */
const authoredInlineEntries = {
  "local-tool": { command: "echo", args: ["local-tool"] },
  "remote-tool": { url: "https://example.test/mcp" },
  "muted-tool": { command: "echo muted", enabled: false },
} as const;

const readInlineEntry = (settings: unknown, name: string): unknown => {
  if (typeof settings !== "object" || settings === null || !("mcpServers" in settings)) {
    return undefined;
  }
  const servers = settings.mcpServers;
  if (typeof servers !== "object" || servers === null) {
    return undefined;
  }
  return Object.entries(servers).find(([entryName]) => entryName === name)?.[1];
};

describe("Inline MCP configuration authority", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) {
      cleanup();
    }
  });

  const inlineWorkspace = () => {
    const workspace = makeSpecWorkspace({
      machine: true,
      flags: { json: true },
      settings: { mcps: { ...authoredInlineEntries } },
    });
    cleanups.push(workspace.cleanup);
    return workspace;
  };

  it.effect("a settings change preserves the authored form of untouched inline entries", () =>
    Effect.gen(function* () {
      const workspace = inlineWorkspace();

      yield* handleMcpsAdd({
        name: "companion",
        command: Option.some("node companion.js"),
        url: Option.none(),
        env: [],
        header: [],
        yes: true,
        force: false,
        preview: false,
      }).pipe(Effect.provide(workspace.layer));

      const settings = workspace.readSettings();
      for (const [name, authored] of Object.entries(authoredInlineEntries)) {
        expect(JSON.stringify(readInlineEntry(settings, name))).toBe(JSON.stringify(authored));
      }
      // The new entry is a command object as well — no fabricated source.
      expect(readInlineEntry(settings, "companion")).toMatchObject({ command: "node" });
      expect(JSON.stringify(readInlineEntry(settings, "companion"))).not.toContain("source");
    }),
  );

  it.effect("sync reconciles inline entries into agent configuration", () =>
    Effect.gen(function* () {
      const workspace = inlineWorkspace();

      yield* handleSync({ preview: false }).pipe(Effect.provide(workspace.layer));

      const nativeConfig: unknown = JSON.parse(workspace.readFile(".mcp.json"));
      expect(nativeConfig).toMatchObject({
        mcpServers: {
          "local-tool": expect.objectContaining({ command: "echo", args: ["local-tool"] }),
          "remote-tool": expect.objectContaining({ url: "https://example.test/mcp" }),
        },
      });
    }),
  );

  it.effect("inline entries never gain a lock row", () =>
    Effect.gen(function* () {
      const workspace = inlineWorkspace();

      yield* handleSync({ preview: false }).pipe(Effect.provide(workspace.layer));

      const lockfile = workspace.readLockfileText();
      expect(lockfile).not.toContain("local-tool");
      expect(lockfile).not.toContain("remote-tool");
      expect(lockfile).not.toContain("muted-tool");
    }),
  );

  it.effect("a disabled inline entry is not projected into agent configuration", () =>
    Effect.gen(function* () {
      const workspace = inlineWorkspace();

      yield* handleSync({ preview: false }).pipe(Effect.provide(workspace.layer));

      expect(workspace.readFile(".mcp.json")).not.toContain("muted-tool");
      // The disabled entry stays authored configuration, exactly as written.
      expect(JSON.stringify(readInlineEntry(workspace.readSettings(), "muted-tool"))).toBe(
        JSON.stringify(authoredInlineEntries["muted-tool"]),
      );
    }),
  );

  const invalidEntryRows = [
    { label: "an entry with no source, command, or url", entry: {} },
    {
      label: "an entry with both command and url",
      entry: { command: "echo x", url: "https://example.test/mcp" },
    },
    {
      label: "an entry with both source and command",
      entry: { source: "@acme/mcps/tool@^1.0.0", command: "echo x" },
    },
    {
      label: "an entry with both source and url",
      entry: { source: "@acme/mcps/tool@^1.0.0", url: "https://example.test/mcp" },
    },
  ] as const;

  it.effect.each(invalidEntryRows)(
    "$label is rejected before planning without touching the workspace",
    (row) =>
      Effect.gen(function* () {
        const workspace = makeSpecWorkspace({
          machine: true,
          flags: { json: true },
          settings: { mcps: { broken: row.entry } },
        });
        cleanups.push(workspace.cleanup);
        const settingsBefore = workspace.readFile("axm.json");
        const lockBefore = workspace.readLockfileText();

        const failure = yield* handleSync({ preview: false }).pipe(
          Effect.provide(workspace.layer),
          Effect.flip,
        );

        const error = getAppError(failure);
        expect(error.detail).toContain("exactly one of source, command, or url");
        expect(workspace.rendererState.results).toEqual([]);
        expect(workspace.readFile("axm.json")).toBe(settingsBefore);
        expect(workspace.readLockfileText()).toBe(lockBefore);
        expect(workspace.exists(".mcp.json")).toBe(false);
      }),
  );
});
