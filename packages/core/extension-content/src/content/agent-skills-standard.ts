/**
 * Agent Skills conformance pin.
 *
 * AXM validates and materializes agent-facing skill directories against this
 * exact upstream revision. Bumping the revision requires reviewing both the
 * specification and `skills-ref` behavior, then updating conformance tests.
 *
 * @experimental This API is unstable and may change without notice.
 */

export const AGENT_SKILLS_STANDARD_REVISION = "217be548739f21d6008915c29aefe320ea1a90af";

export const AGENT_SKILLS_SPECIFICATION_URL = `https://github.com/agentskills/agentskills/blob/${AGENT_SKILLS_STANDARD_REVISION}/docs/specification.mdx`;

export const AGENT_SKILLS_REFERENCE_VALIDATOR_URL = `https://github.com/agentskills/agentskills/tree/${AGENT_SKILLS_STANDARD_REVISION}/skills-ref`;

export const AGENT_SKILLS_FRONTMATTER_FIELDS = [
  "name",
  "description",
  "license",
  "compatibility",
  "metadata",
  "allowed-tools",
] as const;

export const AGENT_SKILLS_NAME_MAX_LENGTH = 64;
export const AGENT_SKILLS_DESCRIPTION_MAX_LENGTH = 1024;
export const AGENT_SKILLS_COMPATIBILITY_MAX_LENGTH = 500;
