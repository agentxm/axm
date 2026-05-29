/**
 * Generate AXM CLI reference site content from the real Effect CLI command tree.
 */

// @effect-diagnostics nodeBuiltinImport:off globalConsole:off — build-time docs generation script.
import * as fs from "node:fs";
import * as path from "node:path";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as ServiceMap from "effect/Context";
import { CliOutput, Command } from "effect/unstable/cli";
import type * as CliCommand from "effect/unstable/cli/Command";
import type { ArgDoc, FlagDoc, HelpDoc } from "effect/unstable/cli/HelpDoc";
import { format as formatWithPrettier, resolveConfig as resolvePrettierConfig } from "prettier";

import { rootCommand } from "../src/app.js";
import { loadVersion } from "../src/version.js";
import { baseLayer } from "../src/runtime.js";
import {
  CommandDocs,
  type CliDocCategory,
  type CommandRequirements,
  type CommandSideEffects,
} from "../src/root/docs-metadata.js";

const CLI_ROOT = path.join(import.meta.dirname, "..");
const CORE_ROOT = path.join(import.meta.dirname, "../../core");
const SITE_CONTENT_ROOT = path.join(CORE_ROOT, "site-content");
const CLI_REFERENCE_ROOT = path.join(SITE_CONTENT_ROOT, "cli-reference");
const CLI_REFERENCE_DOCS_ROOT = path.join(SITE_CONTENT_ROOT, "docs/cli-reference");
const DOCS_CONFIG_PATH = path.join(SITE_CONTENT_ROOT, "docs/config.json");
const GENERATED_AT = "1970-01-01T00:00:00.000Z";
const TEST_VERSION = loadVersion();

const CATEGORY_LABELS = {
  extensions: "Extensions",
  workspace: "Workspace",
  authentication: "Authentication",
  help: "Help",
} satisfies Record<CliDocCategory, string>;

const CATEGORY_ORDER = [
  "extensions",
  "workspace",
  "authentication",
  "help",
] as const satisfies ReadonlyArray<CliDocCategory>;

interface ParamReference {
  readonly name: string;
  readonly aliases: ReadonlyArray<string>;
  readonly type: string;
  readonly required: boolean;
  readonly variadic?: boolean;
  readonly description?: string | undefined;
  readonly valueName?: string | undefined;
  readonly group?: string | undefined;
}

interface ReferenceExample {
  readonly command: string;
  readonly description?: string | undefined;
  readonly kind: "basic" | "common" | "preview" | "json" | "advanced";
}

interface CommandSummary {
  readonly command: string;
  readonly slug: string;
  readonly summary: string;
}

interface CommandReferenceNode {
  readonly path: ReadonlyArray<string>;
  readonly command: string;
  readonly slug: string;
  readonly category: CliDocCategory;
  readonly group?: string | undefined;
  readonly description: string;
  readonly summary: string;
  readonly whenToUse?: string | undefined;
  readonly alias?: string | undefined;
  readonly usage: string;
  readonly args: ReadonlyArray<ParamReference>;
  readonly flags: ReadonlyArray<ParamReference>;
  readonly globalFlags: ReadonlyArray<ParamReference>;
  readonly examples: ReadonlyArray<ReferenceExample>;
  readonly requirements?: CommandRequirements | undefined;
  readonly sideEffects?: CommandSideEffects | undefined;
  readonly notes: ReadonlyArray<{ readonly kind: string; readonly text: string }>;
  readonly related: ReadonlyArray<{ readonly label: string; readonly href: string }>;
  readonly subcommands: ReadonlyArray<CommandSummary>;
  readonly children: ReadonlyArray<CommandReferenceNode>;
}

interface CliReferenceNavItem {
  readonly label: string;
  readonly to: string;
}

interface CliReferenceNavSection {
  readonly label: string;
  readonly children: ReadonlyArray<CliReferenceNavItem>;
}

interface CliReferenceDocument {
  readonly schemaVersion: 1;
  readonly cliVersion: string;
  readonly generatedAt: string;
  readonly root: CommandReferenceNode;
  readonly commands: ReadonlyArray<CommandReferenceNode>;
  readonly nav: ReadonlyArray<CliReferenceNavSection>;
}

const descriptionFromOption = (description: Option.Option<string>): string | undefined =>
  Option.getOrUndefined(description);

const formatCommandPath = (tokens: ReadonlyArray<string>): string => tokens.join(" ");

const commandSlug = (tokens: ReadonlyArray<string>): string => {
  const [, ...rest] = tokens;
  return rest.join("-");
};

const docSlug = (tokens: ReadonlyArray<string>): string => {
  const slug = commandSlug(tokens);
  return slug.length === 0 ? "cli-reference" : `cli-reference/${slug}`;
};

const flagGroup = (name: string): string => {
  if (["scope", "agent", "agents", "path"].includes(name)) return "Workspace";
  if (["registry", "source", "owner", "extension"].includes(name)) return "Registry";
  if (["json", "quiet", "verbose", "debug", "details"].includes(name)) return "Output";
  if (["yes", "force", "preview", "fix", "strict"].includes(name)) return "Safety";
  if (["device-code", "no-browser", "permission", "org-permission"].includes(name)) {
    return "Authentication";
  }
  if (["detected", "available"].includes(name)) return "Filtering";
  return "Selection";
};

const toParamReference = (param: FlagDoc | ArgDoc): ParamReference => {
  const aliases = "aliases" in param ? param.aliases : [];
  const variadic = "variadic" in param ? param.variadic : undefined;
  const group = "aliases" in param ? flagGroup(param.name) : undefined;
  const required = "aliases" in param ? false : param.required;

  return {
    name: param.name,
    aliases,
    type: param.type,
    required,
    ...(variadic === undefined ? {} : { variadic }),
    description: descriptionFromOption(param.description),
    ...(group === undefined ? {} : { group }),
  };
};

const exampleKind = (command: string): ReferenceExample["kind"] => {
  if (command.includes("--preview")) return "preview";
  if (command.includes("--json")) return "json";
  return "common";
};

const captureHelpDoc = (tokens: ReadonlyArray<string>): Effect.Effect<HelpDoc, unknown, never> =>
  Effect.gen(function* () {
    const docs: Array<HelpDoc> = [];
    const formatter: CliOutput.Formatter = {
      ...CliOutput.defaultFormatter({ colors: false }),
      formatHelpDoc: (doc) => {
        docs.push(doc);
        return "";
      },
    };
    const [, ...args] = tokens;

    yield* Command.runWith(rootCommand, { version: TEST_VERSION })([...args, "--help"]).pipe(
      Effect.provide(baseLayer),
      Effect.provideService(CliOutput.Formatter, formatter),
    );

    const doc = docs[0];
    if (doc === undefined) {
      return yield* Effect.die(new Error(`Expected help for ${formatCommandPath(tokens)}`));
    }

    return doc;
  });

const categoryFromGroup = (group: string | undefined, name: string): CliDocCategory => {
  if (name === "help") return "help";
  if (group === "AUTH") return "authentication";
  if (group === "EXTENSIONS") return "extensions";
  return "workspace";
};

const resolveCategory = (
  command: CliCommand.Command.Any,
  inheritedGroup: string | undefined,
): CliDocCategory => {
  const meta = ServiceMap.getReferenceUnsafe(command.annotations, CommandDocs);
  return meta.category ?? categoryFromGroup(inheritedGroup, command.name);
};

const sentenceSummary = (description: string): string => {
  const normalized = description.replace(/\s+/g, " ").trim();
  const match = normalized.match(/^.*?[.!?](?:\s|$)/u);
  return (match?.[0] ?? normalized).trim();
};

const buildNode = (
  command: CliCommand.Command.Any,
  tokens: ReadonlyArray<string>,
  group: string | undefined,
): Effect.Effect<CommandReferenceNode, unknown, never> =>
  Effect.gen(function* () {
    const helpDoc = yield* captureHelpDoc(tokens);
    const meta = ServiceMap.getReferenceUnsafe(command.annotations, CommandDocs);
    const category = resolveCategory(command, group);
    const children = yield* Effect.forEach(
      command.subcommands.flatMap((subcommandGroup) =>
        subcommandGroup.commands.map((child) => ({
          child,
          group: subcommandGroup.group ?? group,
        })),
      ),
      ({ child, group: childGroup }) => buildNode(child, [...tokens, child.name], childGroup),
      { concurrency: "unbounded" },
    );
    const description = command.description ?? helpDoc.description;
    const summary = meta.summary ?? sentenceSummary(description);
    const slug = docSlug(tokens);

    return {
      path: tokens,
      command: formatCommandPath(tokens),
      slug,
      category,
      group,
      description,
      summary,
      whenToUse: meta.whenToUse,
      alias: command.alias,
      usage: helpDoc.usage,
      args: (helpDoc.args ?? []).map(toParamReference),
      flags: helpDoc.flags.map(toParamReference),
      globalFlags: (helpDoc.globalFlags ?? []).map(toParamReference),
      examples: command.examples.map((example) => ({
        command: example.command,
        description: example.description,
        kind: exampleKind(example.command),
      })),
      requirements: meta.requirements,
      sideEffects: meta.sideEffects,
      notes: meta.notes ?? [],
      related: meta.related ?? [],
      subcommands: children.map((child) => ({
        command: child.command,
        slug: child.slug,
        summary: child.summary,
      })),
      children,
    };
  });

const flattenNodes = (node: CommandReferenceNode): ReadonlyArray<CommandReferenceNode> => [
  node,
  ...node.children.flatMap(flattenNodes),
];

const validateReference = (nodes: ReadonlyArray<CommandReferenceNode>): void => {
  const publicNodes = nodes.filter((node) => node.path.length > 1);
  const missing = publicNodes.flatMap((node) => {
    const problems: string[] = [];
    if (node.summary.length === 0) problems.push("summary");
    if (node.examples.length === 0) problems.push("examples");
    if (node.category.length === 0) problems.push("category");
    return problems.length === 0 ? [] : [`${node.command}: ${problems.join(", ")}`];
  });

  if (missing.length > 0) {
    throw new Error(`CLI reference metadata is incomplete:\n${missing.join("\n")}`);
  }
};

const topLevelPageNodes = (root: CommandReferenceNode): ReadonlyArray<CommandReferenceNode> =>
  root.children.filter((node) => node.path.length === 2);

const buildNav = (
  topLevelNodes: ReadonlyArray<CommandReferenceNode>,
): ReadonlyArray<CliReferenceNavSection> =>
  CATEGORY_ORDER.map((category) => {
    const children = topLevelNodes
      .filter((node) => node.category === category)
      .map((node) => ({
        label: node.command,
        to: node.slug,
      }));

    return {
      label: CATEGORY_LABELS[category],
      children:
        category === "help"
          ? [...children, { label: "Global flags", to: "cli-reference/global-flags" }]
          : children,
    };
  }).filter((entry) => entry.children.length > 0);

const escapeTableCell = (value: string): string => value.replace(/\|/g, "\\|").replace(/\n/g, " ");

const renderTable = (
  headers: ReadonlyArray<string>,
  rows: ReadonlyArray<ReadonlyArray<string>>,
): string => {
  if (rows.length === 0) return "None.\n";
  return [
    `| ${headers.map(escapeTableCell).join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${row.map(escapeTableCell).join(" | ")} |`),
    "",
  ].join("\n");
};

const renderParamsTable = (params: ReadonlyArray<ParamReference>): string =>
  renderTable(
    ["Name", "Type", "Required", "Description"],
    params.map((param) => [
      [
        param.aliases.length === 0 && param.group === undefined ? param.name : `--${param.name}`,
        ...param.aliases,
      ]
        .map((name) => `\`${name}\``)
        .join(", "),
      param.type,
      param.required ? "Yes" : "No",
      param.description ?? "",
    ]),
  );

const renderExamples = (examples: ReadonlyArray<ReferenceExample>): string =>
  examples
    .map((example) =>
      [
        example.description === undefined ? undefined : `**${example.description}**`,
        "```bash",
        example.command,
        "```",
      ]
        .filter((line) => line !== undefined)
        .join("\n"),
    )
    .join("\n\n");

const renderBooleanList = (
  values: CommandRequirements | CommandSideEffects | undefined,
): string => {
  if (values === undefined) return "None.\n";
  const enabled = Object.entries(values)
    .filter(([, value]) => value)
    .map(([key]) => `- ${key}`);
  return enabled.length === 0 ? "None.\n" : `${enabled.join("\n")}\n`;
};

const renderCommandPage = (node: CommandReferenceNode): string =>
  [
    "---",
    `title: ${node.command}`,
    `description: ${node.summary}`,
    "---",
    "",
    `# ${node.command}`,
    "",
    node.summary,
    "",
    "## When to use",
    "",
    node.whenToUse ?? node.summary,
    "",
    "## Usage",
    "",
    "```bash",
    node.usage,
    "```",
    "",
    "## Arguments",
    "",
    renderParamsTable(node.args),
    "## Flags",
    "",
    renderParamsTable(node.flags),
    node.globalFlags.length === 0
      ? ""
      : "Global flags are documented on [Global flags](./global-flags).",
    "",
    "## Examples",
    "",
    renderExamples(node.examples),
    "",
    "## Subcommands",
    "",
    renderTable(
      ["Command", "Summary"],
      node.subcommands.map((subcommand) => [
        `[${subcommand.command}](#${subcommand.command.replace(/\s+/g, "-").toLowerCase()})`,
        subcommand.summary,
      ]),
    ),
    ...node.children.flatMap((child) => [
      `### ${child.command}`,
      "",
      child.summary,
      "",
      "```bash",
      child.usage,
      "```",
      "",
    ]),
    "## Requirements",
    "",
    renderBooleanList(node.requirements),
    "## Side effects",
    "",
    renderBooleanList(node.sideEffects),
  ].join("\n");

const renderOverviewPage = (document: CliReferenceDocument): string =>
  [
    "---",
    "title: CLI Reference",
    "description: Generated AXM command reference.",
    "---",
    "",
    "# CLI Reference",
    "",
    `Generated from AXM CLI version ${document.cliVersion}.`,
    "",
    "AXM command syntax follows this shape:",
    "",
    "```bash",
    "axm <command> [arguments] [flags]",
    "```",
    "",
    "Use `--json` when a command supports machine-readable output, and use `--preview` on mutation commands when you want to inspect the plan before writing files or changing registry state.",
    "",
    "## Command Groups",
    "",
    ...document.nav.flatMap((section) => [
      `### ${section.label}`,
      "",
      ...section.children.map(
        (item) => `- [${item.label}](./${item.to.replace("cli-reference/", "")})`,
      ),
      "",
    ]),
  ].join("\n");

const renderGlobalFlagsPage = (root: CommandReferenceNode): string =>
  [
    "---",
    "title: Global flags",
    "description: Global flags accepted by AXM commands.",
    "---",
    "",
    "# Global flags",
    "",
    "These flags are accepted across the AXM command tree.",
    "",
    renderParamsTable(root.globalFlags),
  ].join("\n");

const writeFormatted = async (outputPath: string, content: string, parser: "json" | "markdown") => {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  const prettierConfig = (await resolvePrettierConfig(outputPath)) ?? {};
  const formatted = await formatWithPrettier(content, {
    ...prettierConfig,
    filepath: outputPath,
    parser,
  });
  fs.writeFileSync(outputPath, formatted);
  console.log(`Generated: ${path.relative(CLI_ROOT, outputPath)}`);
};

const main = async () => {
  const root = await Effect.runPromise(buildNode(rootCommand, ["axm"], undefined));
  const commands = flattenNodes(root).filter((node) => node.path.length > 1);
  validateReference([root, ...commands]);

  const topLevelNodes = topLevelPageNodes(root);
  const nav = buildNav(topLevelNodes);
  const document: CliReferenceDocument = {
    schemaVersion: 1,
    cliVersion: TEST_VERSION,
    generatedAt: GENERATED_AT,
    root,
    commands,
    nav,
  };

  fs.rmSync(CLI_REFERENCE_ROOT, { force: true, recursive: true });
  fs.rmSync(CLI_REFERENCE_DOCS_ROOT, { force: true, recursive: true });

  await writeFormatted(
    path.join(CLI_REFERENCE_ROOT, "reference.json"),
    JSON.stringify(document),
    "json",
  );
  await writeFormatted(
    path.join(CLI_REFERENCE_DOCS_ROOT, "index.md"),
    renderOverviewPage(document),
    "markdown",
  );
  await writeFormatted(
    path.join(CLI_REFERENCE_DOCS_ROOT, "global-flags.md"),
    renderGlobalFlagsPage(root),
    "markdown",
  );

  for (const node of topLevelNodes) {
    await writeFormatted(
      path.join(SITE_CONTENT_ROOT, "docs", `${node.slug}.md`),
      renderCommandPage(node),
      "markdown",
    );
  }

  await writeFormatted(
    DOCS_CONFIG_PATH,
    JSON.stringify({
      nav: [
        { label: "Quickstart", to: "quickstart" },
        { label: "Supported Coding Agents", to: "supported-coding-agents" },
        {
          label: "CLI Reference",
          children: [
            { label: "Overview", to: "cli-reference" },
            ...nav.map((section) => ({
              label: section.label,
              children: section.children,
            })),
          ],
        },
      ],
    }),
    "json",
  );

  console.log(`\nGenerated ${topLevelNodes.length + 3} CLI reference artifacts`);
};

await main();
