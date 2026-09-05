import * as fs from "node:fs";
import * as path from "node:path";

import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { handleSync } from "axm.sh/specification-harness";

import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import { makeSpecWorkspace } from "../support/install-harness.js";

export const specification = defineSpecification({
  requirement: "cli/native-projections-compare-by-decoded-value",
  title: "Structured native projections are compared by decoded value",
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

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const replaceManagedMcpCommand = (content: string, command: string): string => {
  const config: unknown = JSON.parse(content);
  if (!isRecord(config) || !isRecord(config["mcpServers"])) {
    throw new Error("Expected a native MCP configuration map");
  }
  const demo = config["mcpServers"]["demo"];
  if (!isRecord(demo)) throw new Error("Expected a managed demo MCP entry");
  return `${JSON.stringify(
    {
      ...config,
      mcpServers: {
        ...config["mcpServers"],
        demo: { ...demo, command },
      },
    },
    null,
    4,
  )}\n`;
};

describe("Native projection comparison", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  it.effect("compares structured native projections by decoded value", () =>
    Effect.gen(function* () {
      const workspace = makeSpecWorkspace({
        machine: true,
        flags: { json: true },
        settings: { agents: ["claude-code"] },
      });
      cleanups.push(workspace.cleanup);
      workspace.writeSettings({
        agents: ["claude-code"],
        mcpServers: { demo: { command: "node", args: ["server.js"] } },
      });
      yield* handleSync({ preview: false }).pipe(Effect.provide(workspace.layer));

      const nativePath = path.join(workspace.root, ".mcp.json");
      const generated = fs.readFileSync(nativePath, "utf8");
      const equivalent = `${JSON.stringify(JSON.parse(generated), null, 4)}\n`;
      expect(equivalent).not.toBe(generated);
      fs.writeFileSync(nativePath, equivalent);

      const equivalentPreview = yield* handleSync({ preview: true, failOnChange: true }).pipe(
        Effect.provide(workspace.layer),
        Effect.exit,
      );
      expect(Exit.isSuccess(equivalentPreview)).toBe(true);
      yield* handleSync({ preview: false }).pipe(Effect.provide(workspace.layer));
      expect(fs.readFileSync(nativePath, "utf8")).toBe(equivalent);

      const changed = replaceManagedMcpCommand(equivalent, "python");
      fs.writeFileSync(nativePath, changed);
      yield* handleSync({ preview: true, failOnChange: true }).pipe(
        Effect.provide(workspace.layer),
      );
      expect(workspace.rendererState.results.at(-1)).toMatchObject({
        ok: false,
        data: { result: { outcome: "previewed", mode: "preview", divergence: true } },
      });
      expect(fs.readFileSync(nativePath, "utf8")).toBe(changed);

      yield* handleSync({ preview: false }).pipe(Effect.provide(workspace.layer));
      expect(JSON.parse(fs.readFileSync(nativePath, "utf8"))).toMatchObject({
        mcpServers: { demo: { command: "node", args: ["server.js"] } },
      });
    }),
  );
});
