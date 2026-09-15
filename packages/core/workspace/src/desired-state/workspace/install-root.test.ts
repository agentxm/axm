import * as nodeFs from "node:fs";
import * as nodeOs from "node:os";
import * as nodePath from "node:path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, layer } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import { afterEach, beforeEach } from "vitest";
import { makeAbsolutePath } from "@agentxm/extension-model/unstable/path-types";

import { handle } from "../test-helpers.js";
import type { DesiredExtensionNode, DesiredStateGraph } from "./desired-state-graph.js";
import { observeInstallRoot } from "./install-root.js";
import { resolveProjectWorkspaceLayout } from "./layout.js";
import type { LockfileReaderService } from "./lockfile-reader.js";

const node = (
  name: string,
  type: DesiredExtensionNode["type"] = "skill",
): DesiredExtensionNode => ({
  type,
  name,
  identity: `agentxm:@acme/skills/${name}`,
  source: `agentxm:@acme/skills/${name}@^1.0.0`,
  enabled: true,
  constraints: [],
  origins: [{ type: "settings", source: `agentxm:@acme/skills/${name}@^1.0.0`, enabled: true }],
});

const graph = (nodes: ReadonlyArray<DesiredExtensionNode>, complete = true): DesiredStateGraph => ({
  complete,
  nodes,
  mcpSourceClosures: [],
  problems: [],
});

// Assertion needed: the observation reads only `entries`, and every row here is empty.
const noLocks = {
  entries: () => Effect.succeed({}),
  entry: () => Effect.succeed(Option.none()),
} as unknown as LockfileReaderService;

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

  it.effect("classifies packages, leftovers, staging, and unrecognized entries", () =>
    Effect.gen(function* () {
      write("agent_extensions/agentxm/@acme/skills/review/skill.json", "{}");
      write("agent_extensions/agentxm/@acme/skills/stale/skill.json", "{}");
      write("agent_extensions/agentxm/@acme/skills/stale.axm-staging/skill.json", "{}");
      write("agent_extensions/agentxm/notes.txt", "hand-written");
      write("agent_extensions/agentxm/loose/SKILL.md", "# loose");
      nodeFs.symlinkSync("/nowhere", nodePath.join(root, "agent_extensions/agentxm/link"));

      const observed = yield* observe(graph([node("review")]));

      expect(observed.packages).toEqual([
        ["agent_extensions/agentxm/@acme/skills/review", true],
        ["agent_extensions/agentxm/@acme/skills/stale", false],
      ]);
      expect(observed.leftovers).toEqual(["agent_extensions/agentxm/@acme/skills/stale"]);
      expect(observed.unrecognized).toEqual([
        ["agent_extensions/agentxm/link", "symlink"],
        ["agent_extensions/agentxm/loose", "directory"],
        ["agent_extensions/agentxm/notes.txt", "file"],
      ]);
    }),
  );

  it.effect("claims no leftover while desired state is incomplete", () =>
    Effect.gen(function* () {
      write("agent_extensions/agentxm/@acme/skills/stale/skill.json", "{}");
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
