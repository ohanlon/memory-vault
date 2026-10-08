using System.Text;
using Cairn.Core.Markdown;
using Cairn.Core.Storage;

namespace Cairn.Core.App;

/// <summary>
/// The Photino-free half of the custom URL schemes the renderer uses: <c>cairn-attachment://</c> (files from the open
/// notes folder) and <c>cairn-plugin://</c> (each plugin's own UI, on its own origin). A host wires these into
/// whatever request-interception hook its web view offers.
/// </summary>
public static class CustomSchemes
{
    public const string PluginScheme = "cairn-plugin";
    private const string PluginSdkPath = "/__cairn_sdk.js";

    public readonly record struct Resource(Stream Body, string ContentType);

    public static Resource? Attachment(IpcRouter router, Uri uri)
    {
        var root = router.ActiveRoot;
        if (root is null) return null;

        var filePath = Attachments.ResolveFilePath(root, uri.AbsolutePath);
        if (filePath is null || !File.Exists(filePath)) return null;

        return new Resource(File.OpenRead(filePath), Attachments.ContentTypeFor(filePath));
    }

    public static Resource? Plugin(IpcRouter router, Uri uri)
    {
        var pluginId = uri.Host;
        var plugin = router.EnabledPlugins().FirstOrDefault(p => string.Equals(p.Id, pluginId, StringComparison.Ordinal));
        if (plugin is null) return null;

        var permissions = router.ReadPluginPermissions();
        var csp = PluginContentSecurityPolicy(pluginId, permissions);

        if (uri.AbsolutePath == PluginSdkPath)
            return new Resource(Text(PluginSdk.Script), "text/javascript");

        var filePath = ResolvePluginFilePath(plugin.Dir, uri.AbsolutePath, plugin.Main);
        if (filePath is null || !File.Exists(filePath)) return null;

        var contentType = Attachments.ContentTypeFor(filePath);
        var body = File.ReadAllBytes(filePath);
        if (contentType != "text/html") return new Resource(new MemoryStream(body, writable: false), contentType);

        // A custom-scheme response can't carry a Content-Security-Policy header, so the same policy is
        // delivered as a <meta> tag at the very top of the document instead.
        var html = Encoding.UTF8.GetString(body);
        var meta = $"<meta http-equiv=\"Content-Security-Policy\" content=\"{csp}\">";
        var head = html.IndexOf("<head>", StringComparison.OrdinalIgnoreCase);
        html = head >= 0 ? html.Insert(head + "<head>".Length, meta) : meta + html;
        return new Resource(Text(html), contentType);
    }

    private static Stream Text(string text) => new MemoryStream(Encoding.UTF8.GetBytes(text), writable: false);

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

    public static bool IsWithin(string dir, string path)
    {
        var rel = Path.GetRelativePath(dir, path);
        return !rel.StartsWith("..", StringComparison.Ordinal) && !Path.IsPathRooted(rel);
    }
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
