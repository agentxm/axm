//! Static pet data shared across the CLI commands.

const std = @import("std");

/// Number of days in shelter at which a pet is considered "long-stay".
pub const long_stay_threshold: u32 = 120;

pub const Pet = struct {
    slug: []const u8,
    name: []const u8,
    species: []const u8,
    breed: []const u8,
    age_years: u32,
    days_in_shelter: u32,
    tags: []const []const u8,
    needs: []const u8,
};

/// Mirrors the rust-cargo-app data so companion skills see the same
/// fictional shelter in every ecosystem port.
pub const all_pets = [_]Pet{
    .{
        .slug = "biscuit",
        .name = "Biscuit",
        .species = "dog",
        .breed = "Beagle mix",
        .age_years = 4,
        .days_in_shelter = 12,
        .tags = &.{ "playful", "social", "good-with-kids" },
        .needs = "Daily walks; loves squeaky toys.",
    },
    .{
        .slug = "pepper",
        .name = "Pepper",
        .species = "cat",
        .breed = "Domestic Shorthair",
        .age_years = 8,
        .days_in_shelter = 247,
        .tags = &.{ "mellow", "lap-cat", "solo" },
        .needs = "Quiet home preferred; no other cats.",
    },
    .{
        .slug = "marigold",
        .name = "Marigold",
        .species = "dog",
        .breed = "Senior Labrador",
        .age_years = 11,
        .days_in_shelter = 89,
        .tags = &.{ "calm", "gentle", "low-energy" },
        .needs = "Joint supplements; short walks only.",
    },
    .{
        .slug = "tofu",
        .name = "Tofu",
        .species = "rabbit",
        .breed = "Holland Lop",
        .age_years = 2,
        .days_in_shelter = 31,
        .tags = &.{ "curious", "social" },
        .needs = "Roomy enclosure and unlimited hay.",
    },
    .{
        .slug = "otis",
        .name = "Otis",
        .species = "dog",
        .breed = "Pittie mix",
        .age_years = 5,
        .days_in_shelter = 156,
        .tags = &.{ "gentle", "good-with-kids", "no-cats" },
        .needs = "Cat-free home; loves toddlers.",
    },
    .{
        .slug = "juniper",
        .name = "Juniper",
        .species = "cat",
        .breed = "Tortoiseshell",
        .age_years = 3,
        .days_in_shelter = 22,
        .tags = &.{ "vocal", "spunky", "solo" },
        .needs = "Only cat in the household, please.",
    },
    .{
        .slug = "maple",
        .name = "Maple",
        .species = "dog",
        .breed = "Mini Australian Shepherd",
        .age_years = 1,
        .days_in_shelter = 6,
        .tags = &.{ "high-energy", "smart", "needs-training" },
        .needs = "Training class strongly recommended.",
    },
    .{
        .slug = "clover",
        .name = "Clover & Sage",
        .species = "guinea-pig",
        .breed = "Bonded pair",
        .age_years = 1,
        .days_in_shelter = 18,
        .tags = &.{ "social", "bonded-pair" },
        .needs = "Must adopt together — bonded for life.",
    },
};

pub fn isLongStay(p: *const Pet) bool {
    return p.days_in_shelter >= long_stay_threshold;
}

pub fn findBySlug(slug: []const u8) ?*const Pet {
    for (&all_pets) |*p| {
        if (std.ascii.eqlIgnoreCase(p.slug, slug)) return p;
    }
    return null;
}

pub fn matchesSpecies(p: *const Pet, species: []const u8) bool {
    if (species.len == 0) return true;
    return std.ascii.eqlIgnoreCase(p.species, species);
}
