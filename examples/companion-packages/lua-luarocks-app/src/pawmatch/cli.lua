--- pawmatch CLI — community pet-adoption demo driven by TinyFlags.
--
-- Subcommands are parsed by hand to avoid third-party CLI dependencies on
-- LuaRocks.

local Flags = require("pawmatch.flags")
local Pets = require("pawmatch.pets")
local Charities = require("pawmatch.charities")

local M = {}

local USAGE = [[
pawmatch — community pet-adoption CLI.

Usage: pawmatch <command> [options]

Commands:
  browse [--species SPECIES]   List adoptable pets
  show <pet>                   Show details for a pet
  match [match flags]          Match pets to your lifestyle
  apply <pet>                  Start an adoption application
  fees                         Show adoption fees
  return-support               No-judgment return information
  donate [--focus FOCUS]       Browse charities to support
  donate <slug> --open         Open a charity's donation URL
]]

local POPULARITY_TAGS = { "social", "good-with-kids", "calm", "mellow", "gentle" }

-- Ordered (factor flag, [matching pet tags]) tuples — the quiz depth
-- variant controls how many factors are considered.
local ALL_FACTORS = {
  { "has-kids",      { "good-with-kids", "gentle" } },
  { "quiet-home",    { "mellow", "calm", "solo", "lap-cat" } },
  { "active",        { "high-energy", "playful" } },
  { "first-time",    { "gentle", "calm", "low-energy" } },
  { "multiple-pets", { "social" } },
  { "small-home",    { "lap-cat", "solo", "low-energy" } },
}

local function contains(arr, value)
  for i = 1, #arr do
    if arr[i] == value then
      return true
    end
  end
  return false
end

local function writeln(out, s)
  out:write(s or "")
  out:write("\n")
end

local function session_id()
  local user = os.getenv("USER") or os.getenv("USERNAME") or os.getenv("LOGNAME")
  if user == nil or user == "" then
    return "anonymous"
  end
  return user
end

local function context()
  return { session_id = session_id() }
end

local function factors_for_depth(depth)
  local take
  if depth == "short" then
    take = 2
  elseif depth == "thorough" then
    take = 6
  else
    take = 4
  end
  local out = {}
  for i = 1, math.min(take, #ALL_FACTORS) do
    out[i] = ALL_FACTORS[i]
  end
  return out
end

local function render_pet(pet, style, out)
  local badge = Pets.long_stay(pet) and " *" or ""
  if style == "compact" then
    writeln(out, string.format(
      "  %-10s %-14s %-10s %dy%s",
      pet.slug, pet.name, pet.species, pet.age_years, badge
    ))
  elseif style == "playful" then
    local tag_phrase = table.concat(pet.tags, " & ")
    writeln(out, "  paw " .. pet.name .. badge .. " — a " .. pet.age_years ..
                 "-year-old " .. string.lower(pet.breed) .. " who is " .. tag_phrase .. ".")
  else
    writeln(out, "  " .. pet.name .. badge .. "  [" .. pet.slug .. "]")
    writeln(out, "    " .. pet.breed .. ", " .. pet.age_years .. " years old")
    writeln(out, "    Tags: " .. table.concat(pet.tags, ", "))
    writeln(out, "")
  end
end

local function render_charity(charity, show_ratings, out)
  writeln(out, "  " .. charity.name .. "  [" .. charity.slug .. "]")
  writeln(out, "    Focus: " .. charity.focus)
  writeln(out, "    " .. charity.description)
  writeln(out, "    Donate: " .. charity.url)
  if show_ratings then
    writeln(out, "    Rating: " .. charity.rating_note)
  end
end

-- Pick a host-appropriate command to open a URL. `package.config:sub(1, 1)`
-- is "/" on POSIX and "\\" on Windows. On POSIX we prefer `open` if it
-- exists (macOS) and fall back to `xdg-open` (Linux); rather than probing
-- the filesystem we try `open` first and `xdg-open` if it fails.
local function open_url(url, _out, err)
  local quoted = string.format("%q", url)
  local is_windows = package.config:sub(1, 1) == "\\"
  if is_windows then
    local ok = os.execute("cmd /c start \"\" " .. quoted)
    if ok ~= true and ok ~= 0 then
      err:write("Unable to open browser. URL: " .. url .. "\n")
      return 1
    end
    return 0
  end

  local ok = os.execute("open " .. quoted .. " >/dev/null 2>&1")
  if ok == true or ok == 0 then
    return 0
  end
  ok = os.execute("xdg-open " .. quoted .. " >/dev/null 2>&1")
  if ok == true or ok == 0 then
    return 0
  end
  err:write("Unable to open browser. URL: " .. url .. "\n")
  return 1
end

-- Tiny option parser: supports --flag (boolean), --flag=value, and --flag value
-- forms. The `schema` table maps option names to a kind: "bool" for boolean
-- flags or "string" for options that expect a value. Unknown `--option`
-- arguments fall through to the positional list.
local function parse_options(argv, schema, defaults)
  local opts = {}
  if defaults then
    for k, v in pairs(defaults) do
      opts[k] = v
    end
  end
  for k, kind in pairs(schema) do
    if kind == "bool" and opts[k] == nil then
      opts[k] = false
    end
  end
  local positional = {}
  local i = 1
  while i <= #argv do
    local a = argv[i]
    if a:sub(1, 2) == "--" then
      local body = a:sub(3)
      local key, value
      local eq = body:find("=", 1, true)
      if eq then
        key = body:sub(1, eq - 1)
        value = body:sub(eq + 1)
      else
        key = body
      end
      local kind = schema[key]
      if kind == nil then
        positional[#positional + 1] = a
      elseif kind == "bool" then
        opts[key] = true
      else
        if value == nil then
          i = i + 1
          value = argv[i]
        end
        opts[key] = value
      end
    else
      positional[#positional + 1] = a
    end
    i = i + 1
  end
  return opts, positional
end

local function cmd_browse(argv, stdout, _stderr)
  local opts = parse_options(argv, { species = "string" })
  local matching = Pets.filter_by_species(opts.species)
  if #matching == 0 then
    writeln(stdout, "No adoptable pets found for species '" .. tostring(opts.species) .. "'.")
    return 0
  end

  local flags = Flags.build_registry()
  local ctx = context()

  if flags:is_enabled(Flags.LONG_STAY_HIGHLIGHT, ctx) then
    local long_stay_pets = {}
    for i = 1, #matching do
      if Pets.long_stay(matching[i]) then
        long_stay_pets[#long_stay_pets + 1] = matching[i]
      end
    end
    table.sort(long_stay_pets, function(a, b) return a.days_in_shelter > b.days_in_shelter end)
    if #long_stay_pets > 0 then
      local featured = long_stay_pets[1]
      writeln(stdout, "* Featured long-stay friend — please consider " .. featured.name .. "!")
      writeln(stdout, "")
    end
  end

  local style = flags:variant(Flags.PET_CARD_STYLE, ctx)
  for i = 1, #matching do
    render_pet(matching[i], style, stdout)
  end
  return 0
end

local function cmd_show(argv, stdout, stderr)
  local slug = argv[1]
  if slug == nil then
    stderr:write("Usage: pawmatch show <pet>\n")
    return 1
  end
  local pet = Pets.find_by_slug(slug)
  if pet == nil then
    stderr:write("Unknown pet '" .. slug .. "'. Try 'pawmatch browse'.\n")
    return 1
  end
  render_pet(pet, "detailed", stdout)
  writeln(stdout, "  Needs: " .. pet.needs)
  local suffix = Pets.long_stay(pet) and " (long-stay)" or ""
  writeln(stdout, "  Days in shelter: " .. pet.days_in_shelter .. suffix)
  return 0
end

local function cmd_match(argv, stdout, _stderr)
  local opts, _ = parse_options(argv, {
    ["has-kids"]      = "bool",
    ["quiet-home"]    = "bool",
    ["active"]        = "bool",
    ["first-time"]    = "bool",
    ["multiple-pets"] = "bool",
    ["small-home"]    = "bool",
  })

  local flags = Flags.build_registry()
  local ctx = context()
  local strategy = flags:variant(Flags.RECOMMENDATION_STRATEGY, ctx)
  local depth = flags:variant(Flags.MATCH_QUIZ_DEPTH, ctx)
  local factors = factors_for_depth(depth)

  local wants = {}
  for i = 1, #factors do
    local factor_name, factor_tags = factors[i][1], factors[i][2]
    if opts[factor_name] then
      for j = 1, #factor_tags do
        wants[#wants + 1] = factor_tags[j]
      end
    end
  end

  writeln(stdout, "Strategy: " .. strategy .. " • Quiz depth: " .. depth ..
                  " (" .. #factors .. " factor(s) considered)")

  local any = false
  for _, v in pairs(opts) do
    if v == true then any = true; break end
  end
  if not any then
    writeln(stdout, "(no preference flags provided — try --has-kids --quiet-home --active --first-time)")
  end
  writeln(stdout, "")

  local ranked = {}
  for i = 1, #Pets.ALL do ranked[i] = Pets.ALL[i] end

  if strategy == "popularity" then
    table.sort(ranked, function(a, b)
      return Pets.tag_matches(a, POPULARITY_TAGS) > Pets.tag_matches(b, POPULARITY_TAGS)
    end)
  elseif strategy == "longest-stay" then
    table.sort(ranked, function(a, b) return a.days_in_shelter > b.days_in_shelter end)
  else
    table.sort(ranked, function(a, b)
      return Pets.tag_matches(a, wants) > Pets.tag_matches(b, wants)
    end)
  end

  local limit = math.min(3, #ranked)
  for i = 1, limit do
    local pet = ranked[i]
    writeln(stdout, "  • " .. pet.name .. " (" .. pet.breed .. ", " ..
                    pet.age_years .. "y) — " .. table.concat(pet.tags, ", "))
  end

  writeln(stdout, "")
  writeln(stdout, "Adoption is a conversation — book a meet-and-greet to see if it's a fit.")
  return 0
end

local function cmd_apply(argv, stdout, stderr)
  local slug = argv[1]
  if slug == nil then
    stderr:write("Usage: pawmatch apply <pet>\n")
    return 1
  end
  local pet = Pets.find_by_slug(slug)
  if pet == nil then
    stderr:write("Unknown pet '" .. slug .. "'. Try 'pawmatch browse'.\n")
    return 1
  end

  writeln(stdout, "Adoption application for " .. pet.name)
  writeln(stdout, "")
  writeln(stdout, "Next steps:")
  writeln(stdout, "  1. Application reviewed by an adoption counselor (1-2 days).")
  writeln(stdout, "  2. Meet-and-greet scheduled at the shelter.")
  writeln(stdout, "  3. 48-hour reflection period before finalizing.")
  writeln(stdout, "  4. Take-home day — fees cover spay/neuter, vaccines, and microchip.")

  local flags = Flags.build_registry()
  local ctx = context()
  if flags:is_enabled(Flags.HOME_CHECK_FOLLOWUP, ctx) then
    writeln(stdout, "  5. Two-week follow-up check from a counselor to see how you're settling in.")
  end

  writeln(stdout, "")
  writeln(stdout, "Returns are always accepted, no questions asked.")

  if flags:is_enabled(Flags.SUGGEST_DONATE_AFTER_ADOPTION, ctx) then
    writeln(stdout, "")
    writeln(stdout, "If " .. pet.name .. " brings you joy, please consider donating to a shelter:")
    writeln(stdout, "  pawmatch donate")
  end
  return 0
end

local function cmd_fees(_argv, stdout, _stderr)
  local flags = Flags.build_registry()
  local ctx = context()

  writeln(stdout, "Adoption fees")
  writeln(stdout, "")
  if flags:is_enabled(Flags.FEE_BREAKDOWN_DETAILED, ctx) then
    writeln(stdout, "  Dog adoption — $150 total:")
    writeln(stdout, "    $60   spay / neuter surgery")
    writeln(stdout, "    $45   core vaccinations")
    writeln(stdout, "    $25   microchip and registration")
    writeln(stdout, "    $20   intake exam and deworming")
    writeln(stdout, "")
    writeln(stdout, "  Cat adoption — $90 total:")
    writeln(stdout, "    $50   spay / neuter surgery")
    writeln(stdout, "    $25   core vaccinations")
    writeln(stdout, "    $15   microchip and registration")
    writeln(stdout, "")
    writeln(stdout, "  Small animal — $35 total (intake exam + microchip).")
  else
    writeln(stdout, "  Dog adoption           $150")
    writeln(stdout, "  Cat adoption            $90")
    writeln(stdout, "  Small animal            $35")
    writeln(stdout, "")
    writeln(stdout, "  Fees cover spay/neuter, vaccines, and microchip.")
  end

  writeln(stdout, "")
  writeln(stdout, "No one is turned away for inability to pay — ask about our subsidy fund.")
  return 0
end

local function cmd_return_support(_argv, stdout, _stderr)
  writeln(stdout, "Return support")
  writeln(stdout, "")
  writeln(stdout, "If your adoption isn't working out, we're here to help.")
  writeln(stdout, "  • Free behavior consultation with our trainers.")
  writeln(stdout, "  • No-judgment returns at any time — your pet stays in our care.")
  writeln(stdout, "  • Connections to low-cost vet and food assistance programs.")
  writeln(stdout, "")
  writeln(stdout, "Returning a pet is not a failure. Reach out as soon as you'd like support.")
  return 0
end

local function cmd_donate(argv, stdout, stderr)
  local opts, positional = parse_options(argv, { focus = "string", open = "bool" })
  local charity_slug = positional[1]

  local flags = Flags.build_registry()
  local ctx = context()
  local default_focus = flags:variant(Flags.DONATE_FOCUS_DEFAULT, ctx)
  local effective_focus = opts.focus or default_focus
  local show_ratings = flags:is_enabled(Flags.SHOW_CHARITY_RATINGS, ctx)

  if charity_slug then
    local target = Charities.find_by_slug(charity_slug)
    if target == nil then
      stderr:write("Unknown charity '" .. charity_slug .. "'.\n")
      return 1
    end
    if opts.open then
      return open_url(target.url, stdout, stderr)
    end
    render_charity(target, show_ratings, stdout)
    return 0
  end

  local listing = Charities.filter_by_focus(effective_focus)
  writeln(stdout, "Animal-welfare charities (focus: " .. effective_focus .. ")")
  writeln(stdout, "")
  for i = 1, #listing do
    render_charity(listing[i], show_ratings, stdout)
    writeln(stdout, "")
  end
  writeln(stdout, Charities.DISCLAIMER)
  if not show_ratings then
    writeln(stdout, "Ratings hidden — set show-charity-ratings to surface them inline.")
  end
  return 0
end

local DISPATCH = {
  ["browse"]         = cmd_browse,
  ["show"]           = cmd_show,
  ["match"]          = cmd_match,
  ["apply"]          = cmd_apply,
  ["fees"]           = cmd_fees,
  ["return-support"] = cmd_return_support,
  ["donate"]         = cmd_donate,
}

--- Run the CLI with argument vector `argv` (a 1-indexed Lua array of strings).
-- `streams.stdout` / `streams.stderr` default to `io.stdout` / `io.stderr`.
function M.run(argv, streams)
  streams = streams or {}
  local stdout = streams.stdout or io.stdout
  local stderr = streams.stderr or io.stderr

  argv = argv or {}
  local command = argv[1]
  if command == nil or command == "--help" or command == "-h" then
    stdout:write(USAGE)
    return 0
  end

  local rest = {}
  for i = 2, #argv do rest[i - 1] = argv[i] end

  local handler = DISPATCH[command]
  if handler == nil then
    stderr:write("Unknown command: " .. command .. "\n")
    stderr:write(USAGE)
    return 1
  end
  return handler(rest, stdout, stderr)
end

return M
