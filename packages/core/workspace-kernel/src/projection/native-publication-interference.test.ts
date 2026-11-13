/** Real native publication must not turn an intervening edit into rollback authority. */
import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import { writeAgentMcpConfig, WriteBackupRetained } from "../agent-adapters/index.js";
import { NativePlatformTest } from "../locations/testing.js";
import { runWorkspaceTransaction } from "../settlement/index.js";
import { WorkspaceFileWriteLocksLive } from "../settlement/live.js";
import { WorkspaceTransactionScopeTest } from "../settlement/testing.js";
import { WorkspaceReadTest } from "../workspace-state/testing.js";
import { NativeWriteAuthorityLive } from "./live.js";

it.effect(
  "retains a foreign native entry changed after an in-place write and before recording",
  () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fs.makeTempDirectoryScoped().pipe(Effect.flatMap(fs.realPath));
      const target = path.join(root, "native.json");
      const before =
        '{"mcpServers":{"context":{"command":"old"},"foreign":{"command":"keep"}},"unrelated":true}';
      const foreign =
        '{"mcpServers":{"context":{"command":"new"},"foreign":{"command":"foreign-edit"}},"unrelated":true}';
      yield* fs.writeFileString(target, before);
      let injected = false;
      const injectionFailures: string[] = [];
      const forwarding: FileSystem.FileSystem = {
        ...fs,
        writeFileString: (file, content, options) =>
          fs.writeFileString(file, content, options).pipe(
            Effect.tap(() => {
              if (file !== target || injected) return Effect.void;
              injected = true;
              return fs.writeFileString(target, foreign).pipe(
                Effect.tapError((error) =>
                  Effect.sync(() => {
                    injectionFailures.push(String(error));
                  }),
                ),
              );
            }),
          ),
      };
      const authority = NativeWriteAuthorityLive.pipe(
        Layer.provide(
          Layer.merge(WorkspaceReadTest({ baseDir: root }), WorkspaceFileWriteLocksLive),
        ),
      );
      const result = yield* runWorkspaceTransaction({
        claimDefaultTargets: false,
        targets: [target],
        transition: writeAgentMcpConfig({
          workspaceRoot: root,
          serverName: "context",
          serversPath: ["mcpServers"],
          target: { path: target, scope: "project", format: "json", attribution: "agent" },
          entry: { command: "new" },
        }).pipe(
          Effect.tapError((error) =>
            error instanceof WriteBackupRetained
              ? Effect.addFinalizer(() =>
                  fs
                    .remove(path.dirname(error.backupPath), { recursive: true, force: true })
                    .pipe(Effect.orDie),
                )
              : Effect.void,
          ),
          Effect.andThen(Effect.fail("later-step-failed")),
        ),
        validate: () => Effect.void,
      }).pipe(
        Effect.provide([
          authority,
          WorkspaceTransactionScopeTest({
            workspaceDir: path.join(root, ".axm"),
            settingsPath: path.join(root, "axm.json"),
            lockPath: path.join(root, "axm.lock"),
          }),
        ]),
        Effect.provideService(FileSystem.FileSystem, forwarding),
        Effect.result,
      );
      expect(injectionFailures).toEqual([]);
      expect(injected).toBe(true);
      if (
        result._tag !== "Failure" ||
        typeof result.failure === "string" ||
        result.failure._tag !== "WorkspaceRestorationIncomplete"
      )
        return expect.fail("Expected foreign native content and retained recovery evidence");
      const snapshotDir = result.failure.snapshotDir;
      if (snapshotDir !== undefined)
        yield* Effect.addFinalizer(() =>
          fs.remove(snapshotDir, { recursive: true, force: true }).pipe(Effect.orDie),
        );
      expect(yield* fs.readFileString(target)).toBe(foreign);
      const recovery = result.failure.recovery.find((entry) => entry.originalPath === target);
      expect(recovery?.kind).toBe("snapshot");
      if (recovery !== undefined)
        expect(yield* fs.readFileString(recovery.recoveryPath)).toBe(before);
    }).pipe(Effect.scoped, Effect.provide(NativePlatformTest)),
);
