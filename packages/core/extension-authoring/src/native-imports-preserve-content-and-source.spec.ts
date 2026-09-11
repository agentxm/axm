import * as nodePath from "node:path";

import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { afterEach } from "vitest";

import { defineSpecification } from "@agentxm/specification-metadata";
import { deriveOperationOutcome } from "@agentxm/workspace-operations";

import { ImportNativeExtension } from "./import/import-native-extension.js";
import {
  applyExecution,
  authoringWorkspaceLayer,
  makeAuthoringWorkspace,
  type AuthoringWorkspace,
} from "./test-support/authoring-workspace.js";

export const specification = defineSpecification({
  requirement: "cli/native-imports-preserve-content-and-source",
  title: "Native imports create workspace packages without changing original content",
  statement:
    "When a person imports native Skill or Subagent content, AXM shall preserve the original source and its instructions while creating the requested workspace package, disabled unless activation is requested or the target is already enabled, and shall reject a managed package or mismatched target type.",
  class: "functional",
  role: "experience",
  goals: ["authoring-and-creation", "workspace-intent-fidelity"],
  methods: ["example", "decision-table"],
  boundary: "memory",
  boundaryRationale:
    "Preservation and activation are decisions of the import use case over real files: a temporary project workspace shows the native source byte-identical, the converted package's instructions intact, and the projection present exactly when the import ends up enabled.",
  derivedFrom: [
    "packages/core/extension-authoring/src/import-native-package.test.ts",
    "apps/cli/src/root/import/command.ts",
  ],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const NATIVE_BODY =
  "---\nname: original\ndescription: Review code carefully\n---\n\nKeep every recommendation evidence backed.\n";

/**
 * Each activation row: what the workspace already declared, what the person
 * asked for, and the activation the imported package ends up with.
 */
const activations = [
  { activation: "disabled", configured: undefined, enable: false, enabled: false },
  { activation: "requested", configured: undefined, enable: true, enabled: true },
  { activation: "already-enabled", configured: true, enable: false, enabled: true },
  { activation: "already-disabled", configured: false, enable: false, enabled: false },
  { activation: "requested-over-disabled", configured: false, enable: true, enabled: true },
] as const;

describe("Importing native instructions", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  const importNative = (
    created: AuthoringWorkspace,
    request: {
      readonly type: "skill" | "subagent";
      readonly source: string;
      readonly target: string;
      readonly enable: boolean;
    },
  ) =>
    Effect.gen(function* () {
      const candidate = yield* ImportNativeExtension.prepare({
        type: request.type,
        source: request.source,
        target: request.target,
        enable: request.enable,
      });
      return yield* ImportNativeExtension.previewOrApply(candidate, applyExecution);
    }).pipe(Effect.scoped, Effect.provide(authoringWorkspaceLayer(created)));

  /** Where each importable type keeps its native content and its projection. */
  const importable = [
    {
      type: "skill",
      plural: "skills",
      // A native Skill is a directory the entry document lives in.
      nativePath: "native/SKILL.md",
      sourcePath: "native",
      authoredEntry: "src/SKILL.md",
      projection: ".claude/skills/custom/SKILL.md",
      projected: ".claude/skills/custom",
    },
    {
      type: "subagent",
      plural: "subagents",
      // A native Subagent is the single instruction file itself.
      nativePath: "native/reviewer.md",
      sourcePath: "native/reviewer.md",
      authoredEntry: "src/custom.md",
      projection: ".claude/agents/custom.md",
      projected: ".claude/agents/custom.md",
    },
  ] as const;

  for (const type of importable)
    for (const row of activations)
      it.effect(`imports a ${type.type} with ${row.activation} activation`, () =>
        Effect.gen(function* () {
          const created = makeAuthoringWorkspace({ owner: "@acme", agents: ["claude-code"] });
          cleanups.push(created.cleanup);
          if (row.configured !== undefined) {
            created.writeSettings({
              owner: "@acme",
              agents: ["claude-code"],
              [type.plural]: {
                custom: {
                  source: `@acme/${type.plural}/original`,
                  enabled: row.configured,
                },
              },
            });
          }
          created.write(type.nativePath, NATIVE_BODY);
          const before = created.snapshot("native");

          const resolution = yield* importNative(created, {
            type: type.type,
            source: nodePath.join(created.root, type.sourcePath),
            target: `@acme/${type.plural}/custom`,
            enable: row.enable,
          });

          expect(deriveOperationOutcome(resolution)).toBe("applied");
          expect(created.snapshot("native")).toEqual(before);
          expect(
            JSON.parse(created.read(`${type.plural}/custom/${type.type}.json`) ?? "null"),
          ).toMatchObject({
            owner: "@acme",
            type: type.type,
            name: "custom",
            version: "0.1.0",
          });
          const content = created.read(`${type.plural}/custom/${type.authoredEntry}`);
          expect(content).toContain("name: custom");
          expect(content).toContain("Keep every recommendation evidence backed.");
          expect(created.settings()).toMatchObject({
            [type.plural]: {
              custom: row.enabled ? "workspace" : { source: "workspace", enabled: false },
            },
          });
          expect(created.exists(type.projected)).toBe(row.enabled);
          if (row.enabled) {
            expect(created.read(type.projection)).toContain(
              "Keep every recommendation evidence backed.",
            );
          }
        }),
      );

  for (const fault of ["managed-source", "wrong-type"] as const)
    it.effect(`refuses ${fault} without rewriting content`, () =>
      Effect.gen(function* () {
        const created = makeAuthoringWorkspace({ owner: "@acme", agents: [] });
        cleanups.push(created.cleanup);
        created.write(
          "native/SKILL.md",
          "---\nname: original\ndescription: Review\n---\nInstructions.\n",
        );
        if (fault === "managed-source") {
          created.write(
            "native/skill.json",
            JSON.stringify({ owner: "@acme", type: "skill", name: "original", version: "1.0.0" }),
          );
        }
        const before = created.snapshot();

        const failure = yield* importNative(created, {
          type: "skill",
          source: nodePath.join(created.root, "native"),
          target: fault === "wrong-type" ? "@acme/subagents/custom" : "@acme/skills/custom",
          enable: false,
        }).pipe(Effect.flip);

        if (fault === "managed-source") {
          expect(failure).toMatchObject({ _tag: "NativeImportInvalid" });
          expect(failure).toMatchObject({
            detail: expect.stringContaining("already a managed AXM package"),
          });
        } else {
          expect(failure).toMatchObject({
            _tag: "AuthoringFailed",
            category: "validation",
            detail: "Expected a skills target FQN, got @acme/subagents/custom",
          });
        }
        expect(created.snapshot()).toEqual(before);
      }),
    );
});
