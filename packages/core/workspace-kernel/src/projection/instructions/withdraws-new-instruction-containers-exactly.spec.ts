import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import { defineSpecification } from "@agentxm/specification-metadata";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import { WorkspaceFileWriteLocksLive } from "../../settlement/live.js";
import { WorkspaceReadTest } from "../../workspace-state/testing.js";
import { WorkspaceLocation } from "../../workspace-state/index.js";
import { NativeWriteAuthorityLive } from "../live.js";
import {
  observeInstructionProjection,
  removeInstructionsGitignore,
  removeManagedInstructionTargets,
  syncInstructions,
} from "../index.js";

export const specification = defineSpecification({
  requirement: "workspace/instructions/withdraws-new-containers-exactly",
  title: "New instruction routing leaves bounded removable scaffolding",
  statement:
    "Withdrawing a newly introduced instruction route shall restore the authored ignore-file baseline and remove only continuously proven empty native directories, preserving foreign additions and preexisting directories.",
  class: "functional",
  role: "supporting",
  goals: ["workspace-intent-fidelity", "safe-repetition"],
  boundary: "platform",
  boundaryRationale:
    "Real entry identities distinguish introduced containers from recreated or preexisting directories.",
  methods: ["example"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("instruction container withdrawal", () => {
  it.effect("withdraws an instruction route under an explicit external user config root", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const parent = yield* fs.makeTempDirectoryScoped();
      const home = path.join(parent, "home");
      const external = path.join(parent, "codex");
      yield* fs.makeDirectory(home);
      yield* fs.writeFileString(path.join(home, "AGENTS.md"), "source\n");
      const nativeDirectoryInputs = {
        skillsDirectoryOverrides: {},
        userConfigRootOverrides: { codex: external },
      };
      const location = Layer.effect(
        WorkspaceLocation,
        Effect.map(WorkspaceLocation, (current) => ({
          ...current,
          scope: "user" as const,
          nativeDirectoryInputs,
        })),
      ).pipe(Layer.provide(WorkspaceReadTest({ baseDir: home })));
      const authority = NativeWriteAuthorityLive.pipe(
        Layer.provide(Layer.merge(location, WorkspaceFileWriteLocksLive)),
      );
      yield* Effect.gen(function* () {
        const args = {
          workspaceRoot: home,
          scope: "user" as const,
          nativeDirectoryInputs,
          configuredAgents: ["codex"],
          config: { fileName: "AGENTS.md", gitignoreAliases: false },
          symlinkSupported: true,
        };
        yield* syncInstructions({ ...args, eligibleAgentIds: ["codex"], dryRun: false });
        expect(yield* fs.readFileString(path.join(external, "AGENTS.md"))).toBe("source\n");
        const removal = yield* syncInstructions({ ...args, configuredAgents: [], dryRun: false });
        expect(removal.removed).toContain(path.join(external, "AGENTS.md"));
        expect(yield* fs.exists(external)).toBe(false);
        expect(yield* fs.readFileString(path.join(home, "AGENTS.md"))).toBe("source\n");
      }).pipe(Effect.provide(authority));
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  for (const baseline of [undefined, "dist/\r\n# authored\r\n"]) {
    it.effect(
      `restores ${baseline === undefined ? "absent" : "authored"} ignore-file baseline and removes new native directories`,
      () =>
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const path = yield* Path.Path;
          const root = yield* fs.makeTempDirectoryScoped();
          yield* fs.makeDirectory(path.join(root, ".git"));
          yield* fs.writeFileString(path.join(root, "AGENTS.md"), "source\n");
          if (baseline !== undefined)
            yield* fs.writeFileString(path.join(root, ".gitignore"), baseline);
          const authority = NativeWriteAuthorityLive.pipe(
            Layer.provide(
              Layer.merge(WorkspaceReadTest({ baseDir: root }), WorkspaceFileWriteLocksLive),
            ),
          );
          yield* Effect.gen(function* () {
            const args = {
              workspaceRoot: root,
              scope: "project" as const,
              configuredAgents: ["claude-code", "junie"],
              config: { fileName: "AGENTS.md", gitignoreAliases: true },
              symlinkSupported: true,
            };
            const installed = yield* syncInstructions({
              ...args,
              eligibleAgentIds: args.configuredAgents,
              dryRun: false,
            });
            expect(
              installed.nativeLocations.find((location) =>
                location.aliases.includes(path.join(root, ".junie/AGENTS.md")),
              ),
            ).toMatchObject({
              state: "created",
              configuredConsumers: ["junie"],
              availability: [{ agentId: "junie", state: "unverified" }],
            });
            const snapshot = yield* observeInstructionProjection(args);
            yield* removeManagedInstructionTargets({ snapshot, dryRun: false });
            yield* removeInstructionsGitignore({ workspaceRoot: root, dryRun: false });
            expect(yield* fs.exists(path.join(root, ".junie"))).toBe(false);
            expect(yield* fs.exists(path.join(root, "CLAUDE.md"))).toBe(false);
            expect(yield* fs.readFileString(path.join(root, "AGENTS.md"))).toBe("source\n");
            if (baseline === undefined)
              expect(yield* fs.exists(path.join(root, ".gitignore"))).toBe(false);
            else expect(yield* fs.readFileString(path.join(root, ".gitignore"))).toBe(baseline);
            expect(yield* fs.exists(path.join(root, ".axm"))).toBe(false);
          }).pipe(Effect.provide(authority));
        }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
    );
  }

  it.effect("preserves foreign additions in an introduced native directory", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fs.makeTempDirectoryScoped();
      yield* fs.writeFileString(path.join(root, "AGENTS.md"), "source\n");
      const authority = NativeWriteAuthorityLive.pipe(
        Layer.provide(
          Layer.merge(WorkspaceReadTest({ baseDir: root }), WorkspaceFileWriteLocksLive),
        ),
      );
      yield* Effect.gen(function* () {
        const args = {
          workspaceRoot: root,
          scope: "project" as const,
          configuredAgents: ["junie"],
          config: { fileName: "AGENTS.md", gitignoreAliases: false },
          symlinkSupported: true,
        };
        yield* syncInstructions({ ...args, eligibleAgentIds: ["junie"], dryRun: false });
        yield* fs.writeFileString(path.join(root, ".junie/notes.txt"), "foreign\n");
        yield* removeManagedInstructionTargets({
          snapshot: yield* observeInstructionProjection(args),
          dryRun: false,
        });
        expect(yield* fs.readFileString(path.join(root, ".junie/notes.txt"))).toBe("foreign\n");
        expect(yield* fs.exists(path.join(root, ".junie/AGENTS.md"))).toBe(false);
      }).pipe(Effect.provide(authority));
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );
  it.effect("ordinary reconciliation does not establish new directory cleanup authority", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fs.makeTempDirectoryScoped();
      yield* fs.writeFileString(path.join(root, "AGENTS.md"), "source\n");
      const authority = NativeWriteAuthorityLive.pipe(
        Layer.provide(
          Layer.merge(WorkspaceReadTest({ baseDir: root }), WorkspaceFileWriteLocksLive),
        ),
      );
      yield* Effect.gen(function* () {
        const args = {
          workspaceRoot: root,
          scope: "project" as const,
          configuredAgents: ["junie"],
          config: { fileName: "AGENTS.md", gitignoreAliases: false },
          symlinkSupported: true,
        };
        yield* syncInstructions({ ...args, dryRun: false });
        yield* removeManagedInstructionTargets({
          snapshot: yield* observeInstructionProjection(args),
          dryRun: false,
        });
        expect(yield* fs.exists(path.join(root, ".junie"))).toBe(true);
        expect(yield* fs.exists(path.join(root, ".axm"))).toBe(false);
      }).pipe(Effect.provide(authority));
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );
});
