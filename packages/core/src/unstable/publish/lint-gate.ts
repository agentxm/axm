import * as Effect from "effect/Effect";
import type * as FileSystem from "effect/FileSystem";
import type * as Path from "effect/Path";
import { makeAppError, type AppError } from "../app-error/index.js";
import { count } from "../cli-renderer/index.js";
import { makePlatformFilesAccessor } from "../lint/catalog/files-accessor/platform.js";
import { makePlatformPackFileAccessor } from "../lint/catalog/pack-accessor/platform.js";
import { makePlatformSkillFileAccessor } from "../lint/catalog/skill-accessor/platform.js";
import { platformCanonicalLintConfig } from "../lint/config.js";
import { composePath } from "../lint/compose-path.js";
import type {
  CommandRuleContext,
  FilesRuleContext,
  HookRuleContext,
  KnowledgeRuleContext,
  McpServerRuleContext,
  PackRuleContext,
  SkillRuleContext,
  SubagentRuleContext,
} from "../lint/context.js";
import { evaluateContexts } from "../lint/evaluate.js";
import {
  commandRules,
  filesRules,
  hookRules,
  knowledgeRules,
  mcpServerRules,
  packRules,
  skillRules,
  subagentRules,
} from "../lint/publish.js";
import type { LintFinding } from "../lint/rule.js";

interface PublishLintPlatform {
  readonly fs: FileSystem.FileSystem;
  readonly path: Path.Path;
}

export type PublishLintArgs =
  | {
      readonly type: "skill";
      readonly extensionDir: string;
      readonly manifestJson: unknown;
      readonly platform: PublishLintPlatform;
    }
  | {
      readonly type: "pack";
      readonly extensionDir: string;
      readonly manifestJson: unknown;
      readonly platform: PublishLintPlatform;
    }
  | {
      readonly type: "command";
      readonly extensionDir: string;
      readonly manifestJson: unknown;
      readonly platform: PublishLintPlatform;
    }
  | {
      readonly type: "subagent";
      readonly extensionDir: string;
      readonly manifestJson: unknown;
      readonly platform: PublishLintPlatform;
    }
  | {
      readonly type: "mcp-server";
      readonly extensionDir: string;
      readonly manifestJson: unknown;
      readonly platform: PublishLintPlatform;
    }
  | {
      readonly type: "hook";
      readonly extensionDir: string;
      readonly manifestJson: unknown;
      readonly platform: PublishLintPlatform;
    }
  | {
      readonly type: "files";
      readonly extensionDir: string;
      readonly manifestJson: unknown;
      readonly platform: PublishLintPlatform;
    }
  | {
      readonly type: "knowledge";
      readonly extensionDir: string;
      readonly manifestJson: unknown;
      readonly platform: PublishLintPlatform;
    };

interface PublishLintFinding {
  readonly path: string;
  readonly finding: LintFinding;
}

export const runPublishLintGate = (args: PublishLintArgs): Effect.Effect<void, AppError> => {
  switch (args.type) {
    case "skill":
      return evaluateSkill(args).pipe(Effect.flatMap(failOnErrorFindings(args.type)));
    case "pack":
      return evaluatePack(args).pipe(Effect.flatMap(failOnErrorFindings(args.type)));
    case "command":
      return evaluateCommand(args).pipe(Effect.flatMap(failOnErrorFindings(args.type)));
    case "subagent":
      return evaluateSubagent(args).pipe(Effect.flatMap(failOnErrorFindings(args.type)));
    case "mcp-server":
      return evaluateMcpServer(args).pipe(Effect.flatMap(failOnErrorFindings(args.type)));
    case "hook":
      return evaluateHook(args).pipe(Effect.flatMap(failOnErrorFindings(args.type)));
    case "files":
      return evaluateFiles(args).pipe(Effect.flatMap(failOnErrorFindings(args.type)));
    case "knowledge":
      return evaluateKnowledge(args).pipe(Effect.flatMap(failOnErrorFindings(args.type)));
  }
};

const evaluateSkill = (args: Extract<PublishLintArgs, { readonly type: "skill" }>) => {
  const packageFiles = makePlatformSkillFileAccessor(args.platform, args.extensionDir);
  const files = makePlatformSkillFileAccessor(
    args.platform,
    args.platform.path.join(args.extensionDir, "src"),
  );
  const context: SkillRuleContext = {
    subject: { isNative: true, skillJson: args.manifestJson },
    files,
    packageFiles,
    displayRoot: "",
  };
  return evaluateContexts(skillRules, [context], platformCanonicalLintConfig).pipe(
    Effect.map((evaluated) => collectErrors(evaluated, (ctx) => ctx.displayRoot)),
  );
};

const evaluatePack = (args: Extract<PublishLintArgs, { readonly type: "pack" }>) => {
  const files = makePlatformPackFileAccessor(args.platform, args.extensionDir);
  const context: PackRuleContext = {
    subject: { packJson: args.manifestJson },
    files,
    displayRoot: "",
  };
  return evaluateContexts(packRules, [context], platformCanonicalLintConfig).pipe(
    Effect.map((evaluated) => collectErrors(evaluated, (ctx) => ctx.displayRoot)),
  );
};

const evaluateCommand = (args: Extract<PublishLintArgs, { readonly type: "command" }>) => {
  const files = makePlatformPackFileAccessor(args.platform, args.extensionDir);
  const context: CommandRuleContext = {
    subject: { commandJson: args.manifestJson },
    files,
    displayRoot: "",
  };
  return evaluateContexts(commandRules, [context], platformCanonicalLintConfig).pipe(
    Effect.map((evaluated) => collectErrors(evaluated, (ctx) => ctx.displayRoot)),
  );
};

const evaluateSubagent = (args: Extract<PublishLintArgs, { readonly type: "subagent" }>) => {
  const files = makePlatformPackFileAccessor(args.platform, args.extensionDir);
  const context: SubagentRuleContext = {
    subject: { subagentJson: args.manifestJson },
    files,
    displayRoot: "",
  };
  return evaluateContexts(subagentRules, [context], platformCanonicalLintConfig).pipe(
    Effect.map((evaluated) => collectErrors(evaluated, (ctx) => ctx.displayRoot)),
  );
};

const evaluateMcpServer = (args: Extract<PublishLintArgs, { readonly type: "mcp-server" }>) => {
  const files = makePlatformPackFileAccessor(args.platform, args.extensionDir);
  const context: McpServerRuleContext = {
    subject: { mcpServerJson: args.manifestJson },
    files,
    displayRoot: "",
  };
  return evaluateContexts(mcpServerRules, [context], platformCanonicalLintConfig).pipe(
    Effect.map((evaluated) => collectErrors(evaluated, (ctx) => ctx.displayRoot)),
  );
};

const evaluateHook = (args: Extract<PublishLintArgs, { readonly type: "hook" }>) => {
  const files = makePlatformPackFileAccessor(args.platform, args.extensionDir);
  const context: HookRuleContext = {
    subject: { hookJson: args.manifestJson },
    files,
    displayRoot: "",
  };
  return evaluateContexts(hookRules, [context], platformCanonicalLintConfig).pipe(
    Effect.map((evaluated) => collectErrors(evaluated, (ctx) => ctx.displayRoot)),
  );
};

const evaluateFiles = (args: Extract<PublishLintArgs, { readonly type: "files" }>) => {
  const files = makePlatformFilesAccessor(args.platform, args.extensionDir);
  const context: FilesRuleContext = {
    subject: { filesJson: args.manifestJson },
    files,
    displayRoot: "",
  };
  return evaluateContexts(filesRules, [context], platformCanonicalLintConfig).pipe(
    Effect.map((evaluated) => collectErrors(evaluated, (ctx) => ctx.displayRoot)),
  );
};

const evaluateKnowledge = (args: Extract<PublishLintArgs, { readonly type: "knowledge" }>) => {
  const files = makePlatformPackFileAccessor(args.platform, args.extensionDir);
  const context: KnowledgeRuleContext = {
    subject: { knowledgeJson: args.manifestJson },
    files,
    displayRoot: "",
  };
  return evaluateContexts(knowledgeRules, [context], platformCanonicalLintConfig).pipe(
    Effect.map((evaluated) => collectErrors(evaluated, (ctx) => ctx.displayRoot)),
  );
};

const collectErrors = <C>(
  evaluated: ReadonlyArray<{ readonly context: C; readonly findings: ReadonlyArray<LintFinding> }>,
  displayRoot: (context: C) => string,
): ReadonlyArray<PublishLintFinding> => {
  const out: Array<PublishLintFinding> = [];
  for (const entry of evaluated) {
    for (const finding of entry.findings) {
      if (finding.severity !== "error") {
        continue;
      }
      out.push({
        path: composePath(displayRoot(entry.context), finding.location),
        finding,
      });
    }
  }
  return out;
};

const failOnErrorFindings =
  (type: PublishLintArgs["type"]) =>
  (findings: ReadonlyArray<PublishLintFinding>): Effect.Effect<void, AppError> => {
    if (findings.length === 0) {
      return Effect.void;
    }
    return Effect.fail(
      makeAppError({
        code: "validation",
        detail: renderPublishLintFailure(type, findings),
      }),
    );
  };

const renderPublishLintFailure = (
  type: PublishLintArgs["type"],
  findings: ReadonlyArray<PublishLintFinding>,
): string => {
  const noun = type === "mcp-server" ? "MCP server" : type;
  const lines = findings.map(
    ({ path, finding }) => `- ${path} [${finding.ruleId}]: ${finding.message}`,
  );
  return [
    `Publish lint failed for ${noun} manifest with ${count(findings.length, "error")}.`,
    ...lines,
  ].join("\n");
};
