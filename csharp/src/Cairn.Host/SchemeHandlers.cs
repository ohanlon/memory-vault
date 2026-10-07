using System.Reflection;
using System.Text;
using Cairn.Core.App;
using Cairn.Core.Markdown;
using Cairn.Core.Storage;
using Photino.NET;

namespace Cairn.Host;

/// <summary>
/// Serves the three URL schemes the renderer uses: <c>app://</c> (the bundled React build, with the
/// <c>window.memoryStack</c> bridge injected into index.html), <c>cairn-attachment://</c> (files from the open notes
/// folder) and <c>cairn-plugin://</c> (each plugin's own UI, on its own origin).
/// </summary>
internal sealed class SchemeHandlers
{
    public const string PluginScheme = "cairn-plugin";
    private const string PluginSdkPath = "/__cairn_sdk.js";

    private readonly string _rendererDir;
    private readonly IpcRouter _router;
    private readonly CairnPaths _paths;
    private readonly string _bridgeTag;

    private readonly HostLog _log;

    public SchemeHandlers(string rendererDir, IpcRouter router, CairnPaths paths, HostLog log, bool chromeless)
    {
        _log = log;
        _rendererDir = Path.GetFullPath(rendererDir);
        _router = router;
        _paths = paths;
        _bridgeTag = $"<script>window.__cairnHost={{chromeless:{(chromeless ? "true" : "false")}}};</script><script>{LoadEmbedded("bridge.js")}</script>";
    }

    private static string LoadEmbedded(string name)
    {
        using var stream = Assembly.GetExecutingAssembly().GetManifestResourceStream(name)
            ?? throw new InvalidOperationException($"Embedded resource {name} is missing");
        using var reader = new StreamReader(stream, Encoding.UTF8);
        return reader.ReadToEnd();
    }

    private static Stream Bytes(byte[] data) => new MemoryStream(data, writable: false);

    private static Stream Text(string text) => Bytes(Encoding.UTF8.GetBytes(text));

    // ---- app:// ---------------------------------------------------------------------------------

    public Stream? HandleApp(PhotinoWindow sender, string scheme, string url, out string contentType)
    {
        _log.Info($"app request: {url}");
        contentType = "text/plain";
        var uri = new Uri(url);
        var relative = JsUri.TryDecodeComponent(uri.AbsolutePath)?.TrimStart('/') ?? "";
        if (relative.Length == 0) relative = "index.html";

        var full = Path.GetFullPath(Path.Combine(_rendererDir, relative));
        if (!IsWithin(_rendererDir, full) || !File.Exists(full)) return null;

        contentType = MimeTypes.For(full);
        if (string.Equals(relative, "index.html", StringComparison.OrdinalIgnoreCase))
        {
            // The bridge must exist before the renderer's own module script runs.
            var html = File.ReadAllText(full, Encoding.UTF8);
            var head = html.IndexOf("<head>", StringComparison.OrdinalIgnoreCase);
            html = head >= 0 ? html.Insert(head + "<head>".Length, _bridgeTag) : _bridgeTag + html;
            return Text(html);
        }
        return File.OpenRead(full);
    }

    // ---- cairn-attachment:// --------------------------------------------------------------------

    public Stream? HandleAttachment(PhotinoWindow sender, string scheme, string url, out string contentType)
    {
        contentType = "application/octet-stream";
        var root = _router.ActiveRoot;
        if (root is null) return null;

        var filePath = Attachments.ResolveFilePath(root, new Uri(url).AbsolutePath);
        if (filePath is null || !File.Exists(filePath)) return null;

        contentType = Attachments.ContentTypeFor(filePath);
        return File.OpenRead(filePath);
    }

    // ---- cairn-plugin:// ------------------------------------------------------------------------

    public Stream? HandlePlugin(PhotinoWindow sender, string scheme, string url, out string contentType)
    {
        contentType = "text/plain";
        var uri = new Uri(url);
        var pluginId = uri.Host;
        var plugin = _router.EnabledPlugins().FirstOrDefault(p => string.Equals(p.Id, pluginId, StringComparison.Ordinal));
        if (plugin is null) return null;

        var permissions = _router.ReadPluginPermissions();
        var csp = PluginContentSecurityPolicy(pluginId, permissions);

        if (uri.AbsolutePath == PluginSdkPath)
        {
            contentType = "text/javascript";
            return Text(PluginSdk.Script);
        }

        var filePath = ResolvePluginFilePath(plugin.Dir, uri.AbsolutePath, plugin.Main);
        if (filePath is null || !File.Exists(filePath)) return null;

        contentType = Attachments.ContentTypeFor(filePath);
        var body = File.ReadAllBytes(filePath);
        if (contentType != "text/html") return Bytes(body);

        // A custom-scheme response can't carry a Content-Security-Policy header, so the same policy is
        // delivered as a <meta> tag at the very top of the document instead.
        var html = Encoding.UTF8.GetString(body);
        var meta = $"<meta http-equiv=\"Content-Security-Policy\" content=\"{csp}\">";
        var head = html.IndexOf("<head>", StringComparison.OrdinalIgnoreCase);
        html = head >= 0 ? html.Insert(head + "<head>".Length, meta) : meta + html;
        return Text(html);
    }

    private static string PluginContentSecurityPolicy(string pluginId, System.Text.Json.Nodes.JsonObject permissions)
    {
        // CSP can't mix 'none' with other sources in one directive; without network 'self' alone still lets
        // the plugin fetch its own same-origin resources.
        var connectSrc = PluginPermissions.Has(permissions, pluginId, "network") ? "'self' https: wss:" : "'self'";
        return string.Join("; ",
            "default-src 'self'",
            "script-src 'self' 'unsafe-inline'",
            "style-src 'self' 'unsafe-inline'",
            "img-src 'self' data:",
            $"connect-src {connectSrc}",
            "object-src 'none'");
    }

    private static string? ResolvePluginFilePath(string pluginDir, string requestPathname, string mainEntry)
    {
        var decoded = JsUri.TryDecodeComponent(requestPathname) ?? throw new InvalidOperationException("URI malformed");
        var relative = decoded is "/" or "" ? mainEntry : decoded.TrimStart('/');
        var resolvedDir = Path.GetFullPath(pluginDir);
        var resolved = Path.GetFullPath(Path.Combine(resolvedDir, relative));
        return IsWithin(resolvedDir, resolved) ? resolved : null;
    }

    private static bool IsWithin(string dir, string path)
    {
        var rel = Path.GetRelativePath(dir, path);
        return !rel.StartsWith("..", StringComparison.Ordinal) && !Path.IsPathRooted(rel);
    }
}

internal static class MimeTypes
{
    private static readonly Dictionary<string, string> Map = new(StringComparer.OrdinalIgnoreCase)
    {
        [".html"] = "text/html", [".htm"] = "text/html", [".js"] = "text/javascript", [".mjs"] = "text/javascript",
        [".css"] = "text/css", [".json"] = "application/json", [".map"] = "application/json",
        [".png"] = "image/png", [".jpg"] = "image/jpeg", [".jpeg"] = "image/jpeg", [".gif"] = "image/gif",
        [".svg"] = "image/svg+xml", [".ico"] = "image/x-icon", [".webp"] = "image/webp",
        [".woff"] = "font/woff", [".woff2"] = "font/woff2", [".ttf"] = "font/ttf", [".otf"] = "font/otf",
        [".wasm"] = "application/wasm", [".txt"] = "text/plain", [".md"] = "text/markdown",
    };

    public static string For(string path) => Map.TryGetValue(Path.GetExtension(path), out var t) ? t : "application/octet-stream";
}

/// <summary>The postMessage RPC client every plugin gets, synthesized rather than read from disk (electron/pluginProtocol.ts's buildSdkScript).</summary>
internal static class PluginSdk
{
    public const string Script = """
(function () {
  var pending = new Map();
  var counter = 0;
  var contextMenuListeners = [];
  var changeListeners = [];
  window.addEventListener("message", function (event) {
    if (event.source !== window.parent) return;
    var data = event.data;
    if (!data || data.channel !== "cairn-plugin-rpc") return;
    if (data.kind === "response") {
      var entry = pending.get(data.id);
      if (!entry) return;
      pending.delete(data.id);
      if (data.error) entry.reject(new Error(data.error));
      else entry.resolve(data.result);
      return;
    }
    if (data.kind === "push" && data.event === "change") {
      changeListeners.forEach(function (cb) { cb(data.reason); });
      return;
    }
    if (data.kind === "push" && data.event === "contextMenuAction") {
      contextMenuListeners.forEach(function (cb) { cb(data.itemId, data.targetPath); });
    }
  });
  function call(method, args) {
    var id = ++counter;
    return new Promise(function (resolve, reject) {
      pending.set(id, { resolve: resolve, reject: reject });
      window.parent.postMessage(
        { channel: "cairn-plugin-rpc", kind: "request", id: id, method: method, args: args },
        "*"
      );
    });
  }
  window.cairnPlugin = {
    readNote: function (relativePath) { return call("readNote", [relativePath]); },
    writeNote: function (relativePath, body) { return call("writeNote", [relativePath, body]); },
    requestPermission: function (permission) { return call("requestPermission", [permission]); },
    openExternal: function (url) { return call("openExternal", [url]); },
    setStatus: function (text) { return call("setStatus", [text]); },
    onContextMenuAction: function (cb) { contextMenuListeners.push(cb); },
    // Calls a host capability by name (e.g. "sync.status"); needs the matching permission.
    invoke: function (method) { return call("invoke", [method].concat(Array.prototype.slice.call(arguments, 1))); },
    // cb(reason) fires, debounced, when the open folder or its files changed, or the app regained focus.
    onChange: function (cb) { changeListeners.push(cb); },
  };
})();
""";
}
