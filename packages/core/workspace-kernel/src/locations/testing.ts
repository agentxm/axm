/** Native host capabilities for filesystem integration tests, without path-spelling overrides. */
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Layer from "effect/Layer";

import { NativeEntryRemovalLive } from "./live.js";

export const NativePlatformTest = Layer.merge(NodeServices.layer, NativeEntryRemovalLive);
