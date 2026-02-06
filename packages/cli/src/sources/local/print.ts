import type { LocalSource } from "../types.js";

export const print = (source: LocalSource) => `local:${source.path}`;
