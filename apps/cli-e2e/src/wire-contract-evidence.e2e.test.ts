import { describe, expect, it } from "@effect/vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import * as Schema from "effect/Schema";
import { defineExecutionBinding } from "@agentxm/specification-metadata";
import { makeOutputControlsFixture } from "./test-support/output-controls-harness.js";
import {
  assertWireCompletion,
  wholeStdoutValidator,
  type WireReceipt,
} from "./test-support/wire-contracts.js";
import {
  aggregateWireCoverage,
  wireCoverage,
  WireRunEvidenceSchema,
  type WireRunEvidence,
} from "./test-support/wire-coverage.js";
import WireCoverageReporter from "./test-support/wire-coverage-reporter.js";

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

// Synthetic validated-observation receipts test aggregation; producer validation is exercised above.
const completeWireShards = (): ReadonlyArray<WireRunEvidence> => {
  const requirements = wireCoverage([], [], []);
  const routes = requirements.requiredResults.map((entry) => {
    const separator = entry.lastIndexOf(":");
    return {
      route: `axm fixture ${entry}`,
      family: entry.slice(0, separator),
      class: "structured-result",
      modes: [entry.slice(separator + 1)],
    };
  });
  const receipts: WireReceipt[] = routes.flatMap((route) =>
    route.modes.map((mode): WireReceipt => ({
      artifact: "fixture",
      route: route.route,
      family: route.family,
      document: "result",
      mode,
      exitCode: 0,
      stdoutSha256: route.route,
      schemaSha256: "one-schema",
      variants: [],
    })),
  );
  receipts.push({
    artifact: "fixture",
    route: "axm fixture error",
    family: "generic-error",
    document: "error",
    exitCode: 2,
    stdoutSha256: "before-operation",
    schemaSha256: "one-schema",
    variants: requirements.requiredVariants.filter(
      (variant) => variant !== "generic-error:before-operation",
    ),
  });
  receipts.push({
    artifact: "fixture",
    route: "axm lock export",
    family: "external-document",
    document: "external",
    exitCode: 0,
    stdoutSha256: "external",
    variants: [],
  });
  return [1, 2].map((index): WireRunEvidence => ({
    testRun: "passed",
    suiteSelected: true,
    shard: { index, count: 2 },
    registers: [{ artifact: "fixture", schemaSha256: "one-schema", routes }],
    receipts: receipts.filter((_, receiptIndex) => receiptIndex % 2 === index - 1),
    witnesses:
      index === 2
        ? [{ stdoutSha256: "before-operation", variant: "generic-error:before-operation" }]
        : [],
  }));
};

describe("Partitioned wire evidence", () => {
  it.each([
    {
      name: "ordinary shard",
      shard: { index: 1, count: 2 },
      force: undefined,
      expectedEnforcement: false,
    },
    { name: "whole suite", shard: undefined, force: undefined, expectedEnforcement: true },
    {
      name: "single-partition whole suite",
      shard: { index: 1, count: 1 },
      force: undefined,
      expectedEnforcement: true,
    },
    {
      name: "explicitly required shard",
      shard: { index: 1, count: 2 },
      force: "1",
      expectedEnforcement: true,
    },
  ])(
    "keeps $name coverage scope and enforcement distinct",
    ({ shard, force, expectedEnforcement }) => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), "axm-wire-reporter-"));
      const output = path.join(root, "coverage.json");
      const reporter = new WireCoverageReporter({
        directory: path.join(root, "receipts"),
        output,
        suiteFiles: ["first.ts", "second.ts"],
        ...(force === undefined ? {} : { requireComplete: force }),
      });
      try {
        reporter.onInit({ config: shard === undefined ? {} : { shard } });
        // This is the actual Vitest boundary: selection is supplied before sharding.
        reporter.onTestRunStart([{ moduleId: "first.ts" }, { moduleId: "second.ts" }]);
        const finish = () => reporter.onTestRunEnd([], [], "passed");
        if (expectedEnforcement) expect(finish).toThrow("wire coverage matrix is incomplete");
        else expect(finish).not.toThrow();
        expect(parseObject(fs.readFileSync(output, "utf8"))).toMatchObject({
          suiteSelected: true,
          completeSuite: shard === undefined || shard.count === 1,
          shard: shard ?? null,
          enforced: expectedEnforcement,
          complete: false,
          missingResults: expect.arrayContaining(["login:apply"]),
          registers: [],
          receipts: [],
          witnesses: [],
        });
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
      }
    },
  );

  it("recomputes the complete shared matrix from two disjoint raw receipt sets", () => {
    const shards = completeWireShards();
    expect(shards.every((shard) => aggregateWireCoverage([shard], 2).complete === false)).toBe(
      true,
    );
    const combined = aggregateWireCoverage(shards, 2);
    expect(combined).toMatchObject({
      complete: true,
      issues: [],
      missingResults: [],
      missingVariants: [],
      missingExternalDocuments: [],
      schemaHashes: ["one-schema"],
    });
    expect(combined.observedResults).toHaveLength(43);
    expect(combined.requiredVariants).toHaveLength(15);
  });

  it("rejects missing, duplicate, failed and filtered partitions even when their union covers every route", () => {
    const shards = completeWireShards();
    expect(aggregateWireCoverage(shards.slice(0, 1), 2).issues).toContain(
      "Expected 2 shard reports; received 1.",
    );
    expect(
      aggregateWireCoverage(
        shards.map((shard) => ({ ...shard, shard: { index: 1, count: 2 } })),
        2,
      ).issues,
    ).toContain("Duplicate wire shard index 1.");
    const failed = shards.map((shard) =>
      Schema.decodeUnknownSync(WireRunEvidenceSchema)({ ...shard, testRun: "failed" }),
    );
    expect(aggregateWireCoverage(failed, 2).issues).toContain(
      "A wire shard did not pass its test run.",
    );
    expect(
      aggregateWireCoverage(
        shards.map((shard) => ({ ...shard, suiteSelected: false })),
        2,
      ).issues,
    ).toContain("A wire shard filtered the complete suite selection.");
  });

  it("refuses schema disagreement and ignores falsified claimed-complete fields", () => {
    const shards = completeWireShards();
    expect(() =>
      Schema.decodeUnknownSync(WireRunEvidenceSchema)({ ...shards[0], registers: undefined }),
    ).toThrow();
    const mixed = shards.map((shard, index) => ({
      ...shard,
      registers: shard.registers.map((register) => ({
        ...register,
        schemaSha256: index === 0 ? "one-schema" : "other-schema",
      })),
    }));
    expect(aggregateWireCoverage(mixed, 2).issues).toContain(
      "Wire shards must observe one identical schema bundle.",
    );
    const forged = shards.map((shard) =>
      Schema.decodeUnknownSync(WireRunEvidenceSchema)({
        ...shard,
        complete: true,
        missingResults: [],
        observedResults: ["login:apply"],
        receipts: shard.receipts.filter((receipt) => receipt.family !== "login"),
      }),
    );
    expect(aggregateWireCoverage(forged, 2)).toMatchObject({
      complete: false,
      missingResults: expect.arrayContaining(["login:apply"]),
    });
  });
});
