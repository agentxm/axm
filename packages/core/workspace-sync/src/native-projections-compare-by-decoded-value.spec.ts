import * as Effect from "effect/Effect";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { deriveOperationOutcome } from "@agentxm/workspace-operations";
import { defineSpecification } from "@agentxm/specification-metadata";

import { applySync, expectResolved, makeSyncFixture, previewSync } from "./test-helpers.js";

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
  assumptions: [],
  openQuestions: [],
});

const NATIVE = ".mcp.json";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Rewrite the managed `demo` entry's command, keeping everything else. */
const replaceManagedMcpCommand = (content: string, command: string): string => {
  const config: unknown = JSON.parse(content);
  if (!isRecord(config) || !isRecord(config["mcpServers"])) {
    throw new Error("Expected a native MCP configuration map");
  }
  const demo = config["mcpServers"]["demo"];
  if (!isRecord(demo)) throw new Error("Expected a managed demo MCP entry");
  return `${JSON.stringify(
    { ...config, mcpServers: { ...config["mcpServers"], demo: { ...demo, command } } },
    null,
    4,
  )}\n`;
};

describe("Native projection comparison", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) {
      cleanup();
    }
  });

  it.effect("compares structured native projections by decoded value", () => {
    const workspace = makeSyncFixture({
      settings: {
        owner: "@acme",
        agents: ["claude-code"],
        mcpServers: { demo: { command: "node", args: ["server.js"] } },
      },
    });
    cleanups.push(workspace.cleanup);
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
          const changed = replaceManagedMcpCommand(equivalent, "python");
          workspace.writeFile(NATIVE, changed);
          const previewed = expectResolved(yield* previewSync());
          expect(deriveOperationOutcome(previewed)).toBe("previewed");
          expect(previewed.units.length).toBeGreaterThan(0);
          expect(workspace.readFile(NATIVE)).toBe(changed);

          yield* applySync();
          expect(JSON.parse(workspace.readFile(NATIVE))).toMatchObject({
            mcpServers: { demo: { command: "node", args: ["server.js"] } },
          });
        }),
      )
      .pipe(Effect.provide(NodeServices.layer));
  });
});
