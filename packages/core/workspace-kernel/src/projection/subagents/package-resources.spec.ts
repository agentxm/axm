import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import { readSubagentPackage } from "@agentxm/extension-content";
import { defineSpecification } from "@agentxm/specification-metadata";
import { parse as parseToml } from "smol-toml";
import { prepareSubagentImplementation, subagentProjectionGeneration } from "../index.js";

export const specification = defineSpecification({
  requirement: "workspace/subagents/package-resources-retain-their-base",
  title: "Subagent resources bind to their owning package and participate in currency",
  statement:
    "AXM shall bind Codex instruction-file and OpenCode prompt-file references within the selected Subagent package, interpret native relative references from their definition directory and customized references from the package root, preserve their effective host meaning when projected, include selected resource contents in projection generation, and refuse missing, non-file, or package-escaping references without changing native files.",
  class: "functional",
  role: "experience",
  goals: ["workspace-intent-fidelity", "safe-repetition"],
  boundary: "platform",
  boundaryRationale:
    "Production binding reads native files and symlinks from temporary packages and renders host definitions; these examples do not execute the native agents.",
  methods: ["example"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const provenance = {
  ext: "@acme/subagents/review",
  src: "subagents/review/subagent.json",
  kind: "workspace-authored",
} as const;

const nativeCodex = (reference: string) =>
  `name = "review"\ndescription = "Review"\ndeveloper_instructions = "Review."\n# Keep this comment\nmodel_instructions_file = ${JSON.stringify(reference)}\ncustom_field = "./opaque"\n`;

const packageFor = (agentId: "codex" | "opencode", reference: string) =>
  readSubagentPackage({
    manifest: {
      owner: "@acme",
      type: "subagent",
      name: "review",
      version: "1.0.0",
      description: "Review",
      core: { instructions: "core.md" },
      implementations:
        agentId === "codex"
          ? { codex: { kind: "native", source: "native/review.toml" } }
          : { opencode: { kind: "native", source: "native/review.md" } },
    },
    readFile: (source) =>
      Effect.succeed(
        source.endsWith("toml")
          ? nativeCodex(reference)
          : source === "native/review.md"
            ? `---\ndescription: Review\nprompt: "Before {file:${reference}} after"\ncustom_field: ./opaque\n---\n`
            : "Portable instructions.",
      ),
  });

describe("Subagent package resource binding", () => {
  it.effect(
    "binds native Codex paths from staged content to the retained package without rewriting other fields",
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const sourceRoot = yield* fs.makeTempDirectoryScoped();
        yield* fs.makeDirectory(path.join(sourceRoot, "prompts"));
        yield* fs.writeFileString(
          path.join(sourceRoot, "prompts/review.md"),
          "Detailed instructions.",
        );
        yield* fs.symlink(
          path.join(sourceRoot, "prompts/review.md"),
          path.join(sourceRoot, "instructions.md"),
        );
        const retainedRoot = path.join(sourceRoot, "retained-package");
        const compiled = yield* prepareSubagentImplementation({
          package: yield* packageFor("codex", "../instructions.md"),
          agentId: "codex",
          sourceRoot,
          retainedRoot,
        });
        expect(compiled._tag).toBe("Compiled");
        if (compiled._tag !== "Compiled") return;
        const content = compiled.outputs[0]?.content ?? "";
        expect(parseToml(content)["model_instructions_file"]).toBe(
          path.join(retainedRoot, "prompts/review.md"),
        );
        expect(content).toContain("# Keep this comment\n");
        expect(content).toContain('custom_field = "./opaque"');
        expect(compiled.sourceDependencies).toEqual([
          "subagent.json",
          "native/review.toml",
          "prompts/review.md",
        ]);
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect("projects an OpenCode file prompt as the Markdown body the host actually reads", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fs.makeTempDirectoryScoped();
      yield* fs.writeFileString(path.join(root, "prompt.md"), "\nUse the project conventions.\n");
      const compiled = yield* prepareSubagentImplementation({
        package: yield* packageFor("opencode", "../prompt.md"),
        agentId: "opencode",
        sourceRoot: root,
        retainedRoot: root,
      });
      expect(compiled._tag).toBe("Compiled");
      if (compiled._tag !== "Compiled") return;
      expect(compiled.outputs[0]?.content).toContain(
        "---\nBefore Use the project conventions. after",
      );
      expect(compiled.outputs[0]?.content).not.toContain("Portable instructions.");
      expect(compiled.outputs[0]?.content).not.toContain("{file:");
      expect(compiled.outputs[0]?.content).toContain("custom_field: ./opaque");
      expect(compiled.sourceDependencies).toContain("prompt.md");
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect(
    "changes generation when a selected resource changes even if the rendered native path stays the same",
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const root = yield* fs.makeTempDirectoryScoped();
        const pkg = yield* packageFor("codex", "../prompt.md");
        const prepare = () =>
          prepareSubagentImplementation({
            package: pkg,
            agentId: "codex",
            sourceRoot: root,
            retainedRoot: root,
          });
        yield* fs.writeFileString(path.join(root, "prompt.md"), "First");
        const first = yield* prepare();
        yield* fs.writeFileString(path.join(root, "dormant.md"), "Unused");
        const dormant = yield* prepare();
        yield* fs.writeFileString(path.join(root, "prompt.md"), "Second");
        const second = yield* prepare();
        expect([first._tag, dormant._tag, second._tag]).toEqual([
          "Compiled",
          "Compiled",
          "Compiled",
        ]);
        if (first._tag !== "Compiled" || dormant._tag !== "Compiled" || second._tag !== "Compiled")
          return;
        const generation = (input: typeof first.input) =>
          subagentProjectionGeneration([{ provenance, input }]);
        expect(first.outputs).toEqual(second.outputs);
        expect(generation(first.input)).toBe(generation(dormant.input));
        expect(generation(first.input)).not.toBe(generation(second.input));
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect(
    "refuses missing, directory, traversal and symlink-escaping resources for both consumers",
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const parent = yield* fs.makeTempDirectoryScoped();
        const root = path.join(parent, "package");
        yield* fs.makeDirectory(root);
        yield* fs.makeDirectory(path.join(root, "directory"));
        yield* fs.writeFileString(path.join(parent, "outside.md"), "Outside");
        yield* fs.symlink(path.join(parent, "outside.md"), path.join(root, "escape.md"));
        for (const agentId of ["codex", "opencode"] as const) {
          const prefix = "../";
          for (const reference of ["missing.md", "directory", "../outside.md", "escape.md"]) {
            const compiled = yield* prepareSubagentImplementation({
              package: yield* packageFor(agentId, prefix + reference),
              agentId,
              sourceRoot: root,
              retainedRoot: root,
            });
            expect(compiled).toMatchObject({
              _tag: "Unsupported",
              reasonCode: "subagent-runtime-reference-unresolved",
            });
          }
        }
        expect(yield* fs.readFileString(path.join(parent, "outside.md"))).toBe("Outside");
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );
});
