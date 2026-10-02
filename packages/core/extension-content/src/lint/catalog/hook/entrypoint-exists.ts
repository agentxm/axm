import * as Effect from "effect/Effect";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import {
  HookManifestSchema,
  HOOK_MANIFEST_FILENAME,
  referencedHookPackageFiles,
} from "@agentxm/extension-model/unstable/hooks/manifest-schema";
import { isManifestJsonParseFailure } from "../shared/manifest-json.js";
import type { HookRuleContext } from "../../context.js";
import type { AdvisoryFinding, AdvisoryRule } from "../../rule.js";

const RULE_ID = "hook/referenced-files-exist";

const decodeHookManifest = Schema.decodeUnknownResult(HookManifestSchema);

export const entrypointExistsRule: AdvisoryRule<HookRuleContext> = {
  id: RULE_ID,
  description: "Every Hook implementation, declared asset, and fixture references a package file.",
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

    return Effect.gen(function* () {
      const findings: Array<AdvisoryFinding> = [];
      for (const file of referencedHookPackageFiles(decoded.success)) {
        if (!(yield* context.files.exists(file))) {
          findings.push({
            kind: "advisory",
            ruleId: RULE_ID,
            severity: "error",
            message: `hook.json references missing package file '${file}'. Add the file or update its reference.`,
            location: { file: HOOK_MANIFEST_FILENAME },
          });
        }
      }
      return findings;
    });
  },
};
