//! PawMatch CLI logic. The companion AXM skills target this module.

use std::collections::HashSet;
use std::io::Write;
use std::process::Command;

use tinyflags::{Context, Flags};

use crate::charities::{
    filter_charities_by_focus, find_charity_by_slug, Charity, CHARITIES_DISCLAIMER,
};
use crate::flags::{
    new_flags, FLAG_DONATE_FOCUS_DEFAULT, FLAG_FEE_BREAKDOWN_DETAILED, FLAG_HOME_CHECK_FOLLOWUP,
    FLAG_LONG_STAY_HIGHLIGHT, FLAG_MATCH_QUIZ_DEPTH, FLAG_PET_CARD_STYLE,
    FLAG_RECOMMENDATION_STRATEGY, FLAG_SHOW_CHARITY_RATINGS, FLAG_SUGGEST_DONATE_AFTER_ADOPT,
};
use crate::match_engine::{
    count_tag_matches, factors_for_depth, MatchFactor, MatchPreferences, POPULARITY_TAGS,
};
use crate::pets::{filter_pets_by_species, find_pet_by_slug, is_long_stay, Pet, ALL_PETS};
use crate::variants::{DonateFocus, MatchDepth, MatchStrategy, PetCardStyle};

/// Function type for opening a charity donation URL. The default uses the
/// host OS's browser opener; tests override this with a stub.
pub type OpenUrl<'a> = Box<dyn FnMut(&str) -> std::io::Result<()> + 'a>;

/// PawMatch CLI. Construct with [`Cli::new`] and dispatch with [`Cli::run`].
pub struct Cli<'a> {
    pub flags: Flags,
    pub context: Context,
    pub out: &'a mut dyn Write,
    pub err: &'a mut dyn Write,
    pub open_url: OpenUrl<'a>,
}

impl<'a> Cli<'a> {
    pub fn new(out: &'a mut dyn Write, err: &'a mut dyn Write) -> Self {
        Self {
            flags: new_flags(),
            context: Context::new(default_session_id()),
            out,
            err,
            open_url: Box::new(open_url_default),
        }
    }

    /// Override the rollout context. Useful for tests and reproducible runs.
    pub fn with_context(mut self, ctx: Context) -> Self {
        self.context = ctx;
        self
    }

    /// Override the URL opener. Useful for tests.
    pub fn with_open_url<F>(mut self, opener: F) -> Self
    where
        F: FnMut(&str) -> std::io::Result<()> + 'a,
    {
        self.open_url = Box::new(opener);
        self
    }

    /// Dispatch a subcommand. `args` should not include the executable name.
    pub fn run(&mut self, args: &[String]) -> i32 {
        let Some((sub, rest)) = args.split_first() else {
            self.write_usage();
            return 1;
        };
        match sub.as_str() {
            "browse" => self.run_browse(rest),
            "show" => self.run_show(rest),
            "match" => self.run_match(rest),
            "apply" => self.run_apply(rest),
            "fees" => self.fees(),
            "return-support" => self.return_support(),
            "donate" => self.run_donate(rest),
            "-h" | "--help" | "help" => {
                self.write_usage();
                0
            }
            other => {
                let _ = writeln!(self.err, "pawmatch: unknown command {other:?}\n");
                self.write_usage();
                2
            }
        }
    }

    fn write_usage(&mut self) {
        let _ = writeln!(self.out, "pawmatch — community pet adoption CLI.");
        let _ = writeln!(self.out);
        let _ = writeln!(self.out, "Commands:");
        let _ = writeln!(self.out, "  browse [--species <s>]   List adoptable pets");
        let _ = writeln!(self.out, "  show <pet>               Show details for a pet");
        let _ = writeln!(self.out, "  match [factors]          Match pets to your lifestyle");
        let _ = writeln!(self.out, "  apply <pet>              Start an adoption application");
        let _ = writeln!(self.out, "  fees                     Show adoption fees");
        let _ = writeln!(self.out, "  return-support           Show return-support information");
        let _ = writeln!(
            self.out,
            "  donate [<slug>] [--focus <f>] [--open]\n                           Browse animal-welfare charities to support",
        );
    }

    // ── browse ──────────────────────────────────────────────────────────

    fn run_browse(&mut self, args: &[String]) -> i32 {
        let mut species = String::new();
        let mut iter = args.iter();
        while let Some(arg) = iter.next() {
            if arg == "--species" {
                if let Some(value) = iter.next() {
                    species = value.clone();
                } else {
                    let _ = writeln!(self.err, "browse: --species requires a value");
                    return 2;
                }
            } else if let Some(value) = arg.strip_prefix("--species=") {
                species = value.to_owned();
            } else {
                let _ = writeln!(self.err, "browse: unknown argument {arg:?}");
                return 2;
            }
        }
        self.browse(&species)
    }

    pub fn browse(&mut self, species: &str) -> i32 {
        let pets = filter_pets_by_species(species);
        if pets.is_empty() {
            let _ = writeln!(
                self.out,
                "No adoptable pets found for species '{species}'."
            );
            return 0;
        }

        let highlight = match self.flags.enabled(FLAG_LONG_STAY_HIGHLIGHT, &self.context) {
            Ok(v) => v,
            Err(err) => return self.flag_error(err.to_string()),
        };
        if highlight {
            let top = pets
                .iter()
                .filter(|p| is_long_stay(p))
                .max_by_key(|p| p.days_in_shelter);
            if let Some(top) = top {
                let _ = writeln!(
                    self.out,
                    "★ Featured long-stay friend — please consider {}!",
                    top.name,
                );
                let _ = writeln!(self.out);
            }
        }

        let style_str = match self.flags.variant(FLAG_PET_CARD_STYLE, &self.context) {
            Ok(v) => v,
            Err(err) => return self.flag_error(err.to_string()),
        };
        let style = match PetCardStyle::parse(&style_str) {
            Ok(v) => v,
            Err(err) => return self.flag_error(err.to_string()),
        };

        for pet in pets {
            self.render_pet(pet, style);
        }
        0
    }

    // ── show ────────────────────────────────────────────────────────────

    fn run_show(&mut self, args: &[String]) -> i32 {
        let Some(slug) = args.first() else {
            let _ = writeln!(self.err, "usage: pawmatch show <pet>");
            return 2;
        };
        self.show(slug)
    }

    pub fn show(&mut self, slug: &str) -> i32 {
        let Some(pet) = find_pet_by_slug(slug) else {
            let _ = writeln!(
                self.err,
                "Unknown pet '{slug}'. Try 'pawmatch browse'."
            );
            return 1;
        };
        self.render_pet(pet, PetCardStyle::Detailed);
        let _ = writeln!(self.out, "  Needs: {}", pet.needs);
        let tag = if is_long_stay(pet) { " (long-stay)" } else { "" };
        let _ = writeln!(
            self.out,
            "  Days in shelter: {}{}",
            pet.days_in_shelter, tag,
        );
        0
    }

    // ── match ───────────────────────────────────────────────────────────

    fn run_match(&mut self, args: &[String]) -> i32 {
        let mut prefs = MatchPreferences::default();
        for arg in args {
            match arg.as_str() {
                "--has-kids" => prefs.has_kids = true,
                "--quiet-home" => prefs.quiet_home = true,
                "--active" => prefs.active = true,
                "--first-time" => prefs.first_time = true,
                "--multiple-pets" => prefs.multiple_pets = true,
                "--small-home" => prefs.small_home = true,
                other => {
                    let _ = writeln!(self.err, "match: unknown argument {other:?}");
                    return 2;
                }
            }
        }
        self.match_pets(&prefs)
    }

    pub fn match_pets(&mut self, prefs: &MatchPreferences) -> i32 {
        let strategy_str = match self
            .flags
            .variant(FLAG_RECOMMENDATION_STRATEGY, &self.context)
        {
            Ok(v) => v,
            Err(err) => return self.flag_error(err.to_string()),
        };
        let strategy = match MatchStrategy::parse(&strategy_str) {
            Ok(v) => v,
            Err(err) => return self.flag_error(err.to_string()),
        };

        let depth_str = match self.flags.variant(FLAG_MATCH_QUIZ_DEPTH, &self.context) {
            Ok(v) => v,
            Err(err) => return self.flag_error(err.to_string()),
        };
        let depth = match MatchDepth::parse(&depth_str) {
            Ok(v) => v,
            Err(err) => return self.flag_error(err.to_string()),
        };

        let factors = factors_for_depth(depth);
        let user_flags = prefs.active_factors();
        let wants: HashSet<&str> = factors
            .iter()
            .filter(|f| user_flags.contains(f.flag))
            .flat_map(|f: &MatchFactor| f.tags.iter().copied())
            .collect();

        let _ = writeln!(
            self.out,
            "Strategy: {} • Quiz depth: {} ({} factor(s) considered)",
            strategy,
            depth,
            factors.len(),
        );
        if prefs.is_empty() {
            let _ = writeln!(
                self.out,
                "(no preference flags provided — try --has-kids --quiet-home --active --first-time)",
            );
        }
        let _ = writeln!(self.out);

        let mut ranked: Vec<&Pet> = ALL_PETS.iter().collect();
        let popularity: HashSet<&str> = POPULARITY_TAGS.iter().copied().collect();
        match strategy {
            MatchStrategy::Popularity => {
                ranked.sort_by(|a, b| {
                    count_tag_matches(b.tags, &popularity)
                        .cmp(&count_tag_matches(a.tags, &popularity))
                });
            }
            MatchStrategy::LongestStay => {
                ranked.sort_by(|a, b| b.days_in_shelter.cmp(&a.days_in_shelter));
            }
            MatchStrategy::MatchQuiz => {
                ranked.sort_by(|a, b| {
                    count_tag_matches(b.tags, &wants).cmp(&count_tag_matches(a.tags, &wants))
                });
            }
        }

        let limit = 3.min(ranked.len());
        for pet in &ranked[..limit] {
            let _ = writeln!(
                self.out,
                "  • {} ({}, {}y) — {}",
                pet.name,
                pet.breed,
                pet.age_years,
                pet.tags.join(", "),
            );
        }

        let _ = writeln!(self.out);
        let _ = writeln!(
            self.out,
            "Adoption is a conversation — book a meet-and-greet to see if it's a fit.",
        );
        0
    }

    // ── apply ───────────────────────────────────────────────────────────

    fn run_apply(&mut self, args: &[String]) -> i32 {
        let Some(slug) = args.first() else {
            let _ = writeln!(self.err, "usage: pawmatch apply <pet>");
            return 2;
        };
        self.apply(slug)
    }

    pub fn apply(&mut self, slug: &str) -> i32 {
        let Some(pet) = find_pet_by_slug(slug) else {
            let _ = writeln!(self.err, "Unknown pet '{slug}'. Try 'pawmatch browse'.");
            return 1;
        };
        let _ = writeln!(self.out, "Adoption application for {}", pet.name);
        let _ = writeln!(self.out);
        let _ = writeln!(self.out, "Next steps:");
        let _ = writeln!(
            self.out,
            "  1. Application reviewed by an adoption counselor (1–2 days).",
        );
        let _ = writeln!(self.out, "  2. Meet-and-greet scheduled at the shelter.");
        let _ = writeln!(self.out, "  3. 48-hour reflection period before finalizing.");
        let _ = writeln!(
            self.out,
            "  4. Take-home day — fees cover spay/neuter, vaccines, and microchip.",
        );

        let followup = match self.flags.enabled(FLAG_HOME_CHECK_FOLLOWUP, &self.context) {
            Ok(v) => v,
            Err(err) => return self.flag_error(err.to_string()),
        };
        if followup {
            let _ = writeln!(
                self.out,
                "  5. Two-week follow-up check from a counselor to see how you're settling in.",
            );
        }

        let _ = writeln!(self.out);
        let _ = writeln!(self.out, "Returns are always accepted, no questions asked.");

        let suggest_donate = match self
            .flags
            .enabled(FLAG_SUGGEST_DONATE_AFTER_ADOPT, &self.context)
        {
            Ok(v) => v,
            Err(err) => return self.flag_error(err.to_string()),
        };
        if suggest_donate {
            let _ = writeln!(self.out);
            let _ = writeln!(
                self.out,
                "If {} brings you joy, please consider donating to a shelter:",
                pet.name,
            );
            let _ = writeln!(self.out, "  pawmatch donate");
        }
        0
    }

    // ── fees ────────────────────────────────────────────────────────────

    pub fn fees(&mut self) -> i32 {
        let detailed = match self.flags.enabled(FLAG_FEE_BREAKDOWN_DETAILED, &self.context) {
            Ok(v) => v,
            Err(err) => return self.flag_error(err.to_string()),
        };
        let _ = writeln!(self.out, "Adoption fees");
        let _ = writeln!(self.out);
        if detailed {
            let _ = writeln!(self.out, "  Dog adoption — $150 total:");
            let _ = writeln!(self.out, "    $60   spay / neuter surgery");
            let _ = writeln!(self.out, "    $45   core vaccinations");
            let _ = writeln!(self.out, "    $25   microchip and registration");
            let _ = writeln!(self.out, "    $20   intake exam and deworming");
            let _ = writeln!(self.out);
            let _ = writeln!(self.out, "  Cat adoption — $90 total:");
            let _ = writeln!(self.out, "    $50   spay / neuter surgery");
            let _ = writeln!(self.out, "    $25   core vaccinations");
            let _ = writeln!(self.out, "    $15   microchip and registration");
            let _ = writeln!(self.out);
            let _ = writeln!(
                self.out,
                "  Small animal — $35 total (intake exam + microchip).",
            );
        } else {
            let _ = writeln!(self.out, "  Dog adoption           $150");
            let _ = writeln!(self.out, "  Cat adoption            $90");
            let _ = writeln!(self.out, "  Small animal            $35");
            let _ = writeln!(self.out);
            let _ = writeln!(self.out, "  Fees cover spay/neuter, vaccines, and microchip.");
        }
        let _ = writeln!(self.out);
        let _ = writeln!(
            self.out,
            "No one is turned away for inability to pay — ask about our subsidy fund.",
        );
        0
    }

    // ── return-support ──────────────────────────────────────────────────

    pub fn return_support(&mut self) -> i32 {
        let _ = writeln!(self.out, "Return support");
        let _ = writeln!(self.out);
        let _ = writeln!(self.out, "If your adoption isn't working out, we're here to help.");
        let _ = writeln!(self.out, "  • Free behavior consultation with our trainers.");
        let _ = writeln!(
            self.out,
            "  • No-judgment returns at any time — your pet stays in our care.",
        );
        let _ = writeln!(
            self.out,
            "  • Connections to low-cost vet and food assistance programs.",
        );
        let _ = writeln!(self.out);
        let _ = writeln!(
            self.out,
            "Returning a pet is not a failure. Reach out as soon as you'd like support.",
        );
        0
    }

    // ── donate ──────────────────────────────────────────────────────────

    fn run_donate(&mut self, args: &[String]) -> i32 {
        let mut slug: Option<String> = None;
        let mut focus: Option<String> = None;
        let mut open = false;
        let mut iter = args.iter();
        while let Some(arg) = iter.next() {
            match arg.as_str() {
                "--open" => open = true,
                "--focus" => match iter.next() {
                    Some(value) => focus = Some(value.clone()),
                    None => {
                        let _ = writeln!(self.err, "donate: --focus requires a value");
                        return 2;
                    }
                },
                other if other.starts_with("--focus=") => {
                    focus = Some(other.trim_start_matches("--focus=").to_owned());
                }
                other if other.starts_with("--") => {
                    let _ = writeln!(self.err, "donate: unknown argument {other:?}");
                    return 2;
                }
                _ if slug.is_none() => slug = Some(arg.clone()),
                _ => {
                    let _ = writeln!(self.err, "donate: unexpected positional {arg:?}");
                    return 2;
                }
            }
        }
        self.donate(slug.as_deref(), focus.as_deref(), open)
    }

    pub fn donate(&mut self, slug: Option<&str>, focus_override: Option<&str>, open: bool) -> i32 {
        let default_focus_str = match self.flags.variant(FLAG_DONATE_FOCUS_DEFAULT, &self.context)
        {
            Ok(v) => v,
            Err(err) => return self.flag_error(err.to_string()),
        };
        let default_focus = match DonateFocus::parse(&default_focus_str) {
            Ok(v) => v,
            Err(err) => return self.flag_error(err.to_string()),
        };
        let focus = focus_override.unwrap_or(default_focus.as_str()).to_owned();

        let show_ratings = match self
            .flags
            .enabled(FLAG_SHOW_CHARITY_RATINGS, &self.context)
        {
            Ok(v) => v,
            Err(err) => return self.flag_error(err.to_string()),
        };

        if let Some(slug) = slug {
            let Some(charity) = find_charity_by_slug(slug) else {
                let _ = writeln!(self.err, "Unknown charity '{slug}'.");
                return 1;
            };
            if open {
                return self.open_charity_url(charity.url);
            }
            self.render_charity(charity, show_ratings);
            return 0;
        }

        let list = filter_charities_by_focus(&focus);
        let _ = writeln!(self.out, "Animal-welfare charities (focus: {focus})");
        let _ = writeln!(self.out);
        for charity in list {
            self.render_charity(charity, show_ratings);
            let _ = writeln!(self.out);
        }
        let _ = writeln!(self.out, "{CHARITIES_DISCLAIMER}");
        if !show_ratings {
            let _ = writeln!(
                self.out,
                "Ratings hidden — set show-charity-ratings to surface them inline.",
            );
        }
        0
    }

    // ── helpers ─────────────────────────────────────────────────────────

    fn render_pet(&mut self, p: &Pet, style: PetCardStyle) {
        let badge = if is_long_stay(p) { " ★" } else { "" };
        match style {
            PetCardStyle::Compact => {
                let _ = writeln!(
                    self.out,
                    "  {:<10} {:<14} {:<10} {}y{}",
                    p.slug, p.name, p.species, p.age_years, badge,
                );
            }
            PetCardStyle::Playful => {
                let _ = writeln!(
                    self.out,
                    "  🐾 {}{} — a {}-year-old {} who is {}.",
                    p.name,
                    badge,
                    p.age_years,
                    p.breed.to_lowercase(),
                    p.tags.join(" & "),
                );
            }
            PetCardStyle::Detailed => {
                let _ = writeln!(self.out, "  {}{}  [{}]", p.name, badge, p.slug);
                let _ = writeln!(self.out, "    {}, {} years old", p.breed, p.age_years);
                let _ = writeln!(self.out, "    Tags: {}", p.tags.join(", "));
                let _ = writeln!(self.out);
            }
        }
    }

    fn render_charity(&mut self, charity: &Charity, show_ratings: bool) {
        let _ = writeln!(self.out, "  {}  [{}]", charity.name, charity.slug);
        let _ = writeln!(self.out, "    Focus: {}", charity.focus);
        let _ = writeln!(self.out, "    {}", charity.description);
        let _ = writeln!(self.out, "    Donate: {}", charity.url);
        if show_ratings {
            let _ = writeln!(self.out, "    Rating: {}", charity.rating_note);
        }
    }

    fn open_charity_url(&mut self, url: &str) -> i32 {
        if let Err(err) = (self.open_url)(url) {
            let _ = writeln!(self.err, "Unable to open browser ({err}). URL: {url}");
            return 1;
        }
        0
    }

    fn flag_error(&mut self, message: String) -> i32 {
        let _ = writeln!(self.err, "pawmatch: {message}");
        1
    }
}

fn open_url_default(url: &str) -> std::io::Result<()> {
    #[cfg(target_os = "macos")]
    let mut cmd = {
        let mut c = Command::new("open");
        c.arg(url);
        c
    };
    #[cfg(target_os = "windows")]
    let mut cmd = {
        let mut c = Command::new("cmd");
        c.args(["/c", "start", "", url]);
        c
    };
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    let mut cmd = {
        let mut c = Command::new("xdg-open");
        c.arg(url);
        c
    };
    cmd.spawn().map(|_| ())
}

fn default_session_id() -> String {
    for env in ["USER", "USERNAME", "LOGNAME"] {
        if let Ok(value) = std::env::var(env) {
            if !value.is_empty() {
                return value;
            }
        }
    }
    "anonymous".to_owned()
}
