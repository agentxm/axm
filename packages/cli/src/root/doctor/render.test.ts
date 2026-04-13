import { describe, expect, it } from "vitest";
import type {
  Action,
  Check,
  Finding,
  ReportSummary,
  WorkspaceDoctorReport,
} from "@axm.sh/core/unstable/workspace";

import {
  computeCheckHeaderAction,
  formatSummaryLine,
  renderHumanReport,
  symbolForSeverity,
  symbolForStatus,
} from "./render.js";

const INIT_ACTION: Action = {
  label: "Initialize workspace",
  description: "Create .axm/ and settings.json",
  command: "axm init",
};

const SYNC_ACTION: Action = {
  label: "Sync workspace",
  description: "Install missing extensions",
  command: "axm sync",
};

const EDIT_SETTINGS_ACTION: Action = {
  label: "Edit settings.json",
  description: "Fix settings.json and rerun doctor",
};

const makeFinding = (overrides?: Partial<Finding>): Finding => ({
  id: "workspace-ready.directory-missing",
  severity: "error",
  message: ".axm directory not found",
  ...overrides,
});

const makeCheck = (overrides?: Partial<Check>): Check => ({
  id: "workspace-ready",
  title: "Workspace is ready",
  description: "Verifies that the .axm directory exists.",
  dependsOn: [],
  status: "pass",
  findings: [],
  ...overrides,
});

const makeSummary = (overrides?: Partial<ReportSummary>): ReportSummary => ({
  checks: { passed: 0, warned: 0, failed: 0, skipped: 0, info: 0 },
  findings: { errors: 0, warnings: 0, info: 0 },
  ...overrides,
});

const makeReport = (overrides?: Partial<WorkspaceDoctorReport>): WorkspaceDoctorReport => ({
  scope: "project",
  workspacePath: "/tmp/project/.axm",
  healthy: true,
  summary: makeSummary(),
  checks: [],
  ...overrides,
});

describe("computeCheckHeaderAction", () => {
  it("returns undefined when the check has no findings", () => {
    const check = makeCheck({ status: "pass", findings: [] });
    expect(computeCheckHeaderAction(check)).toBeUndefined();
  });

  it("returns undefined when all findings are info", () => {
    const check = makeCheck({
      status: "pass",
      findings: [
        makeFinding({
          id: "workspace-ready.info-only",
          severity: "info",
          message: "advisory",
          action: INIT_ACTION,
        }),
      ],
    });
    expect(computeCheckHeaderAction(check)).toBeUndefined();
  });

  it("returns the action when one error carries an action", () => {
    const check = makeCheck({
      status: "fail",
      findings: [makeFinding({ action: INIT_ACTION })],
    });
    expect(computeCheckHeaderAction(check)).toEqual(INIT_ACTION);
  });

  it("returns the action when two errors share the same command", () => {
    const check = makeCheck({
      status: "fail",
      findings: [
        makeFinding({ id: "workspace-ready.a", action: INIT_ACTION }),
        makeFinding({
          id: "workspace-ready.b",
          message: "settings.json missing",
          action: INIT_ACTION,
        }),
      ],
    });
    expect(computeCheckHeaderAction(check)).toEqual(INIT_ACTION);
  });

  it("returns undefined when two errors have different commands", () => {
    const check = makeCheck({
      status: "fail",
      findings: [
        makeFinding({ id: "workspace-ready.a", action: INIT_ACTION }),
        makeFinding({
          id: "workspace-ready.b",
          message: "different",
          action: SYNC_ACTION,
        }),
      ],
    });
    expect(computeCheckHeaderAction(check)).toBeUndefined();
  });

  it("returns undefined when one error has an action and another does not", () => {
    const check = makeCheck({
      status: "fail",
      findings: [
        makeFinding({ id: "workspace-ready.a", action: INIT_ACTION }),
        makeFinding({ id: "workspace-ready.b", message: "no action" }),
      ],
    });
    expect(computeCheckHeaderAction(check)).toBeUndefined();
  });

  it("returns undefined when the action has no command", () => {
    const check = makeCheck({
      status: "fail",
      findings: [makeFinding({ action: EDIT_SETTINGS_ACTION })],
    });
    expect(computeCheckHeaderAction(check)).toBeUndefined();
  });

  it("returns the action when a warn and error share the same command", () => {
    const check = makeCheck({
      status: "fail",
      findings: [
        makeFinding({ id: "workspace-ready.a", severity: "warn", action: INIT_ACTION }),
        makeFinding({
          id: "workspace-ready.b",
          severity: "error",
          action: INIT_ACTION,
        }),
      ],
    });
    expect(computeCheckHeaderAction(check)).toEqual(INIT_ACTION);
  });
});

describe("symbolForStatus", () => {
  it("maps pass to a check mark", () => {
    expect(symbolForStatus("pass")).toBe("✓");
  });
});

describe("symbolForSeverity", () => {
  it("maps error to a cross", () => {
    expect(symbolForSeverity("error")).toBe("✗");
  });
});

describe("formatSummaryLine", () => {
  it("pluralizes counts above one", () => {
    const line = formatSummaryLine(
      makeSummary({
        checks: { passed: 2, warned: 0, failed: 3, skipped: 4, info: 5 },
        findings: { errors: 3, warnings: 0, info: 5 },
      }),
    );
    expect(line).toBe("2 passed · 3 failed · 4 skipped · 5 advisories");
  });

  it("uses singular form for counts equal to one", () => {
    const line = formatSummaryLine(
      makeSummary({
        checks: { passed: 1, warned: 0, failed: 1, skipped: 1, info: 1 },
        findings: { errors: 1, warnings: 0, info: 1 },
      }),
    );
    expect(line).toBe("1 passed · 1 failed · 1 skipped · 1 advisory");
  });

  it("emits zeros when there are no counts", () => {
    const line = formatSummaryLine(makeSummary());
    expect(line).toBe("0 passed · 0 failed · 0 skipped · 0 advisories");
  });
});

describe("renderHumanReport", () => {
  it("renders normal verbosity with headers and findings under failing checks", () => {
    const report = makeReport({
      healthy: false,
      summary: makeSummary({
        checks: { passed: 1, warned: 0, failed: 1, skipped: 0, info: 0 },
        findings: { errors: 2, warnings: 0, info: 0 },
      }),
      checks: [
        makeCheck({
          id: "workspace-ready",
          title: "Workspace is ready",
          status: "fail",
          findings: [
            makeFinding({ action: INIT_ACTION }),
            makeFinding({
              id: "workspace-ready.settings-missing",
              message: "settings.json not found",
              action: INIT_ACTION,
            }),
          ],
        }),
        makeCheck({
          id: "agents-configured",
          title: "Agents configured",
          status: "pass",
        }),
      ],
    });

    const lines = renderHumanReport(report, "normal");
    const text = lines.join("\n");

    expect(lines[0]).toBe("Workspace Health — /tmp/project/.axm  (project scope)");
    expect(text).toContain("✗ Workspace is ready   2 errors");
    // Header action lifted
    expect(text).toContain("→ axm init");
    // Findings rendered
    expect(text).toContain("✗ .axm directory not found");
    expect(text).toContain("✗ settings.json not found");
    // Passing checks show header only, no findings
    expect(text).toContain("✓ Agents configured");
    expect(text).toContain("1 passed · 1 failed · 0 skipped · 0 advisories");
  });

  it("renders quiet verbosity with only failing checks and no header section when healthy", () => {
    const healthy = makeReport({
      healthy: true,
      summary: makeSummary({
        checks: { passed: 1, warned: 0, failed: 0, skipped: 0, info: 0 },
      }),
      checks: [makeCheck({ status: "pass" })],
    });

    const quietHealthy = renderHumanReport(healthy, "quiet");
    expect(quietHealthy).toEqual([]);

    const unhealthy = makeReport({
      healthy: false,
      summary: makeSummary({
        checks: { passed: 1, warned: 0, failed: 1, skipped: 0, info: 0 },
        findings: { errors: 1, warnings: 0, info: 0 },
      }),
      checks: [
        makeCheck({
          status: "fail",
          findings: [makeFinding({ action: INIT_ACTION })],
        }),
        makeCheck({
          id: "agents-configured",
          title: "Agents configured",
          status: "pass",
        }),
      ],
    });

    const quietUnhealthy = renderHumanReport(unhealthy, "quiet");
    const text = quietUnhealthy.join("\n");

    expect(text).toContain("✗ Workspace is ready");
    // Quiet omits finding detail and passes
    expect(text).not.toContain(".axm directory not found");
    expect(text).not.toContain("Agents configured");
    expect(text).toContain("1 passed");
  });

  it("renders verbose verbosity with info findings expanded under passing checks", () => {
    const report = makeReport({
      healthy: true,
      summary: makeSummary({
        checks: { passed: 1, warned: 0, failed: 0, skipped: 0, info: 1 },
        findings: { errors: 0, warnings: 0, info: 1 },
      }),
      checks: [
        makeCheck({
          id: "extensions-current",
          title: "Extensions are up to date",
          status: "pass",
          findings: [
            makeFinding({
              id: "extensions-current.update-available",
              severity: "info",
              message: "Update available for @foo/skills/a",
              details: "current 1.0.0\nlatest 1.1.0",
            }),
          ],
        }),
      ],
    });

    const lines = renderHumanReport(report, "verbose");
    const text = lines.join("\n");

    expect(text).toContain("✓ Extensions are up to date   1 advisory");
    expect(text).toContain("ℹ Update available for @foo/skills/a");
    expect(text).toContain("current 1.0.0");
    expect(text).toContain("latest 1.1.0");
  });

  it("deduplicates the action so it appears only once on the header", () => {
    const report = makeReport({
      healthy: false,
      summary: makeSummary({
        checks: { passed: 0, warned: 0, failed: 1, skipped: 0, info: 0 },
        findings: { errors: 2, warnings: 0, info: 0 },
      }),
      checks: [
        makeCheck({
          status: "fail",
          findings: [
            makeFinding({ id: "workspace-ready.a", action: INIT_ACTION }),
            makeFinding({
              id: "workspace-ready.b",
              message: "settings.json missing",
              action: INIT_ACTION,
            }),
          ],
        }),
      ],
    });

    const lines = renderHumanReport(report, "normal");
    const initOccurrences = lines.filter((line) => line.includes("→ axm init"));
    expect(initOccurrences).toHaveLength(1);
  });

  it("renders commandless finding actions with their label", () => {
    const report = makeReport({
      healthy: false,
      summary: makeSummary({
        checks: { passed: 0, warned: 0, failed: 1, skipped: 0, info: 0 },
        findings: { errors: 1, warnings: 0, info: 0 },
      }),
      checks: [
        makeCheck({
          status: "fail",
          findings: [
            makeFinding({
              id: "workspace-ready.settings-unparseable",
              message: "settings.json is not valid JSON",
              action: EDIT_SETTINGS_ACTION,
            }),
          ],
        }),
      ],
    });

    const text = renderHumanReport(report, "normal").join("\n");

    expect(text).toContain("✗ settings.json is not valid JSON");
    expect(text).toContain("→ Edit settings.json");
    expect(text).toContain("Fix settings.json and rerun doctor");
  });

  it("renders skipped checks with their skip reason", () => {
    const report = makeReport({
      healthy: false,
      summary: makeSummary({
        checks: { passed: 0, warned: 0, failed: 1, skipped: 1, info: 0 },
        findings: { errors: 1, warnings: 0, info: 0 },
      }),
      checks: [
        makeCheck({
          status: "fail",
          findings: [makeFinding({ action: INIT_ACTION })],
        }),
        makeCheck({
          id: "extensions-installed",
          title: "Extensions are installed",
          status: "skip",
          skipReason: 'Depends on "Workspace is ready", which failed.',
        }),
      ],
    });

    const lines = renderHumanReport(report, "normal");
    const text = lines.join("\n");

    expect(text).toContain("⊘ Extensions are installed   (skipped)");
    expect(text).toContain('Depends on "Workspace is ready", which failed.');
  });

  it("reports a healthy report with only warnings as healthy (warnings do not fail)", () => {
    // Regression for AXM-202: warn-only checks must not flip healthy to false.
    // The renderer itself trusts the report.healthy flag; this test documents
    // the contract so future check authors do not accidentally fail the run.
    const report = makeReport({
      healthy: true,
      summary: makeSummary({
        checks: { passed: 0, warned: 1, failed: 0, skipped: 0, info: 0 },
        findings: { errors: 0, warnings: 1, info: 0 },
      }),
      checks: [
        makeCheck({
          id: "workspace-ready",
          title: "Workspace is ready",
          status: "warn",
          findings: [
            makeFinding({
              id: "workspace-ready.advisory",
              severity: "warn",
              message: "settings.json has deprecated field",
            }),
          ],
        }),
      ],
    });

    expect(report.healthy).toBe(true);
    const lines = renderHumanReport(report, "normal");
    const text = lines.join("\n");
    expect(text).toContain("⚠ Workspace is ready");
    expect(text).toContain("⚠ settings.json has deprecated field");
    // No "Run `axm sync`" follow-up when healthy
    expect(text).not.toContain("Run `axm sync`");
  });

  it("shows the axm sync recovery hint only when an `axm sync` action is present", () => {
    const report = makeReport({
      healthy: false,
      summary: makeSummary({
        checks: { passed: 0, warned: 0, failed: 1, skipped: 0, info: 0 },
        findings: { errors: 1, warnings: 0, info: 0 },
      }),
      checks: [
        makeCheck({
          id: "extensions-installed",
          title: "Extensions are installed",
          status: "fail",
          findings: [makeFinding({ id: "extensions-installed.missing", action: SYNC_ACTION })],
        }),
      ],
    });

    const lines = renderHumanReport(report, "normal");
    const text = lines.join("\n");
    expect(text).toContain("Run `axm sync` to reconcile the workspace.");
  });

  it("renders debug like verbose", () => {
    const report = makeReport({
      healthy: true,
      summary: makeSummary({
        checks: { passed: 1, warned: 0, failed: 0, skipped: 0, info: 1 },
        findings: { errors: 0, warnings: 0, info: 1 },
      }),
      checks: [
        makeCheck({
          status: "pass",
          findings: [
            makeFinding({
              id: "workspace-ready.advisory",
              severity: "info",
              message: "advisory",
            }),
          ],
        }),
      ],
    });

    const lines = renderHumanReport(report, "debug");
    const text = lines.join("\n");

    expect(text).toContain("✓ Workspace is ready   1 advisory");
    expect(text).toContain("ℹ advisory");
  });
});
