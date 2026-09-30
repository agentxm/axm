import * as nodeFs from "node:fs";
import {
  UNCONSTRAINED_DESIRED_NODE,
  type DesiredExtensionNode,
  type DesiredStateGraph,
} from "./desired-state-graph.js";
import * as nodeOs from "node:os";
import * as nodePath from "node:path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, layer } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Context from "effect/Context";
import * as FileSystem from "effect/FileSystem";
import * as Ref from "effect/Ref";
import * as Schema from "effect/Schema";
import * as Path from "effect/Path";
import { afterEach, beforeEach } from "vitest";
import { makeAbsolutePath } from "@agentxm/extension-model/unstable/path-types";

import { handle } from "../testing.js";
import { observeInstallRoot } from "./install-root.js";
import { resolveProjectWorkspaceLayout } from "./layout.js";
import { LOCKFILE_VERSION, LockfileSchema, type Lockfile } from "../desired/lockfile/schema.js";
import { readLockfileCell } from "./state-cells.js";
import { makeRegistrySkillLockEntry } from "./test-stubs.js";

const node = (
  name: string,
  type: DesiredExtensionNode["type"] = "skill",
): DesiredExtensionNode => ({
  type,
  name,
  identity: {
    authority: "registry",
    fqn: `@acme/skills/${name}`,
    registry: { sourceName: "agentxm", endpoint: undefined },
  },
  source: `agentxm:@acme/skills/${name}@^1.0.0`,
  enabled: true,
  constraint: UNCONSTRAINED_DESIRED_NODE,
  origins: [{ type: "settings", source: `agentxm:@acme/skills/${name}@^1.0.0`, enabled: true }],
});

const graph = (nodes: ReadonlyArray<DesiredExtensionNode>, settled = true): DesiredStateGraph => ({
  nodes,
  mcpSourceClosures: [],
  problems: [],
  // An unsettled graph has an active Pack whose membership is unknown.
  packMembership: settled
    ? []
    : [
        {
          settingsName: "missing",
          pack: "@acme/packs/missing",
          enabled: true,
          declared: { status: "unknown", reason: "absent" },
          routes: "unknown",
        },
      ],
});

const noLocks = {
  lockfile: Effect.succeed({ lockfileVersion: LOCKFILE_VERSION, skills: {} } satisfies Lockfile),
};

layer(NodeServices.layer, { excludeTestServices: true })("install-root inventory", (it) => {
  let root: string;
  beforeEach(() => {
    root = nodeFs.mkdtempSync(nodePath.join(nodeOs.tmpdir(), "axm-install-root-"));
  });
  afterEach(() => nodeFs.rmSync(root, { recursive: true, force: true }));

  const write = (relative: string, content = "") => {
    const absolute = nodePath.join(root, relative);
    nodeFs.mkdirSync(nodePath.dirname(absolute), { recursive: true });
    nodeFs.writeFileSync(absolute, content);
  };
  const observe = (desired: DesiredStateGraph) =>
    Effect.gen(function* () {
      const path = yield* Path.Path;
      const layout = yield* resolveProjectWorkspaceLayout(makeAbsolutePath(path, root), {
        owner: handle("@acme"),
      });
      const inventory = yield* observeInstallRoot({ layout, graph: desired, locks: noLocks });
      const relative = (absolute: string) => nodePath.relative(root, absolute);
      return {
        packages: inventory.packages.map((entry) => [relative(entry.path), entry.reached]),
        leftovers: inventory.leftovers.map((entry) => relative(entry.path)),
        unrecognized: inventory.unrecognized.map((entry) => [
          relative(entry.path),
          entry.entryKind,
        ]),
      };
    });

  it.effect(
    "reads one lock document per inventory and observes a changed lock on the next read",
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const projectRoot = makeAbsolutePath(path, root);
        const runtimeDir = path.join(root, ".axm");
        const lockPath = path.join(root, "axm-lock.yaml");
        const authoredRoot = path.join(root, "skills");
        write("axm.json", "{}");
        write("skills/authored/SKILL.md", "# Authored");
        write("agent_extensions/registry/@acme/skills/review/skill.json", "{}");
        write("axm-lock.yaml", JSON.stringify({ lockfileVersion: LOCKFILE_VERSION, skills: {} }));
        const layout = yield* resolveProjectWorkspaceLayout(projectRoot, {});
        const counts = yield* Ref.make({ documents: 0, authoredDirectories: 0 });
        const countedFs: FileSystem.FileSystem = {
          ...fs,
          readFileString: (target, encoding) =>
            Ref.update(counts, (value) => ({
              ...value,
              documents: value.documents + (target === lockPath ? 1 : 0),
            })).pipe(Effect.andThen(fs.readFileString(target, encoding))),
          readDirectory: (target) =>
            Ref.update(counts, (value) => ({
              ...value,
              authoredDirectories: value.authoredDirectories + (target === authoredRoot ? 1 : 0),
            })).pipe(Effect.andThen(fs.readDirectory(target))),
        };
        const locks = {
          lockfile: readLockfileCell(
            {
              scope: "project",
              nativeDirectoryInputs: { skillsDirectoryOverrides: {} },
              projectRoot,
              userHome: makeAbsolutePath(path, path.join(root, "user-home")),
              projectRuntimeDir: runtimeDir,
              userRuntimeDir: path.join(root, "user-home", ".axm", "workspace", ".axm"),
            },
            runtimeDir,
          ).pipe(
            Effect.provideContext(
              Context.make(FileSystem.FileSystem, countedFs).pipe(Context.add(Path.Path, path)),
            ),
          ),
        };
        const first = yield* observeInstallRoot({ layout, graph: graph([]), locks });
        expect(first.packages.find((entry) => entry.name === "review")?.lockKey).toBeUndefined();
        expect(yield* Ref.get(counts)).toEqual({ documents: 1, authoredDirectories: 1 });

        write(
          "axm-lock.yaml",
          JSON.stringify(
            Schema.encodeSync(LockfileSchema)({
              lockfileVersion: LOCKFILE_VERSION,
              skills: {
                review: makeRegistrySkillLockEntry({ owner: handle("@acme"), name: "review" }),
              },
            }),
          ),
        );
        yield* Ref.set(counts, { documents: 0, authoredDirectories: 0 });
        const second = yield* observeInstallRoot({ layout, graph: graph([]), locks });
        expect(second.packages.find((entry) => entry.name === "review")?.lockKey).toBe("review");
        expect(yield* Ref.get(counts)).toEqual({ documents: 1, authoredDirectories: 1 });
      }),
  );

  it.effect("classifies packages, leftovers, staging, and unrecognized entries", () =>
    Effect.gen(function* () {
      write("agent_extensions/registry/@acme/skills/review/skill.json", "{}");
      write("agent_extensions/registry/@acme/skills/stale/skill.json", "{}");
      write("agent_extensions/registry/@acme/skills/stale.axm-staging/skill.json", "{}");
      write("agent_extensions/registry/notes.txt", "hand-written");
      write("agent_extensions/registry/loose/SKILL.md", "# loose");
      nodeFs.symlinkSync("/nowhere", nodePath.join(root, "agent_extensions/registry/link"));

      const observed = yield* observe(graph([node("review")]));

      expect(observed.packages).toEqual([
        ["agent_extensions/registry/@acme/skills/review", true],
        ["agent_extensions/registry/@acme/skills/stale", false],
      ]);
      expect(observed.leftovers).toEqual(["agent_extensions/registry/@acme/skills/stale"]);
      expect(observed.unrecognized).toEqual([
        ["agent_extensions/registry/link", "symlink"],
        ["agent_extensions/registry/loose", "directory"],
        ["agent_extensions/registry/notes.txt", "file"],
      ]);
    }),
  );

  it.effect("claims no leftover while desired state is incomplete", () =>
    Effect.gen(function* () {
      write("agent_extensions/registry/@acme/skills/stale/skill.json", "{}");
      const observed = yield* observe(graph([], false));
      expect(observed.leftovers).toEqual([]);
    }),
  );

  it.effect("observes an absent install root as empty", () =>
    Effect.gen(function* () {
      const observed = yield* observe(graph([]));
      expect(observed).toEqual({ packages: [], leftovers: [], unrecognized: [] });
    }),
  );
});
