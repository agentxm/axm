import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Layer from "effect/Layer";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import { readSubagentPackage } from "@agentxm/extension-content";
import { defineSpecification } from "@agentxm/specification-metadata";
import YAML from "yaml";
import {
  compileSubagentImplementation,
  managedSubagentRenderInput,
  renderManagedSubagentOutputs,
} from "../index.js";
import { codingAgentForId } from "../../agent-adapters/index.js";
import { NativeWriteAuthorityPermissive } from "../../agent-adapters/testing.js";

export const specification = defineSpecification({
  requirement: "workspace/subagents/native-locations-respect-shape-and-proof",
  title: "Subagent output follows resolved native shape and requires ownership proof",
  statement:
    "AXM shall place Subagent files under their resolved catalog directory, preserve selected native configuration and compile-time dependency currency without inventing tool mappings or execution-policy defaults, render identical shared representations with identical generation metadata regardless of reader enumeration, preserve unowned native files, and report native writing unsupported when a file or keyed surface has no verified ownership representation rather than treating a filename as a directory or a slug as ownership.",
  class: "functional",
  role: "experience",
  goals: ["workspace-intent-fidelity", "safe-repetition"],
  methods: ["example"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const managedFile = {
  ext: "@acme/subagents/review",
  source: { kind: "workspace-authored", path: "subagents/review/subagent.json" },
} as const;
const input = (agentId: string) => ({
  agentId,
  name: "review",
  body: "Review carefully",
  frontmatter: { name: "review", description: "Review" },
});
const services = Layer.merge(NodeServices.layer, NativeWriteAuthorityPermissive);

describe("Native Subagent location contracts", () => {
  it.effect("compiles portable identity and instructions without execution-policy defaults", () =>
    Effect.gen(function* () {
      const pkg = yield* readSubagentPackage({
        manifest: {
          owner: "@acme",
          type: "subagent",
          name: "review",
          version: "1.0.0",
          description: "Review changes",
          core: { instructions: "prompts/review.md" },
        },
        readFile: () => Effect.succeed("Review carefully."),
      });
      for (const agentId of [
        "claude-code",
        "cursor",
        "codex",
        "antigravity",
        "qoder-cn",
        "mimo-code",
      ]) {
        const compiled = compileSubagentImplementation({ package: pkg, agentId, managedFile });
        expect(compiled._tag).toBe("Compiled");
        if (compiled._tag !== "Compiled") continue;
        expect(compiled.mode).toBe("portable");
        expect(compiled.outputs[0]?.content).toContain("Review carefully.");
        expect(compiled.outputs[0]?.content).not.toMatch(
          /permissionMode|sandbox_mode|tools:|model:/,
        );
        expect(compiled.sourceDependencies).toEqual(["subagent.json", "prompts/review.md"]);
      }
      expect(compileSubagentImplementation({ package: pkg, agentId: "kiro-cli" })._tag).toBe(
        "Unsupported",
      );
      expect(compileSubagentImplementation({ package: pkg, agentId: "unknown" })._tag).toBe(
        "Unsupported",
      );
    }),
  );

  it.effect(
    "preserves complete native bytes and native names independently of the package name",
    () =>
      Effect.gen(function* () {
        const native =
          'name = "native-review"\ndescription = "Native description"\ndeveloper_instructions = "Native instructions"\n# Intentional formatting\nmodel = "host-model"\n';
        const pkg = yield* readSubagentPackage({
          manifest: {
            owner: "@acme",
            type: "subagent",
            name: "review",
            version: "1.0.0",
            description: "Portable",
            core: { instructions: "prompts/core.md" },
            implementations: { codex: { kind: "native", source: "native/codex.toml" } },
          },
          readFile: (source) =>
            Effect.succeed(source.endsWith("toml") ? native : "Unused portable instructions"),
        });
        const compiled = compileSubagentImplementation({
          package: pkg,
          agentId: "codex",
          managedFile,
        });
        expect(compiled._tag).toBe("Compiled");
        if (compiled._tag !== "Compiled") return;
        expect(compiled.mode).toBe("native");
        expect(compiled.nativeName).toBe("native-review");
        expect(compiled.outputs[0]?.path).toBe("native-review.toml");
        expect(compiled.outputs[0]?.content.endsWith(native)).toBe(true);
        expect(compiled.outputs[0]?.content).not.toContain("Unused portable");
        expect(compiled.sourceDependencies).toEqual(["subagent.json", "native/codex.toml"]);
      }),
  );

  it.effect("qualifies known runtime references and leaves unrelated native fields opaque", () =>
    Effect.gen(function* () {
      const pkg = yield* readSubagentPackage({
        manifest: {
          owner: "@acme",
          type: "subagent",
          name: "review",
          version: "1.0.0",
          description: "Review",
          core: { instructions: "prompts/core.md" },
          implementations: {
            codex: {
              kind: "customized",
              configuration: { model_instructions_file: "./instructions.md" },
            },
            cursor: {
              kind: "customized",
              configuration: { custom_field: "./label", model: "inherit" },
            },
          },
        },
        readFile: () => Effect.succeed("Review."),
      });
      expect(compileSubagentImplementation({ package: pkg, agentId: "codex" })).toMatchObject({
        _tag: "Unsupported",
        reasonCode: "subagent-runtime-reference-unresolved",
      });
      const cursor = compileSubagentImplementation({ package: pkg, agentId: "cursor" });
      expect(cursor._tag).toBe("Compiled");
      if (cursor._tag !== "Compiled") return;
      expect(cursor.outputs[0]?.content).toContain("custom_field: ./label");
    }),
  );

  it.effect("refuses bare and Windows-relative native runtime paths", () =>
    Effect.gen(function* () {
      for (const configuration of [
        { command: "node", cwd: "scripts" },
        { command: "node", cwd: "./scripts" },
        { command: "node", cwd: "..\\scripts" },
        { command: ".\\review.ps1" },
      ]) {
        const pkg = yield* readSubagentPackage({
          manifest: {
            owner: "@acme",
            type: "subagent",
            name: "review",
            version: "1.0.0",
            description: "Review",
            core: { instructions: "core.md" },
            implementations: {
              codex: {
                kind: "customized",
                configuration: {
                  mcp_servers: { helper: configuration },
                },
              },
            },
          },
          readFile: () => Effect.succeed("Review."),
        });
        expect(compileSubagentImplementation({ package: pkg, agentId: "codex" })).toMatchObject({
          _tag: "Unsupported",
          reasonCode: "subagent-runtime-reference-unresolved",
        });
      }
    }),
  );

  it.effect("ignores dormant implementation edits when computing selected generation", () =>
    Effect.gen(function* () {
      const makePackage = (dormant: string) =>
        readSubagentPackage({
          manifest: {
            owner: "@acme",
            type: "subagent",
            name: "review",
            version: "1.0.0",
            description: "Review",
            core: { instructions: "prompts/core.md" },
            implementations: {
              cursor: {
                kind: "customized",
                instructions: { mode: "append", source: "prompts/cursor.md" },
              },
            },
          },
          readFile: (source) => Effect.succeed(source.includes("cursor") ? dormant : "Review."),
        });
      const first = compileSubagentImplementation({
        package: yield* makePackage("One"),
        agentId: "claude-code",
        managedFile,
      });
      const second = compileSubagentImplementation({
        package: yield* makePackage("Two"),
        agentId: "claude-code",
        managedFile,
      });
      expect(first._tag).toBe("Compiled");
      expect(second._tag).toBe("Compiled");
      if (first._tag === "Compiled" && second._tag === "Compiled")
        expect(first.outputs).toEqual(second.outputs);
    }),
  );

  it.effect("preserves another owner's same-named managed document on write and removal", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fs.makeTempDirectoryScoped();
      const file = path.join(root, ".claude/agents/review.md");
      yield* fs.makeDirectory(path.dirname(file), { recursive: true });
      const foreign =
        "<!-- axm:file v=1 ext=@foreign/subagents/review src=subagents/review/subagent.json -->\nForeign owner\n";
      yield* fs.writeFileString(file, foreign);
      const agent = codingAgentForId("claude-code");
      const outcome = yield* agent.addSubagent({
        workspaceRoot: root,
        scope: "project",
        force: true,
        previousManagedFiles: [],
        input: managedSubagentRenderInput({ managedFile, input: input("claude-code") }),
      });
      expect(outcome._tag).toBe("conflict");
      yield* agent.removeSubagent({
        workspaceRoot: root,
        scope: "project",
        subagentName: "review",
        expectedManagedFile: { ext: managedFile.ext, src: managedFile.source.path },
        renderedFilePaths: [file],
      });
      expect(yield* fs.readFileString(file)).toBe(foreign);
    }).pipe(Effect.scoped, Effect.provide(services)),
  );
  it("shares generation metadata when different readers require identical bytes", () => {
    const first = renderManagedSubagentOutputs({ managedFile, input: input("claude-code") });
    const second = renderManagedSubagentOutputs({ managedFile, input: input("cursor") });
    expect(first?._tag).toBe("Rendered");
    expect(second?._tag).toBe("Rendered");
    if (first?._tag !== "Rendered" || second?._tag !== "Rendered") return;
    expect(first.outputs).toEqual(second.outputs);
    expect(first.outputs[0]?.path).toBe("review.md");
  });

  it.effect.each(["project", "user"] as const)(
    "projects Antigravity desktop and CLI into their shared %s directory with repeatable ownership",
    (scope) =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const root = yield* fs.realPath(yield* fs.makeTempDirectoryScoped());
        const directory = path.join(
          root,
          scope === "project" ? ".agents/agents" : ".gemini/config/agents",
        );
        const file = path.join(directory, "review.md");
        const foreignFile = path.join(directory, "personal.md");
        yield* fs.makeDirectory(directory, { recursive: true });
        yield* fs.writeFileString(foreignFile, "User-authored subagent\n");
        const nativeFrontmatter = {
          name: "review",
          description: "Review",
          tools: ["view_file", "run_command"],
          mainAgent: false,
          subagent: true,
          model: "inherit",
          commandExecutionPolicy: "sandbox",
          skills: ["review-guidelines"],
          plugins: ["review-tools"],
        };
        let firstBytes: string | undefined;
        for (const id of ["antigravity", "antigravity-cli"] as const) {
          const agent = codingAgentForId(id);
          const args = {
            workspaceRoot: root,
            scope,
            force: false,
            previousManagedFiles: [],
            input: managedSubagentRenderInput({
              managedFile,
              input: { ...input(id), frontmatter: nativeFrontmatter },
            }),
          };
          const result = yield* agent.addSubagent(args);
          expect(result).toMatchObject({
            _tag: "success",
            renderedFilePaths: [file],
            nativeTargets: [
              { path: file, change: firstBytes === undefined ? "created" : "unchanged" },
            ],
          });
          const bytes = yield* fs.readFileString(file);
          const frontmatter = /^---\n([\s\S]*?)\n---/.exec(bytes)?.[1];
          expect(frontmatter).toBeDefined();
          const parsed: unknown = YAML.parse(frontmatter ?? "");
          expect(parsed).toEqual(nativeFrontmatter);
          if (firstBytes === undefined) firstBytes = bytes;
          else expect(bytes).toBe(firstBytes);
          yield* agent.addSubagent(args);
          expect(yield* fs.readFileString(file)).toBe(bytes);
        }
        const cli = codingAgentForId("antigravity-cli");
        const replacement = {
          ...input(cli.id),
          frontmatter: {
            name: "review",
            description: "Review",
            subagent: true,
            model: "flash",
            tools: ["view_file"],
            commandExecutionPolicy: "sandbox",
            skills: ["review-guidelines"],
            plugins: ["review-tools"],
          },
          body: "Updated review instructions",
        };
        yield* cli.addSubagent({
          workspaceRoot: root,
          scope,
          force: false,
          previousManagedFiles: [],
          input: managedSubagentRenderInput({ managedFile, input: replacement }),
        });
        const updated = yield* fs.readFileString(file);
        const updatedFrontmatter: unknown = YAML.parse(
          /^---\n([\s\S]*?)\n---/.exec(updated)?.[1] ?? "",
        );
        expect(updatedFrontmatter).toEqual({
          name: "review",
          description: "Review",
          subagent: true,
          model: "flash",
          tools: ["view_file"],
          commandExecutionPolicy: "sandbox",
          skills: ["review-guidelines"],
          plugins: ["review-tools"],
        });
        expect(updated).toContain("Updated review instructions");
        yield* cli.removeSubagent({
          workspaceRoot: root,
          scope,
          subagentName: "review",
          expectedManagedFile: { ext: managedFile.ext, src: managedFile.source.path },
          renderedFilePaths: [file],
        });
        expect(yield* fs.exists(file)).toBe(false);
        expect(yield* fs.readFileString(foreignFile)).toBe("User-authored subagent\n");
        yield* fs.writeFileString(file, "Unowned replacement\n");
        for (const id of ["antigravity", "antigravity-cli"] as const) {
          const outcome = yield* codingAgentForId(id).addSubagent({
            workspaceRoot: root,
            scope,
            force: true,
            previousManagedFiles: [],
            input: managedSubagentRenderInput({ managedFile, input: input(id) }),
          });
          expect(outcome._tag).toBe("conflict");
        }
        expect(yield* fs.readFileString(file)).toBe("Unowned replacement\n");
      }).pipe(Effect.scoped, Effect.provide(services)),
  );

  it.effect.each(["qoder-cn", "mimo-code"] as const)(
    "uses %s declared project directory and converges through a parent alias",
    (agentId) =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const root = yield* fs.makeTempDirectoryScoped();
        const actual = path.join(root, "native-agents");
        yield* fs.makeDirectory(actual);
        const directory = agentId === "qoder-cn" ? ".qoder" : ".mimocode";
        yield* fs.makeDirectory(path.join(root, directory));
        yield* fs.symlink(actual, path.join(root, directory, "agents"));
        const agent = codingAgentForId(agentId);
        const args = {
          workspaceRoot: root,
          scope: "project" as const,
          force: false,
          previousManagedFiles: [],
          input: managedSubagentRenderInput({ managedFile, input: input(agent.id) }),
        };
        const first = yield* agent.addSubagent(args);
        expect(first._tag).toBe("success");
        const bytes = yield* fs.readFileString(path.join(actual, "review.md"));
        yield* agent.addSubagent(args);
        expect(yield* fs.readFileString(path.join(actual, "review.md"))).toBe(bytes);
        expect(yield* fs.exists(path.join(root, ".qoder-cn"))).toBe(false);
      }).pipe(Effect.scoped, Effect.provide(services)),
  );

  it.effect.each(["roo", "ibm-bob", "kiro-cli"] as const)(
    "preserves %s native content with unsupported ownership",
    (id) =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const root = yield* fs.makeTempDirectoryScoped();
        const file = path.join(
          root,
          id === "roo"
            ? ".roomodes"
            : id === "ibm-bob"
              ? ".bob/custom_modes.yaml"
              : ".kiro/agents/review.json",
        );
        yield* fs.makeDirectory(path.dirname(file), { recursive: true });
        yield* fs.writeFileString(file, "User-owned native content\n");
        const agent = codingAgentForId(id);
        const outcome = yield* agent.addSubagent({
          workspaceRoot: root,
          scope: "project",
          force: false,
          previousManagedFiles: [],
          input: managedSubagentRenderInput({ managedFile, input: input(id) }),
        });
        expect(outcome._tag).toBe("unsupported");
        expect(yield* fs.readFileString(file)).toBe("User-owned native content\n");
      }).pipe(Effect.scoped, Effect.provide(services)),
  );

  it.effect("refuses to overwrite an unmarked native document", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fs.makeTempDirectoryScoped();
      const file = path.join(root, ".claude/agents/review.md");
      yield* fs.makeDirectory(path.dirname(file), { recursive: true });
      yield* fs.writeFileString(file, "User content\n");
      const outcome = yield* codingAgentForId("claude-code").addSubagent({
        workspaceRoot: root,
        scope: "project",
        force: true,
        previousManagedFiles: [],
        input: managedSubagentRenderInput({ managedFile, input: input("claude-code") }),
      });
      expect(outcome._tag).toBe("conflict");
      expect(yield* fs.readFileString(file)).toBe("User content\n");
    }).pipe(Effect.scoped, Effect.provide(services)),
  );
});
