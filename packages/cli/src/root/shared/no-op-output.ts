import type { SuggestedAction } from "@agentxm/client-core/unstable/cli-runtime";
import { emitNoOpOperation } from "../../operation-output.js";

export const emitNoOpOutcome = <TCommand extends string>(
  command: TCommand,
  args: {
    readonly planName: string;
    readonly planDescription?: string;
    readonly message: string;
    readonly suggestions?: ReadonlyArray<SuggestedAction>;
    readonly withoutSuggestions?: boolean;
  },
) => emitNoOpOperation(command, args);
