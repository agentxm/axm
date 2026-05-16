import * as Effect from "effect/Effect";
import * as Result from "effect/Result";
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
    readonly type: string;
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

const extensionLabel = (type: string): string => {
  switch (type) {
    case "mcp-server":
      return "MCP server";
    case "pack":
      return "pack";
    case "subagent":
      return "subagent";
    case "command":
      return "command";
    case "skill":
      return "skill";
    default:
      return "extension";
  }
};

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
    `${extensionLabel(row.key.type)} '${row.key.name}' is configured but its installed content is missing from .axm/extensions. ` +
    `Run \`${remediationCommand(row)}\` to install it before syncing.`,
  location: { file: SETTINGS_REL },
});

const hasLintableInstallSource = (row: InstalledRow): boolean => {
  if (row.installationOrigin._tag === "pack-member") return true;
  const categorized = categorizeEntry(row.key.name, row.installationOrigin.declared.entry.source);
  return categorized.kind === "registry" || categorized.kind === "non-registry";
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
    Effect.gen(function* () {
      const [skills, commands, mcpServers, subagents, packs] = yield* Effect.all(
        [
          readRows(context.workspace.skills.installed),
          readRows(context.workspace.commands.installed),
          readRows(context.workspace.mcpServers.installed),
          readRows(context.workspace.subagents.installed),
          readRows(context.workspace.packs.installed),
        ],
        { concurrency: "unbounded" },
      );

      return [
        ...checkRows(skills),
        ...checkRows(commands),
        ...checkRows(mcpServers),
        ...checkRows(subagents),
        ...checkRows(packs),
      ];
    }),
};
