# frozen_string_literal: true

require "digest"

# TinyFlags is a minimal feature-flag library with deterministic rollout bucketing.
#
# Two flag kinds:
#   - BooleanFlag(default:, rollout: nil) — on/off with optional percentage rollout.
#   - VariantFlag(variants:, default:, rollout: nil) — named treatment with optional allocations.
#
# Evaluation context is a Hash with optional :user_id, :account_id, or :session_id keys.
# Bucketing uses Digest::SHA1 over "<flag_name>:<context_id>" → integer in 0..99.
module TinyFlags
  # Validate that a percentage is an Integer in 0..100. Booleans are rejected.
  def self.validate_percentage!(value, label)
    if value.is_a?(TrueClass) || value.is_a?(FalseClass) || !value.is_a?(Integer)
      raise TypeError, "#{label} must be an Integer from 0 to 100"
    end
    raise ArgumentError, "#{label} must be an Integer from 0 to 100" if value.negative? || value > 100

    value
  end

  # Boolean feature flag with optional percentage rollout.
  class BooleanFlag
    attr_reader :default, :rollout

    def initialize(default: false, rollout: nil)
      unless default.is_a?(TrueClass) || default.is_a?(FalseClass)
        raise TypeError, "BooleanFlag default must be true or false"
      end

      @default = default
      @rollout = rollout.nil? ? nil : TinyFlags.validate_percentage!(rollout, "BooleanFlag rollout")
      freeze
    end
  end

  # Named-variant flag with optional per-variant allocations.
  class VariantFlag
    attr_reader :variants, :default, :rollout

    def initialize(variants:, default:, rollout: nil)
      unless variants.is_a?(Array) && !variants.empty?
        raise ArgumentError, "VariantFlag requires at least one variant"
      end

      string_variants = variants.map(&:to_s)
      if string_variants.uniq.length != string_variants.length || string_variants.any?(&:empty?)
        raise ArgumentError, "VariantFlag variants must be unique non-empty strings"
      end

      default_str = default.to_s
      raise ArgumentError, "VariantFlag default must be one of the variants" unless string_variants.include?(default_str)

      @variants = string_variants.freeze
      @default = default_str

      if rollout.nil?
        @rollout = nil
      else
        raise ArgumentError, "VariantFlag rollout must be a Hash" unless rollout.is_a?(Hash)

        total = 0
        normalized = {}
        rollout.each do |name, percentage|
          name_str = name.to_s
          unless string_variants.include?(name_str)
            raise ArgumentError, "VariantFlag rollout references unknown variant: #{name_str}"
          end

          normalized[name_str] = TinyFlags.validate_percentage!(percentage, "rollout for #{name_str.inspect}")
          total += normalized[name_str]
        end
        raise ArgumentError, "VariantFlag rollout percentages cannot exceed 100" if total > 100

        @rollout = normalized.freeze
      end

      freeze
    end
  end

  # A frozen set of flag definitions evaluated against a Hash context.
  class Registry
    def initialize(definitions)
      raise TypeError, "TinyFlags::Registry requires a definitions Hash" unless definitions.is_a?(Hash)

      @definitions = {}
      definitions.each do |name, flag|
        unless flag.is_a?(BooleanFlag) || flag.is_a?(VariantFlag)
          raise TypeError, "Definition for #{name.inspect} must be BooleanFlag or VariantFlag"
        end

        @definitions[name.to_s] = flag
      end
      @definitions.freeze
      freeze
    end

    attr_reader :definitions

    def names
      @definitions.keys
    end

    def include?(name)
      @definitions.key?(name.to_s)
    end

    def enabled?(name, context = nil)
      flag = lookup(name)
      raise TypeError, "TinyFlags flag #{name.inspect} is not a boolean flag" unless flag.is_a?(BooleanFlag)
      return flag.default if flag.rollout.nil?

      TinyFlags.bucket(name.to_s, context) < flag.rollout
    end

    def variant(name, context = nil)
      flag = lookup(name)
      raise TypeError, "TinyFlags flag #{name.inspect} is not a variant flag" unless flag.is_a?(VariantFlag)
      return flag.default if flag.rollout.nil?

      bucket = TinyFlags.bucket(name.to_s, context)
      upper_bound = 0
      flag.rollout.each do |variant_name, percentage|
        upper_bound += percentage
        return variant_name if bucket < upper_bound
      end
      flag.default
    end

    def evaluate(name, context = nil)
      flag = lookup(name)
      flag.is_a?(BooleanFlag) ? enabled?(name, context) : variant(name, context)
    end

    private

    def lookup(name)
      key = name.to_s
      flag = @definitions[key]
      raise KeyError, "Unknown TinyFlags flag: #{key}" if flag.nil?

      flag
    end
  end

  # Compute the deterministic 0..99 bucket for a flag name and context.
  # Context may be nil or a Hash with :user_id / :account_id / :session_id.
  def self.bucket(flag_name, context)
    key = "anonymous"
    if context.is_a?(Hash)
      key = context[:user_id] || context[:account_id] || context[:session_id] ||
            context["user_id"] || context["account_id"] || context["session_id"] ||
            "anonymous"
    end
    digest = Digest::SHA1.hexdigest("#{flag_name}:#{key}")
    digest[0, 8].to_i(16) % 100
  end
end
