import { Flag, GlobalFlag } from "effect/unstable/cli";

/** Machine output: schema-backed JSON results, and an absolute prohibition on prompts. */
export const jsonFlag = GlobalFlag.Setting("axm-json")({
  flag: Flag.Boolean("json").pipe(
    Flag.withAlias("j"),
    Flag.withDescription("Output machine-readable JSON"),
    Flag.optional,
  ),
});
