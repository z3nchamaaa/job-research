using System.Collections.Concurrent;
using System.Diagnostics;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace JobResearch.WebView;

internal static class Program
{
    internal static readonly byte[] Entropy = Encoding.UTF8.GetBytes("job-research-webview-dev-v1");
    [STAThread]
    private static int Main(string[] args)
    {
        if (args.Length == 1 && (args[0] == "--protect" || args[0] == "--unprotect"))
        {
            try
            {
                using var reader = new StreamReader(Console.OpenStandardInput(), Encoding.UTF8);
                var input = reader.ReadToEnd();
                var output = args[0] == "--protect"
                    ? Convert.ToBase64String(ProtectedData.Protect(Encoding.UTF8.GetBytes(input), Entropy, DataProtectionScope.CurrentUser))
                    : Encoding.UTF8.GetString(ProtectedData.Unprotect(Convert.FromBase64String(input), Entropy, DataProtectionScope.CurrentUser));
                var bytes = Encoding.UTF8.GetBytes(output);
                Console.OpenStandardOutput().Write(bytes);
                return 0;
            }
            catch { return 1; } // Never print tokens or plaintext on failure.
        }
        var smoke = args.Length == 2 && args[0] == "--smoke-test";
        var data = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "job-research-webview-dev");
        if (smoke)
        {
            data = Path.GetFullPath(args[1]);
            if (!data.StartsWith(Path.GetFullPath(Path.GetTempPath()), StringComparison.OrdinalIgnoreCase) || data.Equals(Path.GetFullPath(Path.GetTempPath()), StringComparison.OrdinalIgnoreCase)) return 2;
        }
        else if (args.Length != 0) return 2;
        using var mutex = new Mutex(true, "Local\\JobResearchWebViewDev-" + Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(data))), out var first);
        if (!first) return 3;
        ApplicationConfiguration.Initialize();
        using var window = new HostWindow(data, smoke);
        Application.Run(window);
        return window.ExitCode;
    }
}

internal sealed class Backend : IDisposable
{
    private readonly ConcurrentDictionary<long, TaskCompletionSource<JsonElement>> pending = new();
    private readonly SemaphoreSlim writeLock = new(1, 1);
    private readonly TaskCompletionSource<string> ready = new(TaskCreationOptions.RunContinuationsAsynchronously);
    private Process? process;
    private long sequence;
    private bool disposing;
    internal event Action<string>? OpenExternal;
    internal event Action? Failed;
    internal async Task<string> Start(string data, string token)
    {
        var root = AppContext.BaseDirectory;
        var start = new ProcessStartInfo(Path.Combine(root, "runtime", "bin", "win-x64", "node.exe"))
        { UseShellExecute = false, RedirectStandardInput = true, RedirectStandardOutput = true, RedirectStandardError = true, CreateNoWindow = true, WorkingDirectory = root };
        start.ArgumentList.Add(Path.Combine(root, "backend", "backend.cjs"));
        // Node injection and arbitrary developer variables must not reach the backend.
        var allowed = new HashSet<string>(StringComparer.OrdinalIgnoreCase) { "PATH", "SYSTEMROOT", "WINDIR", "TEMP", "TMP", "USERPROFILE", "LOCALAPPDATA", "APPDATA" };
        foreach (var key in start.Environment.Keys.ToArray()) if (!allowed.Contains(key)) start.Environment.Remove(key);
        start.Environment["JOB_WEBVIEW_DATA"] = data;
        start.Environment["JOB_WEBVIEW_HOST"] = Environment.ProcessPath!;
        start.Environment["DESKTOP_AUTH_TOKEN"] = token;
        process = new Process { StartInfo = start, EnableRaisingEvents = true };
        process.OutputDataReceived += (_, e) => Receive(e.Data);
        process.ErrorDataReceived += (_, _) => { }; // Do not forward sensitive backend error details.
        process.Exited += (_, _) =>
        {
            ready.TrySetException(new IOException("内部サーバーが停止しました。"));
            foreach (var operation in pending.Values) operation.TrySetException(new IOException("内部サーバーが停止しました。"));
            if (!disposing) Failed?.Invoke();
        };
        if (!process.Start()) throw new IOException("内部サーバーを起動できませんでした。");
        process.BeginOutputReadLine(); process.BeginErrorReadLine();
        return await ready.Task.WaitAsync(TimeSpan.FromSeconds(45));
    }
    private void Receive(string? line)
    {
        if (line is null) return;
        try
        {
            using var document = JsonDocument.Parse(line);
            var message = document.RootElement;
            switch (message.GetProperty("type").GetString())
            {
                case "ready": ready.TrySetResult(message.GetProperty("origin").GetString()!); break;
                case "openExternal": OpenExternal?.Invoke(message.GetProperty("url").GetString()!); break;
                case "fatal": ready.TrySetException(new IOException("内部サーバーを起動できませんでした。")); break;
                case "reply":
                    if (message.TryGetProperty("id", out var id) && id.TryGetInt64(out var number) && pending.TryRemove(number, out var operation))
                    {
                        if (message.TryGetProperty("error", out var error)) operation.TrySetException(new IOException(error.GetString()));
                        else operation.TrySetResult(message.GetProperty("result").Clone());
                    }
                    break;
            }
        }
        catch { ready.TrySetException(new IOException("内部通信に失敗しました。")); }
    }
    internal async Task<JsonElement> Call(string method, JsonElement? argument = null)
    {
        var id = Interlocked.Increment(ref sequence);
        var operation = new TaskCompletionSource<JsonElement>(TaskCreationOptions.RunContinuationsAsynchronously);
        pending[id] = operation;
        try
        {
            await writeLock.WaitAsync();
            try { await process!.StandardInput.WriteLineAsync(JsonSerializer.Serialize(new { id, method, argument })); }
            finally { writeLock.Release(); }
            return await operation.Task.WaitAsync(TimeSpan.FromMinutes(4));
        }
        finally { pending.TryRemove(id, out _); }
    }
    public void Dispose()
    {
        disposing = true;
        try { process?.StandardInput.Close(); if (process is not null && !process.WaitForExit(3000)) process.Kill(entireProcessTree: true); } catch { }
        process?.Dispose();
    }
}

internal sealed class HostWindow : Form
{
    private readonly WebView2 web = new() { Dock = DockStyle.Fill };
    private readonly Backend backend = new();
    private readonly string data;
    private readonly bool smoke;
    private readonly string token = Convert.ToHexString(RandomNumberGenerator.GetBytes(32));
    private string origin = "";
    private bool closing;
    internal int ExitCode { get; private set; }
    private static readonly HashSet<string> Methods = new() { "getSession", "signIn", "cancelSignIn", "signOut", "listModels", "generate", "openUsage", "getCareerProfile", "saveCareerProfile" };
    internal HostWindow(string data, bool smoke)
    {
        this.data = data; this.smoke = smoke;
        Text = "就活トラッカー（WebView2試作・別データ）";
        Width = 1200; Height = 850; MinimumSize = new Size(320, 400);
        Controls.Add(web);
        backend.OpenExternal += url => BeginInvoke(() => OpenExternal(url));
        backend.Failed += () => { if (!closing) BeginInvoke(() => Fail("内部サーバーが停止しました。")); };
        Shown += async (_, _) => { try { await Start(); } catch { Fail("アプリを起動できませんでした。WebView2 Runtimeがインストールされているか確認してください。"); } };
    }
    private bool Trusted(string url) => Uri.TryCreate(url, UriKind.Absolute, out var parsed) && parsed.UserInfo == "" && parsed.GetLeftPart(UriPartial.Authority) == origin;
    private static void OpenExternal(string url)
    {
        if (Uri.TryCreate(url, UriKind.Absolute, out var parsed) && parsed.Scheme == "https" && parsed.UserInfo == "")
            try { Process.Start(new ProcessStartInfo(parsed.AbsoluteUri) { UseShellExecute = true }); } catch { }
    }
    private async Task Start()
    {
        origin = await backend.Start(data, token);
        if (!Uri.TryCreate(origin, UriKind.Absolute, out var address) || address.Scheme != "http" || address.Host != "127.0.0.1" || address.Port < 1) throw new IOException();
        var environment = await CoreWebView2Environment.CreateAsync(null, Path.Combine(data, "webview-profile"));
        await web.EnsureCoreWebView2Async(environment);
        var core = web.CoreWebView2;
        core.Settings.AreDevToolsEnabled = false;
        core.Settings.IsStatusBarEnabled = false;
        core.Settings.IsPasswordAutosaveEnabled = false;
        core.Settings.IsGeneralAutofillEnabled = false;
        core.PermissionRequested += (_, e) => e.State = CoreWebView2PermissionState.Deny;
        core.AddWebResourceRequestedFilter("*", CoreWebView2WebResourceContext.All);
        core.WebResourceRequested += (_, e) =>
        {
            if (Trusted(e.Request.Uri)) e.Request.Headers.SetHeader("x-desktop-token", token);
            else if (e.Request.Uri.StartsWith("http:") || e.Request.Uri.StartsWith("https:")) e.Response = environment.CreateWebResourceResponse(Stream.Null, 403, "Forbidden", "Content-Type: text/plain");
        };
        core.NavigationStarting += (_, e) => { if (!Trusted(e.Uri)) { e.Cancel = true; if (e.IsUserInitiated) OpenExternal(e.Uri); } };
        core.FrameNavigationStarting += (_, e) => e.Cancel = true;
        core.NewWindowRequested += (_, e) => { e.Handled = true; if (e.IsUserInitiated) OpenExternal(e.Uri); };
        core.WebMessageReceived += async (_, e) =>
        {
            if (!Trusted(e.Source) || !Trusted(web.Source?.AbsoluteUri ?? "")) return;
            string? id = null;
            try
            {
                if (e.WebMessageAsJson.Length > 1024 * 1024) throw new IOException();
                using var message = JsonDocument.Parse(e.WebMessageAsJson);
                var root = message.RootElement;
                id = root.GetProperty("id").GetString();
                var method = root.GetProperty("method").GetString()!;
                if (id is null || id.Length > 64 || !Methods.Contains(method)) throw new IOException();
                var argument = root.TryGetProperty("argument", out var value) ? value.Clone() : (JsonElement?)null;
                var result = await backend.Call(method, argument);
                if (!closing && Trusted(web.Source?.AbsoluteUri ?? "")) core.PostWebMessageAsJson(JsonSerializer.Serialize(new { type = "reply", id, result }));
            }
            catch (Exception error)
            {
                if (!closing) core.PostWebMessageAsJson(JsonSerializer.Serialize(new { type = "reply", id, error = error is IOException ? error.Message : "操作に失敗しました。" }));
            }
        };
        var bridge = File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "backend", "bridge.js")).Replace("__EXPECTED_ORIGIN__", JsonSerializer.Serialize(origin));
        await core.AddScriptToExecuteOnDocumentCreatedAsync(bridge);
        if (smoke) core.NavigationCompleted += async (_, e) =>
        {
            if (!e.IsSuccess) { Fail("WebView2 navigation failed"); return; }
            try { await Smoke(); ExitCode = 0; Close(); } catch { Fail("WebView2 smoke failed"); }
        };
        core.Navigate(origin);
    }
    private async Task Smoke()
    {
        using var client = new HttpClient();
        if ((await client.GetAsync(origin + "/api/companies")).StatusCode != System.Net.HttpStatusCode.Unauthorized) throw new IOException();
        var secret = Encoding.UTF8.GetBytes("DPAPI smoke 日本語");
        var encrypted = ProtectedData.Protect(secret, Program.Entropy, DataProtectionScope.CurrentUser);
        if (!ProtectedData.Unprotect(encrypted, Program.Entropy, DataProtectionScope.CurrentUser).SequenceEqual(secret)) throw new IOException();
        await web.CoreWebView2.ExecuteScriptAsync("""
          void (async () => {
            const api = window.syukatsuDesktop;
            if (!api || (await api.getSession()).connected) throw Error('bridge');
            const profile = await api.getCareerProfile();
            await api.saveCareerProfile({...profile, completed: true, priorities: 'WebView2 test'});
            if ((await api.getCareerProfile()).priorities !== 'WebView2 test') throw Error('profile');
            const company = await fetch('/api/companies', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'WebView2 smoke company'})}).then(r=>r.json());
            if (!company.success) throw Error('company');
            const event = await fetch('/api/events',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({companyId:company.company.id,title:'WebView2 interview',startAt:'2030-01-01T01:00:00Z',endAt:'2030-01-01T02:00:00Z'})}).then(r=>r.json());
            if (!event.success) throw Error('event');
            const events = await fetch('/api/events').then(r=>r.json());
            if (events.events.length !== 1) throw Error('events');
            return JSON.stringify({bridge:true,profile:true,company:true,event:true});
          })().then(value => { window.__webviewSmoke = value; }, () => { window.__webviewSmoke = 'failed'; });
          """);
        var passed = false;
        for (var i = 0; i < 200; i++)
        {
            var result = await web.CoreWebView2.ExecuteScriptAsync("window.__webviewSmoke || null");
            if (result != "null") { passed = JsonSerializer.Deserialize<string>(result)?.Contains("\"event\":true") == true; break; }
            await Task.Delay(100);
        }
        if (!passed) throw new IOException();
        var check = await backend.Call("getCareerProfile");
        if (check.GetProperty("priorities").GetString() != "WebView2 test") throw new IOException();
        client.DefaultRequestHeaders.Add("x-desktop-token", token);
        var events = await client.GetStringAsync(origin + "/api/events");
        if (!events.Contains("WebView2 interview")) throw new IOException();
        File.WriteAllText(Path.Combine(data, "smoke-result.json"), "{\"webview2\":true,\"bridge\":true,\"dpapi\":true,\"api\":true}");
    }
    private void Fail(string message)
    {
        if (closing) return;
        ExitCode = 1;
        if (smoke) { Directory.CreateDirectory(data); File.WriteAllText(Path.Combine(data, "smoke-error.txt"), message); }
        else MessageBox.Show(message, Text, MessageBoxButtons.OK, MessageBoxIcon.Error);
        Close();
    }
    protected override void OnFormClosed(FormClosedEventArgs e)
    {
        closing = true; web.Dispose(); backend.Dispose(); base.OnFormClosed(e);
    }
}
