import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { selectCompileTargets } from "./compile.js";

it.effect("selects one release asset without cleaning sibling target outputs", () =>
  Effect.gen(function* () {
    const request = yield* selectCompileTargets(["--target=bun-linux-arm64"], "darwin", "arm64");
    expect(request.targets.map(({ output }) => output)).toEqual(["axm-linux-arm64"]);
    expect(request.output).toBe("bin");
    expect(request.cleanDirectory).toBe(false);
  }),
);

it.effect("preserves host, Windows asset names, and fresh development builds", () =>
  Effect.gen(function* () {
    const windows = yield* selectCompileTargets(["--host-only"], "win32", "x64");
    expect(windows.targets.map(({ output }) => output)).toEqual(["axm-windows-x64.exe"]);
    expect(windows.output).toBe("host-bin");
    const dev = yield* selectCompileTargets(["--host-only", "--dev-build"], "linux", "x64");
    expect(dev.output).toBe("dev-bin");
    expect(dev.devBuild).toBe(true);
  }),
);

it.effect("rejects unknown targets and contradictory compilation flags", () =>
  Effect.gen(function* () {
    for (const args of [
      ["--target=bun-unknown"],
      ["--dev-build"],
      ["--host-only", "--target=bun-linux-x64"],
      ["--target=bun-linux-x64", "--target=bun-linux-arm64"],
      ["--unknown"],
    ]) {
      expect((yield* Effect.flip(selectCompileTargets(args, "linux", "x64")))._tag).toBe(
        "CompileError",
      );
    }
  }),
);
