namespace AgentXM.Examples.PawMatch.CSharp;

internal enum PetCardStyle
{
    Compact,
    Detailed,
    Playful,
}

internal enum MatchStrategy
{
    Popularity,
    MatchQuiz,
    LongestStay,
}

internal enum MatchDepth
{
    Short,
    Standard,
    Thorough,
}

internal enum DonateFocus
{
    All,
    Shelters,
    Rescue,
}

internal static class Variants
{
    public static T Parse<T>(string value) where T : struct, Enum
    {
        Span<char> buffer = stackalloc char[value.Length];
        var length = 0;
        var capitalize = true;
        foreach (var ch in value)
        {
            if (ch == '-')
            {
                capitalize = true;
                continue;
            }
            buffer[length++] = capitalize ? char.ToUpperInvariant(ch) : ch;
            capitalize = false;
        }

        if (!Enum.TryParse<T>(buffer[..length], ignoreCase: false, out var parsed))
        {
            throw new InvalidOperationException(
                $"Unknown {typeof(T).Name} variant '{value}'.");
        }
        return parsed;
    }

    public static string ToKebab<T>(T value) where T : struct, Enum
    {
        var name = value.ToString();
        var sb = new System.Text.StringBuilder(name.Length + 4);
        for (var i = 0; i < name.Length; i++)
        {
            var ch = name[i];
            if (i > 0 && char.IsUpper(ch))
            {
                sb.Append('-');
            }
            sb.Append(char.ToLowerInvariant(ch));
        }
        return sb.ToString();
    }
}
