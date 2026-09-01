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
  resolveUserAxmHome,
  resolveUserHome,
  resolveUserWorkspaceRoot,
} from "./paths.js";

const projectRoot = decodeAbsolutePathSync("/tmp/axm-project");

describe("paths", () => {
  describe("user paths", () => {
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
