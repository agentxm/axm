/**
 * @agentxm/extension-content public API.
 *
 * Extension content behavior shared by the AXM client and the AgentXM
 * Registry: skill and subagent content parsing, manifest resolution, archive
 * guardrails, type-specific package validation, and publish input
 * normalization. Knowledge inspection lives under `./knowledge` and the lint
 * rule catalog under `./lint`.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

export {
  AGENT_SKILLS_COMPATIBILITY_MAX_LENGTH,
  AGENT_SKILLS_DESCRIPTION_MAX_LENGTH,
  AGENT_SKILLS_FRONTMATTER_FIELDS,
  AGENT_SKILLS_NAME_MAX_LENGTH,
  AGENT_SKILLS_REFERENCE_VALIDATOR_URL,
  AGENT_SKILLS_SPECIFICATION_URL,
  AGENT_SKILLS_STANDARD_REVISION,
} from "./content/agent-skills-standard.js";
export {
  FRONTMATTER_PARSE_FALLBACK_REASON,
  FrontmatterParseFailure,
  type FrontmatterResult,
  parseFrontmatterEffect,
  parseFrontmatterSync,
} from "./content/frontmatter.js";
export {
  type SkillFrontmatter,
  SkillFrontmatterSchema,
  type SkillFrontmatterValidation,
  parseSkillMd,
  validateSkillFrontmatter,
} from "./content/skill-content.js";
export { type Skill } from "./content/skill-types.js";
export {
  type SubagentAgentOverrides,
  type SubagentContentResult,
  SubagentContentError,
  parseSubagentMd,
} from "./content/subagent-content.js";
export {
  ArchiveGuardrailError,
  type ArchiveGuardrailLimits,
  ZIP_LOCAL_SIGNATURE,
  type ZipEntry,
  checkForbiddenSourceEntries,
  parseZipCentralDirectory,
  validateArchive,
} from "./packaging/archive-guardrails.js";
export {
  FilteredPackageError,
  type ValidateFilteredPackageArgs,
  validateFilteredPackage,
} from "./packaging/filtered-package-validation.js";
export {
  IngestLimitError,
  IngestUnsupportedContentTypeError,
  REGISTRY_PUBLISH_MAX_ARCHIVE_BYTES,
  REGISTRY_PUBLISH_MAX_REQUEST_BYTES,
  enforceArchiveContentType,
  enforceArchiveSizeLimit,
  enforceRequestSizeLimit,
} from "./packaging/ingest-limits.js";
export {
  type NormalizePublishInputArgs,
  type PublishArchiveInput,
  type PublishInput,
  defaultReadEntry,
  normalizePublishInput,
} from "./packaging/input-normalization.js";
export {
  type DeclaredPublishIdentity,
  MANIFEST_FILENAME_BY_TYPE,
  ManifestError,
  type ManifestIdentity,
  ManifestIdentitySchema,
  type ManifestResolutionInput,
  type ResolvedManifest,
  manifestFilenameForType,
  manifestSchemaForType,
  resolveManifest,
  validateDeclaredManifestAlignment,
  validateManifestHasNoAgentsField,
} from "./packaging/manifest-policy.js";
