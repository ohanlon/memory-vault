using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using Cairn.Core.Shared;
using Cairn.Core.Storage;

namespace Cairn.Core.Plugins;

public sealed record DiscoveredPlugin(JsonObject Manifest, string Dir)
{
    public string Id => (string)Manifest["id"]!;
    public string Main => (string)Manifest["main"]!;
}

/// <summary>Port of electron/pluginRegistry.ts: finding and validating plugins under &lt;userData&gt;/plugins.</summary>
public static class PluginRegistry
{
    private static readonly string[] ValidPermissions = { "network", "shell:openExternal", "git-sync" };
    private static readonly string[] ValidViewRegions = { "left-sidebar", "right-sidebar" };
    private static readonly string[] ValidContextMenuTargets = { "note", "folder" };
    private const int MaxIconBytes = 16 * 1024;

    private static bool Str(JsonObject o, string key) => Js.IsString(Js.Get(o, key), out _);

    // "undefined" in the TypeScript: the key is simply absent (an explicit null is a different, invalid, value).
    private static bool Absent(JsonObject o, string key) => !o.ContainsKey(key);

    private static bool IsValidView(JsonNode? v) =>
        v is JsonObject view && Str(view, "id") && Str(view, "title") && Str(view, "entry")
        && Js.IsString(Js.Get(view, "region"), out var region) && Array.IndexOf(ValidViewRegions, region) >= 0
        && (Absent(view, "exclusive") || Js.IsBool(view["exclusive"], out _));

    private static bool IsValidTab(JsonNode? v) =>
        v is JsonObject tab && Str(tab, "id") && Str(tab, "title") && Str(tab, "entry");

    // opensView/opensTab must reference this manifest's own views/tabs, and exactly one of the two must be set.
    private static bool IsValidRibbonItem(JsonNode? v, HashSet<string> viewIds, HashSet<string> tabIds)
    {
        if (v is not JsonObject item) return false;
        if (!Str(item, "id") || !Str(item, "title")) return false;
        if (!Absent(item, "icon") && !Str(item, "icon")) return false;
        if (!Absent(item, "iconFile") && !Str(item, "iconFile")) return false;
        if (Absent(item, "icon") && Absent(item, "iconFile")) return false;

        var hasView = Js.IsString(Js.Get(item, "opensView"), out var opensView);
        var hasTab = Js.IsString(Js.Get(item, "opensTab"), out var opensTab);
        if (hasView == hasTab) return false;
        return hasView ? viewIds.Contains(opensView) : tabIds.Contains(opensTab);
    }

    private static bool IsValidContextMenuItem(JsonNode? v) =>
        v is JsonObject item && Str(item, "id") && Str(item, "label")
        && Js.IsString(Js.Get(item, "target"), out var target) && Array.IndexOf(ValidContextMenuTargets, target) >= 0;

    private static bool IsArrayOf(JsonObject m, string key, Func<JsonNode?, bool> valid) =>
        Absent(m, key) || (m[key] is JsonArray arr && arr.All(valid));

    private static HashSet<string> IdsOf(JsonNode? list)
    {
        var ids = new HashSet<string>(StringComparer.Ordinal);
        if (list is JsonArray arr)
            foreach (var item in arr)
                if (Js.IsString(Js.Get(item, "id"), out var id) && id.Length > 0) ids.Add(id);
        return ids;
    }

    public static bool IsValidManifest(JsonNode? v)
    {
        if (v is not JsonObject m) return false;
        var viewIds = IdsOf(Js.Get(m, "views"));
        var tabIds = IdsOf(Js.Get(m, "tabs"));
        return Str(m, "id") && Str(m, "name") && Str(m, "version") && Str(m, "main")
            && m["permissions"] is JsonArray perms
            && perms.All(p => Js.IsString(p, out var s) && Array.IndexOf(ValidPermissions, s) >= 0)
            && IsArrayOf(m, "views", IsValidView)
            && IsArrayOf(m, "tabs", IsValidTab)
            && IsArrayOf(m, "ribbonItems", r => IsValidRibbonItem(r, viewIds, tabIds))
            && IsArrayOf(m, "contextMenuItems", IsValidContextMenuItem);
    }

    // Reads each ribbon item's `iconFile` into `iconSvg` so the renderer never reaches into the plugin's folder.
    // Must be a small .svg inside the plugin directory; an item left with no icon at all is dropped, and a
    // manifest-supplied `iconSvg` is never trusted.
    private static void ResolveRibbonIcons(JsonObject manifest, string dir)
    {
        if (manifest["ribbonItems"] is not JsonArray items) return;
        var root = Path.GetFullPath(dir);
        var kept = new JsonArray();
        foreach (var node in items)
        {
            var item = (JsonObject)node!;
            item.Remove("iconSvg");
            if (Js.IsString(Js.Get(item, "iconFile"), out var iconFile) && iconFile.Length > 0)
            {
                try
                {
                    var file = Path.GetFullPath(Path.Combine(root, iconFile));
                    var rel = Path.GetRelativePath(root, file);
                    if (file.EndsWith(".svg", StringComparison.OrdinalIgnoreCase)
                        && !rel.StartsWith("..", StringComparison.Ordinal) && !Path.IsPathRooted(rel)
                        && new FileInfo(file).Length <= MaxIconBytes)
                        item["iconSvg"] = Files.ReadText(file);
                }
                catch (Exception e) when (e is IOException or UnauthorizedAccessException or ArgumentException)
                {
                    // unreadable icon file - fall through to the path-data icon, if any
                }
            }
            if (item.ContainsKey("iconSvg") || item.ContainsKey("icon")) kept.Add(item.DeepClone());
        }
        manifest["ribbonItems"] = kept;
    }

    /// <summary>Plugins live under &lt;userData&gt;/plugins/&lt;folder&gt;/manifest.json — one global install directory.</summary>
    public static List<DiscoveredPlugin> Discover(string pluginsDir)
    {
        var plugins = new List<DiscoveredPlugin>();
        if (!Directory.Exists(pluginsDir)) return plugins;

        foreach (var dir in Directory.EnumerateDirectories(pluginsDir))
        {
            var manifestPath = Path.Combine(dir, "manifest.json");
            if (!File.Exists(manifestPath)) continue;
            try
            {
                var parsed = JsonNode.Parse(Files.ReadText(manifestPath));
                if (!IsValidManifest(parsed)) continue;
                ResolveRibbonIcons((JsonObject)parsed!, dir);
                plugins.Add(new DiscoveredPlugin((JsonObject)parsed!, dir));
            }
            catch (Exception e) when (e is System.Text.Json.JsonException or IOException or UnauthorizedAccessException)
            {
                // skip malformed manifest
            }
        }
        return plugins;
    }
}

/// <summary>Port of electron/bundledPlugins.ts: installs plugins shipped inside the app into the global plugins directory.</summary>
public static class BundledPlugins
{
    private static (string Id, string Version)? ReadIdAndVersion(string dir)
    {
        try
        {
            if (JsonNode.Parse(Files.ReadText(Path.Combine(dir, "manifest.json"))) is JsonObject m
                && Js.IsString(m["id"], out var id) && Js.IsString(m["version"], out var version))
                return (id, version);
        }
        catch (Exception e) when (e is System.Text.Json.JsonException or IOException or UnauthorizedAccessException)
        {
        }
        return null;
    }

    private static readonly Regex LeadingDigits = new(@"^\s*[+-]?[0-9]+", RegexOptions.CultureInvariant);

    // parseInt(n, 10) || 0
    private static int ParseIntOrZero(string s)
    {
        var m = LeadingDigits.Match(s);
        return m.Success && int.TryParse(m.Value.Trim(), out var n) ? n : 0;
    }

    /// <summary>Numeric-aware dotted version comparison; anything non-numeric counts as 0.</summary>
    public static bool IsNewerVersion(string candidate, string installed)
    {
        var a = candidate.Split('.').Select(ParseIntOrZero).ToArray();
        var b = installed.Split('.').Select(ParseIntOrZero).ToArray();
        for (var i = 0; i < Math.Max(a.Length, b.Length); i++)
        {
            var d = (i < a.Length ? a[i] : 0) - (i < b.Length ? b[i] : 0);
            if (d != 0) return d > 0;
        }
        return false;
    }

    private static void CopyDirectory(string src, string dest)
    {
        Directory.CreateDirectory(dest);
        foreach (var file in Directory.EnumerateFiles(src)) File.Copy(file, Path.Combine(dest, Path.GetFileName(file)), overwrite: true);
        foreach (var dir in Directory.EnumerateDirectories(src)) CopyDirectory(dir, Path.Combine(dest, Path.GetFileName(dir)));
    }

    /// <summary>
    /// A fresh install is recorded as disabled (opt-in); a newer bundled version overwrites the files but keeps whatever
    /// enabled state the user chose.
    /// </summary>
    public static JsonObject Seed(string bundledDir, string pluginsDir, JsonObject state)
    {
        if (!Directory.Exists(bundledDir)) return state;
        var next = state;
        foreach (var src in Directory.EnumerateDirectories(bundledDir))
        {
            if (ReadIdAndVersion(src) is not { } bundled) continue;
            var dest = Path.Combine(pluginsDir, bundled.Id);
            var installed = Directory.Exists(dest) ? ReadIdAndVersion(dest) : null;
            if (installed is { } inst && !IsNewerVersion(bundled.Version, inst.Version)) continue;

            if (Directory.Exists(dest)) Directory.Delete(dest, recursive: true);
            Directory.CreateDirectory(pluginsDir);
            CopyDirectory(src, dest);
            if (installed is null && !next.ContainsKey(bundled.Id)) next = PluginState.SetEnabled(next, bundled.Id, false);
        }
        return next;
    }
}

/// <summary>Port of electron/domainPolicy.ts.</summary>
public static class DomainPolicy
{
    private static readonly Regex ExternalUrlScheme = new(@"^(https?:|mailto:)", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);

    public static bool IsAllowedForPlugin(string url, string pluginId, JsonObject permissions)
    {
        if (!PluginPermissions.Has(permissions, pluginId, "network")) return false;
        if (!Uri.TryCreate(url, UriKind.Absolute, out var uri)) return false;
        var hostname = uri.Host;
        if (Js.Get(Js.Get(permissions, pluginId), "deniedDomains") is JsonArray denied
            && denied.Any(d => Js.IsString(d, out var s) && s == hostname))
            return false;
        return true;
    }

    /// <summary>Gates opening a URL in the OS's default handler; <paramref name="pluginId"/> is null for calls from the app itself.</summary>
    public static bool IsAllowedExternalUrl(string url, string? pluginId, JsonObject permissions)
    {
        if (!ExternalUrlScheme.IsMatch(url)) return false;
        if (pluginId is null) return true;
        return PluginPermissions.Has(permissions, pluginId, "shell:openExternal");
    }
}
