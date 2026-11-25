/**
 * @agentxm/workspace-features/authoring deterministic test fixtures.
 *
 * The minimal valid package of each type, in the shape the scaffolds here
 * define: the manifest and entry document `new` writes, reduced to what
 * validation requires.
 *
 * Production source never imports this module.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import type { ExtensionType } from "@agentxm/extension-model/unstable/extensions";
import { manifestFilenameForType } from "@agentxm/extension-model/unstable/extensions/common";
import { HOOK_MANIFEST_SCHEMA_URL } from "@agentxm/extension-model/unstable/hooks/manifest-schema";
import {
  KNOWLEDGE_MANIFEST_SCHEMA_URL,
  KNOWLEDGE_SOURCE_DIR,
} from "@agentxm/extension-model/unstable/knowledge";
import { MCP_SERVER_MANIFEST_SCHEMA_URL } from "@agentxm/extension-model/unstable/mcps/manifest-schema";
import { PACK_MANIFEST_SCHEMA_URL } from "@agentxm/extension-model/unstable/packs/manifest-schema";
import {
  RULE_BODY_FILENAME,
  RULE_MANIFEST_SCHEMA_URL,
} from "@agentxm/extension-model/unstable/rules/manifest-schema";
import { MANIFEST_SCHEMA_URL as SKILL_MANIFEST_SCHEMA_URL } from "@agentxm/extension-model/unstable/skills/manifest-schema";
import { MANIFEST_SCHEMA_URL as SUBAGENT_MANIFEST_SCHEMA_URL } from "@agentxm/extension-model/unstable/subagents/manifest-schema";

import { hookEntrypointFilename } from "./create/scaffolds/hook.js";
import { manifestText } from "./create/scaffolds/scaffold.js";

/** What a minimal package is called and how it identifies itself. */
export interface MinimalPackageOptions {
  readonly name: string;
  /** Defaults to `@acme`. */
  readonly owner?: string;
  /** Defaults to `1.0.0`. */
  readonly version?: string;
  /** Defaults to `The <name> <type>.` */
  readonly description?: string;
  /**
   * The prose of the type's entry document. Defaults to the description, or
   * for a rule to guidance naming the rule; types whose content is the
   * manifest itself ignore it.
   */
  readonly body?: string;
  /** A license the manifest declares; omitted by default. */
  readonly license?: string;
}

const typeNoun: Record<ExtensionType, string> = {
  skill: "skill",
  "mcp-server": "MCP server",
  subagent: "subagent",
  rule: "rule",
  hook: "hook",
  knowledge: "knowledge bundle",
  pack: "pack",
};

const manifestSchemaUrl: Record<ExtensionType, string> = {
  skill: SKILL_MANIFEST_SCHEMA_URL,
  "mcp-server": MCP_SERVER_MANIFEST_SCHEMA_URL,
  subagent: SUBAGENT_MANIFEST_SCHEMA_URL,
  rule: RULE_MANIFEST_SCHEMA_URL,
  hook: HOOK_MANIFEST_SCHEMA_URL,
  knowledge: KNOWLEDGE_MANIFEST_SCHEMA_URL,
  pack: PACK_MANIFEST_SCHEMA_URL,
};

/**
 * The manifest and source files of a minimal valid package of `type`, keyed
 * by package-relative path, with no workspace layout around them.
 *
 * A package has the shape the type's scaffold gives it, the same manifest file
 * and entry document that `new` writes, reduced to what validation requires.
 * Where the package sits, and any file an example adds beside it, belong to
 * the caller.
 */
export const minimalPackageFiles = (
  type: ExtensionType,
  options: MinimalPackageOptions,
): Readonly<Record<string, string>> => {
  const { name } = options;
  const owner = options.owner ?? "@acme";
  const version = options.version ?? "1.0.0";
  const description = options.description ?? `The ${name} ${typeNoun[type]}.`;
  const common = {
    $schema: manifestSchemaUrl[type],
    owner,
    type,
    name,
    version,
    description,
    ...(options.license === undefined ? {} : { license: options.license }),
  };
  const manifestFile = manifestFilenameForType(type);
  switch (type) {
    case "skill":
      return {
        [manifestFile]: manifestText(common),
        "src/SKILL.md": `---\nname: "${name}"\ndescription: "${description}"\n---\n\n# ${name}\n\n${options.body ?? description}\n`,
      };
    case "subagent":
      return {
        [manifestFile]: manifestText({ ...common, core: { instructions: `src/${name}.md` } }),
        [`src/${name}.md`]: `# ${name}\n\n${options.body ?? description}\n`,
      };
    case "rule":
      return {
        [manifestFile]: manifestText(common),
        [`src/${RULE_BODY_FILENAME}`]: `${options.body ?? `Guidance for ${name}: ${description}`}\n`,
      };
    case "hook": {
      const entrypoint = `src/${hookEntrypointFilename("bash")}`;
      return {
        [manifestFile]: manifestText({
          ...common,
          implementations: ["claude-code", "codex"].map((protocol) => ({
            id: protocol,
            protocol,
            bindings: [
              {
                id: "audit",
                event: "PreToolUse",
                matcher: "Write|Edit",
                handler: { type: "command", runtime: "bash", entrypoint },
              },
            ],
          })),
        }),
        [entrypoint]: `#!/usr/bin/env bash\necho "${name}"\n`,
      };
    }
    case "knowledge":
      return {
        [manifestFile]: manifestText({
          ...common,
          format: { name: "okf", version: "0.2" },
          bundleRoot: KNOWLEDGE_SOURCE_DIR,
        }),
        [`${KNOWLEDGE_SOURCE_DIR}/index.md`]: `---\nokf_version: "0.2"\n---\n\n# ${name}\n${options.body === undefined ? "" : `\n${options.body}\n`}`,
      };
    case "mcp-server":
      return {
        [manifestFile]: manifestText({
          ...common,
          server: {
            name: `io.github.example/${name}`,
            description,
            version,
            packages: [
              {
                registryType: "npm",
                identifier: `${owner}/${name}`,
                version,
                transport: { type: "stdio" },
              },
            ],
          },
        }),
      };
    case "pack":
      return { [manifestFile]: manifestText({ ...common, dependencies: {} }) };
  }
};
