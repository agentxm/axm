import { observeUnit } from "@agentxm/workspace-operations";
import { methodName } from "@agentxm/cli-maintenance/self-update/domain";
import { methodLabel } from "@agentxm/cli-maintenance/self-update/adapters/cli";
import type { UpgradeExecutionObserverService } from "@agentxm/cli-maintenance/self-update/application";

export const cliUpgradeExecutionObserver: UpgradeExecutionObserverService = {
  during: (stage, execution) =>
    observeUnit(
      stage.kind === "availability"
        ? { id: "availability", label: `${methodLabel(methodName(stage.method))} availability` }
        : {
            id: "upgrade",
            label: `AXM ${stage.targetVersion} via ${methodLabel(methodName(stage.method))}`,
          },
      execution,
    ),
};
