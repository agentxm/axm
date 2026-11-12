import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import { NativePlatformTest } from "../../locations/testing.js";
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
