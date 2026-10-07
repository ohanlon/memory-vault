using System.Text;
using System.Text.RegularExpressions;
using Cairn.Core.Markdown;

namespace Cairn.Core.Storage;

public sealed record SearchOptions(string Query, string Mode, bool WholeWord, bool? CaseSensitive);

public sealed record SearchMatch(int Line, string LineText, int Start, int End);

public sealed record SearchFileResult(string Path, string RelativePath, string Title, List<SearchMatch> Matches);

public sealed record ReplaceAllResult(int FilesChanged, int Replacements);

/// <summary>Port of shared/search.ts and electron/search.ts: find/replace across every note in a folder.</summary>
public static class Search
{
    // \b as JavaScript defines it (ASCII word characters only), spelled out so .NET's Unicode \b doesn't differ.
    private const string Word = "[A-Za-z0-9_]";
    private const string JsBoundary = $"(?:(?<={Word})(?!{Word})|(?<!{Word})(?={Word}))";

    /// <summary>Null for an empty query or an invalid regex pattern.</summary>
    public static Regex? BuildRegex(SearchOptions options)
    {
        if (string.IsNullOrEmpty(options.Query)) return null;
        var baseOptions = RegexOptions.CultureInvariant | (options.CaseSensitive == true ? RegexOptions.None : RegexOptions.IgnoreCase);

        if (options.Mode == "regex")
        {
            try
            {
                // ECMAScript mode makes \w, \d, \s and \b behave as they do in JavaScript; it rejects some
                // .NET-only constructs, in which case the pattern is retried in regular mode.
                return new Regex(options.Query, RegexOptions.ECMAScript | (baseOptions & RegexOptions.IgnoreCase));
            }
            catch (ArgumentException)
            {
                try
                {
                    return new Regex(options.Query, baseOptions);
                }
                catch (ArgumentException)
                {
                    return null;
                }
            }
        }

        var escaped = Regex.Escape(options.Query);
        var pattern = options.WholeWord ? $"{JsBoundary}{escaped}{JsBoundary}" : escaped;
        return new Regex(pattern, baseOptions);
    }

    private static readonly Regex LineBreak = new(@"\r\n|\r|\n", RegexOptions.CultureInvariant);

    public static List<SearchMatch> SearchContent(string content, SearchOptions options)
    {
        var matches = new List<SearchMatch>();
        var re = BuildRegex(options);
        if (re is null) return matches;

        var lines = LineBreak.Split(content);
        for (var idx = 0; idx < lines.Length; idx++)
        {
            foreach (Match m in re.Matches(lines[idx]))
                matches.Add(new SearchMatch(idx + 1, lines[idx], m.Index, m.Index + m.Length));
        }
        return matches;
    }

    private static readonly Regex ReplacementToken = new(@"\$([$&]|\d+)", RegexOptions.CultureInvariant);

    // In regex mode, substitutes $1/$2/$&/$$ against that match's capture groups; plain mode uses the text as-is.
    private static string ComputeReplacement(string replaceText, string mode, Match match)
    {
        if (mode != "regex") return replaceText;
        return ReplacementToken.Replace(replaceText, token =>
        {
            var group = token.Groups[1].Value;
            if (group == "&") return match.Value;
            if (group == "$") return "$";
            for (var len = group.Length; len > 0; len--)
            {
                var n = int.Parse(group[..len]);
                if (n > 0 && n < match.Groups.Count) return (match.Groups[n].Success ? match.Groups[n].Value : "") + group[len..];
            }
            return token.Value;
        });
    }

    public static (string Content, int Count) ReplaceAllInContent(string content, SearchOptions options, string replaceText)
    {
        var re = BuildRegex(options);
        if (re is null) return (content, 0);
        var matches = re.Matches(content);
        if (matches.Count == 0) return (content, 0);

        var result = new StringBuilder();
        var lastIndex = 0;
        foreach (Match m in matches)
        {
            result.Append(content, lastIndex, m.Index - lastIndex);
            result.Append(ComputeReplacement(replaceText, options.Mode, m));
            lastIndex = m.Index + m.Length;
        }
        result.Append(content, lastIndex, content.Length - lastIndex);
        return (result.ToString(), matches.Count);
    }

    /// <summary>Streams a result per matching file via <paramref name="onResult"/>, stopping early once <paramref name="isCancelled"/> turns true.</summary>
    public static async Task RunSearchAsync(string root, SearchOptions options, Action<SearchFileResult> onResult, Func<bool> isCancelled)
    {
        var files = NotesFolderFs.ListMarkdownFiles(root);
        foreach (var file in files)
        {
            if (isCancelled()) return;

            string content;
            try
            {
                content = await Files.ReadTextAsync(file);
            }
            catch (Exception e) when (e is IOException or UnauthorizedAccessException)
            {
                continue;
            }

            var matches = SearchContent(content, options);
            if (matches.Count > 0)
            {
                var relativePath = Path.GetRelativePath(root, file);
                onResult(new SearchFileResult(file, relativePath, NoteLinks.TitleFromPath(relativePath), matches));
            }

            await Task.Yield();
        }
    }

    /// <summary>Rewrites every file with a match; the file watcher then refreshes the app as for any external edit.</summary>
    public static async Task<ReplaceAllResult> RunReplaceAllAsync(string root, SearchOptions options, string replaceText)
    {
        var filesChanged = 0;
        var replacements = 0;
        foreach (var file in NotesFolderFs.ListMarkdownFiles(root))
        {
            string content;
            try
            {
                content = await Files.ReadTextAsync(file);
            }
            catch (Exception e) when (e is IOException or UnauthorizedAccessException)
            {
                continue;
            }

            var (updated, count) = ReplaceAllInContent(content, options, replaceText);
            if (count > 0)
            {
                await Files.WriteTextAsync(file, updated);
                filesChanged++;
                replacements += count;
            }
        }
        return new ReplaceAllResult(filesChanged, replacements);
    }
}
