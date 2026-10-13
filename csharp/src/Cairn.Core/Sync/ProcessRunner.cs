using System.ComponentModel;
using System.Diagnostics;
using System.Text;

namespace Cairn.Core.Sync;

public sealed record ProcessResult(int ExitCode, string StdOut, string StdErr);

/// <summary>Runs a command-line tool. A seam so the secret stores can be tested without macOS or a keyring.</summary>
public interface IProcessRunner
{
    /// <summary>Whether <paramref name="tool"/> (an absolute path or a name on PATH) exists.</summary>
    bool Exists(string tool);

    /// <summary>
    /// Runs the tool with an argument list (never a shell string), optionally writing <paramref name="stdin"/> to it.
    /// Secrets go through stdin, not arguments, because arguments are visible to every process on the machine.
    /// </summary>
    Task<ProcessResult> RunAsync(string tool, IReadOnlyList<string> arguments, string? stdin = null);
}

public sealed class SystemProcessRunner(TimeSpan? timeout = null) : IProcessRunner
{
    private readonly TimeSpan _timeout = timeout ?? TimeSpan.FromSeconds(15);

    public bool Exists(string tool)
    {
        if (Path.IsPathRooted(tool)) return File.Exists(tool);
        var path = Environment.GetEnvironmentVariable("PATH") ?? "";
        return path.Split(Path.PathSeparator, StringSplitOptions.RemoveEmptyEntries).Any(dir => File.Exists(Path.Combine(dir, tool)));
    }

    public async Task<ProcessResult> RunAsync(string tool, IReadOnlyList<string> arguments, string? stdin = null)
    {
        var info = new ProcessStartInfo(tool)
        {
            RedirectStandardInput = stdin is not null,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false,
            CreateNoWindow = true,
            StandardOutputEncoding = Encoding.UTF8,
            StandardErrorEncoding = Encoding.UTF8,
        };
        if (stdin is not null) info.StandardInputEncoding = new UTF8Encoding(false); // no BOM: it would end up in the secret
        foreach (var argument in arguments) info.ArgumentList.Add(argument);

        using var process = new Process { StartInfo = info };
        try
        {
            process.Start();
        }
        catch (Win32Exception e)
        {
            throw new InvalidOperationException($"Could not run {tool}: {e.Message}");
        }

        using var cancel = new CancellationTokenSource(_timeout);
        try
        {
            if (stdin is not null)
            {
                await process.StandardInput.WriteAsync(stdin.AsMemory(), cancel.Token);
                process.StandardInput.Close();
            }
            var stdout = process.StandardOutput.ReadToEndAsync(cancel.Token);
            var stderr = process.StandardError.ReadToEndAsync(cancel.Token);
            await process.WaitForExitAsync(cancel.Token);
            return new ProcessResult(process.ExitCode, await stdout, await stderr);
        }
        catch (OperationCanceledException)
        {
            try { process.Kill(entireProcessTree: true); } catch (InvalidOperationException) { }
            throw new TimeoutException($"{Path.GetFileName(tool)} did not respond within {_timeout.TotalSeconds:0} seconds.");
        }
    }
}
