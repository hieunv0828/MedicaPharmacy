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
                                string dbJson = GetFullDatabaseJson();
                                byte[] dbBytes = Encoding.UTF8.GetBytes(dbJson);
                                SendResponse(stream, 200, "application/json; charset=utf-8", dbBytes);
                            }
                            else if (method == "POST")
                            {
                                bool saved = SaveFullDatabase(body);
                                if (saved)
                                {
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

        private string GetFullDatabaseJson()
        {
            lock (_dbLock)
            {
                MigrateSingleDatabaseIfPresent();

                var fullDb = new Dictionary<string, object>();
                fullDb["settings"] = ReadJsonFile(Path.Combine(_dataDir, "settings.json"), new Dictionary<string, object>());
                fullDb["medicines"] = ReadJsonFile(Path.Combine(_dataDir, "medicines.json"), new ArrayList());
                fullDb["suppliers"] = ReadJsonFile(Path.Combine(_dataDir, "suppliers.json"), new ArrayList());
                fullDb["customers"] = ReadJsonFile(Path.Combine(_dataDir, "customers.json"), new ArrayList());
                fullDb["settingsHistory"] = ReadJsonFile(Path.Combine(_dataDir, "settings_history.json"), new ArrayList());

                fullDb["orders"] = ReadPartitionedList("orders_*.json");
                fullDb["stockInOrders"] = ReadPartitionedList("stockin_*.json");
                fullDb["vouchers"] = ReadPartitionedList("vouchers_*.json");

                fullDb["lastUpdated"] = DateTime.UtcNow.ToString("yyyy-MM-ddTHH:mm:ss.fffZ");

                var serializer = new JavaScriptSerializer { MaxJsonLength = int.MaxValue };
                return serializer.Serialize(fullDb);
            }
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
