using System;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Net.NetworkInformation;
using System.Text;
using System.Threading;
using System.Diagnostics;
using System.Collections.Generic;
using System.Drawing;
using System.Windows.Forms;
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
            string currentProcessName = Process.GetCurrentProcess().ProcessName;
            Process[] existingProcesses = Process.GetProcessesByName(currentProcessName);
            if (existingProcesses.Length > 1)
            {
                // Đã có máy chủ chạy rồi -> chỉ cần mở trình duyệt tới web
                OpenBrowser("http://medica.com");
                return;
            }

            try
            {
                Application.EnableVisualStyles();
                Application.SetCompatibleTextRenderingDefault(false);
                Application.Run(new MedicaTrayApplicationContext());
            }
            catch (Exception ex)
            {
                File.WriteAllText(Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "startup_err.txt"), ex.ToString());
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

        public MedicaTrayApplicationContext()
        {
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

            InitDatabaseIfEmpty();
            StartServer();
            StartNgrokTunnel();
            InitTrayIcon();

            string openUrl = (_activePort == 80) ? "http://medica.com" : ("http://localhost:" + _activePort);
            Program.OpenBrowser(openUrl);
        }

        private void StartNgrokTunnel()
        {
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
            ToolStripMenuItem itemOpen = new ToolStripMenuItem("🌐 Mở Phần Mềm (http://medica.com)");
            itemOpen.Font = new Font("Segoe UI", 9F, FontStyle.Bold);
            itemOpen.Click += (s, e) => {
                string url = (_activePort == 80) ? "http://medica.com" : ("http://localhost:" + _activePort);
                Program.OpenBrowser(url);
            };
            menu.Items.Add(itemOpen);

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
                Text = "MedicaPharmacy (http://medica.com)",
                Visible = true
            };

            // Nhấp đúp chuột vào icon khay hệ thống -> mở trang web
            _trayIcon.DoubleClick += (s, e) => {
                string url = (_activePort == 80) ? "http://medica.com" : ("http://localhost:" + _activePort);
                Program.OpenBrowser(url);
            };

            // Thông báo bong bóng nhỏ lúc khởi động
            _trayIcon.ShowBalloonTip(
                3000,
                "MedicaPharmacy Server Đang Chạy Nền",
                "Máy chủ đang hoạt động êm ái tại http://medica.com.\nNhấp đúp chuột vào icon này để mở phần mềm bất cứ lúc nào!",
                ToolTipIcon.Info
            );
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
                        foreach (string line in lines)
                        {
                            if (line.StartsWith("Content-Length:", StringComparison.OrdinalIgnoreCase))
                            {
                                int.TryParse(line.Substring("Content-Length:".Length).Trim(), out contentLength);
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
                                "{{\"status\":\"online\",\"app\":\"MedicaPharmacy\",\"port\":{0},\"domain\":\"medica.com\",\"ips\":[{1}],\"time\":\"{2}\"}}",
                                _activePort,
                                ipsJson,
                                DateTime.Now.ToString("yyyy-MM-ddTHH:mm:ss")
                            );
                            SendResponse(stream, 200, "application/json; charset=utf-8", Encoding.UTF8.GetBytes(json));
                            return;
                        }

                        if (rawUrl.Equals("/api/database", StringComparison.OrdinalIgnoreCase))
                        {
                            if (method == "GET")
                            {
                                byte[] dbBytes;
                                lock (_dbLock)
                                {
                                    if (!File.Exists(_dbFile)) InitDatabaseIfEmpty();
                                    dbBytes = File.ReadAllBytes(_dbFile);
                                }
                                SendResponse(stream, 200, "application/json; charset=utf-8", dbBytes);
                            }
                            else if (method == "POST")
                            {
                                if (!string.IsNullOrEmpty(body) && body.Trim().StartsWith("{"))
                                {
                                    lock (_dbLock)
                                    {
                                        string temp = _dbFile + ".tmp";
                                        File.WriteAllText(temp, body, Encoding.UTF8);
                                        if (File.Exists(_dbFile)) File.Delete(_dbFile);
                                        File.Move(temp, _dbFile);
                                    }
                                    string ok = "{\"success\":true,\"message\":\"Lưu dữ liệu máy chủ thành công\"}";
                                    SendResponse(stream, 200, "application/json; charset=utf-8", Encoding.UTF8.GetBytes(ok));
                                }
                                else
                                {
                                    SendResponse(stream, 400, "application/json; charset=utf-8", Encoding.UTF8.GetBytes("{\"success\":false}"));
                                }
                            }
                            return;
                        }

                        if (rawUrl == "/") rawUrl = "/index.html";
                        string cleanPath = rawUrl.TrimStart('/').Replace('/', Path.DirectorySeparatorChar);
                        string filePath = Path.Combine(_webRoot, cleanPath);

                        if (File.Exists(filePath))
                        {
                            string ext = Path.GetExtension(filePath).ToLower();
                            string mime = GetMimeType(ext);
                            byte[] fileBytes = File.ReadAllBytes(filePath);
                            SendResponse(stream, 200, mime, fileBytes);
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

        private void SendResponse(NetworkStream stream, int statusCode, string contentType, byte[] bodyBytes)
        {
            string statusText = (statusCode == 200) ? "OK" : (statusCode == 404 ? "Not Found" : "Error");
            StringBuilder sb = new StringBuilder();
            sb.AppendFormat("HTTP/1.1 {0} {1}\r\n", statusCode, statusText);
            sb.AppendFormat("Content-Type: {0}\r\n", contentType);
            sb.AppendFormat("Content-Length: {0}\r\n", bodyBytes.Length);
            sb.Append("Access-Control-Allow-Origin: *\r\n");
            sb.Append("Access-Control-Allow-Methods: GET, POST, OPTIONS\r\n");
            sb.Append("Access-Control-Allow-Headers: Content-Type\r\n");
            sb.Append("Connection: close\r\n");
            sb.Append("\r\n");

            byte[] headerBytes = Encoding.UTF8.GetBytes(sb.ToString());
            stream.Write(headerBytes, 0, headerBytes.Length);
            if (bodyBytes.Length > 0)
            {
                stream.Write(bodyBytes, 0, bodyBytes.Length);
            }
            stream.Flush();
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
            if (!File.Exists(_dbFile))
            {
                string initialJson = "{\"medicines\":[],\"orders\":[],\"stockInOrders\":[],\"suppliers\":[],\"settings\":{}}";
                File.WriteAllText(_dbFile, initialJson, Encoding.UTF8);
            }
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
