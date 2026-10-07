using System.Collections.Concurrent;
using Cairn.Core.Models;

namespace Cairn.Core.Storage;

/// <summary>
/// Port of electron/notesFolder.ts's <c>watchNotesFolder</c>, which wraps chokidar: add/change/unlink events for
/// markdown files and add/unlink for directories, ignoring anything whose name starts with a dot (so Cairn's own
/// <c>.cairn</c> folder never feeds back into the app). Like chokidar's "atomic" mode, a file that is unlinked and
/// re-added within 100 ms (an editor's save-by-replace) is reported as a single change.
/// </summary>
public sealed class NotesFolderWatcher : IDisposable
{
    private const int AtomicWindowMs = 100;
    private const int ChangeCoalesceMs = 20;

    private readonly string _root;
    private readonly Action<FileChangeEvent> _onChange;
    private readonly FileSystemWatcher? _watcher;
    private readonly object _gate = new();
    private readonly HashSet<string> _knownDirs = new(PathComparer);
    private readonly HashSet<string> _knownFiles = new(PathComparer);
    private readonly Dictionary<string, Timer> _pendingUnlinks = new(PathComparer);
    private readonly ConcurrentDictionary<string, DateTime> _lastChange = new(PathComparer);
    private bool _disposed;

    private static readonly StringComparison PathComparison =
        OperatingSystem.IsLinux() ? StringComparison.Ordinal : StringComparison.OrdinalIgnoreCase;

    private static StringComparer PathComparer =>
        OperatingSystem.IsLinux() ? StringComparer.Ordinal : StringComparer.OrdinalIgnoreCase;

    public NotesFolderWatcher(string root, Action<FileChangeEvent> onChange)
    {
        _root = Path.GetFullPath(root).TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
        _onChange = onChange;

        // chokidar's `ignored` predicate also covers the root itself.
        if (IsDotName(Path.GetFileName(_root)) || !Directory.Exists(_root)) return;

        Scan(_root);

        _watcher = new FileSystemWatcher(_root)
        {
            IncludeSubdirectories = true,
            NotifyFilter = NotifyFilters.FileName | NotifyFilters.DirectoryName | NotifyFilters.LastWrite | NotifyFilters.Size,
            InternalBufferSize = 64 * 1024,
        };
        _watcher.Created += (_, e) => Guard(() => OnCreated(e.FullPath));
        _watcher.Changed += (_, e) => Guard(() => OnChanged(e.FullPath));
        _watcher.Deleted += (_, e) => Guard(() => OnDeleted(e.FullPath));
        _watcher.Renamed += (_, e) =>
        {
            Guard(() => OnDeleted(e.OldFullPath));
            Guard(() => OnCreated(e.FullPath));
        };
        _watcher.EnableRaisingEvents = true;
    }

    private static bool IsDotName(string name) => name.StartsWith('.');

    private bool IsIgnored(string fullPath)
    {
        var rel = Path.GetRelativePath(_root, fullPath);
        if (rel == "." || rel.StartsWith("..", StringComparison.Ordinal)) return true;
        return rel.Split(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar).Any(IsDotName);
    }

    private static bool IsMarkdown(string path) => path.EndsWith(".md", StringComparison.OrdinalIgnoreCase);

    // Records what already exists so a later delete can be classified (a deleted path can no longer be stat'ed).
    private void Scan(string dir)
    {
        foreach (var entry in new DirectoryInfo(dir).EnumerateFileSystemInfos())
        {
            if (IsDotName(entry.Name) || entry.LinkTarget is not null) continue;
            if (entry is DirectoryInfo)
            {
                _knownDirs.Add(entry.FullName);
                Scan(entry.FullName);
            }
            else if (IsMarkdown(entry.Name))
            {
                _knownFiles.Add(entry.FullName);
            }
        }
    }

    private void Guard(Action action)
    {
        if (_disposed) return;
        try
        {
            action();
        }
        catch (Exception e) when (e is IOException or UnauthorizedAccessException or ObjectDisposedException)
        {
            // a file vanished between the event and our stat of it - the matching delete event follows
        }
    }

    private void Emit(string kind, string path)
    {
        if (!_disposed) _onChange(new FileChangeEvent { Kind = kind, Path = path });
    }

    private void OnCreated(string path)
    {
        if (IsIgnored(path)) return;

        if (Directory.Exists(path))
        {
            lock (_gate) _knownDirs.Add(path);
            Emit("add", path);
            // A directory that appears with content (moved in, unzipped) never gets per-file events for it.
            foreach (var entry in new DirectoryInfo(path).EnumerateFileSystemInfos())
            {
                if (IsDotName(entry.Name) || entry.LinkTarget is not null) continue;
                OnCreated(entry.FullName);
            }
            return;
        }

        if (!IsMarkdown(path) || !File.Exists(path)) return;

        lock (_gate)
        {
            _knownFiles.Add(path);
            if (_pendingUnlinks.Remove(path, out var timer))
            {
                // unlink + add inside the atomic window is one in-place save
                timer.Dispose();
                Emit("change", path);
                return;
            }
        }
        Emit("add", path);
    }

    private void OnChanged(string path)
    {
        if (IsIgnored(path) || !IsMarkdown(path) || !File.Exists(path)) return;

        var now = DateTime.UtcNow;
        if (_lastChange.TryGetValue(path, out var last) && (now - last).TotalMilliseconds < ChangeCoalesceMs) return;
        _lastChange[path] = now;
        Emit("change", path);
    }

    private void OnDeleted(string path)
    {
        if (IsIgnored(path)) return;

        bool wasDir;
        List<string> orphanedFiles;
        lock (_gate)
        {
            wasDir = _knownDirs.Remove(path);
            var prefix = path + Path.DirectorySeparatorChar;
            orphanedFiles = wasDir ? _knownFiles.Where(f => f.StartsWith(prefix, PathComparison)).ToList() : new List<string>();
            foreach (var f in orphanedFiles) _knownFiles.Remove(f);
            if (wasDir) _knownDirs.RemoveWhere(d => d.StartsWith(prefix, PathComparison));
        }

        if (wasDir)
        {
            foreach (var f in orphanedFiles) Emit("unlink", f);
            Emit("unlink", path);
            return;
        }

        if (!IsMarkdown(path)) return;
        lock (_gate)
        {
            _knownFiles.Remove(path);
            if (_pendingUnlinks.Remove(path, out var existing)) existing.Dispose();
            _pendingUnlinks[path] = new Timer(_ =>
            {
                lock (_gate) _pendingUnlinks.Remove(path);
                Emit("unlink", path);
            }, null, AtomicWindowMs, Timeout.Infinite);
        }
    }

    public void Dispose()
    {
        if (_disposed) return;
        _disposed = true;
        _watcher?.Dispose();
        lock (_gate)
        {
            foreach (var t in _pendingUnlinks.Values) t.Dispose();
            _pendingUnlinks.Clear();
        }
    }
}
