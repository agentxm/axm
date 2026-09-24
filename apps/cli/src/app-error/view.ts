import {
  collectSensitiveStrings,
  redactRegistryText,
  redactRegistryValue,
} from "@agentxm/registry-client";
import type { SuggestedAction } from "@agentxm/registry-protocol/unstable/suggested-action";
import {
  exitPhrase,
  paintText,
  type Doc,
  type DocNode,
  type Field,
  type Text,
} from "../screen/index.js";
import {
  type AppError,
  type AppErrorCode,
  effectiveSuggestionsFor,
  exitCodeFor,
} from "./app-error.js";
import { serializeErrorCauseChain } from "./cause-chain.js";
import { redactSuggestedAction } from "./secret-redaction.js";

const defaultRenderOptions: { readonly verbose: boolean; readonly debug: boolean } = {
  verbose: false,
  debug: false,
};

const getStringField = (value: unknown, field: string): string | undefined => {
  if (value === null || value === undefined || typeof value !== "object") {
    return undefined;
  }

  const fieldValue: unknown = Reflect.get(value, field);
  return typeof fieldValue === "string" ? fieldValue : undefined;
};

const getRequestId = (error: AppError): string | undefined =>
  error.metadata?.response?.requestId ??
  getStringField(error.metadata?.response?.body, "requestId");

const getRegistryUrl = (error: AppError): string | undefined =>
  error.metadata?.request?.service === "registry" ? error.metadata.request.url : undefined;

const formatRegistryLocation = (url: string, secrets: ReadonlyArray<string>): string => {
  try {
    return redactRegistryText(new URL(url).origin, { secrets });
  } catch {
    return redactRegistryText(url, { secrets });
  }
};

const formatRegistryRequest = (
  error: AppError,
  secrets: ReadonlyArray<string>,
): string | undefined => {
  const request = error.metadata?.request;
  if (request === undefined || request.service !== "registry") {
    return undefined;
  }
  return redactRegistryText(
    request.method === undefined ? request.url : `${request.method} ${request.url}`,
    { secrets },
  );
};

const formatResponseBody = (
  body: unknown,
  secrets: ReadonlyArray<string>,
): ReadonlyArray<string> => {
  try {
    return JSON.stringify(redactRegistryValue(body, { secrets }), null, 2).split("\n");
  } catch {
    return ["[unserializable response body]"];
  }
};

const suggestionsNode = (
  suggestions: ReadonlyArray<SuggestedAction>,
  secrets: ReadonlyArray<string>,
): DocNode | undefined =>
  suggestions.length === 0
    ? undefined
    : {
        _tag: "next",
        actions: suggestions.map((suggestion) => redactSuggestedAction(suggestion, secrets)),
      };

const formatCause = (
  cause: unknown,
  options: { readonly verbose: boolean; readonly debug: boolean },
  secrets: ReadonlyArray<string>,
): Doc => {
  const chain = serializeErrorCauseChain(cause, { debug: options.debug, secrets });
  return chain.flatMap((item) => {
    const code = item.code === undefined ? "" : ` (${item.code})`;
    const lines: Doc = [{ _tag: "paragraph", text: `Cause: ${item._tag}: ${item.message}${code}` }];
    if (options.debug && item.stack !== undefined) {
      return [
        ...lines,
        ...item.stack.split("\n").map(
          (line) =>
            ({
              _tag: "paragraph",
              text: `Stack: ${line.trim()}`,
            }) satisfies DocNode,
        ),
      ];
    }
    return lines;
  });
};

/**
 * The dim aside every problem title carries at the value column: the stable
 * code a script matches on and the process exit code it will see.
 */
const problemAside = (code: AppErrorCode): string => `${code}, ${exitPhrase(exitCodeFor(code))}`;

/** The reason, with how many attempts it took when a retry policy ran out. */
const reasonText = (error: AppError, secrets: ReadonlyArray<string>): Text => {
  const detail = redactRegistryText(error.detail, { secrets });
  const attempts = error.metadata?.requestPolicy?.attemptCount;
  return attempts === undefined || attempts < 2
    ? detail
    : [{ text: detail }, { text: ` (${String(attempts)} attempts)`, tone: "dim" }];
};

/**
 * One problem shape for every error kind: a title with its code and exit code
 * as an aside, the reason, the inputs and identifiers as fields, and every
 * recovery as a copyable `next` command. Verbose and debug levels add the
 * request, the response, and the cause chain beneath the fields.
 */
export const appErrorDoc = (
  error: AppError,
  options: { readonly verbose: boolean; readonly debug: boolean } = defaultRenderOptions,
): Doc => {
  const secrets = collectSensitiveStrings(error.metadata);
  const requestId = getRequestId(error);
  const registryUrl = getRegistryUrl(error);
  const detailed = options.verbose || options.debug;
  const title = redactRegistryText(error.title, { secrets });
  const fields: Array<Field> = (error.inputs ?? []).map((input) => ({
    label: redactRegistryText(input.label, { secrets }),
    value: redactRegistryText(input.value, { secrets }),
  }));
  const children: Array<DocNode> = [];

  if (registryUrl !== undefined) {
    fields.push({ label: "Registry", value: formatRegistryLocation(registryUrl, secrets) });
  }

  if (detailed) {
    const registryRequest = formatRegistryRequest(error, secrets);
    if (registryRequest !== undefined) {
      fields.push({ label: "Request", value: registryRequest });
    }
  }

  if (requestId !== undefined && (detailed || error.code === "internal")) {
    fields.push({
      label: "Request ID",
      value: [{ text: redactRegistryText(requestId, { secrets }), copyable: true }],
    });
  }

  // A failure about its inputs states them as fields, which say more than
  // the sentence its detail spells for the machine envelope.
  if (error.inputs === undefined && redactRegistryText(error.detail, { secrets }) !== title) {
    children.push({ _tag: "paragraph", text: reasonText(error, secrets) });
  }
  if (fields.length > 0) children.push({ _tag: "fields", fields });

  if (detailed) {
    const responseBody = error.metadata?.response?.body;
    if (responseBody !== undefined) {
      children.push({
        _tag: "section",
        title: "Response",
        children: [{ _tag: "raw", content: formatResponseBody(responseBody, secrets).join("\n") }],
      });
    }
    children.push(...formatCause(error.cause, options, secrets));
  } else if (error.cause !== undefined && error.cause !== null) {
    children.push({ _tag: "paragraph", tone: "dim", text: "--debug shows the cause." });
  }

  const next = suggestionsNode(effectiveSuggestionsFor(error), secrets);
  return [
    {
      _tag: "callout",
      tone: "error",
      title,
      aside: problemAside(error.code),
      ...(children.length === 0 ? {} : { children }),
    },
    ...(next === undefined ? [] : [next]),
  ];
};

export const renderAppError = (
  error: AppError,
  options: { readonly verbose: boolean; readonly debug: boolean } = defaultRenderOptions,
): string => paintText(appErrorDoc(error, options), { width: 160, colors: false }).join("\n");
