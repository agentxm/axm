import { withLiveOperation } from "../../../operation-lifecycle.js";
import * as Effect from "effect/Effect";
import { Command } from "effect/cli";

import {
  KnowledgeConceptCapabilitiesOutputSchema,
  reportKnowledgeDiscoveryCapabilities,
} from "@agentxm/workspace-features/knowledge-query";

import { emitResult, rawDoc } from "../../../screen/index.js";
import { processOutcome, withArgvTracking } from "../../../cli-runtime/index.js";
import {
  readOnlyCapabilities,
  withCommandCapabilities,
} from "../../shared/command-capabilities.js";

import { withRuntime, withWorkspace } from "../../../runtime.js";
import { scopeConfig } from "../flags.js";
import { knowledgeCorpusFailures } from "../knowledge-errors.js";
import { failKnowledgeCorpusChanging } from "./failures.js";

export const handleKnowledgeConceptCapabilities = Effect.fn("Knowledge.concepts.capabilities")(
  function* () {
    const result = yield* withLiveOperation(
      {
        command: "knowledge.concepts.capabilities",
        name: "Inspect knowledge discovery",
        mode: "query",
      },
      reportKnowledgeDiscoveryCapabilities().pipe(
        Effect.catchTag(
          "KnowledgeCorpusUnavailable",
          knowledgeCorpusFailures.KnowledgeCorpusUnavailable,
        ),
      ),
    );
    if (result.outcome === "corpus-changing") return yield* failKnowledgeCorpusChanging();
    const output = result.document;
    yield* emitResult(output, KnowledgeConceptCapabilitiesOutputSchema, () =>
      rawDoc(
        `Knowledge discovery ${output.capabilities.contract}\nBundles  ${String(output.bundleCount)}\nConcepts ${String(output.conceptCount)}\nCorpus   ${output.corpusFingerprint}\n`,
      ),
    );
    return processOutcome(0);
  },
);

const capabilitiesConfig = { ...scopeConfig } as const;

export const capabilitiesCommand = Command.make("capabilities", capabilitiesConfig, ({ scope }) =>
  handleKnowledgeConceptCapabilities().pipe(
    withWorkspace(scope),
    withRuntime("knowledge concepts capabilities"),
  ),
).pipe(
  withArgvTracking(capabilitiesConfig),
  withCommandCapabilities(readOnlyCapabilities()),
  Command.withDescription("Report discovery capabilities and selected corpus identity"),
  Command.withExamples([
    {
      command: "axm knowledge concepts capabilities",
      description: "Inspect the discovery contract and selected corpus fingerprint",
    },
  ]),
);
