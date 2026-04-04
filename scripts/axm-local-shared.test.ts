import * as path from "node:path";

import { describe, expect, it } from "vitest";

import {
  AXM_LOCAL_DEFAULT_REGISTRY_URL,
  AXM_LOCAL_DEFAULT_TELEMETRY,
  createAxmLocalInvocation,
  resolveAxmLocalRepoRoot,
} from "./axm-local-shared.js";

describe("axm-local shared helpers", () => {
  it("resolves the axm repo root from the wrapper script path", () => {
    const scriptPath = path.join("/tmp", "axm", "scripts", "axm-local.ts");

    expect(resolveAxmLocalRepoRoot(scriptPath)).toBe(path.join("/tmp", "axm"));
  });

  it("defaults registry and telemetry env vars when they are unset", () => {
    const invocation = createAxmLocalInvocation({
      scriptPath: path.join("/tmp", "axm", "scripts", "axm-local.ts"),
      argv: ["whoami", "--json"],
      env: { PATH: "/bin" },
    });

    expect(invocation.command).toBe("bun");
    expect(invocation.args).toEqual([
      path.join("/tmp", "axm", "packages", "cli", "src", "main.ts"),
      "whoami",
      "--json",
    ]);
    expect(invocation.env["AXM_REGISTRY_URL"]).toBe(AXM_LOCAL_DEFAULT_REGISTRY_URL);
    expect(invocation.env["AXM_TELEMETRY"]).toBe(AXM_LOCAL_DEFAULT_TELEMETRY);
    expect(invocation.env["PATH"]).toBe("/bin");
  });

  it("preserves explicit env overrides", () => {
    const invocation = createAxmLocalInvocation({
      scriptPath: path.join("/tmp", "axm", "scripts", "axm-local.ts"),
      argv: ["skills", "install", "@acme/skills/demo"],
      env: {
        AXM_REGISTRY_URL: "https://registry.example.test",
        AXM_TELEMETRY: "errors",
      },
    });

    expect(invocation.env["AXM_REGISTRY_URL"]).toBe("https://registry.example.test");
    expect(invocation.env["AXM_TELEMETRY"]).toBe("errors");
  });

  it("treats empty env vars as unset", () => {
    const invocation = createAxmLocalInvocation({
      scriptPath: path.join("/tmp", "axm", "scripts", "axm-local.ts"),
      argv: ["login"],
      env: {
        AXM_REGISTRY_URL: "",
        AXM_TELEMETRY: "",
      },
    });

    expect(invocation.env["AXM_REGISTRY_URL"]).toBe(AXM_LOCAL_DEFAULT_REGISTRY_URL);
    expect(invocation.env["AXM_TELEMETRY"]).toBe(AXM_LOCAL_DEFAULT_TELEMETRY);
  });
});
