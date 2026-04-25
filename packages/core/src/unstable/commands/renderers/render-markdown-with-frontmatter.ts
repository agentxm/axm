/**
 * Markdown + YAML frontmatter renderer.
 *
 * For: Claude Code, Codex, OpenCode, Augment, Junie, Kilo Code, Roo Code.
 * Produces `.md` with YAML frontmatter and substituted body.
 *
 * @experimental This API is unstable and may change without notice.
 */

import YAML from "yaml";
import type { LossyRenderingWarning } from "../rendering-warnings.js";
import { substituteVariables } from "../variable-substitution.js";
import type { RenderInput, RenderOutput } from "./types.js";

/**
 * Build the YAML frontmatter object from command frontmatter and agent overrides.
 */
const buildFrontmatterObject = (input: RenderInput): Record<string, unknown> | undefined => {
  const { frontmatter, agentOverrides } = input;
  const fm: Record<string, unknown> = {};

  if (frontmatter.description !== undefined) {
    fm["description"] = frontmatter.description;
  }

  if (frontmatter.argumentHint !== undefined) {
    fm["argument-hint"] = frontmatter.argumentHint;
  }

  if (frontmatter.allowedTools !== undefined && frontmatter.allowedTools !== null) {
    fm["allowed-tools"] = [...frontmatter.allowedTools];
  }

  if (frontmatter.model !== undefined && frontmatter.model !== null) {
    fm["model"] = frontmatter.model;
  }

  if (frontmatter.isolatedContext === true) {
    fm["isolated-context"] = true;
  }

  if (frontmatter.autoInvocable !== undefined) {
    fm["auto-invocable"] = frontmatter.autoInvocable;
  }

  if (frontmatter.userInvocable !== undefined) {
    fm["user-invocable"] = frontmatter.userInvocable;
  }

  // Apply agent overrides — merge on top of computed frontmatter
  if (agentOverrides !== undefined) {
    for (const [key, value] of Object.entries(agentOverrides)) {
      fm[key] = value;
    }
  }

  return Object.keys(fm).length > 0 ? fm : undefined;
};

/**
 * Render a command as Markdown with YAML frontmatter.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const renderMarkdownWithFrontmatter = (input: RenderInput): RenderOutput => {
  const warnings: Array<LossyRenderingWarning> = [];
  const fmObject = buildFrontmatterObject(input);

  const { body: substitutedBody, warnings: subWarnings } = substituteVariables(
    input.body,
    input.agentId,
  );
  warnings.push(...subWarnings);

  const parts: Array<string> = [];

  if (fmObject !== undefined) {
    const yamlStr = YAML.stringify(fmObject, { lineWidth: 0 }).trim();
    parts.push(`---\n${yamlStr}\n---`);
  }

  if (substitutedBody.length > 0) {
    parts.push(substitutedBody);
  }

  return {
    content: parts.join("\n"),
    warnings,
    fileExtension: ".md",
  };
};
