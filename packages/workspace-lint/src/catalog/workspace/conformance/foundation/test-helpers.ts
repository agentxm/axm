import * as Effect from "effect/Effect";

import type { WorkspaceRuleContext } from "../../../../workspace-context.js";
import { agentsRecognizedRule } from "../../agents-recognized.js";
import { initializedRule } from "../../initialized.js";
import { lockfileValidRule } from "../../lockfile-valid.js";
import { mcpServerNoSecretLiteralRule } from "../../mcps-no-secret-literal.js";
import { mcpServerTransportExclusivityRule } from "../../mcps-transport-exclusivity.js";
import { packsDeclarationsValidRule } from "../../packs-declarations-valid.js";
import { settingsSchemaValidRule } from "../../settings-schema-valid.js";
import { skillsDeclarationsValidRule } from "../../skills-declarations-valid.js";
import {
  contextFor,
  validLockfile,
  validSettings,
  type WorkspaceRuleConformanceCase,
} from "../test-helpers.js";

export const initializedConformance: WorkspaceRuleConformanceCase = {
  rule: initializedRule,
  satisfied: () => contextFor({ settings: validSettings(), lockfile: validLockfile }),
  violated: () => contextFor({ settings: { _tag: "absent" }, lockfile: { _tag: "absent" } }),
  expectedFindings: [
    {
      message: "The workspace settings file is missing.",
      location: { file: "axm.json" },
    },
  ],
};

export const settingsSchemaValidConformance: WorkspaceRuleConformanceCase = {
  rule: settingsSchemaValidRule,
  satisfied: () => contextFor({ settings: validSettings(), lockfile: validLockfile }),
  violated: () =>
    contextFor({
      settings: { _tag: "schemaInvalid", contents: { agents: "claude-code" } },
      lockfile: validLockfile,
    }),
  expectedFindings: [
    {
      message:
        "The workspace settings file does not match the expected schema. Detail: agents: Expected array. Edit `axm.json` to fix the invalid value.",
      location: { file: "axm.json" },
    },
  ],
  inapplicable: () => contextFor({ settings: { _tag: "absent" }, lockfile: { _tag: "absent" } }),
};

export const lockfileValidConformance: WorkspaceRuleConformanceCase = {
  rule: lockfileValidRule,
  satisfied: () =>
    contextFor({
      settings: validSettings({ skills: { demo: "@acme/skills/demo" } }),
      lockfile: validLockfile,
    }),
  violated: () =>
    contextFor({
      settings: validSettings({ skills: { demo: "@acme/skills/demo" } }),
      lockfile: { _tag: "absent" },
    }),
  expectedFindings: [
    {
      message: "Accepted external-resolution state is missing for desired external content.",
      location: { file: "axm-lock.yaml" },
    },
  ],
  inapplicable: () => contextFor({ settings: validSettings(), lockfile: { _tag: "absent" } }),
};

const unrecognizedAgentContext = () =>
  contextFor({ settings: validSettings(), lockfile: validLockfile }).pipe(
    Effect.map(
      (context) =>
        ({
          ...context,
          workspace: {
            ...context.workspace,
            agents: { ...context.workspace.agents, known: Effect.succeed([]) },
          },
        }) satisfies WorkspaceRuleContext,
    ),
  );

export const agentsRecognizedConformance: WorkspaceRuleConformanceCase = {
  rule: agentsRecognizedRule,
  satisfied: () => contextFor({ settings: validSettings(), lockfile: validLockfile }),
  violated: unrecognizedAgentContext,
  expectedFindings: [
    {
      message:
        "Agent id 'claude-code' in `settings.agents[]` is not supported. Edit `axm.json` and remove 'claude-code' from `agents`, or replace it there with the intended agent id.",
      location: { file: "axm.json" },
    },
  ],
  inapplicable: () =>
    contextFor({
      settings: { _tag: "schemaInvalid", contents: { agents: "not-an-agent" } },
      lockfile: validLockfile,
    }),
};

export const skillsDeclarationsValidConformance: WorkspaceRuleConformanceCase = {
  rule: skillsDeclarationsValidRule,
  satisfied: () =>
    contextFor({
      settings: validSettings({ skills: { demo: "@acme/skills/demo" } }),
      lockfile: validLockfile,
    }),
  violated: () =>
    contextFor({
      settings: validSettings({ skills: { demo: "just-a-name" } }),
      lockfile: validLockfile,
    }),
  expectedFindings: [
    {
      message: "Skill 'demo' uses ambiguous bare source 'just-a-name'.",
      location: { file: "axm.json" },
    },
  ],
  inapplicable: () =>
    contextFor({
      settings: { _tag: "schemaInvalid", contents: { skills: "invalid" } },
      lockfile: validLockfile,
    }),
};

export const packsDeclarationsValidConformance: WorkspaceRuleConformanceCase = {
  rule: packsDeclarationsValidRule,
  satisfied: () =>
    contextFor({
      settings: validSettings({ packs: { base: "@acme/packs/base" } }),
      lockfile: validLockfile,
    }),
  violated: () =>
    contextFor({
      settings: validSettings({ packs: { base: "just-a-name" } }),
      lockfile: validLockfile,
    }),
  expectedFindings: [
    {
      message: "Pack 'base' uses ambiguous bare source 'just-a-name'.",
      location: { file: "axm.json" },
    },
  ],
  inapplicable: () =>
    contextFor({
      settings: { _tag: "schemaInvalid", contents: { packs: "invalid" } },
      lockfile: validLockfile,
    }),
};

export const mcpTransportExclusivityConformance: WorkspaceRuleConformanceCase = {
  rule: mcpServerTransportExclusivityRule,
  satisfied: () =>
    contextFor({
      settings: validSettings({ mcpServers: { demo: { command: "node", args: [] } } }),
      lockfile: validLockfile,
    }),
  violated: () =>
    contextFor({
      settings: validSettings({
        mcpServers: { demo: { command: "node", url: "https://example.test/mcp" } },
      }),
      lockfile: validLockfile,
    }),
  expectedFindings: [
    {
      message:
        "MCP server 'demo' must include exactly one of source, command, or url. Edit `axm.json` so each MCP server uses one transport.",
      location: { file: "axm.json" },
    },
  ],
  inapplicable: () =>
    contextFor({
      settings: { _tag: "schemaInvalid", contents: { mcpServers: "invalid" } },
      lockfile: validLockfile,
    }),
};

export const mcpNoSecretLiteralConformance: WorkspaceRuleConformanceCase = {
  rule: mcpServerNoSecretLiteralRule,
  satisfied: () =>
    contextFor({
      settings: validSettings({
        mcpServers: { demo: { command: "node", env: { API_TOKEN: "${API_TOKEN}" } } },
      }),
      lockfile: validLockfile,
    }),
  violated: () =>
    contextFor({
      settings: validSettings({
        mcpServers: { demo: { command: "node", env: { API_TOKEN: "literal-secret" } } },
      }),
      lockfile: validLockfile,
    }),
  expectedFindings: [
    {
      message:
        "MCP server 'demo' stores a secret-looking literal in env.API_TOKEN. Use a `${VAR}` reference so axm.json does not contain the secret.",
      location: { file: "axm.json" },
    },
  ],
  inapplicable: () =>
    contextFor({
      settings: { _tag: "schemaInvalid", contents: { mcpServers: "invalid" } },
      lockfile: validLockfile,
    }),
};
