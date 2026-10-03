import * as nodeFs from "node:fs";
import {
  UNCONSTRAINED_DESIRED_NODE,
  settleDesiredNodeConstraint,
  type DesiredExtensionNode,
} from "./desired-state-graph.js";
import { desiredConstraintOf } from "./test-stubs.js";
import * as nodeOs from "node:os";
import * as nodePath from "node:path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, layer } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import { afterEach, beforeEach } from "vitest";
import { computeMaterializedTreeIntegrity, TreeIntegritySchema } from "./materialized-tree.js";
import { exactVersion, extensionName, handle } from "../testing.js";
import { makeAbsolutePath } from "@agentxm/extension-model/unstable/path-types";
import { SourceHashSchema } from "@agentxm/extension-model/unstable/sources/source-hash";
import {
  canonicalPathForAcceptedExtension,
  observeAcceptedResolution,
  observeCanonicalExtension,
} from "./canonical-observation.js";
import type { DesiredNodeIdentity, DesiredSourceAuthority } from "./desired-identity.js";
import type { LockEntry } from "./lock-entry.js";
import * as Option from "effect/Option";
import { resolveProjectWorkspaceLayout } from "./layout.js";

const identityOf = (source: string): DesiredNodeIdentity =>
  source.startsWith("workspace:")
    ? { authority: "workspace", fqn: source.slice("workspace:".length) }
    : { authority: "git", locator: source };

const desiredSkill = (source = "github:acme/tools//skills/review@main"): DesiredExtensionNode => ({
  type: "skill",
  name: "review",
  identity: identityOf(source),
  source,
  enabled: true,
  constraint: UNCONSTRAINED_DESIRED_NODE,
  origins: [{ type: "settings", source, enabled: true }],
});
const placeholderTreeIntegrity = Schema.decodeUnknownSync(TreeIntegritySchema)(
  `sha256-tree-v2:${"0".repeat(64)}`,
);
const acceptedGit = (treeIntegrity = placeholderTreeIntegrity) => ({
  source: {
    type: "git" as const,
    url: new URL("https://github.com/acme/tools.git"),
    revision: "main",
    path: "skills/review",
  },
  identity: { owner: handle("@acme"), name: extensionName("review") },
  resolved: { commit: "commit-1", tree: "tree-1" },
  treeIntegrity,
});

const desiredPackMember = (
  sourceAuthority: DesiredSourceAuthority,
  range = "*",
): DesiredExtensionNode => {
  const origins = [
    {
      type: "pack",
      pack: { authority: "path", fqn: "@acme/packs/team" },
      manifestPath: "agent_extensions/path/@acme/packs/team/pack.json",
      source: "@acme/skills/review",
      sourceAuthority,
      constraint: range,
      enabled: true,
    },
  ] as const;
  return {
    type: "skill",
    name: "review",
    enabled: true,
    source: `@acme/skills/review@${range}`,
    identity: {
      authority: "registry",
      fqn: "@acme/skills/review",
      registry: { sourceName: undefined, endpoint: undefined },
    },
    origins,
    constraint: settleDesiredNodeConstraint({ type: "skill", name: "review", origins }),
  };
};

const acceptedPath = (path: string, treeIntegrity = placeholderTreeIntegrity): LockEntry => ({
  source: { type: "path", path },
  identity: { owner: handle("@acme"), name: extensionName("review") },
  resolved: { tree: Schema.decodeUnknownSync(SourceHashSchema)("path-source-tree-1") },
  treeIntegrity,
});

const projectLayout = (root: string) =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    return yield* resolveProjectWorkspaceLayout(makeAbsolutePath(path, root), {
      owner: handle("@acme"),
    });
  });

layer(NodeServices.layer, { excludeTestServices: true })("canonical observation", (it) => {
  let root: string;

  beforeEach(() => {
    root = nodeFs.mkdtempSync(nodePath.join(nodeOs.tmpdir(), "axm-canonical-observation-"));
  });
  afterEach(() => nodeFs.rmSync(root, { recursive: true, force: true }));

  for (const sourceRoot of ["vendor", "../vendor"]) {
    for (const range of ["*", "^1.0.0", "^2.0.0"]) {
      it.effect(`judges an accepted local Pack member beneath ${sourceRoot} against ${range}`, () =>
        Effect.gen(function* () {
          const path = yield* Path.Path;
          const layout = yield* projectLayout(root);
          const desired = desiredPackMember({ authority: "path", root: sourceRoot }, range);
          const accepted = acceptedPath(`${sourceRoot}/nested/review`);
          const canonical = canonicalPathForAcceptedExtension(path, layout, desired, accepted);
          if (canonical === undefined)
            return yield* Effect.die("Expected an acquired path for the accepted member");
          nodeFs.mkdirSync(nodePath.join(canonical, "src"), { recursive: true });
          nodeFs.writeFileSync(
            nodePath.join(canonical, "skill.json"),
            JSON.stringify({ owner: "@acme", type: "skill", name: "review", version: "1.4.0" }),
          );
          nodeFs.writeFileSync(nodePath.join(canonical, "src/SKILL.md"), "# Review\n");
          const treeIntegrity = yield* computeMaterializedTreeIntegrity(canonical);
          const observed = yield* observeCanonicalExtension({
            layout,
            desired,
            accepted: { ...accepted, treeIntegrity },
          });
          expect(observed.status).toBe(range === "^2.0.0" ? "constraint-mismatch" : "usable");
          expect(observed.path).toBe(canonical);
          if (observed.status === "constraint-mismatch")
            expect(observed.observedVersion).toBe("1.4.0");
          nodeFs.writeFileSync(
            nodePath.join(canonical, "skill.json"),
            JSON.stringify({ owner: "@acme", type: "skill", name: "review", version: "2.1.0" }),
          );
          expect(
            (yield* observeCanonicalExtension({
              layout,
              desired,
              accepted: { ...accepted, treeIntegrity },
            })).status,
          ).toBe("materialization-mismatch");
        }),
      );
    }
  }

  it.effect("requires exact Pack member identity and source-view containment", () =>
    Effect.gen(function* () {
      const path = yield* Path.Path;
      const desired = desiredPackMember({ authority: "path", root: "vendor" });
      for (const accepted of [
        acceptedPath("other/review"),
        acceptedPath("vendor-other/review"),
        acceptedPath("vendor/../other/review"),
        {
          ...acceptedPath("vendor/review"),
          identity: { owner: handle("@other"), name: extensionName("review") },
        },
        {
          ...acceptedPath("vendor/review"),
          identity: { owner: handle("@acme"), name: extensionName("another") },
        },
        acceptedGit(),
      ])
        expect(observeAcceptedResolution(desired, accepted, path)).toEqual(
          Option.some({ type: "skill", name: "review", status: "wrong-origin" }),
        );
      expect(observeAcceptedResolution(desired, acceptedPath("vendor/review"), path)).toEqual(
        Option.none(),
      );
      expect(observeAcceptedResolution(desired, acceptedPath("vendor/review"))).toEqual(
        Option.some({ type: "skill", name: "review", status: "wrong-origin" }),
      );
    }),
  );

  it.effect("requires the exact inherited Git repository, revision, and view root", () =>
    Effect.gen(function* () {
      const path = yield* Path.Path;
      const desired = desiredPackMember({
        authority: "git",
        url: new URL("https://github.com/acme/tools.git"),
        revision: "main",
        root: Option.some("skills"),
      });
      const accepted = acceptedGit();
      expect(observeAcceptedResolution(desired, accepted, path)).toEqual(Option.none());
      for (const source of [
        { ...accepted.source, revision: "other" },
        { ...accepted.source, url: new URL("https://github.com/other/tools.git") },
        { ...accepted.source, path: "skills-other/review" },
        { ...accepted.source, path: "other/review" },
      ])
        expect(observeAcceptedResolution(desired, { ...accepted, source }, path)).toEqual(
          Option.some({ type: "skill", name: "review", status: "wrong-origin" }),
        );
    }),
  );

  it.effect("binds an authored Pack's acquired member to its configured Registry", () =>
    Effect.gen(function* () {
      const path = yield* Path.Path;
      const endpoint = new URL("https://registry.example.com/");
      const desired: DesiredExtensionNode = {
        ...desiredPackMember({ authority: "workspace", fqn: "@acme/packs/team" }),
        identity: {
          authority: "registry",
          fqn: "@acme/skills/review",
          registry: { sourceName: "test", endpoint },
        },
      };
      const accepted: LockEntry = {
        source: { type: "registry", url: endpoint },
        identity: { owner: handle("@acme"), name: extensionName("review") },
        resolved: {
          version: exactVersion("1.0.0"),
          integrity: "sha512-registry-member",
          publisherBindingId: "test-publisher",
        },
        treeIntegrity: placeholderTreeIntegrity,
      };
      expect(observeAcceptedResolution(desired, accepted, path)).toEqual(Option.none());
      for (const foreign of [
        {
          ...accepted,
          source: { type: "registry" as const, url: new URL("https://other.example.com/") },
        },
        { ...accepted, identity: { owner: handle("@other"), name: extensionName("review") } },
        { ...accepted, identity: { owner: handle("@acme"), name: extensionName("other") } },
        acceptedPath("vendor/review"),
      ]) {
        expect(observeAcceptedResolution(desired, foreign, path)).toEqual(
          Option.some({ type: "skill", name: "review", status: "wrong-origin" }),
        );
      }
      expect(
        observeAcceptedResolution(
          {
            ...desired,
            identity: {
              authority: "registry",
              fqn: "@acme/skills/review",
              registry: { sourceName: "test", endpoint: undefined },
            },
          },
          accepted,
          path,
        ),
      ).toEqual(Option.some({ type: "skill", name: "review", status: "wrong-origin" }));
    }),
  );

  it.effect("does not invent a version for constrained portable Skill content", () =>
    Effect.gen(function* () {
      const path = yield* Path.Path;
      const layout = yield* projectLayout(root);
      const desired = { ...desiredSkill(), constraint: desiredConstraintOf("*") };
      const accepted = { ...acceptedGit(), identity: { name: extensionName("review") } };
      const canonical = canonicalPathForAcceptedExtension(path, layout, desired, accepted);
      if (canonical === undefined) return yield* Effect.die("Expected a portable canonical path");
      nodeFs.mkdirSync(canonical, { recursive: true });
      nodeFs.writeFileSync(
        nodePath.join(canonical, "SKILL.md"),
        "---\nname: review\ndescription: Review carefully\n---\n# Review\n",
      );
      const treeIntegrity = yield* computeMaterializedTreeIntegrity(canonical);
      expect(
        (yield* observeCanonicalExtension({
          layout,
          desired,
          accepted: { ...accepted, treeIntegrity },
        })).status,
      ).toBe("constraint-mismatch");
    }),
  );

  it.effect("requires accepted resolution for external desired content", () =>
    Effect.gen(function* () {
      const layout = yield* projectLayout(root);
      const observed = yield* observeCanonicalExtension({
        layout,
        desired: desiredSkill(),
        accepted: undefined,
      });
      expect(observed.status).toBe("missing-resolution");
    }),
  );

  it.effect("judges a disabled node without an accepted resolution by the same rule", () =>
    Effect.gen(function* () {
      const layout = yield* projectLayout(root);
      const observed = yield* observeCanonicalExtension({
        layout,
        desired: { ...desiredSkill(), enabled: false },
        accepted: undefined,
      });
      expect(observed.status).toBe("missing-resolution");
    }),
  );

  it.effect("judges the retained content of a disabled node with an accepted resolution", () =>
    Effect.gen(function* () {
      const layout = yield* projectLayout(root);
      const observed = yield* observeCanonicalExtension({
        layout,
        desired: { ...desiredSkill(), enabled: false },
        accepted: acceptedGit(),
      });
      expect(observed.status).toBe("missing");
    }),
  );

  it.effect(
    "accepts present external canonical bytes without treating local drift as authority",
    () =>
      Effect.gen(function* () {
        const layout = yield* projectLayout(root);
        const canonical = nodePath.join(
          root,
          "agent_extensions",
          "git",
          "@acme",
          "skills",
          "review",
        );
        nodeFs.mkdirSync(nodePath.join(canonical, "src"), { recursive: true });
        nodeFs.writeFileSync(
          nodePath.join(canonical, "skill.json"),
          JSON.stringify({
            owner: "@acme",
            type: "skill",
            name: "review",
            version: "1.0.0",
          }),
        );
        nodeFs.writeFileSync(nodePath.join(canonical, "src", "SKILL.md"), "# Locally formatted\n");
        const treeIntegrity = yield* computeMaterializedTreeIntegrity(canonical);
        const observed = yield* observeCanonicalExtension({
          layout,
          desired: desiredSkill(),
          accepted: acceptedGit(treeIntegrity),
        });
        expect(observed.status).toBe("usable");
        expect(observed.path).toBe(canonical);
      }),
  );

  it.effect("detects accepted source identity mismatch", () =>
    Effect.gen(function* () {
      const layout = yield* projectLayout(root);
      const observed = yield* observeCanonicalExtension({
        layout,
        desired: desiredSkill("github:other/tools//skills/review@main"),
        accepted: acceptedGit(),
      });
      expect(observed.status).toBe("wrong-origin");
    }),
  );

  it.effect("enforces Registry constraints from accepted resolution state", () =>
    Effect.gen(function* () {
      const layout = yield* projectLayout(root);
      const source = "@acme/rules/release@^2.0.0";
      const routes = {
        type: "rule",
        name: "release",
        origins: [
          { type: "settings", source, constraint: "^2.0.0", enabled: true },
          {
            type: "pack",
            pack: { authority: "registry", fqn: "@acme/packs/platform" },
            manifestPath: `${root}/agent_extensions/registry/@acme/packs/platform/pack.json`,
            source: "@acme/rules/release",
            constraint: "^2.0.0",
            enabled: true,
          },
        ],
      } satisfies Pick<DesiredExtensionNode, "type" | "name" | "origins">;
      const desired: DesiredExtensionNode = {
        ...routes,
        identity: {
          authority: "registry",
          fqn: "@acme/rules/release",
          registry: { sourceName: undefined, endpoint: new URL("https://registry.agentxm.ai") },
        },
        source,
        enabled: true,
        constraint: settleDesiredNodeConstraint(routes),
      };
      const observed = yield* observeCanonicalExtension({
        layout,
        desired,
        accepted: {
          source: { type: "registry", url: new URL("https://registry.agentxm.ai") },
          identity: { owner: handle("@acme"), name: extensionName("release") },
          resolved: {
            version: exactVersion("1.9.0"),
            integrity: "sha512-archive",
            publisherBindingId: "binding-1",
          },
          treeIntegrity: placeholderTreeIntegrity,
        },
      });
      expect(observed.status).toBe("constraint-mismatch");
      if (observed.status === "constraint-mismatch") {
        expect(observed.acceptedVersion).toBe("1.9.0");
        expect(observed.authority).toMatchObject({
          source: "desired-state-graph",
          identity: "@acme/rules/release",
          locator: source,
          constraints: [
            { source: "settings", range: "^2.0.0" },
            {
              source: "pack",
              dependingPack: "@acme/packs/platform",
              range: "^2.0.0",
            },
          ],
        });
      }
    }),
  );

  it.effect("observes authored workspace content without a lock row", () =>
    Effect.gen(function* () {
      const layout = yield* projectLayout(root);
      const source = "workspace:@acme/skills/review";
      const desired = desiredSkill(source);
      const canonical = nodePath.join(root, "skills", "review");
      nodeFs.mkdirSync(nodePath.join(canonical, "src"), { recursive: true });
      nodeFs.writeFileSync(
        nodePath.join(canonical, "skill.json"),
        JSON.stringify({
          owner: "@acme",
          type: "skill",
          name: "review",
          version: "1.0.0",
        }),
      );
      nodeFs.writeFileSync(nodePath.join(canonical, "src", "SKILL.md"), "# Authored\n");
      const observed = yield* observeCanonicalExtension({
        layout,
        desired,
        accepted: undefined,
      });
      expect(observed.status).toBe("usable");
    }),
  );

  it.effect("judges native-only subagents by declared package references", () =>
    Effect.gen(function* () {
      const layout = yield* projectLayout(root);
      const source = "workspace:@acme/subagents/review";
      const desired: DesiredExtensionNode = {
        type: "subagent",
        name: "review",
        identity: identityOf(source),
        source,
        enabled: false,
        constraint: UNCONSTRAINED_DESIRED_NODE,
        origins: [{ type: "settings", source, enabled: false }],
      };
      const canonical = nodePath.join(root, "subagents", "review");
      nodeFs.mkdirSync(nodePath.join(canonical, "native"), { recursive: true });
      nodeFs.writeFileSync(
        nodePath.join(canonical, "subagent.json"),
        JSON.stringify({
          owner: "@acme",
          type: "subagent",
          name: "review",
          version: "1.0.0",
          implementations: { codex: { kind: "native", source: "native/reviewer.toml" } },
        }),
      );
      const observe = () => observeCanonicalExtension({ layout, desired, accepted: undefined });
      expect((yield* observe()).status).toBe("incomplete");
      nodeFs.writeFileSync(
        nodePath.join(canonical, "native/reviewer.toml"),
        'name = "investigator"\ndescription = "Review"\ndeveloper_instructions = "Inspect evidence"\n',
      );
      expect((yield* observe()).status).toBe("usable");
      nodeFs.rmSync(nodePath.join(canonical, "native/reviewer.toml"));
      expect((yield* observe()).status).toBe("incomplete");
    }),
  );

  it.effect("evaluates pack constraints against an authored workspace manifest", () =>
    Effect.gen(function* () {
      const layout = yield* projectLayout(root);
      const source = "workspace:@acme/rules/release";
      const desired: DesiredExtensionNode = {
        type: "rule",
        name: "release",
        identity: identityOf(source),
        source,
        enabled: true,
        constraint: desiredConstraintOf("^2.0.0"),
        origins: [
          { type: "settings", source, enabled: true },
          {
            type: "pack",
            pack: { authority: "registry", fqn: "@acme/packs/release" },
            manifestPath: `${root}/packs/release/pack.json`,
            source: "@acme/rules/release",
            constraint: "^2.0.0",
            enabled: true,
          },
        ],
      };
      const canonical = nodePath.join(root, "rules", "release");
      nodeFs.mkdirSync(nodePath.join(canonical, "src"), { recursive: true });
      nodeFs.writeFileSync(
        nodePath.join(canonical, "rule.json"),
        JSON.stringify({
          $schema: "https://axm.sh/schemas/rule.schema.json",
          type: "rule",
          name: "release",
          owner: "@acme",
          version: "2.1.0",
          description: "Release policy",
        }),
      );
      nodeFs.writeFileSync(nodePath.join(canonical, "src", "RULE.md"), "# Release\n");

      const observed = yield* observeCanonicalExtension({
        layout,
        desired,
        accepted: undefined,
      });

      expect(observed.status).toBe("usable");
    }),
  );
});
