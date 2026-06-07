import * as Schema from "effect/Schema";
import { describe, expect, it } from "vitest";
import { HookManifestSchema } from "./manifest-schema.js";

const baseManifest = {
  owner: "@acme",
  type: "hook",
  name: "tool-audit",
  version: "1.0.0",
  runtime: "bash",
  entrypoint: "src/hook.sh",
} as const;

describe("HookManifestSchema", () => {
  it("decodes canonical hook bindings", () => {
    const decoded = Schema.decodeUnknownSync(HookManifestSchema)({
      ...baseManifest,
      bindings: [
        {
          on: "tool.pre",
          match: { tools: ["file.write", "file.edit"] },
          requires: { decision: { kind: "block" } },
        },
      ],
    });

    expect(decoded.bindings).toEqual([
      {
        on: "tool.pre",
        match: { tools: ["file.write", "file.edit"] },
        requires: { decision: { kind: "block" } },
      },
    ]);
  });

  it("decodes legacy Claude event bindings to canonical bindings", () => {
    const decoded = Schema.decodeUnknownSync(HookManifestSchema)({
      ...baseManifest,
      bindings: [{ event: "PreToolUse", matcher: "Write|Edit" }],
    });

    expect(decoded.bindings).toEqual([{ on: "tool.pre", matcherRaw: "Write|Edit" }]);
  });

  it("rejects canonical events with no native writer-backed mapping", () => {
    expect(() =>
      Schema.decodeUnknownSync(HookManifestSchema)({
        ...baseManifest,
        bindings: [{ on: "notification" }],
      }),
    ).toThrow("notification");
  });

  it("accepts advisory decision subfields without making them schema requirements", () => {
    const decoded = Schema.decodeUnknownSync(HookManifestSchema)({
      ...baseManifest,
      bindings: [{ on: "turn.end", requires: { decision: { kind: "block", outcomes: ["ask"] } } }],
    });

    expect(decoded.bindings).toEqual([
      { on: "turn.end", requires: { decision: { kind: "block", outcomes: ["ask"] } } },
    ]);
  });
});
