/**
 * The interaction allocation for every command route, derived from the
 * command inventory in `command-behavior-allocation.json`.
 *
 * A route offers assessment when its inventory row records `--preview` and
 * preapproval when it records `--yes`. The inventory is maintained apart from
 * the registered command tree, and its test compares every route and rendered
 * flag with that tree, so these views do not depend on production. The purpose
 * fixtures elsewhere demonstrate the preapproval effect, and every preview
 * route owns a `preview-is-pure` obligation, declared by a specification of
 * its own or by a successor whose `supersedes` names it.
 */
import { loadCommandInventory } from "./command-inventory.js";

export interface CommandRouteAllocation {
  readonly path: ReadonlyArray<string>;
  readonly preview: boolean;
  readonly preapproval: boolean;
}

export const COMMAND_ROUTE_ALLOCATION: ReadonlyArray<CommandRouteAllocation> = Object.entries(
  loadCommandInventory().routes,
).map(([spelling, row]) => {
  const flags = new Set(row.flags.map((flag) => flag.name));
  return {
    path: spelling === "" ? [] : spelling.split(" "),
    preview: flags.has("preview"),
    preapproval: flags.has("yes"),
  };
});

export const formatRoute = (path: ReadonlyArray<string>): string =>
  path.length === 0 ? "axm" : `axm ${path.join(" ")}`;

/** Routes whose capabilities include a preapprovable confirmation. */
export const PREAPPROVAL_ROUTES = COMMAND_ROUTE_ALLOCATION.filter((entry) => entry.preapproval);

/** Routes that offer an assessment without applying. */
export const PREVIEW_ROUTES = COMMAND_ROUTE_ALLOCATION.filter((entry) => entry.preview);
