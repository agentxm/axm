/**
 * Rules feature module.
 *
 * @experimental All exports from this module are unstable and may change without notice.
 */

export {
  RULE_BODY_FILENAME,
  RULE_EXTENSION_DIR,
  RULE_MANIFEST_FILENAME,
  RULE_MANIFEST_SCHEMA_URL,
  RuleManifestSchema,
  type RuleManifest,
} from "./manifest-schema.js";

export {
  rulePackagesInDir,
  type DiscoveredRulePackage,
  type RulePackageDiscoveryOptions,
} from "./discovery.js";

export type {
  GitHostedRuleRef,
  LocalRuleRef,
  RegistryRuleRef,
  RuleExtensionRef,
  WorkspaceRuleRef,
} from "./refs.js";
export { RuleManager, RuleManagerLive, type RuleManagerService } from "./manager.js";
