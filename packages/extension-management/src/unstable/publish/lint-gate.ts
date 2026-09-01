import * as Effect from "effect/Effect";
import type * as FileSystem from "effect/FileSystem";
import type * as Path from "effect/Path";
import { makeAppError, type AppError } from "../app-error/index.js";
import { makePlatformPackFileAccessor } from "@agentxm/extension-workspace";
import { makePlatformSkillFileAccessor } from "@agentxm/extension-workspace";
import { platformCanonicalLintConfig } from "@agentxm/registry-protocol/unstable/lint/config";
import { composePath } from "@agentxm/registry-protocol/unstable/lint/compose-path";
import type {
  HookRuleContext,
  KnowledgeRuleContext,
  McpServerRuleContext,
  PackRuleContext,
  SkillRuleContext,
  SubagentRuleContext,
  RuleRuleContext,
} from "@agentxm/registry-protocol/unstable/lint/context";
import { evaluateContexts } from "@agentxm/registry-protocol/unstable/lint/evaluate";
import {
  hookRules,
  knowledgeRules,
  mcpServerRules,
  packRules,
  skillRules,
  ruleRules,
  subagentRules,
} from "@agentxm/registry-protocol/unstable/lint/publish";
import type { LintFinding } from "@agentxm/registry-protocol/unstable/lint/rule";

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
      readonly type: "rule";
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

const manifestName = (manifestJson: unknown): string | undefined => {
  if (manifestJson === null || typeof manifestJson !== "object" || Array.isArray(manifestJson)) {
    return undefined;
  }
  const descriptor = Object.getOwnPropertyDescriptor(manifestJson, "name");
  return typeof descriptor?.value === "string" ? descriptor.value : undefined;
};

export const runPublishLintGate = (args: PublishLintArgs): Effect.Effect<void, AppError> => {
  switch (args.type) {
    case "skill":
      return evaluateSkill(args).pipe(Effect.flatMap(failOnErrorFindings(args.type)));
    case "pack":
      return evaluatePack(args).pipe(Effect.flatMap(failOnErrorFindings(args.type)));
    case "subagent":
      return evaluateSubagent(args).pipe(Effect.flatMap(failOnErrorFindings(args.type)));
    case "mcp-server":
      return evaluateMcpServer(args).pipe(Effect.flatMap(failOnErrorFindings(args.type)));
    case "hook":
      return evaluateHook(args).pipe(Effect.flatMap(failOnErrorFindings(args.type)));
    case "knowledge":
      return evaluateKnowledge(args).pipe(Effect.flatMap(failOnErrorFindings(args.type)));
    case "rule":
      return evaluateRule(args).pipe(Effect.flatMap(failOnErrorFindings(args.type)));
  }
};

const evaluateSkill = (args: Extract<PublishLintArgs, { readonly type: "skill" }>) => {
  const packageFiles = makePlatformSkillFileAccessor(args.platform, args.extensionDir);
  const files = makePlatformSkillFileAccessor(
    args.platform,
    args.platform.path.join(args.extensionDir, "src"),
  );
  const expectedName = manifestName(args.manifestJson);
  const context: SkillRuleContext = {
    subject: {
      isNative: true,
      skillJson: args.manifestJson,
      ...(expectedName === undefined ? {} : { expectedName }),
    },
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

const evaluateRule = (args: Extract<PublishLintArgs, { readonly type: "rule" }>) => {
  const files = makePlatformPackFileAccessor(args.platform, args.extensionDir);
  const context: RuleRuleContext = {
    subject: { ruleJson: args.manifestJson },
    files,
    displayRoot: "",
  };
  return evaluateContexts(ruleRules, [context], platformCanonicalLintConfig).pipe(
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
    `Publish lint failed for ${noun} manifest with ${findings.length} error${findings.length === 1 ? "" : "s"}.`,
    ...lines,
  ].join("\n");
};
