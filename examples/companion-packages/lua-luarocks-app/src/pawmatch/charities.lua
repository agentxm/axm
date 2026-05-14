--- Static, curated list of animal-welfare charities. Example data only —
-- consumers must verify current ratings on Charity Navigator or GuideStar
-- before giving. PawMatch never processes payments.

local M = {}

M.ALL = {
  {
    slug = "best-friends",
    name = "Best Friends Animal Society",
    focus = "shelters",
    description = "No-kill movement; supports adoptions, shelters, and advocacy nationwide.",
    url = "https://bestfriends.org/donate",
    rating_note = "Charity Navigator 4-star",
  },
  {
    slug = "petsmart-charities",
    name = "PetSmart Charities",
    focus = "shelters",
    description = "Grants to local shelters; spay/neuter; adoption events.",
    url = "https://petsmartcharities.org/donate",
    rating_note = "Charity Navigator 4-star (96% program ratio)",
  },
  {
    slug = "brother-wolf",
    name = "Brother Wolf Animal Rescue",
    focus = "rescue",
    description = "Local rescue with national-impact outreach programs.",
    url = "https://bwar.org/donate",
    rating_note = "Charity Navigator 4-star, GuideStar Platinum",
  },
  {
    slug = "animal-welfare-institute",
    name = "Animal Welfare Institute",
    focus = "policy",
    description = "Policy and advocacy reducing cruelty inflicted on animals.",
    url = "https://awionline.org/donate",
    rating_note = "Charity Navigator 4-star",
  },
  {
    slug = "aspca",
    name = "ASPCA",
    focus = "shelters",
    description = "Adoption, anti-cruelty programs, and animal welfare advocacy.",
    url = "https://www.aspca.org/donate",
    rating_note = "Charity Navigator 4-star",
  },
}

M.DISCLAIMER =
  "Curated example list — verify current ratings on Charity Navigator or " ..
  "GuideStar before giving."

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

function M.filter_by_focus(focus)
  if focus == nil or string.lower(focus) == "all" then
    return M.ALL
  end
  local target = string.lower(focus)
  local out = {}
  for i = 1, #M.ALL do
    if string.lower(M.ALL[i].focus) == target then
      out[#out + 1] = M.ALL[i]
    end
  end
  return out
end

return M
