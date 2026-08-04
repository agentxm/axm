import { registerLintRuleIds } from "../config.js";
import type { CommandRuleContext } from "../context.js";
import type { LintRule } from "../rule.js";
import { commandEnvelopeRules } from "./command/envelope.js";
import { orderedEnvelopeRules } from "./shared/envelope-rules.js";

export const commandRules: ReadonlyArray<LintRule<CommandRuleContext>> =
  orderedEnvelopeRules(commandEnvelopeRules);

registerLintRuleIds(commandRules.map((r) => r.id));
