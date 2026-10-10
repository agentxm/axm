import * as Effect from "effect/Effect";
import {
  ExitCodeDefinitions,
  appErrorCodeForExit,
  makeAppError,
} from "../../../cli/dist/src/app-error/index.js";
import { runCliMain } from "../../../cli/dist/src/cli-runtime/index.js";

const code = process.argv[2];
if (!ExitCodeDefinitions.some((entry) => appErrorCodeForExit(entry.code) === code)) {
  throw new Error(`Unknown fixture AppError code: ${String(code)}`);
}

const humanBlocked = code === "auth_required";

await runCliMain(
  () =>
    Effect.fail(
      makeAppError({
        code,
        detail: `Deterministic ${code} fixture`,
        ...(humanBlocked
          ? {
              blockedOn: "human",
              action: { kind: "open-url", url: "https://example.test/authorize" },
            }
          : {}),
      }),
    ),
  { args: process.argv.slice(3) },
);
