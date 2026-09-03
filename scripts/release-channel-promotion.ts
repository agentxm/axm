import {
  STABLE_CHANNEL_URL,
  decodeStableChannelDocumentSync,
  type StableChannelDocumentV1,
} from "@agentxm/extension-model/unstable/release-channel";

export const RELEASE_CHANNEL_CONTROL_URL = "https://control.agentxm.ai/v1/releases/channels/stable";

export interface ReleaseChannelPromotionInput {
  readonly version: string;
  readonly tag: string;
  readonly commit: string;
  readonly bearerToken: string;
  readonly accessClientId: string;
  readonly accessClientSecret: string;
}

export interface ReleaseChannelPromotionResult {
  readonly outcome: "promoted" | "already-current" | "newer-channel-retained";
  readonly document: StableChannelDocumentV1;
  readonly etag: string;
}

const requireStrongEtag = (response: Response): string => {
  const etag = response.headers.get("etag");
  if (etag === null || etag.startsWith("W/") || !/^"[^"\r\n]+"$/u.test(etag)) {
    throw new Error("The release channel response did not include a strong ETag.");
  }
  return etag;
};

const readJson = async (response: Response): Promise<unknown> => {
  try {
    return await response.json();
  } catch (cause) {
    throw new Error("The release channel response was not valid JSON.", { cause });
  }
};

const decodeControlDocument = async (response: Response): Promise<StableChannelDocumentV1> => {
  const body = await readJson(response);
  if (body === null || typeof body !== "object") {
    throw new Error("The Control API response did not contain a document.");
  }
  return decodeStableChannelDocumentSync(Reflect.get(body, "document"));
};

const validateCoordinate = (input: ReleaseChannelPromotionInput): void => {
  if (
    !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/u.test(
      input.version,
    )
  ) {
    throw new Error(`Expected a normalized stable version, received ${input.version}.`);
  }
  if (input.tag !== `cli-v${input.version}`) {
    throw new Error(`Release tag must equal cli-v${input.version}.`);
  }
  if (!/^[0-9a-f]{40}$/u.test(input.commit)) {
    throw new Error("Release commit must be a lowercase 40-character Git object ID.");
  }
};

const stableParts = (version: string): readonly [bigint, bigint, bigint] => {
  const [major = "0", minor = "0", patchWithBuild = "0"] = version.split(".");
  const patch = patchWithBuild.split("+")[0] ?? "0";
  return [BigInt(major), BigInt(minor), BigInt(patch)];
};

const compareStableVersions = (left: string, right: string): number => {
  const leftParts = stableParts(left);
  const rightParts = stableParts(right);
  for (let index = 0; index < leftParts.length; index += 1) {
    const leftPart = leftParts[index] ?? 0n;
    const rightPart = rightParts[index] ?? 0n;
    if (leftPart > rightPart) return 1;
    if (leftPart < rightPart) return -1;
  }
  return 0;
};

/** Promote a validated GitHub release coordinate through the Control API. */
export const promoteStableRelease = async (
  input: ReleaseChannelPromotionInput,
  fetchImplementation: typeof fetch = fetch,
): Promise<ReleaseChannelPromotionResult> => {
  validateCoordinate(input);

  const currentResponse = await fetchImplementation(STABLE_CHANNEL_URL, {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });

  let precondition: Readonly<Record<string, string>>;
  if (currentResponse.status === 404) {
    precondition = { "If-None-Match": "*" };
  } else if (currentResponse.status === 200) {
    const current = decodeStableChannelDocumentSync(await readJson(currentResponse));
    const etag = requireStrongEtag(currentResponse);
    if (compareStableVersions(current.version, input.version) > 0) {
      return { outcome: "newer-channel-retained", document: current, etag };
    }
    precondition = { "If-Match": etag };
  } else {
    throw new Error(`Stable channel read failed with HTTP ${String(currentResponse.status)}.`);
  }

  const response = await fetchImplementation(RELEASE_CHANNEL_CONTROL_URL, {
    method: "PUT",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${input.bearerToken}`,
      "CF-Access-Client-Id": input.accessClientId,
      "CF-Access-Client-Secret": input.accessClientSecret,
      ...precondition,
    },
    body: JSON.stringify({
      version: input.version,
      tag: input.tag,
      commit: input.commit,
    }),
  });
  if (response.status !== 200 && response.status !== 201) {
    const body = await response.text();
    throw new Error(
      `Stable channel promotion failed with HTTP ${String(response.status)}: ${body.slice(0, 500)}`,
    );
  }

  const responseCopy = response.clone();
  const document = await decodeControlDocument(response);
  const etag = requireStrongEtag(response);
  if (
    document.version !== input.version ||
    document.release.tag !== input.tag ||
    document.release.commit !== input.commit
  ) {
    throw new Error("Control API readback did not match the requested release coordinate.");
  }
  const body = await responseCopy.json().catch(() => null);
  const rawOutcome =
    body !== null && typeof body === "object" ? Reflect.get(body, "outcome") : undefined;
  return {
    outcome: rawOutcome === "already-current" ? "already-current" : "promoted",
    document,
    etag,
  };
};
