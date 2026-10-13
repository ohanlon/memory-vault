namespace Cairn.Core.Sync;

/// <summary>Picks the OS-backed secret store for a desktop host. (Windows uses DPAPI, which lives in the host project.)</summary>
public static class PlatformSecretStore
{
    public static ISecretStore Create(IProcessRunner? runner = null)
    {
        runner ??= new SystemProcessRunner();
        if (OperatingSystem.IsMacOS()) return new MacKeychainSecretStore(runner);
        if (OperatingSystem.IsLinux()) return new LinuxSecretStore(runner);
        return new UnavailableSecretStore("this operating system has no supported secret store");
    }
}
