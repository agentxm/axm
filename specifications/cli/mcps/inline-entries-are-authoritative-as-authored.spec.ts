import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { handleMcpsAdd, handleSync } from "axm.sh/specification-harness";

import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import { makeSpecWorkspace } from "../../support/install-harness.js";

export const specification = defineSpecification({
  requirement: "cli/mcps/inline-entries-are-authoritative-as-authored",
  title: "Inline MCP entries stay authoritative exactly as authored",
  statement:
    "An inline MCP entry authored in axm.json shall remain the authoritative configuration exactly as written through MCP operations and sync, and shall never gain an accepted resolution.",
  class: "functional",
  role: "experience",
  goals: ["workspace-intent-fidelity"],
  methods: ["example"],
  derivedFrom: ["cli/mcps/inline-authority-is-operation-coherent"],
  supersedes: ["cli/mcps/inline-authority-is-operation-coherent"],
  assumptions: [],
  openQuestions: [],
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

const expectAuthoredFormPreserved = (settings: unknown): void => {
  for (const [name, authored] of Object.entries(authoredInlineEntries)) {
    expect(JSON.stringify(readInlineEntry(settings, name))).toBe(JSON.stringify(authored));
  }
};

describe("Inline MCP entries are authoritative as authored", () => {
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

  it.effect("adding another server preserves the authored form of every untouched entry", () =>
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
      expectAuthoredFormPreserved(settings);
      // The new entry is a command object as well — no fabricated source.
      expect(readInlineEntry(settings, "companion")).toMatchObject({ command: "node" });
      expect(JSON.stringify(readInlineEntry(settings, "companion"))).not.toContain("source");
    }),
  );

  it.effect("sync preserves the authored form of every entry, disabled ones included", () =>
    Effect.gen(function* () {
      const workspace = inlineWorkspace();

      yield* handleSync({ preview: false }).pipe(Effect.provide(workspace.layer));

      expectAuthoredFormPreserved(workspace.readSettings());
    }),
  );

  it.effect("inline entries never gain an accepted resolution", () =>
    Effect.gen(function* () {
      const workspace = inlineWorkspace();

      yield* handleSync({ preview: false }).pipe(Effect.provide(workspace.layer));

      const lockfile = workspace.readLockfileText();
      expect(lockfile).not.toContain("local-tool");
      expect(lockfile).not.toContain("remote-tool");
      expect(lockfile).not.toContain("muted-tool");
    }),
  );
});
