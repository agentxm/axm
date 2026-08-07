import * as Effect from "effect/Effect";
import * as Result from "effect/Result";
import { extensionTypeSentenceLabels, type ExtensionType } from "../../../extensions/common.js";
import type { WorkspaceReadModel } from "../../../workspace/read-model/service.js";
import type { WorkspaceRuleContext } from "../../context.js";
import type { AdvisoryFinding, AdvisoryRule } from "../../rule.js";
import { categorizeEntry } from "./helpers/source-categorize.js";

const RULE_ID = "workspace/configured-but-not-installed";
const SETTINGS_REL = ".axm/settings.json";

interface ActualWithOrigin {
  readonly origin: {
    readonly _tag: string;
  };
}

interface InstalledRow {
  readonly key: {
    readonly type: ExtensionType;
    readonly name: string;
  };
  readonly activation: "enabled" | "disabled";
  readonly actual: ReadonlyArray<ActualWithOrigin>;
  readonly installationOrigin:
    | {
        readonly _tag: "direct";
        readonly declared: {
          readonly entry: {
            readonly source: string;
          };
        };
      }
    | {
        readonly _tag: "pack-member";
        readonly pack: {
          readonly key: {
            readonly name: string;
          };
        };
      };
}

/**
 * Every read-model family whose rows this rule walks.
 *
 * Total over `ExtensionType`: the rule used to read five of the nine families
 * and silently said nothing about a configured-but-absent context package,
 * rule, hook, or knowledge bundle. Keyed off the type table, a new extension
 * type now fails compile here until its coverage is decided.
 */
const INSTALLED_ROWS_BY_TYPE = {
  skill: (workspace: WorkspaceReadModel) => workspace.skills.installed,
  "mcp-server": (workspace: WorkspaceReadModel) => workspace.mcpServers.installed,
  subagent: (workspace: WorkspaceReadModel) => workspace.subagents.installed,
  rule: (workspace: WorkspaceReadModel) => workspace.rules.installed,
  hook: (workspace: WorkspaceReadModel) => workspace.hooks.installed,
  knowledge: (workspace: WorkspaceReadModel) => workspace.knowledge.installed,
  pack: (workspace: WorkspaceReadModel) => workspace.packs.installed,
} satisfies Record<
  ExtensionType,
  (workspace: WorkspaceReadModel) => Effect.Effect<ReadonlyArray<InstalledRow>, unknown>
>;

/**
 * Read order. Findings render in this order, so it is declared rather than
 * derived from object key order.
 */
const READ_ORDER: ReadonlyArray<ExtensionType> = [
  "skill",
  "mcp-server",
  "subagent",
  "rule",
  "hook",
  "knowledge",
  "pack",
];

const extensionLabel = (type: ExtensionType): string => extensionTypeSentenceLabels[type];

const hasCanonicalContent = (actual: ReadonlyArray<ActualWithOrigin>): boolean =>
  actual.some(
    (entry) =>
      entry.origin._tag.startsWith("canonical-axm-") ||
      entry.origin._tag.startsWith("external-axm-"),
  );

const remediationCommand = (row: InstalledRow): string => {
  if (row.installationOrigin._tag === "pack-member") {
    return `axm packs install ${row.installationOrigin.pack.key.name}`;
  }
  return `axm install ${row.key.name}`;
};

const findingFor = (row: InstalledRow): AdvisoryFinding => ({
  kind: "advisory",
  ruleId: RULE_ID,
  severity: "error",
  message:
    row.installationOrigin._tag === "direct" &&
    categorizeEntry(row.key.name, row.installationOrigin.declared.entry.source).kind === "workspace"
      ? `${extensionLabel(row.key.type)} '${row.key.name}' declares a workspace source, but its authoritative package is missing from .axm/extensions. Restore the package or remove the workspace source declaration.`
      : `${extensionLabel(row.key.type)} '${row.key.name}' is configured but its installed content is missing from .axm/extensions. ` +
        `Run \`${remediationCommand(row)}\` to install it before syncing.`,
  location: { file: SETTINGS_REL },
});

const hasLintableInstallSource = (row: InstalledRow): boolean => {
  if (row.installationOrigin._tag === "pack-member") return true;
  const categorized = categorizeEntry(row.key.name, row.installationOrigin.declared.entry.source);
  return (
    categorized.kind === "registry" ||
    categorized.kind === "workspace" ||
    categorized.kind === "non-registry"
  );
};

const checkRows = (rows: ReadonlyArray<InstalledRow>): ReadonlyArray<AdvisoryFinding> =>
  rows.flatMap((row) => {
    if (row.activation === "disabled") return [];
    if (row.installationOrigin._tag !== "direct" && row.installationOrigin._tag !== "pack-member") {
      return [];
    }
    if (!hasLintableInstallSource(row)) return [];
    if (hasCanonicalContent(row.actual)) return [];
    return [findingFor(row)];
  });

const readRows = (
  effect: Effect.Effect<ReadonlyArray<InstalledRow>, unknown>,
): Effect.Effect<ReadonlyArray<InstalledRow>> =>
  Effect.gen(function* () {
    const result = yield* Effect.result(effect);
    if (Result.isFailure(result)) return [];
    return result.success;
  });

export const configuredButNotInstalledRule: AdvisoryRule<WorkspaceRuleContext> = {
  id: RULE_ID,
  description: "Configured extensions have installed content under .axm/extensions.",
  kind: "advisory",
  severity: "error",
  check: (context) =>
    Effect.map(
      Effect.forEach(
        READ_ORDER,
        (type) => readRows(INSTALLED_ROWS_BY_TYPE[type](context.workspace)),
        { concurrency: "unbounded" },
      ),
      (families) => families.flatMap(checkRows),
    ),
};
