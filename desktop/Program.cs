using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Net.Http;
using System.Text.Json;
using System.Text;
using System.Security.Cryptography;
using System.Windows.Forms;

internal static class Program
{
    [STAThread]
    private static void Main()
    {
        ApplicationConfiguration.Initialize();
        Application.Run(new ShopContext());
    }
}

internal sealed class ShopContext : ApplicationContext
{
    private readonly string home = Path.GetFullPath(AppContext.BaseDirectory).TrimEnd(Path.DirectorySeparatorChar);
    private readonly NotifyIcon tray;
    private readonly object logLock = new();
    private Process? server;
    private bool closing;
    private bool ready;

    public ShopContext()
    {
        var menu = new ContextMenuStrip();
        menu.Items.Add("Mở Shop Mẹ CaCao", null, (_, _) => OpenBrowser());
        menu.Items.Add("Thoát ứng dụng", null, async (_, _) => await CloseSafely());
        tray = new NotifyIcon
        {
            Icon = Icon.ExtractAssociatedIcon(Environment.ProcessPath ?? string.Empty) ?? SystemIcons.Application,
            Text = "Shop Mẹ CaCao V8",
            Visible = true,
            ContextMenuStrip = menu
        };
        tray.DoubleClick += (_, _) => OpenBrowser();
        // The running backend repairs Desktop shortcuts through IShellLinkW,
        // including installations retaining an older launcher EXE.
        _ = StartAsync();
    }


    private static void WriteOnce(string file, object value)
    {
        var temp = file + ".new";
        File.WriteAllText(temp, JsonSerializer.Serialize(value, new JsonSerializerOptions { WriteIndented = true }));
        File.Move(temp, file, overwrite: false);
    }

    private void VerifyOrInitialize()
    {
        if (!string.Equals(Path.GetPathRoot(home), @"D:\", StringComparison.OrdinalIgnoreCase))
            throw new InvalidOperationException("Phiên bản V8 phải cài tại ổ D:.");
        string root = Path.Combine(home, "data", "shop-v8");
        string dbDir = Path.Combine(root, "database");
        string db = Path.Combine(dbDir, "shop-v8.db");
        string warehouse = @"D:\Me CaCao Store";
        string marker = Path.Combine(home, "installation.json");
        if (File.Exists(marker))
        {
            using var document = JsonDocument.Parse(File.ReadAllText(marker));
            var value = document.RootElement;
            if (value.GetProperty("format").GetInt32() != 8 ||
                value.GetProperty("schema").GetInt32() != 130 ||
                !string.Equals(value.GetProperty("home").GetString(), home, StringComparison.OrdinalIgnoreCase))
                throw new InvalidOperationException("Không đúng bản cài V8. Đã chặn đọc nhầm dữ liệu.");
            if (File.Exists(Path.Combine(dbDir, ".initialized.json")) && !File.Exists(db))
                throw new InvalidOperationException("Database V8 bị thiếu; không khởi tạo kho rỗng.");
            return;
        }

        if (File.Exists(db) || Directory.Exists(Path.Combine(home, "data", "stage6-main-test")))
            throw new InvalidOperationException("Đây không phải thư mục cài sạch V8.");
        foreach (var item in new[] {
            dbDir, Path.Combine(root,"warehouse"), Path.Combine(home,"runtime"),
            Path.Combine(home,"releases"), Path.Combine(home,"updates"),
            Path.Combine(home,"staging"), Path.Combine(home,"cache"), Path.Combine(home,"logs")
        }) Directory.CreateDirectory(item);
        // First launch must not silently lock in a default warehouse.
        // The owner selects the actual folder directly from Import kho.
        WriteOnce(marker, new { format = 8, mode = "FRESH", home, warehouse = (string?)null, data = root, schema = 130, createdAt = DateTimeOffset.UtcNow });
    }

    private void Log(string? message)
    {
        if (string.IsNullOrWhiteSpace(message)) return;
        try
        {
            lock (logLock)
                File.AppendAllText(Path.Combine(home, "logs", "desktop.log"), DateTime.Now.ToString("s") + " " + message + Environment.NewLine);
        }
        catch { /* Logging cannot corrupt the shop transaction. */ }
    }

    private async Task StartAsync()
    {
        try
        {
            VerifyOrInitialize();
            string node = Path.Combine(home, "runtime", "node.exe");
            string script = Path.Combine(home, "releases", "current", "scripts", "v8", "node-runner.mjs");
            if (!File.Exists(node) || !File.Exists(script))
                throw new InvalidOperationException("Bộ cài thiếu runtime hoặc chương trình. Không tạo dữ liệu mới.");
            var start = new ProcessStartInfo(node)
            {
                WorkingDirectory = Path.Combine(home,"releases","current"),
                UseShellExecute = false,
                CreateNoWindow = true,
                RedirectStandardInput = true,
                RedirectStandardOutput = true,
                RedirectStandardError = true
            };
            start.ArgumentList.Add(script);
            foreach (var variable in new[] {"SHOP_DB_PATH","SHOP_SANDBOX_ROOT","SHOP_MANAGED_HOME","SHOP_LOCAL_V2_CONFIG","SHOP_TASK_WORKER"})
                start.Environment.Remove(variable);
            start.Environment["SHOP_V8_HOME"] = home;
            start.Environment["SHOP_FRESH_DEVELOPMENT"] = "1";
            start.Environment["SHOP_HOST"] = "127.0.0.1";
            start.Environment["PORT"] = "3000";
            server = new Process { StartInfo = start, EnableRaisingEvents = true };
            server.OutputDataReceived += (_, e) => Log(e.Data);
            server.ErrorDataReceived += (_, e) => Log(e.Data);
            if (!server.Start()) throw new InvalidOperationException("Không mở được chương trình.");
            server.BeginOutputReadLine();
            server.BeginErrorReadLine();
            using var client = new HttpClient { Timeout = TimeSpan.FromSeconds(1) };
            for (int i = 0; i < 120; i++)
            {
                if (server.HasExited) throw new InvalidOperationException("Backend đã dừng; xem D:\\ShopMeCaCao\\logs\\desktop.log.");
                try
                {
                    using var response = await client.GetAsync("http://127.0.0.1:3000/api/health");
                    if (response.IsSuccessStatusCode)
                    {
                        using var json = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
                        var health = json.RootElement;
                        if (health.GetProperty("ok").GetBoolean() &&
                            health.GetProperty("database").GetString() == "shop-v8.db" &&
                            health.GetProperty("schema").GetInt32() == 130 &&
                            health.GetProperty("installationId").GetString() ==
                                Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(home))).ToLowerInvariant())
                        {
                            ready = true;
                            OpenBrowser();
                            return;
                        }
                        throw new InvalidOperationException("Cổng đang chạy bản Shop khác. V8 không kết nối nhầm database.");
                    }
                }
                catch (HttpRequestException) { }
                catch (TaskCanceledException) { }
                await Task.Delay(250);
            }
            throw new InvalidOperationException("Ứng dụng chưa khởi động. Kiểm tra log trên ổ D:.");
        }
        catch (Exception error)
        {
            Log(error.ToString());
            MessageBox.Show(error.Message, "Shop Mẹ CaCao - Không mở được", MessageBoxButtons.OK, MessageBoxIcon.Warning);
        }
    }

    private void OpenBrowser()
    {
        if (!ready) return;
        // Prefer a dedicated maximized Edge app window: laptop viewport should
        // not inherit the last narrow browser size. Fallback preserves compatibility.
        string? edge = new[] {
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), "Microsoft", "Edge", "Application", "msedge.exe"),
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "Microsoft", "Edge", "Application", "msedge.exe")
        }.FirstOrDefault(File.Exists);
        if (edge != null)
        {
            try
            {
                var info = new ProcessStartInfo(edge) { UseShellExecute = true };
                info.ArgumentList.Add("--app=http://127.0.0.1:3000");
                info.ArgumentList.Add("--start-maximized");
                Process.Start(info);
                return;
            }
            catch (Exception error) { Log("Edge app window fallback: " + error.Message); }
        }
        Process.Start(new ProcessStartInfo("http://127.0.0.1:3000") { UseShellExecute = true });
    }

    private async Task CloseSafely()
    {
        if (closing) return;
        closing = true;
        try
        {
            if (server is { HasExited: false })
            {
                await server.StandardInput.WriteLineAsync("STOP");
                await server.StandardInput.FlushAsync();
                var exited = await Task.Run(() => server.WaitForExit(12000));
                if (!exited)
                {
                    MessageBox.Show("Shop đang có tác vụ cần kết thúc hoặc đối soát. Hãy hoàn tất trước khi thoát.",
                        "Shop Mẹ CaCao", MessageBoxButtons.OK, MessageBoxIcon.Information);
                    return;
                }
            }
            tray.Visible = false;
            tray.Dispose();
            ExitThread();
        }
        finally { closing = false; }
    }
}
