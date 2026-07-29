import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const sourceRoots = ["packages/cli/src", "packages/core/src/unstable"] as const;

const bannedOutputSubstrings = [
  "\\u2717",
  "Done",
  "Done with errors",
  "Next step",
  "Next steps",
  "Nothing to show",
  "Nothing to add",
  "Nothing to do",
  "Nothing to install",
  "Nothing to materialize",
  "Nothing to prune",
  "Nothing to publish",
  "Nothing to remove",
  "Nothing to uninstall",
  "Nothing to update",
  "agent(s)",
  "command(s)",
  "extension(s)",
  "file(s)",
  "hook(s)",
  "ID(s)",
  "id(s)",
  "item(s)",
  "pack(s)",
  "package(s)",
  "rule(s)",
  "server(s)",
  "skill(s)",
  "subagent(s)",
  "✗",
] as const;

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

const collectSourceFiles = (root: string): ReadonlyArray<string> => {
  const entries = fs.readdirSync(root, { withFileTypes: true });
  const files: Array<string> = [];

  for (const entry of entries) {
    const fullPath = path.join(root, entry.name);

    if (entry.isDirectory()) {
      if (entry.name !== "__generated__") {
        files.push(...collectSourceFiles(fullPath));
      }
      continue;
    }

    if (entry.isFile() && entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")) {
      files.push(fullPath);
    }
  }

  return files.sort();
};

const sourceLiteralPattern = /(["'`])(?:\\.|(?!\1).)*?\1/g;
const templateExpressionPattern = /\$\{(?:\\.|[^}])*}/g;

interface Finding {
  readonly file: string;
  readonly line: number;
  readonly phrase: string;
  readonly literal: string;
}

interface ActionFinding {
  readonly file: string;
  readonly line: number;
  readonly literal: string;
}

interface DirectRendererResultFinding {
  readonly file: string;
  readonly line: number;
  readonly reason: string;
}

const readOnlyRendererResultFiles = new Set([
  "packages/cli/src/root/agents/list.ts",
  "packages/cli/src/root/auth/whoami.ts",
  "packages/cli/src/root/discover/handler.ts",
  "packages/cli/src/root/help/command.ts",
  "packages/cli/src/root/outdated/handler.ts",
  "packages/cli/src/root/view/handler.ts",
]);

const rendererResultCallPattern = /\brenderer\.result\(/g;
const resultCallSnippetLength = 2_400;

const planResultCallPattern =
  /\b(?:PlanResolutionDocumentFields|PlanResolutionResultSchema|PublishResultSchema|SetupDocumentFields|UpgradeDocumentFields|LoginDocumentFields|LoginNoOpDocumentFields|LogoutDocumentFields|CreatedTokenDocumentFields|RevokeTokenDocumentFields|LintFixJsonDocumentFields)\b/;

const readQueryResultCallPattern =
  /\b(?:AgentCapabilitiesOutputSchema|AgentsListOutputSchema|CachePruneOutputSchema|CacheStatusOutputSchema|CacheVerifyOutputSchema|DiscoverOutputSchema|ExtensionInventorySchema|GrantListOutputSchema|HelpTopicResultSchema|HelpTopicsResultSchema|HookPortabilityResultSchema|InstructionsStatusOutputSchema|KnowledgeListQueryResultSchema|KnowledgeSearchQueryResultSchema|KnowledgeOpenQueryResultSchema|KnowledgeLintQueryResultSchema|LintJsonDocumentFields|ExtensionShowResultSchema|OutdatedDocumentFields|TokenDocumentFields|TokenListDocumentFields|ViewDocumentFields|WhoamiDocumentFields|Schema\.Array\(Schema\.String\)|Schema\.String)\b/;

const visibleLiteralText = (literal: string): string =>
  literal.startsWith("`") ? literal.replace(templateExpressionPattern, "") : literal;

const propertyActionProsePattern = /\b(?:description|recover):\s*(["'`])(?:\\.|(?!\1)[\s\S])*?\1/g;
const builderDoProsePattern = /\bBC\.do\(\s*(["'`])(?:\\.|(?!\1)[\s\S])*?\1/g;
const builderRunProsePattern =
  /\bBC\.run\(\s*(["'`])(?:\\.|(?!\1)[\s\S])*?\1\s*,\s*(["'`])(?:\\.|(?!\2)[\s\S])*?\2/g;

const literalFromPropertyMatch = (match: RegExpMatchArray): string | undefined => {
  const [fullMatch] = match;
  return fullMatch.slice(fullMatch.indexOf(match[1] ?? ""));
};

const literalFromBuilderDoMatch = (match: RegExpMatchArray): string | undefined => {
  const [fullMatch] = match;
  return fullMatch.slice(fullMatch.indexOf(match[1] ?? ""));
};

const literalFromBuilderRunMatch = (match: RegExpMatchArray): string | undefined => {
  const [fullMatch] = match;
  const secondQuote = match[2];
  if (secondQuote === undefined) return undefined;
  const commaIndex = fullMatch.indexOf(",");
  if (commaIndex === -1) return undefined;
  return fullMatch.slice(fullMatch.indexOf(secondQuote, commaIndex));
};

const isSuggestedActionDescriptionContext = (
  lines: ReadonlyArray<string>,
  index: number,
): boolean => {
  const start = Math.max(0, index - 4);
  const end = Math.min(lines.length, index + 6);
  const context = lines.slice(start, end).join("\n");
  return /\bsuggestions\b/.test(context) || /\bsatisfies SuggestedAction\b/.test(context);
};

const lineIndexAtOffset = (source: string, offset: number): number =>
  source.slice(0, offset).split("\n").length - 1;

const collectActionProseFindings = (source: string, file: string): ReadonlyArray<ActionFinding> => {
  const findings: Array<ActionFinding> = [];
  const lines = source.split("\n");

  for (const match of source.matchAll(propertyActionProsePattern)) {
    const [fullMatch] = match;
    const lineIndex = lineIndexAtOffset(source, match.index);
    const isDescription = fullMatch.startsWith("description");
    if (isDescription && !isSuggestedActionDescriptionContext(lines, lineIndex)) continue;

    const literal = literalFromPropertyMatch(match);
    if (literal !== undefined && visibleLiteralText(literal).match(/`?axm\s/) !== null) {
      findings.push({ file, line: lineIndex + 1, literal });
    }
  }

  for (const match of source.matchAll(builderDoProsePattern)) {
    const literal = literalFromBuilderDoMatch(match);
    if (literal !== undefined && visibleLiteralText(literal).match(/`?axm\s/) !== null) {
      findings.push({
        file,
        line: lineIndexAtOffset(source, match.index) + 1,
        literal,
      });
    }
  }

  for (const match of source.matchAll(builderRunProsePattern)) {
    const literal = literalFromBuilderRunMatch(match);
    if (literal !== undefined && visibleLiteralText(literal).match(/`?axm\s/) !== null) {
      findings.push({
        file,
        line: lineIndexAtOffset(source, match.index) + 1,
        literal,
      });
    }
  }

  return findings;
};

const outputUxFindings = (): ReadonlyArray<Finding> =>
  sourceRoots.flatMap((sourceRoot) =>
    collectSourceFiles(path.join(repoRoot, sourceRoot)).flatMap((file) => {
      const source = fs.readFileSync(file, "utf8");
      const findings: Array<Finding> = [];

      source.split("\n").forEach((line, index) => {
        for (const match of line.matchAll(sourceLiteralPattern)) {
          const literal = match[0] ?? "";
          const visibleText = visibleLiteralText(literal);
          for (const phrase of bannedOutputSubstrings) {
            if (visibleText.includes(phrase)) {
              findings.push({
                file: path.relative(repoRoot, file),
                line: index + 1,
                phrase,
                literal,
              });
            }
          }
        }
      });

      return findings;
    }),
  );

const proseActionFindings = (): ReadonlyArray<ActionFinding> =>
  sourceRoots.flatMap((sourceRoot) =>
    collectSourceFiles(path.join(repoRoot, sourceRoot)).flatMap((file) => {
      const source = fs.readFileSync(file, "utf8");
      return collectActionProseFindings(source, path.relative(repoRoot, file));
    }),
  );

const directRendererResultFindings = (): ReadonlyArray<DirectRendererResultFinding> =>
  sourceRoots.flatMap((sourceRoot) =>
    collectSourceFiles(path.join(repoRoot, sourceRoot)).flatMap((file) => {
      const source = fs.readFileSync(file, "utf8");
      const relativeFile = path.relative(repoRoot, file);

      if (readOnlyRendererResultFiles.has(relativeFile)) {
        return [];
      }

      return Array.from(source.matchAll(rendererResultCallPattern)).flatMap((match) => {
        const snippet = source.slice(match.index, match.index + resultCallSnippetLength);
        const line = lineIndexAtOffset(source, match.index) + 1;

        if (planResultCallPattern.test(snippet) || readQueryResultCallPattern.test(snippet)) {
          return [];
        }

        return [
          {
            file: relativeFile,
            line,
            reason: "direct renderer.result call is not tied to a known plan or read/query schema",
          },
        ];
      });
    }),
  );

describe("CLI output UX", () => {
  it("keeps generic completion and plural-shorthand phrases out of production strings", () => {
    expect(outputUxFindings()).toEqual([]);
  });

  it("keeps runnable axm commands out of suggested-action prose", () => {
    expect(proseActionFindings()).toEqual([]);
  });

  it("keeps bespoke mutation JSON results tied to the plan model", () => {
    expect(directRendererResultFindings()).toEqual([]);
  });
});
