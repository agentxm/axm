/**
 * Exact-membership pins for the axis-derived extension type unions.
 *
 * Pure type-level. Excluded from vitest's runtime suite; included in
 * tsconfig.spec.json so the assertions are checked when typecheck runs.
 *
 * Every pin holds in BOTH directions: a union that gains a member fails the
 * no-extra direction, and a union that loses a member (including collapsing
 * to `never` through an axis widening — `Record<never, X>` is satisfied by
 * `{}`) fails the no-missing direction.
 */

import type {
  BodyGovernedType,
  ExtensionType,
  InputType,
  PerAgentType,
  RegistryType,
  SpecTrackedType,
  WorkspaceCapabilityType,
  WorkspaceType,
} from "../common.js";
import type { CatalogExtensionType, LeafExtensionType } from "../../extension-types/schema.js";
import type {
  Agent,
  AgentCapabilities,
  StandardsCompliance,
} from "../../agent-capabilities/schema.js";

type _PerAgentExpected = "skill" | "mcp-server" | "subagent" | "hook";
type _PerAgentNoExtra = [Exclude<PerAgentType, _PerAgentExpected>] extends [never] ? true : false;
const _perAgentNoExtra = true as const satisfies _PerAgentNoExtra;
type _PerAgentNoMissing = [Exclude<_PerAgentExpected, PerAgentType>] extends [never] ? true : false;
const _perAgentNoMissing = true as const satisfies _PerAgentNoMissing;

type _WorkspaceExpected = "rule" | "knowledge";
type _WorkspaceNoExtra = [Exclude<WorkspaceType, _WorkspaceExpected>] extends [never]
  ? true
  : false;
const _workspaceNoExtra = true as const satisfies _WorkspaceNoExtra;
type _WorkspaceNoMissing = [Exclude<_WorkspaceExpected, WorkspaceType>] extends [never]
  ? true
  : false;
const _workspaceNoMissing = true as const satisfies _WorkspaceNoMissing;

type _RegistryExpected = Exclude<ExtensionType, "pack">;
type _RegistryNoExtra = [Exclude<RegistryType, _RegistryExpected>] extends [never] ? true : false;
const _registryNoExtra = true as const satisfies _RegistryNoExtra;
type _RegistryNoMissing = [Exclude<_RegistryExpected, RegistryType>] extends [never] ? true : false;
const _registryNoMissing = true as const satisfies _RegistryNoMissing;

type _InputExpected = "mcp-server";
type _InputNoExtra = [Exclude<InputType, _InputExpected>] extends [never] ? true : false;
const _inputNoExtra = true as const satisfies _InputNoExtra;
type _InputNoMissing = [Exclude<_InputExpected, InputType>] extends [never] ? true : false;
const _inputNoMissing = true as const satisfies _InputNoMissing;

type _BodyGovernedExpected = "skill" | "knowledge";
type _BodyGovernedNoExtra = [Exclude<BodyGovernedType, _BodyGovernedExpected>] extends [never]
  ? true
  : false;
const _bodyGovernedNoExtra = true as const satisfies _BodyGovernedNoExtra;
type _BodyGovernedNoMissing = [Exclude<_BodyGovernedExpected, BodyGovernedType>] extends [never]
  ? true
  : false;
const _bodyGovernedNoMissing = true as const satisfies _BodyGovernedNoMissing;

type _WorkspaceCapabilityExpected = "rule";
type _WorkspaceCapabilityNoExtra = [
  Exclude<WorkspaceCapabilityType, _WorkspaceCapabilityExpected>,
] extends [never]
  ? true
  : false;
const _workspaceCapabilityNoExtra = true as const satisfies _WorkspaceCapabilityNoExtra;
type _WorkspaceCapabilityNoMissing = [
  Exclude<_WorkspaceCapabilityExpected, WorkspaceCapabilityType>,
] extends [never]
  ? true
  : false;
const _workspaceCapabilityNoMissing = true as const satisfies _WorkspaceCapabilityNoMissing;

// The agent capability map is keyed on the placement axis: every per-agent type
// has a capability slot, and nothing else does. A workspace-placed type that
// gains a slot fails the no-extra direction; a per-agent type without one fails
// the no-missing direction.
type _CapabilityKeysArePerAgent = [Exclude<keyof AgentCapabilities, PerAgentType>] extends [never]
  ? true
  : false;
const _capabilityKeysArePerAgent = true as const satisfies _CapabilityKeysArePerAgent;
type _PerAgentAreCapabilityKeys = [Exclude<PerAgentType, keyof AgentCapabilities>] extends [never]
  ? true
  : false;
const _perAgentAreCapabilityKeys = true as const satisfies _PerAgentAreCapabilityKeys;

// A capability schema carries a standards-compliance grade exactly when the
// `governs` axis names a standard for that type. Hand-applying the spec-tracked
// fields to one more (or one fewer) capability schema fails one direction here.
type _CatalogCapabilities = AgentCapabilities & { readonly rule: Agent["instructions"] };
type _NativeOf<Capability> = Capability extends { readonly native: infer Native } ? Native : never;
type _Graded<Capability> = [
  Extract<_NativeOf<Capability>, { readonly standardsCompliance: StandardsCompliance }>,
] extends [never]
  ? false
  : true;
type _GradedCapabilityType = {
  [Type in keyof _CatalogCapabilities]: _Graded<_CatalogCapabilities[Type]> extends true
    ? Type
    : never;
}[keyof _CatalogCapabilities];

type _SpecTrackedCapabilityExpected = Extract<SpecTrackedType, keyof _CatalogCapabilities>;
type _GradedNoExtra = [Exclude<_GradedCapabilityType, _SpecTrackedCapabilityExpected>] extends [
  never,
]
  ? true
  : false;
const _gradedNoExtra = true as const satisfies _GradedNoExtra;
type _GradedNoMissing = [Exclude<_SpecTrackedCapabilityExpected, _GradedCapabilityType>] extends [
  never,
]
  ? true
  : false;
const _gradedNoMissing = true as const satisfies _GradedNoMissing;

type _SpecTrackedExpected = "skill" | "mcp-server" | "rule" | "knowledge";
type _SpecTrackedNoExtra = [Exclude<SpecTrackedType, _SpecTrackedExpected>] extends [never]
  ? true
  : false;
const _specTrackedNoExtra = true as const satisfies _SpecTrackedNoExtra;
type _SpecTrackedNoMissing = [Exclude<_SpecTrackedExpected, SpecTrackedType>] extends [never]
  ? true
  : false;
const _specTrackedNoMissing = true as const satisfies _SpecTrackedNoMissing;

// Alignment pins with the extension-types registries: the catalog's 6-member
// union is exactly the registry-distributed set, and the leaf set is exactly
// the registry set minus knowledge.
type _CatalogIsRegistry = [Exclude<CatalogExtensionType, RegistryType>] extends [never]
  ? true
  : false;
const _catalogIsRegistry = true as const satisfies _CatalogIsRegistry;
type _RegistryIsCatalog = [Exclude<RegistryType, CatalogExtensionType>] extends [never]
  ? true
  : false;
const _registryIsCatalog = true as const satisfies _RegistryIsCatalog;

type _LeafIsRegistryMinusKnowledge = [
  Exclude<LeafExtensionType, Exclude<RegistryType, "knowledge">>,
] extends [never]
  ? true
  : false;
const _leafIsRegistryMinusKnowledge = true as const satisfies _LeafIsRegistryMinusKnowledge;
type _RegistryMinusKnowledgeIsLeaf = [
  Exclude<Exclude<RegistryType, "knowledge">, LeafExtensionType>,
] extends [never]
  ? true
  : false;
const _registryMinusKnowledgeIsLeaf = true as const satisfies _RegistryMinusKnowledgeIsLeaf;

export type _Refs = [
  typeof _perAgentNoExtra,
  typeof _perAgentNoMissing,
  typeof _workspaceNoExtra,
  typeof _workspaceNoMissing,
  typeof _registryNoExtra,
  typeof _registryNoMissing,
  typeof _inputNoExtra,
  typeof _inputNoMissing,
  typeof _bodyGovernedNoExtra,
  typeof _bodyGovernedNoMissing,
  typeof _workspaceCapabilityNoExtra,
  typeof _workspaceCapabilityNoMissing,
  typeof _capabilityKeysArePerAgent,
  typeof _perAgentAreCapabilityKeys,
  typeof _gradedNoExtra,
  typeof _gradedNoMissing,
  typeof _specTrackedNoExtra,
  typeof _specTrackedNoMissing,
  typeof _catalogIsRegistry,
  typeof _registryIsCatalog,
  typeof _leafIsRegistryMinusKnowledge,
  typeof _registryMinusKnowledgeIsLeaf,
];
