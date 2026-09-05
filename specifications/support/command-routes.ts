/**
 * The accepted interaction allocation for every registered command route.
 *
 * This table is the independent inventory the architecture gate compares the
 * registered command tree against: a route the tree registers but the table
 * omits, or the reverse, fails the gate, and a route whose declaration or
 * parsed flags disagree with its row fails too. Rows state which routes offer
 * assessment (`--preview`) and which offer preapproval (`--yes`); the purpose
 * fixtures elsewhere demonstrate the preapproval effect, and each preview
 * route owns a `preview-is-pure` specification in its command folder.
 */

export interface CommandRouteAllocation {
  readonly path: ReadonlyArray<string>;
  readonly preview: boolean;
  readonly preapproval: boolean;
}

const route = (
  spelling: string,
  options: { readonly preview?: boolean; readonly preapproval?: boolean } = {},
): CommandRouteAllocation => ({
  path: spelling === "" ? [] : spelling.split(" "),
  preview: options.preview ?? false,
  preapproval: options.preapproval ?? false,
});

const previewable = (spelling: string) => route(spelling, { preview: true });

const typeLifecycle = (group: string): ReadonlyArray<CommandRouteAllocation> => [
  route(group),
  previewable(`${group} install`),
  previewable(`${group} uninstall`),
  route(`${group} list`),
  route(`${group} show`),
  previewable(`${group} update`),
  previewable(`${group} new`),
  previewable(`${group} enable`),
  previewable(`${group} disable`),
  previewable(`${group} publish`),
];

export const COMMAND_ROUTE_ALLOCATION: ReadonlyArray<CommandRouteAllocation> = [
  route(""),
  // Root extension lifecycle, authoring, and publication
  previewable("publish"),
  previewable("fork"),
  previewable("adopt"),
  route("demote", { preview: true, preapproval: true }),
  previewable("install"),
  previewable("update"),
  previewable("uninstall"),
  route("list"),
  route("view"),
  route("visibility"),
  route("visibility status"),
  route("visibility set"),
  route("visibility reconcile"),
  previewable("version"),
  route("yank"),
  route("unyank"),
  route("deprecate"),
  route("undeprecate"),
  // Workspace
  previewable("sync"),
  route("agents"),
  route("agents list"),
  previewable("agents add"),
  previewable("agents remove"),
  route("agents capabilities"),
  route("instructions"),
  previewable("instructions enable"),
  previewable("instructions disable"),
  route("lint"),
  route("cache"),
  route("cache status"),
  route("cache verify"),
  route("cache prune"),
  previewable("upgrade"),
  // Auth
  route("login", { preapproval: true }),
  route("logout"),
  route("whoami"),
  route("token"),
  route("token create"),
  route("token list"),
  route("token revoke"),
  // Getting started
  route("setup", { preview: true, preapproval: true }),
  route("discover"),
  route("help"),
  // Type command groups
  ...typeLifecycle("skills"),
  previewable("skills import"),
  ...typeLifecycle("mcps"),
  previewable("mcps add"),
  previewable("mcps import"),
  ...typeLifecycle("subagents"),
  previewable("subagents import"),
  ...typeLifecycle("hooks"),
  ...typeLifecycle("rules"),
  ...typeLifecycle("knowledge"),
  route("knowledge concepts"),
  route("knowledge concepts resolve"),
  route("knowledge concepts search"),
  route("knowledge concepts query"),
  route("knowledge concepts get"),
  route("knowledge concepts related"),
  route("knowledge concepts status"),
  route("knowledge lint"),
  route("packs"),
  route("packs list"),
  previewable("packs enable"),
  previewable("packs disable"),
  previewable("packs install"),
  previewable("packs uninstall"),
  previewable("packs new"),
  previewable("packs add"),
  previewable("packs remove"),
  route("packs show"),
  previewable("packs publish"),
  previewable("packs unpack"),
  previewable("packs update"),
];

export const formatRoute = (path: ReadonlyArray<string>): string =>
  path.length === 0 ? "axm" : `axm ${path.join(" ")}`;

/** Routes whose capabilities include a preapprovable confirmation. */
export const PREAPPROVAL_ROUTES = COMMAND_ROUTE_ALLOCATION.filter((entry) => entry.preapproval);

/** Routes that offer an assessment without applying. */
export const PREVIEW_ROUTES = COMMAND_ROUTE_ALLOCATION.filter((entry) => entry.preview);
