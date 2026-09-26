import * as Option from "effect/Option";

export const refFromFragment = (fragment: string): Option.Option<string> => {
  const raw = fragment.startsWith("#") ? fragment.slice(1) : fragment;
  if (raw.length === 0) return Option.none();
  try {
    return Option.some(decodeURIComponent(raw));
  } catch {
    return Option.some(raw);
  }
};

export const refFromUrlHash = (url: URL): Option.Option<string> => refFromFragment(url.hash);

export const stripUrlHash = (url: URL): URL => {
  const clean = new URL(url.href);
  clean.hash = "";
  return clean;
};
