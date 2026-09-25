import * as Effect from "effect/Effect";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { deriveOperationOutcome } from "../../transitions/planning/index.js";
import { defineSpecification } from "@agentxm/specification-metadata";

import {
  applySync,
  expectResolved,
  makeFileRegistry,
  makeSyncFixture,
  previewSync,
  type SyncFixture,
} from "./test-helpers.js";

export const specification = defineSpecification({
  requirement: "cli/native-projections-compare-by-decoded-value",
  title: "Structured native configuration changes follow values rather than formatting",
  statement:
    "When a structured native projection is re-serialized with an equivalent decoded value, reconciliation shall report it current and preserve the file, and when its decoded value diverges from the desired configuration, reconciliation shall report the divergence in preview and restore the desired value on apply.",
  class: "functional",
  role: "experience",
  goals: ["safe-repetition", "agent-interoperability"],
  methods: ["example"],
  derivedFrom: ["cli/projection-currency-follows-state-authority"],
  supersedes: [],
  assumptions: [
    "An inline connection and a Pack-supplied Registry connection are the two ways a structured MCP projection enters desired state, so one of each stands for every structured native projection.",
  ],
  openQuestions: [],
});

const NATIVE = ".mcp.json";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Rewrite one managed entry's command, keeping everything else. */
const replaceManagedMcpCommand = (content: string, name: string, command: string): string => {
  const config: unknown = JSON.parse(content);
  if (!isRecord(config) || !isRecord(config["mcpServers"])) {
    throw new Error("Expected a native MCP configuration map");
  }
  const entry = config["mcpServers"][name];
  if (!isRecord(entry)) throw new Error(`Expected a managed ${name} MCP entry`);
  return `${JSON.stringify(
    { ...config, mcpServers: { ...config["mcpServers"], [name]: { ...entry, command } } },
    null,
    4,
  )}\n`;
};

interface ProjectionRow {
  readonly label: string;
  readonly name: string;
  /** The command the desired configuration renders for the entry. */
  readonly command: string;
  readonly workspace: () => SyncFixture;
}

describe("Native projection comparison", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) {
      cleanup();
    }
  });

  const rows: ReadonlyArray<ProjectionRow> = [
    {
      label: "an inline connection",
      name: "demo",
      command: "node",
      workspace: () => {
        const workspace = makeSyncFixture({
          settings: {
            owner: "@acme",
            agents: ["claude-code"],
            mcpServers: { demo: { command: "node", args: ["server.js"] } },
          },
        });
        cleanups.push(workspace.cleanup);
        return workspace;
      },
    },
    {
      label: "a Pack-supplied connection",
      name: "context",
      command: "npx",
      workspace: () => {
        const registry = makeFileRegistry();
        cleanups.push(registry.cleanup);
        registry.writeMcp("context", [{ version: "1.0.0" }]);
        registry.writePack("toolkit", [
          { version: "1.0.0", dependencies: { "@acme/mcps/context": "^1.0.0" } },
        ]);
        const workspace = makeSyncFixture({
          settings: {
            owner: "@acme",
            agents: ["claude-code"],
            sources: [registry.source],
            packs: { toolkit: "test:@acme/packs/toolkit@^1.0.0" },
          },
        });
        cleanups.push(workspace.cleanup);
        return workspace;
      },
    },
  ];

  it.effect.each(rows)("compares $label by decoded value", (row) => {
    const workspace = row.workspace();
    return workspace
      .provide(
        Effect.gen(function* () {
          yield* applySync();

          // The editor re-serialized the generated file with four-space
          // indentation: different bytes, the same decoded value.
          const generated = workspace.readFile(NATIVE);
          const equivalent = `${JSON.stringify(JSON.parse(generated), null, 4)}\n`;
          expect(equivalent).not.toBe(generated);
          workspace.writeFile(NATIVE, equivalent);

          expect((yield* previewSync())._tag).toBe("AlreadyReconciled");
          yield* applySync();
          expect(workspace.readFile(NATIVE)).toBe(equivalent);

          // A real value change is divergence: the preview reports work, and
          // leaves the file exactly as the editor left it.
          const changed = replaceManagedMcpCommand(equivalent, row.name, "python");
          workspace.writeFile(NATIVE, changed);
          const previewed = expectResolved(yield* previewSync());
          expect(deriveOperationOutcome(previewed)).toBe("previewed");
          expect(previewed.units.length).toBeGreaterThan(0);
          expect(workspace.readFile(NATIVE)).toBe(changed);

          yield* applySync();
          expect(JSON.parse(workspace.readFile(NATIVE))).toMatchObject({
            mcpServers: { [row.name]: { command: row.command } },
          });
          expect((yield* previewSync())._tag).toBe("AlreadyReconciled");
        }),
      )
      .pipe(Effect.provide(NodeServices.layer));
  });
});
