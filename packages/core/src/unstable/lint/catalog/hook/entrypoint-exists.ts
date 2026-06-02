import * as Effect from "effect/Effect";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import { HookManifestSchema, HOOK_MANIFEST_FILENAME } from "../../../hooks/manifest-schema.js";
import { isManifestJsonParseFailure } from "../shared/manifest-json.js";
import type { HookRuleContext } from "../../context.js";
import type { AdvisoryFinding, AdvisoryRule } from "../../rule.js";

const RULE_ID = "hook/entrypoint-exists";

const decodeHookManifest = Schema.decodeUnknownResult(HookManifestSchema);

export const entrypointExistsRule: AdvisoryRule<HookRuleContext> = {
  id: RULE_ID,
  description: "hook.json entrypoint points to a package file.",
  kind: "advisory",
  severity: "error",
  check: (context) => {
    if (
      context.subject.hookJson === undefined ||
      isManifestJsonParseFailure(context.subject.hookJson)
    ) {
      return Effect.succeed([]);
    }
    const decoded = decodeHookManifest(context.subject.hookJson, {
      onExcessProperty: "ignore",
      errors: "all",
    });
    if (Result.isFailure(decoded)) {
      return Effect.succeed([]);
    }

    const entrypoint = decoded.success.entrypoint;
    return Effect.map(
      context.files.exists(entrypoint),
      (present): ReadonlyArray<AdvisoryFinding> =>
        present
          ? []
          : [
              {
                kind: "advisory",
                ruleId: RULE_ID,
                severity: "error",
                message: `hook.json entrypoint '${entrypoint}' does not exist. Add the hook body file or update \`entrypoint\`.`,
                location: { file: HOOK_MANIFEST_FILENAME },
              },
            ],
    );
  },
};
