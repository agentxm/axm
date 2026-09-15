import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { defineSpecification } from "@agentxm/specification-metadata";
import { decodeAbsolutePathSync } from "@agentxm/extension-model/unstable/path-types";

import { layer as WorkspaceStateOverProject } from "../live.js";
import { DesiredStateReader } from "../workspace/desired-state-reader.js";
import { SettingsWriter } from "../workspace/settings-writer.js";

export const specification = defineSpecification({
  requirement: "cli/mcps/inline-entries-are-authoritative-as-authored",
  title: "Inline MCP entries stay authoritative exactly as authored",
  statement:
    "An inline MCP entry authored in axm.json shall remain the authoritative configuration exactly as written when other entries are changed, shall be carried as inline authority in desired state, and shall never gain an accepted resolution.",
  class: "functional",
  role: "experience",
  goals: ["workspace-intent-fidelity"],
  methods: ["example"],
  derivedFrom: [
    "cli/mcps/inline-authority-is-operation-coherent",
    // Reconciliation over the same authored entries — the authored form
    // surviving a sync, and the entries reaching every agent unchanged — is
    // exercised by cli/mcps/projects-to-every-configured-agent.
    "cli/mcps/projects-to-every-configured-agent",
  ],
  supersedes: ["cli/mcps/inline-authority-is-operation-coherent"],
  assumptions: [],
  openQuestions: [],
});

/** Authored inline entries exactly as a person would write them in `axm.json`. */
const authoredInlineEntries = {
  "local-tool": { command: "echo", args: ["local-tool"] },
  "remote-tool": { url: "https://example.test/mcp" },
  // The command string is left unsplit on purpose: nothing may normalize it.
  "muted-tool": { command: "echo muted", enabled: false },
} as const;

const readInlineEntry = (settings: unknown, name: string): unknown => {
  if (typeof settings !== "object" || settings === null || !("mcpServers" in settings)) {
    return undefined;
  }
  const servers = settings.mcpServers;
  if (typeof servers !== "object" || servers === null) return undefined;
  return Object.entries(servers).find(([entryName]) => entryName === name)?.[1];
};

const expectAuthoredFormPreserved = (settings: unknown): void => {
  for (const [name, authored] of Object.entries(authoredInlineEntries)) {
    expect(JSON.stringify(readInlineEntry(settings, name)), name).toBe(JSON.stringify(authored));
  }
};

/** A workspace whose settings hold the three authored inline entries. */
const makeInlineWorkspace = () => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "axm-inline-mcp-")));
  fs.mkdirSync(path.join(root, ".axm"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "axm.json"),
    `${JSON.stringify({ agents: [], mcpServers: { ...authoredInlineEntries } }, null, 2)}\n`,
  );
  fs.writeFileSync(path.join(root, "axm-lock.yaml"), "lockfileVersion: 7\nskills: {}\n");
  return {
    root,
    readSettings: (): unknown => JSON.parse(fs.readFileSync(path.join(root, "axm.json"), "utf8")),
    readSettingsText: (): string => fs.readFileSync(path.join(root, "axm.json"), "utf8"),
    readLockfileText: (): string => fs.readFileSync(path.join(root, "axm-lock.yaml"), "utf8"),
    provide: <A, E, R>(effect: Effect.Effect<A, E, R>) =>
      effect.pipe(
        Effect.provide(
          WorkspaceStateOverProject({
            scope: "project",
            projectRoot: decodeAbsolutePathSync(root),
          }).pipe(Layer.provideMerge(NodeServices.layer)),
        ),
      ),
    cleanup: () => fs.rmSync(root, { recursive: true, force: true }),
  };
};

describe("Inline MCP entries are authoritative as authored", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  const inlineWorkspace = () => {
    const workspace = makeInlineWorkspace();
    cleanups.push(workspace.cleanup);
    return workspace;
  };

  it.effect("adding another server preserves the authored form of every untouched entry", () => {
    const workspace = inlineWorkspace();
    return workspace.provide(
      Effect.gen(function* () {
        const settingsWriter = yield* SettingsWriter;

        yield* settingsWriter.setEntry("mcp-server", "companion", {
          kind: "inline",
          command: "node",
          args: ["companion.js"],
          enabled: true,
          env: {},
        });

        const settings = workspace.readSettings();
        expectAuthoredFormPreserved(settings);
        // Every authored entry survives in the file's own bytes, not only
        // after a re-encode.
        const text = workspace.readSettingsText();
        expect(text).toContain('"echo muted"');
        expect(text).toContain('"https://example.test/mcp"');
        // The new entry is a command object as well — no fabricated source.
        expect(readInlineEntry(settings, "companion")).toMatchObject({ command: "node" });
        expect(JSON.stringify(readInlineEntry(settings, "companion"))).not.toContain("source");
      }),
    );
  });

  it.effect("desired state carries every authored entry as inline authority", () => {
    const workspace = inlineWorkspace();
    return workspace.provide(
      Effect.gen(function* () {
        const desiredState = yield* DesiredStateReader;

        const graph = yield* desiredState.graph();

        for (const name of Object.keys(authoredInlineEntries)) {
          const node = graph.nodes.find(
            (candidate) => candidate.type === "mcp-server" && candidate.name === name,
          );
          expect(node, name).toBeDefined();
          expect(node?.authority, name).toBe("inline");
          // An inline entry names no source and declares no constraint, so
          // nothing about it can be resolved against a registry.
          expect(node?.source, name).toBeUndefined();
          expect(node?.constraints, name).toEqual([]);
        }
        expect(graph.nodes.find((candidate) => candidate.name === "muted-tool")?.enabled).toBe(
          false,
        );
      }),
    );
  });

  it.effect("inline entries never gain an accepted resolution", () => {
    const workspace = inlineWorkspace();
    return workspace.provide(
      Effect.gen(function* () {
        const settingsWriter = yield* SettingsWriter;

        yield* settingsWriter.setEntry("mcp-server", "companion", {
          kind: "inline",
          command: "node",
          args: ["companion.js"],
          enabled: true,
          env: {},
        });

        const lockfile = workspace.readLockfileText();
        for (const name of [...Object.keys(authoredInlineEntries), "companion"])
          expect(lockfile, name).not.toContain(name);
      }),
    );
  });
});
