#!/usr/bin/env bun
/**
 * Process entrypoint only.
 *
 * Keep this file trivial: shebang + delegate to app.run().
 * All command composition lives in app.ts.
 */
import { run } from "./app.js";

void run();
