import { Flag } from "effect/unstable/cli";

/**
 * The repeated name-filter flag every `<type> update` accepts. `--name` is the
 * uniform selector spelling across extension types; what the filter resolves
 * to is settled by the update feature, not here.
 */
export const updateNameFilterFlag = Flag.String("name").pipe(
  Flag.withDescription("Update only specific extensions by name or glob pattern"),
  Flag.atLeast(0),
);
