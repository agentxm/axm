import { parseArgs } from "@std/cli";

import {
  CHARITIES_DISCLAIMER,
  type Charity,
  filterCharitiesByFocus,
  findCharityBySlug,
} from "./charities.ts";
import {
  createPawMatchFlags,
  FLAG_DONATE_FOCUS_DEFAULT,
  FLAG_FEE_BREAKDOWN_DETAILED,
  FLAG_HOME_CHECK_FOLLOWUP,
  FLAG_LONG_STAY_HIGHLIGHT,
  FLAG_MATCH_QUIZ_DEPTH,
  FLAG_PET_CARD_STYLE,
  FLAG_RECOMMENDATION_STRATEGY,
  FLAG_SHOW_CHARITY_RATINGS,
  FLAG_SUGGEST_DONATE_AFTER_ADOPTION,
} from "./flags.ts";
import { activeFlagSet, isEmpty, type MatchPreferences } from "./match_preferences.ts";
import { ALL_PETS, filterPetsBySpecies, findPetBySlug, isLongStay, type Pet } from "./pets.ts";
import {
  type MatchDepth,
  parseDonateFocus,
  parseMatchDepth,
  parseMatchStrategy,
  parsePetCardStyle,
  type PetCardStyle,
} from "./variants.ts";
import type { TinyFlagsClient } from "@agentxm/example-tinyflags";

const ALL_FACTORS: ReadonlyArray<{ flag: string; tags: readonly string[] }> = Object.freeze([
  { flag: "has-kids", tags: ["good-with-kids", "gentle"] },
  { flag: "quiet-home", tags: ["mellow", "calm", "solo", "lap-cat"] },
  { flag: "active", tags: ["high-energy", "playful"] },
  { flag: "first-time", tags: ["gentle", "calm", "low-energy"] },
  { flag: "multiple-pets", tags: ["social"] },
  { flag: "small-home", tags: ["lap-cat", "solo", "low-energy"] },
]);

const POPULARITY_TAGS = new Set(["social", "good-with-kids", "calm", "mellow", "gentle"]);

export interface PawMatchCliOptions {
  readonly flags?: TinyFlagsClient;
  readonly context?: { sessionId?: string };
  readonly out?: { write(chunk: Uint8Array): number | Promise<number> };
  readonly err?: { write(chunk: Uint8Array): number | Promise<number> };
  readonly openUrl?: (url: string) => number;
}

const encoder = new TextEncoder();

export class PawMatchCli {
  readonly flags: TinyFlagsClient;
  readonly context: { sessionId?: string };
  readonly out: { write(chunk: Uint8Array): number | Promise<number> };
  readonly err: { write(chunk: Uint8Array): number | Promise<number> };
  readonly openUrl: (url: string) => number;

  constructor(options: PawMatchCliOptions = {}) {
    this.flags = options.flags ?? createPawMatchFlags();
    this.context = options.context ?? { sessionId: defaultSessionId() };
    this.out = options.out ?? Deno.stdout;
    this.err = options.err ?? Deno.stderr;
    this.openUrl = options.openUrl ?? defaultOpenUrl;
  }

  run(argv: readonly string[]): number {
    if (argv.length === 0 || argv[0] === "--help" || argv[0] === "-h") {
      this.printHelp();
      return 0;
    }

    const [command, ...rest] = argv;
    switch (command) {
      case "browse":
        return this.runBrowse(rest);
      case "show":
        return this.runShow(rest);
      case "match":
        return this.runMatch(rest);
      case "apply":
        return this.runApply(rest);
      case "fees":
        return this.fees();
      case "return-support":
        return this.returnSupport();
      case "donate":
        return this.runDonate(rest);
      default:
        this.writeLine(this.err, `Unknown command '${command}'.`);
        this.printHelp();
        return 1;
    }
  }

  private runBrowse(args: readonly string[]): number {
    const parsed = parseArgs(args as string[], { string: ["species"] });
    const species = typeof parsed.species === "string" ? parsed.species : undefined;
    return this.browse(species);
  }

  private runShow(args: readonly string[]): number {
    const slug = args[0];
    if (slug === undefined) {
      this.writeLine(this.err, "Usage: pawmatch show <pet>");
      return 1;
    }
    return this.show(slug);
  }

  private runMatch(args: readonly string[]): number {
    const parsed = parseArgs(args as string[], {
      boolean: ["has-kids", "quiet-home", "active", "first-time", "multiple-pets", "small-home"],
    });
    return this.match({
      hasKids: parsed["has-kids"] === true,
      quietHome: parsed["quiet-home"] === true,
      active: parsed.active === true,
      firstTime: parsed["first-time"] === true,
      multiplePets: parsed["multiple-pets"] === true,
      smallHome: parsed["small-home"] === true,
    });
  }

  private runApply(args: readonly string[]): number {
    const slug = args[0];
    if (slug === undefined) {
      this.writeLine(this.err, "Usage: pawmatch apply <pet>");
      return 1;
    }
    return this.apply(slug);
  }

  private runDonate(args: readonly string[]): number {
    const parsed = parseArgs(args as string[], {
      string: ["focus"],
      boolean: ["open"],
    });
    const positional = parsed._;
    const slug = positional.length > 0 ? String(positional[0]) : undefined;
    const focus = typeof parsed.focus === "string" ? parsed.focus : undefined;
    const open = parsed.open === true;
    return this.donate(slug, focus, open);
  }

  browse(species: string | undefined): number {
    const pets = filterPetsBySpecies(species);
    if (pets.length === 0) {
      this.writeLine(this.out, `No adoptable pets found for species '${species}'.`);
      return 0;
    }

    if (this.flags.enabled(FLAG_LONG_STAY_HIGHLIGHT, this.context)) {
      const longStay = [...pets]
        .filter(isLongStay)
        .sort((a, b) => b.daysInShelter - a.daysInShelter)[0];
      if (longStay !== undefined) {
        this.writeLine(this.out, `★ Featured long-stay friend — please consider ${longStay.name}!`);
        this.writeLine(this.out, "");
      }
    }

    const style = parsePetCardStyle(this.flags.variant(FLAG_PET_CARD_STYLE, this.context));
    for (const pet of pets) {
      this.renderPet(pet, style);
    }
    return 0;
  }

  show(slug: string): number {
    const pet = findPetBySlug(slug);
    if (pet === undefined) {
      this.writeLine(this.err, `Unknown pet '${slug}'. Try 'pawmatch browse'.`);
      return 1;
    }

    this.renderPet(pet, "detailed");
    this.writeLine(this.out, `  Needs: ${pet.needs}`);
    this.writeLine(
      this.out,
      `  Days in shelter: ${pet.daysInShelter}${isLongStay(pet) ? " (long-stay)" : ""}`,
    );
    return 0;
  }

  match(preferences: MatchPreferences): number {
    const strategy = parseMatchStrategy(
      this.flags.variant(FLAG_RECOMMENDATION_STRATEGY, this.context),
    );
    const depth = parseMatchDepth(this.flags.variant(FLAG_MATCH_QUIZ_DEPTH, this.context));
    const factors = factorsForDepth(depth);
    const userFlags = activeFlagSet(preferences);
    const wants = new Set<string>();
    for (const factor of factors) {
      if (!userFlags.has(factor.flag)) continue;
      for (const tag of factor.tags) wants.add(tag);
    }

    this.writeLine(
      this.out,
      `Strategy: ${strategy} • Quiz depth: ${depth} (${factors.length} factor(s) considered)`,
    );
    if (isEmpty(preferences)) {
      this.writeLine(
        this.out,
        "(no preference flags provided — try --has-kids --quiet-home --active --first-time)",
      );
    }
    this.writeLine(this.out, "");

    const ranked = [...ALL_PETS];
    if (strategy === "popularity") {
      ranked.sort(
        (a, b) =>
          countTagMatches(b.tags, POPULARITY_TAGS) - countTagMatches(a.tags, POPULARITY_TAGS),
      );
    } else if (strategy === "longest-stay") {
      ranked.sort((a, b) => b.daysInShelter - a.daysInShelter);
    } else {
      ranked.sort((a, b) => countTagMatches(b.tags, wants) - countTagMatches(a.tags, wants));
    }

    for (const pet of ranked.slice(0, 3)) {
      this.writeLine(
        this.out,
        `  • ${pet.name} (${pet.breed}, ${pet.ageYears}y) — ${pet.tags.join(", ")}`,
      );
    }

    this.writeLine(this.out, "");
    this.writeLine(
      this.out,
      "Adoption is a conversation — book a meet-and-greet to see if it's a fit.",
    );
    return 0;
  }

  apply(slug: string): number {
    const pet = findPetBySlug(slug);
    if (pet === undefined) {
      this.writeLine(this.err, `Unknown pet '${slug}'. Try 'pawmatch browse'.`);
      return 1;
    }

    this.writeLine(this.out, `Adoption application for ${pet.name}`);
    this.writeLine(this.out, "");
    this.writeLine(this.out, "Next steps:");
    this.writeLine(this.out, "  1. Application reviewed by an adoption counselor (1–2 days).");
    this.writeLine(this.out, "  2. Meet-and-greet scheduled at the shelter.");
    this.writeLine(this.out, "  3. 48-hour reflection period before finalizing.");
    this.writeLine(
      this.out,
      "  4. Take-home day — fees cover spay/neuter, vaccines, and microchip.",
    );

    if (this.flags.enabled(FLAG_HOME_CHECK_FOLLOWUP, this.context)) {
      this.writeLine(
        this.out,
        "  5. Two-week follow-up check from a counselor to see how you're settling in.",
      );
    }

    this.writeLine(this.out, "");
    this.writeLine(this.out, "Returns are always accepted, no questions asked.");

    if (this.flags.enabled(FLAG_SUGGEST_DONATE_AFTER_ADOPTION, this.context)) {
      this.writeLine(this.out, "");
      this.writeLine(
        this.out,
        `If ${pet.name} brings you joy, please consider donating to a shelter:`,
      );
      this.writeLine(this.out, "  pawmatch donate");
    }
    return 0;
  }

  fees(): number {
    this.writeLine(this.out, "Adoption fees");
    this.writeLine(this.out, "");
    if (this.flags.enabled(FLAG_FEE_BREAKDOWN_DETAILED, this.context)) {
      this.writeLine(this.out, "  Dog adoption — $150 total:");
      this.writeLine(this.out, "    $60   spay / neuter surgery");
      this.writeLine(this.out, "    $45   core vaccinations");
      this.writeLine(this.out, "    $25   microchip and registration");
      this.writeLine(this.out, "    $20   intake exam and deworming");
      this.writeLine(this.out, "");
      this.writeLine(this.out, "  Cat adoption — $90 total:");
      this.writeLine(this.out, "    $50   spay / neuter surgery");
      this.writeLine(this.out, "    $25   core vaccinations");
      this.writeLine(this.out, "    $15   microchip and registration");
      this.writeLine(this.out, "");
      this.writeLine(this.out, "  Small animal — $35 total (intake exam + microchip).");
    } else {
      this.writeLine(this.out, "  Dog adoption           $150");
      this.writeLine(this.out, "  Cat adoption            $90");
      this.writeLine(this.out, "  Small animal            $35");
      this.writeLine(this.out, "");
      this.writeLine(this.out, "  Fees cover spay/neuter, vaccines, and microchip.");
    }

    this.writeLine(this.out, "");
    this.writeLine(
      this.out,
      "No one is turned away for inability to pay — ask about our subsidy fund.",
    );
    return 0;
  }

  returnSupport(): number {
    this.writeLine(this.out, "Return support");
    this.writeLine(this.out, "");
    this.writeLine(this.out, "If your adoption isn't working out, we're here to help.");
    this.writeLine(this.out, "  • Free behavior consultation with our trainers.");
    this.writeLine(this.out, "  • No-judgment returns at any time — your pet stays in our care.");
    this.writeLine(this.out, "  • Connections to low-cost vet and food assistance programs.");
    this.writeLine(this.out, "");
    this.writeLine(
      this.out,
      "Returning a pet is not a failure. Reach out as soon as you'd like support.",
    );
    return 0;
  }

  donate(
    charitySlug: string | undefined,
    focusOverride: string | undefined,
    open: boolean,
  ): number {
    const defaultFocus = parseDonateFocus(
      this.flags.variant(FLAG_DONATE_FOCUS_DEFAULT, this.context),
    );
    const focus = focusOverride ?? defaultFocus;
    const showRatings = this.flags.enabled(FLAG_SHOW_CHARITY_RATINGS, this.context);

    if (charitySlug !== undefined) {
      const charity = findCharityBySlug(charitySlug);
      if (charity === undefined) {
        this.writeLine(this.err, `Unknown charity '${charitySlug}'.`);
        return 1;
      }

      if (open) {
        return this.openUrl(charity.url);
      }

      this.renderCharity(charity, showRatings);
      return 0;
    }

    const list = filterCharitiesByFocus(focus);
    this.writeLine(this.out, `Animal-welfare charities (focus: ${focus})`);
    this.writeLine(this.out, "");
    for (const charity of list) {
      this.renderCharity(charity, showRatings);
      this.writeLine(this.out, "");
    }

    this.writeLine(this.out, CHARITIES_DISCLAIMER);
    if (!showRatings) {
      this.writeLine(this.out, "Ratings hidden — set show-charity-ratings to surface them inline.");
    }
    return 0;
  }

  private renderPet(pet: Pet, style: PetCardStyle): void {
    const longStayBadge = isLongStay(pet) ? " ★" : "";
    if (style === "compact") {
      this.writeLine(
        this.out,
        `  ${padRight(pet.slug, 10)} ${padRight(pet.name, 14)} ${padRight(pet.species, 10)} ${pet.ageYears}y${longStayBadge}`,
      );
    } else if (style === "playful") {
      this.writeLine(
        this.out,
        `  \u{1F43E} ${pet.name}${longStayBadge} — a ${pet.ageYears}-year-old ${pet.breed.toLowerCase()} who is ${pet.tags.join(" & ")}.`,
      );
    } else {
      this.writeLine(this.out, `  ${pet.name}${longStayBadge}  [${pet.slug}]`);
      this.writeLine(this.out, `    ${pet.breed}, ${pet.ageYears} years old`);
      this.writeLine(this.out, `    Tags: ${pet.tags.join(", ")}`);
      this.writeLine(this.out, "");
    }
  }

  private renderCharity(charity: Charity, showRatings: boolean): void {
    this.writeLine(this.out, `  ${charity.name}  [${charity.slug}]`);
    this.writeLine(this.out, `    Focus: ${charity.focus}`);
    this.writeLine(this.out, `    ${charity.description}`);
    this.writeLine(this.out, `    Donate: ${charity.url}`);
    if (showRatings) {
      this.writeLine(this.out, `    Rating: ${charity.ratingNote}`);
    }
  }

  private writeLine(
    stream: { write(chunk: Uint8Array): number | Promise<number> },
    text: string,
  ): void {
    stream.write(encoder.encode(`${text}\n`));
  }

  private printHelp(): void {
    this.writeLine(this.out, "pawmatch — community pet adoption CLI");
    this.writeLine(this.out, "");
    this.writeLine(this.out, "Commands:");
    this.writeLine(this.out, "  browse [--species <species>]   List adoptable pets.");
    this.writeLine(this.out, "  show <pet>                     Show details for a pet.");
    this.writeLine(this.out, "  match [--has-kids ...]         Match pets to your lifestyle.");
    this.writeLine(this.out, "  apply <pet>                    Start an adoption application.");
    this.writeLine(this.out, "  fees                           Show adoption fees.");
    this.writeLine(this.out, "  return-support                 Return support information.");
    this.writeLine(this.out, "  donate [slug] [--focus <f>] [--open]");
    this.writeLine(this.out, "                                 Browse or open a charity link.");
  }
}

function factorsForDepth(depth: MatchDepth): readonly { flag: string; tags: readonly string[] }[] {
  const take = depth === "short" ? 2 : depth === "thorough" ? 6 : 4;
  return ALL_FACTORS.slice(0, take);
}

function countTagMatches(tags: readonly string[], target: Set<string>): number {
  let count = 0;
  for (const tag of tags) if (target.has(tag)) count += 1;
  return count;
}

function padRight(value: string, width: number): string {
  return value.length >= width ? value : value + " ".repeat(width - value.length);
}

function defaultSessionId(): string {
  return Deno.env.get("USER") ?? Deno.env.get("USERNAME") ?? Deno.env.get("LOGNAME") ?? "anonymous";
}

function defaultOpenUrl(url: string): number {
  try {
    const platform = Deno.build.os;
    let command: string;
    let args: readonly string[];
    if (platform === "darwin") {
      command = "open";
      args = [url];
    } else if (platform === "windows") {
      command = "cmd";
      args = ["/c", "start", "", url];
    } else {
      command = "xdg-open";
      args = [url];
    }
    const cmd = new Deno.Command(command, { args: [...args], stdout: "null", stderr: "null" });
    cmd.spawn();
    return 0;
  } catch (error) {
    const name = error instanceof Error ? error.constructor.name : "Error";
    const message = `Unable to open browser (${name}). URL: ${url}\n`;
    Deno.stderr.write(encoder.encode(message));
    return 1;
  }
}
