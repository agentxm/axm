/**
 * Area barrel for the package public surface.
 *
 * @experimental This API is unstable and may change without notice.
 */

export {
  AGENT_SKILLS_COMPATIBILITY_MAX_LENGTH,
  AGENT_SKILLS_DESCRIPTION_MAX_LENGTH,
  AGENT_SKILLS_FRONTMATTER_FIELDS,
  AGENT_SKILLS_NAME_MAX_LENGTH,
  AGENT_SKILLS_REFERENCE_VALIDATOR_URL,
  AGENT_SKILLS_SPECIFICATION_URL,
  AGENT_SKILLS_STANDARD_REVISION,
} from "./agent-skills-standard.js";
export {
  FrontmatterParseFailure,
  type FrontmatterResult,
  parseFrontmatterEffect,
  parseFrontmatterSync,
} from "./frontmatter.js";
export {
  type SkillFrontmatter,
  SkillFrontmatterSchema,
  type SkillFrontmatterValidation,
  parseSkillMd,
  validateSkillFrontmatter,
} from "./skill-content.js";
export { type Skill } from "./skill-types.js";
export {
  type SubagentAgentOverrides,
  type SubagentContentResult,
  parseSubagentMd,
} from "./subagent-content.js";
