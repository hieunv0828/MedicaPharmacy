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
            try { File.AppendAllText("f:\\MedicaPharmacy\\server_trace.log", DateTime.Now + " - Main started: otherCount check...\r\n"); } catch { }
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
            try { File.AppendAllText("f:\\MedicaPharmacy\\server_trace.log", DateTime.Now + " - otherCount=" + otherCount + "\r\n"); } catch { }
            if (otherCount > 0)
            {
                try { File.AppendAllText("f:\\MedicaPharmacy\\server_trace.log", DateTime.Now + " - Exiting because otherCount > 0\r\n"); } catch { }
                // Đã có máy chủ chạy rồi -> chỉ cần mở trình duyệt tới web
                OpenBrowser("http://medica.com");
                return;
            }

            try
            {
                try { File.AppendAllText("f:\\MedicaPharmacy\\server_trace.log", DateTime.Now + " - Starting Application.Run...\r\n"); } catch { }
                Application.EnableVisualStyles();
                Application.SetCompatibleTextRenderingDefault(false);
                Application.Run(new MedicaTrayApplicationContext(args));
                try { File.AppendAllText("f:\\MedicaPharmacy\\server_trace.log", DateTime.Now + " - Application.Run EXITED NORMALLY\r\n"); } catch { }
            }
            catch (Exception ex)
            {
                try { File.AppendAllText("f:\\MedicaPharmacy\\server_trace.log", DateTime.Now + " - Application.Run EXCEPTION: " + ex + "\r\n"); } catch { }
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
        private bool _isLicensed = false;
        private string _machineCode = "";

        // In-memory database cache (string + encoded bytes)
        private string _dbCache = null;
        private byte[] _dbCacheBytes = null;
        private DateTime _dbCacheTime = DateTime.MinValue;
        private static readonly TimeSpan _dbCacheTtl = TimeSpan.FromSeconds(2);

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
            StartServer();
            StartNgrokTunnel();
            try { InitTrayIcon(); } catch { }

            string openUrl = (_activePort == 80) ? "http://medica.com" : ("http://localhost:" + _activePort);
            try { File.AppendAllText("f:\\MedicaPharmacy\\server_trace.log", DateTime.Now + " - MedicaTrayApplicationContext ctor finished, activePort=" + _activePort + "\r\n"); } catch { }
            Program.OpenBrowser(openUrl);
        }

        private void CheckLicenseStatus()
        {
            lock (_dbLock)
            {
                string keyFile = Path.Combine(_dataDir, "license.key");
                if (File.Exists(keyFile))
                {
                    try
                    {
                        string key = File.ReadAllText(keyFile, Encoding.UTF8).Trim();
                        _isLicensed = LicenseManager.ValidateLicenseKey(_machineCode, key);
                    }
                    catch { _isLicensed = false; }
                }
                else
                {
                    _isLicensed = false;
                }
            }
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
                        }
                    }
                    catch { }

                    Thread.Sleep(5000);
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
                // Nếu 80 bị chiếm, dùng 8080
                started = TryBindPort(8080);
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
                _tcpListener.Server.SetSocketOption(SocketOptionLevel.Socket, SocketOptionName.ReuseAddress, true);
                _tcpListener.ExclusiveAddressUse = false;
                _tcpListener.Start();
                _activePort = port;

                ThreadPool.QueueUserWorkItem(ListenLoop);
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
            string openLabel = _isLicensed ? "🌐 Mở Phần Mềm (http://medica.com)" : "🔒 Kích Hoạt Bản Quyền (http://medica.com)";
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
                    client.ReceiveTimeout = 10000;
                    client.SendTimeout = 10000;

                    using (NetworkStream stream = client.GetStream())
                    {
                        byte[] buffer = new byte[8192];
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
                                int read = stream.Read(buffer, 0, Math.Min(buffer.Length, contentLength - (int)ms.Length));
                                if (read <= 0) break;
                                ms.Write(buffer, 0, read);
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
                            string json = string.Format(
                                "{{\"status\":\"online\",\"app\":\"MedicaPharmacy\",\"port\":{0},\"domain\":\"medica.com\",\"ips\":[{1}],\"time\":\"{2}\",\"licensed\":{3},\"machineCode\":\"{4}\",\"ngrokEnabled\":{5}}}",
                                _activePort,
                                ipsJson,
                                DateTime.Now.ToString("yyyy-MM-ddTHH:mm:ss"),
                                _isLicensed ? "true" : "false",
                                _machineCode,
                                _enableNgrok ? "true" : "false"
                            );
                            SendResponse(stream, 200, "application/json; charset=utf-8", Encoding.UTF8.GetBytes(json));
                            return;
                        }

                        // API kiểm tra trạng thái bản quyền thiết bị
                        if (rawUrl.Equals("/api/license/status", StringComparison.OrdinalIgnoreCase))
                        {
                            CheckLicenseStatus();
                            string statusJson = string.Format(
                                "{{\"licensed\":{0},\"machineCode\":\"{1}\",\"message\":\"{2}\"}}",
                                _isLicensed ? "true" : "false",
                                _machineCode,
                                _isLicensed ? "Bản quyền hợp lệ cho thiết bị này" : "Chưa kích hoạt bản quyền thiết bị"
                            );
                            SendResponse(stream, 200, "application/json; charset=utf-8", Encoding.UTF8.GetBytes(statusJson));
                            return;
                        }

                        // API kích hoạt bản quyền trực tiếp từ trình duyệt
                        if (rawUrl.Equals("/api/license/activate", StringComparison.OrdinalIgnoreCase) && method == "POST")
                        {
                            string inputKey = "";
                            try
                            {
                                var serializer = new JavaScriptSerializer();
                                var dict = serializer.Deserialize<Dictionary<string, object>>(body);
                                if (dict != null && dict.ContainsKey("key") && dict["key"] != null)
                                {
                                    inputKey = dict["key"].ToString().Trim();
                                }
                            }
                            catch { }

                            if (!string.IsNullOrEmpty(inputKey) && LicenseManager.ValidateLicenseKey(_machineCode, inputKey))
                            {
                                lock (_dbLock)
                                {
                                    File.WriteAllText(Path.Combine(_dataDir, "license.key"), inputKey, Encoding.UTF8);
                                    _isLicensed = true;
                                }
                                SendResponse(stream, 200, "application/json; charset=utf-8", Encoding.UTF8.GetBytes("{\"success\":true,\"message\":\"Kích hoạt bản quyền thành công!\"}"));
                            }
                            else
                            {
                                SendResponse(stream, 400, "application/json; charset=utf-8", Encoding.UTF8.GetBytes("{\"success\":false,\"message\":\"Mã kích hoạt không hợp lệ với máy tính này!\"}"));
                            }
                            return;
                        }

                        if (rawUrl.Equals("/api/database", StringComparison.OrdinalIgnoreCase))
                        {
                            CheckLicenseStatus();
                            if (!_isLicensed)
                            {
                                string forbid = string.Format("{{\"error\":\"license_required\",\"machineCode\":\"{0}\",\"message\":\"Phần mềm chưa kích hoạt bản quyền trên máy tính này!\"}}", _machineCode);
                                SendResponse(stream, 403, "application/json; charset=utf-8", Encoding.UTF8.GetBytes(forbid));
                                return;
                            }

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
                                bool saved = SaveFullDatabase(body);
                                if (saved)
                                {
                                    // Invalidate cache on save
                                    _dbCache = null;
                                    _dbCacheBytes = null;
                                    string ok = "{\"success\":true,\"message\":\"Lưu dữ liệu máy chủ thành công (Phân vùng JSON tối ưu)\"}";
                                    SendResponse(stream, 200, "application/json; charset=utf-8", Encoding.UTF8.GetBytes(ok));
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
                            CheckLicenseStatus();
                            if (!_isLicensed)
                            {
                                rawUrl = "/license-activation.html";
                            }
                            else
                            {
                                rawUrl = "/index.html";
                            }
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
                MigrateSingleDatabaseIfPresent();
                string medFile = Path.Combine(_dataDir, "medicines.json");
                if (!File.Exists(medFile))
                {
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

                string lastUpdated = DateTime.UtcNow.ToString("yyyy-MM-ddTHH:mm:ss.fffZ");

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
                  .Append(",\"lastUpdated\":\"").Append(lastUpdated).Append("\"}");

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

        private bool SaveFullDatabase(string body)
        {
            if (string.IsNullOrEmpty(body) || !body.Trim().StartsWith("{")) return false;
            lock (_dbLock)
            {
                return SaveFullDatabaseInternal(body);
            }
        }

        private bool SaveFullDatabaseInternal(string body)
        {
            try
            {
                var serializer = new JavaScriptSerializer { MaxJsonLength = int.MaxValue };
                Dictionary<string, object> dict = serializer.Deserialize<Dictionary<string, object>>(body);
                if (dict == null) return false;

                // 1. Danh mục & cài đặt thường trực
                if (dict.ContainsKey("settings") && dict["settings"] != null)
                {
                    WriteAtomicJson(Path.Combine(_dataDir, "settings.json"), serializer.Serialize(dict["settings"]));
                }

                if (dict.ContainsKey("medicines") && dict["medicines"] != null)
                {
                    WriteAtomicJson(Path.Combine(_dataDir, "medicines.json"), serializer.Serialize(dict["medicines"]));
                }

                if (dict.ContainsKey("suppliers") && dict["suppliers"] != null)
                {
                    WriteAtomicJson(Path.Combine(_dataDir, "suppliers.json"), serializer.Serialize(dict["suppliers"]));
                }

                if (dict.ContainsKey("customers") && dict["customers"] != null)
                {
                    WriteAtomicJson(Path.Combine(_dataDir, "customers.json"), serializer.Serialize(dict["customers"]));
                }

                if (dict.ContainsKey("settingsHistory") && dict["settingsHistory"] != null)
                {
                    WriteAtomicJson(Path.Combine(_dataDir, "settings_history.json"), serializer.Serialize(dict["settingsHistory"]));
                }

                if (dict.ContainsKey("auditLog") && dict["auditLog"] != null)
                {
                    WriteAtomicJson(Path.Combine(_dataDir, "audit_log.json"), serializer.Serialize(dict["auditLog"]));
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
                        WriteAtomicJson(fPath, serializer.Serialize(kvp.Value));
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
                        WriteAtomicJson(fPath, serializer.Serialize(kvp.Value));
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
                        WriteAtomicJson(fPath, serializer.Serialize(kvp.Value));
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
                        WriteAtomicJson(fPath, serializer.Serialize(kvp.Value));
                    }
                }

                return true;
            }
            catch (Exception ex)
            {
                try { File.AppendAllText(Path.Combine(_webRoot, "save_err.txt"), ex.ToString()); } catch { }
                return false;
            }
        }

        private void WriteAtomicJson(string path, string json)
        {
            string temp = path + ".tmp";
            File.WriteAllText(temp, json, Encoding.UTF8);
            if (File.Exists(path)) File.Delete(path);
            File.Move(temp, path);
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
