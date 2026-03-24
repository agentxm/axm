import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { Flag } from "effect/unstable/cli";
import { CliEnvConfig } from "../config/index.js";
import { isInteractive } from "../utils/tty.js";
import { DEFAULT_WORKSPACE_SCOPE, WORKSPACE_SCOPES } from "../workspace/scope.js";

export {
  CliFlags,
  CliFlagsTest,
  forceFlag,
  nonInteractiveFlag,
  previewFlag,
  yesFlag,
  type CliFlagsService,
} from "@axm.sh/core/unstable/cli-flags";

export const scopeFlag = Flag.choice("scope", WORKSPACE_SCOPES).pipe(
  Flag.withDescription("Configuration scope: project (default) or user"),
  Flag.withDefault(DEFAULT_WORKSPACE_SCOPE),
);

import { CliFlags, nonInteractiveFlag } from "@axm.sh/core/unstable/cli-flags";

// ---------------------------------------------------------------------------
// Layer factory — resolves nonInteractive from the global flag + env config,
// and accepts per-command yes/force/preview values (default false).
// ---------------------------------------------------------------------------

export const makeCliFlagsLayer = (perCommandFlags?: {
  readonly yes?: boolean;
  readonly force?: boolean;
  readonly preview?: boolean;
}) =>
  Layer.effect(
    CliFlags,
    Effect.gen(function* () {
      const nonInteractiveOpt = yield* nonInteractiveFlag;
      const envConfig = yield* CliEnvConfig;
      return {
        nonInteractive: Option.getOrElse(
          nonInteractiveOpt,
          () => envConfig.ci === "true" || !isInteractive(),
        ),
        yes: perCommandFlags?.yes ?? false,
        force: perCommandFlags?.force ?? false,
        preview: perCommandFlags?.preview ?? false,
      };
    }),
  );
