import * as path from "node:path";

import { describe, expect, it } from "vitest";

import {
  AXM_LOCAL_DEFAULT_REGISTRY_LOCATION,
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

  it("defaults registry location, auth URL, and telemetry env vars when they are unset", () => {
    const invocation = createAxmLocalInvocation({
      scriptPath: path.join("/tmp", "axm", "scripts", "axm-local.ts"),
      argv: ["whoami", "--json"],
      cwd: path.join("/tmp", "workspace"),
      env: { PATH: "/bin" },
    });

    expect(invocation.command).toBe("bun");
    expect(invocation.args).toEqual([
      AXM_SOURCE_CONDITION_ARGUMENT,
      path.join("/tmp", "axm", "packages", "cli", "src", "main.ts"),
      "whoami",
      "--json",
    ]);
    expect(invocation.cwd).toBe(path.join("/tmp", "workspace"));
    expect(invocation.env["AXM_REGISTRY_LOCATION"]).toBe(AXM_LOCAL_DEFAULT_REGISTRY_LOCATION);
    expect(invocation.env["AXM_REGISTRY_URL"]).toBe(AXM_LOCAL_DEFAULT_REGISTRY_LOCATION);
    expect(invocation.env["AXM_TELEMETRY"]).toBe(AXM_LOCAL_DEFAULT_TELEMETRY);
    expect(invocation.env["PATH"]).toBe("/bin");
  });

  it("preserves explicit env overrides", () => {
    const invocation = createAxmLocalInvocation({
      scriptPath: path.join("/tmp", "axm", "scripts", "axm-local.ts"),
      argv: ["skills", "install", "@acme/skills/demo"],
      cwd: path.join("/tmp", "workspace"),
      env: {
        AXM_REGISTRY_LOCATION: "file:///tmp/registry",
        AXM_REGISTRY_URL: "https://registry.example.test",
        AXM_TELEMETRY: "errors",
      },
    });

    expect(invocation.env["AXM_REGISTRY_LOCATION"]).toBe("file:///tmp/registry");
    expect(invocation.env["AXM_REGISTRY_URL"]).toBe("https://registry.example.test");
    expect(invocation.env["AXM_TELEMETRY"]).toBe("errors");
  });

  it("treats empty env vars as unset", () => {
    const invocation = createAxmLocalInvocation({
      scriptPath: path.join("/tmp", "axm", "scripts", "axm-local.ts"),
      argv: ["login"],
      cwd: path.join("/tmp", "workspace"),
      env: {
        AXM_REGISTRY_LOCATION: "",
        AXM_REGISTRY_URL: "",
        AXM_TELEMETRY: "",
      },
    });

    expect(invocation.env["AXM_REGISTRY_LOCATION"]).toBe(AXM_LOCAL_DEFAULT_REGISTRY_LOCATION);
    expect(invocation.env["AXM_REGISTRY_URL"]).toBe(AXM_LOCAL_DEFAULT_REGISTRY_LOCATION);
    expect(invocation.env["AXM_TELEMETRY"]).toBe(AXM_LOCAL_DEFAULT_TELEMETRY);
  });

  it("does not invent AXM_REGISTRY_URL for file-based registry locations", () => {
    const invocation = createAxmLocalInvocation({
      scriptPath: path.join("/tmp", "axm", "scripts", "axm-local.ts"),
      argv: ["doctor"],
      cwd: path.join("/tmp", "workspace"),
      env: {
        AXM_REGISTRY_LOCATION: "/tmp/registry",
      },
    });

    expect(invocation.env["AXM_REGISTRY_LOCATION"]).toBe("/tmp/registry");
    expect(invocation.env["AXM_REGISTRY_URL"]).toBeUndefined();
  });
});
