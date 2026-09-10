import { Flag, GlobalFlag } from "effect/unstable/cli";

/** Machine output: schema-backed JSON results, and an absolute prohibition on prompts. */
export const jsonFlag = GlobalFlag.setting("axm-json")({
  flag: Flag.boolean("json").pipe(
    Flag.withAlias("j"),
    Flag.withDescription("Output machine-readable JSON"),
    Flag.optional,
  ),
});
