/**
 * The application-supplied conversion from typed failures to the diagnostic
 * sentences inspection results embed as `reason` text. Error rendering is
 * application-owned: the CLI implements this with the same dispatcher it uses
 * at its output boundary, so reasons inside assessments stay byte-identical
 * with rendered errors. The feature keeps only the requirement, never the
 * mapping.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as ServiceMap from "effect/Context";

export interface InspectionFailureAdapterService {
  /** Render a failure as the diagnostic sentence an assessment reports. */
  readonly describeFailure: (failure: unknown) => string;
}

export class InspectionFailureAdapter extends ServiceMap.Service<
  InspectionFailureAdapter,
  InspectionFailureAdapterService
>()("@agentxm/workspace-inspection/failure-adapter/InspectionFailureAdapter") {}
