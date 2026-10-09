using System.Reflection;
using System.Text;
using System.Text.Json.Nodes;
using Cairn.Core;
using Cairn.Core.App;
using Cairn.Core.Storage;

namespace Cairn.Mobile;

/// <summary>
/// Hosts the renderer in a HybridWebView and relays window.memoryStack requests to the shared IpcRouter.
/// Uses the same {id, channel, args} / {id, ok, result|error} wire format as the desktop host's bridge.js.
/// </summary>
public partial class MainPage : ContentPage
{
	private readonly IpcRouter _router;

	public MainPage()
	{
		InitializeComponent();
		WebView.WebResourceRequested += OnWebResourceRequested;

		// The app sandbox is the only place a mobile app can write, so managed folders live under it.
		var paths = new CairnPaths(
			Path.Combine(FileSystem.AppDataDirectory, "userdata"),
			Path.Combine(FileSystem.AppDataDirectory, "notes"));
		var bundledPlugins = Path.Combine(FileSystem.AppDataDirectory, "bundled-plugins");
		BundledAssets.Extract("bundled-plugins", bundledPlugins);
		_router = new IpcRouter(paths, new MobilePlatform(bundledPlugins), PushEvent);
		_router.Initialize();
	}

	// The desktop bridge talks to window.external (Photino's channel); on mobile that is a thin shim over HybridWebView.
	private const string TransportShim =
		"<script src=\"_framework/hybridwebview.js\"></script>" +
		"<script>window.__cairnHost={chromeless:false,canPickFolder:false};" +
		"window.external={sendMessage:function(m){window.HybridWebView.SendRawMessage(m);}," +
		"receiveMessage:function(cb){window.addEventListener('HybridWebViewMessageReceived',function(e){cb(e.detail.message);});}};</script>";

	private static readonly Lazy<string> BridgeTag = new(() =>
	{
		using var stream = Assembly.GetExecutingAssembly().GetManifestResourceStream("bridge.js")
			?? throw new InvalidOperationException("Embedded resource bridge.js is missing");
		using var reader = new StreamReader(stream, Encoding.UTF8);
		return TransportShim + "<script>" + reader.ReadToEnd() + "</script>";
	});

	// Raised for every request the page makes. The app origin is HybridWebView's own (assets are served for us), but
	// index.html needs the bridge injected and the renderer's two custom schemes need answering from the notes folder
	// and the plugins; without a response here, HybridWebView would answer them with index.html.
	private void OnWebResourceRequested(object? sender, WebViewWebResourceRequestedEventArgs e)
	{
		switch (e.Uri.Scheme)
		{
			case "cairn-attachment":
				Respond(e, CustomSchemes.Attachment(_router, e.Uri));
				break;
			case CustomSchemes.PluginScheme:
				Respond(e, CustomSchemes.Plugin(_router, e.Uri));
				break;
			default:
				if (e.Uri.AbsolutePath is "/" or "/index.html") Respond(e, IndexWithBridge());
				break;
		}
	}

	private static void Respond(WebViewWebResourceRequestedEventArgs e, CustomSchemes.Resource? resource)
	{
		if (resource is { } r) e.SetResponse(200, "OK", r.ContentType, r.Body);
		else e.SetResponse(404, "Not Found", "text/plain", new MemoryStream());
		e.Handled = true;
	}

	// The bridge has to exist before the renderer's own module script runs, so index.html is rewritten on the way out.
	private static CustomSchemes.Resource IndexWithBridge()
	{
		using var asset = FileSystem.OpenAppPackageFileAsync("wwwroot/index.html").GetAwaiter().GetResult();
		using var reader = new StreamReader(asset, Encoding.UTF8);
		var html = reader.ReadToEnd();
		var head = html.IndexOf("<head>", StringComparison.OrdinalIgnoreCase);
		html = head >= 0 ? html.Insert(head + "<head>".Length, BridgeTag.Value) : BridgeTag.Value + html;
		return new CustomSchemes.Resource(new MemoryStream(Encoding.UTF8.GetBytes(html)), "text/html");
	}

	private void OnRawMessage(object? sender, HybridWebViewRawMessageReceivedEventArgs e) =>
		_ = HandleRequestAsync(e.Message ?? "");

	private async Task HandleRequestAsync(string message)
	{
		long id = -1;
		try
		{
			var request = JsonNode.Parse(message)!.AsObject();
			id = (long)request["id"]!;
			var channel = (string)request["channel"]!;
			var args = request["args"] as JsonArray ?? new JsonArray();

			var result = await Task.Run(() => _router.InvokeAsync(channel, args));
			Send($"{{\"id\":{id},\"ok\":true,\"result\":{result?.ToJsonString(CairnJson.NodeOptions) ?? "null"}}}");
		}
		catch (Exception e)
		{
			var inner = e is AggregateException { InnerException: { } i } ? i : e;
			var error = JsonValue.Create(inner.Message)!.ToJsonString(CairnJson.NodeOptions);
			Send($"{{\"id\":{id},\"ok\":false,\"error\":{error}}}");
		}
	}

	private void PushEvent(string channel, JsonNode? payload) =>
		Send($"{{\"event\":{JsonValue.Create(channel)!.ToJsonString(CairnJson.NodeOptions)},\"payload\":{payload?.ToJsonString(CairnJson.NodeOptions) ?? "null"}}}");

	private void Send(string json) => MainThread.BeginInvokeOnMainThread(() => WebView.SendRawMessage(json));
}
