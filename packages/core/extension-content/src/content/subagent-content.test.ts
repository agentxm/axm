import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import { describe, expect, it, layer } from "@effect/vitest";
import { loadSubagentPackage, parseNativeSubagent } from "./subagent-content.js";

type CountedMethod = "realPath" | "stat" | "readFileString";

/**
 * The real filesystem, counting the calls the contained loader makes to
 * resolve, inspect and read a source. Paths are recorded as passed.
 */
const countingFileSystem = (fs: FileSystem.FileSystem) => {
  const calls: Array<{ readonly method: CountedMethod; readonly path: string }> = [];
  const record = (method: CountedMethod, path: string) =>
    Effect.sync(() => {
      calls.push({ method, path });
    });
  return {
    fileSystem: FileSystem.FileSystem.of({
      ...fs,
      realPath: (path) => Effect.andThen(record("realPath", path), fs.realPath(path)),
      stat: (path) => Effect.andThen(record("stat", path), fs.stat(path)),
      readFileString: (path, encoding) =>
        Effect.andThen(record("readFileString", path), fs.readFileString(path, encoding)),
    }),
    count: (method: CountedMethod, path: string) =>
      calls.filter((call) => call.method === method && call.path === path).length,
  };
};

layer(NodeServices.layer, { excludeTestServices: true })(
  "contained subagent package loading",
  (it) => {
    /** A temporary package whose files are written as given, and its real root. */
    const writePackage = (manifest: unknown, files: Readonly<Record<string, string>>) =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const root = yield* fs.makeTempDirectoryScoped();
        yield* fs.writeFileString(path.join(root, "subagent.json"), JSON.stringify(manifest));
        for (const [file, content] of Object.entries(files)) {
          yield* fs.makeDirectory(path.dirname(path.join(root, file)), { recursive: true });
          yield* fs.writeFileString(path.join(root, file), content);
        }
        return { root, realRoot: yield* fs.realPath(root) };
      });
    const identity = {
      owner: "@acme",
      type: "subagent",
      name: "review",
      version: "1.0.0",
      description: "Reviews",
    };
    const native = "---\nname: reviewer\ndescription: Reviews\n---\nReview natively.";
    /** Resolve, inspect and read work on one package-relative source. */
    const sourceWork = (
      counted: ReturnType<typeof countingFileSystem>,
      path: Path.Path,
      realRoot: string,
      source: string,
    ) => {
      const joined = path.join(realRoot, source);
      return {
        realPath: counted.count("realPath", joined),
        stat: counted.count("stat", joined),
        read: counted.count("readFileString", joined),
      };
    };

    it.effect("reads a source several declarations name once per load", () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const { root, realRoot } = yield* writePackage(
          {
            ...identity,
            core: { instructions: "instructions.md" },
            implementations: {
              "claude-code": { kind: "native", source: "agents/reviewer.md" },
              cursor: { kind: "native", source: "agents/reviewer.md" },
              codex: {
                kind: "customized",
                instructions: { mode: "append", source: "instructions.md" },
              },
            },
          },
          { "instructions.md": "Review.", "agents/reviewer.md": native },
        );
        const counted = countingFileSystem(fs);
        const pkg = yield* loadSubagentPackage(root).pipe(
          Effect.provideService(FileSystem.FileSystem, counted.fileSystem),
        );
        expect({
          native: sourceWork(counted, path, realRoot, "agents/reviewer.md"),
          instructions: sourceWork(counted, path, realRoot, "instructions.md"),
          manifest: sourceWork(counted, path, realRoot, "subagent.json"),
          root: counted.count("realPath", root),
        }).toEqual({
          native: { realPath: 1, stat: 1, read: 1 },
          instructions: { realPath: 1, stat: 1, read: 1 },
          manifest: { realPath: 1, stat: 1, read: 1 },
          root: 1,
        });
        expect(pkg.core).toEqual({
          name: "review",
          description: "Reviews",
          instructions: "Review.",
          source: "instructions.md",
        });
        for (const agentId of ["claude-code", "cursor"]) {
          const implementation = pkg.implementations[agentId];
          expect(implementation?.kind).toBe("native");
          if (implementation?.kind !== "native") continue;
          expect(implementation.source).toBe("agents/reviewer.md");
          expect(implementation.native.content).toBe(native);
          expect(implementation.native.name).toBe("reviewer");
          expect(implementation.native.instructions).toBe("Review natively.");
        }
        expect(pkg.implementations["codex"]).toEqual({
          kind: "customized",
          configuration: {},
          instructions: { mode: "append", source: "instructions.md", content: "Review." },
        });
      }).pipe(Effect.scoped),
    );

    it.effect("reads each distinct source once", () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const { root, realRoot } = yield* writePackage(
          {
            ...identity,
            core: { instructions: "instructions.md" },
            implementations: {
              "claude-code": { kind: "native", source: "agents/claude.md" },
              codex: { kind: "customized", instructions: { mode: "append", source: "extra.md" } },
            },
          },
          { "instructions.md": "Review.", "agents/claude.md": native, "extra.md": "More." },
        );
        const counted = countingFileSystem(fs);
        yield* loadSubagentPackage(root).pipe(
          Effect.provideService(FileSystem.FileSystem, counted.fileSystem),
        );
        for (const source of ["subagent.json", "instructions.md", "agents/claude.md", "extra.md"])
          expect(sourceWork(counted, path, realRoot, source)).toEqual({
            realPath: 1,
            stat: 1,
            read: 1,
          });
      }).pipe(Effect.scoped),
    );

    /** A package whose two native declarations share one source, and the source path. */
    const writeSharedSourcePackage = () =>
      Effect.gen(function* () {
        const path = yield* Path.Path;
        const written = yield* writePackage(
          {
            ...identity,
            implementations: {
              "claude-code": { kind: "native", source: "agents/reviewer.md" },
              cursor: { kind: "native", source: "agents/reviewer.md" },
            },
          },
          { "agents/reviewer.md": native },
        );
        return { ...written, sourcePath: path.join(written.root, "agents", "reviewer.md") };
      });
    const nativeContent = (pkg: Effect.Success<ReturnType<typeof loadSubagentPackage>>) =>
      ["claude-code", "cursor"].map((agentId) => {
        const implementation = pkg.implementations[agentId];
        return implementation?.kind === "native" ? implementation.native.content : undefined;
      });

    it.effect("reads a shared source again in a later load of the same package", () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const { root, realRoot, sourcePath } = yield* writeSharedSourcePackage();
        const counted = countingFileSystem(fs);
        const load = loadSubagentPackage(root).pipe(
          Effect.provideService(FileSystem.FileSystem, counted.fileSystem),
        );
        const first = yield* load;
        const edited = "---\nname: reviewer\ndescription: Reviews\n---\nReview again.";
        yield* fs.writeFileString(sourcePath, edited);
        const second = yield* load;
        expect(nativeContent(first)).toEqual([native, native]);
        expect(nativeContent(second)).toEqual([edited, edited]);
        expect(sourceWork(counted, path, realRoot, "agents/reviewer.md")).toEqual({
          realPath: 2,
          stat: 2,
          read: 2,
        });
      }).pipe(Effect.scoped),
    );

    it.effect("checks a shared source's containment again in a later load", () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const outside = yield* fs.makeTempDirectoryScoped();
        yield* fs.writeFileString(path.join(outside, "external.md"), native);
        const { root, realRoot, sourcePath } = yield* writeSharedSourcePackage();
        const counted = countingFileSystem(fs);
        const load = loadSubagentPackage(root).pipe(
          Effect.provideService(FileSystem.FileSystem, counted.fileSystem),
        );
        expect(nativeContent(yield* load)).toEqual([native, native]);
        yield* fs.remove(sourcePath);
        yield* fs.symlink(path.join(outside, "external.md"), sourcePath);
        const error = yield* Effect.flip(load);
        expect({ reason: error.reason, source: error.source, detail: error.detail }).toEqual({
          reason: "reference-invalid",
          source: "agents/reviewer.md",
          detail: 'Source "agents/reviewer.md" escapes its package.',
        });
        expect(sourceWork(counted, path, realRoot, "agents/reviewer.md")).toEqual({
          realPath: 2,
          stat: 1,
          read: 1,
        });
      }).pipe(Effect.scoped),
    );

    it.effect("refuses a shared source that is a directory at its first declaration", () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const { root, realRoot } = yield* writePackage(
          {
            ...identity,
            implementations: {
              "claude-code": { kind: "native", source: "agents/reviewer.md" },
              cursor: { kind: "native", source: "agents/reviewer.md" },
            },
          },
          {},
        );
        yield* fs.makeDirectory(path.join(root, "agents", "reviewer.md"), { recursive: true });
        const counted = countingFileSystem(fs);
        const error = yield* loadSubagentPackage(root).pipe(
          Effect.provideService(FileSystem.FileSystem, counted.fileSystem),
          Effect.flip,
        );
        expect({ reason: error.reason, source: error.source, detail: error.detail }).toEqual({
          reason: "reference-invalid",
          source: "agents/reviewer.md",
          detail: 'Source "agents/reviewer.md" must be a regular file.',
        });
        expect(sourceWork(counted, path, realRoot, "agents/reviewer.md")).toEqual({
          realPath: 1,
          stat: 1,
          read: 0,
        });
      }).pipe(Effect.scoped),
    );

    it.effect("refuses a shared source that escapes its package at its first declaration", () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const outside = yield* fs.makeTempDirectoryScoped();
        yield* fs.writeFileString(path.join(outside, "external.md"), native);
        const { root, realRoot } = yield* writePackage(
          {
            ...identity,
            implementations: {
              "claude-code": { kind: "native", source: "agents/reviewer.md" },
              cursor: { kind: "native", source: "agents/reviewer.md" },
            },
          },
          {},
        );
        yield* fs.makeDirectory(path.join(root, "agents"));
        yield* fs.symlink(
          path.join(outside, "external.md"),
          path.join(root, "agents", "reviewer.md"),
        );
        const counted = countingFileSystem(fs);
        const error = yield* loadSubagentPackage(root).pipe(
          Effect.provideService(FileSystem.FileSystem, counted.fileSystem),
          Effect.flip,
        );
        expect({ reason: error.reason, source: error.source, detail: error.detail }).toEqual({
          reason: "reference-invalid",
          source: "agents/reviewer.md",
          detail: 'Source "agents/reviewer.md" escapes its package.',
        });
        expect(sourceWork(counted, path, realRoot, "agents/reviewer.md")).toEqual({
          realPath: 1,
          stat: 0,
          read: 0,
        });
      }).pipe(Effect.scoped),
    );
  },
);

describe("native subagent parsing", () => {
  it.effect(
    "retains complete TOML, including comments, nested tables, and unknown native fields",
    () =>
      Effect.gen(function* () {
        const content =
          '# Native review\nname = "review_native"\ndescription = "Reviews"\ndeveloper_instructions = "Do the review."\n[model_settings]\nreasoning = "high"\n';
        const result = yield* parseNativeSubagent({
          agentId: "codex",
          source: "native/review.toml",
          content,
        });
        expect(result.content).toBe(content);
        expect(result.name).toBe("review_native");
        expect(result.instructions).toBe("Do the review.");
        expect(result.configuration["model_settings"]).toEqual({ reasoning: "high" });
      }),
  );

  it.effect("uses the source filename when a native definition omits name", () =>
    Effect.gen(function* () {
      const result = yield* parseNativeSubagent({
        agentId: "cursor",
        source: "native/native-reviewer.md",
        content: "---\ndescription: Reviews\n---\nReview.",
      });
      expect(result.name).toBe("native-reviewer");
    }),
  );

  it.effect("uses OpenCode and Mistral filename identity without rewriting native fields", () =>
    Effect.gen(function* () {
      const opencode = yield* parseNativeSubagent({
        agentId: "opencode",
        source: "native/file-identity.md",
        content: "---\nname: retained-config\ndescription: Reviews\n---\nReview.",
      });
      expect(opencode.name).toBe("file-identity");
      expect(opencode.configuration["name"]).toBe("retained-config");
      const mistral = yield* parseNativeSubagent({
        agentId: "mistral-vibe",
        source: "native/vibe-review.toml",
        content:
          'agent_type = "subagent"\ndisplay_name = "Reviewer"\nsystem_prompt_id = "existing-user-prompt"\n',
      });
      expect(mistral.name).toBe("vibe-review");
      expect(mistral.instructions).toBe("");
      expect(mistral.configuration["system_prompt_id"]).toBe("existing-user-prompt");
    }),
  );

  it.effect.each([
    { source: "native/a.md", content: "---\nname: [broken\n---\nBody" },
    { source: "native/a.md", content: "Missing frontmatter" },
    { source: "native/a.md", content: "---\nname: ../../escape\n---\nBody" },
    { source: "native/a.md", content: "---\nname: review\nagentOverrides: {}\n---\nBody" },
    { source: "native/a.toml", content: 'name = "review"\nname = "duplicate"' },
    { source: "native/a.toml", content: 'name = "review"\ndeveloper_instructions = ["invalid"]' },
    { source: "native/a.json", content: '{"name":"review", "nested":{"__proto__":{}}}' },
    { source: "native/a.xml", content: "<agent/>" },
  ])("rejects invalid native source $source", ({ source, content }) =>
    Effect.gen(function* () {
      const agentId = source.endsWith(".toml")
        ? "codex"
        : source.endsWith(".json")
          ? "kiro-cli"
          : "cursor";
      const error = yield* parseNativeSubagent({ agentId, source, content }).pipe(Effect.flip);
      expect(error.reason).toBe("native-invalid");
    }),
  );

  it.effect.each([
    {
      agentId: "codex",
      source: "native/review.md",
      content: "---\nname: review\ndescription: Reviews\n---\nReview.",
    },
    {
      agentId: "codex",
      source: "native/review.toml",
      content: 'description = "Reviews"\ndeveloper_instructions = "Review."',
    },
    {
      agentId: "codex",
      source: "native/review.toml",
      content: 'name = "review"\ndescription = "Reviews"',
    },
    {
      agentId: "claude-code",
      source: "native/review.md",
      content: "---\nname: review\n---\nReview.",
    },
    { agentId: "mistral-vibe", source: "native/review.toml", content: 'agent_type = "agent"' },
  ])("rejects a mismatched or incomplete $agentId definition", (args) =>
    Effect.gen(function* () {
      const error = yield* parseNativeSubagent(args).pipe(Effect.flip);
      expect(error.reason).toBe("native-invalid");
    }),
  );
});
