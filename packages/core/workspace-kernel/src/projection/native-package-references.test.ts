import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import {
  nativePackageReferences,
  inspectNativePackageReferences,
  withNativePackageReferenceReadView,
} from "./native-package-references.js";

describe("retained executable references", () => {
  it.effect(
    "distinguishes structured paths from possible shell text and shares physical reads only within one query",
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const workspaceRoot = yield* fs.makeTempDirectoryScoped();
        const packageRoot = path.join(workspaceRoot, "agent_extensions/acme/server");
        const file = path.join(workspaceRoot, ".mcp.json");
        const hook = path.join(workspaceRoot, ".claude/settings.json");
        yield* fs.makeDirectory(path.dirname(hook), { recursive: true });
        yield* fs.writeFileString(
          file,
          JSON.stringify({
            mcpServers: {
              selected: { command: "node", args: [`${packageRoot}/server.js`] },
              composed: { command: "sh", args: ["-c", `${packageRoot}/check.sh && other-command`] },
            },
          }),
        );
        yield* fs.writeFileString(
          hook,
          JSON.stringify({
            hooks: {
              PreToolUse: [
                {
                  hooks: [
                    {
                      type: "command",
                      command: `sh -c '${packageRoot}/check.sh && other-command'`,
                    },
                  ],
                },
              ],
            },
          }),
        );
        const reads = new Map<string, number>();
        const counted: FileSystem.FileSystem = {
          ...fs,
          readFileString: (file, options) =>
            Effect.gen(function* () {
              reads.set(file, (reads.get(file) ?? 0) + 1);
              return yield* fs.readFileString(file, options);
            }),
        };
        const args = {
          workspaceRoot,
          packageRoot,
          scope: "project",
          nativeDirectoryInputs: { skillsDirectoryOverrides: {} },
        } satisfies Parameters<typeof inspectNativePackageReferences>[0];
        yield* withNativePackageReferenceReadView(
          Effect.gen(function* () {
            const result = yield* inspectNativePackageReferences(args);
            expect(result).toContainEqual(
              expect.objectContaining({
                path: file,
                evidence: "structured-reference",
                keys: ["mcpServers", "selected"],
                readers: expect.arrayContaining(["claude-code"]),
              }),
            );
            expect(result).toContainEqual(
              expect.objectContaining({ path: file, evidence: "possible-reference" }),
            );
            expect(result.some((reference) => reference.keys?.includes("composed"))).toBe(false);
            expect(result).toContainEqual(
              expect.objectContaining({
                path: hook,
                evidence: "possible-reference",
                readers: expect.arrayContaining(["claude-code"]),
              }),
            );
            yield* inspectNativePackageReferences({
              ...args,
              packageRoot: path.join(workspaceRoot, "other"),
            });
          }),
        ).pipe(Effect.provideService(FileSystem.FileSystem, counted));
        expect(reads.get(file)).toBe(1);
        expect(reads.get(hook)).toBe(1);
        yield* fs.writeFileString(file, JSON.stringify({ mcpServers: {} }));
        const next = yield* withNativePackageReferenceReadView(
          inspectNativePackageReferences(args),
        );
        expect(next.some((reference) => reference.path === file)).toBe(false);
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );
  for (const relative of [".mcp.json", ".claude/settings.json"]) {
    it.effect(`refuses package-deletion evidence when ${relative} cannot be decoded`, () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const workspaceRoot = yield* fs.makeTempDirectoryScoped();
        const packageRoot = path.join(workspaceRoot, "agent_extensions/acme/server");
        const source = path.join(packageRoot, "server.js");
        yield* fs.makeDirectory(packageRoot, { recursive: true });
        yield* fs.writeFileString(source, "source remains intact");
        const file = path.join(workspaceRoot, relative);
        yield* fs.makeDirectory(path.dirname(file), { recursive: true });
        yield* fs.writeFileString(file, "{invalid");
        const error = yield* nativePackageReferences({
          workspaceRoot,
          packageRoot,
          scope: "project",
          nativeDirectoryInputs: { skillsDirectoryOverrides: {} },
        }).pipe(Effect.flip);
        expect(error).toMatchObject({
          _tag: "ProjectionIoFailed",
          path: packageRoot,
          step: "inspect",
        });
        expect(yield* fs.readFileString(source)).toBe("source remains intact");
        expect(yield* fs.readFileString(file)).toBe("{invalid");
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
    );
  }
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
