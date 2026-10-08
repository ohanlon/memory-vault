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

		// The app sandbox is the only place a mobile app can write, so managed folders live under it.
		var paths = new CairnPaths(
			Path.Combine(FileSystem.AppDataDirectory, "userdata"),
			Path.Combine(FileSystem.AppDataDirectory, "notes"));
		_router = new IpcRouter(paths, new MobilePlatform(), PushEvent);
		_router.Initialize();
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
