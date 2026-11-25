export type GitHubRun = {
  databaseId: number;
  event: string;
  headSha: string;
  number: number;
  status: string;
  conclusion: string | null;
  url: string;
  workflowName: string;
};

export type VerifiedGitHubRun = GitHubRun & { readonly attempt: number };

export type GitHubArtifact = {
  readonly id: number;
  readonly name: string;
  readonly digest: string;
};

const isRecord = (value: unknown): value is Record<PropertyKey, unknown> =>
  value != null && typeof value === "object";

export const parseGitHubRuns = (value: string): GitHubRun[] => {
  const parsed: unknown = JSON.parse(value);
  if (!Array.isArray(parsed)) {
    throw new Error("Unexpected gh run list response.");
  }

  return parsed.flatMap((item: unknown) => {
    if (!isRecord(item)) {
      return [];
    }

    const databaseId = Reflect.get(item, "databaseId");
    const event = Reflect.get(item, "event");
    const headSha = Reflect.get(item, "headSha");
    const number = Reflect.get(item, "number");
    const status = Reflect.get(item, "status");
    const conclusion = Reflect.get(item, "conclusion");
    const url = Reflect.get(item, "url");
    const workflowName = Reflect.get(item, "workflowName");

    if (
      typeof databaseId === "number" &&
      typeof event === "string" &&
      typeof headSha === "string" &&
      typeof number === "number" &&
      typeof status === "string" &&
      (typeof conclusion === "string" || conclusion === null) &&
      typeof url === "string" &&
      typeof workflowName === "string"
    ) {
      return [{ databaseId, event, headSha, number, status, conclusion, url, workflowName }];
    }

    return [];
  });
};

export const validateCiRunDetails = (value: unknown, expected: GitHubRun): VerifiedGitHubRun => {
  if (!isRecord(value)) throw new Error("Unexpected GitHub Actions run response.");
  const attempt = Reflect.get(value, "run_attempt");
  if (
    Reflect.get(value, "id") !== expected.databaseId ||
    Reflect.get(value, "head_sha") !== expected.headSha ||
    Reflect.get(value, "path") !== ".github/workflows/ci.yml" ||
    Reflect.get(value, "status") !== "completed" ||
    Reflect.get(value, "conclusion") !== "success" ||
    Reflect.get(value, "event") !== expected.event ||
    typeof attempt !== "number" ||
    !Number.isInteger(attempt) ||
    attempt < 1
  )
    throw new Error(`CI run provenance does not match its selected producer: ${expected.url}`);
  if (expected.event !== "push" && expected.event !== "workflow_dispatch")
    throw new Error(`CI run event ${expected.event} is not an eligible release producer.`);
  return { ...expected, attempt };
};

export const validateExactCiRunDetails = (
  value: unknown,
  expected: { readonly databaseId: number; readonly headSha: string; readonly event: string },
): VerifiedGitHubRun => {
  if (!isRecord(value)) throw new Error("Unexpected GitHub Actions run response.");
  const number = Reflect.get(value, "run_number");
  const status = Reflect.get(value, "status");
  const conclusion = Reflect.get(value, "conclusion");
  const url = Reflect.get(value, "html_url");
  const workflowName = Reflect.get(value, "name");
  if (
    typeof number !== "number" ||
    typeof status !== "string" ||
    (typeof conclusion !== "string" && conclusion !== null) ||
    typeof url !== "string" ||
    typeof workflowName !== "string"
  )
    throw new Error("Unexpected GitHub Actions run response.");

  return validateCiRunDetails(value, {
    databaseId: expected.databaseId,
    event: expected.event,
    headSha: expected.headSha,
    number,
    status,
    conclusion,
    url,
    workflowName,
  });
};

export const parseCiArtifacts = (
  value: unknown,
  run: VerifiedGitHubRun,
): ReadonlyArray<GitHubArtifact> => {
  const pages = Array.isArray(value) ? value : [value];
  return pages.flatMap((page: unknown) => {
    if (!isRecord(page) || !Array.isArray(page["artifacts"]))
      throw new Error("Unexpected GitHub Actions artifacts response.");
    return page["artifacts"].map((artifact: unknown) => {
      if (!isRecord(artifact)) throw new Error("Unexpected GitHub Actions artifact entry.");
      const workflowRun = artifact["workflow_run"];
      const id = artifact["id"];
      const name = artifact["name"];
      const digest = artifact["digest"];
      if (
        !isRecord(workflowRun) ||
        workflowRun["id"] !== run.databaseId ||
        workflowRun["head_sha"] !== run.headSha ||
        artifact["expired"] !== false ||
        typeof id !== "number" ||
        typeof name !== "string" ||
        typeof digest !== "string" ||
        !digest.startsWith("sha256:")
      )
        throw new Error(`Artifact provenance is incomplete for CI run ${run.url}.`);
      return { id, name, digest };
    });
  });
};
