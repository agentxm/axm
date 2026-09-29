import * as NodeServices from "@effect/platform-node/NodeServices";
import { NativeWriteAuthorityPermissive } from "../../agent-adapters/testing.js";
import { describe, expect, it } from "@effect/vitest";
import { defineSpecification } from "@agentxm/specification-metadata";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Ref from "effect/Ref";
import { observeInstructionProjection, probeSymlinkSupport, syncInstructions } from "../index.js";
import { applyInstructionProjection } from "../testing.js";

export const specification = defineSpecification({
  requirement: "workspace/instructions/respects-native-authority-and-observation",
  title: "Instruction projections remain within their observed native authority",
  statement:
    "AXM shall bound instruction reads and mutations to the selected native authority, prove immediate alias ownership, and preserve changes made after its observation.",
  class: "functional",
  role: "supporting",
  goals: ["agent-interoperability", "workspace-intent-fidelity", "safe-repetition"],
  boundary: "platform",
  boundaryRationale:
    "Real filesystem aliases and foreign edits expose unsafe native instruction reads and writes.",
  methods: ["example"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});
const config = { fileName: "AGENTS.md", gitignoreAliases: true };

describe("native instruction boundaries", () => {
  it.effect("preserves a probe parent created by another writer after absence was observed", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fs.makeTempDirectoryScoped();
      const runtime = path.join(root, ".axm");
      const injected = yield* Ref.make(false);
      const result = yield* probeSymlinkSupport(root).pipe(
        Effect.provideService(FileSystem.FileSystem, {
          ...fs,
          makeDirectory: (target, options) =>
            Effect.gen(function* () {
              if (target === runtime && !(yield* Ref.get(injected))) {
                yield* Ref.set(injected, true);
                yield* fs.makeDirectory(runtime);
              }
              yield* fs.makeDirectory(target, options);
            }),
        }),
      );
      expect(result).toBe(true);
      expect(yield* fs.exists(runtime)).toBe(true);
      expect(yield* fs.readDirectory(runtime)).toEqual([]);
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect("does not read a source link that leaves the selected workspace", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fs.makeTempDirectoryScoped();
      const outside = yield* fs.makeTempDirectoryScoped();
      const source = path.join(root, "AGENTS.md");
      const foreign = path.join(outside, "private.md");
      yield* fs.writeFileString(foreign, "foreign content");
      yield* fs.symlink(foreign, source);
      const reads = yield* Ref.make<ReadonlyArray<string>>([]);
      const boundedObservation = observeInstructionProjection({
        workspaceRoot: root,
        scope: "project",
        configuredAgents: ["claude-code"],
        config,
        symlinkSupported: true,
      });
      const snapshot = yield* boundedObservation.pipe(
        Effect.provideService(FileSystem.FileSystem, {
          ...fs,
          readFileString: (file, encoding) =>
            Ref.update(reads, (current) => [...current, file]).pipe(
              Effect.andThen(fs.readFileString(file, encoding)),
            ),
        }),
      );
      expect(yield* Ref.get(reads)).not.toContain(source);
      expect(yield* Ref.get(reads)).not.toContain(foreign);
      expect(snapshot.status.missingSources).toContain(source);
    }).pipe(
      Effect.scoped,
      Effect.provide(Layer.merge(NativeWriteAuthorityPermissive, NodeServices.layer)),
    ),
  );

  it.effect("refuses an external gitignore referent before creating native aliases", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fs.makeTempDirectoryScoped();
      const outside = yield* fs.makeTempDirectoryScoped();
      yield* fs.makeDirectory(path.join(root, ".git"));
      yield* fs.writeFileString(path.join(root, "AGENTS.md"), "source\n");
      const foreign = path.join(outside, "ignore");
      yield* fs.writeFileString(foreign, "foreign\n");
      yield* fs.symlink(foreign, path.join(root, ".gitignore"));
      const result = yield* syncInstructions({
        workspaceRoot: root,
        scope: "project",
        configuredAgents: ["claude-code"],
        config,
        symlinkSupported: true,
        dryRun: false,
      }).pipe(Effect.result);
      expect(result._tag).toBe("Failure");
      expect(yield* fs.exists(path.join(root, "CLAUDE.md"))).toBe(false);
      expect(yield* fs.readFileString(foreign)).toBe("foreign\n");
    }).pipe(
      Effect.scoped,
      Effect.provide(Layer.merge(NativeWriteAuthorityPermissive, NodeServices.layer)),
    ),
  );

  it.effect("does not claim an indirect stale alias through another link", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fs.makeTempDirectoryScoped();
      yield* fs.writeFileString(path.join(root, "source.md"), "source\n");
      yield* fs.symlink("source.md", path.join(root, "AGENTS.md"));
      yield* fs.symlink("AGENTS.md", path.join(root, "CLAUDE.md"));
      const snapshot = yield* observeInstructionProjection({
        workspaceRoot: root,
        scope: "project",
        configuredAgents: [],
        config,
        symlinkSupported: true,
      });
      expect(snapshot.status.staleTargets).toEqual([]);
    }).pipe(
      Effect.scoped,
      Effect.provide(Layer.merge(NativeWriteAuthorityPermissive, NodeServices.layer)),
    ),
  );

  it.effect("preserves a copy edit made after the projection snapshot", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fs.makeTempDirectoryScoped();
      const source = path.join(root, "AGENTS.md");
      const target = path.join(root, "CLAUDE.md");
      const args = {
        workspaceRoot: root,
        scope: "project" as const,
        configuredAgents: ["claude-code"],
        config,
        symlinkSupported: false,
      };
      yield* fs.writeFileString(source, "old source\n");
      yield* syncInstructions({ ...args, dryRun: false });
      yield* fs.writeFileString(source, "new source\n");
      const snapshot = yield* observeInstructionProjection(args);
      const foreign = `${yield* fs.readFileString(target)}\nforeign note\n`;
      yield* fs.writeFileString(target, foreign);
      const result = yield* applyInstructionProjection({
        workspaceRoot: root,
        config,
        snapshot,
        dryRun: false,
      }).pipe(Effect.result);
      expect(result._tag).toBe("Failure");
      expect(yield* fs.readFileString(target)).toBe(foreign);
    }).pipe(
      Effect.scoped,
      Effect.provide(Layer.merge(NativeWriteAuthorityPermissive, NodeServices.layer)),
    ),
  );
  it.effect("refuses to probe symlinks through an external runtime directory", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fs.makeTempDirectoryScoped();
      const outside = yield* fs.makeTempDirectoryScoped();
      yield* fs.symlink(outside, path.join(root, ".axm"));
      yield* observeInstructionProjection({
        workspaceRoot: root,
        scope: "project",
        configuredAgents: [],
        config,
      });
      expect(yield* fs.readDirectory(outside)).toEqual([]);
    }).pipe(
      Effect.scoped,
      Effect.provide(Layer.merge(NativeWriteAuthorityPermissive, NodeServices.layer)),
    ),
  );
});
