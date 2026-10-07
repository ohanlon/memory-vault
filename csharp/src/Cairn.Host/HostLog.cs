namespace Cairn.Host;

/// <summary>A GUI app has no visible console, so errors that would have gone to Electron's terminal go to a log file when enabled.</summary>
internal sealed class HostLog
{
    private readonly string _path;
    private readonly bool _enabled;
    private readonly object _gate = new();

    public HostLog(string path, bool enabled)
    {
        _path = path;
        _enabled = enabled;
    }

    public void Info(string message) => Write("INFO", message);

    public void Error(string message) => Write("ERROR", message);

    private void Write(string level, string message)
    {
        if (!_enabled) return;
        try
        {
            lock (_gate)
            {
                Directory.CreateDirectory(Path.GetDirectoryName(_path)!);
                File.AppendAllText(_path, $"{DateTime.Now:O} {level} {message}{Environment.NewLine}");
            }
        }
        catch (IOException)
        {
            // logging must never take the app down
        }
    }
}
