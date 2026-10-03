import { rmSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import * as nodePath from "node:path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { nativeSubagentMarker } from "./sync.js";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import type { AddSubagentArgs, CodingAgent, RemoveSubagentArgs } from "../agents/coding-agent.js";
import type { SubagentRenderInput } from "./rendering/types.js";
import { codingAgentForId } from "../agents/adapters.js";
import { NativeWriteAuthorityPermissive } from "../testing.js";

const TestLayer = Layer.merge(NodeServices.layer, NativeWriteAuthorityPermissive);
const withNode = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  effect.pipe(Effect.provide(TestLayer));

const claudeCodeCodingAgent = codingAgentForId("claude-code");
const codexCodingAgent = codingAgentForId("codex");
const kiroCliCodingAgent = codingAgentForId("kiro-cli");
const rooCodingAgent = codingAgentForId("roo");
const windsurfCodingAgent = codingAgentForId("windsurf");

/**
 * Stand-in for the banner the owning projection renders. The wording and the
 * ownership marker are the projection's, so the assertions here only check
 * that the adapter stamps what it was handed into the formats that can carry
 * a comment.
 */
const ownershipBanner = {
  markdown: "<!-- axm:file v=1 ext=@acme/subagents/test-subagent src=src/test-subagent.md -->",
  toml: "# axm:file v=1 ext=@acme/subagents/test-subagent src=src/test-subagent.md",
} as const;

const makeRenderInput = (name = "test-subagent"): SubagentRenderInput => ({
  agentId: "claude-code",
  name,
  body: "You are a helpful test subagent.",
  frontmatter: {
    name,
    description: "A test subagent for unit tests.",
  },
  ownershipBanner,
});

const makeAddArgs = (
  workspaceRoot: string,
  agentId: string,
  name = "test-subagent",
): AddSubagentArgs => ({
  workspaceRoot,
  scope: "project",
  input: { ...makeRenderInput(name), agentId },
  force: false,
  previousManagedFiles: [],
});

const makeRemoveArgs = (
  workspaceRoot: string,
  renderedFilePaths: ReadonlyArray<string>,
  name = "test-subagent",
): RemoveSubagentArgs => ({
  workspaceRoot,
  scope: "project",
  subagentName: name,
  expectedManagedFile: { ext: `@acme/subagents/${name}`, src: `src/${name}.md` },
  renderedFilePaths: renderedFilePaths.map((p) =>
    nodePath.isAbsolute(p) ? nodePath.relative(workspaceRoot, p) : p,
  ),
});

describe("resolveEffectiveSubagentsDir", () => {
  describe("claude-code", () => {
    it.effect("resolves project-scope subagents dir", () =>
      withNode(
        Effect.gen(function* () {
          const outcome = yield* claudeCodeCodingAgent.resolveEffectiveSubagentsDir({
            workspaceRoot: "/workspace",
            scope: "project",
          });
          expect(outcome._tag).toBe("supported");
          if (outcome._tag === "supported") {
            expect(outcome.dir).toContain(".claude/agents");
          }
        }),
      ),
    );

    it.effect("resolves user-scope subagents dir", () =>
      withNode(
        Effect.gen(function* () {
          const outcome = yield* claudeCodeCodingAgent.resolveEffectiveSubagentsDir({
            workspaceRoot: "/workspace",
            scope: "user",
          });
          expect(outcome._tag).toBe("supported");
          if (outcome._tag === "supported") {
            expect(outcome.dir).toContain(".claude/agents");
          }
        }),
      ),
    );
  });

  describe("codex", () => {
    it.effect("resolves project-scope subagents dir", () =>
      withNode(
        Effect.gen(function* () {
          const outcome = yield* codexCodingAgent.resolveEffectiveSubagentsDir({
            workspaceRoot: "/workspace",
            scope: "project",
          });
          expect(outcome._tag).toBe("supported");
          if (outcome._tag === "supported") {
            expect(outcome.dir).toContain(".codex/agents");
          }
        }),
      ),
    );
  });

  describe("kiro-cli", () => {
    it.effect("exposes the native project directory without granting writer support", () =>
      withNode(
        Effect.gen(function* () {
          const locations = yield* kiroCliCodingAgent.resolveNativeReadLocations({
            workspaceRoot: "/workspace",
            scope: "project",
            kind: "subagent",
          });
          expect(locations).toEqual([
            expect.objectContaining({
              path: "/workspace/.kiro/agents",
              declaration: expect.objectContaining({ shape: "directory" }),
            }),
          ]);
          const outcome = yield* kiroCliCodingAgent.resolveEffectiveSubagentsDir({
            workspaceRoot: "/workspace",
            scope: "project",
          });
          expect(outcome).toEqual({
            _tag: "unsupported",
            reason: "AXM has no verified native Subagent writer for kiro-cli",
          });
        }),
      ),
    );

    it.effect("exposes the documented user directory without granting writer support", () =>
      withNode(
        Effect.gen(function* () {
          expect(
            yield* kiroCliCodingAgent.resolveNativeReadLocations({
              workspaceRoot: "/workspace",
              scope: "user",
              kind: "subagent",
            }),
          ).toEqual([
            expect.objectContaining({
              path: "/workspace/.kiro/agents",
              declaration: expect.objectContaining({
                root: "home",
                scope: "user",
                shape: "directory",
              }),
            }),
          ]);
          const outcome = yield* kiroCliCodingAgent.resolveEffectiveSubagentsDir({
            workspaceRoot: "/workspace",
            scope: "user",
          });
          expect(outcome).toEqual({
            _tag: "unsupported",
            reason: "AXM has no verified native Subagent writer for kiro-cli",
          });
        }),
      ),
    );
  });

  describe("roo", () => {
    it.effect("exposes the native project file without treating it as a writable directory", () =>
      withNode(
        Effect.gen(function* () {
          const locations = yield* rooCodingAgent.resolveNativeReadLocations({
            workspaceRoot: "/workspace",
            scope: "project",
            kind: "subagent",
          });
          expect(locations).toEqual([
            expect.objectContaining({
              path: "/workspace/.roomodes",
              declaration: expect.objectContaining({ shape: "file" }),
            }),
          ]);
          const outcome = yield* rooCodingAgent.resolveEffectiveSubagentsDir({
            workspaceRoot: "/workspace",
            scope: "project",
          });
          expect(outcome).toEqual({
            _tag: "unsupported",
            reason: "AXM has no verified native Subagent writer for roo",
          });
        }),
      ),
    );

    it.effect("does not invent a user file from native scope support", () =>
      withNode(
        Effect.gen(function* () {
          expect(
            yield* rooCodingAgent.resolveNativeReadLocations({
              workspaceRoot: "/workspace",
              scope: "user",
              kind: "subagent",
            }),
          ).toEqual([]);
          const outcome = yield* rooCodingAgent.resolveEffectiveSubagentsDir({
            workspaceRoot: "/workspace",
            scope: "user",
          });
          expect(outcome).toEqual({
            _tag: "unsupported",
            reason: "AXM has no verified native Subagent writer for roo",
          });
        }),
      ),
    );
  });

  describe("windsurf", () => {
    it.effect("returns unsupported because the catalog has no custom subagent path", () =>
      withNode(
        Effect.gen(function* () {
          const outcome = yield* windsurfCodingAgent.resolveEffectiveSubagentsDir({
            workspaceRoot: "/workspace",
            scope: "project",
          });
          expect(outcome).toEqual({
            _tag: "unsupported",
            reason: "Subagents are not supported in project scope for windsurf",
          });
        }),
      ),
    );
  });
});

describe("addSubagent", () => {
  const testAddSubagent = (agent: CodingAgent, expectedSubpath: string) =>
    it.effect(`${agent.id} writes subagent file`, () =>
      withNode(
        Effect.gen(function* () {
          const workspaceRoot = mkdtempSync(nodePath.join(tmpdir(), `axm-${agent.id}-subagent-`));
          try {
            const outcome = yield* agent.addSubagent(makeAddArgs(workspaceRoot, agent.id));
            if (outcome._tag === "unsupported") {
              return;
            }
            expect(outcome._tag).toBe("success");
            if (outcome._tag === "success") {
              expect(outcome.renderedFilePaths.length).toBeGreaterThan(0);
              const fs = yield* FileSystem.FileSystem;
              for (const filePath of outcome.renderedFilePaths) {
                expect(filePath).toContain(expectedSubpath);
                const content = yield* fs.readFileString(filePath);
                expect(content.length).toBeGreaterThan(0);
                expect(content).toContain(
                  filePath.endsWith(".toml") ? ownershipBanner.toml : ownershipBanner.markdown,
                );
              }
            }
          } finally {
            rmSync(workspaceRoot, { recursive: true, force: true });
          }
        }),
      ),
    );

  testAddSubagent(claudeCodeCodingAgent, ".claude/agents/test-subagent.md");
  testAddSubagent(codexCodingAgent, ".codex/agents/test-subagent.toml");

  it.effect.each([kiroCliCodingAgent, rooCodingAgent])(
    "preserves unsupported native ownership for $id",
    (agent) =>
      withNode(
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const root = yield* fs.makeTempDirectoryScoped();
          const outcome = yield* agent.addSubagent(makeAddArgs(root, agent.id));
          expect(outcome._tag).toBe("unsupported");
          expect(yield* fs.readDirectory(root)).toEqual([]);
        }).pipe(Effect.scoped),
      ),
  );
});

describe("removeSubagent", () => {
  it.effect("claude-code removes existing subagent file", () =>
    withNode(
      Effect.gen(function* () {
        const workspaceRoot = mkdtempSync(nodePath.join(tmpdir(), "axm-rm-subagent-"));
        try {
          // First add a subagent
          const addOutcome = yield* claudeCodeCodingAgent.addSubagent(
            makeAddArgs(workspaceRoot, "claude-code"),
          );
          expect(addOutcome._tag).toBe("success");
          if (addOutcome._tag !== "success") return;

          // Then remove it
          const removeOutcome = yield* claudeCodeCodingAgent.removeSubagent(
            makeRemoveArgs(workspaceRoot, addOutcome.renderedFilePaths),
          );
          expect(removeOutcome._tag).toBe("success");

          // Verify file is gone
          const fs = yield* FileSystem.FileSystem;
          for (const filePath of addOutcome.renderedFilePaths) {
            const exists = yield* fs
              .exists(filePath)
              .pipe(Effect.catch(() => Effect.succeed(false)));
            expect(exists).toBe(false);
          }
        } finally {
          rmSync(workspaceRoot, { recursive: true, force: true });
        }
      }),
    ),
  );

  it.effect("handles file-not-found gracefully", () =>
    withNode(
      Effect.gen(function* () {
        const workspaceRoot = mkdtempSync(nodePath.join(tmpdir(), "axm-rm-subagent-"));
        try {
          const outcome = yield* claudeCodeCodingAgent.removeSubagent(
            makeRemoveArgs(workspaceRoot, [
              nodePath.join(workspaceRoot, ".claude/agents/nonexistent.md"),
            ]),
          );
          expect(outcome._tag).toBe("success");
        } finally {
          rmSync(workspaceRoot, { recursive: true, force: true });
        }
      }),
    ),
  );

  it.effect("roo preserves mode entries without a native ownership proof", () =>
    withNode(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const root = yield* fs.makeTempDirectoryScoped();
        const file = nodePath.join(root, ".roomodes");
        const original = JSON.stringify({
          customModes: [{ slug: "test-subagent", roleDefinition: "User" }],
        });
        yield* fs.writeFileString(file, original);
        const outcome = yield* rooCodingAgent.removeSubagent(makeRemoveArgs(root, [file]));
        expect(outcome._tag).toBe("unsupported");
        expect(yield* fs.readFileString(file)).toBe(original);
      }).pipe(Effect.scoped),
    ),
  );
});

describe("overwrite behavior", () => {
  it.effect("preserves an existing unowned file", () =>
    withNode(
      Effect.gen(function* () {
        const workspaceRoot = mkdtempSync(nodePath.join(tmpdir(), "axm-conflict-subagent-"));
        try {
          const fs = yield* FileSystem.FileSystem;
          yield* fs.makeDirectory(nodePath.join(workspaceRoot, ".claude/agents"), {
            recursive: true,
          });
          yield* fs.writeFileString(
            nodePath.join(workspaceRoot, ".claude/agents/test-subagent.md"),
            "user-owned content without marker",
          );
          const outcome = yield* claudeCodeCodingAgent.addSubagent(
            makeAddArgs(workspaceRoot, "claude-code"),
          );
          expect(outcome._tag).toBe("conflict");
          expect(
            yield* fs.readFileString(
              nodePath.join(workspaceRoot, ".claude/agents/test-subagent.md"),
            ),
          ).toBe("user-owned content without marker");
        } finally {
          rmSync(workspaceRoot, { recursive: true, force: true });
        }
      }),
    ),
  );

  it.effect("re-renders existing file successfully", () =>
    withNode(
      Effect.gen(function* () {
        const workspaceRoot = mkdtempSync(nodePath.join(tmpdir(), "axm-managed-subagent-"));
        try {
          // First render
          const first = yield* claudeCodeCodingAgent.addSubagent(
            makeAddArgs(workspaceRoot, "claude-code"),
          );
          expect(first._tag).toBe("success");

          const second = yield* claudeCodeCodingAgent.addSubagent(
            makeAddArgs(workspaceRoot, "claude-code"),
          );
          expect(second._tag).toBe("success");
        } finally {
          rmSync(workspaceRoot, { recursive: true, force: true });
        }
      }),
    ),
  );

  it.effect("proceeds when no file exists", () =>
    withNode(
      Effect.gen(function* () {
        const workspaceRoot = mkdtempSync(nodePath.join(tmpdir(), "axm-nofile-subagent-"));
        try {
          const outcome = yield* claudeCodeCodingAgent.addSubagent(
            makeAddArgs(workspaceRoot, "claude-code"),
          );
          expect(outcome._tag).toBe("success");
        } finally {
          rmSync(workspaceRoot, { recursive: true, force: true });
        }
      }),
    ),
  );

  it.effect("preserves an opaque body at the same generation and refreshes changed inputs", () =>
    withNode(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const root = mkdtempSync(nodePath.join(tmpdir(), "axm-subagent-generation-"));
        try {
          const base = makeAddArgs(root, "claude-code");
          const args = {
            ...base,
            input: {
              ...base.input,
              ownershipBanner: {
                ...ownershipBanner,
                markdown: ownershipBanner.markdown.replace(" -->", " gen=first -->"),
              },
            },
          } satisfies AddSubagentArgs;
          const first = yield* claudeCodeCodingAgent.addSubagent(args);
          expect(first._tag).toBe("success");
          const file = nodePath.join(root, ".claude/agents/test-subagent.md");
          const rewritten = (yield* fs.readFileString(file)).replace(
            "You are a helpful test subagent.",
            "Repository-formatted body.",
          );
          yield* fs.writeFileString(file, rewritten);
          const unchanged = yield* claudeCodeCodingAgent.addSubagent(args);
          expect(unchanged).toMatchObject({
            _tag: "success",
            nativeTargets: [{ change: "unchanged" }],
          });
          expect(yield* fs.readFileString(file)).toBe(rewritten);

          const updated = yield* claudeCodeCodingAgent.addSubagent({
            ...args,
            input: {
              ...args.input,
              body: "Changed authoritative body.",
              ownershipBanner: {
                ...ownershipBanner,
                markdown: ownershipBanner.markdown.replace(" -->", " gen=second -->"),
              },
            },
          });
          expect(updated).toMatchObject({
            _tag: "success",
            nativeTargets: [{ change: "updated" }],
          });
          expect(yield* fs.readFileString(file)).toContain("Changed authoritative body.");
        } finally {
          rmSync(root, { recursive: true, force: true });
        }
      }),
    ),
  );

  it.effect("roo refuses to claim an existing mode by slug", () =>
    withNode(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const root = yield* fs.makeTempDirectoryScoped();
        const file = nodePath.join(root, ".roomodes");
        const original = JSON.stringify({
          customModes: [{ slug: "test-subagent", roleDefinition: "User" }],
        });
        yield* fs.writeFileString(file, original);
        const outcome = yield* rooCodingAgent.addSubagent(makeAddArgs(root, "roo"));
        expect(outcome._tag).toBe("unsupported");
        expect(yield* fs.readFileString(file)).toBe(original);
      }).pipe(Effect.scoped),
    ),
  );
});

describe("native subagent ownership parsing", () => {
  it("reads the marker after CRLF native frontmatter", () => {
    const raw = `---\r\nname: reviewer\r\ndescription: Review\r\n---\r\n${ownershipBanner.markdown}\r\nBody.\r\n`;
    expect(Option.getOrUndefined(nativeSubagentMarker(raw, "reviewer.md"))).toMatchObject({
      ext: "@acme/subagents/test-subagent",
      src: "src/test-subagent.md",
    });
  });
});
