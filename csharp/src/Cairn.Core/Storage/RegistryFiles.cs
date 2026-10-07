using System.Text.Json.Nodes;
using Cairn.Core.Shared;

namespace Cairn.Core.Storage;

/// <summary>Port of electron/notesFolderRegistry.ts: the named list of notes folders, kept in notesFolders.json.</summary>
public static class NotesFolderRegistry
{
    public static List<JsonObject> Read(string filePath)
    {
        if (Files.TryReadJson(filePath) is not JsonArray arr) return new List<JsonObject>();
        return arr.OfType<JsonObject>()
            .Where(o => Js.IsString(Js.Get(o, "name"), out _) && Js.IsString(Js.Get(o, "root"), out _))
            .ToList();
    }

    public static void Write(string filePath, IEnumerable<JsonObject> notesFolders)
    {
        var arr = new JsonArray();
        foreach (var f in notesFolders) arr.Add(f.DeepClone());
        Files.WriteJsonIndented(filePath, arr);
    }

    public static string NameOf(JsonObject entry) => (string)entry["name"]!;
    public static string RootOf(JsonObject entry) => (string)entry["root"]!;

    public static JsonObject? FindByNameCI(IEnumerable<JsonObject> notesFolders, string name) =>
        notesFolders.FirstOrDefault(v => string.Equals(NameOf(v).ToLowerInvariant(), name.ToLowerInvariant(), StringComparison.Ordinal));

    public static List<JsonObject> Add(IReadOnlyList<JsonObject> notesFolders, string name, string root)
    {
        var trimmed = name.Trim();
        if (trimmed.Length == 0) throw new InvalidOperationException("Notes folder name cannot be empty");
        if (FindByNameCI(notesFolders, trimmed) is not null)
            throw new InvalidOperationException($"A notes folder named \"{trimmed}\" already exists");

        var entry = new JsonObject
        {
            ["name"] = trimmed,
            ["root"] = root,
            ["avatar"] = new JsonObject
            {
                ["kind"] = "builtin",
                ["index"] = Avatars.DefaultIndexForName(trimmed, Avatars.NotesFolderAvatarCount),
            },
        };
        return notesFolders.Select(f => (JsonObject)f.DeepClone()).Append(entry).ToList();
    }

    public static List<JsonObject> Remove(IReadOnlyList<JsonObject> notesFolders, string name)
    {
        var lower = name.ToLowerInvariant();
        return notesFolders.Where(v => NameOf(v).ToLowerInvariant() != lower).Select(f => (JsonObject)f.DeepClone()).ToList();
    }

    public static List<JsonObject> Rename(IReadOnlyList<JsonObject> notesFolders, string oldName, string newName)
    {
        var trimmed = newName.Trim();
        if (trimmed.Length == 0) throw new InvalidOperationException("Notes folder name cannot be empty");
        var lowerOld = oldName.ToLowerInvariant();
        if (trimmed.ToLowerInvariant() != lowerOld && FindByNameCI(notesFolders, trimmed) is not null)
            throw new InvalidOperationException($"A notes folder named \"{trimmed}\" already exists");

        return notesFolders.Select(v =>
        {
            var copy = (JsonObject)v.DeepClone();
            if (NameOf(v).ToLowerInvariant() == lowerOld) copy["name"] = trimmed;
            return copy;
        }).ToList();
    }
}

/// <summary>Port of electron/cliAccess.ts: which registered folders the CLI/MCP server may touch (deny by default).</summary>
public static class CliAccess
{
    public static List<string> Read(string filePath)
    {
        if (Files.TryReadJson(filePath) is JsonObject o && o["allowed"] is JsonArray arr)
            return arr.Select(n => Js.IsString(n, out var s) ? s : null).Where(s => s is not null).Select(s => s!).ToList();
        return new List<string>();
    }

    public static void Write(string filePath, IEnumerable<string> allowed)
    {
        var arr = new JsonArray();
        foreach (var a in allowed) arr.Add(a);
        Files.WriteJsonIndented(filePath, new JsonObject { ["allowed"] = arr });
    }

    public static bool IsAllowed(IEnumerable<string> allowed, string folderName) =>
        allowed.Any(n => n.ToLowerInvariant() == folderName.ToLowerInvariant());

    public static List<string> Allow(List<string> allowed, string folderName) =>
        IsAllowed(allowed, folderName) ? allowed : new List<string>(allowed) { folderName };

    public static List<string> Deny(IEnumerable<string> allowed, string folderName) =>
        allowed.Where(n => n.ToLowerInvariant() != folderName.ToLowerInvariant()).ToList();

    /// <summary>Keeps a grant attached to the right folder across a registry rename.</summary>
    public static List<string> Rename(List<string> allowed, string oldName, string newName) =>
        !IsAllowed(allowed, oldName) ? allowed : Allow(Deny(allowed, oldName), newName);
}

/// <summary>Port of electron/syncConfig.ts: the per-folder GitHub link, keyed by registered folder name.</summary>
public static class SyncConfig
{
    public static JsonObject Read(string filePath)
    {
        var result = new JsonObject();
        if (Files.TryReadJson(filePath) is not JsonObject parsed) return result;
        foreach (var (name, link) in parsed)
        {
            if (link is JsonObject o && Js.IsString(Js.Get(o, "repoFullName"), out _) && Js.IsString(Js.Get(o, "branch"), out _))
                result[name] = o.DeepClone();
        }
        return result;
    }

    public static void Write(string filePath, JsonObject config) => Files.WriteJsonIndented(filePath, config);

    public static JsonObject Remove(JsonObject config, string folderName)
    {
        var result = new JsonObject();
        foreach (var (n, v) in config)
            if (n.ToLowerInvariant() != folderName.ToLowerInvariant()) result[n] = v?.DeepClone();
        return result;
    }

    /// <summary>Keeps a link attached to its folder across a registry rename.</summary>
    public static JsonObject Rename(JsonObject config, string oldName, string newName)
    {
        var entry = config.FirstOrDefault(kv => kv.Key.ToLowerInvariant() == oldName.ToLowerInvariant());
        if (entry.Key is null) return config;
        var without = Remove(Remove(config, oldName), newName);
        without[newName] = entry.Value?.DeepClone();
        return without;
    }
}

/// <summary>Port of electron/pluginState.ts: which installed plugins are switched on.</summary>
public static class PluginState
{
    public static JsonObject Read(string filePath)
    {
        var result = new JsonObject();
        if (Files.TryReadJson(filePath) is not JsonObject parsed) return result;
        foreach (var (id, v) in parsed)
            if (v is JsonObject o && Js.IsBool(Js.Get(o, "enabled"), out var enabled))
                result[id] = new JsonObject { ["enabled"] = enabled };
        return result;
    }

    public static void Write(string filePath, JsonObject state) => Files.WriteJsonIndented(filePath, state);

    /// <summary>A plugin with no entry counts as enabled.</summary>
    public static bool IsEnabled(JsonObject state, string pluginId) =>
        Js.IsBool(Js.Get(Js.Get(state, pluginId), "enabled"), out var b) ? b : true;

    public static JsonObject SetEnabled(JsonObject state, string pluginId, bool enabled)
    {
        var next = (JsonObject)state.DeepClone();
        next[pluginId] = new JsonObject { ["enabled"] = enabled };
        return next;
    }
}

/// <summary>Port of electron/pluginPermissions.ts.</summary>
public static class PluginPermissions
{
    public static JsonObject Read(string filePath)
    {
        var result = new JsonObject();
        if (Files.TryReadJson(filePath) is not JsonObject parsed) return result;
        foreach (var (id, state) in parsed)
        {
            if (state is JsonObject o && o["granted"] is JsonArray
                && (!o.ContainsKey("deniedDomains") || o["deniedDomains"] is JsonArray))
                result[id] = o.DeepClone();
        }
        return result;
    }

    public static void Write(string filePath, JsonObject permissions) => Files.WriteJsonIndented(filePath, permissions);

    public static bool Has(JsonObject permissions, string pluginId, string permission) =>
        Js.Get(Js.Get(permissions, pluginId), "granted") is JsonArray g
        && g.Any(n => Js.IsString(n, out var s) && s == permission);

    public static JsonObject Grant(JsonObject permissions, string pluginId, string permission)
    {
        if (Has(permissions, pluginId, permission)) return permissions;
        var next = (JsonObject)permissions.DeepClone();
        var existing = next[pluginId] as JsonObject ?? new JsonObject { ["granted"] = new JsonArray() };
        ((JsonArray)existing["granted"]!).Add(permission);
        next[pluginId] = existing;
        return next;
    }

    public static JsonObject Revoke(JsonObject permissions, string pluginId, string permission)
    {
        if (permissions[pluginId] is not JsonObject)
            return permissions;
        var next = (JsonObject)permissions.DeepClone();
        var existing = (JsonObject)next[pluginId]!;
        var kept = new JsonArray();
        foreach (var g in (JsonArray)existing["granted"]!)
            if (!(Js.IsString(g, out var s) && s == permission)) kept.Add(g?.DeepClone());
        existing["granted"] = kept;
        return next;
    }
}

/// <summary>The three small JSON preference files: settings.json, layout-prefs.json and a folder's .cairn/workspace.json.</summary>
public static class PreferenceFiles
{
    public static JsonObject ReadAppSettings(string filePath) =>
        AppSettingsNormalizer.Normalize(Files.TryReadJson(filePath));

    public static void WriteAppSettings(string filePath, JsonNode? settings) =>
        Files.WriteJsonIndented(filePath, AppSettingsNormalizer.Normalize(settings));

    public static JsonObject ReadLayoutPrefs(string filePath) =>
        LayoutPrefsNormalizer.Normalize(Files.TryReadJson(filePath));

    public static void WriteLayoutPrefs(string filePath, JsonNode? prefs) =>
        Files.WriteJsonIndented(filePath, LayoutPrefsNormalizer.Normalize(prefs));

    public static string WorkspaceStateFilePath(string root) => Path.Combine(root, ".cairn", "workspace.json");

    public static JsonObject ReadWorkspaceState(string root)
    {
        var node = Files.TryReadJson(WorkspaceStateFilePath(root));
        return node is null ? WorkspaceStateNormalizer.Defaults() : WorkspaceStateNormalizer.Normalize(node, root);
    }

    public static void WriteWorkspaceState(string root, JsonNode? state) =>
        Files.WriteJsonIndented(WorkspaceStateFilePath(root), WorkspaceStateNormalizer.Normalize(state, root));
}
