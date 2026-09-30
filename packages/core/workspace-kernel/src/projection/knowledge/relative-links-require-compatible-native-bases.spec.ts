import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import { defineSpecification } from "@agentxm/specification-metadata";
import { reconcileKnowledgeDiscovery } from "../index.js";
import { NativeWriteAuthorityPermissive } from "../../agent-adapters/testing.js";

export const specification = defineSpecification({
  requirement: "workspace/knowledge/relative-links-require-compatible-native-bases",
  title: "Knowledge relative links require compatible native instruction bases",
  statement:
    "When publishing Knowledge discovery through native instruction aliases, AXM shall verify that relative links have the same resolved base for every configured applicable reader, or refuse before mutation when a differing native base lacks evidenced link-resolution semantics; a populated conditional alias with unknown applicability shall not be treated as safely absent.",
  class: "functional",
  role: "experience",
  goals: ["agent-interoperability", "workspace-intent-fidelity"],
  boundary: "platform",
  boundaryRationale:
    "Real temporary directories and aliases expose relative-link base differences.",
  methods: ["example"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const fixture = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const root = yield* fs.makeTempDirectoryScoped();
  const sourceDir = path.join(root, "knowledge/guide/src");
  yield* fs.makeDirectory(sourceDir, { recursive: true });
  yield* fs.writeFileString(path.join(sourceDir, "index.md"), "# Guide\n");
  const args = {
    scopeRoot: root,
    ownerRoot: root,
    scope: "project" as const,
    nativeDirectoryInputs: { skillsDirectoryOverrides: {} },
    configuredAgentIds: ["claude-code"],
    ownership: [
      {
        name: "guide",
        ref: "@acme/knowledge/guide",
        root: "knowledge/guide",
        scope: "project" as const,
      },
    ],
    eligible: false,
    config: { instructions: true },
    bundles: [{ owner: "@acme", name: "guide", sourceDir }],
    instructionsPath: path.join(root, "AGENTS.md"),
    instructionsDeclaredPath: path.join(root, "AGENTS.md"),
    instructionManagementEnabled: true,
  };
  return { fs, path, root, args };
});

describe("Knowledge native link bases", () => {
  it.effect(
    "supports aliases in the same resolved directory without claiming runtime execution",
    () =>
      Effect.gen(function* () {
        const { fs, path, root, args } = yield* fixture;
        yield* fs.symlink("AGENTS.md", path.join(root, "CLAUDE.md"));
        const result = yield* reconcileKnowledgeDiscovery(args);
        expect(result.changed).toBe(true);
        expect(yield* fs.readFileString(args.instructionsPath)).toContain(
          "(knowledge/guide/src/index.md)",
        );
        expect(result.nativeLocations[0]?.configuredConsumers).toEqual(["claude-code"]);
        expect(result.nativeLocations[0]?.availability[0]?.state).toBe("unverified");
      }).pipe(
        Effect.scoped,
        Effect.provide(Layer.merge(NativeWriteAuthorityPermissive, NodeServices.layer)),
      ),
  );

  it.effect.each([false, true])(
    "refuses an incompatible native alias before preview or apply: %s",
    (dryRun) =>
      Effect.gen(function* () {
        const { fs, path, root, args } = yield* fixture;
        const result = yield* reconcileKnowledgeDiscovery({
          ...args,
          configuredAgentIds: ["junie"],
          dryRun,
        }).pipe(Effect.result);
        expect(result._tag).toBe("Failure");
        if (result._tag === "Failure")
          expect(result.failure).toMatchObject({
            _tag: "ProjectionTargetUnsupported",
            detail: expect.stringContaining("link-resolution semantics are unverified"),
          });
        expect(yield* fs.exists(args.instructionsPath)).toBe(false);
        expect(yield* fs.exists(path.join(root, ".junie"))).toBe(false);
      }).pipe(
        Effect.scoped,
        Effect.provide(Layer.merge(NativeWriteAuthorityPermissive, NodeServices.layer)),
      ),
  );

  it.effect("does not constrain configured readers with an unconfigured deeper alias", () =>
    Effect.gen(function* () {
      const { fs, path, root, args } = yield* fixture;
      yield* fs.makeDirectory(path.join(root, ".junie"));
      yield* fs.symlink("../AGENTS.md", path.join(root, ".junie/AGENTS.md"));
      expect((yield* reconcileKnowledgeDiscovery(args)).changed).toBe(true);
      expect(yield* fs.readLink(path.join(root, ".junie/AGENTS.md"))).toBe("../AGENTS.md");
    }).pipe(
      Effect.scoped,
      Effect.provide(Layer.merge(NativeWriteAuthorityPermissive, NodeServices.layer)),
    ),
  );

  it.effect("preserves uncertainty for a populated conditional instruction alias", () =>
    Effect.gen(function* () {
      const { fs, path, root, args } = yield* fixture;
      const instructions = path.join(root, ".config/opencode/OTHER.md");
      yield* fs.makeDirectory(path.dirname(instructions), { recursive: true });
      yield* fs.writeFileString(instructions, "# Existing\n");
      yield* fs.makeDirectory(path.join(root, ".claude"));
      yield* fs.symlink("../.config/opencode/OTHER.md", path.join(root, ".claude/CLAUDE.md"));
      const result = yield* reconcileKnowledgeDiscovery({
        ...args,
        scope: "user",
        configuredAgentIds: ["opencode"],
        nativeDirectoryInputs: {
          skillsDirectoryOverrides: {},
          xdgConfigRoot: path.join(root, ".config"),
        },
        ownership: args.ownership.map((owner) => ({ ...owner, scope: "user" as const })),
        instructionsPath: instructions,
        instructionsDeclaredPath: instructions,
      }).pipe(Effect.result);
      expect(result._tag).toBe("Failure");
      if (result._tag === "Failure")
        expect(result.failure).toMatchObject({
          _tag: "ProjectionTargetUnsupported",
          detail: expect.stringContaining(".claude/CLAUDE.md"),
        });
      expect(yield* fs.readFileString(instructions)).toBe("# Existing\n");
    }).pipe(
      Effect.scoped,
      Effect.provide(Layer.merge(NativeWriteAuthorityPermissive, NodeServices.layer)),
    ),
  );
});
