/** Catalog declarations resolved against the selected scope's captured roots. */
import type * as Path from "effect/Path";
import type { NativeReadLocation } from "@agentxm/extension-model/unstable/agent-capabilities";
import type { AgentDescriptor } from "@agentxm/extension-model/unstable/agents/types";
import type { WorkspaceScope } from "@agentxm/extension-model/unstable/workspace-scope";

export interface NativeDirectoryInputs {
  readonly skillsDirectoryOverrides: Readonly<Partial<Record<string, string>>>;
  readonly xdgConfigRoot?: string;
  readonly userConfigRootOverrides?: Readonly<Partial<Record<string, string>>>;
}

export interface ResolvedNativeReadLocation<
  Location extends NativeReadLocation = NativeReadLocation,
> {
  readonly declaration: Location;
  readonly nativeRoot: string;
  readonly path: string;
  readonly availability: "declared" | "unverified-override" | "unverified-condition";
}

/** Resolve only explicit scope, root, and override semantics from the declaration. */
export const resolveNativeReadLocation = <Location extends NativeReadLocation>(
  path: Path.Path,
  agentId: string,
  declaration: Location,
  args: { readonly workspaceRoot: string; readonly scope: WorkspaceScope },
  inputs: NativeDirectoryInputs,
  options?: { readonly includeConditional: boolean },
): ResolvedNativeReadLocation<Location> | undefined => {
  if (
    declaration.scope !== args.scope ||
    (declaration.applicability.kind !== "always" && options?.includeConditional !== true) ||
    declaration.path.includes("<")
  )
    return undefined;
  const override =
    declaration.configRootRelativePath === undefined
      ? undefined
      : inputs.userConfigRootOverrides?.[agentId];
  if (override !== undefined && override.trim().length === 0) return undefined;
  const root = declaration.root === "xdg-config" ? inputs.xdgConfigRoot : args.workspaceRoot;
  if (root === undefined) return undefined;
  const nativeRoot = path.resolve(
    override === undefined ? root : path.resolve(args.workspaceRoot, override),
  );
  return {
    declaration,
    nativeRoot,
    path:
      override === undefined || declaration.configRootRelativePath === undefined
        ? path.resolve(root, declaration.path)
        : path.resolve(args.workspaceRoot, override, declaration.configRootRelativePath),
    availability:
      declaration.applicability.kind === "conditional"
        ? "unverified-condition"
        : override === undefined
          ? "declared"
          : "unverified-override",
  };
};

export const resolveDeclaredNativeLocations = (
  path: Path.Path,
  descriptor: AgentDescriptor,
  kind: "skill" | "subagent",
  args: { readonly workspaceRoot: string; readonly scope: WorkspaceScope },
  inputs: NativeDirectoryInputs,
): ReadonlyArray<ResolvedNativeReadLocation> => {
  const declarations =
    (kind === "skill" ? descriptor.skills : descriptor.subagents)?.locations ?? [];
  const override = kind === "skill" ? inputs.skillsDirectoryOverrides[descriptor.id] : undefined;
  return declarations.flatMap((declaration) => {
    const resolved = resolveNativeReadLocation(path, descriptor.id, declaration, args, inputs);
    if (resolved === undefined) return [];
    if (declaration.role === "primary" && override !== undefined && override.trim().length === 0)
      return [];
    return declaration.role === "primary" && override !== undefined
      ? [
          {
            ...resolved,
            nativeRoot: path.resolve(args.workspaceRoot, override),
            path: path.resolve(args.workspaceRoot, override),
            availability: "unverified-override" as const,
          },
        ]
      : [resolved];
  });
};
