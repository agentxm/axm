import * as Layer from "effect/Layer";
import { UpgradeExecutionObserver } from "@agentxm/cli-maintenance/self-update/application";
import { makeCliUpgradeExecutionObserver } from "../adapters/cli/execution-observer.js";

/** The delivery boundary explicitly selects the CLI observer. */
export const CliUpgradeObservationLive = Layer.effect(
  UpgradeExecutionObserver,
  makeCliUpgradeExecutionObserver(),
);
