#include "pawmatch/cli.hpp"

#include <algorithm>
#include <array>
#include <cctype>
#include <cstdlib>
#include <iomanip>
#include <string>
#include <unordered_set>

#include "pawmatch/charities.hpp"
#include "pawmatch/flags.hpp"
#include "pawmatch/pets.hpp"
#include "pawmatch/variants.hpp"

namespace pawmatch {

namespace {

constexpr std::array<const char*, 5> kPopularityTags = {
    "social", "good-with-kids", "calm", "mellow", "gentle"};

struct MatchFactor {
    std::string flag;
    std::vector<std::string> tags;
};

std::vector<MatchFactor> all_factors() {
    return {
        {"has-kids", {"good-with-kids", "gentle"}},
        {"quiet-home", {"mellow", "calm", "solo", "lap-cat"}},
        {"active", {"high-energy", "playful"}},
        {"first-time", {"gentle", "calm", "low-energy"}},
        {"multiple-pets", {"social"}},
        {"small-home", {"lap-cat", "solo", "low-energy"}},
    };
}

std::vector<MatchFactor> factors_for_depth(MatchDepth depth) {
    auto all = all_factors();
    std::size_t take = 4;
    if (depth == MatchDepth::Short) {
        take = 2;
    } else if (depth == MatchDepth::Thorough) {
        take = all.size();
    }
    if (take > all.size()) {
        take = all.size();
    }
    all.resize(take);
    return all;
}

std::string session_id_from_env() {
    for (const char* var : {"USER", "USERNAME", "LOGNAME"}) {
        if (const char* value = std::getenv(var); value != nullptr && *value != '\0') {
            return value;
        }
    }
    return "anonymous";
}

std::string join(const std::vector<std::string>& items, const std::string& sep) {
    std::string out;
    for (std::size_t i = 0; i < items.size(); ++i) {
        if (i > 0) out.append(sep);
        out.append(items[i]);
    }
    return out;
}

std::string to_lower_copy(std::string s) {
    std::transform(s.begin(), s.end(), s.begin(),
                   [](unsigned char c) { return std::tolower(c); });
    return s;
}

void render_pet(std::ostream& out, const Pet& p, PetCardStyle style) {
    const char* badge = p.long_stay() ? " *" : "";
    switch (style) {
        case PetCardStyle::Compact: {
            out << "  " << std::left << std::setw(10) << p.slug << " "
                << std::setw(14) << p.name << " "
                << std::setw(10) << p.species << " "
                << p.age_years << "y" << badge << "\n";
            break;
        }
        case PetCardStyle::Playful: {
            out << "  paw " << p.name << badge << " — a " << p.age_years
                << "-year-old " << to_lower_copy(p.breed) << " who is "
                << join(p.tags, " & ") << ".\n";
            break;
        }
        case PetCardStyle::Detailed:
        default: {
            out << "  " << p.name << badge << "  [" << p.slug << "]\n";
            out << "    " << p.breed << ", " << p.age_years << " years old\n";
            out << "    Tags: " << join(p.tags, ", ") << "\n";
            out << "\n";
            break;
        }
    }
}

void render_charity(std::ostream& out, const Charity& c, bool show_ratings) {
    out << "  " << c.name << "  [" << c.slug << "]\n";
    out << "    Focus: " << c.focus << "\n";
    out << "    " << c.description << "\n";
    out << "    Donate: " << c.url << "\n";
    if (show_ratings) {
        out << "    Rating: " << c.rating_note << "\n";
    }
}

}  // namespace

bool default_open_url(const std::string& url) {
#if defined(_WIN32)
    const std::string cmd = "start \"\" \"" + url + "\" >NUL 2>&1";
#elif defined(__APPLE__)
    const std::string cmd = "open \"" + url + "\" >/dev/null 2>&1";
#else
    const std::string cmd = "xdg-open \"" + url + "\" >/dev/null 2>&1";
#endif
    return std::system(cmd.c_str()) == 0;
}

Cli::Cli(std::ostream& out, std::ostream& err)
    : flags_(build_flag_registry()),
      context_(session_id_from_env()),
      out_(out),
      err_(err),
      open_url_(default_open_url) {}

Cli& Cli::with_context(agentxm::tinyflags::Context ctx) {
    context_ = std::move(ctx);
    return *this;
}

Cli& Cli::with_open_url(OpenUrlFn fn) {
    open_url_ = std::move(fn);
    return *this;
}

void Cli::write_usage() {
    out_ << "pawmatch — community pet adoption CLI.\n\n"
         << "Usage: pawmatch <command> [options]\n\n"
         << "Commands:\n"
         << "  browse [--species SPECIES]   List adoptable pets\n"
         << "  show <pet>                   Show details for a pet\n"
         << "  match [factors]              Match pets to your lifestyle\n"
         << "  apply <pet>                  Start an adoption application\n"
         << "  fees                         Show adoption fees\n"
         << "  return-support               No-judgment return information\n"
         << "  donate [--focus FOCUS]       Browse charities to support\n"
         << "  donate <slug> --open         Open a charity's donation URL\n";
}

int Cli::run(const std::vector<std::string>& args) {
    if (args.empty() || args.front() == "-h" || args.front() == "--help" ||
        args.front() == "help") {
        write_usage();
        return args.empty() ? 1 : 0;
    }
    const std::string cmd = args.front();
    std::vector<std::string> rest(args.begin() + 1, args.end());
    if (cmd == "browse") return run_browse(rest);
    if (cmd == "show") return run_show(rest);
    if (cmd == "match") return run_match(rest);
    if (cmd == "apply") return run_apply(rest);
    if (cmd == "fees") return run_fees();
    if (cmd == "return-support") return run_return_support();
    if (cmd == "donate") return run_donate(rest);
    err_ << "pawmatch: unknown command '" << cmd << "'\n\n";
    write_usage();
    return 2;
}

int Cli::run_browse(const std::vector<std::string>& args) {
    std::string species;
    for (std::size_t i = 0; i < args.size(); ++i) {
        const auto& a = args[i];
        if (a == "--species") {
            if (i + 1 >= args.size()) {
                err_ << "browse: --species requires a value\n";
                return 2;
            }
            species = args[++i];
        } else if (a.rfind("--species=", 0) == 0) {
            species = a.substr(std::string("--species=").size());
        } else {
            err_ << "browse: unknown argument '" << a << "'\n";
            return 2;
        }
    }

    auto matches = filter_pets_by_species(species);
    if (matches.empty()) {
        out_ << "No adoptable pets found for species '" << species << "'.\n";
        return 0;
    }

    if (flags_.enabled(kFlagLongStayHighlight, context_)) {
        const Pet* featured = nullptr;
        int best = -1;
        for (const auto* p : matches) {
            if (p->long_stay() && p->days_in_shelter > best) {
                best = p->days_in_shelter;
                featured = p;
            }
        }
        if (featured != nullptr) {
            out_ << "* Featured long-stay friend — please consider "
                 << featured->name << "!\n\n";
        }
    }

    const auto style = parse_pet_card_style(
        flags_.variant(kFlagPetCardStyle, context_));
    for (const auto* p : matches) {
        render_pet(out_, *p, style);
    }
    return 0;
}

int Cli::run_show(const std::vector<std::string>& args) {
    if (args.empty()) {
        err_ << "Usage: pawmatch show <pet>\n";
        return 1;
    }
    const auto* pet = find_pet_by_slug(args.front());
    if (pet == nullptr) {
        err_ << "Unknown pet '" << args.front() << "'. Try 'pawmatch browse'.\n";
        return 1;
    }
    render_pet(out_, *pet, PetCardStyle::Detailed);
    out_ << "  Needs: " << pet->needs << "\n";
    out_ << "  Days in shelter: " << pet->days_in_shelter
         << (pet->long_stay() ? " (long-stay)" : "") << "\n";
    return 0;
}

int Cli::run_match(const std::vector<std::string>& args) {
    std::unordered_set<std::string> active_prefs;
    for (const auto& a : args) {
        if (a == "--has-kids") active_prefs.insert("has-kids");
        else if (a == "--quiet-home") active_prefs.insert("quiet-home");
        else if (a == "--active") active_prefs.insert("active");
        else if (a == "--first-time") active_prefs.insert("first-time");
        else if (a == "--multiple-pets") active_prefs.insert("multiple-pets");
        else if (a == "--small-home") active_prefs.insert("small-home");
        else {
            err_ << "match: unknown argument '" << a << "'\n";
            return 2;
        }
    }

    const auto strategy = parse_match_strategy(
        flags_.variant(kFlagRecommendationStrategy, context_));
    const auto depth = parse_match_depth(
        flags_.variant(kFlagMatchQuizDepth, context_));
    const auto factors = factors_for_depth(depth);

    std::unordered_set<std::string> wants;
    for (const auto& factor : factors) {
        if (active_prefs.count(factor.flag) > 0) {
            for (const auto& tag : factor.tags) {
                wants.insert(tag);
            }
        }
    }

    out_ << "Strategy: " << to_string(strategy)
         << " * Quiz depth: " << to_string(depth) << " (" << factors.size()
         << " factor(s) considered)\n";
    if (active_prefs.empty()) {
        out_ << "(no preference flags provided — try --has-kids --quiet-home "
                "--active --first-time)\n";
    }
    out_ << "\n";

    std::vector<const Pet*> ranked;
    ranked.reserve(all_pets().size());
    for (const auto& p : all_pets()) {
        ranked.push_back(&p);
    }

    const std::unordered_set<std::string> popularity_tags(
        kPopularityTags.begin(), kPopularityTags.end());

    auto count_matches = [](const std::vector<std::string>& tags,
                            const std::unordered_set<std::string>& wanted) {
        int n = 0;
        for (const auto& t : tags) {
            if (wanted.count(t) > 0) {
                ++n;
            }
        }
        return n;
    };

    switch (strategy) {
        case MatchStrategy::Popularity:
            std::sort(ranked.begin(), ranked.end(),
                      [&](const Pet* a, const Pet* b) {
                          return count_matches(a->tags, popularity_tags) >
                                 count_matches(b->tags, popularity_tags);
                      });
            break;
        case MatchStrategy::LongestStay:
            std::sort(ranked.begin(), ranked.end(),
                      [](const Pet* a, const Pet* b) {
                          return a->days_in_shelter > b->days_in_shelter;
                      });
            break;
        case MatchStrategy::MatchQuiz:
            std::sort(ranked.begin(), ranked.end(),
                      [&](const Pet* a, const Pet* b) {
                          return count_matches(a->tags, wants) >
                                 count_matches(b->tags, wants);
                      });
            break;
    }

    const std::size_t limit = std::min<std::size_t>(3, ranked.size());
    for (std::size_t i = 0; i < limit; ++i) {
        const auto& p = *ranked[i];
        out_ << "  - " << p.name << " (" << p.breed << ", " << p.age_years
             << "y) — " << join(p.tags, ", ") << "\n";
    }
    out_ << "\n"
         << "Adoption is a conversation — book a meet-and-greet to see if "
            "it's a fit.\n";
    return 0;
}

int Cli::run_apply(const std::vector<std::string>& args) {
    if (args.empty()) {
        err_ << "Usage: pawmatch apply <pet>\n";
        return 1;
    }
    const auto* pet = find_pet_by_slug(args.front());
    if (pet == nullptr) {
        err_ << "Unknown pet '" << args.front() << "'. Try 'pawmatch browse'.\n";
        return 1;
    }
    out_ << "Adoption application for " << pet->name << "\n\n"
         << "Next steps:\n"
         << "  1. Application reviewed by an adoption counselor (1-2 days).\n"
         << "  2. Meet-and-greet scheduled at the shelter.\n"
         << "  3. 48-hour reflection period before finalizing.\n"
         << "  4. Take-home day — fees cover spay/neuter, vaccines, and "
            "microchip.\n";
    if (flags_.enabled(kFlagHomeCheckFollowup, context_)) {
        out_ << "  5. Two-week follow-up check from a counselor to see how "
                "you're settling in.\n";
    }
    out_ << "\nReturns are always accepted, no questions asked.\n";
    if (flags_.enabled(kFlagSuggestDonateAfterAdoption, context_)) {
        out_ << "\nIf " << pet->name
             << " brings you joy, please consider donating to a shelter:\n"
             << "  pawmatch donate\n";
    }
    return 0;
}

int Cli::run_fees() {
    const bool detailed = flags_.enabled(kFlagFeeBreakdownDetailed, context_);
    out_ << "Adoption fees\n\n";
    if (detailed) {
        out_ << "  Dog adoption — $150 total:\n"
             << "    $60   spay / neuter surgery\n"
             << "    $45   core vaccinations\n"
             << "    $25   microchip and registration\n"
             << "    $20   intake exam and deworming\n\n"
             << "  Cat adoption — $90 total:\n"
             << "    $50   spay / neuter surgery\n"
             << "    $25   core vaccinations\n"
             << "    $15   microchip and registration\n\n"
             << "  Small animal — $35 total (intake exam + microchip).\n";
    } else {
        out_ << "  Dog adoption           $150\n"
             << "  Cat adoption            $90\n"
             << "  Small animal            $35\n\n"
             << "  Fees cover spay/neuter, vaccines, and microchip.\n";
    }
    out_ << "\nNo one is turned away for inability to pay — ask about our "
            "subsidy fund.\n";
    return 0;
}

int Cli::run_return_support() {
    out_ << "Return support\n\n"
         << "If your adoption isn't working out, we're here to help.\n"
         << "  * Free behavior consultation with our trainers.\n"
         << "  * No-judgment returns at any time — your pet stays in our "
            "care.\n"
         << "  * Connections to low-cost vet and food assistance programs.\n\n"
         << "Returning a pet is not a failure. Reach out as soon as you'd "
            "like support.\n";
    return 0;
}

int Cli::run_donate(const std::vector<std::string>& args) {
    std::string slug;
    std::string focus_override;
    bool open = false;
    bool focus_set = false;
    for (std::size_t i = 0; i < args.size(); ++i) {
        const auto& a = args[i];
        if (a == "--open") {
            open = true;
        } else if (a == "--focus") {
            if (i + 1 >= args.size()) {
                err_ << "donate: --focus requires a value\n";
                return 2;
            }
            focus_override = args[++i];
            focus_set = true;
        } else if (a.rfind("--focus=", 0) == 0) {
            focus_override = a.substr(std::string("--focus=").size());
            focus_set = true;
        } else if (a.rfind("--", 0) == 0) {
            err_ << "donate: unknown argument '" << a << "'\n";
            return 2;
        } else if (slug.empty()) {
            slug = a;
        } else {
            err_ << "donate: unexpected positional '" << a << "'\n";
            return 2;
        }
    }

    const auto default_focus = parse_donate_focus(
        flags_.variant(kFlagDonateFocusDefault, context_));
    const std::string focus =
        focus_set ? focus_override : to_string(default_focus);
    const bool show_ratings = flags_.enabled(kFlagShowCharityRatings, context_);

    if (!slug.empty()) {
        const auto* c = find_charity_by_slug(slug);
        if (c == nullptr) {
            err_ << "Unknown charity '" << slug << "'.\n";
            return 1;
        }
        if (open) {
            if (!open_url_(c->url)) {
                err_ << "Unable to open browser. URL: " << c->url << "\n";
                return 1;
            }
            return 0;
        }
        render_charity(out_, *c, show_ratings);
        return 0;
    }

    auto list = filter_charities_by_focus(focus);
    out_ << "Animal-welfare charities (focus: " << focus << ")\n\n";
    for (const auto* c : list) {
        render_charity(out_, *c, show_ratings);
        out_ << "\n";
    }
    out_ << kCharitiesDisclaimer << "\n";
    if (!show_ratings) {
        out_ << "Ratings hidden — set show-charity-ratings to surface them "
                "inline.\n";
    }
    return 0;
}

}  // namespace pawmatch
