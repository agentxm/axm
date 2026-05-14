module Pets

export Pet, ALL, find_by_slug, filter_by_species, long_stay

struct Pet
    slug::String
    name::String
    species::String
    breed::String
    age_years::Int
    days_in_shelter::Int
    tags::Vector{String}
    needs::String
end

long_stay(p::Pet) = p.days_in_shelter >= 120

const ALL = Pet[
    Pet("biscuit", "Biscuit", "dog", "Beagle mix", 4, 12,
        ["playful", "social", "good-with-kids"],
        "Daily walks; loves squeaky toys."),
    Pet("pepper", "Pepper", "cat", "Domestic Shorthair", 8, 247,
        ["mellow", "lap-cat", "solo"],
        "Quiet home preferred; no other cats."),
    Pet("marigold", "Marigold", "dog", "Senior Labrador", 11, 89,
        ["calm", "gentle", "low-energy"],
        "Joint supplements; short walks only."),
    Pet("tofu", "Tofu", "rabbit", "Holland Lop", 2, 31,
        ["curious", "social"],
        "Roomy enclosure and unlimited hay."),
    Pet("otis", "Otis", "dog", "Pittie mix", 5, 156,
        ["gentle", "good-with-kids", "no-cats"],
        "Cat-free home; loves toddlers."),
    Pet("juniper", "Juniper", "cat", "Tortoiseshell", 3, 22,
        ["vocal", "spunky", "solo"],
        "Only cat in the household, please."),
    Pet("maple", "Maple", "dog", "Mini Australian Shepherd", 1, 6,
        ["high-energy", "smart", "needs-training"],
        "Training class strongly recommended."),
    Pet("clover", "Clover & Sage", "guinea-pig", "Bonded pair", 1, 18,
        ["social", "bonded-pair"],
        "Must adopt together — bonded for life."),
]

const BY_SLUG = Dict{String,Pet}(lowercase(p.slug) => p for p in ALL)

function find_by_slug(slug)
    slug === nothing && return nothing
    return get(BY_SLUG, lowercase(String(slug)), nothing)
end

function filter_by_species(species)
    species === nothing && return ALL
    target = lowercase(String(species))
    return filter(p -> lowercase(p.species) == target, ALL)
end

end # module Pets
