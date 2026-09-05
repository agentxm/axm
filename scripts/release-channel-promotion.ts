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
  readonly artifacts: StableChannelDocumentV1["artifacts"];
  readonly credentials: () => {
    readonly bearerToken: string;
    readonly accessClientId: string;
    readonly accessClientSecret: string;
  };
}

export interface ReleaseChannelPromotionResult {
  readonly outcome: "promoted" | "already-current" | "newer-channel-retained";
  readonly document: StableChannelDocumentV1;
  readonly etag: string;
  readonly confirmation?: "public-readback";
  readonly submissionFailure?: string;
}

const requireStrongEtag = (response: Response): string => {
  const etag = response.headers.get("etag");
  if (etag === null || etag.startsWith("W/") || !/^"[^"\r\n]+"$/u.test(etag)) {
    throw new Error("The release channel response did not include a strong ETag.");
  }
  return etag;
};

const requireUntransformed = (response: Response, encoding: string): void => {
  const actual = response.headers.get("content-encoding")?.trim().toLowerCase();
  if (actual !== undefined && actual !== "identity") {
    throw new Error(`Stable channel representation for ${encoding} was transformed.`);
  }
};

const verifyStableChannelRepresentations = async (
  body: string,
  etag: string,
  fetchImplementation: typeof fetch,
): Promise<void> => {
  // Sequential reads compare one public object, not independent work. A
  // concurrent promotion invalidates the preflight; the caller must rerun.
  for (const encoding of ["gzip", "br", "zstd"]) {
    const response = await fetchImplementation(STABLE_CHANNEL_URL, {
      headers: { Accept: "application/json", "Accept-Encoding": encoding },
      cache: "no-store",
      signal: AbortSignal.timeout(30_000),
    });
    if (response.status !== 200) {
      throw new Error(
        `Stable channel read for ${encoding} failed with HTTP ${String(response.status)}.`,
      );
    }
    const representationEtag = requireStrongEtag(response);
    requireUntransformed(response, encoding);
    if (representationEtag !== etag || (await response.text()) !== body) {
      throw new Error(
        `Stable channel representation for ${encoding} was inconsistent; rerun the preflight.`,
      );
    }
  }
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

export const compareStableVersions = (left: string, right: string): number => {
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

const requireMatchingCandidate = (
  document: StableChannelDocumentV1,
  input: ReleaseChannelPromotionInput,
): void => {
  if (
    document.version !== input.version ||
    document.release.tag !== input.tag ||
    document.release.commit !== input.commit
  ) {
    throw new Error(
      "Release coordinate integrity conflict: channel does not match the requested release coordinate.",
    );
  }
  const expected = input.artifacts;
  const actual = document.artifacts;
  if (
    actual.checksumManifest.name !== expected.checksumManifest.name ||
    actual.checksumManifest.url !== expected.checksumManifest.url ||
    actual.checksumManifest.sha256 !== expected.checksumManifest.sha256 ||
    actual.binaries.length !== expected.binaries.length ||
    expected.binaries.some(
      (binary) =>
        !actual.binaries.some(
          (other) =>
            other.target === binary.target &&
            other.name === binary.name &&
            other.url === binary.url &&
            other.sha256 === binary.sha256,
        ),
    )
  ) {
    throw new Error(
      "Release artifact integrity conflict: channel descriptors differ from validated candidate assets.",
    );
  }
};

/** Promote a validated GitHub release coordinate through the Control API. */
export const promoteStableRelease = async (
  input: ReleaseChannelPromotionInput,
  fetchImplementation: typeof fetch = fetch,
): Promise<ReleaseChannelPromotionResult> => {
  validateCoordinate(input);

  const currentResponse = await fetchImplementation(STABLE_CHANNEL_URL, {
    headers: { Accept: "application/json", "Accept-Encoding": "identity" },
    cache: "no-store",
    signal: AbortSignal.timeout(30_000),
  });

  let precondition: Readonly<Record<string, string>>;
  if (currentResponse.status === 404) {
    precondition = { "If-None-Match": "*" };
  } else if (currentResponse.status === 200) {
    const identity = currentResponse.clone();
    const current = decodeStableChannelDocumentSync(await readJson(currentResponse));
    const etag = requireStrongEtag(currentResponse);
    if (compareStableVersions(current.version, input.version) > 0) {
      return { outcome: "newer-channel-retained", document: current, etag };
    }
    requireUntransformed(currentResponse, "identity");
    await verifyStableChannelRepresentations(await identity.text(), etag, fetchImplementation);
    if (compareStableVersions(current.version, input.version) === 0) {
      requireMatchingCandidate(current, input);
      return { outcome: "already-current", document: current, etag };
    }
    precondition = { "If-Match": etag };
  } else {
    throw new Error(`Stable channel read failed with HTTP ${String(currentResponse.status)}.`);
  }

  const credentials = input.credentials();
  let response: Response;
  try {
    response = await fetchImplementation(RELEASE_CHANNEL_CONTROL_URL, {
      method: "PUT",
      signal: AbortSignal.timeout(30_000),
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${credentials.bearerToken}`,
        "CF-Access-Client-Id": credentials.accessClientId,
        "CF-Access-Client-Secret": credentials.accessClientSecret,
        ...precondition,
      },
      body: JSON.stringify({ version: input.version, tag: input.tag, commit: input.commit }),
    });
  } catch (cause) {
    return reconcileSubmittedPromotion(input, fetchImplementation, cause);
  }
  if (response.status !== 200 && response.status !== 201) {
    const failure = new Error(
      `Stable channel promotion failed with HTTP ${String(response.status)}.`,
    );
    if (response.status >= 500)
      return reconcileSubmittedPromotion(input, fetchImplementation, failure);
    throw failure;
  }
  try {
    const responseCopy = response.clone();
    const document = await decodeControlDocument(response);
    const etag = requireStrongEtag(response);
    requireMatchingCandidate(document, input);
    const body: unknown = await responseCopy.json();
    const rawOutcome =
      body !== null && typeof body === "object" ? Reflect.get(body, "outcome") : undefined;
    return {
      outcome: rawOutcome === "already-current" ? "already-current" : "promoted",
      document,
      etag,
    };
  } catch (cause) {
    return reconcileSubmittedPromotion(input, fetchImplementation, cause);
  }
};

/** One bounded readback after submission; never retry the conditional mutation. */
const reconcileSubmittedPromotion = async (
  input: ReleaseChannelPromotionInput,
  fetchImplementation: typeof fetch,
  submissionFailure: unknown,
): Promise<ReleaseChannelPromotionResult> => {
  try {
    const response = await fetchImplementation(STABLE_CHANNEL_URL, {
      headers: { Accept: "application/json", "Accept-Encoding": "identity" },
      cache: "no-store",
      signal: AbortSignal.timeout(30_000),
    });
    if (response.status !== 200) throw new Error(`Readback HTTP ${String(response.status)}`);
    const etag = requireStrongEtag(response);
    requireUntransformed(response, "identity");
    const document = decodeStableChannelDocumentSync(await readJson(response));
    requireMatchingCandidate(document, input);
    return {
      outcome: "promoted",
      document,
      etag,
      confirmation: "public-readback",
      submissionFailure:
        submissionFailure instanceof Error
          ? submissionFailure.message
          : "Promotion transport failed",
    };
  } catch (readbackFailure) {
    throw new AggregateError(
      [submissionFailure, readbackFailure],
      "Stable promotion is incomplete/uncertain: submitted request could not be confirmed by public readback. No mutation retry was attempted.",
      { cause: readbackFailure },
    );
  }
};
