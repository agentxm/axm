--- TinyFlags is a minimal feature-flag library with deterministic rollout bucketing.
--
-- Two flag kinds:
--   * BooleanFlag{ default = bool, rollout = int? }   on/off with optional percentage rollout.
--   * VariantFlag{ variants = {...}, default = str, rollout = { name = int, ... }? }
--     named treatment with optional per-variant allocations.
--
-- Evaluation context is a table with optional `user_id`, `account_id`, or `session_id` keys.
-- Bucketing uses a pure-Lua FNV-1a 32-bit hash of "<flag_name>:<context_id>" mod 100.
--
-- The library is intentionally dependency-free so it runs on Lua 5.1+ and LuaJIT
-- without external hashing rocks.

local M = {}

local function is_integer(value)
  return type(value) == "number" and value == math.floor(value)
end

local function validate_percentage(value, label)
  if type(value) == "boolean" or not is_integer(value) then
    error(label .. " must be an integer from 0 to 100", 2)
  end
  if value < 0 or value > 100 then
    error(label .. " must be an integer from 0 to 100", 2)
  end
  return value
end

-- FNV-1a 32-bit. Pure Lua, no external deps. Result fits in 32 bits.
local FNV_OFFSET = 2166136261
local FNV_PRIME = 16777619
local MASK_32 = 0xFFFFFFFF

local function fnv1a(str)
  local hash = FNV_OFFSET
  for i = 1, #str do
    hash = (hash ~ string.byte(str, i)) & MASK_32
    hash = (hash * FNV_PRIME) & MASK_32
  end
  return hash
end

--- Compute the deterministic 0..99 bucket for a flag name and context.
-- @param flag_name string
-- @param context  table | nil
function M.bucket(flag_name, context)
  local key = "anonymous"
  if type(context) == "table" then
    key = context.user_id or context.account_id or context.session_id or "anonymous"
  end
  return fnv1a(flag_name .. ":" .. tostring(key)) % 100
end

local BooleanFlag = {}
BooleanFlag.__index = BooleanFlag

--- Create a boolean feature flag.
-- @param opts table { default = bool, rollout = int? }
function M.BooleanFlag(opts)
  if type(opts) ~= "table" then
    error("BooleanFlag requires an options table", 2)
  end
  if type(opts.default) ~= "boolean" then
    error("BooleanFlag default must be true or false", 2)
  end
  local rollout = nil
  if opts.rollout ~= nil then
    rollout = validate_percentage(opts.rollout, "BooleanFlag rollout")
  end
  local flag = setmetatable({
    kind = "boolean",
    default = opts.default,
    rollout = rollout,
  }, BooleanFlag)
  return flag
end

local VariantFlag = {}
VariantFlag.__index = VariantFlag

local function copy_string_array(arr, label)
  if type(arr) ~= "table" or #arr == 0 then
    error(label .. " requires at least one variant", 2)
  end
  local out = {}
  local seen = {}
  for i = 1, #arr do
    local v = arr[i]
    if type(v) ~= "string" or v == "" then
      error(label .. " variants must be unique non-empty strings", 2)
    end
    if seen[v] then
      error(label .. " variants must be unique non-empty strings", 2)
    end
    seen[v] = true
    out[i] = v
  end
  return out, seen
end

--- Create a variant flag with allowed values and an optional rollout map.
-- @param opts table { variants = {...}, default = str, rollout = { name = int, ... }? }
function M.VariantFlag(opts)
  if type(opts) ~= "table" then
    error("VariantFlag requires an options table", 2)
  end
  local variants, seen = copy_string_array(opts.variants, "VariantFlag")
  if type(opts.default) ~= "string" or not seen[opts.default] then
    error("VariantFlag default must be one of the variants", 2)
  end

  local rollout = nil
  if opts.rollout ~= nil then
    if type(opts.rollout) ~= "table" then
      error("VariantFlag rollout must be a table", 2)
    end
    rollout = {}
    local total = 0
    for name, percentage in pairs(opts.rollout) do
      if not seen[name] then
        error("VariantFlag rollout references unknown variant: " .. tostring(name), 2)
      end
      rollout[name] = validate_percentage(percentage, "rollout for '" .. name .. "'")
      total = total + rollout[name]
    end
    if total > 100 then
      error("VariantFlag rollout percentages cannot exceed 100", 2)
    end
  end

  return setmetatable({
    kind = "variant",
    variants = variants,
    default = opts.default,
    rollout = rollout,
  }, VariantFlag)
end

local Registry = {}
Registry.__index = Registry

--- Create a registry from a definitions table.
-- @param definitions table { [name] = BooleanFlag | VariantFlag, ... }
function M.Registry(definitions)
  if type(definitions) ~= "table" then
    error("TinyFlags.Registry requires a definitions table", 2)
  end
  local defs = {}
  local order = {}
  for name, flag in pairs(definitions) do
    if type(flag) ~= "table" or (flag.kind ~= "boolean" and flag.kind ~= "variant") then
      error("Definition for '" .. tostring(name) .. "' must be BooleanFlag or VariantFlag", 2)
    end
    defs[name] = flag
    order[#order + 1] = name
  end
  return setmetatable({ definitions = defs, _order = order }, Registry)
end

local function lookup(self, name)
  local flag = self.definitions[name]
  if flag == nil then
    error("Unknown TinyFlags flag: " .. tostring(name), 3)
  end
  return flag
end

function Registry:names()
  local out = {}
  for i = 1, #self._order do
    out[i] = self._order[i]
  end
  return out
end

function Registry:has(name)
  return self.definitions[name] ~= nil
end

function Registry:is_enabled(name, context)
  local flag = lookup(self, name)
  if flag.kind ~= "boolean" then
    error("TinyFlags flag '" .. name .. "' is not a boolean flag", 2)
  end
  if flag.rollout == nil then
    return flag.default
  end
  return M.bucket(name, context) < flag.rollout
end

function Registry:variant(name, context)
  local flag = lookup(self, name)
  if flag.kind ~= "variant" then
    error("TinyFlags flag '" .. name .. "' is not a variant flag", 2)
  end
  if flag.rollout == nil then
    return flag.default
  end
  local bucket = M.bucket(name, context)
  local upper = 0
  -- Iterate in declared variant order for stable allocation.
  for i = 1, #flag.variants do
    local v = flag.variants[i]
    local pct = flag.rollout[v]
    if pct ~= nil then
      upper = upper + pct
      if bucket < upper then
        return v
      end
    end
  end
  return flag.default
end

function Registry:evaluate(name, context)
  local flag = lookup(self, name)
  if flag.kind == "boolean" then
    return self:is_enabled(name, context)
  end
  return self:variant(name, context)
end

return M
