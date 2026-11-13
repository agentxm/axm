import { describe, expect, it } from "@effect/vitest";
import * as Schema from "effect/Schema";
import { defineExecutionBinding } from "@agentxm/specification-metadata";
import { snapshotTree } from "@agentxm/test-support";
import { makeDirectoryFixture } from "./test-support/directory-harness.js";
import { writeMalformedWorkspaceState } from "./test-support/malformed-workspace-fixture.js";
import {
  makeEnvironmentProcessFixture,
  withEnvironmentRegistry,
} from "./test-support/environment-process-fixture.js";
import { readExtensionIndex, readExtensionSelection } from "./test-support/read-extension-index.js";
import { wholeStdoutValidator } from "./test-support/wire-contracts.js";

export const executionBinding = defineExecutionBinding({
  requirements: ["cli/machine-output/publishes-route-result-schemas"],
  boundary: "process",
  rationale:
    "Real commands prove passive schema discovery against empty and malformed project/user state, reserved credential refusal, and that exported whole-stdout contracts validate the actual scalar Registry result, formatter documents, and typed failures.",
});

const object = Schema.Record(Schema.String, Schema.Unknown);
const parseObject = Schema.decodeUnknownSync(Schema.fromJsonString(object));

describe("Offline schema discovery over the built CLI", () => {
  it.each([
    { name: "outline", args: ["schema", "publish"], code: 0 },
    {
      name: "field",
      args: ["schema", "publish", "--field", "result.execution.outcomes[].status"],
      code: 0,
    },
    { name: "export", args: ["schema", "skills", "show", "--json"], code: 0 },
    { name: "self", args: ["schema", "schema", "--json"], code: 0 },
    { name: "credential refusal", args: ["schema", "token", "show", "--json"], code: 2 },
  ])("$name replies unchanged with malformed populated workspaces", async ({ args, code }) => {
    const fixture = makeDirectoryFixture();
    try {
      const clean = await fixture.run(args);
      expect(clean.exitCode, clean.stdout + clean.stderr).toBe(code);
      writeMalformedWorkspaceState(fixture.invoking, fixture.home);
      const before = snapshotTree(fixture.root);
      const malformed = await fixture.run(args);
      expect(malformed.exitCode, malformed.stdout + malformed.stderr).toBe(code);
      if (code === 0) {
        expect(malformed.stdout).toBe(clean.stdout);
        expect(malformed.stderr).toBe(clean.stderr);
        expect(snapshotTree(fixture.root)).toEqual(before);
      } else {
        const { diagnosticId: cleanId, ...cleanError } = parseObject(clean.stdout);
        const { diagnosticId: malformedId, ...malformedError } = parseObject(malformed.stdout);
        expect(malformedError).toEqual(cleanError);
        expect(malformedError).toMatchObject({
          ok: false,
          code: "usage",
          detail: expect.stringContaining("plain-only credential contract"),
        });
        expect(malformed.stderr.replaceAll(String(malformedId), "<diagnostic-id>")).toBe(
          clean.stderr.replaceAll(String(cleanId), "<diagnostic-id>"),
        );
        // Refusal retains the existing local support record, but never changes
        // workspace authority, native files, or credential state.
        const withoutDiagnostics = (tree: Readonly<Record<string, string>>) =>
          Object.fromEntries(
            Object.entries(tree).filter(
              ([name]) =>
                name !== "home/.axm/diagnostics" && !name.startsWith("home/.axm/diagnostics/"),
            ),
          );
        expect(withoutDiagnostics(snapshotTree(fixture.root))).toEqual(withoutDiagnostics(before));
      }
    } finally {
      fixture.cleanup();
    }
  });

  it("validates actual scalar result stdout, built-in help, and pre-operation errors", async () => {
    const fixture = makeEnvironmentProcessFixture();
    try {
      const exported = await fixture.run(["schema", "view", "--json"]);
      expect(exported.exitCode, exported.stdout + exported.stderr).toBe(0);
      const decode = wholeStdoutValidator(exported.stdout);
      const selected = await fixture.run(["schema", "view", "--field", "result", "--json"]);
      expect(selected.exitCode, selected.stdout + selected.stderr).toBe(0);
      expect(parseObject(selected.stdout)).toMatchObject({
        "x-axm-field": "result",
        "x-axm-validates": "field-value",
      });
      const decodeField = wholeStdoutValidator(selected.stdout);
      await withEnvironmentRegistry(
        () => ({ body: JSON.stringify(readExtensionSelection()) }),
        async (origin) => {
          fixture.writeProjectSettings({
            defaultRegistry: "company",
            sources: [{ name: "company", type: "registry", location: origin }],
          });
          const result = await fixture.run([
            "view",
            "@acme/skills/review",
            "description",
            "--json",
          ]);
          expect(result.exitCode, result.stdout + result.stderr).toBe(0);
          const stdout = parseObject(result.stdout);
          expect(stdout["result"]).toBe(readExtensionIndex.description);
          expect(decode(stdout)).toEqual(stdout);
          expect(decodeField(stdout["result"])).toBe(readExtensionIndex.description);
        },
      );
      for (const args of [
        ["view", "--help", "--json"],
        ["view", "--unsupported", "--json"],
      ]) {
        const result = await fixture.run(args);
        expect(decode(parseObject(result.stdout))).toEqual(parseObject(result.stdout));
      }
      const unknown = await fixture.run([
        "schema",
        "publish",
        "--field",
        "result.execution.outcomes[].missing",
        "--json",
      ]);
      expect(unknown.exitCode).not.toBe(0);
      const failure = parseObject(unknown.stdout);
      expect(failure["code"]).toBe("not_found");
      expect(
        Array.isArray(failure["suggestions"]) ? failure["suggestions"].length : 0,
      ).toBeLessThanOrEqual(5);
      expect(unknown.stdout.length).toBeLessThan(4096);
    } finally {
      fixture.cleanup();
    }
  });
});
