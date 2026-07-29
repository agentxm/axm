import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { Argument, Command } from "effect/unstable/cli";

import { makeAppError } from "@agentxm/client-core/unstable/app-error";
import { CliRenderer } from "@agentxm/client-core/unstable/cli-renderer";
import { withArgvTracking } from "@agentxm/client-core/unstable/cli-runtime";
import { openKnowledgeConcept } from "@agentxm/client-core/unstable/knowledge";

import { withRuntime, withWorkspace } from "../../runtime.js";
import { scopeConfig } from "./flags.js";
import { inspectInstalledKnowledge } from "./inspect.js";
import { ConceptSchema } from "./schemas.js";

const KnowledgeOpenQueryResultSchema = Schema.Struct({ concept: ConceptSchema });

export const handleKnowledgeOpen = Effect.fn("Knowledge.open")(function* (
  bundleName: string,
  conceptId: string,
) {
  const renderer = yield* CliRenderer;
  const [bundle] = yield* inspectInstalledKnowledge(bundleName);
  if (bundle === undefined) {
    return yield* makeAppError({
      code: "not_found",
      detail: `Knowledge bundle "${bundleName}" is not installed`,
    });
  }
  const concept = openKnowledgeConcept(bundle.inspection.concepts, conceptId);
  if (concept === undefined) {
    return yield* makeAppError({
      code: "not_found",
      detail: `Knowledge concept "${conceptId}" was not found in "${bundleName}"`,
    });
  }
  const output = { concept: { bundle: bundleName, ...concept } };
  if (yield* renderer.result(output, KnowledgeOpenQueryResultSchema)) return;
  yield* renderer.diagnostic(concept.body);
});

const openConfig = {
  bundle: Argument.string("bundle").pipe(
    Argument.withDescription("Installed knowledge bundle name"),
  ),
  concept: Argument.string("concept").pipe(
    Argument.withDescription("Concept ID (path without .md)"),
  ),
  ...scopeConfig,
} as const;

export const openCommand = Command.make("open", openConfig, ({ bundle, concept, scope }) =>
  handleKnowledgeOpen(bundle, concept).pipe(withWorkspace(scope), withRuntime("knowledge open")),
).pipe(
  withArgvTracking(openConfig),
  Command.withDescription("Open one installed knowledge concept"),
  Command.withExamples([
    {
      command: "axm knowledge open platform auth/session-management",
      description: "Read one concept by bundle and concept ID",
    },
  ]),
);
