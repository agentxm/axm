import { it as effectIt } from "@effect/vitest";
import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem";
import { FileSystemRecorder, layerRecordingFileSystem } from "@agentxm/test-support";
import * as ConfigProvider from "effect/ConfigProvider";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as PlatformError from "effect/PlatformError";
import { describe, expect, it } from "vitest";

import { loginStrategyEnvironment } from "../adapters/environment.js";
import { selectLoginStrategy } from "./login-strategy.js";

const defaultOptions = { deviceCode: false, unattended: false };

describe("selectLoginStrategy", () => {
  it("uses loopback on a normal workstation", () => {
    expect(selectLoginStrategy(defaultOptions, {})).toBe("loopback");
  });

  it("uses device code when requested", () => {
    expect(selectLoginStrategy({ deviceCode: true, unattended: false }, {})).toBe("device-code");
  });

  it("uses device code in non-interactive mode", () => {
    expect(selectLoginStrategy({ ...defaultOptions, unattended: true }, {})).toBe("device-code");
  });

  it("uses device code for SSH sessions without a display", () => {
    expect(selectLoginStrategy(defaultOptions, { SSH_CONNECTION: "1 2 3 4" })).toBe("device-code");
  });

  it("keeps loopback for SSH sessions with a display", () => {
    expect(selectLoginStrategy(defaultOptions, { SSH_CONNECTION: "1 2 3 4", DISPLAY: ":0" })).toBe(
      "loopback",
    );
  });

  it("uses device code in CI and Codespaces", () => {
    expect(selectLoginStrategy(defaultOptions, { CI: "1" })).toBe("device-code");
    expect(selectLoginStrategy(defaultOptions, { CODESPACES: "true" })).toBe("device-code");
  });

  it("uses device code over SSH without a display even when BROWSER is set", () => {
    expect(
      selectLoginStrategy(defaultOptions, {
        platform: "linux",
        SSH_CONNECTION: "1 2 3 4",
        BROWSER: "w3m",
      }),
    ).toBe("device-code");
  });
});

const PROC_VERSION = "/proc/version";

const procVersionFailure = (method: string, reason: "NotFound" | "PermissionDenied") =>
  PlatformError.systemError({
    _tag: reason,
    module: "FileSystem",
    method,
    pathOrDescriptor: PROC_VERSION,
  });

/** A host whose /proc/version holds `content`, cannot be read, or is absent. */
const procVersionHost = (content: string | "NotFound" | "PermissionDenied") =>
  layerRecordingFileSystem(
    Layer.succeed(
      FileSystem.FileSystem,
      FileSystem.makeNoop({
        access: (path) =>
          path === PROC_VERSION && content !== "NotFound"
            ? Effect.void
            : Effect.fail(procVersionFailure("access", "NotFound")),
        readFile: (path) =>
          path !== PROC_VERSION || content === "NotFound"
            ? Effect.fail(procVersionFailure("readFile", "NotFound"))
            : content === "PermissionDenied"
              ? Effect.fail(procVersionFailure("readFile", "PermissionDenied"))
              : Effect.succeed(new TextEncoder().encode(content)),
      }),
    ),
  );

const evaluateEnvironment = <E>(host: Layer.Layer<FileSystem.FileSystem | FileSystemRecorder, E>) =>
  Effect.gen(function* () {
    const environment = yield* loginStrategyEnvironment;
    const recording = yield* FileSystemRecorder;
    return { isWSL: environment.isWSL, counts: recording.counts(PROC_VERSION) };
  }).pipe(
    Effect.provide(Layer.merge(host, ConfigProvider.layer(ConfigProvider.fromEnvRecord({})))),
  );

describe.runIf(process.platform === "linux")("loginStrategyEnvironment on Linux", () => {
  effectIt.live("reads the host platform version once to decide WSL", () =>
    Effect.gen(function* () {
      const observed = yield* evaluateEnvironment(layerRecordingFileSystem(NodeFileSystem.layer));
      expect(observed.counts).toEqual({ readFile: 1 });
    }),
  );

  effectIt.effect("recognizes a WSL kernel version", () =>
    Effect.gen(function* () {
      const observed = yield* evaluateEnvironment(
        procVersionHost("Linux version 5.15.0-microsoft-standard-WSL2"),
      );
      expect(observed.isWSL).toBe(true);
    }),
  );

  for (const [label, content] of [
    ["an absent", "NotFound"],
    ["an unreadable", "PermissionDenied"],
    ["an empty", ""],
    ["a native Linux", "Linux version 6.12.0-generic"],
  ] as const) {
    effectIt.effect(`treats ${label} platform version as not WSL`, () =>
      Effect.gen(function* () {
        const observed = yield* evaluateEnvironment(procVersionHost(content));
        expect(observed.isWSL).toBe(false);
      }),
    );
  }
});
