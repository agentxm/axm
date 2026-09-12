/**
 * Every per-extension-type manager under one lookup.
 *
 * A use case that decides the extension type at runtime — creating, forking,
 * adopting, importing, or re-versioning an authored package — needs the
 * manager for the type it decided, not a manager it named at compile time.
 * Without this, each such use case re-derives the same seven-way switch over
 * `ExtensionType`. The registry keeps every entry at its own precise manager
 * type, so narrowing the type narrows the manager with it.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as ServiceMap from "effect/Context";

import type { ExtensionType } from "@agentxm/extension-model/unstable/extensions";
import type { PackRef } from "@agentxm/extension-model/unstable/extensions/refs/pack";
import type { SkillExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/skill";

import type { ExtensionManager, ManagerRequirements } from "./manager-contract.js";
import type {
  HookManagerService,
  KnowledgeManagerService,
  McpServerManagerService,
  PackMaterializationFacts,
  RuleManagerService,
  SkillMaterializationFacts,
  SubagentManagerService,
} from "./managers.js";

/** The manager each extension type is materialized through. */
export interface ExtensionManagersService {
  readonly skill: ExtensionManager<
    SkillExtensionRef,
    SkillMaterializationFacts,
    ManagerRequirements
  >;
  readonly subagent: SubagentManagerService;
  readonly rule: RuleManagerService;
  readonly hook: HookManagerService;
  readonly knowledge: KnowledgeManagerService;
  readonly "mcp-server": McpServerManagerService;
  readonly pack: ExtensionManager<PackRef, PackMaterializationFacts, ManagerRequirements>;
}

// Every extension type has a manager, and no key names a type that does not
// exist: a new type is a compile error here rather than a runtime lookup miss.
type _ManagersCoverEveryType =
  ExtensionManagersService extends Record<ExtensionType, unknown> ? true : never;
const _managersCoverEveryType: _ManagersCoverEveryType = true;
void _managersCoverEveryType;

/**
 * The seven managers as one service. The application composes it once from
 * the individual manager tags; `./live` carries that composition.
 */
export class ExtensionManagers extends ServiceMap.Service<
  ExtensionManagers,
  ExtensionManagersService
>()("@agentxm/extension-materialization/ExtensionManagers") {}
