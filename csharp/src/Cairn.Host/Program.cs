using System.Text.Json.Nodes;
using Cairn.Core;
using Cairn.Core.App;
using Cairn.Core.Plugins;
using Cairn.Core.Storage;
using Photino.NET;

namespace Cairn.Host;

internal static class Program
{
    public const string AppScheme = "app";
    public const string AppOrigin = "app://localhost";

    private static PhotinoWindow? _window;
    private static IpcRouter? _router;
    private static HostLog _log = null!;

    [STAThread]
    private static int Main(string[] args)
    {
        var userData = UserDataDir.Resolve();
        _log = new HostLog(Path.Combine(userData, "logs", "host.log"), Environment.GetEnvironmentVariable("CAIRN_LOG") == "1");

        var rendererDir = Environment.GetEnvironmentVariable("CAIRN_RENDERER_DIR")
            ?? Path.Combine(AppContext.BaseDirectory, "wwwroot");
        if (!File.Exists(Path.Combine(rendererDir, "index.html")))
        {
            Console.Error.WriteLine($"Cairn: renderer not found at {rendererDir}. Run `npx vite build` in the repository root and rebuild.");
            return 1;
        }

        var paths = new CairnPaths(userData);
        var platform = new PhotinoPlatform(() => _window!, Path.Combine(AppContext.BaseDirectory, "plugins"), _log);
        _router = new IpcRouter(paths, platform, PushEvent);
        _router.Initialize();

        // The renderer draws its own title bar, so the OS frame is dropped where the page can stand in for it:
        // Windows and Linux (Electron's titleBarOverlay does the same). macOS keeps its native traffic lights.
        var chromeless = (OperatingSystem.IsWindows() || OperatingSystem.IsLinux())
            && Environment.GetEnvironmentVariable("CAIRN_NATIVE_CHROME") != "1";
        var assets = new SchemeHandlers(rendererDir, _router, paths, _log, chromeless);

        var iconPath = OperatingSystem.IsWindows()
            ? Path.Combine(AppContext.BaseDirectory, "icon.ico")
            : Path.Combine(rendererDir, "icon.png");
        var window = new PhotinoWindow()
            .SetTitle("Cairn")
            .SetUseOsDefaultSize(false)
            .SetSize(1280, 800)
            .SetMinSize(640, 400)
            .SetResizable(true)
            .Center()
            .SetDevToolsEnabled(Environment.GetEnvironmentVariable("CAIRN_DEVTOOLS") == "1")
            .SetContextMenuEnabled(true)
            .SetChromeless(chromeless)
            .SetUserDataFolder(Path.Combine(userData, "webview"))
            .RegisterCustomSchemeHandler(AppScheme, assets.HandleApp)
            .RegisterCustomSchemeHandler(Cairn.Core.Storage.Attachments.Scheme, assets.HandleAttachment)
            .RegisterCustomSchemeHandler(SchemeHandlers.PluginScheme, assets.HandlePlugin)
            .RegisterWebMessageReceivedHandler((_, e) => OnWebMessage(e.Message))
            .RegisterStateChangedHandler((_, e) =>
            {
                if (chromeless) platform.OnNativeStateChanged(e.NewState);
                else PushEvent("host:windowState", new JsonObject { ["maximized"] = e.NewState == PhotinoWindowState.Maximized });
            });
        platform.Chromeless = chromeless;
        platform.MaximizedChanged = maximized => PushEvent("host:windowState", new JsonObject { ["maximized"] = maximized });

        // Lets a test harness attach over the Chrome DevTools protocol (Windows WebView2 / Chromium).
        if (Environment.GetEnvironmentVariable("CAIRN_REMOTE_DEBUG_PORT") is { Length: > 0 } port)
            window.SetBrowserControlInitParameters($"--remote-debugging-port={port}");

        if (File.Exists(iconPath) && !OperatingSystem.IsMacOS()) window.SetIconFile(iconPath);
        _window = window;

        window.Load($"{AppOrigin}/index.html");
        var exitCode = PhotinoApplication.Current.Run(window);

        _router.Dispose();
        return exitCode;
    }

    // ---- window <-> router transport ------------------------------------------------------------

    private static void OnWebMessage(string message)
    {
        _ = HandleRequestAsync(message);
    }

    private static async Task HandleRequestAsync(string message)
    {
        long id = -1;
        try
        {
            var request = JsonNode.Parse(message)!.AsObject();
            id = (long)request["id"]!;
            var channel = (string)request["channel"]!;
            var args = request["args"] as JsonArray ?? new JsonArray();

            var result = await Task.Run(() => _router!.InvokeAsync(channel, args));
            Send($"{{\"id\":{id},\"ok\":true,\"result\":{Serialize(result)}}}");
        }
        catch (Exception e)
        {
            var inner = e is AggregateException { InnerException: { } i } ? i : e;
            _log.Error($"request {id} failed: {inner}");
            var error = JsonValue.Create(inner.Message)!.ToJsonString(CairnJson.NodeOptions);
            Send($"{{\"id\":{id},\"ok\":false,\"error\":{error}}}");
        }
    }

    private static void PushEvent(string channel, JsonNode? payload) =>
        Send($"{{\"event\":{JsonValue.Create(channel)!.ToJsonString(CairnJson.NodeOptions)},\"payload\":{Serialize(payload)}}}");

    // Date markers stay as tagged objects here: the page-side bridge revives them into real Date objects.
    private static string Serialize(JsonNode? node) => node?.ToJsonString(CairnJson.NodeOptions) ?? "null";

    private static void Send(string json)
    {
        var window = _window;
        if (window is null) return;
        try
        {
            _ = window.SendWebMessageAsync(json);
        }
        catch (Exception e)
        {
            _log.Error($"send failed: {e.Message}");
        }
    }
}
