import { realpathSync } from "node:fs";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import { FileSystemRecorder, layerRecordingFileSystem } from "@agentxm/test-support";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import * as Result from "effect/Result";
import { McpConfigInvalid, McpConfigIoFailed } from "../errors.js";
import { NativeLocationError } from "../../locations/index.js";
import { NativePlatformTest, workObservations } from "../../locations/testing.js";
import { readNativeMcpConfig } from "./native-config.js";
import { readCompetingMcpEntries } from "./competing-entries.js";

it.effect.each(["same path", "alias"] as const)(
  "keeps a distinct interpreted container competing through %s",
  (route) =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fs.makeTempDirectoryScoped();
      const target = path.join(root, "native.json");
      const alias = path.join(root, "alias.json");
      yield* fs.writeFileString(
        target,
        '{"mcpServers":{"context":{"command":"owned"}},"other":{"context":{"command":"foreign"}}}',
      );
      if (route === "alias") yield* fs.symlink("native.json", alias);
      const competing = yield* readCompetingMcpEntries({
        agentId: "cursor",
        workspaceRoot: root,
        target: { path: target, scope: "project", format: "json", attribution: "agent" },
        serversPath: ["mcpServers"],
        locations: [
          { path: route === "alias" ? alias : target, format: "json", serversPath: ["other"] },
        ],
      });
      expect(competing).toHaveLength(1);
      expect(competing[0]).toMatchObject({ name: "context", blocks: true });
    }).pipe(Effect.scoped, Effect.provide(NativePlatformTest)),
);

/**
 * Work evidence for one competing-entry read of the target's own container:
 * bytes the location's grammar already accepted are not parsed again under
 * the same grammar, while a different strict grammar still checks them and
 * the referent of each spelling stays a live observation.
 */
describe("competing-entry reads of the target's own container", () => {
  type Format = "json" | "jsonc";

  const declared = '{\n  "mcpServers": {\n    "context": { "command": "owned" }\n  }\n}\n';

  /** Read the competing entries of one container after fixture setup is forgotten. */
  const inspect = (options: {
    readonly bytes: string;
    readonly locationFormat: Format;
    readonly targetFormat: Format;
    readonly spelling?: "target" | "alias" | "other";
    readonly failReferent?: boolean;
  }) =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const recording = yield* FileSystemRecorder;
      const root = realpathSync(yield* fs.makeTempDirectoryScoped());
      const target = path.join(root, ".mcp.json");
      const alias = path.join(root, "alias.json");
      const other = path.join(root, "other.json");
      yield* fs.writeFileString(target, options.bytes);
      yield* fs.symlink(".mcp.json", alias);
      yield* fs.writeFileString(other, options.bytes);
      const location =
        options.spelling === "alias" ? alias : options.spelling === "other" ? other : target;
      const observations = workObservations(false);
      recording.reset();
      const result = yield* readCompetingMcpEntries(
        {
          agentId: "cursor",
          workspaceRoot: root,
          target: {
            path: target,
            scope: "project",
            format: options.targetFormat,
            attribution: "agent",
          },
          serversPath: ["mcpServers"],
          locations: [
            { path: location, format: options.locationFormat, serversPath: ["mcpServers"] },
          ],
        },
        options.failReferent === true
          ? {
              read: readNativeMcpConfig,
              referent: (configPath) =>
                Effect.fail(new NativeLocationError({ target: configPath, reason: "unreadable" })),
            }
          : undefined,
      ).pipe(observations.provide, Effect.result);
      return {
        result,
        location,
        parses: observations.facts.filter((fact) => fact.kind === "axm.parse.native").length,
        reads: recording.contentReads(location),
        referents: recording.counts(location).realPath ?? 0,
      };
    }).pipe(
      Effect.scoped,
      // The recording filesystem replaces the platform's own.
      Effect.provide(Layer.merge(NodeServices.layer, layerRecordingFileSystem(NodeServices.layer))),
    );

  it.effect.each(["target", "alias"] as const)(
    "parses a same-grammar spelling of the target once and still resolves its referent (%s)",
    (spelling) =>
      Effect.gen(function* () {
        const observed = yield* inspect({
          bytes: declared,
          locationFormat: "json",
          targetFormat: "json",
          spelling,
        });
        expect(Result.getOrUndefined(observed.result)).toEqual([]);
        expect(observed.parses).toBe(1);
        expect(observed.reads).toBe(1);
        expect(observed.referents).toBe(1);
      }),
  );

  it.effect("still checks the target's strict grammar over a JSONC spelling's bytes", () =>
    Effect.gen(function* () {
      const observed = yield* inspect({
        bytes: declared,
        locationFormat: "jsonc",
        targetFormat: "json",
      });
      expect(Result.getOrUndefined(observed.result)).toEqual([]);
      expect(observed.parses).toBe(2);
      expect(observed.reads).toBe(1);
    }),
  );

  it.effect.each([
    ["a comment", '{\n  // owned\n  "mcpServers": { "context": { "command": "owned" } }\n}\n'],
    ["a trailing comma", '{\n  "mcpServers": { "context": { "command": "owned" }, }\n}\n'],
  ] as const)("refuses JSONC bytes with %s that the strict target grammar rejects", ([, bytes]) =>
    Effect.gen(function* () {
      const observed = yield* inspect({ bytes, locationFormat: "jsonc", targetFormat: "json" });
      expect(observed.result._tag).toBe("Failure");
      if (observed.result._tag === "Failure") {
        expect(observed.result.failure).toBeInstanceOf(McpConfigInvalid);
        expect(observed.result.failure).toMatchObject({
          detail: `Invalid MCP config JSON/JSONC: ${observed.location}`,
        });
      }
      expect(observed.parses).toBe(2);
    }),
  );

  it.effect("reports a different container's same-container entries as blocking", () =>
    Effect.gen(function* () {
      const observed = yield* inspect({
        bytes: declared,
        locationFormat: "json",
        targetFormat: "json",
        spelling: "other",
      });
      expect(observed.result._tag).toBe("Success");
      if (observed.result._tag === "Success")
        expect(observed.result.success).toEqual([
          expect.objectContaining({ name: "context", blocks: true }),
        ]);
      expect(observed.parses).toBe(1);
    }),
  );

  it.effect("fails an unresolvable referent after the location's bytes parse", () =>
    Effect.gen(function* () {
      const observed = yield* inspect({
        bytes: declared,
        locationFormat: "json",
        targetFormat: "json",
        failReferent: true,
      });
      expect(observed.result._tag).toBe("Failure");
      if (observed.result._tag === "Failure") {
        expect(observed.result.failure).toBeInstanceOf(McpConfigIoFailed);
        expect(observed.result.failure).toMatchObject({
          detail: "Cannot inspect competing MCP location",
        });
      }
      expect(observed.parses).toBe(1);
    }),
  );
});
