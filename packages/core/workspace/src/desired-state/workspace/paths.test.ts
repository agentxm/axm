import * as os from "node:os";
import * as path from "node:path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as ConfigProvider from "effect/ConfigProvider";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { decodeAbsolutePathSync } from "@agentxm/extension-model/unstable/path-types";
import {
  getProjectRuntimeDir,
  locateWorkspace,
  resolveUserAxmHome,
  resolveUserHome,
  resolveUserWorkspaceRoot,
} from "./paths.js";

const projectRoot = decodeAbsolutePathSync("/tmp/axm-project");

describe("paths", () => {
  describe("user paths", () => {
    for (const [label, resolve] of [
      ["user home", () => resolveUserHome().pipe(Effect.asVoid)],
      ["AXM home", () => resolveUserAxmHome().pipe(Effect.asVoid)],
      ["user workspace root", () => resolveUserWorkspaceRoot().pipe(Effect.asVoid)],
      ["user workspace location", () => locateWorkspace("user", projectRoot).pipe(Effect.asVoid)],
    ] as const) {
      it.effect(`${label} preserves configuration-source failures`, () =>
        Effect.gen(function* () {
          const sourceError = new ConfigProvider.SourceError({ message: "source unavailable" });
          const failure = yield* resolve().pipe(
            Effect.provideService(
              ConfigProvider.ConfigProvider,
              ConfigProvider.make(() => Effect.fail(sourceError)),
            ),
            Effect.flip,
          );
          expect(failure._tag).toBe("ConfigError");
          expect(failure.cause).toBe(sourceError);
        }).pipe(Effect.provide(NodeServices.layer)),
      );
    }

    it.effect("separates user home, AXM application home, and workspace root", () =>
      Effect.gen(function* () {
        expect(yield* resolveUserHome()).toBe(os.homedir());
        expect(yield* resolveUserAxmHome()).toBe(path.join(os.homedir(), ".axm"));
        expect(yield* resolveUserWorkspaceRoot()).toBe(
          path.join(os.homedir(), ".axm", "workspace"),
        );
      }).pipe(Effect.provide(NodeServices.layer)),
    );

    it.effect("honors AXM_USER_HOME as a home-directory override", () =>
      Effect.gen(function* () {
        expect(yield* resolveUserHome()).toBe("/tmp/axm-user-home");
        expect(yield* resolveUserAxmHome()).toBe("/tmp/axm-user-home/.axm");
        expect(yield* resolveUserWorkspaceRoot()).toBe("/tmp/axm-user-home/.axm/workspace");
      }).pipe(
        Effect.provide(
          Layer.mergeAll(
            NodeServices.layer,
            ConfigProvider.layer(
              ConfigProvider.fromEnv({ env: { AXM_USER_HOME: "/tmp/axm-user-home" } }),
            ),
          ),
        ),
      ),
    );

    it.effect("falls back to os.homedir when AXM_USER_HOME is empty", () =>
      Effect.gen(function* () {
        expect(yield* resolveUserHome()).toBe(os.homedir());
      }).pipe(
        Effect.provide(
          Layer.mergeAll(
            NodeServices.layer,
            ConfigProvider.layer(ConfigProvider.fromEnv({ env: { AXM_USER_HOME: "" } })),
          ),
        ),
      ),
    );
  });

  describe("getProjectRuntimeDir", () => {
    it.effect("uses the required project root", () =>
      Effect.gen(function* () {
        const result = yield* getProjectRuntimeDir(projectRoot);
        expect(result).toBe("/tmp/axm-project/.axm");
        expect(path.isAbsolute(result)).toBe(true);
      }).pipe(Effect.provide(NodeServices.layer)),
    );
  });
});
