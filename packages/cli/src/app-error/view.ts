import type { SuggestedAction } from "@agentxm/registry-protocol/unstable/suggested-action";
import type { Doc, DocNode, Field } from "../screen/doc.js";
import { paintText } from "../screen/paint-text.js";
import { type AppError, effectiveSuggestionsFor } from "./app-error.js";
import { serializeErrorCauseChain } from "./cause-chain.js";
import {
  collectSensitiveStrings,
  redactSensitiveText,
  redactSensitiveValue,
  redactSuggestedAction,
} from "./secret-redaction.js";

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
    return redactSensitiveText(new URL(url).origin, { secrets });
  } catch {
    return redactSensitiveText(url, { secrets });
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
  return redactSensitiveText(
    request.method === undefined ? request.url : `${request.method} ${request.url}`,
    { secrets },
  );
};

const formatResponseBody = (
  body: unknown,
  secrets: ReadonlyArray<string>,
): ReadonlyArray<string> => {
  try {
    return JSON.stringify(redactSensitiveValue(body, { secrets }), null, 2).split("\n");
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
              text: `Stack: ${line}`,
            }) satisfies DocNode,
        ),
      ];
    }
    return lines;
  });
};

export const appErrorDoc = (
  error: AppError,
  options: { readonly verbose: boolean; readonly debug: boolean } = defaultRenderOptions,
): Doc => {
  const secrets = collectSensitiveStrings(error.metadata);
  const requestId = getRequestId(error);
  const registryUrl = getRegistryUrl(error);
  const fields: Array<Field> = [];
  const children: Array<DocNode> = [];

  if (registryUrl !== undefined) {
    fields.push({ label: "Registry:", value: formatRegistryLocation(registryUrl, secrets) });
  }

  if (options.verbose || options.debug) {
    fields.push({ label: "Title:", value: redactSensitiveText(error.title, { secrets }) });

    const registryRequest = formatRegistryRequest(error, secrets);
    if (registryRequest !== undefined) {
      fields.push({ label: "Request:", value: registryRequest });
    }

    if (requestId !== undefined) {
      fields.push({
        label: "Request ID:",
        value: redactSensitiveText(requestId, { secrets }),
      });
    }

    const responseBody = error.metadata?.response?.body;
    if (responseBody !== undefined) {
      children.push({
        _tag: "section",
        title: "Response:",
        children: [{ _tag: "raw", content: formatResponseBody(responseBody, secrets).join("\n") }],
      });
    }
  } else if (error.code === "internal" && requestId !== undefined) {
    fields.push({
      label: "Request ID:",
      value: redactSensitiveText(requestId, { secrets }),
    });
  }

  if (fields.length > 0) children.unshift({ _tag: "fields", fields });

  if (options.verbose || options.debug) {
    children.push(...formatCause(error.cause, options, secrets));
  } else if (error.cause !== undefined && error.cause !== null) {
    children.push({ _tag: "paragraph", text: "Run with `--debug` to see error details." });
  }

  const next = suggestionsNode(effectiveSuggestionsFor(error), secrets);
  if (next !== undefined) children.push(next);

  return [
    {
      _tag: "callout",
      tone: "error",
      title: `${redactSensitiveText(error.detail, { secrets })} (${error.code})`,
      ...(children.length === 0 ? {} : { children }),
    },
  ];
};

export const defectDoc = (error: unknown): Doc => {
  const children: Array<DocNode> = [
    {
      _tag: "paragraph",
      text: "This is a bug. Please report it at https://github.com/agentxm/axm/issues",
    },
  ];

  if (error instanceof Error) {
    children.push({ _tag: "paragraph", text: redactSensitiveText(error.message) });
  } else if (typeof error === "string") {
    children.push({ _tag: "paragraph", text: redactSensitiveText(error) });
  }

  return [{ _tag: "callout", tone: "error", title: "An unexpected error occurred", children }];
};

export const renderAppError = (
  error: AppError,
  options: { readonly verbose: boolean; readonly debug: boolean } = defaultRenderOptions,
): string => paintText(appErrorDoc(error, options), { width: 160, colors: false }).join("\n");

export const renderDefect = (error: unknown): string =>
  paintText(defectDoc(error), { width: 160, colors: false }).join("\n");
