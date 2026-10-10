import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "@effect/vitest";
import * as Schema from "effect/Schema";
import { defineSpecification } from "@agentxm/specification-metadata";
import { snapshotTree } from "@agentxm/test-support";
import { makeDirectoryFixture } from "./test-support/directory-harness.js";
import { writeWorkspaceState } from "./test-support/protected-state.js";
import { ErrorEnvelope } from "./test-support/machine-documents.js";

export const specification = defineSpecification({
  requirement: "cli/mcps/header-values-use-equals",
  title: "Inline MCP header inputs split on their first equals sign",
  statement:
    "The mcps add --header option shall accept NAME=VALUE, preserving equals signs and colons in VALUE. The --header-env option shall retain NAME=ENV_NAME symbolic references. Preview shall describe the same connection without writes. Missing equals separators and duplicate header names ignoring case shall fail as usage errors without changing the workspace.",
  class: "functional",
  role: "experience",
  goals: ["workspace-intent-fidelity", "safe-repetition", "actionable-diagnostics"],
  boundary: "process",
  boundaryRationale:
    "The built CLI observes parsing of repeated public flag values, the persisted connection, and refusal without writes.",
  methods: ["example", "decision-table"],
  derivedFrom: ["cli/mcps/add/records-and-realizes-inline-configuration"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const base = [
  "mcps",
  "add",
  "context",
  "--url",
  "https://mcp.example.test/context",
  "--json",
  "--non-interactive",
];
const decodeError = Schema.decodeUnknownSync(ErrorEnvelope);

describe("MCP header value grammar", () => {
  it("preserves literal separators and symbolic references in preview and apply", async () => {
    const fixture = makeDirectoryFixture();
    try {
      writeWorkspaceState(fixture.invoking, { agents: ["claude-code"] });
      const before = snapshotTree(fixture.invoking);
      const args = [
        ...base,
        "--header",
        "X-Trace=first=second:third",
        "--header-env",
        "Authorization=TOKEN",
      ];
      const preview = await fixture.run([...args, "--preview"]);
      expect(preview.exitCode, preview.stdout + preview.stderr).toBe(0);
      expect(snapshotTree(fixture.invoking)).toEqual(before);
      const applied = await fixture.run(args);
      expect(applied.exitCode, applied.stdout + applied.stderr).toBe(0);
      const settings: unknown = JSON.parse(
        fs.readFileSync(path.join(fixture.invoking, "axm.json"), "utf8"),
      );
      expect(settings).toMatchObject({
        mcpServers: {
          context: {
            connection: {
              headers: { "X-Trace": "first=second:third", Authorization: { env: "TOKEN" } },
            },
          },
        },
      });
    } finally {
      fixture.cleanup();
    }
  });

  for (const flags of [
    ["--header", "X-Trace:old-value"],
    ["--header", "X-Trace"],
    ["--header", "=value"],
    ["--header", "X-Trace=first", "--header", "x-trace=second"],
    ["--header", "X-Trace=first", "--header-env", "x-trace=TOKEN"],
  ]) {
    it(`refuses ${JSON.stringify(flags)} without writes`, async () => {
      const fixture = makeDirectoryFixture();
      try {
        writeWorkspaceState(fixture.invoking, { agents: ["claude-code"] });
        const before = snapshotTree(fixture.invoking);
        const failed = await fixture.run([...base, ...flags]);
        expect(failed.exitCode, failed.stdout + failed.stderr).toBe(2);
        const document: unknown = JSON.parse(failed.stdout);
        expect(decodeError(document)).toMatchObject({ ok: false, code: "usage" });
        expect(snapshotTree(fixture.invoking)).toEqual(before);
      } finally {
        fixture.cleanup();
      }
    });
  }
});
