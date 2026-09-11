/**
 * @agentxm/workspace-lint deterministic test fixtures.
 *
 * A lint run reads a real workspace through the state, agent-repository and
 * invariant-fact services, so a fixture here composes those over a throwaway
 * directory rather than answering for them. What it does supply is the two
 * things a lint example cannot state for itself without becoming brittle: a
 * configured rule set in which exactly one catalog rule is live, so no
 * unrelated finding can decide the scenario, and a workspace whose files are
 * written as the product writes them.
 *
 * `ProjectionParticipants` stays in the layer's requirements on purpose. Which
 * extension types contribute projections is a fact this package may not
 * invent — `@agentxm/workspace-lint` does not depend on the materialization
 * managers — so the caller states it, either with the real registry from
 * `@agentxm/extension-materialization/live` or with a deliberate stand-in from
 * `@agentxm/workspace-projection/testing`.
 *
 * Production source never imports this module.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as nodePath from "node:path";

import type * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import type * as Path from "effect/Path";
import type * as HttpClient from "effect/unstable/http/HttpClient";

import { decodeAbsolutePathSync } from "@agentxm/extension-model/unstable/path-types";
import {
  AXM_SKILL_CLI_VERSION_METADATA_KEY,
  AXM_SKILL_CLI_VERSION_RANGE_METADATA_KEY,
} from "@agentxm/extension-resolution";
import { AxmSkillCompatibilityPolicyTest } from "@agentxm/extension-resolution/testing";
import type { ProjectionParticipants } from "@agentxm/workspace-projection";
import {
  CodingAgentRepositoryLive,
  NativeWriteAuthorityLive,
  WorkspaceInvariantFactsLive,
} from "@agentxm/workspace-projection/live";
import type { WorkspaceMutationsError } from "@agentxm/workspace-state";
import { WorkspaceStateLive } from "@agentxm/workspace-state/live";
import { ConfiguredAgentOutcomesProviderTest } from "@agentxm/workspace-state/testing";

import { allCatalogRuleIds } from "./catalog/index.js";
import type { LintWorkspaceRequirements } from "./run/lint-workspace.js";

/** The severities a workspace may configure a catalog rule at. */
export type ConfiguredLintSeverity = "off" | "info" | "warn" | "error";

/**
 * A rule configuration in which exactly one catalog rule is live and every
 * other is `off`. A lint example that asserts on one rule's finding needs
 * this: without it an unrelated rule's finding can decide the run's exit
 * category and the example proves nothing about its own subject.
 *
 * Pass `undefined` for `severity` to leave the named rule at its catalog
 * default while every other rule is silenced. An unknown rule id throws, so a
 * renamed rule fails the example rather than silently matching nothing.
 */
export const isolatedLintRules = (
  ruleId: string,
  severity: ConfiguredLintSeverity | undefined,
): Readonly<Record<string, ConfiguredLintSeverity>> => {
  if (!allCatalogRuleIds.includes(ruleId)) {
    throw new Error(`Unknown lint rule '${ruleId}'`);
  }
  const rules: Record<string, ConfiguredLintSeverity> = {};
  for (const id of allCatalogRuleIds) {
    if (id !== ruleId) rules[id] = "off";
  }
  if (severity !== undefined) rules[ruleId] = severity;
  return rules;
};

export interface LintWorkspaceFixtureOptions {
  /** Settings document written to `axm.json`; `agents` defaults to empty. */
  readonly settings?: Readonly<Record<string, unknown>>;
  /** Files written into the workspace root, keyed by workspace-relative path. */
  readonly files?: Readonly<Record<string, string>>;
  /** The CLI version the official-skill compatibility policy evaluates against. */
  readonly cliVersion?: string | null;
}

/**
 * Every workspace-facing service a lint run reads through. The platform
 * services stay the caller's, so a test runs lint over the same file system
 * the product runs on; `ProjectionParticipants` stays in the requirements
 * because which extension types contribute projections is not this package's
 * fact to invent.
 */
export type LintWorkspaceServices = Layer.Layer<
  Exclude<LintWorkspaceRequirements, FileSystem.FileSystem | Path.Path>,
  WorkspaceMutationsError,
  FileSystem.FileSystem | Path.Path | HttpClient.HttpClient | ProjectionParticipants
>;

export interface LintWorkspaceFixture {
  readonly root: string;
  readonly writeFile: (relativePath: string, contents: string) => void;
  readonly readFile: (relativePath: string) => string;
  readonly exists: (relativePath: string) => boolean;
  readonly remove: (relativePath: string) => void;
  /** Rewrites `axm.json` wholesale, as an operator editing settings would. */
  readonly writeSettings: (settings: Readonly<Record<string, unknown>>) => void;
  /**
   * Link one workspace path at another, the way the product realizes an
   * extension into an agent's directory: a relative directory symlink from
   * the agent entry to the canonical source.
   */
  readonly link: (linkPath: string, targetPath: string) => void;
  /**
   * Every entry under the workspace, sorted by path: a file as its contents, a
   * directory as `directory`, a symbolic link as `symlink:<target>`. A lint
   * run that changed anything — including a link's target — changes this.
   */
  readonly snapshot: () => ReadonlyArray<readonly [string, string]>;
  /** Every workspace-facing service a lint run over this workspace reads through. */
  readonly layer: LintWorkspaceServices;
  readonly cleanup: () => void;
}

/**
 * Every workspace-facing service a lint run over one root reads through. A
 * Git-index run lints a materialized snapshot rather than the working tree, so
 * the root a run's services are built over is decided by the admitted
 * selection, not by the directory a fixture created.
 */
export const lintWorkspaceServices = (args: {
  readonly workspaceRoot: string;
  /** The CLI version the official-skill compatibility policy evaluates against. */
  readonly cliVersion?: string | null;
}): LintWorkspaceServices => {
  const state = WorkspaceStateLive({
    scope: "project",
    projectRoot: decodeAbsolutePathSync(args.workspaceRoot),
  });
  const agents = Layer.provideMerge(
    Layer.mergeAll(CodingAgentRepositoryLive, ConfiguredAgentOutcomesProviderTest),
    state,
  );
  return Layer.provideMerge(
    Layer.mergeAll(
      WorkspaceInvariantFactsLive.pipe(Layer.provide(NativeWriteAuthorityLive)),
      AxmSkillCompatibilityPolicyTest(args.cliVersion ?? null),
    ),
    agents,
  );
};

/** A throwaway initialized workspace with the services a lint run reads it through. */
export const makeLintWorkspace = (
  options: LintWorkspaceFixtureOptions = {},
): LintWorkspaceFixture => {
  const root = fs.realpathSync(fs.mkdtempSync(nodePath.join(os.tmpdir(), "axm-lint-")));

  const absolute = (relativePath: string) => nodePath.join(root, relativePath);
  const writeFile = (relativePath: string, contents: string): void => {
    const file = absolute(relativePath);
    fs.mkdirSync(nodePath.dirname(file), { recursive: true });
    fs.writeFileSync(file, contents);
  };
  const writeSettings = (settings: Readonly<Record<string, unknown>>): void => {
    writeFile("axm.json", `${JSON.stringify({ agents: [], ...settings }, null, 2)}\n`);
  };

  writeSettings(options.settings ?? {});
  for (const [relativePath, contents] of Object.entries(options.files ?? {})) {
    writeFile(relativePath, contents);
  }

  const link = (linkPath: string, targetPath: string): void => {
    const linkFile = absolute(linkPath);
    fs.mkdirSync(nodePath.dirname(linkFile), { recursive: true });
    fs.symlinkSync(
      nodePath.relative(nodePath.dirname(linkFile), absolute(targetPath)),
      linkFile,
      "dir",
    );
  };

  const snapshot = (): ReadonlyArray<readonly [string, string]> => {
    const entries: Array<readonly [string, string]> = [];
    const walk = (directory: string): void => {
      for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const child = nodePath.join(directory, entry.name);
        const relative = nodePath.relative(root, child);
        if (entry.isSymbolicLink()) {
          entries.push([relative, `symlink:${fs.readlinkSync(child)}`]);
          continue;
        }
        if (entry.isDirectory()) {
          entries.push([relative, "directory"]);
          walk(child);
          continue;
        }
        entries.push([relative, fs.readFileSync(child, "utf8")]);
      }
    };
    walk(root);
    return entries.sort((left, right) => left[0].localeCompare(right[0]));
  };

  const layer = lintWorkspaceServices({
    workspaceRoot: root,
    cliVersion: options.cliVersion ?? null,
  });

  return {
    root,
    writeFile,
    readFile: (relativePath) => fs.readFileSync(absolute(relativePath), "utf8"),
    exists: (relativePath) => fs.existsSync(absolute(relativePath)),
    remove: (relativePath) => fs.rmSync(absolute(relativePath), { force: true, recursive: true }),
    writeSettings,
    link,
    snapshot,
    layer,
    cleanup: () => fs.rmSync(root, { recursive: true, force: true }),
  };
};

// -----------------------------------------------------------------------------
// The official AXM skill
// -----------------------------------------------------------------------------

/** Where a project workspace keeps the official AXM skill's canonical package. */
export const OFFICIAL_AXM_SKILL_PACKAGE_ROOT = "agent_extensions/agentxm/@agentxm/skills/axm";

/** Where a workspace that authors its own `axm` skill keeps it. */
export const AUTHORED_AXM_SKILL_PACKAGE_ROOT = "skills/axm";

/** The agent directory entry `claude-code` reads a project skill from. */
export const CLAUDE_CODE_SKILLS_DIR = ".claude/skills";

/**
 * The states lint distinguishes for the official AXM skill: not declared at
 * all, declared under another owner's name, or declared as the official skill
 * and then missing, registry-sourced at an incompatible release,
 * version-skewed, workspace-authored, compatible (including a prerelease
 * inside the declared range), or unreadable.
 */
export type OfficialAxmSkillState =
  | "undeclared"
  | "non-official"
  | "official-missing"
  | "official-registry"
  | "official-skewed"
  | "official-authored"
  | "official-compatible"
  | "official-compatible-prerelease"
  | "official-unreadable";

/** The two rules that decide what lint says about the official AXM skill. */
export const OFFICIAL_AXM_SKILL_RULE_IDS = [
  "workspace/axm-skill-declared",
  "workspace/axm-skill-compatible",
] as const;

/**
 * A rule configuration in which only the two official-skill rules are live.
 * An official-skill example is about what lint concludes from the declaration
 * and the installed package, so no unrelated rule may decide its run.
 */
export const isolateOfficialAxmSkillRules = (): Readonly<
  Record<string, ConfiguredLintSeverity>
> => {
  const live = new Set<string>(OFFICIAL_AXM_SKILL_RULE_IDS);
  const rules: Record<string, ConfiguredLintSeverity> = {};
  for (const id of allCatalogRuleIds) {
    if (!live.has(id)) rules[id] = "off";
  }
  return rules;
};

/** The CLI release every official-skill fixture but the prerelease one runs as. */
export const FIXTURE_CLI_VERSION = "1.2.3";

/** The prerelease CLI release the in-range prerelease fixture runs as. */
export const FIXTURE_PRERELEASE_CLI_VERSION = "1.3.0-preview.1";

/** The bounded, wildcard-free range the fixture skills declare. */
const FIXTURE_CLI_VERSION_RANGE = ">=1.0.0 <2.0.0";

const officialSkillManifest = (version: string): string =>
  `${JSON.stringify(
    {
      $schema: "https://axm.sh/schemas/skill.schema.json",
      owner: "@agentxm",
      type: "skill",
      name: "axm",
      version,
      description: "The official AXM skill.",
    },
    null,
    2,
  )}\n`;

const officialSkillMd = (
  metadata: { readonly cliVersion: string; readonly cliVersionRange: string } | null,
): string =>
  [
    "---",
    "name: axm",
    "description: The official AXM skill.",
    ...(metadata === null
      ? []
      : [
          "metadata:",
          `  ${AXM_SKILL_CLI_VERSION_METADATA_KEY}: "${metadata.cliVersion}"`,
          `  ${AXM_SKILL_CLI_VERSION_RANGE_METADATA_KEY}: "${metadata.cliVersionRange}"`,
        ]),
    "---",
    "",
    "# axm",
    "",
    "Operate AXM from the agent.",
    "",
  ].join("\n");

/** The canonical package files a materialized official AXM skill is made of. */
export const officialAxmSkillPackage = (args: {
  readonly packageRoot: string;
  readonly version: string;
  /** `null` writes no `SKILL.md` at all, as a truncated materialization leaves it. */
  readonly metadata: { readonly cliVersion: string; readonly cliVersionRange: string } | null;
  readonly withSkillMd?: boolean;
}): Readonly<Record<string, string>> => ({
  [`${args.packageRoot}/skill.json`]: officialSkillManifest(args.version),
  ...(args.withSkillMd === false
    ? {}
    : { [`${args.packageRoot}/src/SKILL.md`]: officialSkillMd(args.metadata) }),
});

/** A lint workspace whose official AXM skill is arranged in one named state. */
export interface OfficialAxmSkillWorkspace extends LintWorkspaceFixture {
  /** The CLI release this workspace's compatibility policy evaluates against. */
  readonly cliVersion: string;
}

interface OfficialSkillArrangement {
  readonly cliVersion: string;
  readonly skills?: Readonly<Record<string, unknown>>;
  /** The handle the workspace publishes under; authored content requires it. */
  readonly owner?: string;
  readonly files: Readonly<Record<string, string>>;
  /** Agent directory entries realized from the canonical package. */
  readonly realized: ReadonlyArray<readonly [linkPath: string, targetPath: string]>;
}

const BUNDLED_ENTRY = { source: "workspace", enabled: true, origin: "bundled" } as const;
const REGISTRY_SOURCE = "agentxm:@agentxm/skills/axm";

const bundled = (version: string, metadataVersion: string): OfficialSkillArrangement => ({
  cliVersion: FIXTURE_CLI_VERSION,
  skills: { axm: BUNDLED_ENTRY },
  files: officialAxmSkillPackage({
    packageRoot: OFFICIAL_AXM_SKILL_PACKAGE_ROOT,
    version,
    metadata: { cliVersion: metadataVersion, cliVersionRange: FIXTURE_CLI_VERSION_RANGE },
  }),
  realized: [[`${CLAUDE_CODE_SKILLS_DIR}/axm`, `${OFFICIAL_AXM_SKILL_PACKAGE_ROOT}/src`]],
});

const arrangeOfficialSkill = (state: OfficialAxmSkillState): OfficialSkillArrangement => {
  switch (state) {
    case "undeclared":
      return { cliVersion: FIXTURE_CLI_VERSION, files: {}, realized: [] };
    case "non-official":
      // Declared under another owner's name: the workspace never asked for the
      // official skill, so lint has nothing to hold to compatibility.
      return {
        cliVersion: FIXTURE_CLI_VERSION,
        skills: { axm: "@acme/skills/axm" },
        files: {},
        realized: [],
      };
    case "official-missing":
      return {
        cliVersion: FIXTURE_CLI_VERSION,
        skills: { axm: REGISTRY_SOURCE },
        files: {},
        realized: [],
      };
    case "official-registry":
      return {
        cliVersion: FIXTURE_CLI_VERSION,
        skills: { axm: REGISTRY_SOURCE },
        files: officialAxmSkillPackage({
          packageRoot: OFFICIAL_AXM_SKILL_PACKAGE_ROOT,
          version: "0.0.1",
          metadata: { cliVersion: "0.0.1", cliVersionRange: ">=0.0.1 <0.1.0" },
        }),
        realized: [[`${CLAUDE_CODE_SKILLS_DIR}/axm`, `${OFFICIAL_AXM_SKILL_PACKAGE_ROOT}/src`]],
      };
    case "official-skewed":
      // The materialized release and the release its compatibility metadata
      // claims disagree, so nothing about the pair can be trusted.
      return bundled("0.0.1", FIXTURE_CLI_VERSION);
    case "official-authored":
      // A workspace that authors its own `axm` skill publishes under its own
      // handle, so the settings declare the owner authored content resolves
      // against.
      return {
        cliVersion: FIXTURE_CLI_VERSION,
        skills: { axm: "workspace" },
        owner: "@agentxm",
        files: officialAxmSkillPackage({
          packageRoot: AUTHORED_AXM_SKILL_PACKAGE_ROOT,
          version: "0.0.1",
          metadata: null,
        }),
        realized: [[`${CLAUDE_CODE_SKILLS_DIR}/axm`, `${AUTHORED_AXM_SKILL_PACKAGE_ROOT}/src`]],
      };
    case "official-compatible":
      return bundled(FIXTURE_CLI_VERSION, FIXTURE_CLI_VERSION);
    case "official-compatible-prerelease":
      return {
        ...bundled(FIXTURE_PRERELEASE_CLI_VERSION, FIXTURE_PRERELEASE_CLI_VERSION),
        cliVersion: FIXTURE_PRERELEASE_CLI_VERSION,
      };
    case "official-unreadable":
      return {
        cliVersion: FIXTURE_CLI_VERSION,
        skills: { axm: BUNDLED_ENTRY },
        files: officialAxmSkillPackage({
          packageRoot: OFFICIAL_AXM_SKILL_PACKAGE_ROOT,
          version: FIXTURE_CLI_VERSION,
          metadata: null,
          withSkillMd: false,
        }),
        realized: [],
      };
  }
};

export interface OfficialAxmSkillWorkspaceOptions {
  /** Settings merged over the state's own; `lint.rules` belongs here. */
  readonly settings?: Readonly<Record<string, unknown>>;
  /** Coding agents the workspace configures. Defaults to `claude-code`. */
  readonly agents?: ReadonlyArray<string>;
  /** Extra files written into the workspace root. */
  readonly files?: Readonly<Record<string, string>>;
}

/**
 * A throwaway workspace whose official AXM skill is arranged in the named
 * state, with the compatibility policy pinned to the CLI release that state
 * is about.
 */
export const makeOfficialAxmSkillWorkspace = (
  state: OfficialAxmSkillState,
  options: OfficialAxmSkillWorkspaceOptions = {},
): OfficialAxmSkillWorkspace => {
  const arrangement = arrangeOfficialSkill(state);
  const fixture = makeLintWorkspace({
    settings: {
      agents: options.agents ?? ["claude-code"],
      ...(arrangement.owner === undefined ? {} : { owner: arrangement.owner }),
      ...(arrangement.skills === undefined ? {} : { skills: arrangement.skills }),
      ...options.settings,
    },
    files: { ...arrangement.files, ...options.files },
    cliVersion: arrangement.cliVersion,
  });
  for (const [linkPath, targetPath] of arrangement.realized) {
    fixture.link(linkPath, targetPath);
  }
  return { ...fixture, cliVersion: arrangement.cliVersion };
};
