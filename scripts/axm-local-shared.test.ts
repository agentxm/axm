import * as path from "node:path";

import { describe, expect, it } from "vitest";

import {
  AXM_LOCAL_DEFAULT_TELEMETRY,
  AXM_SOURCE_CONDITION_ARGUMENT,
  createAxmLocalInvocation,
  resolveAxmLocalRepoRoot,
} from "./axm-local-shared.js";

describe("axm-local shared helpers", () => {
  it("resolves the axm repo root from the wrapper script path", () => {
    const scriptPath = path.join("/tmp", "axm", "scripts", "axm-local.ts");

    expect(resolveAxmLocalRepoRoot(scriptPath)).toBe(path.join("/tmp", "axm"));
  });

  it("leaves Registry selection to settings and defaults only telemetry", () => {
    const invocation = createAxmLocalInvocation({
      scriptPath: path.join("/tmp", "axm", "scripts", "axm-local.ts"),
      argv: ["whoami", "--json"],
      cwd: path.join("/tmp", "workspace"),
      env: { PATH: "/bin" },
    });

    expect(invocation.command).toBe("bun");
    expect(invocation.args).toEqual([
      AXM_SOURCE_CONDITION_ARGUMENT,
      path.join("/tmp", "axm", "apps", "cli", "src", "main.ts"),
      "whoami",
      "--json",
    ]);
    expect(invocation.cwd).toBe(path.join("/tmp", "workspace"));
    expect(invocation.env["AXM_TELEMETRY"]).toBe(AXM_LOCAL_DEFAULT_TELEMETRY);
    expect(invocation.env["PATH"]).toBe("/bin");
  });

  it("preserves an explicit telemetry choice", () => {
    const invocation = createAxmLocalInvocation({
      scriptPath: path.join("/tmp", "axm", "scripts", "axm-local.ts"),
      argv: ["skills", "install", "@acme/skills/demo"],
      cwd: path.join("/tmp", "workspace"),
      env: { AXM_TELEMETRY: "errors" },
    });

    expect(invocation.env["AXM_TELEMETRY"]).toBe("errors");
  });
});
