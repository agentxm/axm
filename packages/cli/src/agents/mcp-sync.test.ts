import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import * as nodePath from "node:path";
import * as FileSystem from "effect/FileSystem";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { addMcpServerMixed, removeMcpServerMixed, runCliInvocation } from "./mcp-sync.js";

const addArgs = (workspaceRoot: string) => ({
  workspaceRoot,
  serverName: "chrome-devtools-mcp",
  canonicalPath: `${workspaceRoot}/.axm/mcp-servers/chrome-devtools-mcp`,
  profile: "@mcp",
  resolvedVersion: "1.0.0",
});

const withNode = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  effect.pipe(Effect.provide(NodeServices.layer));

describe("mcp-sync helpers", () => {
  it.effect("captures output and redacts secrets from CLI output", () =>
    withNode(
      Effect.gen(function* () {
        const result = yield* runCliInvocation({
          command: process.execPath,
          args: [
            "-e",
            "process.stdout.write('token=abc123 key:secret123 bearer qwerty'); process.stderr.write('password=hidden')",
          ],
          timeoutMs: 2000,
          cwd: process.cwd(),
        });

        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain("token=[REDACTED]");
        expect(result.stdout).toContain("key=[REDACTED]");
        expect(result.stdout).toContain("bearer [REDACTED]");
        expect(result.stderr).toContain("password=[REDACTED]");
      }),
    ),
  );

  it.effect("returns timeout outcome for long-running command", () =>
    withNode(
      Effect.gen(function* () {
        const result = yield* runCliInvocation({
          command: process.execPath,
          args: ["-e", "setTimeout(() => {}, 5000)"],
          timeoutMs: 50,
          cwd: process.cwd(),
        });

        expect(result.exitCode).toBe(124);
        expect(result.stderr).toContain("timed out");
      }),
    ),
  );

  it.effect("falls back to config when CLI is unavailable", () =>
    withNode(
      Effect.gen(function* () {
        const workspaceRoot = mkdtempSync(nodePath.join(tmpdir(), "axm-mcp-sync-"));
        try {
          const outcome = yield* addMcpServerMixed(
            {
              configPath: "{workspaceRoot}/.agent/mcp.json",
              cliAdd: ["__missing_bin__", "mcp", "add", "{serverName}"],
              cliRemove: ["__missing_bin__", "mcp", "remove", "{serverName}"],
            },
            addArgs(workspaceRoot),
          );

          expect(outcome._tag).toBe("success");

          const fs = yield* FileSystem.FileSystem;
          const config = yield* fs.readFileString(`${workspaceRoot}/.agent/mcp.json`);
          expect(config).toContain('"chrome-devtools-mcp"');
        } finally {
          rmSync(workspaceRoot, { recursive: true, force: true });
        }
      }),
    ),
  );

  it.effect("maps idempotent add/remove CLI outputs to success", () =>
    withNode(
      Effect.gen(function* () {
        const workspaceRoot = mkdtempSync(nodePath.join(tmpdir(), "axm-mcp-sync-"));
        try {
          const addOutcome = yield* addMcpServerMixed(
            {
              configPath: "{workspaceRoot}/.agent/mcp.json",
              cliAdd: [
                process.execPath,
                "-e",
                "process.stderr.write('already exists'); process.exit(1)",
              ],
              cliRemove: [
                process.execPath,
                "-e",
                "process.stderr.write('not configured'); process.exit(1)",
              ],
            },
            addArgs(workspaceRoot),
          );
          expect(addOutcome._tag).toBe("success");

          const removeOutcome = yield* removeMcpServerMixed(
            {
              configPath: "{workspaceRoot}/.agent/mcp.json",
              cliAdd: [
                process.execPath,
                "-e",
                "process.stderr.write('already exists'); process.exit(1)",
              ],
              cliRemove: [
                process.execPath,
                "-e",
                "process.stderr.write('not configured'); process.exit(1)",
              ],
            },
            {
              workspaceRoot,
              serverName: "chrome-devtools-mcp",
            },
          );
          expect(removeOutcome._tag).toBe("success");
        } finally {
          rmSync(workspaceRoot, { recursive: true, force: true });
        }
      }),
    ),
  );

  it.effect("returns unsupported for adapters on unsupported platforms", () =>
    withNode(
      Effect.gen(function* () {
        const workspaceRoot = mkdtempSync(nodePath.join(tmpdir(), "axm-mcp-sync-"));
        try {
          const outcome = yield* addMcpServerMixed(
            {
              configPath: "{workspaceRoot}/.agent/mcp.json",
              cliAdd: ["claude", "mcp", "add", "{serverName}"],
              cliRemove: ["claude", "mcp", "remove", "{serverName}"],
              supportedPlatforms: process.platform === "darwin" ? ["linux"] : ["darwin"],
            },
            addArgs(workspaceRoot),
          );

          expect(outcome._tag).toBe("unsupported");
          if (outcome._tag === "unsupported") {
            expect(outcome.reason).toContain("supported platforms");
            expect(outcome.reason).toContain(process.platform);
          }
        } finally {
          rmSync(workspaceRoot, { recursive: true, force: true });
        }
      }),
    ),
  );
});
