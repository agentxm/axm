import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Layer from "effect/Layer";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import { defineSpecification } from "@agentxm/specification-metadata";
import { managedSubagentRenderInput, renderManagedSubagentOutputs } from "../index.js";
import { codingAgentForId } from "../../agent-adapters/index.js";
import { NativeWriteAuthorityPermissive } from "../../agent-adapters/testing.js";

export const specification = defineSpecification({
  requirement: "workspace/subagents/native-locations-respect-shape-and-proof",
  title: "Subagent output follows resolved native shape and requires ownership proof",
  statement:
    "AXM shall place Subagent files under their resolved catalog directory, render identical shared representations with identical generation metadata regardless of reader enumeration, preserve unowned native files, and report native writing unsupported when a file or keyed surface has no verified ownership representation rather than treating a filename as a directory or a slug as ownership.",
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
  source: { kind: "workspace-authored", path: "subagents/review/src/review.md" },
} as const;
const input = (agentId: string) => ({
  agentId,
  name: "review",
  body: "Review carefully",
  frontmatter: { name: "review", description: "Review" },
  agentOverrides: undefined,
});
const services = Layer.merge(NodeServices.layer, NativeWriteAuthorityPermissive);

describe("Native Subagent location contracts", () => {
  it.effect("preserves another owner's same-named managed document on write and removal", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fs.makeTempDirectoryScoped();
      const file = path.join(root, ".claude/agents/review.md");
      yield* fs.makeDirectory(path.dirname(file), { recursive: true });
      const foreign =
        "<!-- axm:file v=1 ext=@foreign/subagents/review src=subagents/review/src/review.md -->\nForeign owner\n";
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

  it.effect("uses Qoder CN's declared Qoder directory and converges through a parent alias", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fs.makeTempDirectoryScoped();
      const actual = path.join(root, "native-agents");
      yield* fs.makeDirectory(actual);
      yield* fs.makeDirectory(path.join(root, ".qoder"));
      yield* fs.symlink(actual, path.join(root, ".qoder/agents"));
      const agent = codingAgentForId("qoder-cn");
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
