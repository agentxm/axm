import { withParameterDescription } from "../cli-parameters.js";
import { Flag, GlobalFlag } from "effect/cli";

/** Machine output: schema-backed JSON results, and an absolute prohibition on prompts. */
export const jsonFlag = GlobalFlag.Setting("axm-json")({
  flag: Flag.Boolean("json").pipe(
    Flag.withAlias("j"),
    withParameterDescription("Output machine-readable JSON"),
    Flag.optional,
  ),
});
