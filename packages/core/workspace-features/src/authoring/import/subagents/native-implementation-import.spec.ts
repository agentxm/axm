import * as nodePath from "node:path";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { afterEach } from "vitest";
import { defineSpecification } from "@agentxm/specification-metadata";
import { deriveOperationOutcome } from "@agentxm/workspace-kernel/operations";
import { ImportNativeExtension } from "../../index.js";
import {
  applyExecution,
  authoringWorkspaceLayer,
  makeAuthoringWorkspace,
  previewExecution,
} from "../../test-support/authoring-workspace.js";

export const specification = defineSpecification({
  requirement: "cli/subagents/import/preserves-native-implementation-authority",
  title: "Native subagent imports preserve source identity and authored slot ownership",
  statement:
    "Subagent import shall require an explicit source runtime unless native location unambiguously identifies it, refuse contradictory runtime selection, and preserve complete native bytes and native identity. An import into an existing workspace-authored package shall fill only an empty runtime slot, preserving version, core, other implementations, and activation unless --enable is requested. It shall refuse acquired or undeclared existing targets, occupied slots, sources or targets changed after preparation, and enabled imports with configured agents but no compatible target, without changing workspace state. Disabled imports shall remain available without a compatible configured target.",
  class: "functional",
  role: "experience",
  goals: ["authoring-and-creation", "workspace-intent-fidelity", "safe-repetition"],
  methods: ["example", "decision-table"],
  boundary: "memory",
  boundaryRationale:
    "Real temporary source and workspace files observe byte preservation, slot ownership, activation and stale preparation refusals through the authoring use case.",
  derivedFrom: ["cli/native-imports-preserve-content-and-source"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const native =
  "---\nname: native-reviewer\ndescription: Review evidence\nmodel: sonnet\ncustom: retained\n---\n\nNative instructions only.\n";
describe("Native subagent implementation import", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });
  const workspace = () => {
    const created = makeAuthoringWorkspace({ owner: "@acme", agents: ["claude-code"] });
    cleanups.push(created.cleanup);
    created.write("native/reviewer.md", native);
    return created;
  };
  const existing = (created: ReturnType<typeof workspace>) => {
    created.writeSettings({
      owner: "@acme",
      agents: ["claude-code"],
      subagents: { custom: { source: "workspace", enabled: false } },
    });
    created.write(
      "subagents/custom/subagent.json",
      JSON.stringify({
        owner: "@acme",
        type: "subagent",
        name: "custom",
        version: "2.3.4",
        description: "Portable reviewer",
        core: { instructions: "src/core.md" },
        implementations: { cursor: { kind: "customized", configuration: { model: "fast" } } },
      }),
    );
    created.write("subagents/custom/src/core.md", "Portable instructions.\n");
  };
  it.effect(
    "adds an empty runtime slot without replacing core, version, other slots or activation",
    () =>
      Effect.gen(function* () {
        const created = workspace();
        existing(created);
        const before = created.snapshot();
        yield* Effect.gen(function* () {
          const candidate = yield* ImportNativeExtension.prepare({
            type: "subagent",
            source: nodePath.join(created.root, "native/reviewer.md"),
            sourceAgent: "claude-code",
            target: "@acme/subagents/custom",
            enable: false,
          });
          const preview = yield* ImportNativeExtension.previewOrApply(candidate, previewExecution);
          expect(deriveOperationOutcome(preview)).toBe("previewed");
          expect(created.snapshot()).toEqual(before);
          const applied = yield* ImportNativeExtension.previewOrApply(candidate, applyExecution);
          expect(deriveOperationOutcome(applied)).toBe("applied");
        }).pipe(Effect.scoped, Effect.provide(authoringWorkspaceLayer(created)));
        expect(created.read("native/reviewer.md")).toBe(native);
        expect(created.read("subagents/custom/native/claude-code/reviewer.md")).toBe(native);
        expect(JSON.parse(created.read("subagents/custom/subagent.json") ?? "null")).toMatchObject({
          version: "2.3.4",
          core: { instructions: "src/core.md" },
          implementations: {
            cursor: { kind: "customized", configuration: { model: "fast" } },
            "claude-code": { kind: "native", source: "native/claude-code/reviewer.md" },
          },
        });
        expect(created.settings()).toMatchObject({
          subagents: { custom: { source: "workspace", enabled: false } },
        });
        expect(created.exists(".claude/agents/native-reviewer.md")).toBe(false);
      }),
  );
  for (const fault of [
    "ambiguous",
    "contradiction",
    "acquired",
    "occupied",
    "undeclared",
  ] as const) {
    it.effect(`refuses ${fault} without changing state`, () =>
      Effect.gen(function* () {
        const created = workspace();
        if (fault === "occupied" || fault === "undeclared") existing(created);
        if (fault === "occupied") {
          created.write(
            "subagents/custom/subagent.json",
            JSON.stringify({
              owner: "@acme",
              type: "subagent",
              name: "custom",
              version: "2.3.4",
              implementations: { "claude-code": { kind: "native", source: "native.md" } },
            }),
          );
          created.write("subagents/custom/native.md", native);
        }
        if (fault === "undeclared")
          created.writeSettings({ owner: "@acme", agents: ["claude-code"] });
        if (fault === "acquired")
          created.writeSettings({
            owner: "@acme",
            agents: ["claude-code"],
            subagents: { custom: "@vendor/subagents/custom" },
          });
        if (fault === "contradiction") created.write(".cursor/agents/reviewer.md", native);
        const before = created.snapshot();
        yield* ImportNativeExtension.prepare({
          type: "subagent",
          source: nodePath.join(
            created.root,
            fault === "contradiction" ? ".cursor/agents/reviewer.md" : "native/reviewer.md",
          ),
          ...(fault === "ambiguous" ? {} : { sourceAgent: "claude-code" as const }),
          target: "@acme/subagents/custom",
          enable: false,
        }).pipe(Effect.flip, Effect.scoped, Effect.provide(authoringWorkspaceLayer(created)));
        expect(created.snapshot()).toEqual(before);
      }),
    );
  }
  it.effect("refuses a known catalog runtime with no importer as a capability failure", () =>
    Effect.gen(function* () {
      const created = workspace();
      const before = created.snapshot();
      const failure = yield* ImportNativeExtension.prepare({
        type: "subagent",
        source: nodePath.join(created.root, "native/reviewer.md"),
        sourceAgent: "chatgpt",
        target: "@acme/subagents/custom",
        enable: false,
      }).pipe(Effect.flip, Effect.scoped, Effect.provide(authoringWorkspaceLayer(created)));
      expect(failure).toMatchObject({
        _tag: "NativeSubagentImportUnsupported",
        agentId: "chatgpt",
      });
      expect(created.snapshot()).toEqual(before);
    }),
  );
  for (const enable of [false, true])
    it.effect(`preserves an unowned native destination with enable=${enable}`, () =>
      Effect.gen(function* () {
        const created = workspace();
        created.write(".claude/agents/native-reviewer.md", "Foreign definition.\n");
        const before = created.snapshot();
        yield* Effect.gen(function* () {
          const prepare = ImportNativeExtension.prepare({
            type: "subagent",
            source: nodePath.join(created.root, "native/reviewer.md"),
            sourceAgent: "claude-code",
            target: "@acme/subagents/custom",
            enable,
          });
          if (enable) {
            const failure = yield* Effect.flip(prepare);
            expect(failure).toMatchObject({ category: "conflict" });
          } else {
            const candidate = yield* prepare;
            const preview = yield* ImportNativeExtension.previewOrApply(
              candidate,
              previewExecution,
            );
            expect(deriveOperationOutcome(preview)).toBe("previewed");
          }
          expect(created.snapshot()).toEqual(before);
        }).pipe(Effect.scoped, Effect.provide(authoringWorkspaceLayer(created)));
      }),
    );
  for (const changed of ["source", "target"] as const)
    it.effect(`refuses a changed ${changed} after preparation`, () =>
      Effect.gen(function* () {
        const created = workspace();
        existing(created);
        yield* Effect.gen(function* () {
          const candidate = yield* ImportNativeExtension.prepare({
            type: "subagent",
            source: nodePath.join(created.root, "native/reviewer.md"),
            sourceAgent: "claude-code",
            target: "@acme/subagents/custom",
            enable: false,
          });
          created.write(
            changed === "source" ? "native/reviewer.md" : "subagents/custom/src/core.md",
            "Changed after preparation.\n",
          );
          const beforeApply = created.snapshot();
          const resolution = yield* ImportNativeExtension.previewOrApply(candidate, applyExecution);
          expect(deriveOperationOutcome(resolution)).toBe("blocked");
          expect(created.snapshot()).toEqual(beforeApply);
        }).pipe(Effect.scoped, Effect.provide(authoringWorkspaceLayer(created)));
      }),
    );
  for (const enable of [false, true])
    it.effect(`handles no compatible configured runtime with enable=${enable}`, () =>
      Effect.gen(function* () {
        const created = workspace();
        created.writeSettings({ owner: "@acme", agents: ["windsurf"] });
        const before = created.snapshot();
        yield* Effect.gen(function* () {
          const prepare = ImportNativeExtension.prepare({
            type: "subagent",
            source: nodePath.join(created.root, "native/reviewer.md"),
            sourceAgent: "claude-code",
            target: "@acme/subagents/custom",
            enable,
          });
          if (enable) {
            const failure = yield* Effect.flip(prepare);
            expect(failure).toMatchObject({
              _tag: "AuthoringFailed",
              category: "validation",
              detail: expect.stringContaining("No configured runtime"),
            });
            expect(created.snapshot()).toEqual(before);
          } else {
            const candidate = yield* prepare;
            const resolution = yield* ImportNativeExtension.previewOrApply(
              candidate,
              applyExecution,
            );
            expect(deriveOperationOutcome(resolution)).toBe("applied");
            expect(candidate.enabled).toBe(false);
          }
        }).pipe(Effect.scoped, Effect.provide(authoringWorkspaceLayer(created)));
      }),
    );
});
