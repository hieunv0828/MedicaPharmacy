using System;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Net.NetworkInformation;
using System.Text;
using System.Threading;
using System.Diagnostics;
using System.Collections;
using System.Collections.Generic;
using System.Drawing;
using System.Windows.Forms;
using System.Web.Script.Serialization;
using Microsoft.Win32;

namespace MedicaPharmacy
{
    static class Program
    {
        [STAThread]
        static void Main(string[] args)
        {
            AppDomain.CurrentDomain.UnhandledException += (s, e) => {
                try { File.WriteAllText(Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "server_err.txt"), e.ExceptionObject.ToString()); } catch { }
            };

            // Kiểm tra xem đã có tiến trình MedicaServer nào đang chạy chưa
            int currentId = Process.GetCurrentProcess().Id;
            string currentProcessName = Process.GetCurrentProcess().ProcessName;
            Process[] existingProcesses = Process.GetProcessesByName(currentProcessName);
            int otherCount = 0;
            foreach (Process p in existingProcesses)
            {
                if (p.Id != currentId) otherCount++;
            }
            if (otherCount > 0)
            {
                // Đã có máy chủ chạy rồi -> chỉ cần mở trình duyệt tới web
                OpenBrowser("http://medica.com");
                return;
            }

            try
            {
                Application.EnableVisualStyles();
                Application.SetCompatibleTextRenderingDefault(false);
                Application.Run(new MedicaTrayApplicationContext(args));
            }
            catch (Exception ex)
            {
                try { File.WriteAllText(Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "startup_err.txt"), ex.ToString()); } catch { }
            }
        }

        public static void OpenBrowser(string url)
        {
            try
            {
                Process.Start(new ProcessStartInfo(url) { UseShellExecute = true });
            }
            catch
            {
                try
                {
                    Process.Start("chrome.exe", url);
                }
                catch
                {
                    try { Process.Start("msedge.exe", url); } catch { }
                }
            }
        }
    }

    public class MedicaTrayApplicationContext : ApplicationContext
    {
        private NotifyIcon _trayIcon;
        private TcpListener _tcpListener;
        private string _webRoot;
        private string _dataDir;
        private string _dbFile;
        private int _activePort = 80;
        private bool _isRunning = true;
        private readonly object _dbLock = new object();
        private const string StartupRegKey = @"Software\Microsoft\Windows\CurrentVersion\Run";
        private const string AppName = "MedicaPharmacyServer";
        private Process _ngrokProcess = null;
        private string _ngrokFixedUrl = "https://proofread-unissued-roundness.ngrok-free.dev";
        private bool _enableNgrok = true;
        private bool _isLicensed = true;
        private string _machineCode = "";
        private System.Threading.Timer _autoBackupTimer = null;

        // --- Bảo vệ chống ghi đè làm giảm dữ liệu (guard phía máy chủ) ---
        private string _countsFile = null;
        private bool _knownCountsLoaded = false;
        private long _knownMedicines = 0;
        private long _knownOrders = 0;
        private long _knownVouchers = 0;
        private long _knownStockIns = 0;
        private long _knownCustomers = 0;

        // In-memory database cache (string + encoded bytes)
        private string _dbCache = null;
        private byte[] _dbCacheBytes = null;
        private DateTime _dbCacheTime = DateTime.MinValue;
        private static readonly TimeSpan _dbCacheTtl = TimeSpan.FromSeconds(2);
        private static readonly string _serverInstanceId = Guid.NewGuid().ToString("N").Substring(0, 8);
        private static long _dbVersion = (long)(DateTime.UtcNow.Subtract(new DateTime(2026, 1, 1))).TotalSeconds;
        private static string _dbLastUpdated = DateTime.UtcNow.ToString("yyyy-MM-ddTHH:mm:ss.fffZ");
        private static bool _recoveryBlocked = false;

        public MedicaTrayApplicationContext(string[] args = null)
        {
            if (args != null)
            {
                foreach (string arg in args)
                {
                    if (arg.Equals("--no-ngrok", StringComparison.OrdinalIgnoreCase) ||
                        arg.Equals("-no-ngrok", StringComparison.OrdinalIgnoreCase) ||
                        arg.Equals("/no-ngrok", StringComparison.OrdinalIgnoreCase) ||
                        arg.Equals("--lan-only", StringComparison.OrdinalIgnoreCase) ||
                        arg.Equals("--local-only", StringComparison.OrdinalIgnoreCase))
                    {
                        _enableNgrok = false;
                    }
                }
            }

            _webRoot = AppDomain.CurrentDomain.BaseDirectory;
            if (!File.Exists(Path.Combine(_webRoot, "index.html")))
            {
                string parent = Path.GetFullPath(Path.Combine(_webRoot, ".."));
                if (File.Exists(Path.Combine(parent, "index.html")))
                {
                    _webRoot = parent;
                }
            }

            _dataDir = Path.Combine(_webRoot, "data");
            if (!Directory.Exists(_dataDir)) Directory.CreateDirectory(_dataDir);
            _dbFile = Path.Combine(_dataDir, "database.json");
            _countsFile = Path.Combine(_dataDir, "db_counts.json");

            // Tải cấu hình tên miền remote ngrok nếu có
            string domainConfigFile = Path.Combine(_dataDir, "remote_domain.txt");
            if (File.Exists(domainConfigFile))
            {
                try
                {
                    string customUrl = File.ReadAllText(domainConfigFile, Encoding.UTF8).Trim();
                    if (!string.IsNullOrEmpty(customUrl)) _ngrokFixedUrl = customUrl;
                }
                catch { }
            }
            else
            {
                try { File.WriteAllText(domainConfigFile, _ngrokFixedUrl, Encoding.UTF8); } catch { }
            }

            // Kiểm tra bản quyền máy tính hiện tại
            _machineCode = LicenseManager.GetCurrentMachineCode();
            CheckLicenseStatus();

            InitDatabaseIfEmpty();
            // Nạp sẵn số bản ghi và phiên bản cơ sở dữ liệu đồng bộ để guard chống ghi đè hoạt động ngay từ đơn đầu tiên
            try { EnsureKnownCounts(); } catch { }
            StartServer();
            StartAutoBackupEngine();
            StartNgrokTunnel();
            try { InitTrayIcon(); } catch { }

            string openUrl = (_activePort == 80) ? "http://medica.com" : ("http://localhost:" + _activePort);
            Program.OpenBrowser(openUrl);
        }

        private void CheckLicenseStatus()
        {
            // Mở khóa bản quyền vĩnh viễn không cần nhập key
            _isLicensed = true;
        }

        private void StartNgrokTunnel()
        {
            if (!_enableNgrok)
            {
                StopNgrokTunnel();
                return;
            }

            string ngrokExe = Path.Combine(_webRoot, "tools", "ngrok.exe");
            if (!File.Exists(ngrokExe)) return;

            ThreadPool.QueueUserWorkItem((state) =>
            {
                int failCount = 0;
                while (_isRunning)
                {
                    try
                    {
                        if (_ngrokProcess == null || _ngrokProcess.HasExited)
                        {
                            foreach (Process p in Process.GetProcessesByName("ngrok"))
                            {
                                try { p.Kill(); } catch { }
                            }
                            Thread.Sleep(500);

                            string logFile = Path.Combine(_webRoot, "tools", "ngrok.log");
                            RotateLogFile(logFile);

                            ProcessStartInfo psi = new ProcessStartInfo
                            {
                                FileName = ngrokExe,
                                Arguments = string.Format("http {0} --url {1} --log \"{2}\"", _activePort, _ngrokFixedUrl, logFile),
                                CreateNoWindow = true,
                                WindowStyle = ProcessWindowStyle.Hidden,
                                UseShellExecute = false,
                                RedirectStandardInput = true
                            };

                            _ngrokProcess = Process.Start(psi);

                            // Kiểm tra xem tiến trình có thoát ngay không (mất mạng/lỗi token)
                            Thread.Sleep(3000);
                            if (_ngrokProcess != null && _ngrokProcess.HasExited)
                            {
                                failCount++;
                            }
                            else
                            {
                                failCount = 0;
                            }
                        }
                    }
                    catch { failCount++; }

                    // Cooldown thích ứng: nếu lỗi liên tục, giãn thời gian chờ từ 5s -> 15s -> 60s
                    int sleepMs = 5000;
                    if (failCount > 5) sleepMs = 60000;
                    else if (failCount > 2) sleepMs = 15000;
                    else if (failCount > 0) sleepMs = 10000;

                    Thread.Sleep(sleepMs);
                }
            });
        }

        private void StopNgrokTunnel()
        {
            try
            {
                if (_ngrokProcess != null && !_ngrokProcess.HasExited)
                {
                    _ngrokProcess.Kill();
                }
            }
            catch { }

            try
            {
                foreach (Process p in Process.GetProcessesByName("ngrok"))
                {
                    try { p.Kill(); } catch { }
                }
            }
            catch { }
        }

        private void StartServer()
        {
            // Thử khởi động cổng 80 trước
            bool started = TryBindPort(80);
            if (!started)
            {
                // Nếu 80 bị chiếm (thường do IIS/W3SVC), dùng 8080
                started = TryBindPort(8080);
                if (started)
                {
                    ThreadPool.QueueUserWorkItem((s) => {
                        Thread.Sleep(2500);
                        try
                        {
                            if (_trayIcon != null)
                            {
                                _trayIcon.ShowBalloonTip(4000, 
                                    "Thông báo cổng mạng", 
                                    "Cổng 80 đang bận (do IIS/W3SVC). Máy chủ đang chạy ở cổng 8080 (http://localhost:8080).", 
                                    ToolTipIcon.Warning);
                            }
                        }
                        catch { }
                    });
                }
            }

            if (!started)
            {
                MessageBox.Show(
                    "Không thể mở cổng mạng 80 hoặc 8080 cho máy chủ MedicaPharmacy.\nVui lòng kiểm tra xem có phần mềm nào khác đang chiếm cổng không.",
                    "Lỗi Khởi Động Máy Chủ",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Error
                );
            }
        }

        private bool TryBindPort(int port)
        {
            try
            {
                _tcpListener = new TcpListener(IPAddress.Any, port);
                _tcpListener.ExclusiveAddressUse = false;
                _tcpListener.Server.SetSocketOption(SocketOptionLevel.Socket, SocketOptionName.ReuseAddress, true);
                _tcpListener.Start();
                _activePort = port;

                Thread listenerThread = new Thread(ListenLoop);
                listenerThread.IsBackground = false;
                listenerThread.Name = "MedicaServerHttpListener";
                listenerThread.Start();
                return true;
            }
            catch
            {
                return false;
            }
        }

        private void InitTrayIcon()
        {
            ContextMenuStrip menu = new ContextMenuStrip();
            menu.Font = new Font("Segoe UI", 9F, FontStyle.Regular);

            // 1. Mở giao diện bán thuốc
            string openLabel = "🌐 Mở Phần Mềm (http://medica.com)";
            ToolStripMenuItem itemOpen = new ToolStripMenuItem(openLabel);
            itemOpen.Font = new Font("Segoe UI", 9F, FontStyle.Bold);
            itemOpen.Click += (s, e) => {
                string url = (_activePort == 80) ? "http://medica.com" : ("http://localhost:" + _activePort);
                Program.OpenBrowser(url);
            };
            menu.Items.Add(itemOpen);

            if (_enableNgrok)
            {
                // 1.1 Mở qua Internet / Từ xa bằng Ngrok
                ToolStripMenuItem itemRemote = new ToolStripMenuItem("🌍 Mở Qua Internet (Từ Xa / Điện Thoại)");
                itemRemote.Click += (s, e) => {
                    if (!string.IsNullOrEmpty(_ngrokFixedUrl)) Program.OpenBrowser(_ngrokFixedUrl);
                };
                menu.Items.Add(itemRemote);

                // 1.2 Sao chép đường link từ xa
                ToolStripMenuItem itemCopyLink = new ToolStripMenuItem("📋 Sao Chép Link Truy Cập Từ Xa");
                itemCopyLink.Click += (s, e) => {
                    try
                    {
                        Clipboard.SetText(_ngrokFixedUrl);
                        _trayIcon.ShowBalloonTip(2000, "Đã Sao Chép Link Từ Xa", _ngrokFixedUrl + "\nBạn có thể gửi link này qua Zalo để mở trên điện thoại!", ToolTipIcon.Info);
                    }
                    catch { }
                };
                menu.Items.Add(itemCopyLink);
            }
            else
            {
                ToolStripMenuItem itemRemoteDisabled = new ToolStripMenuItem("🌍 Mở Qua Internet (ĐÃ TẮT - Nhường máy khách)");
                itemRemoteDisabled.Enabled = false;
                menu.Items.Add(itemRemoteDisabled);
            }

            menu.Items.Add(new ToolStripSeparator());

            // 2. Xem IP kết nối điện thoại
            ToolStripMenuItem itemPhone = new ToolStripMenuItem("📱 Xem Địa Chỉ Kết Nối Điện Thoại");
            itemPhone.Click += (s, e) => ShowPhoneConnectionInfo();
            menu.Items.Add(itemPhone);

            // 3. Khởi động cùng Windows
            ToolStripMenuItem itemStartup = new ToolStripMenuItem("🚀 Tự Động Chạy Cùng Windows");
            itemStartup.CheckOnClick = true;
            itemStartup.Checked = IsRunOnStartupEnabled();
            itemStartup.Click += (s, e) => ToggleRunOnStartup(itemStartup.Checked);
            menu.Items.Add(itemStartup);

            // 4. Mở thư mục dữ liệu
            ToolStripMenuItem itemFolder = new ToolStripMenuItem("📁 Mở Thư Mục Dữ Liệu Nhà Thuốc");
            itemFolder.Click += (s, e) => {
                try { Process.Start("explorer.exe", _webRoot); } catch { }
            };
            menu.Items.Add(itemFolder);

            menu.Items.Add(new ToolStripSeparator());

            // 5. Thoát máy chủ
            ToolStripMenuItem itemExit = new ToolStripMenuItem("❌ Tắt Máy Chủ (Thoát)");
            itemExit.Click += (s, e) => ExitServer();
            menu.Items.Add(itemExit);

            _trayIcon = new NotifyIcon
            {
                Icon = CreateMedicalIcon(),
                ContextMenuStrip = menu,
                Text = _enableNgrok ? "MedicaPharmacy (http://medica.com)" : "MedicaPharmacy [No-Ngrok] (http://medica.com)",
                Visible = true
            };

            // Nhấp đúp chuột vào icon khay hệ thống -> mở trang web
            _trayIcon.DoubleClick += (s, e) => {
                string url = (_activePort == 80) ? "http://medica.com" : ("http://localhost:" + _activePort);
                Program.OpenBrowser(url);
            };

            // Thông báo bong bóng nhỏ lúc khởi động
            if (_isLicensed)
            {
                string balloonTitle = _enableNgrok ? "MedicaPharmacy Server Đang Chạy Nền" : "MedicaPharmacy (Chế Độ Nội Bộ / Không Ngrok)";
                string balloonMsg = _enableNgrok
                    ? "Máy chủ đang hoạt động êm ái tại http://medica.com.\nNhấp đúp chuột vào icon này để mở phần mềm bất cứ lúc nào!"
                    : "Máy chủ đang hoạt động tại http://medica.com.\nĐã tắt Ngrok để tránh xung đột tên miền từ xa với máy khách!";

                _trayIcon.ShowBalloonTip(
                    3000,
                    balloonTitle,
                    balloonMsg,
                    ToolTipIcon.Info
                );
            }
            else
            {
                _trayIcon.ShowBalloonTip(
                    4000,
                    "MedicaPharmacy - Chưa Kích Hoạt Bản Quyền",
                    "Phần mềm chưa được cấp quyền trên máy tính này (Mã: " + _machineCode + ").\nNhấp đúp chuột vào icon này để kích hoạt!",
                    ToolTipIcon.Warning
                );
            }
        }

        [System.Runtime.InteropServices.DllImport("user32.dll", CharSet = System.Runtime.InteropServices.CharSet.Auto)]
        extern static bool DestroyIcon(IntPtr handle);

        private Icon CreateMedicalIcon()
        {
            try
            {
                using (Bitmap bmp = new Bitmap(16, 16))
                using (Graphics g = Graphics.FromImage(bmp))
                {
                    g.Clear(Color.Transparent);
                    using (SolidBrush brush = new SolidBrush(Color.FromArgb(5, 150, 105))) // Emerald 600
                    {
                        g.FillEllipse(brush, 0, 0, 15, 15);
                    }
                    using (Pen whitePen = new Pen(Color.White, 2))
                    {
                        g.DrawLine(whitePen, 8, 3, 8, 12);
                        g.DrawLine(whitePen, 3, 8, 12, 8);
                    }
                    IntPtr hIcon = bmp.GetHicon();
                    Icon icon = (Icon)Icon.FromHandle(hIcon).Clone();
                    DestroyIcon(hIcon);
                    return icon;
                }
            }
            catch
            {
                return SystemIcons.Application;
            }
        }

        private void ShowPhoneConnectionInfo()
        {
            List<string> ips = GetLocalIPv4Addresses();
            StringBuilder sb = new StringBuilder();
            sb.AppendLine("ĐỊA CHỈ TRUY CẬP TỪ ĐIỆN THOẠI / IPAD (CHUNG WIFI):\n");
            
            foreach (string ip in ips)
            {
                string portStr = (_activePort == 80) ? "" : (":" + _activePort);
                sb.AppendLine("👉  http://" + ip + portStr);
            }

            sb.AppendLine("\n(Chỉ cần mở Safari hoặc Chrome trên điện thoại và gõ địa chỉ trên)");

            MessageBox.Show(sb.ToString(), "Kết Nối Điện Thoại", MessageBoxButtons.OK, MessageBoxIcon.Information);
        }

        private bool IsRunOnStartupEnabled()
        {
            try
            {
                using (RegistryKey key = Registry.CurrentUser.OpenSubKey(StartupRegKey, false))
                {
                    return key != null && key.GetValue(AppName) != null;
                }
            }
            catch { return false; }
        }

        private void ToggleRunOnStartup(bool enable)
        {
            try
            {
                using (RegistryKey key = Registry.CurrentUser.OpenSubKey(StartupRegKey, true))
                {
                    if (key != null)
                    {
                        if (enable)
                        {
                            string exePath = Application.ExecutablePath;
                            key.SetValue(AppName, "\"" + exePath + "\"");
                            _trayIcon.ShowBalloonTip(2000, "Tự Khởi Động", "Phần mềm sẽ tự động bật ngầm khi bạn mở máy tính!", ToolTipIcon.Info);
                        }
                        else
                        {
                            key.DeleteValue(AppName, false);
                            _trayIcon.ShowBalloonTip(2000, "Tự Khởi Động", "Đã tắt tự khởi động cùng Windows.", ToolTipIcon.Info);
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                MessageBox.Show("Lỗi thiết lập khởi động: " + ex.Message);
            }
        }

        private void ListenLoop(object state)
        {
            while (_isRunning && _tcpListener != null)
            {
                try
                {
                    TcpClient client = _tcpListener.AcceptTcpClient();
                    ThreadPool.QueueUserWorkItem(ProcessClient, client);
                }
                catch
                {
                    if (!_isRunning) break;
                }
            }
        }

        private void ProcessClient(object state)
        {
            using (TcpClient client = (TcpClient)state)
            {
                try
                {
                    client.NoDelay = true;
                    client.ReceiveTimeout = 60000;
                    client.SendTimeout = 60000;

                    using (NetworkStream stream = client.GetStream())
                    {
                        byte[] buffer = new byte[65536];
                        int bytesRead = stream.Read(buffer, 0, buffer.Length);
                        if (bytesRead <= 0) return;

                        string rawHeader = Encoding.UTF8.GetString(buffer, 0, bytesRead);
                        string[] lines = rawHeader.Split(new string[] { "\r\n" }, StringSplitOptions.None);
                        if (lines.Length == 0) return;

                        string requestLine = lines[0];
                        string[] parts = requestLine.Split(' ');
                        if (parts.Length < 2) return;

                        string method = parts[0].ToUpper();
                        string rawUrl = parts[1].Split('?')[0];

                        int contentLength = 0;
                        bool clientSupportsGzip = false;
                        foreach (string line in lines)
                        {
                            if (line.StartsWith("Content-Length:", StringComparison.OrdinalIgnoreCase))
                            {
                                int.TryParse(line.Substring("Content-Length:".Length).Trim(), out contentLength);
                            }
                            else if (line.StartsWith("Accept-Encoding:", StringComparison.OrdinalIgnoreCase))
                            {
                                if (line.IndexOf("gzip", StringComparison.OrdinalIgnoreCase) >= 0)
                                {
                                    clientSupportsGzip = true;
                                }
                            }
                        }

                        int headerEndIdx = rawHeader.IndexOf("\r\n\r\n");
                        string body = "";
                        if (headerEndIdx >= 0)
                        {
                            int bodyStartInBytes = Encoding.UTF8.GetByteCount(rawHeader.Substring(0, headerEndIdx + 4));
                            int bodyAlreadyRead = bytesRead - bodyStartInBytes;

                            MemoryStream ms = new MemoryStream();
                            if (bodyAlreadyRead > 0)
                            {
                                ms.Write(buffer, bodyStartInBytes, bodyAlreadyRead);
                            }

                            while (ms.Length < contentLength)
                            {
                                int toRead = Math.Min(buffer.Length, contentLength - (int)ms.Length);
                                int read = stream.Read(buffer, 0, toRead);
                                if (read <= 0) break;
                                ms.Write(buffer, 0, read);
                            }

                            if (contentLength > 0 && ms.Length < contentLength)
                            {
                                SendResponse(stream, 400, "application/json; charset=utf-8", 
                                    Encoding.UTF8.GetBytes("{\"success\":false,\"message\":\"Dữ liệu gửi lên không trọn vẹn (truncated payload)\"}"));
                                return;
                            }

                            body = Encoding.UTF8.GetString(ms.ToArray());
                        }

                        if (method == "OPTIONS")
                        {
                            SendResponse(stream, 200, "text/plain", new byte[0]);
                            return;
                        }

                        if (rawUrl.Equals("/api/status", StringComparison.OrdinalIgnoreCase))
                        {
                            List<string> ips = GetLocalIPv4Addresses();
                            string ipsJson = string.Join(",", ips.ConvertAll(ip => "\"" + ip + "\"").ToArray());
                            string lastUpdated = GetDataDirLastWrite().ToString("yyyy-MM-ddTHH:mm:ssZ");
                            string json = string.Format(
                                "{{\"status\":\"online\",\"app\":\"MedicaPharmacy\",\"port\":{0},\"domain\":\"medica.com\",\"ips\":[{1}],\"time\":\"{2}\",\"licensed\":{3},\"machineCode\":\"{4}\",\"ngrokEnabled\":{5},\"lastUpdated\":\"{6}\"}}",
                                _activePort,
                                ipsJson,
                                DateTime.Now.ToString("yyyy-MM-ddTHH:mm:ss"),
                                _isLicensed ? "true" : "false",
                                _machineCode,
                                _enableNgrok ? "true" : "false",
                                lastUpdated
                            );
                            SendResponse(stream, 200, "application/json; charset=utf-8", Encoding.UTF8.GetBytes(json));
                            return;
                        }

                        // API kiểm tra trạng thái cơ sở dữ liệu siêu nhẹ (chỉ ~70 bytes thay vì tải toàn bộ database 17MB)
                        if (rawUrl.Equals("/api/database/status", StringComparison.OrdinalIgnoreCase))
                        {
                            EnsureKnownCounts();
                            string statusJson = string.Format("{{\"status\":\"online\",\"version\":{0},\"lastUpdated\":\"{1}\",\"instanceId\":\"{2}\"}}", _dbVersion, _dbLastUpdated, _serverInstanceId);
                            SendResponse(stream, 200, "application/json; charset=utf-8", Encoding.UTF8.GetBytes(statusJson));
                            return;
                        }

                        // API kiểm tra trạng thái bản quyền thiết bị
                        if (rawUrl.Equals("/api/license/status", StringComparison.OrdinalIgnoreCase))
                        {
                            string statusJson = string.Format(
                                "{{\"licensed\":true,\"machineCode\":\"{0}\",\"message\":\"Bản quyền sử dụng vĩnh viễn\"}}",
                                _machineCode
                            );
                            SendResponse(stream, 200, "application/json; charset=utf-8", Encoding.UTF8.GetBytes(statusJson));
                            return;
                        }

                        // API kích hoạt bản quyền trực tiếp từ trình duyệt (luôn trả về thành công)
                        if (rawUrl.Equals("/api/license/activate", StringComparison.OrdinalIgnoreCase) && method == "POST")
                        {
                            SendResponse(stream, 200, "application/json; charset=utf-8", Encoding.UTF8.GetBytes("{\"success\":true,\"message\":\"Bản quyền đã được kích hoạt vĩnh viễn!\"}"));
                            return;
                        }

                        if (rawUrl.Equals("/api/database", StringComparison.OrdinalIgnoreCase))
                        {

                            if (method == "GET")
                            {
                                // Return cached bytes if still valid
                                lock (_dbLock)
                                {
                                    DateTime dirLw = GetDataDirLastWrite();
                                    if (_dbCacheBytes != null &&
                                        (DateTime.UtcNow - _dbCacheTime) < _dbCacheTtl &&
                                        dirLw <= _dbCacheTime)
                                    {
                                        SendResponse(stream, 200, "application/json; charset=utf-8", _dbCacheBytes, clientSupportsGzip);
                                        return;
                                    }
                                }
                                string dbJson = GetFullDatabaseJson();
                                byte[] dbBytes = Encoding.UTF8.GetBytes(dbJson);
                                lock (_dbLock) { _dbCacheBytes = dbBytes; }
                                SendResponse(stream, 200, "application/json; charset=utf-8", dbBytes, clientSupportsGzip);
                            }
                            else if (method == "POST")
                            {
                                bool forceShrink = rawHeader.IndexOf("X-Force-Shrink: true", StringComparison.OrdinalIgnoreCase) >= 0;
                                bool forceVersion = rawHeader.IndexOf("X-Force-Version: true", StringComparison.OrdinalIgnoreCase) >= 0 || forceShrink;
                                string blockError;
                                long newVersion;
                                string newLastUpdated;
                                bool saved = SaveFullDatabase(body, forceShrink, forceVersion, out blockError, out newVersion, out newLastUpdated);
                                if (saved)
                                {
                                    string ok = string.Format("{{\"success\":true,\"version\":{0},\"lastUpdated\":\"{1}\",\"message\":\"Lưu dữ liệu máy chủ thành công (Phân vùng JSON tối ưu)\"}}", newVersion, newLastUpdated);
                                    SendResponse(stream, 200, "application/json; charset=utf-8", Encoding.UTF8.GetBytes(ok));
                                }
                                else if (!string.IsNullOrEmpty(blockError))
                                {
                                    // Bị guard chặn (data_shrink_blocked, version_conflict, missing_version): trả 409 để client biết tải lại; lỗi khác trả 500
                                    int statusCode = (blockError.Contains("data_shrink_blocked") || blockError.Contains("version_conflict") || blockError.Contains("missing_version") || blockError.Contains("GUARD")) ? 409 : 500;
                                    SendResponse(stream, statusCode, "application/json; charset=utf-8", Encoding.UTF8.GetBytes(blockError));
                                }
                                else
                                {
                                    SendResponse(stream, 400, "application/json; charset=utf-8", Encoding.UTF8.GetBytes("{\"success\":false,\"message\":\"Dữ liệu không hợp lệ\"}"));
                                }
                            }
                            return;
                        }

                        if (rawUrl == "/" || rawUrl.Equals("/index.html", StringComparison.OrdinalIgnoreCase))
                        {
                            rawUrl = "/index.html";
                        }
                        string cleanPath = rawUrl.TrimStart('/').Replace('/', Path.DirectorySeparatorChar);
                        string filePath = Path.Combine(_webRoot, cleanPath);

                        if (File.Exists(filePath))
                        {
                            string ext = Path.GetExtension(filePath).ToLower();
                            string mime = GetMimeType(ext);
                            byte[] fileBytes = File.ReadAllBytes(filePath);
                            SendResponse(stream, 200, mime, fileBytes, clientSupportsGzip);
                        }
                        else
                        {
                            byte[] notFound = Encoding.UTF8.GetBytes("File không tồn tại: " + rawUrl);
                            SendResponse(stream, 404, "text/plain; charset=utf-8", notFound);
                        }
                    }
                }
                catch { }
            }
        }

        private void SendResponse(NetworkStream stream, int statusCode, string contentType, byte[] bodyBytes, bool allowGzip = false)
        {
            string statusText = (statusCode == 200) ? "OK" : (statusCode == 404 ? "Not Found" : (statusCode == 400 ? "Bad Request" : "Error"));
            
            bool isGzipped = false;
            byte[] outputBytes = bodyBytes;

            // Nén GZip nếu client hỗ trợ, dữ liệu > 1KB và là định dạng văn bản/JSON/script
            if (allowGzip && bodyBytes != null && bodyBytes.Length > 1024 && IsCompressible(contentType))
            {
                try
                {
                    using (MemoryStream ms = new MemoryStream())
                    {
                        using (System.IO.Compression.GZipStream gzip = new System.IO.Compression.GZipStream(ms, System.IO.Compression.CompressionMode.Compress, true))
                        {
                            gzip.Write(bodyBytes, 0, bodyBytes.Length);
                        }
                        byte[] compressed = ms.ToArray();
                        if (compressed.Length < bodyBytes.Length)
                        {
                            outputBytes = compressed;
                            isGzipped = true;
                        }
                    }
                }
                catch { }
            }

            StringBuilder sb = new StringBuilder();
            sb.AppendFormat("HTTP/1.1 {0} {1}\r\n", statusCode, statusText);
            sb.AppendFormat("Content-Type: {0}\r\n", contentType);
            sb.AppendFormat("Content-Length: {0}\r\n", outputBytes.Length);
            if (isGzipped)
            {
                sb.Append("Content-Encoding: gzip\r\n");
            }
            sb.Append("Access-Control-Allow-Origin: *\r\n");
            sb.Append("Access-Control-Allow-Methods: GET, POST, OPTIONS\r\n");
            sb.Append("Access-Control-Allow-Headers: Content-Type\r\n");
            if (contentType.StartsWith("application/json") || contentType.Contains("text/html") || contentType.Contains("javascript") || contentType.Contains("text/css"))
            {
                sb.Append("Cache-Control: no-cache, no-store, must-revalidate\r\n");
            }
            else
            {
                sb.Append("Cache-Control: public, max-age=86400\r\n");
            }
            sb.Append("Connection: close\r\n");
            sb.Append("\r\n");

            byte[] headerBytes = Encoding.UTF8.GetBytes(sb.ToString());
            byte[] fullPacket = new byte[headerBytes.Length + outputBytes.Length];
            Buffer.BlockCopy(headerBytes, 0, fullPacket, 0, headerBytes.Length);
            if (outputBytes.Length > 0)
            {
                Buffer.BlockCopy(outputBytes, 0, fullPacket, headerBytes.Length, outputBytes.Length);
            }
            stream.Write(fullPacket, 0, fullPacket.Length);
            stream.Flush();
        }

        private bool IsCompressible(string contentType)
        {
            if (string.IsNullOrEmpty(contentType)) return false;
            string ct = contentType.ToLower();
            return ct.Contains("text/") || 
                   ct.Contains("application/json") || 
                   ct.Contains("application/javascript") || 
                   ct.Contains("application/x-javascript") || 
                   ct.Contains("image/svg+xml");
        }

        private string GetMimeType(string ext)
        {
            switch (ext)
            {
                case ".html": return "text/html; charset=utf-8";
                case ".css": return "text/css; charset=utf-8";
                case ".js": return "application/javascript; charset=utf-8";
                case ".json": return "application/json; charset=utf-8";
                case ".png": return "image/png";
                case ".jpg":
                case ".jpeg": return "image/jpeg";
                case ".svg": return "image/svg+xml";
                case ".ico": return "image/x-icon";
                case ".woff": return "font/woff";
                case ".woff2": return "font/woff2";
                default: return "application/octet-stream";
            }
        }

        private void InitDatabaseIfEmpty()
        {
            lock (_dbLock)
            {
                RecoverInterruptedTransactions();
                MigrateSingleDatabaseIfPresent();
                string medFile = Path.Combine(_dataDir, "medicines.json");
                if (!File.Exists(medFile) || new FileInfo(medFile).Length == 0)
                {
                    // 1. Kiểm tra và khôi phục từ .bak hoặc .tmp nếu có
                    string bakFile = medFile + ".bak";
                    string tmpFile = medFile + ".tmp";
                    if (File.Exists(bakFile) && new FileInfo(bakFile).Length > 10)
                    {
                        try { File.Copy(bakFile, medFile, true); return; } catch { }
                    }
                    if (File.Exists(tmpFile) && new FileInfo(tmpFile).Length > 10)
                    {
                        try { File.Copy(tmpFile, medFile, true); return; } catch { }
                    }

                    // 2. Kiểm tra và tự động khôi phục từ bản backup gần nhất trong data/backups
                    string backupDir = Path.Combine(_dataDir, "backups");
                    if (Directory.Exists(backupDir))
                    {
                        var backupFolders = new DirectoryInfo(backupDir).GetDirectories("backup_*");
                        if (backupFolders.Length > 0)
                        {
                            Array.Sort(backupFolders, (a, b) => b.CreationTime.CompareTo(a.CreationTime));
                            foreach (var bFolder in backupFolders)
                            {
                                string bMed = Path.Combine(bFolder.FullName, "medicines.json");
                                if (File.Exists(bMed) && new FileInfo(bMed).Length > 100)
                                {
                                    foreach (var f in bFolder.GetFiles("*.json"))
                                    {
                                        try { File.Copy(f.FullName, Path.Combine(_dataDir, f.Name), true); } catch { }
                                    }
                                    return;
                                }
                            }
                        }
                    }

                    // 3. Chỉ tạo mới nếu hoàn toàn là cài đặt lần đầu trên máy trắng
                    string initialJson = "{\"medicines\":[],\"orders\":[],\"stockInOrders\":[],\"suppliers\":[],\"customers\":[],\"vouchers\":[],\"settings\":{}}";
                    SaveFullDatabaseInternal(initialJson);
                }
            }
        }

        private void MigrateSingleDatabaseIfPresent()
        {
            string singleDb = Path.Combine(_dataDir, "database.json");
            string medFile = Path.Combine(_dataDir, "medicines.json");

            // Nếu đã có medicines.json thì hệ thống đã chuyển sang chế độ phân vùng modular
            if (File.Exists(medFile)) return;

            if (File.Exists(singleDb))
            {
                try
                {
                    string content = File.ReadAllText(singleDb, Encoding.UTF8);
                    if (!string.IsNullOrEmpty(content) && content.Trim().StartsWith("{"))
                    {
                        SaveFullDatabaseInternal(content);
                        // Đổi tên file đơn cũ thành .bak để an toàn tuyệt đối
                        string bak = singleDb + ".bak";
                        if (File.Exists(bak)) File.Delete(bak);
                        File.Move(singleDb, bak);
                    }
                }
                catch (Exception ex)
                {
                    try { File.AppendAllText(Path.Combine(_webRoot, "migrate_err.txt"), ex.ToString()); } catch { }
                }
            }
        }

        private void RecoverInterruptedTransactions()
        {
            try
            {
                if (!Directory.Exists(_dataDir)) return;

                string journalPath = Path.Combine(_dataDir, ".tx_journal");
                string[] txbakFiles = Directory.GetFiles(_dataDir, "*.txbak");
                string[] tmpFiles = Directory.GetFiles(_dataDir, "*.tmp");

                if (File.Exists(journalPath))
                {
                    string journalText = "";
                    try { journalText = File.ReadAllText(journalPath, Encoding.UTF8); } catch { }

                    if (journalText.Contains("\"status\":\"committed\""))
                    {
                        // Giao dịch trước đó đã thay thế thành công toàn bộ file đích trước khi mất điện.
                        // KHÔNG ĐƯỢC ROLLBACK vì các file đích đều là dữ liệu mới nhất đồng bộ.
                        AppendLimitedErrorLog("save_err.txt", "Khởi động: Giao dịch trước đó đã commit thành công trước khi tắt máy. Dọn dẹp file tạm...");
                        bool allCleaned = true;
                        foreach (string txbak in txbakFiles)
                        {
                            try { File.Delete(txbak); }
                            catch (Exception delEx)
                            {
                                allCleaned = false;
                                AppendLimitedErrorLog("save_err.txt", string.Format("Khởi động: Không thể xóa file backup dọn dẹp {0}: {1}", txbak, delEx.Message));
                            }
                        }
                        foreach (string tmp in tmpFiles)
                        {
                            try { File.Delete(tmp); }
                            catch (Exception tmpEx)
                            {
                                allCleaned = false;
                                AppendLimitedErrorLog("save_err.txt", string.Format("Khởi động: Không thể xóa file tạm {0}: {1}", tmp, tmpEx.Message));
                            }
                        }

                        // CHỈ XÓA JOURNAL KHI TẤT CẢ FILE .txbak VÀ .tmp ĐÃ ĐƯỢC DỌN DẸP SẠCH SẼ!
                        // Nếu còn file .txbak bị khóa, GIỮ NGUYÊN journal committed để lần khởi động sau không rollback nhầm dữ liệu mới!
                        if (allCleaned)
                        {
                            try { File.Delete(journalPath); } catch { }
                        }
                        else
                        {
                            AppendLimitedErrorLog("save_err.txt", "Cảnh báo an toàn: Vẫn còn file backup .txbak chưa xóa được, GIỮ LẠI .tx_journal trạng thái committed.");
                        }
                        return;
                    }

                    // Journal tồn tại nhưng không committed: Giao dịch bị ngắt quãng giữa chừng khi chưa hoàn tất.
                    // Đọc danh sách file để hoàn nguyên file cũ và xóa file mới tạo
                    try
                    {
                        var serializer = new JavaScriptSerializer();
                        var jData = serializer.Deserialize<Dictionary<string, object>>(journalText);
                        if (jData != null)
                        {
                            var preExisting = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                            if (jData.ContainsKey("preExisting") && jData["preExisting"] is ArrayList)
                            {
                                foreach (var p in (ArrayList)jData["preExisting"])
                                {
                                    if (p != null) preExisting.Add(p.ToString());
                                }
                            }

                            bool allFilesRestored = true;

                            // 1. Phục hồi các file đã tồn tại trước đó từ .txbak
                            foreach (string txbak in txbakFiles)
                            {
                                try
                                {
                                    string liveFile = txbak.Substring(0, txbak.Length - ".txbak".Length);
                                    File.Copy(txbak, liveFile, true);
                                    File.Delete(txbak);
                                    AppendLimitedErrorLog("save_err.txt", string.Format("Đã hoàn nguyên: {0} từ {1}", liveFile, txbak));
                                }
                                catch (Exception ex)
                                {
                                    allFilesRestored = false;
                                    AppendLimitedErrorLog("save_err.txt", string.Format("Lỗi hoàn nguyên file {0}: {1}", txbak, ex.Message));
                                }
                            }

                            // 2. Xóa các file mới tạo trong giao dịch dở dang (có trong targets nhưng không có trong preExisting)
                            if (jData.ContainsKey("targets") && jData["targets"] is ArrayList)
                            {
                                foreach (var t in (ArrayList)jData["targets"])
                                {
                                    if (t != null)
                                    {
                                        string tPath = t.ToString();
                                        if (!preExisting.Contains(tPath) && File.Exists(tPath))
                                        {
                                            try
                                            {
                                                File.Delete(tPath);
                                                AppendLimitedErrorLog("save_err.txt", string.Format("Đã xóa file mới tạo trong giao dịch dở dang: {0}", tPath));
                                            }
                                            catch (Exception delEx)
                                            {
                                                allFilesRestored = false;
                                                AppendLimitedErrorLog("save_err.txt", string.Format("Lỗi xóa file mới {0}: {1}", tPath, delEx.Message));
                                            }
                                        }
                                    }
                                }
                            }

                            // Dọn dẹp các file .tmp còn dang dở trong thư mục data
                            foreach (string tmp in tmpFiles) { try { File.Delete(tmp); } catch { } }

                            // CHỈ XÓA JOURNAL KHI TẤT CẢ FILE ĐÃ ĐƯỢC PHỤC HỒI / DỌN DẸP THÀNH CÔNG 100%!
                            if (allFilesRestored)
                            {
                                try { File.Delete(journalPath); } catch { }
                                _recoveryBlocked = false;
                            }
                            else
                            {
                                _recoveryBlocked = true;
                                AppendLimitedErrorLog("save_err.txt", "Cảnh báo an toàn: Phục hồi chưa hoàn tất 100%. GIỮ LẠI .tx_journal và các file .txbak; khóa ghi hệ thống đến khi phục hồi thành công.");
                            }
                            return;
                        }
                    }
                    catch (Exception jEx)
                    {
                        AppendLimitedErrorLog("save_err.txt", "Lỗi phân tích journal: " + jEx.Message);
                    }
                }

                // Nếu không có journal nhưng còn file .txbak mồ côi:
                if (txbakFiles.Length > 0)
                {
                    AppendLimitedErrorLog("save_err.txt", string.Format("Khởi động: Phát hiện {0} file .txbak mồ côi. Đang kiểm tra để xử lý an toàn...", txbakFiles.Length));
                    bool allOrphansHandled = true;
                    foreach (string txbak in txbakFiles)
                    {
                        try
                        {
                            string liveFile = txbak.Substring(0, txbak.Length - ".txbak".Length);
                            if (File.Exists(liveFile))
                            {
                                DateTime liveTime = File.GetLastWriteTimeUtc(liveFile);
                                DateTime bakTime = File.GetLastWriteTimeUtc(txbak);
                                // Nếu file sống mới hơn hoặc bằng file backup: đây là backup còn sót của giao dịch đã commit thành công!
                                // TUYỆT ĐỐI KHÔNG GHI ĐÈ LÊN FILE SỐNG! Chỉ xóa bỏ file .txbak mồ côi
                                if (liveTime >= bakTime)
                                {
                                    AppendLimitedErrorLog("save_err.txt", string.Format("Bỏ qua rollback file {0} vì file sống mới hơn hoặc bằng file backup. Đang xóa .txbak mồ côi...", liveFile));
                                    try { File.Delete(txbak); } catch { allOrphansHandled = false; }
                                    continue;
                                }
                            }

                            // Chỉ khôi phục khi file sống không tồn tại hoặc cũ hơn file backup dang dở
                            File.Copy(txbak, liveFile, true);
                            File.Delete(txbak);
                            AppendLimitedErrorLog("save_err.txt", string.Format("Đã hoàn nguyên: {0} từ {1}", liveFile, txbak));
                        }
                        catch (Exception ex)
                        {
                            allOrphansHandled = false;
                            AppendLimitedErrorLog("save_err.txt", string.Format("Lỗi xử lý file {0}: {1}", txbak, ex.Message));
                        }
                    }
                    if (!allOrphansHandled)
                    {
                        _recoveryBlocked = true;
                    }
                }

                // Dọn dẹp các file .tmp còn dang dở trong thư mục data
                foreach (string tmp in tmpFiles)
                {
                    try { File.Delete(tmp); } catch { }
                }
                try { if (File.Exists(journalPath)) File.Delete(journalPath); } catch { }

                // Kiểm tra lại trạng thái sau khi dọn dẹp: nếu không còn journal và không còn file .txbak thì giải phóng cờ khóa ghi (Item 7)
                string[] remainingTxbak = Directory.GetFiles(_dataDir, "*.txbak");
                if (!File.Exists(journalPath) && remainingTxbak.Length == 0)
                {
                    _recoveryBlocked = false;
                }
            }
            catch (Exception ex)
            {
                AppendLimitedErrorLog("save_err.txt", "Lỗi RecoverInterruptedTransactions: " + ex.Message);
            }
        }

        private string ReadRawJsonFile(string path, string defaultJson)
        {
            if (!File.Exists(path)) return defaultJson;
            try
            {
                string content = File.ReadAllText(path, Encoding.UTF8).Trim();
                return string.IsNullOrEmpty(content) ? defaultJson : content;
            }
            catch
            {
                return defaultJson;
            }
        }

        private string ReadPartitionedListRaw(string pattern)
        {
            try
            {
                string[] files = Directory.GetFiles(_dataDir, pattern);
                if (files.Length == 0) return "[]";
                if (files.Length == 1) return ReadRawJsonFile(files[0], "[]");

                var items = new List<string>();
                Array.Sort(files);
                foreach (string file in files)
                {
                    string content = ReadRawJsonFile(file, "[]").Trim();
                    if (content.StartsWith("[") && content.EndsWith("]"))
                    {
                        string inner = content.Substring(1, content.Length - 2).Trim();
                        if (!string.IsNullOrEmpty(inner)) items.Add(inner);
                    }
                }
                return "[" + string.Join(",", items.ToArray()) + "]";
            }
            catch
            {
                return "[]";
            }
        }

        private string GetFullDatabaseJson()
        {
            lock (_dbLock)
            {
                MigrateSingleDatabaseIfPresent();

                // Check if cache is still valid using data directory modification time
                DateTime dirLastWrite = GetDataDirLastWrite();
                if (_dbCache != null && (DateTime.UtcNow - _dbCacheTime) < _dbCacheTtl && dirLastWrite <= _dbCacheTime)
                {
                    return _dbCache;
                }

                string settingsJson = ReadRawJsonFile(Path.Combine(_dataDir, "settings.json"), "{}");
                string medicinesJson = ReadRawJsonFile(Path.Combine(_dataDir, "medicines.json"), "[]");
                string suppliersJson = ReadRawJsonFile(Path.Combine(_dataDir, "suppliers.json"), "[]");
                string customersJson = ReadRawJsonFile(Path.Combine(_dataDir, "customers.json"), "[]");
                string historyJson = ReadRawJsonFile(Path.Combine(_dataDir, "settings_history.json"), "[]");
                string auditLogJson = ReadRawJsonFile(Path.Combine(_dataDir, "audit_log.json"), "[]");

                string ordersJson = ReadPartitionedListRaw("orders_*.json");
                string stockinJson = ReadPartitionedListRaw("stockin_*.json");
                string vouchersJson = ReadPartitionedListRaw("vouchers_*.json");
                string returnsJson = ReadPartitionedListRaw("returns_*.json");

                var sb = new StringBuilder(medicinesJson.Length + 4096);
                sb.Append("{\"settings\":").Append(settingsJson)
                  .Append(",\"medicines\":").Append(medicinesJson)
                  .Append(",\"suppliers\":").Append(suppliersJson)
                  .Append(",\"customers\":").Append(customersJson)
                  .Append(",\"settingsHistory\":").Append(historyJson)
                  .Append(",\"auditLog\":").Append(auditLogJson)
                  .Append(",\"orders\":").Append(ordersJson)
                  .Append(",\"stockInOrders\":").Append(stockinJson)
                  .Append(",\"vouchers\":").Append(vouchersJson)
                  .Append(",\"purchaseReturns\":").Append(returnsJson)
                  .Append(",\"version\":").Append(_dbVersion)
                  .Append(",\"lastUpdated\":\"").Append(_dbLastUpdated).Append("\"")
                  .Append(",\"instanceId\":\"").Append(_serverInstanceId).Append("\"}");

                _dbCache = sb.ToString();
                _dbCacheTime = DateTime.UtcNow;
                return _dbCache;
            }
        }

        private DateTime GetDataDirLastWrite()
        {
            try
            {
                string[] watched = new[] { "medicines.json", "orders_2026.json", "stockin_2026.json",
                    "vouchers_2026.json", "returns_2026.json", "suppliers.json", "customers.json", "settings.json", "settings_history.json", "audit_log.json" };
                DateTime latest = DateTime.MinValue;
                foreach (string f in watched)
                {
                    string fp = Path.Combine(_dataDir, f);
                    if (File.Exists(fp))
                    {
                        DateTime lw = File.GetLastWriteTimeUtc(fp);
                        if (lw > latest) latest = lw;
                    }
                }
                return latest;
            }
            catch { return DateTime.UtcNow; }
        }

        private bool SaveFullDatabase(string body, bool forceShrink, bool forceVersion, out string blockError, out long newVersion, out string newLastUpdated)
        {
            blockError = null;
            newVersion = 0;
            newLastUpdated = null;
            if (string.IsNullOrEmpty(body) || !body.Trim().StartsWith("{")) return false;
            var serializer = new JavaScriptSerializer { MaxJsonLength = int.MaxValue };
            Dictionary<string, object> dict = null;
            try { dict = serializer.Deserialize<Dictionary<string, object>>(body); }
            catch { }
            if (dict == null) return false;

            lock (_dbLock)
            {
                if (_recoveryBlocked)
                {
                    RecoverInterruptedTransactions();
                    if (_recoveryBlocked)
                    {
                        blockError = "{\"success\":false,\"error\":\"recovery_in_progress\",\"message\":\"Hệ thống chưa hoàn tất khôi phục giao dịch dở dang sau sự cố. Tạm thời khóa ghi để bảo vệ dữ liệu.\"}";
                        AppendLimitedErrorLog("save_err.txt", "Chặn ghi: Phục hồi chưa hoàn tất, _recoveryBlocked = true");
                        return false;
                    }
                }

                // Kiểm tra phiên bản (Optimistic Concurrency Control) trong cùng khóa _dbLock
                if (!forceVersion && _dbVersion > 0)
                {
                    long clientVersion = -1;
                    if (dict.ContainsKey("baseVersion") && dict["baseVersion"] != null)
                    {
                        try { clientVersion = Convert.ToInt64(dict["baseVersion"]); } catch { }
                    }
                    else if (dict.ContainsKey("version") && dict["version"] != null)
                    {
                        try { clientVersion = Convert.ToInt64(dict["version"]); } catch { }
                    }

                    if (clientVersion <= 0)
                    {
                        blockError = "{\"success\":false,\"error\":\"missing_version\",\"message\":\"Yêu cầu ghi bị từ chối do thiếu phiên bản dữ liệu cơ sở (baseVersion). Hãy làm mới trang.\"}";
                        AppendLimitedErrorLog("save_err.txt", "Chặn ghi đè: Thiếu phiên bản cơ sở (missing_version)");
                        return false;
                    }

                    if (clientVersion != _dbVersion)
                    {
                        blockError = string.Format(
                            "{{\"success\":false,\"error\":\"version_conflict\",\"serverVersion\":{0},\"clientVersion\":{1},\"message\":\"Dữ liệu trên máy chủ đã được cập nhật bởi phiên khác (V{0} so với V{1}). Vui lòng tải lại dữ liệu mới.\"}}",
                            _dbVersion, clientVersion);
                        AppendLimitedErrorLog("save_err.txt", string.Format("Chặn ghi đè: Xung đột phiên bản V{0} (server) != V{1} (client)", _dbVersion, clientVersion));
                        return false;
                    }
                }

                if (!forceShrink)
                {
                    string guardError = CheckCountGuard(dict);
                    if (guardError != null)
                    {
                        blockError = guardError;
                        AppendLimitedErrorLog("save_err.txt", "GUARD chặn ghi đè: " + guardError);
                        return false;
                    }
                }
                bool ok = SaveFullDatabaseInternal(dict);
                if (!ok && string.IsNullOrEmpty(blockError))
                {
                    blockError = "{\"success\":false,\"error\":\"Lỗi ghi file cơ sở dữ liệu trên máy chủ\"}";
                }
                if (ok)
                {
                    _dbVersion++;
                    _dbLastUpdated = DateTime.UtcNow.ToString("yyyy-MM-ddTHH:mm:ss.fffZ");
                    _dbCache = null;
                    _dbCacheBytes = null;
                    newVersion = _dbVersion;
                    newLastUpdated = _dbLastUpdated;
                    UpdateKnownCountsFromDict(dict);
                }
                return ok;
            }
        }

        // ===== Guard chống ghi đè làm giảm dữ liệu =====
        private void EnsureKnownCounts()
        {
            lock (_dbLock)
            {
                if (_knownCountsLoaded) return;
                if (File.Exists(_countsFile))
                {
                    try
                    {
                        var serializer = new JavaScriptSerializer { MaxJsonLength = int.MaxValue };
                        var d = serializer.Deserialize<Dictionary<string, object>>(File.ReadAllText(_countsFile, Encoding.UTF8));
                        if (d != null)
                        {
                            _knownMedicines = ToLong(d, "medicines");
                            _knownOrders = ToLong(d, "orders");
                            _knownVouchers = ToLong(d, "vouchers");
                            _knownStockIns = ToLong(d, "stockIns");
                            _knownCustomers = ToLong(d, "customers");
                            if (d.ContainsKey("version"))
                            {
                                long savedVer = ToLong(d, "version");
                                if (savedVer >= _dbVersion) _dbVersion = savedVer + 1;
                            }
                            _knownCountsLoaded = true;
                            return;
                        }
                    }
                    catch { }
                }

                // File đếm chưa có: đếm trực tiếp từ dữ liệu hiện tại (chỉ chạy 1 lần)
                _knownMedicines = CountJsonArray(Path.Combine(_dataDir, "medicines.json"));
                _knownCustomers = CountJsonArray(Path.Combine(_dataDir, "customers.json"));
                _knownOrders = CountJsonArrayByPattern("orders_*.json");
                _knownVouchers = CountJsonArrayByPattern("vouchers_*.json");
                _knownStockIns = CountJsonArrayByPattern("stockin_*.json");
                _knownCountsLoaded = true;
                PersistKnownCounts();
            }
        }

        private static long ToLong(Dictionary<string, object> d, string key)
        {
            if (d == null || !d.ContainsKey(key) || d[key] == null) return 0;
            long v;
            if (long.TryParse(Convert.ToString(d[key]), out v)) return v;
            return 0;
        }

        private long CountJsonArray(string path)
        {
            try
            {
                if (!File.Exists(path)) return 0;
                var serializer = new JavaScriptSerializer { MaxJsonLength = int.MaxValue };
                var arr = serializer.Deserialize<ArrayList>(File.ReadAllText(path, Encoding.UTF8));
                return arr == null ? 0 : arr.Count;
            }
            catch { return 0; }
        }

        private long CountJsonArrayByPattern(string pattern)
        {
            long total = 0;
            try
            {
                foreach (string f in Directory.GetFiles(_dataDir, pattern))
                {
                    total += CountJsonArray(f);
                }
            }
            catch { }
            return total;
        }

        private void PersistKnownCounts()
        {
            try
            {
                string json = string.Format(
                    "{{\"version\":{0},\"medicines\":{1},\"orders\":{2},\"vouchers\":{3},\"stockIns\":{4},\"customers\":{5},\"updatedAt\":\"{6}\"}}",
                    _dbVersion, _knownMedicines, _knownOrders, _knownVouchers, _knownStockIns, _knownCustomers,
                    DateTime.Now.ToString("yyyy-MM-ddTHH:mm:ss"));
                WriteAtomicJson(_countsFile, json);
            }
            catch { }
        }

        // Trả về null nếu hợp lệ, ngược lại trả về JSON lỗi để client hiểu và tải lại
        private string CheckCountGuard(Dictionary<string, object> dict)
        {
            try
            {
                EnsureKnownCounts();
                if (dict == null) return null;

                long inMedicines = ReadArrayCount(dict, "medicines", -1);
                long inOrders = ReadArrayCount(dict, "orders", -1);
                long inVouchers = ReadArrayCount(dict, "vouchers", -1);
                long inStockIns = ReadArrayCount(dict, "stockInOrders", -1);
                long inCustomers = ReadArrayCount(dict, "customers", -1);

                string field = null;
                long known = 0, incoming = 0;

                // Chỉ kiểm tra các collection CÓ trong payload (payload thiếu key = không thay đổi)
                if (_knownMedicines > 0 && inMedicines >= 0 && IsAbnormalDrop(_knownMedicines, inMedicines)) { field = "medicines"; known = _knownMedicines; incoming = inMedicines; }
                else if (_knownOrders > 0 && inOrders >= 0 && IsAbnormalDrop(_knownOrders, inOrders)) { field = "orders"; known = _knownOrders; incoming = inOrders; }
                else if (_knownVouchers > 0 && inVouchers >= 0 && IsAbnormalDrop(_knownVouchers, inVouchers)) { field = "vouchers"; known = _knownVouchers; incoming = inVouchers; }
                else if (_knownStockIns > 0 && inStockIns >= 0 && IsAbnormalDrop(_knownStockIns, inStockIns)) { field = "stockIns"; known = _knownStockIns; incoming = inStockIns; }
                else if (_knownCustomers > 0 && inCustomers >= 0 && IsAbnormalDrop(_knownCustomers, inCustomers)) { field = "customers"; known = _knownCustomers; incoming = inCustomers; }

                if (field == null) return null;

                return string.Format(
                    "{{\"success\":false,\"error\":\"data_shrink_blocked\",\"field\":\"{0}\",\"known\":{1},\"incoming\":{2},\"message\":\"Máy chủ từ chối ghi đè vì số bản ghi {0} giảm bất thường ({1} → {2}). Hãy tải lại dữ liệu từ máy chủ.\"}}",
                    field, known, incoming);
            }
            catch (Exception ex)
            {
                AppendLimitedErrorLog("save_err.txt", "Lỗi CheckCountGuard: " + ex.Message);
                return null; // fail-open: không chặn khi bản thân guard lỗi
            }
        }

        private static long ReadArrayCount(Dictionary<string, object> dict, string key, long fallback)
        {
            if (dict == null || !dict.ContainsKey(key)) return fallback;
            var arr = dict[key] as ArrayList;
            return arr == null ? fallback : arr.Count;
        }

        // Giảm > 20% VÀ mất > 20 bản ghi mới coi là bất thường
        private static bool IsAbnormalDrop(long known, long incoming)
        {
            if (known <= 0) return false;
            if (incoming >= known) return false;
            long dropped = known - incoming;
            return dropped > 20 && incoming < (long)(known * 0.8);
        }

        private void UpdateKnownCountsFromDict(Dictionary<string, object> dict)
        {
            try
            {
                if (dict == null) return;

                long v;
                v = ReadArrayCount(dict, "medicines", -1); if (v >= 0) _knownMedicines = v;
                v = ReadArrayCount(dict, "orders", -1); if (v >= 0) _knownOrders = v;
                v = ReadArrayCount(dict, "vouchers", -1); if (v >= 0) _knownVouchers = v;
                v = ReadArrayCount(dict, "stockInOrders", -1); if (v >= 0) _knownStockIns = v;
                v = ReadArrayCount(dict, "customers", -1); if (v >= 0) _knownCustomers = v;
                _knownCountsLoaded = true;
                PersistKnownCounts();
            }
            catch { }
        }

        private bool SaveFullDatabaseInternal(string body)
        {
            try
            {
                var serializer = new JavaScriptSerializer { MaxJsonLength = int.MaxValue };
                return SaveFullDatabaseInternal(serializer.Deserialize<Dictionary<string, object>>(body));
            }
            catch { return false; }
        }

        private bool SaveFullDatabaseInternal(Dictionary<string, object> dict)
        {
            try
            {
                if (dict == null) return false;

                // Kiểm tra xem có file backup .txbak hoặc journal chưa dọn dẹp không (chặn ghi nếu chưa dọn dẹp an toàn)
                string[] pendingTxbak = Directory.GetFiles(_dataDir, "*.txbak");
                if (pendingTxbak.Length > 0 || File.Exists(Path.Combine(_dataDir, ".tx_journal")))
                {
                    RecoverInterruptedTransactions();
                    pendingTxbak = Directory.GetFiles(_dataDir, "*.txbak");
                    if (pendingTxbak.Length > 0)
                    {
                        AppendLimitedErrorLog("save_err.txt", "Chặn ghi: Thư mục dữ liệu đang còn file backup .txbak chưa dọn dẹp hoặc bị khóa!");
                        return false;
                    }
                }

                var serializer = new JavaScriptSerializer { MaxJsonLength = int.MaxValue };

                var filesToWrite = new Dictionary<string, string>();

                // 1. Danh mục & cài đặt thường trực
                if (dict.ContainsKey("settings") && dict["settings"] != null)
                {
                    filesToWrite[Path.Combine(_dataDir, "settings.json")] = serializer.Serialize(dict["settings"]);
                }

                if (dict.ContainsKey("medicines") && dict["medicines"] != null)
                {
                    filesToWrite[Path.Combine(_dataDir, "medicines.json")] = serializer.Serialize(dict["medicines"]);
                }

                if (dict.ContainsKey("suppliers") && dict["suppliers"] != null)
                {
                    filesToWrite[Path.Combine(_dataDir, "suppliers.json")] = serializer.Serialize(dict["suppliers"]);
                }

                if (dict.ContainsKey("customers") && dict["customers"] != null)
                {
                    filesToWrite[Path.Combine(_dataDir, "customers.json")] = serializer.Serialize(dict["customers"]);
                }

                if (dict.ContainsKey("settingsHistory") && dict["settingsHistory"] != null)
                {
                    filesToWrite[Path.Combine(_dataDir, "settings_history.json")] = serializer.Serialize(dict["settingsHistory"]);
                }

                if (dict.ContainsKey("auditLog") && dict["auditLog"] != null)
                {
                    filesToWrite[Path.Combine(_dataDir, "audit_log.json")] = serializer.Serialize(dict["auditLog"]);
                }

                string curYear = DateTime.Now.Year.ToString();

                // 2. Phân vùng Đơn bán hàng (Orders) theo từng năm
                if (dict.ContainsKey("orders") && dict["orders"] is ArrayList)
                {
                    var list = (ArrayList)dict["orders"];
                    var byYear = new Dictionary<string, List<object>>();

                    foreach (var item in list)
                    {
                        string y = curYear;
                        if (item is Dictionary<string, object>)
                        {
                            var d = (Dictionary<string, object>)item;
                            if (d.ContainsKey("createdAt")) y = ExtractYear(d["createdAt"], curYear);
                            else if (d.ContainsKey("date")) y = ExtractYear(d["date"], curYear);
                        }
                        if (!byYear.ContainsKey(y)) byYear[y] = new List<object>();
                        byYear[y].Add(item);
                    }

                    if (byYear.Count == 0) byYear[curYear] = new List<object>();

                    foreach (var kvp in byYear)
                    {
                        string fPath = Path.Combine(_dataDir, string.Format("orders_{0}.json", kvp.Key));
                        filesToWrite[fPath] = serializer.Serialize(kvp.Value);
                    }
                }

                // 3. Phân vùng Phiếu nhập kho (Stock-in) theo từng năm
                if (dict.ContainsKey("stockInOrders") && dict["stockInOrders"] is ArrayList)
                {
                    var list = (ArrayList)dict["stockInOrders"];
                    var byYear = new Dictionary<string, List<object>>();

                    foreach (var item in list)
                    {
                        string y = curYear;
                        if (item is Dictionary<string, object>)
                        {
                            var d = (Dictionary<string, object>)item;
                            if (d.ContainsKey("createdAt")) y = ExtractYear(d["createdAt"], curYear);
                            else if (d.ContainsKey("date")) y = ExtractYear(d["date"], curYear);
                        }
                        if (!byYear.ContainsKey(y)) byYear[y] = new List<object>();
                        byYear[y].Add(item);
                    }

                    if (byYear.Count == 0) byYear[curYear] = new List<object>();

                    foreach (var kvp in byYear)
                    {
                        string fPath = Path.Combine(_dataDir, string.Format("stockin_{0}.json", kvp.Key));
                        filesToWrite[fPath] = serializer.Serialize(kvp.Value);
                    }
                }

                // 4. Phân vùng Sổ quỹ thu chi (Vouchers) theo từng năm
                if (dict.ContainsKey("vouchers") && dict["vouchers"] is ArrayList)
                {
                    var list = (ArrayList)dict["vouchers"];
                    var byYear = new Dictionary<string, List<object>>();

                    foreach (var item in list)
                    {
                        string y = curYear;
                        if (item is Dictionary<string, object>)
                        {
                            var d = (Dictionary<string, object>)item;
                            if (d.ContainsKey("createdAt")) y = ExtractYear(d["createdAt"], curYear);
                            else if (d.ContainsKey("date")) y = ExtractYear(d["date"], curYear);
                        }
                        if (!byYear.ContainsKey(y)) byYear[y] = new List<object>();
                        byYear[y].Add(item);
                    }

                    if (byYear.Count == 0) byYear[curYear] = new List<object>();

                    foreach (var kvp in byYear)
                    {
                        string fPath = Path.Combine(_dataDir, string.Format("vouchers_{0}.json", kvp.Key));
                        filesToWrite[fPath] = serializer.Serialize(kvp.Value);
                    }
                }

                // 5. Phân vùng Phiếu trả hàng tổng hợp (Returns) theo từng năm
                if (dict.ContainsKey("purchaseReturns") && dict["purchaseReturns"] is ArrayList)
                {
                    var list = (ArrayList)dict["purchaseReturns"];
                    var byYear = new Dictionary<string, List<object>>();

                    foreach (var item in list)
                    {
                        string y = curYear;
                        if (item is Dictionary<string, object>)
                        {
                            var d = (Dictionary<string, object>)item;
                            if (d.ContainsKey("createdAt")) y = ExtractYear(d["createdAt"], curYear);
                            else if (d.ContainsKey("date")) y = ExtractYear(d["date"], curYear);
                        }
                        if (!byYear.ContainsKey(y)) byYear[y] = new List<object>();
                        byYear[y].Add(item);
                    }

                    if (byYear.Count == 0) byYear[curYear] = new List<object>();

                    foreach (var kvp in byYear)
                    {
                        string fPath = Path.Combine(_dataDir, string.Format("returns_{0}.json", kvp.Key));
                        filesToWrite[fPath] = serializer.Serialize(kvp.Value);
                    }
                }

                return CommitAllFilesTransactionally(filesToWrite);
            }
            catch (Exception ex)
            {
                AppendLimitedErrorLog("save_err.txt", string.Format("Lỗi SaveFullDatabaseInternal: {0}\r\nStack: {1}", ex.Message, ex.StackTrace));
                return false;
            }
        }

        private bool CommitAllFilesTransactionally(Dictionary<string, string> filesToWrite)
        {
            if (filesToWrite == null || filesToWrite.Count == 0) return true;

            var stagedTmpFiles = new List<string>();
            var backupsCreated = new Dictionary<string, string>(); // livePath -> rollbackPath
            var preExistingFiles = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            var newlyCreatedFiles = new List<string>();
            string journalPath = Path.Combine(_dataDir, ".tx_journal");

            try
            {
                // Phase 1: Ghi toàn bộ nội dung ra file tạm .tmp và kiểm tra tính toàn vẹn
                foreach (var kvp in filesToWrite)
                {
                    string targetPath = kvp.Key;
                    string content = kvp.Value;
                    string tmpPath = targetPath + ".tmp";

                    File.WriteAllText(tmpPath, content, Encoding.UTF8);
                    var fi = new FileInfo(tmpPath);
                    if (!fi.Exists || fi.Length == 0)
                    {
                        throw new IOException("Ghi file tạm thất bại hoặc 0 byte: " + tmpPath);
                    }
                    stagedTmpFiles.Add(tmpPath);
                }

                // Phase 2: Xác định file nào đã tồn tại, file nào là mới, và tạo bản sao rollback .txbak cho các file đã tồn tại
                foreach (var kvp in filesToWrite)
                {
                    string targetPath = kvp.Key;
                    if (File.Exists(targetPath))
                    {
                        preExistingFiles.Add(targetPath);
                        string rollbackPath = targetPath + ".txbak";
                        File.Copy(targetPath, rollbackPath, true);
                        backupsCreated[targetPath] = rollbackPath;
                    }
                }

                // Ghi nhật ký bắt đầu thay thế file sống (BẮT BUỘC: nếu ghi journal lỗi thì abort ngay trước khi đụng file sống)
                var journalObj = new Dictionary<string, object>
                {
                    { "status", "in_progress" },
                    { "time", DateTime.UtcNow.ToString("o") },
                    { "targets", new List<string>(filesToWrite.Keys) },
                    { "preExisting", new List<string>(preExistingFiles) }
                };
                string journalJson = new JavaScriptSerializer().Serialize(journalObj);
                File.WriteAllText(journalPath, journalJson, Encoding.UTF8);

                // Phase 3: Commit tất cả file tạm sang file sống
                foreach (var kvp in filesToWrite)
                {
                    string targetPath = kvp.Key;
                    string tmpPath = targetPath + ".tmp";

                    bool copyOk = false;
                    for (int retry = 0; retry < 10; retry++)
                    {
                        try
                        {
                            File.Copy(tmpPath, targetPath, true);
                            copyOk = true;
                            break;
                        }
                        catch (IOException)
                        {
                            Thread.Sleep(50 * (retry + 1));
                        }
                    }

                    if (!copyOk)
                    {
                        if (File.Exists(targetPath) && File.Exists(tmpPath))
                        {
                            try
                            {
                                File.Replace(tmpPath, targetPath, null, true);
                                copyOk = true;
                            }
                            catch { }
                        }
                    }

                    if (!copyOk)
                    {
                        throw new IOException("Không thể ghi đè file đích sau 10 lần thử: " + targetPath);
                    }

                    try { File.SetLastWriteTimeUtc(targetPath, DateTime.UtcNow); } catch { }

                    if (!preExistingFiles.Contains(targetPath))
                    {
                        newlyCreatedFiles.Add(targetPath);
                    }
                }

                // Toàn bộ file đích đã được cập nhật thành công! Đánh dấu committed trong journal
                File.WriteAllText(journalPath, "{\"status\":\"committed\",\"time\":\"" + DateTime.UtcNow.ToString("o") + "\"}", Encoding.UTF8);

                // Phase 4: CHỈ CẬP NHẬT .bak KHI TOÀN BỘ GIAO DỊCH ĐÃ HOÀN TẤT THÀNH CÔNG!
                // Đồng thời dọn dẹp các file tạm .tmp và .txbak
                foreach (var kvp in filesToWrite)
                {
                    string targetPath = kvp.Key;
                    string bakPath = targetPath + ".bak";
                    try { File.Copy(targetPath, bakPath, true); } catch { }
                }

                foreach (var tmp in stagedTmpFiles)
                {
                    try { if (File.Exists(tmp)) File.Delete(tmp); } catch { }
                }
                bool allBackupsDeleted = true;
                foreach (var kvp in backupsCreated)
                {
                    try
                    {
                        if (File.Exists(kvp.Value)) File.Delete(kvp.Value);
                    }
                    catch (Exception delEx)
                    {
                        allBackupsDeleted = false;
                        AppendLimitedErrorLog("save_err.txt", string.Format("Không thể dọn file backup {0}: {1}", kvp.Value, delEx.Message));
                    }
                }

                // CHỈ XÓA JOURNAL KHI TẤT CẢ FILE .txbak ĐÃ ĐƯỢC XÓA SẠCH!
                // Nếu còn file .txbak chưa xóa được, GIỮ LẠI journal committed để khi khởi động lại, server biết giao dịch này ĐÃ COMMIT THÀNH CÔNG và không rollback nhầm!
                if (allBackupsDeleted)
                {
                    try { if (File.Exists(journalPath)) File.Delete(journalPath); } catch { }
                }
                else
                {
                    AppendLimitedErrorLog("save_err.txt", "Cảnh báo: Còn file backup .txbak chưa xóa được, GIỮ LẠI .tx_journal trạng thái committed.");
                }

                return true;
            }
            catch (Exception ex)
            {
                AppendLimitedErrorLog("save_err.txt", string.Format("Lỗi CommitAllFilesTransactionally, bắt đầu rollback: {0}", ex.Message));

                // 1. Khôi phục lại các file sống từ bản sao rollback .txbak
                var successfullyRestored = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                foreach (var kvp in backupsCreated)
                {
                    string targetPath = kvp.Key;
                    string rollbackPath = kvp.Value;
                    try
                    {
                        if (File.Exists(rollbackPath))
                        {
                            File.Copy(rollbackPath, targetPath, true);
                            successfullyRestored.Add(rollbackPath);
                        }
                    }
                    catch (Exception rbEx)
                    {
                        AppendLimitedErrorLog("save_err.txt", string.Format("Lỗi rollback file {0}: {1}", targetPath, rbEx.Message));
                    }
                }

                // 2. Xóa các file mới được tạo ở Phase 3 (vì trước đó chúng không hề tồn tại)
                foreach (var newFile in newlyCreatedFiles)
                {
                    try
                    {
                        if (File.Exists(newFile)) File.Delete(newFile);
                    }
                    catch (Exception delEx)
                    {
                        AppendLimitedErrorLog("save_err.txt", string.Format("Lỗi xóa file mới khi rollback {0}: {1}", newFile, delEx.Message));
                    }
                }

                // 3. Dọn dẹp file tạm
                foreach (var tmp in stagedTmpFiles)
                {
                    try { if (File.Exists(tmp)) File.Delete(tmp); } catch { }
                }

                // CHỈ XÓA .txbak NẾU ĐÃ KHÔI PHỤC THÀNH CÔNG! Nếu khôi phục thất bại, giữ nguyên .txbak làm cứu cánh dữ liệu
                foreach (var rollbackPath in successfullyRestored)
                {
                    try { if (File.Exists(rollbackPath)) File.Delete(rollbackPath); } catch { }
                }

                if (successfullyRestored.Count == backupsCreated.Count)
                {
                    try { if (File.Exists(journalPath)) File.Delete(journalPath); } catch { }
                }
                else
                {
                    AppendLimitedErrorLog("save_err.txt", "Cảnh báo an toàn: Rollback không hoàn tất 100%, GIỮ LẠI .tx_journal để khôi phục khi khởi động lại.");
                }

                return false;
            }
        }

        private void AppendLimitedErrorLog(string filename, string text)
        {
            try
            {
                string logPath = Path.Combine(_webRoot, filename);
                if (File.Exists(logPath))
                {
                    FileInfo fi = new FileInfo(logPath);
                    if (fi.Length > 2 * 1024 * 1024) // Giới hạn 2 MB
                    {
                        string oldPath = logPath + ".old";
                        try { if (File.Exists(oldPath)) File.Delete(oldPath); } catch { }
                        try { File.Move(logPath, oldPath); } catch { }
                    }
                }
                string msg = string.Format("[{0}] {1}\r\n", DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss"), text);
                File.AppendAllText(logPath, msg, Encoding.UTF8);
            }
            catch { }
        }

        private void RotateLogFile(string logPath)
        {
            try
            {
                if (File.Exists(logPath))
                {
                    FileInfo fi = new FileInfo(logPath);
                    if (fi.Length > 2 * 1024 * 1024) // Giới hạn 2 MB
                    {
                        string oldLog = logPath + ".old";
                        try { if (File.Exists(oldLog)) File.Delete(oldLog); } catch { }
                        try { File.Move(logPath, oldLog); } catch { }
                    }
                }
            }
            catch { }
        }

        private bool WriteAtomicJson(string path, string json)
        {
            if (string.IsNullOrEmpty(path) || string.IsNullOrEmpty(json)) return false;

            string temp = path + ".tmp";
            string backup = path + ".bak";
            try
            {
                // Bước 1: Ghi ra file .tmp trước
                File.WriteAllText(temp, json, Encoding.UTF8);

                FileInfo fiTemp = new FileInfo(temp);
                if (!fiTemp.Exists || fiTemp.Length == 0) return false;

                // Bước 2: Tạo/Cập nhật file .bak từ file hiện tại (giữ .bak làm lớp dự phòng vĩnh viễn)
                if (File.Exists(path))
                {
                    try { File.Copy(path, backup, true); } catch { }
                }

                // Bước 3: Ghi đè an toàn nguyên tử - TUYỆT ĐỐI KHÔNG GỌI File.Delete(path) TRƯỚC!
                for (int retry = 0; retry < 10; retry++)
                {
                    try
                    {
                        File.Copy(temp, path, true);
                        try { File.Delete(temp); } catch { }
                        return true;
                    }
                    catch (IOException)
                    {
                        Thread.Sleep(50 * (retry + 1));
                    }
                }

                // Nếu vẫn bị lock sau 10 lần, thử dùng File.Replace nếu cả hai file đều tồn tại
                if (File.Exists(path) && File.Exists(temp))
                {
                    try
                    {
                        File.Replace(temp, path, backup, true);
                        return true;
                    }
                    catch { }
                }

                AppendLimitedErrorLog("save_err.txt", string.Format("Lỗi WriteAtomicJson không thể ghi đè sau 10 lần retry: {0}", path));
                return false;
            }
            catch (Exception ex)
            {
                // Nếu file chính bị 0 bytes hoặc biến mất do sự cố, khôi phục ngay từ backup .bak
                try
                {
                    if ((!File.Exists(path) || new FileInfo(path).Length == 0) && File.Exists(backup))
                    {
                        File.Copy(backup, path, true);
                    }
                }
                catch { }

                AppendLimitedErrorLog("save_err.txt", string.Format("Lỗi WriteAtomicJson ({0}): {1}", path, ex.Message));
                return false;
            }
        }

        private void StartAutoBackupEngine()
        {
            try
            {
                // Khởi động backup tự động: lần đầu sau 1 phút, sau đó lặp lại mỗi 4 giờ
                _autoBackupTimer = new System.Threading.Timer((state) => {
                    RunAutoBackup();
                }, null, TimeSpan.FromMinutes(1), TimeSpan.FromHours(4));
            }
            catch { }
        }

        private void RunAutoBackup()
        {
            lock (_dbLock)
            {
                try
                {
                    string backupDir = Path.Combine(_dataDir, "backups");
                    if (!Directory.Exists(backupDir)) Directory.CreateDirectory(backupDir);

                    string medFile = Path.Combine(_dataDir, "medicines.json");
                    if (!File.Exists(medFile)) return;

                    string timestamp = DateTime.Now.ToString("yyyyMMdd_HHmmss");
                    string snapshotFolder = Path.Combine(backupDir, "backup_auto_" + timestamp);
                    Directory.CreateDirectory(snapshotFolder);

                    string[] jsonFiles = Directory.GetFiles(_dataDir, "*.json");
                    foreach (string f in jsonFiles)
                    {
                        try
                        {
                            File.Copy(f, Path.Combine(snapshotFolder, Path.GetFileName(f)), true);
                        }
                        catch { }
                    }

                    // Tự động duy trì tối đa 20 bản backup gần nhất, xóa bớt bản cũ hơn
                    var backupFolders = new DirectoryInfo(backupDir).GetDirectories("backup_*");
                    if (backupFolders.Length > 20)
                    {
                        Array.Sort(backupFolders, (a, b) => a.CreationTime.CompareTo(b.CreationTime));
                        for (int i = 0; i < backupFolders.Length - 20; i++)
                        {
                            try { backupFolders[i].Delete(true); } catch { }
                        }
                    }
                }
                catch (Exception ex)
                {
                    try {
                        File.AppendAllText(Path.Combine(_webRoot, "save_err.txt"), 
                            string.Format("[{0}] AutoBackup error: {1}\r\n", DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss"), ex.Message));
                    } catch { }
                }
            }
        }

        private object ReadJsonFile(string path, object defaultVal)
        {
            if (!File.Exists(path)) return defaultVal;
            try
            {
                string content = File.ReadAllText(path, Encoding.UTF8);
                if (string.IsNullOrEmpty(content)) return defaultVal;
                var serializer = new JavaScriptSerializer { MaxJsonLength = int.MaxValue };
                return serializer.Deserialize<object>(content) ?? defaultVal;
            }
            catch
            {
                return defaultVal;
            }
        }

        private List<object> ReadPartitionedList(string pattern)
        {
            var allItems = new List<object>();
            var serializer = new JavaScriptSerializer { MaxJsonLength = int.MaxValue };
            try
            {
                string[] files = Directory.GetFiles(_dataDir, pattern);
                Array.Sort(files);
                foreach (string file in files)
                {
                    try
                    {
                        string content = File.ReadAllText(file, Encoding.UTF8);
                        if (!string.IsNullOrEmpty(content))
                        {
                            var list = serializer.Deserialize<ArrayList>(content);
                            if (list != null)
                            {
                                foreach (var item in list) allItems.Add(item);
                            }
                        }
                    }
                    catch { }
                }
            }
            catch { }
            return allItems;
        }

        private string ExtractYear(object dateVal, string defaultYear)
        {
            if (dateVal == null) return defaultYear;
            string s = dateVal.ToString().Trim();
            if (s.Length >= 4)
            {
                string y = s.Substring(0, 4);
                int yInt;
                if (int.TryParse(y, out yInt) && yInt >= 2000 && yInt <= 2100)
                {
                    return y;
                }
            }
            return defaultYear;
        }

        private List<string> GetLocalIPv4Addresses()
        {
            List<string> ips = new List<string>();
            try
            {
                foreach (NetworkInterface ni in NetworkInterface.GetAllNetworkInterfaces())
                {
                    if (ni.OperationalStatus == OperationalStatus.Up &&
                        ni.NetworkInterfaceType != NetworkInterfaceType.Loopback)
                    {
                        foreach (UnicastIPAddressInformation ip in ni.GetIPProperties().UnicastAddresses)
                        {
                            if (ip.Address.AddressFamily == AddressFamily.InterNetwork &&
                                !ip.Address.ToString().StartsWith("169.254"))
                            {
                                ips.Add(ip.Address.ToString());
                            }
                        }
                    }
                }
            }
            catch { }
            return ips;
        }

        private void ExitServer()
        {
            _isRunning = false;
            StopNgrokTunnel();
            try { if (_tcpListener != null) _tcpListener.Stop(); } catch { }
            if (_trayIcon != null)
            {
                _trayIcon.Visible = false;
                _trayIcon.Dispose();
            }
            Application.Exit();
        }
    }
}
