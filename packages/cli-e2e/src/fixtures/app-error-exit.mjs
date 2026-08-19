import { AppErrorCodes, makeAppError } from "../../../core/dist/src/unstable/app-error/index.js";
import { runCliMain } from "../../../core/dist/src/unstable/cli-runtime/index.js";

const code = process.argv[2];
if (!AppErrorCodes.includes(code)) {
  throw new Error(`Unknown fixture AppError code: ${String(code)}`);
}

const humanBlocked = code === "auth_required";

await runCliMain(
  () => {
    throw makeAppError({
      code,
      detail: `Deterministic ${code} fixture`,
      ...(humanBlocked
        ? {
            blockedOn: "human",
            action: { kind: "open-url", url: "https://example.test/authorize" },
          }
        : {}),
    });
  },
  { args: process.argv.slice(3) },
);
