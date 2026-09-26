/**
 * A real project workspace and the whole application layer over it, for the
 * specifications that observe a coding-agent membership change.
 *
 * Recording membership belongs to `@agentxm/workspace/configuration`;
 * realizing installed extensions for the resulting membership, and cleaning
 * up the outputs a departing agent owned, belong to `@agentxm/workspace/reconciliation/sync`.
 * Neither feature may depend on the other, so the application is the only
 * layer at which one operation both records and realizes — which is what
 * these specifications are about. This fixture therefore composes the
 * product's own layers, not a rehearsal of them: the real workspace state,
 * projection capability, every per-type materialization manager, and the
 * agent catalog, over a throwaway directory.
 */

import * as fs from "node:fs";
import { snapshotTree } from "@agentxm/test-support";
import * as os from "node:os";
import * as nodePath from "node:path";

import * as ConfigProvider from "effect/ConfigProvider";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import { ReleaseAgePosture } from "@agentxm/workspace/resolution";
import { makeAxmSkillCompatibilityPolicyLayer } from "@agentxm/cli-maintenance/official-skill/composition";

import {
  CodingAgentRepositoryLive,
  HookManagerLive,
  KnowledgeManagerLive,
  McpServerManagerLive,
  NativeWriteAuthorityLive,
  PackManagerLive,
  RuleManagerLive,
  SkillManagerLive,
  SourceHostProvidersLive,
  SubagentManagerLive,
  makeWorkspaceHandlerTestContext,
} from "./test-helpers.js";
import { workspaceInvariantFactsLive } from "./workspace-invariant-facts-live.js";

export interface AgentMembershipFixtureOptions {
  /** Settings document written to `axm.json`; `agents` defaults to empty. */
  readonly settings?: Readonly<Record<string, unknown>>;
  /** Lockfile document written to `axm-lock.yaml`. */
  readonly lockfile?: Readonly<Record<string, unknown>>;
  /** Files written into the project root, keyed by workspace-relative path. */
  readonly files?: Readonly<Record<string, string>>;
  /** Render through the machine (JSON) renderer instead of the human one. */
  readonly machine?: boolean;
}

/** A throwaway initialized workspace with the full application layer over it. */
export const makeAgentMembershipFixture = (options: AgentMembershipFixtureOptions = {}) => {
  const root = fs.realpathSync(fs.mkdtempSync(nodePath.join(os.tmpdir(), "axm-agents-spec-")));
  const home = fs.realpathSync(fs.mkdtempSync(nodePath.join(os.tmpdir(), "axm-agents-home-")));

  const absolute = (relativePath: string) => nodePath.join(root, relativePath);
  const writeFile = (relativePath: string, contents: string): void => {
    const file = absolute(relativePath);
    fs.mkdirSync(nodePath.dirname(file), { recursive: true });
    fs.writeFileSync(file, contents);
  };
  /** Realize an extension into an agent directory the way the product does. */
  const link = (linkPath: string, targetPath: string): void => {
    const linkFile = absolute(linkPath);
    fs.mkdirSync(nodePath.dirname(linkFile), { recursive: true });
    fs.symlinkSync(
      nodePath.relative(nodePath.dirname(linkFile), absolute(targetPath)),
      linkFile,
      "dir",
    );
  };

  fs.mkdirSync(absolute(".axm"), { recursive: true });
  writeFile("axm.json", `${JSON.stringify({ agents: [], ...options.settings }, null, 2)}\n`);
  // JSON is valid YAML, so the lockfile fixture needs no emitter.
  writeFile(
    "axm-lock.yaml",
    `${JSON.stringify({ lockfileVersion: 8, skills: {}, ...options.lockfile }, null, 2)}\n`,
  );
  for (const [relativePath, contents] of Object.entries(options.files ?? {})) {
    writeFile(relativePath, contents);
  }

  const context = makeWorkspaceHandlerTestContext({
    ...(options.machine === undefined ? {} : { machine: options.machine }),
    flags: { nonInteractive: true },
    wsOptions: { projectRoot: root, scope: "project" },
  });

  const workspaceServiceLayer = Layer.provideMerge(
    Layer.mergeAll(
      SourceHostProvidersLive,
      CodingAgentRepositoryLive,
      NativeWriteAuthorityLive,
      makeAxmSkillCompatibilityPolicyLayer("0.0.0-spec"),
    ),
    context.fullLayer,
  );
  const coreExtensions = Layer.mergeAll(
    RuleManagerLive,
    HookManagerLive,
    McpServerManagerLive,
    SkillManagerLive,
    SubagentManagerLive,
    KnowledgeManagerLive,
  );
  const extensionsLayer = Layer.provideMerge(PackManagerLive, coreExtensions);
  const fullLayer = Layer.provideMerge(extensionsLayer, workspaceServiceLayer);
  const composed = Layer.mergeAll(
    fullLayer,
    Layer.provide(workspaceInvariantFactsLive, fullLayer),
    Layer.succeed(ReleaseAgePosture, "enforce"),
  );
  // The user home is read through configuration, whose provider snapshots the
  // environment, so relocating it means supplying the provider rather than
  // mutating `process.env`.
  const layer = Layer.provide(
    composed,
    ConfigProvider.layer(
      ConfigProvider.fromEnv({
        env: Object.fromEntries([
          // Hermetic home for a throwaway workspace.
          ...Object.entries(process.env).flatMap(([key, value]) =>
            value === undefined ? [] : [[key, value] as const],
          ),
          ["AXM_USER_HOME", home] as const,
        ]),
      }),
    ),
  );

  return {
    root,
    home,
    writeFile,
    link,
    readFile: (relativePath: string): string => fs.readFileSync(absolute(relativePath), "utf8"),
    exists: (relativePath: string): boolean => fs.existsSync(absolute(relativePath)),
    readSettings: (): Readonly<Record<string, unknown>> => {
      const parsed: unknown = JSON.parse(fs.readFileSync(absolute("axm.json"), "utf8"));
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        throw new Error("Expected axm.json to contain an object");
      }
      return Object.fromEntries(Object.entries(parsed));
    },
    readLockfileText: (): string => fs.readFileSync(absolute("axm-lock.yaml"), "utf8"),
    /** Every entry under the project root. */
    snapshot: () => snapshotTree(root),
    /** Every entry under one workspace-relative directory. */
    snapshotOf: (relativePath: string) => snapshotTree(absolute(relativePath)),
    rendererState: context.rendererState,
    provide: Effect.provide(layer),
    cleanup: () => {
      fs.rmSync(root, { recursive: true, force: true });
      fs.rmSync(home, { recursive: true, force: true });
    },
  };
};

export type AgentMembershipFixture = ReturnType<typeof makeAgentMembershipFixture>;
