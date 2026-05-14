// @ts-check

import { spawn } from "node:child_process";
import { Command } from "commander";

import { CHARITIES_DISCLAIMER, filterCharitiesByFocus, findCharityBySlug } from "./charities.js";
import {
  FLAG_DONATE_FOCUS_DEFAULT,
  FLAG_FEE_BREAKDOWN_DETAILED,
  FLAG_HOME_CHECK_FOLLOWUP,
  FLAG_LONG_STAY_HIGHLIGHT,
  FLAG_MATCH_QUIZ_DEPTH,
  FLAG_PET_CARD_STYLE,
  FLAG_RECOMMENDATION_STRATEGY,
  FLAG_SHOW_CHARITY_RATINGS,
  FLAG_SUGGEST_DONATE_AFTER_ADOPTION,
  createPawMatchFlags,
} from "./flags.js";
import { activeFlagSet, isEmpty } from "./match-preferences.js";
import { ALL_PETS, filterPetsBySpecies, findPetBySlug, isLongStay } from "./pets.js";
import {
  parseDonateFocus,
  parseMatchDepth,
  parseMatchStrategy,
  parsePetCardStyle,
} from "./variants.js";

/**
 * @typedef {import("./pets.js").Pet} Pet
 * @typedef {import("./charities.js").Charity} Charity
 * @typedef {import("./match-preferences.js").MatchPreferences} MatchPreferences
 * @typedef {import("./variants.js").PetCardStyle} PetCardStyle
 */

/** @type {readonly { flag: string, tags: readonly string[] }[]} */
const ALL_FACTORS = Object.freeze([
  { flag: "has-kids", tags: ["good-with-kids", "gentle"] },
  { flag: "quiet-home", tags: ["mellow", "calm", "solo", "lap-cat"] },
  { flag: "active", tags: ["high-energy", "playful"] },
  { flag: "first-time", tags: ["gentle", "calm", "low-energy"] },
  { flag: "multiple-pets", tags: ["social"] },
  { flag: "small-home", tags: ["lap-cat", "solo", "low-energy"] },
]);

const POPULARITY_TAGS = new Set(["social", "good-with-kids", "calm", "mellow", "gentle"]);

/**
 * @typedef {object} PawMatchCliOptions
 * @property {ReturnType<typeof createPawMatchFlags>} [flags]
 * @property {{ sessionId?: string }} [context]
 * @property {NodeJS.WritableStream} [out]
 * @property {NodeJS.WritableStream} [err]
 */

export class PawMatchCli {
  /** @param {PawMatchCliOptions} [options] */
  constructor(options = {}) {
    this.flags = options.flags ?? createPawMatchFlags();
    this.context = options.context ?? { sessionId: defaultSessionId() };
    this.out = options.out ?? process.stdout;
    this.err = options.err ?? process.stderr;
  }

  /** @returns {Command} */
  buildRootCommand() {
    const program = new Command("pawmatch");
    program.description("pawmatch — community pet adoption CLI.").exitOverride();

    program
      .command("browse")
      .description("Browse adoptable pets.")
      .option("--species <species>", "Filter by species (dog|cat|rabbit|guinea-pig).")
      .action((options) => {
        const code = this.browse(options.species);
        if (code !== 0) throw new ExitError(code);
      });

    program
      .command("show <pet>")
      .description("Show details for a pet.")
      .action((slug) => {
        const code = this.show(slug);
        if (code !== 0) throw new ExitError(code);
      });

    program
      .command("match")
      .description("Match pets to your lifestyle.")
      .option("--has-kids", "Family with children.")
      .option("--quiet-home", "Quiet, calm household.")
      .option("--active", "Active, outdoor lifestyle.")
      .option("--first-time", "First-time pet adopter.")
      .option("--multiple-pets", "Other pets at home.")
      .option("--small-home", "Small home or apartment.")
      .action((options) => {
        const code = this.match({
          hasKids: options.hasKids === true,
          quietHome: options.quietHome === true,
          active: options.active === true,
          firstTime: options.firstTime === true,
          multiplePets: options.multiplePets === true,
          smallHome: options.smallHome === true,
        });
        if (code !== 0) throw new ExitError(code);
      });

    program
      .command("apply <pet>")
      .description("Start an adoption application.")
      .action((slug) => {
        const code = this.apply(slug);
        if (code !== 0) throw new ExitError(code);
      });

    program
      .command("fees")
      .description("Show adoption fees.")
      .action(() => {
        const code = this.fees();
        if (code !== 0) throw new ExitError(code);
      });

    program
      .command("return-support")
      .description("Return support information.")
      .action(() => {
        const code = this.returnSupport();
        if (code !== 0) throw new ExitError(code);
      });

    program
      .command("donate [charity]")
      .description("Browse animal-welfare charities to support.")
      .option("--focus <focus>", "Charity focus (all|shelters|rescue|policy).")
      .option("--open", "Open the charity's donation URL in a browser.")
      .action((charity, options) => {
        const code = this.donate(charity, options.focus, options.open === true);
        if (code !== 0) throw new ExitError(code);
      });

    return program;
  }

  /**
   * @param {string | undefined} species
   * @returns {number}
   */
  browse(species) {
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

  /**
   * @param {string} slug
   * @returns {number}
   */
  show(slug) {
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

  /**
   * @param {MatchPreferences} preferences
   * @returns {number}
   */
  match(preferences) {
    const strategy = parseMatchStrategy(
      this.flags.variant(FLAG_RECOMMENDATION_STRATEGY, this.context),
    );
    const depth = parseMatchDepth(this.flags.variant(FLAG_MATCH_QUIZ_DEPTH, this.context));
    const factors = factorsForDepth(depth);
    const userFlags = activeFlagSet(preferences);
    /** @type {Set<string>} */
    const wants = new Set();
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

  /**
   * @param {string} slug
   * @returns {number}
   */
  apply(slug) {
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

  /** @returns {number} */
  fees() {
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

  /** @returns {number} */
  returnSupport() {
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

  /**
   * @param {string | undefined} charitySlug
   * @param {string | undefined} focusOverride
   * @param {boolean} open
   * @returns {number}
   */
  donate(charitySlug, focusOverride, open) {
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

  /**
   * @param {Pet} pet
   * @param {PetCardStyle} style
   */
  renderPet(pet, style) {
    const longStayBadge = isLongStay(pet) ? " ★" : "";
    if (style === "compact") {
      this.writeLine(
        this.out,
        `  ${padRight(pet.slug, 10)} ${padRight(pet.name, 14)} ${padRight(pet.species, 10)} ${pet.ageYears}y${longStayBadge}`,
      );
    } else if (style === "playful") {
      this.writeLine(
        this.out,
        `  🐾 ${pet.name}${longStayBadge} — a ${pet.ageYears}-year-old ${pet.breed.toLowerCase()} who is ${pet.tags.join(" & ")}.`,
      );
    } else {
      this.writeLine(this.out, `  ${pet.name}${longStayBadge}  [${pet.slug}]`);
      this.writeLine(this.out, `    ${pet.breed}, ${pet.ageYears} years old`);
      this.writeLine(this.out, `    Tags: ${pet.tags.join(", ")}`);
      this.writeLine(this.out, "");
    }
  }

  /**
   * @param {Charity} charity
   * @param {boolean} showRatings
   */
  renderCharity(charity, showRatings) {
    this.writeLine(this.out, `  ${charity.name}  [${charity.slug}]`);
    this.writeLine(this.out, `    Focus: ${charity.focus}`);
    this.writeLine(this.out, `    ${charity.description}`);
    this.writeLine(this.out, `    Donate: ${charity.url}`);
    if (showRatings) {
      this.writeLine(this.out, `    Rating: ${charity.ratingNote}`);
    }
  }

  /**
   * @param {string} url
   * @returns {number}
   */
  openUrl(url) {
    try {
      const platform = process.platform;
      /** @type {string} */
      let command;
      /** @type {readonly string[]} */
      let args;
      if (platform === "darwin") {
        command = "open";
        args = [url];
      } else if (platform === "win32") {
        command = "cmd";
        args = ["/c", "start", "", url];
      } else {
        command = "xdg-open";
        args = [url];
      }
      const child = spawn(command, [...args], { stdio: "ignore", detached: true });
      child.unref();
      return 0;
    } catch (error) {
      const name = error instanceof Error ? error.constructor.name : "Error";
      this.writeLine(this.err, `Unable to open browser (${name}). URL: ${url}`);
      return 1;
    }
  }

  /**
   * @param {NodeJS.WritableStream} stream
   * @param {string} text
   */
  writeLine(stream, text) {
    stream.write(`${text}\n`);
  }
}

/**
 * @param {import("./variants.js").MatchDepth} depth
 * @returns {readonly { flag: string, tags: readonly string[] }[]}
 */
function factorsForDepth(depth) {
  const take = depth === "short" ? 2 : depth === "thorough" ? 6 : 4;
  return ALL_FACTORS.slice(0, take);
}

/**
 * @param {readonly string[]} tags
 * @param {Set<string>} target
 * @returns {number}
 */
function countTagMatches(tags, target) {
  let count = 0;
  for (const tag of tags) if (target.has(tag)) count += 1;
  return count;
}

/**
 * @param {string} value
 * @param {number} width
 * @returns {string}
 */
function padRight(value, width) {
  return value.length >= width ? value : value + " ".repeat(width - value.length);
}

function defaultSessionId() {
  return process.env.USER ?? process.env.USERNAME ?? process.env.LOGNAME ?? "anonymous";
}

export class ExitError extends Error {
  /** @param {number} code */
  constructor(code) {
    super(`pawmatch exited with code ${code}`);
    this.code = code;
  }
}
