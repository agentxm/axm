import * as os from "node:os";
import * as nodePath from "node:path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as ConfigProvider from "effect/ConfigProvider";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import {
  AXM_DIR_NAME,
  configuredUserHome,
  osHomeDirectory,
  resolveUserAxmHome,
  resolveUserAxmHomePure,
  resolveUserHome,
} from "./user-home.js";

const withConfig = (env: Record<string, string>) =>
  Layer.mergeAll(
    NodeServices.layer,
    ConfigProvider.layer(ConfigProvider.fromEnv({ env, preserveEmptyStrings: true })),
  );

describe("user home", () => {
  it.effect("preserves configuration-source failures", () =>
    Effect.gen(function* () {
      const sourceError = new ConfigProvider.SourceError({ message: "source unavailable" });
      for (const read of [
        configuredUserHome.pipe(Effect.asVoid),
        resolveUserHome().pipe(Effect.asVoid),
        resolveUserAxmHome().pipe(Effect.asVoid),
      ]) {
        const failure = yield* read.pipe(
          Effect.provideService(
            ConfigProvider.ConfigProvider,
            ConfigProvider.make(() => Effect.fail(sourceError)),
          ),
          Effect.flip,
        );
        expect(failure._tag).toBe("ConfigError");
        expect(failure.cause).toBe(sourceError);
      }
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("uses AXM_USER_HOME for the AXM application home", () =>
    Effect.gen(function* () {
      expect(yield* configuredUserHome).toEqual(Option.some("/tmp/axm-user-home"));
      expect(yield* resolveUserHome()).toBe("/tmp/axm-user-home");
      expect(yield* resolveUserAxmHome()).toBe(nodePath.join("/tmp/axm-user-home", AXM_DIR_NAME));
      expect(resolveUserAxmHomePure(nodePath.join, "/tmp/axm-user-home")).toBe(
        nodePath.join("/tmp/axm-user-home", AXM_DIR_NAME),
      );
      expect(yield* osHomeDirectory).toBe(os.homedir());
    }).pipe(Effect.provide(withConfig({ AXM_USER_HOME: "/tmp/axm-user-home" }))),
  );

  it.effect("treats an empty override as absent", () =>
    Effect.gen(function* () {
      expect(yield* configuredUserHome).toEqual(Option.none());
      expect(yield* resolveUserHome()).toBe(os.homedir());
    }).pipe(Effect.provide(withConfig({ AXM_USER_HOME: "" }))),
  );

  it.effect("defaults to the OS account home", () =>
    Effect.gen(function* () {
      expect(yield* configuredUserHome).toEqual(Option.none());
      expect(yield* resolveUserHome()).toBe(os.homedir());
      expect(yield* resolveUserAxmHome()).toBe(nodePath.join(os.homedir(), AXM_DIR_NAME));
    }).pipe(Effect.provide(withConfig({}))),
  );
});
