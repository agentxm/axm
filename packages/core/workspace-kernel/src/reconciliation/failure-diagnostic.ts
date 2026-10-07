import {
  RegistryOperationFailed,
  RegistryProblem,
  RegistryRequestFailed,
  type RegistryErrorMetadata,
} from "@agentxm/registry-client";
import { type FailureDiagnostic } from "../operations/index.js";

/** An explicit projection of protocol evidence, never a spread of local metadata. */
export const registryFailureDiagnostic = (
  error: RegistryProblem | RegistryRequestFailed | RegistryOperationFailed,
): FailureDiagnostic => {
  const metadata: RegistryErrorMetadata | undefined = error.metadata;
  const response = metadata?.response;
  const requestId = response?.requestId ?? metadata?.request?.requestId;
  const status = response?.status;
  const validRequestId =
    requestId !== undefined &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u.test(requestId)
      ? requestId
      : undefined;
  const validStatus =
    status !== undefined && Number.isInteger(status) && status >= 100 && status <= 599
      ? status
      : undefined;
  const attempts = metadata?.requestPolicy?.attemptCount;
  const kind =
    error instanceof RegistryRequestFailed
      ? `registry.${error.reason ?? "request-unclassified"}`
      : error instanceof RegistryProblem
        ? `registry.problem.${error.category.replaceAll("_", "-")}`
        : `registry.operation.${error.category.replaceAll("_", "-")}`;
  return {
    kind,
    operation: registryOperation(metadata?.request?.operation),
    ...(metadata?.request === undefined && response === undefined && attempts === undefined
      ? {}
      : {
          request: {
            service: "registry",
            ...(validRequestId === undefined ? {} : { requestId: validRequestId }),
            ...(validStatus === undefined ? {} : { status: validStatus }),
            ...(attempts !== undefined && Number.isSafeInteger(attempts) && attempts > 0
              ? { attemptCount: attempts }
              : {}),
          },
        }),
  };
};

/** Only named operations authored by the Registry client become diagnostic context. */
const registryOperation = (operation: string | undefined): string => {
  switch (operation) {
    case "publish extension version":
      return "publish.upload";
    case "preview extension publishes":
      return "publish.preflight";
    case "download package archive":
      return "registry.download";
    case "get extension index":
      return "registry.index";
    case "get exact extension version":
      return "registry.version";
    case "read resolution metadata":
      return "registry.resolution-metadata";
    case "get package index":
      return "registry.package-index";
    case "check extension":
      return "registry.verification";
    case "update extension visibility":
      return "publish.visibility";
    case "get extension visibility":
      return "registry.visibility";
    case "discover packages":
      return "registry.discovery";
    case "list owner extensions":
    case "list owner extensions by type":
      return "registry.owner-extensions";
    case "get owner":
      return "registry.owner";
    default:
      return "registry.request";
  }
};
