import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Layer from "effect/Layer";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import { readSubagentPackage } from "@agentxm/extension-content";
import { defineSpecification } from "@agentxm/specification-metadata";
import YAML from "yaml";
import * as Option from "effect/Option";
import {
  compileSubagentImplementation,
  decideOutputDeletion,
  decideWholeFileWrite,
  projectionOutputDigest,
  subagentProjectionGeneration,
  type SubagentGenerationArgs,
  type SubagentProvenance,
} from "../index.js";
import {
  codingAgentForId,
  renderSubagent,
  type AddSubagentArgs,
  type CodingAgent,
  type RemoveSubagentArgs,
  type SubagentRenderInput,
} from "../../agent-adapters/index.js";
import { NativeWriteAuthorityPermissive } from "../../agent-adapters/testing.js";
import {
  ProjectionUnitPathSchema,
  type ProjectionDigest,
  type ProjectionUnitPath,
  type RecordedProjectionRow,
} from "../../workspace-state/index.js";

export const specification = defineSpecification({
  requirement: "workspace/subagents/native-locations-respect-shape-and-proof",
  title: "Subagent output follows resolved native shape and its declaration's planned path",
  statement:
    "AXM shall place Subagent files under their resolved catalog directory without ownership text, preserve selected native configuration without inventing tool mappings or execution-policy defaults, judge currency by an input-only generation that every reader of one physical file shares and that dormant implementation edits do not change, record an unrecorded file whose bytes equal the render, refuse an unrecorded differing file unless replacement is explicitly requested, replace a recorded file when its inputs change even after a hand edit, and report native writing unsupported when a file or keyed surface has no verified representation rather than treating a filename as a directory or a slug as ownership.",
  class: "functional",
  role: "experience",
  goals: ["workspace-intent-fidelity", "safe-repetition"],
  methods: ["example"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const provenance: SubagentProvenance = {
  ext: "@acme/subagents/review",
  src: "subagents/review/subagent.json",
  kind: "workspace-authored",
};
const input = (agentId: string): SubagentRenderInput => ({
  agentId,
  name: "review",
  body: "Review carefully",
  frontmatter: { name: "review", description: "Review" },
});
const services = Layer.merge(NodeServices.layer, NativeWriteAuthorityPermissive);

/**
 * The owning projection's policy over one scope root, with the rows it
 * records held in memory: the shared whole-file decision on write, the
 * deletion guard on removal, and a row for every write or record.
 */
const projection = (
  root: string,
  path: Path.Path,
  options: { readonly replaceUnrecorded?: boolean } = {},
) => {
  const rows = new Map<ProjectionUnitPath, RecordedProjectionRow>();
  // Adapter write decisions are synchronous, so this in-memory owner keys
  // lexically; every path it sees is spelled from the same root.
  const unit = (filePath: string) =>
    ProjectionUnitPathSchema.make(
      path.relative(root, path.resolve(root, filePath)).split(path.sep).join("/"),
    );
  const generation = (claimants: ReadonlyArray<SubagentRenderInput>): ProjectionDigest =>
    subagentProjectionGeneration(
      claimants.map((claimant): SubagentGenerationArgs => ({ provenance, input: claimant })),
    );
  const add = (
    agent: CodingAgent,
    args: Omit<AddSubagentArgs, "decideWrite" | "force"> & {
      readonly claimants?: ReadonlyArray<SubagentRenderInput>;
    },
  ) =>
    Effect.gen(function* () {
      const gen = generation(args.claimants ?? [args.input]);
      const rendered = new Map<string, string>();
      const outcome = yield* agent.addSubagent({
        ...args,
        force: true,
        decideWrite: ({ filePath, prior, rendered: bytes }) => {
          rendered.set(filePath, bytes);
          const decision = decideWholeFileWrite({
            recorded: Option.fromUndefinedOr(rows.get(unit(filePath))),
            gen,
            bytes: prior,
            rendered: bytes,
            replaceUnrecorded: options.replaceUnrecorded === true,
          });
          return decision._tag === "conflict"
            ? {
                _tag: "conflict",
                reason: `Existing Subagent file has no recorded projection: ${filePath}`,
              }
            : decision._tag === "write"
              ? { _tag: "write" }
              : decision;
        },
      });
      if (outcome._tag === "success")
        for (const target of outcome.nativeTargets ?? []) {
          const bytes = rendered.get(target.path);
          if (bytes !== undefined && (target.decision === "write" || target.decision === "record"))
            rows.set(unit(target.path), {
              row: { gen, output: projectionOutputDigest(bytes) },
              stale: false,
            });
        }
      return outcome;
    });
  const remove = (
    agent: CodingAgent,
    args: Omit<RemoveSubagentArgs, "decideRemoval">,
    discardModified = false,
  ) =>
    Effect.gen(function* () {
      const outcome = yield* agent.removeSubagent({
        ...args,
        decideRemoval: ({ filePath, bytes }) => {
          const decision = decideOutputDeletion({
            bytes: Option.some(bytes),
            recorded: Option.fromUndefinedOr(rows.get(unit(filePath))),
            expectedRender: Option.none(),
            discardModified,
          });
          return decision._tag === "delete"
            ? decision
            : { _tag: "retain", reason: decision.reason };
        },
      });
      for (const file of args.renderedFilePaths) rows.delete(unit(file));
      return outcome;
    });
  return { rows, add, remove };
};

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
        const compiled = compileSubagentImplementation({ package: pkg, agentId });
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
        const compiled = compileSubagentImplementation({ package: pkg, agentId: "codex" });
        expect(compiled._tag).toBe("Compiled");
        if (compiled._tag !== "Compiled") return;
        expect(compiled.mode).toBe("native");
        expect(compiled.nativeName).toBe("native-review");
        expect(compiled.outputs[0]?.path).toBe("native-review.toml");
        expect(compiled.outputs[0]?.content).toBe(native);
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
      });
      const second = compileSubagentImplementation({
        package: yield* makePackage("Two"),
        agentId: "claude-code",
      });
      expect(first._tag).toBe("Compiled");
      expect(second._tag).toBe("Compiled");
      if (first._tag !== "Compiled" || second._tag !== "Compiled") return;
      expect(first.outputs).toEqual(second.outputs);
      expect(subagentProjectionGeneration([{ provenance, input: first.input }])).toBe(
        subagentProjectionGeneration([{ provenance, input: second.input }]),
      );
    }),
  );

  it.effect("keeps an unrecorded same-named document on write and removal", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fs.makeTempDirectoryScoped();
      const file = path.join(root, ".claude/agents/review.md");
      yield* fs.makeDirectory(path.dirname(file), { recursive: true });
      // An old inline marker is ordinary text and grants nothing.
      const foreign =
        "<!-- axm:file v=1 ext=@acme/subagents/review src=subagents/review/subagent.json -->\nForeign owner\n";
      yield* fs.writeFileString(file, foreign);
      const agent = codingAgentForId("claude-code");
      const owner = projection(root, path);
      const outcome = yield* owner.add(agent, {
        workspaceRoot: root,
        scope: "project",
        input: input("claude-code"),
      });
      expect(outcome._tag).toBe("conflict");
      const removal = yield* owner.remove(agent, {
        workspaceRoot: root,
        scope: "project",
        subagentName: "review",
        renderedFilePaths: [file],
      });
      expect(removal).toMatchObject({ _tag: "success", retained: [{ path: file }] });
      expect(yield* fs.readFileString(file)).toBe(foreign);
      expect(owner.rows.size).toBe(0);
    }).pipe(Effect.scoped, Effect.provide(services)),
  );

  it.effect("records an unrecorded file that already equals the render without writing it", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fs.makeTempDirectoryScoped();
      const file = path.join(root, ".claude/agents/review.md");
      const rendered = renderSubagent(input("claude-code"));
      if (rendered?._tag !== "Rendered") return expect.unreachable();
      const bytes = rendered.outputs[0]?.content ?? "";
      yield* fs.makeDirectory(path.dirname(file), { recursive: true });
      yield* fs.writeFileString(file, bytes);
      const owner = projection(root, path);
      const outcome = yield* owner.add(codingAgentForId("claude-code"), {
        workspaceRoot: root,
        scope: "project",
        input: input("claude-code"),
      });
      expect(outcome).toMatchObject({
        _tag: "success",
        nativeTargets: [{ path: file, change: "unchanged", decision: "record" }],
      });
      expect([...owner.rows.keys()]).toEqual([".claude/agents/review.md"]);
      expect(bytes).not.toContain("axm:");
    }).pipe(Effect.scoped, Effect.provide(services)),
  );

  it.effect("replaces an unrecorded differing file only when replacement is requested", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fs.makeTempDirectoryScoped();
      const file = path.join(root, ".claude/agents/review.md");
      yield* fs.makeDirectory(path.dirname(file), { recursive: true });
      yield* fs.writeFileString(file, "User content\n");
      const outcome = yield* projection(root, path, { replaceUnrecorded: true }).add(
        codingAgentForId("claude-code"),
        { workspaceRoot: root, scope: "project", input: input("claude-code") },
      );
      expect(outcome).toMatchObject({ _tag: "success", nativeTargets: [{ decision: "write" }] });
      expect(yield* fs.readFileString(file)).toContain("Review carefully");
    }).pipe(Effect.scoped, Effect.provide(services)),
  );

  it.effect(
    "keeps a reformatted recorded file while inputs are current and replaces it when they change",
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const root = yield* fs.makeTempDirectoryScoped();
        const file = path.join(root, ".claude/agents/review.md");
        const agent = codingAgentForId("claude-code");
        const owner = projection(root, path);
        const args = { workspaceRoot: root, scope: "project" as const, input: input(agent.id) };
        yield* owner.add(agent, args);
        yield* fs.writeFileString(file, "Repository-formatted review\n");
        expect(yield* owner.add(agent, args)).toMatchObject({
          nativeTargets: [{ change: "unchanged", decision: "current" }],
        });
        expect(yield* fs.readFileString(file)).toBe("Repository-formatted review\n");
        expect(
          yield* owner.add(agent, { ...args, input: { ...args.input, body: "Changed body" } }),
        ).toMatchObject({ nativeTargets: [{ change: "updated", decision: "write" }] });
        expect(yield* fs.readFileString(file)).toContain("Changed body");
      }).pipe(Effect.scoped, Effect.provide(services)),
  );

  it.effect("deletes a recorded file only while it holds AXM's last write", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fs.makeTempDirectoryScoped();
      const file = path.join(root, ".claude/agents/review.md");
      const agent = codingAgentForId("claude-code");
      const args = { workspaceRoot: root, scope: "project" as const, input: input(agent.id) };
      const removal = {
        workspaceRoot: root,
        scope: "project" as const,
        subagentName: "review",
        renderedFilePaths: [file],
      };
      for (const discardModified of [false, true]) {
        const owner = projection(root, path);
        yield* owner.add(agent, args);
        yield* fs.writeFileString(file, "Hand-edited review\n");
        const outcome = yield* owner.remove(agent, removal, discardModified);
        expect(yield* fs.exists(file)).toBe(!discardModified);
        expect(outcome).toMatchObject(
          discardModified ? { renderedFilePaths: [file] } : { retained: [{ reason: "modified" }] },
        );
        if (!discardModified) yield* fs.remove(file);
      }
    }).pipe(Effect.scoped, Effect.provide(services)),
  );

  it("shares one order-independent generation among readers of one file", () => {
    const first = renderSubagent(input("claude-code"));
    const second = renderSubagent(input("cursor"));
    expect(first?._tag).toBe("Rendered");
    expect(second?._tag).toBe("Rendered");
    if (first?._tag !== "Rendered" || second?._tag !== "Rendered") return;
    expect(first.outputs).toEqual(second.outputs);
    expect(first.outputs[0]?.path).toBe("review.md");
    const claude = { provenance, input: input("claude-code") };
    const cursor = { provenance, input: input("cursor") };
    expect(subagentProjectionGeneration([claude, cursor])).toBe(
      subagentProjectionGeneration([cursor, claude]),
    );
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
        const owner = projection(root, path);
        const agentIds = ["antigravity", "antigravity-cli"] as const;
        const claimants = agentIds.map((id) => ({ ...input(id), frontmatter: nativeFrontmatter }));
        let firstBytes: string | undefined;
        for (const [index, id] of agentIds.entries()) {
          const agent = codingAgentForId(id);
          const claimant = claimants[index] ?? input(id);
          const args = { workspaceRoot: root, scope, input: claimant, claimants };
          const result = yield* owner.add(agent, args);
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
          yield* owner.add(agent, args);
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
        yield* owner.add(cli, { workspaceRoot: root, scope, input: replacement });
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
        yield* owner.remove(cli, {
          workspaceRoot: root,
          scope,
          subagentName: "review",
          renderedFilePaths: [file],
        });
        expect(yield* fs.exists(file)).toBe(false);
        expect(yield* fs.readFileString(foreignFile)).toBe("User-authored subagent\n");
        yield* fs.writeFileString(file, "Unowned replacement\n");
        for (const id of ["antigravity", "antigravity-cli"] as const) {
          const outcome = yield* owner.add(codingAgentForId(id), {
            workspaceRoot: root,
            scope,
            input: input(id),
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
        const owner = projection(root, path);
        const args = { workspaceRoot: root, scope: "project" as const, input: input(agent.id) };
        const first = yield* owner.add(agent, args);
        expect(first._tag).toBe("success");
        const bytes = yield* fs.readFileString(path.join(actual, "review.md"));
        yield* owner.add(agent, args);
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
        const outcome = yield* projection(root, path, { replaceUnrecorded: true }).add(
          codingAgentForId(id),
          { workspaceRoot: root, scope: "project", input: input(id) },
        );
        expect(outcome._tag).toBe("unsupported");
        expect(yield* fs.readFileString(file)).toBe("User-owned native content\n");
      }).pipe(Effect.scoped, Effect.provide(services)),
  );
});
