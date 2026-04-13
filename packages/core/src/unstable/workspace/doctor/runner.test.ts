import { describe, expect, it } from "@effect/vitest";
import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import type { WorkspaceLocation } from "../paths.js";
import { defineCheck, type CheckDefInput, type DiagnosticDef } from "./check-def.js";
import { runCheckGraph } from "./runner.js";
import type { Check, Finding } from "./types.js";

const workspace: WorkspaceLocation = {
  scope: "project",
  path: "/tmp/axm",
  baseDir: "/tmp",
};

type Ctx = { readonly name: string };

const diag = (id: string, findings: ReadonlyArray<Finding>): DiagnosticDef<Ctx, never> => ({
  id,
  run: () => Effect.succeed(findings),
});

const finding = (id: string, severity: Finding["severity"]): Finding => ({
  id,
  severity,
  message: `${severity} ${id}`,
});

const makeCheckDef = (opts: {
  readonly id: string;
  readonly title?: string;
  readonly description?: string;
  readonly dependsOn?: ReadonlyArray<string>;
  readonly diagnostics: ReadonlyArray<DiagnosticDef<Ctx, never>>;
}): CheckDefInput<Ctx, never> => ({
  id: opts.id,
  title: opts.title ?? `${opts.id} title`,
  description: opts.description ?? `${opts.id} description`,
  dependsOn: opts.dependsOn ?? [],
  prepareContext: Effect.succeed({ name: opts.id }),
  diagnostics: opts.diagnostics,
});

const findCheck = (checks: ReadonlyArray<Check>, id: string): Check => {
  const match = checks.find((check) => check.id === id);
  if (match === undefined) {
    throw new Error(`expected a check with id "${id}"`);
  }
  return match;
};

describe("runCheckGraph", () => {
  it.effect("runs a linear chain a -> b -> c where all checks pass", () =>
    Effect.gen(function* () {
      const a = makeCheckDef({
        id: "a",
        diagnostics: [diag("a.info", [finding("a.info", "info")])],
      });
      const b = makeCheckDef({
        id: "b",
        dependsOn: ["a"],
        diagnostics: [diag("b.info", [finding("b.info", "info")])],
      });
      const c = makeCheckDef({
        id: "c",
        dependsOn: ["b"],
        diagnostics: [diag("c.info", [finding("c.info", "info")])],
      });

      const report = yield* runCheckGraph(
        [defineCheck(a), defineCheck(b), defineCheck(c)],
        workspace,
      );

      expect(report.checks.map((check) => check.id)).toEqual(["a", "b", "c"]);
      expect(report.checks.every((check) => check.status === "pass")).toBe(true);
      expect(report.healthy).toBe(true);
      expect(report.summary.checks.passed).toBe(3);
      expect(report.summary.checks.info).toBe(3);
      expect(report.summary.findings.info).toBe(3);
    }),
  );

  it.effect("skips dependents when a dependency fails", () =>
    Effect.gen(function* () {
      const a = makeCheckDef({
        id: "a",
        title: "Check A",
        diagnostics: [diag("a.err", [finding("a.err", "error")])],
      });
      const b = makeCheckDef({
        id: "b",
        dependsOn: ["a"],
        diagnostics: [diag("b.info", [finding("b.info", "info")])],
      });
      const c = makeCheckDef({
        id: "c",
        dependsOn: ["b"],
        diagnostics: [diag("c.info", [finding("c.info", "info")])],
      });

      const report = yield* runCheckGraph(
        [defineCheck(a), defineCheck(b), defineCheck(c)],
        workspace,
      );

      expect(findCheck(report.checks, "a").status).toBe("fail");
      const bResult = findCheck(report.checks, "b");
      const cResult = findCheck(report.checks, "c");
      expect(bResult.status).toBe("skip");
      expect(bResult.skipReason).toBe(`Depends on "Check A", which failed.`);
      expect(bResult.findings).toEqual([]);
      expect(cResult.status).toBe("skip");
      expect(cResult.skipReason).toBe(`Depends on "Check A", which failed.`);
      expect(report.healthy).toBe(false);
      expect(report.summary.checks.failed).toBe(1);
      expect(report.summary.checks.skipped).toBe(2);
    }),
  );

  it.effect("still runs dependents when a dependency only warns", () =>
    Effect.gen(function* () {
      const a = makeCheckDef({
        id: "a",
        diagnostics: [diag("a.warn", [finding("a.warn", "warn")])],
      });
      const b = makeCheckDef({
        id: "b",
        dependsOn: ["a"],
        diagnostics: [diag("b.info", [finding("b.info", "info")])],
      });

      const report = yield* runCheckGraph([defineCheck(a), defineCheck(b)], workspace);

      expect(findCheck(report.checks, "a").status).toBe("warn");
      expect(findCheck(report.checks, "b").status).toBe("pass");
      expect(report.healthy).toBe(true);
      expect(report.summary.checks.warned).toBe(1);
      expect(report.summary.checks.passed).toBe(1);
    }),
  );

  it.effect("handles a diamond dependency graph where all checks pass", () =>
    Effect.gen(function* () {
      const a = makeCheckDef({
        id: "a",
        diagnostics: [diag("a.info", [finding("a.info", "info")])],
      });
      const b = makeCheckDef({
        id: "b",
        dependsOn: ["a"],
        diagnostics: [diag("b.info", [finding("b.info", "info")])],
      });
      const c = makeCheckDef({
        id: "c",
        dependsOn: ["a"],
        diagnostics: [diag("c.info", [finding("c.info", "info")])],
      });
      const d = makeCheckDef({
        id: "d",
        dependsOn: ["b", "c"],
        diagnostics: [diag("d.info", [finding("d.info", "info")])],
      });

      const report = yield* runCheckGraph(
        [defineCheck(a), defineCheck(b), defineCheck(c), defineCheck(d)],
        workspace,
      );

      expect(report.checks.map((check) => check.id)).toEqual(["a", "b", "c", "d"]);
      expect(report.checks.every((check) => check.status === "pass")).toBe(true);
      expect(report.healthy).toBe(true);
    }),
  );

  it.effect("rolls up mixed severities into per-check statuses", () =>
    Effect.gen(function* () {
      const a = makeCheckDef({
        id: "a",
        diagnostics: [
          diag("a.info", [finding("a.info", "info")]),
          diag("a.warn", [finding("a.warn", "warn")]),
        ],
      });
      const b = makeCheckDef({
        id: "b",
        diagnostics: [diag("b.warn", [finding("b.warn", "warn"), finding("b.err", "error")])],
      });
      const c = makeCheckDef({
        id: "c",
        diagnostics: [diag("c.info", [finding("c.info", "info")])],
      });

      const report = yield* runCheckGraph(
        [defineCheck(a), defineCheck(b), defineCheck(c)],
        workspace,
      );

      expect(findCheck(report.checks, "a").status).toBe("warn");
      expect(findCheck(report.checks, "b").status).toBe("fail");
      expect(findCheck(report.checks, "c").status).toBe("pass");
      expect(report.summary.checks.warned).toBe(1);
      expect(report.summary.checks.failed).toBe(1);
      expect(report.summary.checks.passed).toBe(1);
      expect(report.summary.findings.errors).toBe(1);
      expect(report.summary.findings.warnings).toBe(2);
      expect(report.summary.findings.info).toBe(2);
      expect(report.healthy).toBe(false);
    }),
  );

  it.effect("replaces findings with invalid ids with a synthetic fail finding", () =>
    Effect.gen(function* () {
      const a = makeCheckDef({
        id: "a",
        diagnostics: [
          diag("a.good", [finding("a.good", "info")]),
          diag("a.bad", [finding("not-a-valid-id", "warn")]),
          diag("a.wrong-prefix", [finding("b.wrong-prefix", "info")]),
        ],
      });

      const report = yield* runCheckGraph([defineCheck(a)], workspace);

      const aResult = findCheck(report.checks, "a");
      expect(aResult.status).toBe("fail");

      const synthetic = aResult.findings.filter((f) => f.id === "a.invalid-finding-id");
      expect(synthetic.length).toBe(2);
      expect(synthetic.every((f) => f.severity === "error")).toBe(true);
      expect(synthetic[0]?.message).toContain("not-a-valid-id");
      expect(synthetic[1]?.message).toContain("b.wrong-prefix");

      for (const f of aResult.findings) {
        expect(f.id).toMatch(/^[a-z][a-z0-9-]*\.[a-z][a-z0-9-]*$/);
        expect(f.id.startsWith("a.")).toBe(true);
      }
    }),
  );

  it.effect("dies when the check graph contains a cycle", () =>
    Effect.gen(function* () {
      const a = makeCheckDef({
        id: "a",
        dependsOn: ["b"],
        diagnostics: [],
      });
      const b = makeCheckDef({
        id: "b",
        dependsOn: ["a"],
        diagnostics: [],
      });

      const exit = yield* Effect.exit(runCheckGraph([defineCheck(a), defineCheck(b)], workspace));

      expect(Exit.isFailure(exit)).toBe(true);
      if (Exit.isFailure(exit)) {
        expect(Cause.hasDies(exit.cause)).toBe(true);
      }
    }),
  );

  it.effect("dies when a check declares a dependency on an unknown check id", () =>
    Effect.gen(function* () {
      const a = makeCheckDef({
        id: "a",
        dependsOn: ["ghost"],
        diagnostics: [],
      });

      const exit = yield* Effect.exit(runCheckGraph([defineCheck(a)], workspace));

      expect(Exit.isFailure(exit)).toBe(true);
      if (Exit.isFailure(exit)) {
        expect(Cause.hasDies(exit.cause)).toBe(true);
      }
    }),
  );
});
