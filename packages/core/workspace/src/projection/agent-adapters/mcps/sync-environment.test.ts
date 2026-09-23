import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as ConfigProvider from "effect/ConfigProvider";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import { HandleSchema } from "@agentxm/extension-model/unstable/extensions/handle";
import { makeRecordingNativeWriteAuthority } from "../testing.js";
import {
  addMcpServerConfigFirst,
  addMcpServerMixed,
  removeMcpServerConfigFirst,
  removeMcpServerMixed,
} from "./sync.js";

const owner = Schema.decodeUnknownSync(HandleSchema)("@acme");

describe("MCP executable configuration", () => {
  it.effect("verifies the updated file after configuration preparation succeeds", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const root = yield* fs.makeTempDirectoryScoped();
      const configPath = `${root}/mcp.json`;
      const authority = yield* makeRecordingNativeWriteAuthority;
      const result = yield* addMcpServerConfigFirst(
        {
          configPath,
          verifyCommand: [
            process.execPath,
            "-e",
            `const file = require("node:fs").readFileSync(${JSON.stringify(configPath)}, "utf8"); if (!JSON.parse(file).servers.example) process.exit(1);`,
          ],
        },
        {
          workspaceRoot: root,
          serverName: "example",
          canonicalPath: root,
          owner,
          resolvedVersion: "1.0.0",
        },
      ).pipe(
        Effect.provide(
          Layer.mergeAll(
            authority.layer,
            ConfigProvider.layer(ConfigProvider.fromEnv({ env: {} })),
          ),
        ),
      );
      expect(result).toEqual({ _tag: "success" });
      expect((yield* authority.observed).protectedPaths).toEqual([configPath]);
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect.each(["add-first", "remove-first", "add-mixed", "remove-mixed"] as const)(
    "stops $0 before a write when executable configuration fails",
    (operation) =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const root = yield* fs.makeTempDirectoryScoped();
        const configPath = `${root}/mcp.json`;
        const original = '{"servers":{"existing":{"command":"keep"}}}';
        yield* fs.writeFileString(configPath, original);
        const sourceError = new ConfigProvider.SourceError({ message: "source unavailable" });
        const authority = yield* makeRecordingNativeWriteAuthority;
        const args = {
          workspaceRoot: root,
          serverName: "example",
          canonicalPath: root,
          owner,
          resolvedVersion: "1.0.0",
        };
        const strategy = {
          configPath,
          verifyCommand: ["agent-cli", "list"],
          cliAdd: ["agent-cli", "add"],
          cliRemove: ["agent-cli", "remove"],
        };
        const action =
          operation === "add-first"
            ? addMcpServerConfigFirst(strategy, args)
            : operation === "remove-first"
              ? removeMcpServerConfigFirst(strategy, args)
              : operation === "add-mixed"
                ? addMcpServerMixed(strategy, args)
                : removeMcpServerMixed(strategy, args);
        const failure = yield* action.pipe(
          Effect.provide(
            Layer.mergeAll(
              authority.layer,
              ConfigProvider.layer(ConfigProvider.make(() => Effect.fail(sourceError))),
            ),
          ),
          Effect.flip,
        );
        expect(failure._tag).toBe("ConfigError");
        expect(failure.cause).toBe(sourceError);
        expect(yield* fs.readFileString(configPath)).toBe(original);
        expect(yield* authority.observed).toEqual({ protectedPaths: [], records: [] });
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );
});
