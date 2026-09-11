import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import { sanitizeExternalOutput, Subprocess, SubprocessLive } from "./subprocess.js";

const testLayer = SubprocessLive.pipe(Layer.provide(NodeServices.layer));

describe("sanitizeExternalOutput", () => {
  it("strips ANSI and control injection while preserving newline and tab", () => {
    const result = sanitizeExternalOutput(
      "\u001b[31mred\u001b[0m\u0000ok\nnext\tcell\u009b31m",
      [],
    );
    expect(result.value).toBe("redok\nnext\tcell");
    expect(result.truncated).toBe(false);
  });

  it("redacts URL credentials, authorization tokens, and known secrets", () => {
    const result = sanitizeExternalOutput(
      "https://alice:password@example.test Bearer abc.def.ghi token=super-secret",
      ["super-secret"],
    );
    expect(result.value).not.toContain("password");
    expect(result.value).not.toContain("abc.def.ghi");
    expect(result.value).not.toContain("super-secret");
    expect(result.value).toContain("[REDACTED]");
  });

  it("retains at most 8 KiB and marks truncation", () => {
    const result = sanitizeExternalOutput("x".repeat(10_000), []);
    expect(new TextEncoder().encode(result.value).length).toBeLessThanOrEqual(8192);
    expect(result.truncated).toBe(true);
  });

  it.live("distinguishes exited, not-started, and timed-out commands", () =>
    Effect.gen(function* () {
      const subprocess = yield* Subprocess;
      const exited = yield* subprocess.run(process.execPath, ["-e", "process.stdout.write('ok')"]);
      const notStarted = yield* subprocess.run("axm-command-that-does-not-exist", []);
      const timedOut = yield* subprocess.run(
        process.execPath,
        ["-e", "setTimeout(() => undefined, 1000)"],
        { timeoutMs: 5 },
      );

      expect(exited).toMatchObject({
        executionState: "exited",
        exitCode: 0,
        stdout: "ok",
      });
      expect(notStarted).toMatchObject({
        executionState: "not-started",
        exitCode: null,
      });
      expect(timedOut).toMatchObject({
        executionState: "timed-out",
        exitCode: null,
      });
    }).pipe(Effect.provide(testLayer)),
  );

  it.live("resolves an absolute executable from the current PATH snapshot", () =>
    Effect.gen(function* () {
      const subprocess = yield* Subprocess;
      expect(yield* subprocess.resolveExecutable(process.execPath)).toBe(process.execPath);
    }).pipe(Effect.provide(testLayer)),
  );
});
