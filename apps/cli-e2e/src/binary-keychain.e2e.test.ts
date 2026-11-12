import * as fs from "node:fs";
import * as path from "node:path";
import * as Effect from "effect/Effect";
import { describe, expect, it } from "@effect/vitest";
import { createBinaryRunner, createTempDir, runCommand } from "@agentxm/client-e2e-utils";
import { resolveBinaryPath } from "./distribution-targets.js";
import { startDeviceAuthServer } from "./e2e/device-auth-server.js";

export const executionBinding = {
  requirements: ["cli/credentials/native-keychain-packaging"],
  boundary: "binary",
  rationale:
    "Runs the selected Darwin artifact outside the repository with synthetic Registry credentials and a disposable default keychain, verifies persistence across processes without fallback, and restores the previous keychain settings.",
} as const;

const keychainPaths = (output: string) =>
  [...output.matchAll(/"([^"\n]+)"/g)].flatMap((match) =>
    match[1] === undefined ? [] : [match[1]],
  );

const security = (args: ReadonlyArray<string>) =>
  Effect.tryPromise(() => runCommand("/usr/bin/security", args, { timeout: 15_000 }));
const checkedSecurity = (args: ReadonlyArray<string>) =>
  security(args).pipe(
    Effect.tap((result) =>
      Effect.sync(() => {
        expect(result.exitCode, result.stderr).toBe(0);
      }),
    ),
  );

describe.skipIf(process.platform !== "darwin")("compiled macOS credential storage", () => {
  it.live(
    "writes, reads, and deletes in a disposable keychain without fallback",
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const temp = yield* Effect.acquireRelease(Effect.sync(createTempDir), (directory) =>
            Effect.sync(directory.cleanup),
          );
          const originalDefault = keychainPaths(
            (yield* checkedSecurity(["default-keychain", "-d", "user"])).stdout,
          )[0];
          expect(originalDefault).toBeDefined();
          if (originalDefault === undefined)
            throw new Error("No original default keychain was reported");
          const originalSearch = keychainPaths(
            (yield* checkedSecurity(["list-keychains", "-d", "user"])).stdout,
          );
          const keychain = path.join(temp.path, "native-smoke.keychain-db");
          // Only this test-owned keychain is deleted; the original default and search
          // list are restored even when artifact loading, approval, or assertions fail.
          yield* Effect.acquireRelease(
            checkedSecurity(["create-keychain", "-p", "synthetic-smoke-password", keychain]),
            () =>
              Effect.promise(async () => {
                for (const args of [
                  ["default-keychain", "-d", "user", "-s", originalDefault],
                  ["list-keychains", "-d", "user", "-s", ...originalSearch],
                  ["delete-keychain", keychain],
                ]) {
                  const result = await runCommand("/usr/bin/security", args, { timeout: 15_000 });
                  expect(result.exitCode, "restore and remove only the test keychain").toBe(0);
                }
              }),
          );
          yield* checkedSecurity(["unlock-keychain", "-p", "synthetic-smoke-password", keychain]);
          yield* checkedSecurity(["set-keychain-settings", "-lut", "120", keychain]);
          yield* checkedSecurity(["default-keychain", "-d", "user", "-s", keychain]);
          yield* checkedSecurity(["list-keychains", "-d", "user", "-s", keychain]);
          const auth = yield* Effect.acquireRelease(
            Effect.tryPromise(() => startDeviceAuthServer("approved")),
            (server) => Effect.promise(server.close),
          );
          const signature = yield* Effect.tryPromise(() =>
            runCommand("/usr/bin/codesign", ["--verify", "--strict", resolveBinaryPath()], {
              timeout: 15_000,
            }),
          );
          expect(signature.exitCode, signature.stderr).toBe(0);
          const isolatedBinary = path.join(temp.path, "axm-native-smoke");
          yield* Effect.sync(() => {
            fs.copyFileSync(resolveBinaryPath(), isolatedBinary);
            fs.chmodSync(isolatedBinary, 0o755);
          });
          const run = createBinaryRunner(isolatedBinary);
          // Keep the OS home so Security.framework can resolve user-domain preferences.
          // AXM state and the copied executable stay in the isolated temporary directory.
          const environment = {
            AXM_USER_HOME: temp.path,
            XDG_CONFIG_HOME: path.join(temp.path, ".config"),
            CI: "",
            SSH_CLIENT: undefined,
            SSH_TTY: undefined,
            SSH_CONNECTION: undefined,
            AXM_TOKEN: undefined,
            AXM_TOKEN_FILE: undefined,
            AXM_NO_UPDATE_CHECK: "1",
          };
          const invoke = (args: ReadonlyArray<string>) =>
            Effect.tryPromise(() =>
              run([...args, "--registry", auth.url, "--json"], {
                cwd: temp.path,
                env: environment,
                timeout: 20_000,
              }),
            );
          const fallback = path.join(temp.path, ".config", "axm", "credentials.json");
          const signedIn = yield* invoke(["login", "--wait-for-human", "10"]);
          expect(signedIn.exitCode, signedIn.stderr).toBe(0);
          expect(JSON.parse(signedIn.stdout)).toMatchObject({
            result: { status: "logged-in", handle: "@alice" },
          });
          expect(signedIn.stderr).not.toContain("OS keychain unavailable");
          expect(fs.existsSync(fallback)).toBe(false);
          yield* checkedSecurity([
            "find-generic-password",
            "-s",
            "axm",
            "-a",
            `registry:${auth.url}`,
            keychain,
          ]);
          const identity = yield* invoke(["whoami", "--debug"]);
          expect(identity.exitCode, identity.stdout + identity.stderr).toBe(0);
          expect(identity.stdout).toContain("@alice");
          const signedOut = yield* invoke(["logout"]);
          expect(signedOut.exitCode, signedOut.stderr).toBe(0);
          expect(
            (yield* security([
              "find-generic-password",
              "-s",
              "axm",
              "-a",
              `registry:${auth.url}`,
              keychain,
            ])).exitCode,
          ).toBe(44);
          expect(fs.existsSync(fallback)).toBe(false);
        }),
      ),
    60_000,
  );
});
