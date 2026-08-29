/**
 * In-memory workspace harness for CLI specifications.
 *
 * Composes the production workspace program layers over a real temporary
 * project directory with controlled ports: captured rendering, canned
 * interaction, test credentials, and no live network. Specifications drive
 * the real command handlers in-process and assert product-observable
 * postconditions — settings, lockfile, canonical content, agent projections,
 * and rendered results.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import * as Layer from "effect/Layer";

import { CodingAgentRepositoryLive } from "@agentxm/client-core/unstable/agents";
import { HookManagerLive } from "@agentxm/client-core/unstable/hooks";
import { KnowledgeIndexLive, KnowledgeManagerLive } from "@agentxm/client-core/unstable/knowledge";
import { McpServerManagerLive } from "@agentxm/client-core/unstable/mcps";
import { PackManagerLive } from "@agentxm/client-core/unstable/packs";
import { WorkspaceInvariantFactsLive } from "@agentxm/client-core/unstable/projection";
import { RuleManagerLive } from "@agentxm/client-core/unstable/rules";
import {
  SkillManagerLive,
  makeAxmSkillCompatibilityPolicyLayer,
} from "@agentxm/client-core/unstable/skills";
import { SourceHostProvidersLive } from "@agentxm/client-core/unstable/source-resolution";
import { SubagentManagerLive } from "@agentxm/client-core/unstable/subagents";
import * as Effect from "effect/Effect";

import {
  makeWorkspaceHandlerTestContext,
  writeWorkspaceFiles,
  type TestPromptConfig,
} from "axm.sh/unstable/specification-harness";

export interface SpecWorkspaceOptions {
  /** Render through the machine (JSON) renderer instead of the human one. */
  readonly machine?: boolean;
  readonly prompt?: TestPromptConfig;
  readonly flags?: {
    readonly verbose?: boolean;
    readonly quiet?: boolean;
    readonly nonInteractive?: boolean;
    readonly json?: boolean;
  };
  /** Initial `axm.json` content beyond the defaults. */
  readonly settings?: Parameters<typeof writeWorkspaceFiles>[1];
}

export const makeSpecWorkspace = (options: SpecWorkspaceOptions = {}) => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "axm-spec-")));
  writeWorkspaceFiles(root, options.settings ?? {});

  const context = makeWorkspaceHandlerTestContext({
    ...(options.machine !== undefined ? { machine: options.machine } : {}),
    ...(options.prompt !== undefined ? { prompt: options.prompt } : {}),
    flags: { nonInteractive: true, ...options.flags },
    wsOptions: { projectRoot: root },
  });

  const workspaceServiceLayer = Layer.provideMerge(
    Layer.mergeAll(
      SourceHostProvidersLive,
      CodingAgentRepositoryLive,
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
    KnowledgeIndexLive,
  );
  const extensionsLayer = Layer.provideMerge(PackManagerLive, coreExtensions);
  const fullLayer = Layer.provideMerge(extensionsLayer, workspaceServiceLayer);
  const invariantFactsLayer = Layer.provide(WorkspaceInvariantFactsLive, fullLayer);
  const layer = Layer.merge(fullLayer, invariantFactsLayer);

  return {
    /** Absolute project root of the temporary workspace. */
    root,
    layer,
    provide: Effect.provide(layer),
    rendererState: context.rendererState,
    logs: context.logs,
    readSettings: (): unknown => JSON.parse(fs.readFileSync(path.join(root, "axm.json"), "utf8")),
    readLockfileText: (): string => {
      const lockPath = path.join(root, "axm-lock.yaml");
      return fs.existsSync(lockPath) ? fs.readFileSync(lockPath, "utf8") : "";
    },
    exists: (relativePath: string): boolean => fs.existsSync(path.join(root, relativePath)),
    readFile: (relativePath: string): string =>
      fs.readFileSync(path.join(root, relativePath), "utf8"),
    listDirectory: (relativePath: string): readonly string[] =>
      fs.existsSync(path.join(root, relativePath))
        ? fs.readdirSync(path.join(root, relativePath)).sort()
        : [],
    snapshotTree: (relativePath: string): readonly string[] => {
      const start = path.join(root, relativePath);
      if (!fs.existsSync(start)) {
        return [];
      }
      const entries: string[] = [];
      const walk = (directory: string): void => {
        for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort()) {
          const entryPath = path.join(directory, entry.name);
          entries.push(path.relative(root, entryPath));
          if (entry.isDirectory()) {
            walk(entryPath);
          }
        }
      };
      walk(start);
      return entries.sort();
    },
    cleanup: (): void => {
      fs.rmSync(root, { recursive: true, force: true });
    },
  };
};

export interface LocalSkillFixture {
  readonly name: string;
  readonly description?: string;
  readonly version?: string;
  readonly owner?: string;
  readonly body?: string;
}

/**
 * Writes a local skill package (manifest plus `src/SKILL.md`) under
 * `<workspaceRoot>/vendor/<name>` and returns its absolute path for use as an
 * install source.
 */
export const writeLocalSkillPackage = (
  workspaceRoot: string,
  fixture: LocalSkillFixture,
): string => {
  const packageRoot = path.join(workspaceRoot, "vendor", fixture.name);
  fs.mkdirSync(packageRoot, { recursive: true });
  const description = fixture.description ?? `The ${fixture.name} skill.`;
  fs.writeFileSync(
    path.join(packageRoot, "skill.json"),
    `${JSON.stringify(
      {
        $schema: "https://axm.sh/schemas/skill.schema.json",
        owner: fixture.owner ?? "@acme",
        type: "skill",
        name: fixture.name,
        version: fixture.version ?? "1.0.0",
        description,
      },
      null,
      2,
    )}\n`,
  );
  fs.mkdirSync(path.join(packageRoot, "src"), { recursive: true });
  fs.writeFileSync(
    path.join(packageRoot, "src", "SKILL.md"),
    `---\nname: "${fixture.name}"\ndescription: "${description}"\n---\n\n# ${fixture.name}\n\n${fixture.body ?? description}\n`,
  );
  return packageRoot;
};
