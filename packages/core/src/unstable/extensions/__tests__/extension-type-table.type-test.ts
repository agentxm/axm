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
  WorkspaceType,
} from "../common.js";
import type { CatalogExtensionType, LeafExtensionType } from "../../extension-types/schema.js";

type _PerAgentExpected = "skill" | "command" | "mcp-server" | "subagent" | "hook";
type _PerAgentNoExtra = [Exclude<PerAgentType, _PerAgentExpected>] extends [never] ? true : false;
const _perAgentNoExtra = true as const satisfies _PerAgentNoExtra;
type _PerAgentNoMissing = [Exclude<_PerAgentExpected, PerAgentType>] extends [never] ? true : false;
const _perAgentNoMissing = true as const satisfies _PerAgentNoMissing;

type _WorkspaceExpected = "files" | "rule" | "knowledge";
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

type _InputExpected = "mcp-server" | "files";
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

// Alignment pins with the extension-types registries: the catalog's 8-member
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
  typeof _catalogIsRegistry,
  typeof _registryIsCatalog,
  typeof _leafIsRegistryMinusKnowledge,
  typeof _registryMinusKnowledgeIsLeaf,
];
