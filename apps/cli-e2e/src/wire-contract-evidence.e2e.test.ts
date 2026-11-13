import { describe, expect, it } from "@effect/vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as Schema from "effect/Schema";
import { defineExecutionBinding } from "@agentxm/specification-metadata";
import { makeOutputControlsFixture } from "./test-support/output-controls-harness.js";
import {
  assertWireCompletion,
  wholeStdoutValidator,
  type WireReceipt,
} from "./test-support/wire-contracts.js";
import { wireCoverage } from "./test-support/wire-coverage.js";

export const executionBinding = defineExecutionBinding({
  requirements: ["cli/machine-output/publishes-route-result-schemas"],
  boundary: "process",
  rationale:
    "The shipped schema validates captured full stdout and rejects a changed envelope and undeclared field; supporting coverage assertions ensure formatter documents and errors cannot substitute for an observed domain result.",
});

const parseObject = Schema.decodeUnknownSync(
  Schema.fromJsonString(Schema.Record(Schema.String, Schema.Unknown)),
);

describe("Assembled wire contract evidence", () => {
  it("reports an explicit agent capability matrix and empty dependency discovery", async () => {
    const fixture = makeOutputControlsFixture();
    try {
      const capability = await fixture.run(["agents", "capabilities", "claude-code", "--json"]);
      expect(capability.exitCode, capability.stdout + capability.stderr).toBe(0);
      expect(parseObject(capability.stdout)).toMatchObject({
        ok: true,
        mode: "query",
        outcome: "completed",
        result: {
          agent: "claude-code",
          supported: expect.arrayContaining(["skill"]),
          items: expect.arrayContaining([expect.objectContaining({ type: "skill" })]),
        },
      });
      const discovered = await fixture.run(["discover", "--json"]);
      expect(discovered.exitCode, discovered.stdout + discovered.stderr).toBe(0);
      expect(parseObject(discovered.stdout)).toMatchObject({
        ok: true,
        mode: "query",
        outcome: "completed",
        result: { items: [], count: 0, totalDetected: 0, registryAvailable: true },
      });
    } finally {
      fixture.cleanup();
    }
  });

  it("reports actual explicit Hook fixture execution without claiming native host invocation", async () => {
    const fixture = makeOutputControlsFixture();
    const directory = path.join(fixture.project, "hooks", "audit");
    try {
      fs.mkdirSync(directory, { recursive: true });
      fs.writeFileSync(
        path.join(directory, "hook.json"),
        JSON.stringify({
          owner: "@acme",
          type: "hook",
          name: "audit",
          version: "1.0.0",
          implementations: [
            {
              id: "claude",
              protocol: "claude-code",
              bindings: [
                {
                  id: "audit",
                  event: "PreToolUse",
                  handler: { type: "command", runtime: "node", entrypoint: "hook.cjs" },
                },
              ],
            },
          ],
          fixtures: [
            {
              id: "input",
              implementation: "claude",
              binding: "audit",
              input: "input.json",
              expect: { exitCode: 0 },
            },
          ],
        }),
      );
      fs.writeFileSync(path.join(directory, "input.json"), "{}");
      fs.writeFileSync(
        path.join(directory, "hook.cjs"),
        'console.log("private-hook-output-marker");',
      );
      const actual = await fixture.run(["hooks", "test", directory, "--json"]);
      expect(actual.exitCode, actual.stdout + actual.stderr).toBe(0);
      const output = parseObject(actual.stdout);
      expect(output).toMatchObject({
        ok: true,
        mode: "apply",
        outcome: "completed",
        result: {
          passed: true,
          nativeInvocation: "not-observed",
          sandboxed: false,
          fixtures: [{ fixture: "input", outcome: "passed" }],
        },
      });
      const receiptPath = Schema.decodeUnknownSync(
        Schema.Struct({ result: Schema.Struct({ receiptPath: Schema.String }) }),
      )(output).result.receiptPath;
      expect(fs.existsSync(receiptPath)).toBe(true);
      expect(actual.stdout + actual.stderr).not.toContain("private-hook-output-marker");
    } finally {
      fixture.cleanup();
    }
  });

  it("rejects invalid full stdout using the schema discovered from the same built CLI", async () => {
    const fixture = makeOutputControlsFixture();
    try {
      const schema = await fixture.run(["schema", "agents", "list", "--json"]);
      expect(schema.exitCode, schema.stdout + schema.stderr).toBe(0);
      const actual = await fixture.run(["-C", fixture.project, "agents", "list", "-j"]);
      expect(actual.exitCode, actual.stdout + actual.stderr).toBe(0);
      const stdout = parseObject(actual.stdout);
      const validate = wholeStdoutValidator(schema.stdout);
      expect(validate(stdout)).toEqual(stdout);
      expect(assertWireCompletion(actual, stdout)).toBe("observed");
      expect(() => assertWireCompletion({ ...actual, exitCode: 1 }, stdout)).toThrow("exit status");
      const wrongOutcome = { ...stdout, outcome: "failed" };
      expect(validate(wrongOutcome)).toEqual(wrongOutcome);
      expect(() => assertWireCompletion(actual, wrongOutcome)).toThrow("OperationSettled.outcome");
      expect(() =>
        assertWireCompletion(
          {
            ...actual,
            stderr: actual.stderr
              .split("\n")
              .filter((line) => !line.includes('"OperationSettled"'))
              .join("\n"),
          },
          stdout,
        ),
      ).toThrow("one settled command lifecycle");
      expect(() => validate({ ...stdout, mode: "not-an-operation-mode" })).toThrow();
      expect(() => validate({ ...stdout, undeclaredWireField: true })).toThrow();
      expect(() => validate({ ...stdout, result: { unexpected: true } })).toThrow();
    } finally {
      fixture.cleanup();
    }
  });

  it("counts only captured schema-valid result variants as adapter evidence", () => {
    const route = {
      route: "axm login",
      family: "login",
      class: "structured-result",
      modes: ["apply"],
    };
    const base = {
      artifact: "fixture",
      route: route.route,
      family: route.family,
      exitCode: 0,
      stdoutSha256: "captured",
      schemaSha256: "discovered",
      variants: [],
    };
    const receipts: ReadonlyArray<WireReceipt> = [
      { ...base, document: "help" },
      { ...base, document: "error", exitCode: 2 },
    ];
    expect(wireCoverage([route], receipts, []).missingResults).toContain("login:apply");
    expect(
      wireCoverage([route], receipts, [
        { stdoutSha256: "never-captured", variant: "generic-error:before-operation" },
      ]).missingVariants,
    ).toContain("generic-error:before-operation");
    const observed = wireCoverage(
      [route],
      [
        ...receipts,
        {
          ...base,
          document: "result",
          mode: "apply",
          outcome: "pending-human",
          variants: ["login:pending-human"],
        },
      ],
      [],
    );
    expect(observed.missingResults).not.toContain("login:apply");
    expect(observed.observedVariants).toContain("login:pending-human");
  });
});
