import type * as Effect from "effect/Effect";
import type { PlatformError } from "effect/PlatformError";
import type {
  collectKnowledgeBundleEntries,
  inspectKnowledgeBundle,
  inspectKnowledgeEntries,
} from "@agentxm/extension-content/knowledge";
import type {
  captureKnowledgeIndexBundles,
  KnowledgeCapturedSourceMissingError,
} from "./knowledge-capture.js";
import type { KnowledgeCorpusChangingError } from "./knowledge-revision.js";

type CaptureFailure = Effect.Error<ReturnType<typeof captureKnowledgeIndexBundles>>;
type ExpectedCaptureFailure =
  PlatformError | KnowledgeCorpusChangingError | KnowledgeCapturedSourceMissingError;
const _captureFailuresAreTyped = true as const satisfies [CaptureFailure] extends [
  ExpectedCaptureFailure,
]
  ? true
  : false;
const _captureFailuresAreComplete = true as const satisfies [ExpectedCaptureFailure] extends [
  CaptureFailure,
]
  ? true
  : false;

const _inventoryFailuresAreTyped = true as const satisfies [
  Effect.Error<ReturnType<typeof collectKnowledgeBundleEntries>>,
] extends [PlatformError]
  ? true
  : false;
const _inspectionFailuresAreTyped = true as const satisfies [
  Effect.Error<ReturnType<typeof inspectKnowledgeBundle>>,
] extends [PlatformError]
  ? true
  : false;

interface ReaderFailure {
  readonly _tag: "ReaderFailure";
  readonly source: string;
}
const _customReaderFailureIsPreserved = true as const satisfies [
  Effect.Error<ReturnType<typeof inspectKnowledgeEntries<ReaderFailure>>>,
] extends [ReaderFailure]
  ? true
  : false;

export type KnowledgeFailureEvidence = [
  typeof _captureFailuresAreTyped,
  typeof _captureFailuresAreComplete,
  typeof _inventoryFailuresAreTyped,
  typeof _inspectionFailuresAreTyped,
  typeof _customReaderFailureIsPreserved,
];
