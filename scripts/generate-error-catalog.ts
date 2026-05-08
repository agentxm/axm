/**
 * Generate the AXM error-code catalog.
 *
 * Usage:
 *   pnpm nx run core:gen-error-catalog
 */

// @effect-diagnostics nodeBuiltinImport:off globalConsole:off — Bun codegen script.
import * as fs from "node:fs";
import * as path from "node:path";
import * as childProcess from "node:child_process";
import * as ts from "typescript";

const WORKSPACE_ROOT = path.join(import.meta.dirname, "..");
const SOURCE_ROOT = path.join(WORKSPACE_ROOT, "packages");
const DOC_PATH = path.join(WORKSPACE_ROOT, "docs/error-codes.md");
const OUTPUT_DIR = path.join(WORKSPACE_ROOT, "packages/core/src/unstable/app-error/__generated__");
const OUTPUT_PATH = path.join(OUTPUT_DIR, "catalog.ts");

interface BreadcrumbEntry {
  readonly task: string;
  readonly description: string;
  readonly command?: ReadonlyArray<string>;
  readonly cmd?: string;
}

interface CatalogEntry {
  readonly code: string;
  readonly category: string;
  readonly message: string;
  readonly reason?: string;
  readonly breadcrumbs?: ReadonlyArray<BreadcrumbEntry>;
  readonly sources: ReadonlyArray<string>;
}

interface MutableCatalogEntry {
  readonly code: string;
  readonly category: string;
  readonly message: string;
  readonly reason?: string;
  readonly breadcrumbs: Array<BreadcrumbEntry>;
  readonly sources: Array<string>;
}

interface RecordDefaults {
  readonly code?: string;
  readonly category?: string;
  readonly message?: string;
  readonly reason?: string;
  readonly ignoreReason?: boolean;
  readonly breadcrumbs?: ReadonlyArray<BreadcrumbEntry>;
}

const KnownAreaPrefixes = new Set([
  "AGENTS",
  "AUTH",
  "CLI",
  "CMD",
  "COMMAND",
  "CONFIGURED",
  "DISCOVER",
  "EXTENSION",
  "FRONTMATTER",
  "GIT",
  "INSTALL",
  "INTERNAL",
  "INVALID",
  "LINT",
  "LOCKFILE",
  "MCP",
  "NO",
  "OUTDATED",
  "PACK",
  "PLAN",
  "PROMPT",
  "PRUNE",
  "PUBLISH",
  "REGISTRY",
  "SETTINGS",
  "SKILL",
  "SKILLS",
  "SOURCE",
  "SPIKE",
  "SUBAGENT",
  "SUBAGENTS",
  "SYMLINK",
  "TELEMETRY",
  "UNINSTALL",
  "UPDATE",
  "UPGRADE",
  "UTILS",
  "VERSION",
  "VIEW",
  "WORKSPACE",
]);

const readFiles = (dir: string): ReadonlyArray<string> => {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files: Array<string> = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "dist" || entry.name === "node_modules") continue;
      files.push(...readFiles(fullPath));
    } else if (entry.isFile() && fullPath.endsWith(".ts")) {
      files.push(fullPath);
    }
  }
  return files;
};

const isCatalogSource = (filePath: string): boolean =>
  !filePath.endsWith(".test.ts") &&
  !filePath.endsWith(".type-test.ts") &&
  !filePath.endsWith("test-helpers.ts");

const isTargetExpression = (expression: ts.Expression): boolean => {
  if (ts.isIdentifier(expression)) return expression.text === "makeAppError";
  if (ts.isPropertyAccessExpression(expression)) return expression.name.text === "makeAppError";
  return false;
};

const isAppErrorNewExpression = (node: ts.NewExpression): boolean => {
  const expression = node.expression;
  if (ts.isIdentifier(expression)) return expression.text === "AppError";
  if (ts.isPropertyAccessExpression(expression)) return expression.name.text === "AppError";
  return false;
};

const propertyNameText = (name: ts.PropertyName): string | undefined => {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name))
    return name.text;
  return undefined;
};

const findProperty = (
  objectLiteral: ts.ObjectLiteralExpression,
  name: string,
): ts.PropertyAssignment | undefined => {
  for (const property of objectLiteral.properties) {
    if (!ts.isPropertyAssignment(property)) continue;
    if (propertyNameText(property.name) === name) return property;
  }
  return undefined;
};

const stringLiteralValue = (expression: ts.Expression): string | undefined => {
  if (ts.isStringLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression)) {
    return expression.text;
  }
  return undefined;
};

const stringArrayValue = (expression: ts.Expression): ReadonlyArray<string> | undefined => {
  if (!ts.isArrayLiteralExpression(expression)) return undefined;
  const values: Array<string> = [];
  for (const element of expression.elements) {
    const value = stringLiteralValue(element);
    if (value === undefined) return undefined;
    values.push(value);
  }
  return values;
};

const breadcrumbValue = (expression: ts.Expression): ReadonlyArray<BreadcrumbEntry> | undefined => {
  if (!ts.isArrayLiteralExpression(expression)) return undefined;
  const breadcrumbs: Array<BreadcrumbEntry> = [];
  for (const element of expression.elements) {
    if (!ts.isObjectLiteralExpression(element)) return undefined;
    const taskProp = findProperty(element, "task");
    const descriptionProp = findProperty(element, "description");
    if (taskProp === undefined || descriptionProp === undefined) return undefined;
    const task = stringLiteralValue(taskProp.initializer);
    const description = stringLiteralValue(descriptionProp.initializer);
    if (task === undefined || description === undefined) return undefined;
    const commandProp = findProperty(element, "command");
    const cmdProp = findProperty(element, "cmd");
    const command =
      commandProp === undefined ? undefined : stringArrayValue(commandProp.initializer);
    const cmd = cmdProp === undefined ? undefined : stringLiteralValue(cmdProp.initializer);
    breadcrumbs.push({
      task,
      description,
      ...(command !== undefined ? { command } : {}),
      ...(cmd !== undefined ? { cmd } : {}),
    });
  }
  return breadcrumbs;
};

const relativeSource = (filePath: string, line: number): string =>
  `${path.relative(WORKSPACE_ROOT, filePath)}:${line}`;

const collectFromFile = (filePath: string, catalog: Map<string, MutableCatalogEntry>): void => {
  if (filePath === OUTPUT_PATH) return;
  const source = fs.readFileSync(filePath, "utf8");
  if (!source.includes("makeAppError") && !source.includes("new AppError")) return;
  if (!isCatalogSource(filePath)) return;

  const sourceFile = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true);

  const recordLiteral = (
    sourceNode: ts.Node,
    entry: Omit<MutableCatalogEntry, "sources">,
  ): void => {
    const pos = sourceFile.getLineAndCharacterOfPosition(sourceNode.getStart(sourceFile));
    const sourceRef = relativeSource(filePath, pos.line + 1);
    const existing = catalog.get(entry.code);

    if (existing === undefined) {
      catalog.set(entry.code, {
        ...entry,
        breadcrumbs: [...entry.breadcrumbs],
        sources: [sourceRef],
      });
      return;
    }

    existing.sources.push(sourceRef);
    if (existing.breadcrumbs.length === 0 && entry.breadcrumbs.length > 0) {
      existing.breadcrumbs.push(...entry.breadcrumbs);
    }
  };

  const record = (
    objectLiteral: ts.ObjectLiteralExpression,
    defaults: RecordDefaults = {},
  ): void => {
    const codeProp = findProperty(objectLiteral, "code");
    const categoryProp = findProperty(objectLiteral, "category");
    const messageProp = findProperty(objectLiteral, "message");
    const code = codeProp === undefined ? defaults.code : stringLiteralValue(codeProp.initializer);
    const category =
      categoryProp === undefined
        ? defaults.category
        : (stringLiteralValue(categoryProp.initializer) ?? defaults.category);
    const message =
      messageProp === undefined
        ? defaults.message
        : (stringLiteralValue(messageProp.initializer) ?? defaults.message);
    if (code === undefined || category === undefined || message === undefined) return;
    const reasonProp = findProperty(objectLiteral, "reason");
    const reason =
      defaults.ignoreReason === true
        ? undefined
        : reasonProp === undefined
          ? defaults.reason
          : (stringLiteralValue(reasonProp.initializer) ?? defaults.reason);

    const breadcrumbsProp = findProperty(objectLiteral, "breadcrumbs");
    const breadcrumbs =
      breadcrumbsProp === undefined
        ? (defaults.breadcrumbs ?? [])
        : (breadcrumbValue(breadcrumbsProp.initializer) ?? defaults.breadcrumbs ?? []);
    recordLiteral(objectLiteral, {
      code,
      category,
      message,
      ...(reason !== undefined ? { reason } : {}),
      breadcrumbs: [...breadcrumbs],
    });
  };

  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && isTargetExpression(node.expression)) {
      const arg = node.arguments[0];
      if (arg !== undefined && ts.isObjectLiteralExpression(arg)) record(arg);
    } else if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
      const arg = node.arguments[0];
      if (node.expression.text === "errAuthRequired") {
        recordLiteral(node, {
          code: "AUTH_LOGIN_REQUIRED",
          category: "auth",
          message: "Authentication required",
          breadcrumbs: [
            {
              task: "Run `axm login`",
              description: "Run `axm login` to sign in, or set the AXM_TOKEN environment variable.",
            },
          ],
        });
      } else if (node.expression.text === "errPublishConflict") {
        recordLiteral(node, {
          code: "REGISTRY_PUBLISH_CONFLICT",
          category: "conflict",
          message: "Version already exists with different content.",
          breadcrumbs: [{ task: "Recover", description: "Bump the version in your manifest." }],
        });
      } else if (node.expression.text === "errInstallFailed") {
        if (arg !== undefined && ts.isObjectLiteralExpression(arg)) {
          record(arg, {
            category: "validation",
            breadcrumbs: [
              { task: "Recover", description: "Check the extension package and try again." },
            ],
          });
        }
      } else if (node.expression.text === "errRegistryPublishRejected") {
        if (arg !== undefined && ts.isObjectLiteralExpression(arg)) {
          record(arg, {
            code: "REGISTRY_PUBLISH_REJECTED",
            category: "validation",
            message: "Registry publish request was rejected",
            ignoreReason: true,
            breadcrumbs: [
              { task: "Recover", description: "Check the extension package and try again." },
            ],
          });
        }
      }
    } else if (ts.isNewExpression(node) && isAppErrorNewExpression(node)) {
      const arg = node.arguments?.[0];
      if (arg !== undefined && ts.isObjectLiteralExpression(arg)) record(arg);
    }
    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
};

const serializeCatalog = (entries: ReadonlyArray<CatalogEntry>): string => {
  const body = entries
    .map((entry) => `  ${JSON.stringify(entry.code)}: ${JSON.stringify(entry)},`)
    .join("\n");
  return `// Generated by scripts/generate-error-catalog.ts. Do not edit by hand.\n\nexport const ErrorCodeCatalog = {\n${body}\n} as const;\n\nexport type ErrorCodeCatalog = typeof ErrorCodeCatalog;\n`;
};

const defaultBreadcrumbsFor = (entry: CatalogEntry): ReadonlyArray<BreadcrumbEntry> =>
  entry.category === "internal" || (entry.breadcrumbs !== undefined && entry.breadcrumbs.length > 0)
    ? (entry.breadcrumbs ?? [])
    : [{ task: "Recover", description: "Review the message, adjust the input, and retry." }];

const renderBreadcrumbs = (breadcrumbs: ReadonlyArray<BreadcrumbEntry> | undefined): string => {
  if (breadcrumbs === undefined || breadcrumbs.length === 0) return "";
  return breadcrumbs
    .map((breadcrumb) => {
      const command =
        breadcrumb.command !== undefined
          ? ` (${breadcrumb.command.join(" ")})`
          : breadcrumb.cmd !== undefined
            ? ` (${breadcrumb.cmd})`
            : "";
      return `  - ${breadcrumb.task}: ${breadcrumb.description}${command}`;
    })
    .join("\n");
};

const serializeDocs = (entries: ReadonlyArray<CatalogEntry>): string => {
  const categories = Array.from(new Set(entries.map((entry) => entry.category))).sort();
  const lines = [
    "# AXM Error Codes",
    "",
    "Generated by `pnpm nx run core:gen-error-catalog`. Do not edit by hand.",
    "",
    "## Codes (contract)",
    "",
  ];

  for (const category of categories) {
    lines.push(`### ${category}`, "");
    for (const entry of entries.filter((candidate) => candidate.category === category)) {
      lines.push(`#### ${entry.code}`);
      lines.push("");
      lines.push(`- Message: ${entry.message}`);
      if (entry.reason !== undefined) lines.push(`- Reason: ${entry.reason}`);
      const breadcrumbs = renderBreadcrumbs(defaultBreadcrumbsFor(entry));
      if (breadcrumbs.length > 0) {
        lines.push("- Breadcrumbs:");
        lines.push(breadcrumbs);
      }
      lines.push("");
    }
  }

  lines.push("## Sources Index", "");
  for (const entry of entries) {
    lines.push(`- ${entry.code}: ${entry.sources.join(", ")}`);
  }
  lines.push("");

  return `${lines.join("\n").trimEnd()}\n`;
};

const validateCatalog = (entries: ReadonlyArray<CatalogEntry>): void => {
  const failures: Array<string> = [];
  for (const entry of entries) {
    const area = entry.code.split("_")[0] ?? "";
    if (!/^[A-Z][A-Z0-9]+(_[A-Z0-9]+)+$/.test(entry.code)) {
      failures.push(`${entry.code}: code must match AREA_REASON shape`);
    }
    if (!KnownAreaPrefixes.has(area)) {
      failures.push(`${entry.code}: unknown area prefix ${area}`);
    }
    if (entry.category !== "internal" && defaultBreadcrumbsFor(entry).length === 0) {
      failures.push(`${entry.code}: non-internal errors need breadcrumbs`);
    }
    if (entry.category !== "internal" && /^Failed to /.test(entry.message)) {
      failures.push(`${entry.code}: message should be user prose, not 'Failed to ...'`);
    }
  }
  if (failures.length > 0) {
    throw new Error(`Error catalog validation failed:\n${failures.join("\n")}`);
  }
};

const mutableCatalog = new Map<string, MutableCatalogEntry>();
for (const scope of fs.readdirSync(SOURCE_ROOT)) {
  const packageSrc = path.join(SOURCE_ROOT, scope, "src");
  if (!fs.existsSync(packageSrc)) continue;
  for (const file of readFiles(packageSrc)) {
    collectFromFile(file, mutableCatalog);
  }
}

const entries = Array.from(mutableCatalog.values())
  .map(
    (entry): CatalogEntry => ({
      code: entry.code,
      category: entry.category,
      message: entry.message,
      ...(entry.reason !== undefined ? { reason: entry.reason } : {}),
      ...(defaultBreadcrumbsFor(entry).length > 0
        ? { breadcrumbs: defaultBreadcrumbsFor(entry) }
        : {}),
      sources: entry.sources.sort(),
    }),
  )
  .sort((a, b) => a.code.localeCompare(b.code));

validateCatalog(entries);

fs.mkdirSync(OUTPUT_DIR, { recursive: true });
fs.writeFileSync(OUTPUT_PATH, serializeCatalog(entries));
fs.writeFileSync(DOC_PATH, serializeDocs(entries));

const formatResult = childProcess.spawnSync("npx", ["prettier", "--write", OUTPUT_PATH, DOC_PATH], {
  cwd: WORKSPACE_ROOT,
  encoding: "utf8",
});
if (formatResult.status !== 0) {
  console.error(formatResult.stderr || formatResult.stdout);
  process.exit(1);
}

console.log(`Generated ${path.relative(WORKSPACE_ROOT, OUTPUT_PATH)}`);
console.log(`Generated ${path.relative(WORKSPACE_ROOT, DOC_PATH)}`);
