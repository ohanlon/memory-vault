using System.Text;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using Cairn.Core.Models;

namespace Cairn.Core.Markdown;

/// <summary>
/// Port of shared/noteLinks.ts. Regexes spell out ASCII classes (<c>[0-9A-Za-z_]</c>) wherever the JS
/// original relies on <c>\w</c>/<c>\d</c>, and use <c>\z</c> where JS <c>$</c> means end-of-input, so matching
/// is identical to Node's.
/// </summary>
public static class NoteLinks
{
    private const RegexOptions Opts = RegexOptions.CultureInvariant;

    public static readonly Regex WikilinkRe = new(@"\[\[([^\]|#]+)(?:#([^\]|]+))?(?:\|([^\]]+))?\]\]", Opts);
    public static readonly Regex MarkdownLinkRe = new(@"(?<!!)\[([^\]]*)\]\(([^)]+)\)", Opts);
    public static readonly Regex ExternalSchemeRe = new(@"^(https?:|mailto:)", Opts | RegexOptions.IgnoreCase);
    private static readonly Regex OtherSchemeRe = new(@"^[a-z][a-z0-9+.-]*:", Opts | RegexOptions.IgnoreCase);
    private static readonly Regex ImageEmbedRe = new(@"!\[([^\]]*)\]\(([^)]+)\)", Opts);
    private static readonly Regex TitleSuffixRe = new(@"\s+([""'])(?:(?!\1)[\s\S])*\1\z", Opts);
    // #tag or #nested/tag, not preceded by a word char, "#" or "/"; must start with a letter.
    private static readonly Regex InlineTagPattern = new(
        @"(?<![A-Za-z0-9_#/])#([a-zA-Z][A-Za-z0-9_\-]*(?:/[a-zA-Z][A-Za-z0-9_\-]*)*)", Opts);

    private static readonly Regex FencedBacktick = new(@"```[\s\S]*?```", Opts);
    private static readonly Regex FencedTilde = new(@"~~~[\s\S]*?~~~", Opts);
    private static readonly Regex InlineCode = new(@"`[^`\n]+`", Opts);

    private static string Blank(Match m) => new(' ', m.Length);

    /// <summary>Replaces fenced and inline code spans with equal-length spaces so extraction never looks inside code.</summary>
    public static string MaskCodeSpans(string content)
    {
        var s = FencedBacktick.Replace(content, Blank);
        s = FencedTilde.Replace(s, Blank);
        return InlineCode.Replace(s, Blank);
    }

    public static List<WikiLink> ExtractWikiLinks(string content)
    {
        var links = new List<WikiLink>();
        var masked = MaskCodeSpans(content);
        foreach (Match m in WikilinkRe.Matches(masked))
        {
            links.Add(new WikiLink
            {
                Target = m.Groups[1].Value.Trim(),
                Header = m.Groups[2].Success ? m.Groups[2].Value.Trim() : null,
                Alias = m.Groups[3].Success ? m.Groups[3].Value.Trim() : null,
            });
        }
        return links;
    }

    // Drops an optional trailing "title"/'title' and unwraps a <...>-bracketed destination.
    private static string CleanMarkdownLinkHref(string hrefRaw)
    {
        var href = hrefRaw.Trim();
        var titleSuffix = TitleSuffixRe.Match(href);
        if (titleSuffix.Success) href = href[..titleSuffix.Index].Trim();
        if (href.StartsWith('<'))
        {
            var end = href.IndexOf('>');
            href = end >= 0 ? href[1..end] : href[1..];
        }
        return href;
    }

    public static List<WikiLink> ExtractMarkdownLinks(string content)
    {
        var links = new List<WikiLink>();
        var masked = MaskCodeSpans(content);
        foreach (Match m in MarkdownLinkRe.Matches(masked))
        {
            var text = m.Groups[1].Value;
            var href = CleanMarkdownLinkHref(m.Groups[2].Value);
            if (href.Length == 0 || href.StartsWith('#')) continue;

            if (ExternalSchemeRe.IsMatch(href))
            {
                var extAlias = text.Trim();
                links.Add(new WikiLink { Target = href, Alias = extAlias.Length > 0 ? extAlias : null, External = true });
                continue;
            }
            if (OtherSchemeRe.IsMatch(href)) continue;

            var parts = href.Split('#');
            var pathPart = parts[0];
            var headerPart = parts.Length > 1 ? parts[1] : null;
            if (!pathPart.EndsWith(".md", StringComparison.OrdinalIgnoreCase)) continue;

            var target = TitleFromPath(JsUri.TryDecodeComponent(pathPart) ?? pathPart);
            var alias = text.Trim();
            var header = headerPart?.Trim();
            links.Add(new WikiLink
            {
                Target = target,
                Header = string.IsNullOrEmpty(header) ? null : header,
                Alias = alias.Length > 0 && alias != target ? alias : null,
            });
        }
        return links;
    }

    public static string RewriteWikilinksForExport(string content, Func<string, string?> resolveSlug)
    {
        var masked = MaskCodeSpans(content);
        var result = new StringBuilder();
        var lastIndex = 0;
        foreach (Match m in WikilinkRe.Matches(masked))
        {
            var target = m.Groups[1].Value;
            var display = (m.Groups[3].Success ? m.Groups[3].Value : target).Trim();
            var slug = resolveSlug(target.Trim());
            var replacement = !string.IsNullOrEmpty(slug) ? $"[{display}](#{slug})" : display;
            result.Append(content, lastIndex, m.Index - lastIndex).Append(replacement);
            lastIndex = m.Index + m.Length;
        }
        return result.Append(content, lastIndex, content.Length - lastIndex).ToString();
    }

    public static string RewriteNoteLinksForExport(string content, Func<string, string?> resolveSlug)
    {
        var masked = MaskCodeSpans(content);
        var result = new StringBuilder();
        var lastIndex = 0;
        foreach (Match m in MarkdownLinkRe.Matches(masked))
        {
            var text = m.Groups[1].Value;
            var href = CleanMarkdownLinkHref(m.Groups[2].Value);
            var replacement = m.Value;
            if (href.Length > 0 && !href.StartsWith('#') && !ExternalSchemeRe.IsMatch(href) && !OtherSchemeRe.IsMatch(href))
            {
                var pathPart = href.Split('#')[0];
                if (pathPart.EndsWith(".md", StringComparison.OrdinalIgnoreCase))
                {
                    var slug = resolveSlug(TitleFromPath(JsUri.TryDecodeComponent(pathPart) ?? pathPart));
                    if (!string.IsNullOrEmpty(slug)) replacement = $"[{text}](#{slug})";
                }
            }
            result.Append(content, lastIndex, m.Index - lastIndex).Append(replacement);
            lastIndex = m.Index + m.Length;
        }
        return result.Append(content, lastIndex, content.Length - lastIndex).ToString();
    }

    /// <summary>Every image embed's raw href, as written (used to find which attachments are still referenced).</summary>
    public static List<string> ExtractImageEmbeds(string content)
    {
        var hrefs = new List<string>();
        var masked = MaskCodeSpans(content);
        foreach (Match m in ImageEmbedRe.Matches(masked))
        {
            var href = m.Groups[2].Value.Trim();
            var titleSuffix = TitleSuffixRe.Match(href);
            if (titleSuffix.Success) href = href[..titleSuffix.Index].Trim();
            if (href.StartsWith('<'))
            {
                var end = href.IndexOf('>');
                href = end >= 0 ? href[1..end] : href[1..];
            }
            if (href.Length > 0) hrefs.Add(href);
        }
        return hrefs;
    }

    /// <summary>Tags from frontmatter <c>tags:</c> — an array (non-strings dropped) or a comma-separated string.</summary>
    public static List<string> ExtractTags(JsonObject frontmatter)
    {
        if (!frontmatter.TryGetPropertyValue("tags", out var raw)) return new List<string>();
        if (raw is JsonArray arr)
        {
            return arr
                .Select(n => n is JsonValue v && v.TryGetValue<string>(out var s) ? s : null)
                .Where(s => s is not null)
                .Select(s => s!)
                .ToList();
        }
        if (raw is JsonValue val && val.TryGetValue<string>(out var str) && str.Trim().Length > 0)
        {
            return str.Split(',').Select(t => t.Trim()).Where(t => t.Length > 0).ToList();
        }
        return new List<string>();
    }

    public static List<string> ExtractInlineTags(string content)
    {
        var masked = MaskCodeSpans(content);
        var withoutLinks = MarkdownLinkRe.Replace(WikilinkRe.Replace(masked, " "), " ");
        var tags = new List<string>();
        var seen = new HashSet<string>(StringComparer.Ordinal);
        foreach (Match m in InlineTagPattern.Matches(withoutLinks))
        {
            if (seen.Add(m.Groups[1].Value)) tags.Add(m.Groups[1].Value);
        }
        return tags;
    }

    public static string TitleFromPath(string relativePath)
    {
        var idx = relativePath.LastIndexOfAny(new[] { '\\', '/' });
        var baseName = idx >= 0 ? relativePath[(idx + 1)..] : relativePath;
        return Regex.Replace(baseName, @"\.md\z", "", RegexOptions.IgnoreCase | Opts);
    }
}
