//! PawMatch CLI logic. The companion AXM skills target this module.

const std = @import("std");
const tf = @import("tinyflags");
const charities_mod = @import("charities.zig");
const pets_mod = @import("pets.zig");
const flags_mod = @import("flags.zig");
const variants = @import("variants.zig");
const match_engine = @import("match_engine.zig");

const Charity = charities_mod.Charity;
const Pet = pets_mod.Pet;

/// Signature for the URL opener. The default uses the host OS browser
/// opener; tests override this with a stub.
pub const OpenUrlFn = *const fn (context: *anyopaque, url: []const u8) anyerror!void;

/// PawMatch CLI. Construct with `Cli.init`, then dispatch with `Cli.run`.
pub const Cli = struct {
    allocator: std.mem.Allocator,
    registry: tf.Registry,
    context: tf.Context,
    out: std.io.AnyWriter,
    err: std.io.AnyWriter,
    open_ctx: *anyopaque,
    open_fn: OpenUrlFn,

    pub fn init(
        allocator: std.mem.Allocator,
        out: std.io.AnyWriter,
        err: std.io.AnyWriter,
        ctx_id: []const u8,
    ) tf.FlagError!Cli {
        const registry = try flags_mod.buildRegistry(allocator);
        return .{
            .allocator = allocator,
            .registry = registry,
            .context = tf.Context.init(ctx_id),
            .out = out,
            .err = err,
            // Default opener ignores its context pointer; tests provide a
            // real backing pointer via `setOpener` when they need state.
            .open_ctx = undefined,
            .open_fn = defaultOpenUrl,
        };
    }

    pub fn deinit(self: *Cli) void {
        self.registry.deinit();
    }

    pub fn setOpener(self: *Cli, ctx: *anyopaque, opener: OpenUrlFn) void {
        self.open_ctx = ctx;
        self.open_fn = opener;
    }

    /// Dispatch a subcommand. `argv` should not include the executable name.
    pub fn run(self: *Cli, argv: []const []const u8) u8 {
        if (argv.len == 0) {
            self.writeUsage();
            return 1;
        }
        const sub = argv[0];
        const rest = argv[1..];
        if (std.mem.eql(u8, sub, "browse")) return self.runBrowse(rest);
        if (std.mem.eql(u8, sub, "show")) return self.runShow(rest);
        if (std.mem.eql(u8, sub, "match")) return self.runMatch(rest);
        if (std.mem.eql(u8, sub, "apply")) return self.runApply(rest);
        if (std.mem.eql(u8, sub, "fees")) return self.fees();
        if (std.mem.eql(u8, sub, "return-support")) return self.returnSupport();
        if (std.mem.eql(u8, sub, "donate")) return self.runDonate(rest);
        if (std.mem.eql(u8, sub, "-h") or std.mem.eql(u8, sub, "--help") or std.mem.eql(u8, sub, "help")) {
            self.writeUsage();
            return 0;
        }
        self.err.print("pawmatch: unknown command \"{s}\"\n\n", .{sub}) catch {};
        self.writeUsage();
        return 2;
    }

    fn writeUsage(self: *Cli) void {
        self.out.writeAll(
            \\pawmatch — community pet adoption CLI.
            \\
            \\Commands:
            \\  browse [--species <s>]   List adoptable pets
            \\  show <pet>               Show details for a pet
            \\  match [factors]          Match pets to your lifestyle
            \\  apply <pet>              Start an adoption application
            \\  fees                     Show adoption fees
            \\  return-support           Show return-support information
            \\  donate [<slug>] [--focus <f>] [--open]
            \\                           Browse animal-welfare charities to support
            \\
        ) catch {};
    }

    // ── browse ──────────────────────────────────────────────────────────

    fn runBrowse(self: *Cli, argv: []const []const u8) u8 {
        var species: []const u8 = "";
        var i: usize = 0;
        while (i < argv.len) : (i += 1) {
            const a = argv[i];
            if (std.mem.eql(u8, a, "--species")) {
                if (i + 1 >= argv.len) {
                    self.err.writeAll("browse: --species requires a value\n") catch {};
                    return 2;
                }
                i += 1;
                species = argv[i];
            } else if (std.mem.startsWith(u8, a, "--species=")) {
                species = a["--species=".len..];
            } else {
                self.err.print("browse: unknown argument \"{s}\"\n", .{a}) catch {};
                return 2;
            }
        }
        return self.browse(species);
    }

    pub fn browse(self: *Cli, species: []const u8) u8 {
        var any = false;
        for (&pets_mod.all_pets) |*p| {
            if (pets_mod.matchesSpecies(p, species)) {
                any = true;
                break;
            }
        }
        if (!any) {
            self.out.print("No adoptable pets found for species '{s}'.\n", .{species}) catch {};
            return 0;
        }

        const highlight = self.registry.enabled(flags_mod.FLAG_LONG_STAY_HIGHLIGHT, self.context) catch |e| {
            return self.flagError(e);
        };
        if (highlight) {
            var featured: ?*const Pet = null;
            for (&pets_mod.all_pets) |*p| {
                if (!pets_mod.matchesSpecies(p, species)) continue;
                if (!pets_mod.isLongStay(p)) continue;
                if (featured == null or p.days_in_shelter > featured.?.days_in_shelter) {
                    featured = p;
                }
            }
            if (featured) |top| {
                self.out.print("★ Featured long-stay friend — please consider {s}!\n\n", .{top.name}) catch {};
            }
        }

        const style_str = self.registry.variant(flags_mod.FLAG_PET_CARD_STYLE, self.context) catch |e| {
            return self.flagError(e);
        };
        const style = variants.PetCardStyle.parse(style_str) orelse {
            self.err.print("pawmatch: unknown pet-card-style variant \"{s}\"\n", .{style_str}) catch {};
            return 1;
        };

        for (&pets_mod.all_pets) |*p| {
            if (!pets_mod.matchesSpecies(p, species)) continue;
            self.renderPet(p, style);
        }
        return 0;
    }

    // ── show ────────────────────────────────────────────────────────────

    fn runShow(self: *Cli, argv: []const []const u8) u8 {
        if (argv.len == 0) {
            self.err.writeAll("usage: pawmatch show <pet>\n") catch {};
            return 2;
        }
        return self.show(argv[0]);
    }

    pub fn show(self: *Cli, slug: []const u8) u8 {
        const pet = pets_mod.findBySlug(slug) orelse {
            self.err.print("Unknown pet '{s}'. Try 'pawmatch browse'.\n", .{slug}) catch {};
            return 1;
        };
        self.renderPet(pet, .detailed);
        self.out.print("  Needs: {s}\n", .{pet.needs}) catch {};
        const long_tag: []const u8 = if (pets_mod.isLongStay(pet)) " (long-stay)" else "";
        self.out.print("  Days in shelter: {d}{s}\n", .{ pet.days_in_shelter, long_tag }) catch {};
        return 0;
    }

    // ── match ───────────────────────────────────────────────────────────

    fn runMatch(self: *Cli, argv: []const []const u8) u8 {
        var prefs = match_engine.MatchPreferences{};
        for (argv) |a| {
            if (std.mem.eql(u8, a, "--has-kids")) {
                prefs.has_kids = true;
            } else if (std.mem.eql(u8, a, "--quiet-home")) {
                prefs.quiet_home = true;
            } else if (std.mem.eql(u8, a, "--active")) {
                prefs.active = true;
            } else if (std.mem.eql(u8, a, "--first-time")) {
                prefs.first_time = true;
            } else if (std.mem.eql(u8, a, "--multiple-pets")) {
                prefs.multiple_pets = true;
            } else if (std.mem.eql(u8, a, "--small-home")) {
                prefs.small_home = true;
            } else {
                self.err.print("match: unknown argument \"{s}\"\n", .{a}) catch {};
                return 2;
            }
        }
        return self.matchPets(prefs);
    }

    pub fn matchPets(self: *Cli, prefs: match_engine.MatchPreferences) u8 {
        const strategy_str = self.registry.variant(flags_mod.FLAG_RECOMMENDATION_STRATEGY, self.context) catch |e| {
            return self.flagError(e);
        };
        const strategy = variants.MatchStrategy.parse(strategy_str) orelse {
            self.err.print("pawmatch: unknown recommendation-strategy variant \"{s}\"\n", .{strategy_str}) catch {};
            return 1;
        };

        const depth_str = self.registry.variant(flags_mod.FLAG_MATCH_QUIZ_DEPTH, self.context) catch |e| {
            return self.flagError(e);
        };
        const depth = variants.MatchDepth.parse(depth_str) orelse {
            self.err.print("pawmatch: unknown match-quiz-depth variant \"{s}\"\n", .{depth_str}) catch {};
            return 1;
        };

        const factors = match_engine.factorsForDepth(depth);

        // Build the set of wanted tags from active preferences.
        var wanted_buf: [match_engine.match_factors.len * 6][]const u8 = undefined;
        var wanted_len: usize = 0;
        for (factors) |f| {
            if (!prefs.isActive(f.flag)) continue;
            for (f.tags) |t| {
                wanted_buf[wanted_len] = t;
                wanted_len += 1;
            }
        }
        const wanted = wanted_buf[0..wanted_len];

        self.out.print("Strategy: {s} • Quiz depth: {s} ({d} factor(s) considered)\n", .{
            strategy.label(), depth.label(), factors.len,
        }) catch {};
        if (prefs.isEmpty()) {
            self.out.writeAll("(no preference flags provided — try --has-kids --quiet-home --active --first-time)\n") catch {};
        }
        self.out.writeAll("\n") catch {};

        // Sort a local copy of pet pointers based on the strategy.
        var ranked: [pets_mod.all_pets.len]*const Pet = undefined;
        for (&pets_mod.all_pets, 0..) |*p, i| ranked[i] = p;

        const Ctx = struct {
            strategy: variants.MatchStrategy,
            wanted: []const []const u8,

            pub fn lessThan(c: @This(), a: *const Pet, b: *const Pet) bool {
                return switch (c.strategy) {
                    .popularity => match_engine.countMatchingTags(b.tags, &match_engine.popularity_tags) <
                        match_engine.countMatchingTags(a.tags, &match_engine.popularity_tags),
                    .longest_stay => b.days_in_shelter < a.days_in_shelter,
                    .match_quiz => match_engine.countMatchingTags(b.tags, c.wanted) <
                        match_engine.countMatchingTags(a.tags, c.wanted),
                };
            }
        };
        std.sort.block(*const Pet, ranked[0..], Ctx{ .strategy = strategy, .wanted = wanted }, Ctx.lessThan);

        const limit = @min(@as(usize, 3), ranked.len);
        for (ranked[0..limit]) |p| {
            self.out.print("  • {s} ({s}, {d}y) — ", .{ p.name, p.breed, p.age_years }) catch {};
            for (p.tags, 0..) |t, i| {
                const sep: []const u8 = if (i == 0) "" else ", ";
                self.out.print("{s}{s}", .{ sep, t }) catch {};
            }
            self.out.writeAll("\n") catch {};
        }

        self.out.writeAll("\nAdoption is a conversation — book a meet-and-greet to see if it's a fit.\n") catch {};
        return 0;
    }

    // ── apply ───────────────────────────────────────────────────────────

    fn runApply(self: *Cli, argv: []const []const u8) u8 {
        if (argv.len == 0) {
            self.err.writeAll("usage: pawmatch apply <pet>\n") catch {};
            return 2;
        }
        return self.apply(argv[0]);
    }

    pub fn apply(self: *Cli, slug: []const u8) u8 {
        const pet = pets_mod.findBySlug(slug) orelse {
            self.err.print("Unknown pet '{s}'. Try 'pawmatch browse'.\n", .{slug}) catch {};
            return 1;
        };
        self.out.print("Adoption application for {s}\n\n", .{pet.name}) catch {};
        self.out.writeAll(
            \\Next steps:
            \\  1. Application reviewed by an adoption counselor (1–2 days).
            \\  2. Meet-and-greet scheduled at the shelter.
            \\  3. 48-hour reflection period before finalizing.
            \\  4. Take-home day — fees cover spay/neuter, vaccines, and microchip.
            \\
        ) catch {};

        const followup = self.registry.enabled(flags_mod.FLAG_HOME_CHECK_FOLLOWUP, self.context) catch |e| {
            return self.flagError(e);
        };
        if (followup) {
            self.out.writeAll("  5. Two-week follow-up check from a counselor to see how you're settling in.\n") catch {};
        }

        self.out.writeAll("\nReturns are always accepted, no questions asked.\n") catch {};

        const suggest = self.registry.enabled(flags_mod.FLAG_SUGGEST_DONATE_AFTER_ADOPT, self.context) catch |e| {
            return self.flagError(e);
        };
        if (suggest) {
            self.out.print("\nIf {s} brings you joy, please consider donating to a shelter:\n  pawmatch donate\n", .{pet.name}) catch {};
        }
        return 0;
    }

    // ── fees ────────────────────────────────────────────────────────────

    pub fn fees(self: *Cli) u8 {
        const detailed = self.registry.enabled(flags_mod.FLAG_FEE_BREAKDOWN_DETAILED, self.context) catch |e| {
            return self.flagError(e);
        };
        self.out.writeAll("Adoption fees\n\n") catch {};
        if (detailed) {
            self.out.writeAll(
                \\  Dog adoption — $150 total:
                \\    $60   spay / neuter surgery
                \\    $45   core vaccinations
                \\    $25   microchip and registration
                \\    $20   intake exam and deworming
                \\
                \\  Cat adoption — $90 total:
                \\    $50   spay / neuter surgery
                \\    $25   core vaccinations
                \\    $15   microchip and registration
                \\
                \\  Small animal — $35 total (intake exam + microchip).
                \\
            ) catch {};
        } else {
            self.out.writeAll(
                \\  Dog adoption           $150
                \\  Cat adoption            $90
                \\  Small animal            $35
                \\
                \\  Fees cover spay/neuter, vaccines, and microchip.
                \\
            ) catch {};
        }
        self.out.writeAll("\nNo one is turned away for inability to pay — ask about our subsidy fund.\n") catch {};
        return 0;
    }

    // ── return-support ──────────────────────────────────────────────────

    pub fn returnSupport(self: *Cli) u8 {
        self.out.writeAll(
            \\Return support
            \\
            \\If your adoption isn't working out, we're here to help.
            \\  • Free behavior consultation with our trainers.
            \\  • No-judgment returns at any time — your pet stays in our care.
            \\  • Connections to low-cost vet and food assistance programs.
            \\
            \\Returning a pet is not a failure. Reach out as soon as you'd like support.
            \\
        ) catch {};
        return 0;
    }

    // ── donate ──────────────────────────────────────────────────────────

    fn runDonate(self: *Cli, argv: []const []const u8) u8 {
        var slug: ?[]const u8 = null;
        var focus: ?[]const u8 = null;
        var open: bool = false;
        var i: usize = 0;
        while (i < argv.len) : (i += 1) {
            const a = argv[i];
            if (std.mem.eql(u8, a, "--open")) {
                open = true;
            } else if (std.mem.eql(u8, a, "--focus")) {
                if (i + 1 >= argv.len) {
                    self.err.writeAll("donate: --focus requires a value\n") catch {};
                    return 2;
                }
                i += 1;
                focus = argv[i];
            } else if (std.mem.startsWith(u8, a, "--focus=")) {
                focus = a["--focus=".len..];
            } else if (std.mem.startsWith(u8, a, "--")) {
                self.err.print("donate: unknown argument \"{s}\"\n", .{a}) catch {};
                return 2;
            } else if (slug == null) {
                slug = a;
            } else {
                self.err.print("donate: unexpected positional \"{s}\"\n", .{a}) catch {};
                return 2;
            }
        }
        return self.donate(slug, focus, open);
    }

    pub fn donate(self: *Cli, slug: ?[]const u8, focus_override: ?[]const u8, open: bool) u8 {
        const default_focus_str = self.registry.variant(flags_mod.FLAG_DONATE_FOCUS_DEFAULT, self.context) catch |e| {
            return self.flagError(e);
        };
        const default_focus = variants.DonateFocus.parse(default_focus_str) orelse {
            self.err.print("pawmatch: unknown donate-focus-default variant \"{s}\"\n", .{default_focus_str}) catch {};
            return 1;
        };
        const focus: []const u8 = focus_override orelse default_focus.asStr();

        const show_ratings = self.registry.enabled(flags_mod.FLAG_SHOW_CHARITY_RATINGS, self.context) catch |e| {
            return self.flagError(e);
        };

        if (slug) |s| {
            const charity = charities_mod.findBySlug(s) orelse {
                self.err.print("Unknown charity '{s}'.\n", .{s}) catch {};
                return 1;
            };
            if (open) {
                self.open_fn(self.open_ctx, charity.url) catch |err| {
                    self.err.print("Unable to open browser ({s}). URL: {s}\n", .{ @errorName(err), charity.url }) catch {};
                    return 1;
                };
                return 0;
            }
            self.renderCharity(charity, show_ratings);
            return 0;
        }

        self.out.print("Animal-welfare charities (focus: {s})\n\n", .{focus}) catch {};
        for (&charities_mod.all_charities) |*c| {
            if (charities_mod.matchesFocus(c, focus)) {
                self.renderCharity(c, show_ratings);
                self.out.writeAll("\n") catch {};
            }
        }
        self.out.print("{s}\n", .{charities_mod.charities_disclaimer}) catch {};
        if (!show_ratings) {
            self.out.writeAll("Ratings hidden — set show-charity-ratings to surface them inline.\n") catch {};
        }
        return 0;
    }

    // ── helpers ─────────────────────────────────────────────────────────

    fn renderPet(self: *Cli, p: *const Pet, style: variants.PetCardStyle) void {
        const badge: []const u8 = if (pets_mod.isLongStay(p)) " ★" else "";
        switch (style) {
            .compact => {
                self.out.print("  {s:<10} {s:<14} {s:<10} {d}y{s}\n", .{
                    p.slug, p.name, p.species, p.age_years, badge,
                }) catch {};
            },
            .playful => {
                self.out.print("  🐾 {s}{s} — a {d}-year-old {s} who is ", .{
                    p.name, badge, p.age_years, p.breed,
                }) catch {};
                for (p.tags, 0..) |t, i| {
                    const sep: []const u8 = if (i == 0) "" else " & ";
                    self.out.print("{s}{s}", .{ sep, t }) catch {};
                }
                self.out.writeAll(".\n") catch {};
            },
            .detailed => {
                self.out.print("  {s}{s}  [{s}]\n", .{ p.name, badge, p.slug }) catch {};
                self.out.print("    {s}, {d} years old\n", .{ p.breed, p.age_years }) catch {};
                self.out.writeAll("    Tags: ") catch {};
                for (p.tags, 0..) |t, i| {
                    const sep: []const u8 = if (i == 0) "" else ", ";
                    self.out.print("{s}{s}", .{ sep, t }) catch {};
                }
                self.out.writeAll("\n\n") catch {};
            },
        }
    }

    fn renderCharity(self: *Cli, c: *const Charity, show_ratings: bool) void {
        self.out.print("  {s}  [{s}]\n", .{ c.name, c.slug }) catch {};
        self.out.print("    Focus: {s}\n", .{c.focus}) catch {};
        self.out.print("    {s}\n", .{c.description}) catch {};
        self.out.print("    Donate: {s}\n", .{c.url}) catch {};
        if (show_ratings) {
            self.out.print("    Rating: {s}\n", .{c.rating_note}) catch {};
        }
    }

    fn flagError(self: *Cli, err: tf.FlagError) u8 {
        self.err.print("pawmatch: flag error: {s}\n", .{@errorName(err)}) catch {};
        return 1;
    }
};

fn defaultOpenUrl(ctx: *anyopaque, url: []const u8) anyerror!void {
    _ = ctx;
    const argv: []const []const u8 = blk: {
        if (@import("builtin").os.tag == .macos) {
            break :blk &.{ "open", url };
        } else if (@import("builtin").os.tag == .windows) {
            break :blk &.{ "cmd", "/c", "start", "", url };
        } else {
            break :blk &.{ "xdg-open", url };
        }
    };
    var child = std.process.Child.init(argv, std.heap.page_allocator);
    child.stdin_behavior = .Ignore;
    child.stdout_behavior = .Ignore;
    child.stderr_behavior = .Ignore;
    try child.spawn();
    _ = try child.wait();
}
