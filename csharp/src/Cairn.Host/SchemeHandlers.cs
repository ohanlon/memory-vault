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
    public const string PluginScheme = CustomSchemes.PluginScheme;

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
        if (!CustomSchemes.IsWithin(_rendererDir, full) || !File.Exists(full)) return null;

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

    public Stream? HandleAttachment(PhotinoWindow sender, string scheme, string url, out string contentType) =>
        Serve(CustomSchemes.Attachment(_router, new Uri(url)), out contentType);

    // ---- cairn-plugin:// ------------------------------------------------------------------------

    public Stream? HandlePlugin(PhotinoWindow sender, string scheme, string url, out string contentType) =>
        Serve(CustomSchemes.Plugin(_router, new Uri(url)), out contentType);

    private static Stream? Serve(CustomSchemes.Resource? resource, out string contentType)
    {
        contentType = resource?.ContentType ?? "text/plain";
        return resource?.Body;
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
