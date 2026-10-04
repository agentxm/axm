// @effect-diagnostics nodeBuiltinImport:off — bounded OS account lookup adapter for Bun's environment-based userInfo implementation
import { execFile } from "node:child_process";
import { userInfo } from "node:os";
import { promisify } from "node:util";

import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
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

  // Bun documents BUN_BE_BUN for standalone executables. Use this runtime's
  // own executable so compiled installations need no additional Node or Bun.
  // Windows spawn may restore USERPROFILE automatically; clear it inside the
  // isolated child before asking the runtime's OS-backed homedir fallback.
  const query =
    "delete process.env.HOME; delete process.env.USERPROFILE; process.stdout.write(JSON.stringify(require('node:os').homedir()));";
  const fs = yield* FileSystem.FileSystem;
  // Use a regular file rather than a platform-specific null device for Bun config.
  const config = yield* fs
    .makeTempFileScoped({ prefix: "axm-account-home-", suffix: ".toml" })
    .pipe(
      Effect.mapError(
        () =>
          new Error("Operating-system account home query configuration is unavailable", {
            cause: { reason: "account-query-config-unavailable" },
          }),
      ),
    );

  const { stdout } = yield* Effect.tryPromise({
    try: (signal) =>
      execute(
        process.execPath,
        ["--no-env-file", `--config=${path.resolve(config)}`, "--eval", query],
        {
          env: { BUN_BE_BUN: "1", HOME: "", USERPROFILE: "", XDG_CONFIG_HOME: "" },
          encoding: "utf8",
          windowsHide: true,
          timeout: 10_000,
          maxBuffer: 16_384,
          signal,
        },
      ),
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
  const home = yield* Effect.try({
    try: (): unknown => JSON.parse(stdout),
    catch: () =>
      new Error("Operating-system account home response is invalid", {
        cause: { reason: "account-home-response-invalid" },
      }),
  });
  if (typeof home !== "string" || !path.isAbsolute(home) || home.includes("\u0000"))
    return yield* Effect.fail(
      new Error("Operating-system account home response is invalid", {
        cause: { reason: "account-home-response-invalid" },
      }),
    );
  return home;
}).pipe(Effect.scoped);
