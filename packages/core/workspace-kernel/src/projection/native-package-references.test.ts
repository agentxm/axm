import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import { nativePackageReferences } from "./native-package-references.js";

describe("retained executable references", () => {
  it.effect("keeps unconfigured readers and foreign keys in the package-deletion guard", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const workspaceRoot = yield* fs.makeTempDirectoryScoped();
      const packageRoot = path.join(workspaceRoot, "agent_extensions/acme/server");
      const file = path.join(workspaceRoot, ".mcp.json");
      const args = {
        workspaceRoot,
        packageRoot,
        scope: "project" as const,
        nativeDirectoryInputs: { skillsDirectoryOverrides: {} },
      };
      yield* fs.writeFileString(
        file,
        JSON.stringify({
          mcpServers: {
            selected: { command: "node", args: [`${packageRoot}/server.js`] },
            unrelated: { command: "node", args: ["other.js"] },
          },
        }),
      );
      expect(yield* nativePackageReferences(args)).toEqual([file]);
      expect(
        yield* nativePackageReferences({
          ...args,
          withdrawal: { type: "mcp-server", name: "selected", agentIds: ["claude-code"] },
        }),
      ).toEqual([]);
      expect(
        yield* nativePackageReferences({
          ...args,
          withdrawal: { type: "mcp-server", name: "unrelated", agentIds: ["claude-code"] },
        }),
      ).toEqual([file]);
      expect(yield* fs.readFileString(file)).toContain("selected");
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect("resolves executable aliases and preserves unsafe composed Hook references", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const workspaceRoot = yield* fs.makeTempDirectoryScoped();
      const packageRoot = path.join(workspaceRoot, "hooks/audit");
      yield* fs.makeDirectory(packageRoot, { recursive: true });
      yield* fs.writeFileString(path.join(packageRoot, "run.js"), "");
      yield* fs.symlink("hooks/audit/run.js", path.join(workspaceRoot, "alias.js"));
      const mcp = path.join(workspaceRoot, ".mcp.json");
      yield* fs.writeFileString(
        mcp,
        JSON.stringify({ mcpServers: { foreign: { command: "node", args: ["alias.js"] } } }),
      );
      const config = path.join(workspaceRoot, ".claude/settings.json");
      yield* fs.makeDirectory(path.dirname(config), { recursive: true });
      yield* fs.writeFileString(
        config,
        JSON.stringify({
          hooks: {
            Stop: [
              {
                hooks: [{ type: "command", command: `node "$(cat '${packageRoot}/run.js')"` }],
              },
            ],
          },
        }),
      );
      const args = {
        workspaceRoot,
        packageRoot,
        scope: "project" as const,
        nativeDirectoryInputs: { skillsDirectoryOverrides: {} },
      };
      expect(
        yield* nativePackageReferences({
          ...args,
          withdrawal: { type: "hook", name: "audit", agentIds: ["claude-code"] },
        }),
      ).toEqual([config, mcp].sort());
      yield* fs.writeFileString(
        config,
        JSON.stringify({
          hooks: {
            Stop: [{ hooks: [{ type: "command", command: `node "$(cat 'hooks/audit/run.js')"` }] }],
          },
        }),
      );
      expect(
        yield* nativePackageReferences({
          ...args,
          withdrawal: { type: "hook", name: "audit", agentIds: ["claude-code"] },
        }),
      ).toEqual([config, mcp].sort());
      yield* fs.writeFileString(
        config,
        JSON.stringify({
          hooks: {
            Stop: [{ hooks: [{ type: "command", command: `node '${packageRoot}/run.js'` }] }],
          },
        }),
      );
      expect(
        yield* nativePackageReferences({
          ...args,
          withdrawal: { type: "hook", name: "audit", agentIds: ["claude-code"] },
        }),
      ).toEqual([mcp]);
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );
});
