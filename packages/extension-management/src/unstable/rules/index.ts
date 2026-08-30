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
