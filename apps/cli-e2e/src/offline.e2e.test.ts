import * as fs from "node:fs";
import * as path from "node:path";
import { startHttpRegistry } from "./e2e/http-registry-server.js";
import { publishSkill } from "./test-support/registry-workspace.js";
import { createBinaryRunner } from "@agentxm/client-e2e-utils";
import { resolveHostBinaryPath } from "./distribution-targets.js";
import { expect, it } from "@effect/vitest";
import { defineExecutionBinding } from "@agentxm/specification-metadata";
import {
  makeEnvironmentProcessFixture,
  withEnvironmentRegistry,
} from "./test-support/environment-process-fixture.js";

export const executionBinding = defineExecutionBinding({
  requirements: ["cli/network/offline-prohibits-network"],
  boundary: "process",
  rationale:
    "Real CLI invocations address a controlled HTTP origin for Registry, telemetry and trace export; its independent request journal must remain empty offline and observe an online control request.",
});

it.each([
  { label: "built JavaScript", run: undefined },
  { label: "compiled host", run: createBinaryRunner(resolveHostBinaryPath()) },
])(
  "$label offline local inventory succeeds and remote reads and login refuse without contacting the origin",
  async ({ run }) => {
    const fixture = makeEnvironmentProcessFixture(run);
    try {
      await withEnvironmentRegistry(
        () => ({
          status: 404,
          body: JSON.stringify({
            type: "https://registry.agentxm.ai/v1/problems/not_found",
            title: "Not Found",
            status: 404,
            detail: "Fixture extension not found",
            code: "extension_not_found",
          }),
        }),
        async (origin, requests) => {
          fixture.writeProjectSettings({ agents: [], skills: {} });
          const environment = {
            AXM_TELEMETRY: "1",
            AXM_TELEMETRY_BASE_URL: origin,
            AXM_TRACE: "1",
            AXM_TRACE_ENDPOINT: origin,
            AXM_NO_UPDATE_CHECK: "0",
          };
          const local = await fixture.run(["list", "--offline", "--json"], environment);
          expect(local.exitCode, local.stdout + local.stderr).toBe(0);
          expect(() => JSON.parse(local.stdout)).not.toThrow();
          for (const command of [["view", "@acme/skills/missing"], ["login"]]) {
            const result = await fixture.run(
              [...command, "--registry", origin, "--offline", "--json"],
              environment,
            );
            expect(result.exitCode, result.stdout + result.stderr).not.toBe(0);
            expect(result.stdout + result.stderr).toContain("network-required");
          }
          expect(requests).toEqual([]);
          // The same controlled origin is reachable when the prohibition is absent.
          await fixture.run(["view", "@acme/skills/missing", "--registry", origin, "--json"], {
            AXM_TELEMETRY: "0",
            AXM_TRACE: "0",
          });
          expect(requests.length).toBeGreaterThan(0);
        },
      );
    } finally {
      fixture.cleanup();
    }
  },
);

it("offline restore refuses a warm remote archive while an independent local skill converges", async () => {
  const registry = await startHttpRegistry();
  const fixture = makeEnvironmentProcessFixture(createBinaryRunner(resolveHostBinaryPath()));
  const environment = { AXM_TOKEN: "e2e-test-token", AXM_TELEMETRY: "0", AXM_TRACE: "0" };
  try {
    await publishSkill({
      registryLocation: registry.url,
      owner: "@test",
      name: "remote-offline",
      body: "Remote cached guidance.",
    });
    fixture.writeProjectSettings({
      owner: "@test",
      agents: ["claude-code"],
      instructionFiles: { fileName: "AGENTS.md" },
      sources: [{ name: "test", type: "registry", location: registry.url }],
      defaultRegistry: "test",
      minimumReleaseAge: "0s",
      skills: {},
    });
    const installed = await fixture.run(
      ["skills", "install", "@test/skills/remote-offline", "--json"],
      environment,
    );
    expect(installed.exitCode, installed.stdout + installed.stderr).toBe(0);
    const remoteNative = path.join(
      fixture.invoking,
      ".claude",
      "skills",
      "remote-offline",
      "SKILL.md",
    );
    expect(fs.readFileSync(remoteNative, "utf8")).toContain("Remote cached guidance.");
    const cached = await fixture.run(["cache", "status", "--offline", "--json"], environment);
    expect(cached.exitCode, cached.stdout + cached.stderr).toBe(0);
    const cacheStatus: unknown = JSON.parse(cached.stdout);
    expect(cacheStatus).toMatchObject({ ok: true, result: { entries: 1 } });

    fs.rmSync(path.join(fixture.invoking, "agent_extensions"), { recursive: true, force: true });
    const settingsPath = path.join(fixture.invoking, "axm.json");
    const settings: unknown = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
    if (
      typeof settings !== "object" ||
      settings === null ||
      !("skills" in settings) ||
      typeof settings.skills !== "object" ||
      settings.skills === null
    )
      throw new Error("Expected installed settings");
    fs.writeFileSync(
      settingsPath,
      JSON.stringify({ ...settings, skills: { ...settings.skills, "local-offline": "workspace" } }),
    );
    const authored = path.join(fixture.invoking, "skills", "local-offline");
    fs.mkdirSync(path.join(authored, "src"), { recursive: true });
    fs.writeFileSync(
      path.join(authored, "skill.json"),
      JSON.stringify({
        owner: "@test",
        type: "skill",
        name: "local-offline",
        version: "1.0.0",
        description: "Local offline guidance",
      }),
    );
    fs.writeFileSync(
      path.join(authored, "src", "SKILL.md"),
      "---\nname: local-offline\ndescription: Local offline guidance\n---\n# Local\nIndependent local guidance.\n",
    );
    const before = registry.requests.length;
    const restored = await fixture.run(["sync", "--offline", "--json"], {
      ...environment,
      AXM_TELEMETRY: "1",
      AXM_TELEMETRY_BASE_URL: registry.url,
      AXM_TRACE: "1",
      AXM_TRACE_ENDPOINT: registry.url,
      AXM_NO_UPDATE_CHECK: "0",
    });
    expect(restored.exitCode, restored.stdout + restored.stderr).not.toBe(0);
    expect(restored.stdout + restored.stderr).toContain("network-required");
    expect(registry.requests.length).toBe(before);
    expect(fs.existsSync(remoteNative)).toBe(false);
    expect(
      fs.readFileSync(
        path.join(fixture.invoking, ".claude", "skills", "local-offline", "SKILL.md"),
        "utf8",
      ),
    ).toContain("Independent local guidance.");
    // The inaccessible registration remains removable in ordinary online mode,
    // without an unrelated access preflight or restoring its missing content.
    const removed = await fixture.run(
      ["skills", "uninstall", "remote-offline", "--json"],
      environment,
    );
    expect(removed.exitCode, removed.stdout + removed.stderr).toBe(0);
    expect(registry.requests.length).toBe(before);
    expect(fs.readFileSync(settingsPath, "utf8")).not.toContain("remote-offline");
    expect(fs.existsSync(remoteNative)).toBe(false);
  } finally {
    fixture.cleanup();
    await registry.close();
  }
});

it("offline refuses Git helpers and authored Hook execution before their processes start", async () => {
  const fixture = makeEnvironmentProcessFixture(createBinaryRunner(resolveHostBinaryPath()));
  try {
    fixture.writeProjectSettings({ agents: [], skills: {} });
    const marker = path.join(fixture.root, "executed");
    const bin = path.join(fixture.root, "bin");
    fs.mkdirSync(bin);
    fs.writeFileSync(
      path.join(bin, "git"),
      '#!/bin/sh\nprintf executed > "$OFFLINE_EXECUTION_MARKER"\nexit 1\n',
      { mode: 0o755 },
    );
    const environment = {
      PATH: `${bin}${path.delimiter}${process.env["PATH"] ?? ""}`,
      OFFLINE_EXECUTION_MARKER: marker,
      AXM_TRACE: "0",
      AXM_TELEMETRY: "0",
    };
    const command = [
      "skills",
      "install",
      "https://example.invalid/offline-fixture.git",
      "--skill",
      "review",
      "--json",
      "--non-interactive",
    ];
    const gitOffline = await fixture.run([...command, "--offline"], environment);
    expect(gitOffline.exitCode, gitOffline.stdout + gitOffline.stderr).not.toBe(0);
    expect(gitOffline.stdout + gitOffline.stderr).toContain("network-required");
    expect(fs.existsSync(marker)).toBe(false);
    await fixture.run(command, environment);
    expect(fs.readFileSync(marker, "utf8")).toBe("executed");
    fs.rmSync(marker);

    const hook = path.join(fixture.invoking, "hooks", "offline-fixture");
    fs.mkdirSync(path.join(hook, "src"), { recursive: true });
    fs.writeFileSync(path.join(hook, "input.json"), "{}");
    fs.writeFileSync(
      path.join(hook, "src", "hook.cjs"),
      `require("node:fs").writeFileSync(${JSON.stringify(marker)}, "executed");`,
    );
    fs.writeFileSync(
      path.join(hook, "hook.json"),
      JSON.stringify({
        owner: "@test",
        type: "hook",
        name: "offline-fixture",
        version: "1.0.0",
        implementations: [
          {
            id: "claude",
            protocol: "claude-code",
            bindings: [
              {
                id: "audit",
                event: "PreToolUse",
                handler: { type: "command", runtime: "node", entrypoint: "src/hook.cjs" },
              },
            ],
          },
        ],
        fixtures: [
          {
            id: "audit",
            implementation: "claude",
            binding: "audit",
            input: "input.json",
            expect: { exitCode: 0 },
          },
        ],
      }),
    );
    const hookCommand = ["hooks", "test", hook, "--json"];
    const hookOffline = await fixture.run([...hookCommand, "--offline"], environment);
    expect(hookOffline.exitCode, hookOffline.stdout + hookOffline.stderr).not.toBe(0);
    expect(hookOffline.stdout + hookOffline.stderr).toContain("network-required");
    expect(fs.existsSync(marker)).toBe(false);
    const hookOnline = await fixture.run(hookCommand, environment);
    expect(hookOnline.exitCode, hookOnline.stdout + hookOnline.stderr).toBe(0);
    expect(fs.readFileSync(marker, "utf8")).toBe("executed");
  } finally {
    fixture.cleanup();
  }
});
