/**
 * Installing a workspace-authored Hook records its package's content
 * hash. A caller whose own listing hashed that exact package root in the same
 * closure hands the hash over; the install hashes the package itself whenever
 * no hash is handed over or the handed root is another one.
 */

import * as nodeFs from "node:fs";
import * as nodeOs from "node:os";
import * as nodePath from "node:path";
import { describe, expect, it } from "@effect/vitest";
import { afterEach, beforeEach } from "vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as FetchHttpClient from "effect/http/FetchHttpClient";
import { RegistryTransportTest } from "@agentxm/registry-client/testing";
import { NativePlatformTest, workObservations } from "@agentxm/workspace-kernel/locations/testing";
import { HookManager } from "@agentxm/workspace-kernel/materialization";
import { WorkspaceFileWriteLocksLive } from "@agentxm/workspace-kernel/settlement/live";
import {
  CodingAgentRepositoryLive,
  NativeWriteAuthorityLive,
} from "@agentxm/workspace-kernel/projection/live";
import { SourceHostProviders } from "@agentxm/workspace-kernel/sources";
import { WorkspaceCatalogLive } from "@agentxm/workspace-kernel/sources/live";
import {
  SettingsSchema,
  UNCONSTRAINED_DESIRED_NODE,
  computePackageContentHash,
} from "@agentxm/workspace-kernel/workspace-state";
import {
  AcceptedResolutionWriterTest,
  MockWorkspaceTransactionScope,
  WorkspaceReadTest,
  configuredRow,
} from "@agentxm/workspace-kernel/workspace-state/testing";
import type { SourceHash } from "@agentxm/extension-model/unstable/sources/source-hash";
import { HookManagerLive } from "./manager.js";

const OWNER = "@acme";
const NAME = "review";

let baseDir: string;

beforeEach(() => {
  baseDir = nodeFs.realpathSync(
    nodeFs.mkdtempSync(nodePath.join(nodeOs.tmpdir(), "axm-hook-install-hash-")),
  );
});

afterEach(() => {
  nodeFs.rmSync(baseDir, { recursive: true, force: true });
});

const writeFiles = (root: string, files: Readonly<Record<string, string>>) => {
  for (const [relative, content] of Object.entries(files)) {
    const file = nodePath.join(root, relative);
    nodeFs.mkdirSync(nodePath.dirname(file), { recursive: true });
    nodeFs.writeFileSync(file, content);
  }
};

/** An authored Hook package under the project's authored root. */
const writeAuthoredPackage = () => {
  const root = nodePath.join(baseDir, "hooks", NAME);
  const identity = { owner: OWNER, type: "hook", name: NAME, version: "1.0.0" };
  writeFiles(root, {
    "hook.json": JSON.stringify({
      ...identity,
      implementations: [
        {
          id: "claude-code",
          protocol: "claude-code",
          bindings: [
            {
              id: "binding-0",
              event: "PreToolUse",
              matcher: "Write|Edit",
              handler: { type: "command", runtime: "bash", entrypoint: "src/hook.sh" },
            },
          ],
        },
      ],
    }),
    "src/hook.sh": "#!/usr/bin/env bash\n",
  });
  return root;
};

const decodeSettings = Schema.decodeUnknownSync(SettingsSchema);

/** The manager over one authored entry declared for `baseDir`. */
const managerLayer = () => {
  const axmDir = nodePath.join(baseDir, ".axm");
  const settings = decodeSettings({
    owner: OWNER,
    agents: ["claude-code"],
    hooks: { [NAME]: "workspace" },
  });
  const rows = [configuredRow({ type: "hook", name: NAME, source: "workspace" })];
  return HookManagerLive.pipe(
    Layer.provideMerge(WorkspaceCatalogLive),
    Layer.provideMerge(CodingAgentRepositoryLive),
    Layer.provideMerge(NativeWriteAuthorityLive),
    Layer.provideMerge(
      WorkspaceReadTest({
        baseDir,
        runtimeDir: axmDir,
        settings,
        graph: {
          packMembership: [],
          nodes: [
            {
              type: "hook",
              name: NAME,
              identity: { authority: "workspace", fqn: `${OWNER}/hooks/${NAME}` },
              source: "workspace",
              enabled: true,
              origins: [{ type: "settings", source: "workspace", enabled: true }],
              constraint: UNCONSTRAINED_DESIRED_NODE,
            },
          ],
          mcpSourceClosures: [],
          problems: [],
        },
        records: { rows: (type) => Effect.succeed(type === "hook" ? rows : []) },
      }),
    ),
    Layer.provideMerge(AcceptedResolutionWriterTest()),
    Layer.provideMerge(MockWorkspaceTransactionScope(axmDir)),
    Layer.provide(
      Layer.succeed(SourceHostProviders, {
        resolveNamedRegistry: () => Effect.die("not used"),
        find: () => Effect.die("not used"),
        fetch: () => Effect.die("not used"),
        acquireForTransition: () => Effect.die("not used"),
        cloneUrl: () => Option.none(),
        origin: () => "registry",
      }),
    ),
    Layer.provideMerge(WorkspaceFileWriteLocksLive),
    Layer.provideMerge(
      Layer.provideMerge(RegistryTransportTest(FetchHttpClient.layer), NativePlatformTest),
    ),
  );
};

/**
 * The authored entry as the authoring closure lists it, with an install of
 * that listed ref measured alone: the source hash it recorded and the package
 * hashes it executed.
 */
const listedInstall = Effect.gen(function* () {
  const manager = yield* HookManager;
  const [ref] = yield* manager.listMaterializable();
  if (ref?.refType !== "workspace") return yield* Effect.die("no workspace entry listed");
  const install = (preparedSourceHash?: { readonly root: string; readonly hash: SourceHash }) =>
    Effect.gen(function* () {
      const work = workObservations(false);
      const facts = yield* manager
        .materializeInstall({
          ref,
          ...(preparedSourceHash === undefined ? {} : { preparedSourceHash }),
        })
        .pipe(work.provide);
      return {
        recorded: Option.map(facts.acquired, (acquired) => acquired.sourceHash),
        hashes: work.facts.filter((fact) => fact.kind === "axm.hash.package").length,
      };
    });
  return { listed: { root: ref.location, hash: ref.sourceHash }, install };
});

describe("HookManager.materializeInstall of a workspace-authored package", () => {
  it.effect("records the listed hash of its own root without hashing it again", () => {
    writeAuthoredPackage();
    return Effect.gen(function* () {
      const { listed, install } = yield* listedInstall;
      // Measured before the install took the listing's hash: 1.
      expect(yield* install(listed)).toEqual({ recorded: Option.some(listed.hash), hashes: 0 });
    }).pipe(Effect.provide(managerLayer()));
  });

  it.effect("hashes the package itself when no hash or another root's is handed over", () => {
    const root = writeAuthoredPackage();
    const elsewhere = nodePath.join(baseDir, "elsewhere");
    writeFiles(elsewhere, { "other.txt": "other\n" });
    return Effect.gen(function* () {
      const { listed, install } = yield* listedInstall;
      const fresh = yield* computePackageContentHash(root);
      expect(listed.hash).toBe(fresh);
      expect(yield* install()).toEqual({ recorded: Option.some(fresh), hashes: 1 });
      // A hash handed over for another root is never recorded for this one.
      const foreign = yield* computePackageContentHash(elsewhere);
      expect(yield* install({ root: elsewhere, hash: foreign })).toEqual({
        recorded: Option.some(fresh),
        hashes: 1,
      });
    }).pipe(Effect.provide(managerLayer()));
  });
});
