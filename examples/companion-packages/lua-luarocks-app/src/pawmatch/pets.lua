--- Static catalog of adoptable pets used by the PawMatch demo CLI.

local M = {}

local function contains(arr, value)
  for i = 1, #arr do
    if arr[i] == value then
      return true
    end
  end
  return false
end

local function long_stay(pet)
  return pet.days_in_shelter >= 120
end

M.ALL = {
  {
    slug = "biscuit", name = "Biscuit", species = "dog", breed = "Beagle mix",
    age_years = 4, days_in_shelter = 12,
    tags = { "playful", "social", "good-with-kids" },
    needs = "Daily walks; loves squeaky toys.",
  },
  {
    slug = "pepper", name = "Pepper", species = "cat", breed = "Domestic Shorthair",
    age_years = 8, days_in_shelter = 247,
    tags = { "mellow", "lap-cat", "solo" },
    needs = "Quiet home preferred; no other cats.",
  },
  {
    slug = "marigold", name = "Marigold", species = "dog", breed = "Senior Labrador",
    age_years = 11, days_in_shelter = 89,
    tags = { "calm", "gentle", "low-energy" },
    needs = "Joint supplements; short walks only.",
  },
  {
    slug = "tofu", name = "Tofu", species = "rabbit", breed = "Holland Lop",
    age_years = 2, days_in_shelter = 31,
    tags = { "curious", "social" },
    needs = "Roomy enclosure and unlimited hay.",
  },
  {
    slug = "otis", name = "Otis", species = "dog", breed = "Pittie mix",
    age_years = 5, days_in_shelter = 156,
    tags = { "gentle", "good-with-kids", "no-cats" },
    needs = "Cat-free home; loves toddlers.",
  },
  {
    slug = "juniper", name = "Juniper", species = "cat", breed = "Tortoiseshell",
    age_years = 3, days_in_shelter = 22,
    tags = { "vocal", "spunky", "solo" },
    needs = "Only cat in the household, please.",
  },
  {
    slug = "maple", name = "Maple", species = "dog", breed = "Mini Australian Shepherd",
    age_years = 1, days_in_shelter = 6,
    tags = { "high-energy", "smart", "needs-training" },
    needs = "Training class strongly recommended.",
  },
  {
    slug = "clover", name = "Clover & Sage", species = "guinea-pig", breed = "Bonded pair",
    age_years = 1, days_in_shelter = 18,
    tags = { "social", "bonded-pair" },
    needs = "Must adopt together — bonded for life.",
  },
}

function M.find_by_slug(slug)
  if slug == nil then
    return nil
  end
  local target = string.lower(slug)
  for i = 1, #M.ALL do
    if string.lower(M.ALL[i].slug) == target then
      return M.ALL[i]
    end
  end
  return nil
end

function M.filter_by_species(species)
  if species == nil then
    return M.ALL
  end
  local target = string.lower(species)
  local out = {}
  for i = 1, #M.ALL do
    if string.lower(M.ALL[i].species) == target then
      out[#out + 1] = M.ALL[i]
    end
  end
  return out
end

function M.long_stay(pet)
  return long_stay(pet)
end

function M.tag_matches(pet, wants)
  local count = 0
  for i = 1, #pet.tags do
    if contains(wants, pet.tags[i]) then
      count = count + 1
    end
  end
  return count
end

return M
