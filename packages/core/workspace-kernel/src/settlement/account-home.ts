// @effect-diagnostics nodeBuiltinImport:off — bounded OS account lookup adapter for Bun's environment-based userInfo implementation
import { execFile } from "node:child_process";
import { userInfo } from "node:os";
import { promisify } from "node:util";

import * as Effect from "effect/Effect";
import * as Path from "effect/Path";

const execute = promisify(execFile);

/** The account database owns this address; workspace environment overrides do not. */
export const accountHome = Effect.gen(function* () {
  const path = yield* Path.Path;
  // Node uses the account database. Bun 1.3.14 delegates to homedir(), which
  // trusts HOME / USERPROFILE instead (oven-sh/bun#39859). Its Worker env
  // option does not isolate that lookup either. Query the OS account service
  // without changing this process's environment or depending on a Node install.
  if (process.versions["bun"] === undefined) {
    return yield* Effect.try({
      try: () => userInfo().homedir,
      catch: () =>
        new Error("Operating-system account home is unavailable", {
          cause: { reason: "account-home-unavailable" },
        }),
    });
  }

  const uid = process.geteuid?.();
  const query =
    process.platform === "linux" && uid !== undefined
      ? { command: "getent", args: ["passwd", String(uid)] }
      : process.platform === "darwin" && uid !== undefined
        ? { command: "/usr/bin/dscacheutil", args: ["-q", "user", "-a", "uid", String(uid)] }
        : process.platform === "win32"
          ? {
              command: "powershell.exe",
              args: [
                "-NoLogo",
                "-NoProfile",
                "-NonInteractive",
                "-Command",
                "[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false); [Environment]::GetFolderPath([Environment+SpecialFolder]::UserProfile)",
              ],
            }
          : undefined;
  if (query === undefined)
    return yield* Effect.fail(
      new Error("Operating-system account lookup is unsupported", {
        cause: { reason: "account-lookup-unsupported" },
      }),
    );

  const { stdout } = yield* Effect.tryPromise({
    try: (signal) =>
      execute(query.command, query.args, {
        encoding: "utf8",
        windowsHide: true,
        timeout: 10_000,
        maxBuffer: 16_384,
        signal,
      }),
    catch: (cause) => {
      const failure = typeof cause === "object" && cause !== null ? cause : {};
      const code = "code" in failure ? failure.code : undefined;
      const killed = "killed" in failure ? failure.killed : undefined;
      const signal = "signal" in failure ? failure.signal : undefined;
      // execFile errors also contain command/output; retain only bounded process facts.
      return new Error("Operating-system account home lookup failed", {
        cause: {
          reason: "account-query-failed",
          ...((typeof code === "number" && Number.isSafeInteger(code)) ||
          (typeof code === "string" && /^[A-Z][A-Z0-9_]{0,63}$/u.test(code))
            ? { code }
            : {}),
          ...(typeof killed === "boolean" ? { killed } : {}),
          ...(signal === null || (typeof signal === "string" && /^SIG[A-Z0-9]{1,29}$/u.test(signal))
            ? { signal }
            : {}),
        },
      });
    },
  });
  const lines = stdout.replace(/(?:\r?\n)+$/u, "").split(/\r?\n/u);
  const home =
    process.platform === "linux"
      ? lines.length === 1 && lines[0]?.split(":")[2] === String(uid)
        ? lines[0].split(":")[5]
        : undefined
      : process.platform === "darwin"
        ? lines.filter((line) => line.startsWith("dir: ")).length === 1 &&
          lines.includes(`uid: ${String(uid)}`)
          ? lines.find((line) => line.startsWith("dir: "))?.slice(5)
          : undefined
        : lines.length === 1
          ? lines[0]
          : undefined;
  if (home === undefined || !path.isAbsolute(home) || home.includes("\u0000"))
    return yield* Effect.fail(
      new Error("Operating-system account home response is invalid", {
        cause: { reason: "account-home-response-invalid" },
      }),
    );
  return home;
});
