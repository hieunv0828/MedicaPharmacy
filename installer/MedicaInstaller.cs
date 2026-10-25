using System;
using System.IO;
using System.IO.Compression;
using System.Reflection;
using System.Diagnostics;
using System.Security.Principal;
using System.Text;
using System.Threading;
using System.Drawing;
using System.Windows.Forms;

namespace MedicaPharmacy.Installer
{
    static class Program
    {
        [STAThread]
        static void Main(string[] args)
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.Run(new InstallerForm());
        }
    }

    public class InstallerForm : Form
    {
        private TextBox txtInstallPath;
        private Button btnBrowse;
        private CheckBox chkDesktopShortcut;
        private CheckBox chkStartMenuShortcut;
        private CheckBox chkConfigureHosts;
        private CheckBox chkConfigureFirewall;
        private CheckBox chkLaunchAfterInstall;
        private ProgressBar progressBar;
        private Label lblStatus;
        private Button btnInstall;
        private Button btnCancel;

        // Khóa bản quyền thiết bị
        private TextBox txtMachineCode;
        private Button btnCopyMachineCode;
        private TextBox txtLicenseKey;
        private Label lblLicenseStatus;
        private string _currentMachineCode = "";

        public InstallerForm()
        {
            InitializeComponent();
        }

        private void InitializeComponent()
        {
            this.Text = "Cài Đặt Phần Mềm Quản Lý Nhà Thuốc - MedicaPharmacy GPP";
            this.Size = new Size(580, 565);
            this.StartPosition = FormStartPosition.CenterScreen;
            this.FormBorderStyle = FormBorderStyle.FixedDialog;
            this.MaximizeBox = false;
            this.MinimizeBox = true;
            this.BackColor = Color.FromArgb(248, 250, 252);
            this.Font = new Font("Segoe UI", 9F, FontStyle.Regular);

            // 1. Header Panel
            Panel headerPanel = new Panel
            {
                Dock = DockStyle.Top,
                Height = 75,
                BackColor = Color.FromArgb(5, 150, 105) // Emerald 600
            };

            Label lblTitle = new Label
            {
                Text = "MEDICA PHARMACY GPP",
                Font = new Font("Segoe UI", 15F, FontStyle.Bold),
                ForeColor = Color.White,
                Location = new Point(24, 14),
                AutoSize = true
            };

            Label lblSubtitle = new Label
            {
                Text = "Hệ thống quản lý bán thuốc, kho GPP & sổ quỹ thu chi đạt chuẩn",
                Font = new Font("Segoe UI", 9F, FontStyle.Regular),
                ForeColor = Color.FromArgb(209, 250, 229),
                Location = new Point(25, 44),
                AutoSize = true
            };

            headerPanel.Controls.Add(lblTitle);
            headerPanel.Controls.Add(lblSubtitle);
            this.Controls.Add(headerPanel);

            // 2. Nhóm Kích Hoạt Bản Quyền (Bắt Buộc)
            GroupBox grpLicense = new GroupBox
            {
                Text = " 🔒 Kích Hoạt Bản Quyền Thiết Bị (Bắt Buộc) ",
                Location = new Point(25, 85),
                Size = new Size(515, 122),
                Font = new Font("Segoe UI", 9F, FontStyle.Bold),
                ForeColor = Color.FromArgb(5, 150, 105)
            };

            Label lblMachineTitle = new Label
            {
                Text = "Mã Thiết Bị của máy tính này (Gửi mã này cho Tác giả để lấy Key):",
                Font = new Font("Segoe UI", 8.5F, FontStyle.Regular),
                ForeColor = Color.FromArgb(71, 85, 105),
                Location = new Point(15, 20),
                AutoSize = true
            };
            grpLicense.Controls.Add(lblMachineTitle);

            _currentMachineCode = LicenseManager.GetCurrentMachineCode();

            txtMachineCode = new TextBox
            {
                Text = _currentMachineCode,
                ReadOnly = true,
                BackColor = Color.FromArgb(241, 245, 249),
                ForeColor = Color.FromArgb(15, 118, 110),
                Font = new Font("Segoe UI", 9F, FontStyle.Bold),
                Location = new Point(15, 40),
                Size = new Size(390, 23)
            };
            grpLicense.Controls.Add(txtMachineCode);

            btnCopyMachineCode = new Button
            {
                Text = "📋 Sao Chép",
                Font = new Font("Segoe UI", 8.5F, FontStyle.Bold),
                Location = new Point(415, 39),
                Size = new Size(88, 26),
                BackColor = Color.White,
                FlatStyle = FlatStyle.System,
                Cursor = Cursors.Hand
            };
            btnCopyMachineCode.Click += (s, e) => {
                try {
                    Clipboard.SetText(_currentMachineCode);
                    lblLicenseStatus.Text = "✅ Đã sao chép Mã Thiết Bị! Hãy gửi mã này qua Zalo để nhận Key.";
                    lblLicenseStatus.ForeColor = Color.FromArgb(5, 150, 105);
                } catch { }
            };
            grpLicense.Controls.Add(btnCopyMachineCode);

            Label lblKeyTitle = new Label
            {
                Text = "Nhập Mã Kích Hoạt Bản Quyền (License Key):",
                Font = new Font("Segoe UI", 8.5F, FontStyle.Bold),
                ForeColor = Color.FromArgb(30, 41, 59),
                Location = new Point(15, 68),
                AutoSize = true
            };
            grpLicense.Controls.Add(lblKeyTitle);

            txtLicenseKey = new TextBox
            {
                Location = new Point(15, 88),
                Size = new Size(488, 23),
                Font = new Font("Segoe UI", 9.5F, FontStyle.Bold),
                CharacterCasing = CharacterCasing.Upper,
                ForeColor = Color.FromArgb(30, 41, 59)
            };
            txtLicenseKey.TextChanged += TxtLicenseKey_TextChanged;
            grpLicense.Controls.Add(txtLicenseKey);

            this.Controls.Add(grpLicense);

            lblLicenseStatus = new Label
            {
                Text = "⚠️ Vui lòng liên hệ Dược sĩ Dung (0982.149.806) để nhận Mã Kích Hoạt.",
                Font = new Font("Segoe UI", 8.5F, FontStyle.Italic),
                ForeColor = Color.FromArgb(217, 119, 6),
                Location = new Point(25, 212),
                Size = new Size(515, 18)
            };
            this.Controls.Add(lblLicenseStatus);

            // 3. Thư mục cài đặt
            Label lblPathTitle = new Label
            {
                Text = "Thư mục cài đặt trên máy tính:",
                Font = new Font("Segoe UI", 9F, FontStyle.Bold),
                ForeColor = Color.FromArgb(30, 41, 59),
                Location = new Point(25, 235),
                AutoSize = true
            };
            this.Controls.Add(lblPathTitle);

            txtInstallPath = new TextBox
            {
                Text = @"C:\MedicaPharmacy",
                Location = new Point(25, 256),
                Size = new Size(420, 25),
                Font = new Font("Segoe UI", 9F)
            };
            this.Controls.Add(txtInstallPath);

            btnBrowse = new Button
            {
                Text = "Chọn...",
                Location = new Point(455, 254),
                Size = new Size(85, 27),
                BackColor = Color.White,
                FlatStyle = FlatStyle.System
            };
            btnBrowse.Click += BtnBrowse_Click;
            this.Controls.Add(btnBrowse);

            // 4. Nhóm Tùy chọn cài đặt
            GroupBox grpOptions = new GroupBox
            {
                Text = " Tùy chọn thiết lập hệ thống ",
                Location = new Point(25, 290),
                Size = new Size(515, 132),
                Font = new Font("Segoe UI", 9F, FontStyle.Regular),
                ForeColor = Color.FromArgb(71, 85, 105)
            };

            chkDesktopShortcut = new CheckBox
            {
                Text = "Tạo biểu tượng lối tắt ngoài màn hình (Desktop Shortcut)",
                Checked = true,
                Location = new Point(20, 20),
                AutoSize = true,
                Font = new Font("Segoe UI", 9F, FontStyle.Regular),
                ForeColor = Color.FromArgb(15, 23, 42)
            };

            chkStartMenuShortcut = new CheckBox
            {
                Text = "Thêm lối tắt vào menu Start của Windows",
                Checked = true,
                Location = new Point(20, 42),
                AutoSize = true,
                Font = new Font("Segoe UI", 9F, FontStyle.Regular),
                ForeColor = Color.FromArgb(15, 23, 42)
            };

            chkConfigureHosts = new CheckBox
            {
                Text = "Tự động thiết lập tên miền nội bộ http://medica.com (qua file hosts)",
                Checked = true,
                Location = new Point(20, 64),
                AutoSize = true,
                Font = new Font("Segoe UI", 9F, FontStyle.Bold),
                ForeColor = Color.FromArgb(4, 120, 87)
            };

            chkConfigureFirewall = new CheckBox
            {
                Text = "Mở tường lửa Windows Firewall cổng 80 & 8080 (để kết nối qua Wifi)",
                Checked = true,
                Location = new Point(20, 86),
                AutoSize = true,
                Font = new Font("Segoe UI", 9F, FontStyle.Regular),
                ForeColor = Color.FromArgb(15, 23, 42)
            };

            chkLaunchAfterInstall = new CheckBox
            {
                Text = "Khởi chạy phần mềm và mở trình duyệt ngay sau khi cài xong",
                Checked = true,
                Location = new Point(20, 108),
                AutoSize = true,
                Font = new Font("Segoe UI", 9F, FontStyle.Bold),
                ForeColor = Color.FromArgb(15, 23, 42)
            };

            grpOptions.Controls.Add(chkDesktopShortcut);
            grpOptions.Controls.Add(chkStartMenuShortcut);
            grpOptions.Controls.Add(chkConfigureHosts);
            grpOptions.Controls.Add(chkConfigureFirewall);
            grpOptions.Controls.Add(chkLaunchAfterInstall);
            this.Controls.Add(grpOptions);

            // 5. Progress bar & Status
            lblStatus = new Label
            {
                Text = "Nhập mã kích hoạt ở trên để mở khóa nút cài đặt.",
                Location = new Point(25, 430),
                Size = new Size(515, 18),
                ForeColor = Color.FromArgb(100, 116, 139),
                Font = new Font("Segoe UI", 8.5F)
            };
            this.Controls.Add(lblStatus);

            progressBar = new ProgressBar
            {
                Location = new Point(25, 452),
                Size = new Size(515, 16),
                Style = ProgressBarStyle.Blocks,
                Value = 0
            };
            this.Controls.Add(progressBar);

            // 6. Bottom buttons
            btnCancel = new Button
            {
                Text = "Thoát",
                Location = new Point(345, 480),
                Size = new Size(90, 32),
                BackColor = Color.FromArgb(241, 245, 249),
                FlatStyle = FlatStyle.System
            };
            btnCancel.Click += (s, e) => this.Close();
            this.Controls.Add(btnCancel);

            btnInstall = new Button
            {
                Text = "Bắt Đầu Cài Đặt",
                Font = new Font("Segoe UI", 9.5F, FontStyle.Bold),
                ForeColor = Color.White,
                BackColor = Color.FromArgb(5, 150, 105),
                Location = new Point(445, 480),
                Size = new Size(95, 32),
                FlatStyle = FlatStyle.Flat,
                Enabled = false
            };
            btnInstall.FlatAppearance.BorderSize = 0;
            btnInstall.Click += BtnInstall_Click;
            this.Controls.Add(btnInstall);
        }

        private void TxtLicenseKey_TextChanged(object sender, EventArgs e)
        {
            string key = txtLicenseKey.Text.Trim();
            if (string.IsNullOrEmpty(key))
            {
                lblLicenseStatus.Text = "⚠️ Vui lòng liên hệ Dược sĩ Dung (0982.149.806) để nhận Mã Kích Hoạt.";
                lblLicenseStatus.ForeColor = Color.FromArgb(217, 119, 6);
                btnInstall.Enabled = false;
                lblStatus.Text = "Nhập mã kích hoạt ở trên để mở khóa nút cài đặt.";
                return;
            }

            if (LicenseManager.ValidateLicenseForCurrentMachine(key))
            {
                lblLicenseStatus.Text = "✅ Mã kích hoạt hợp lệ cho máy tính này! Nút 'Bắt Đầu Cài Đặt' đã mở.";
                lblLicenseStatus.ForeColor = Color.FromArgb(5, 150, 105);
                btnInstall.Enabled = true;
                lblStatus.Text = "Sẵn sàng cài đặt. Nhấn 'Bắt Đầu Cài Đặt' để tiến hành.";
            }
            else
            {
                lblLicenseStatus.Text = "❌ Mã kích hoạt không khớp với máy tính này! Vui lòng kiểm tra lại.";
                lblLicenseStatus.ForeColor = Color.FromArgb(220, 38, 38);
                btnInstall.Enabled = false;
                lblStatus.Text = "Mã kích hoạt không hợp lệ.";
            }
        }

        private void BtnBrowse_Click(object sender, EventArgs e)
        {
            using (FolderBrowserDialog fbd = new FolderBrowserDialog())
            {
                fbd.Description = "Chọn thư mục cài đặt MedicaPharmacy:";
                fbd.SelectedPath = txtInstallPath.Text;
                if (fbd.ShowDialog() == DialogResult.OK)
                {
                    txtInstallPath.Text = fbd.SelectedPath;
                }
            }
        }

        private bool IsAdministrator()
        {
            try
            {
                WindowsIdentity identity = WindowsIdentity.GetCurrent();
                WindowsPrincipal principal = new WindowsPrincipal(identity);
                return principal.IsInRole(WindowsBuiltInRole.Administrator);
            }
            catch { return false; }
        }

        private void ElevateSelf()
        {
            try
            {
                ProcessStartInfo psi = new ProcessStartInfo
                {
                    FileName = Application.ExecutablePath,
                    Arguments = "--elevated",
                    UseShellExecute = true,
                    Verb = "runas"
                };
                Process.Start(psi);
                Application.Exit();
            }
            catch (Exception ex)
            {
                MessageBox.Show("Để cài đặt cấu hình hệ thống (tên miền medica.com & firewall), bạn vui lòng cấp quyền Quản trị viên (Yes) khi Windows yêu cầu.\n\nChi tiết: " + ex.Message, "Yêu Cầu Quyền Quản Trị", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            }
        }

        private void BtnInstall_Click(object sender, EventArgs e)
        {
            // Kiểm tra quyền Admin nếu cần chỉnh sửa hosts hoặc firewall
            if ((chkConfigureHosts.Checked || chkConfigureFirewall.Checked) && !IsAdministrator())
            {
                DialogResult dr = MessageBox.Show(
                    "Cài đặt tên miền nội bộ http://medica.com và tường lửa mạng cần quyền Quản trị viên (Administrator).\n\nBạn có muốn khởi động lại trình cài đặt với quyền Quản trị viên không?",
                    "Cần Quyền Quản Trị Viên",
                    MessageBoxButtons.YesNo,
                    MessageBoxIcon.Question
                );
                if (dr == DialogResult.Yes)
                {
                    ElevateSelf();
                    return;
                }
            }

            string targetDir = txtInstallPath.Text.Trim();
            if (string.IsNullOrEmpty(targetDir))
            {
                MessageBox.Show("Vui lòng chọn thư mục cài đặt hợp lệ!", "Lỗi", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return;
            }

            btnInstall.Enabled = false;
            btnBrowse.Enabled = false;
            btnCancel.Enabled = false;
            progressBar.Value = 10;
            lblStatus.Text = "Đang giải nén tập tin ứng dụng...";

            ThreadPool.QueueUserWorkItem((state) =>
            {
                try
                {
                    // 1. Giải nén payload
                    ExtractPayload(targetDir);

                    // 1.1 Lưu khóa bản quyền đã kích hoạt cho máy tính này
                    try
                    {
                        string dataDir = Path.Combine(targetDir, "data");
                        if (!Directory.Exists(dataDir)) Directory.CreateDirectory(dataDir);
                        File.WriteAllText(Path.Combine(dataDir, "license.key"), txtLicenseKey.Text.Trim(), Encoding.UTF8);
                    }
                    catch { }

                    // 2. Cấu hình hosts nếu được chọn
                    if (chkConfigureHosts.Checked)
                    {
                        UpdateStatus("Đang cấu hình tên miền nội bộ http://medica.com...", 60);
                        ConfigureHostsFile();
                    }

                    // 3. Cấu hình firewall nếu được chọn
                    if (chkConfigureFirewall.Checked)
                    {
                        UpdateStatus("Đang mở cổng tường lửa Windows Firewall...", 75);
                        ConfigureFirewallRules();
                    }

                    // 4. Tạo lối tắt Desktop & Start Menu
                    UpdateStatus("Đang tạo biểu tượng lối tắt...", 85);
                    if (chkDesktopShortcut.Checked)
                    {
                        CreateDesktopShortcut(targetDir);
                    }
                    if (chkStartMenuShortcut.Checked)
                    {
                        CreateStartMenuShortcut(targetDir);
                    }

                    // 5. Hoàn tất
                    UpdateStatus("Cài đặt hoàn tất 100%!", 100);

                    // Khởi chạy phần mềm
                    if (chkLaunchAfterInstall.Checked)
                    {
                        string exePath = Path.Combine(targetDir, "MedicaServer.exe");
                        if (File.Exists(exePath))
                        {
                            Process.Start(new ProcessStartInfo
                            {
                                FileName = exePath,
                                WorkingDirectory = targetDir,
                                UseShellExecute = true
                            });
                        }
                    }

                    this.Invoke(new Action(() =>
                    {
                        MessageBox.Show(
                            "Chúc mừng bạn! MedicaPharmacy GPP đã được cài đặt thành công vào máy tính.\n\n" +
                            "• Bạn có thể mở phần mềm bất kỳ lúc nào từ biểu tượng ngoài màn hình Desktop.\n" +
                            "• Địa chỉ phần mềm: http://medica.com",
                            "Cài Đặt Thành Công",
                            MessageBoxButtons.OK,
                            MessageBoxIcon.Information
                        );
                        Application.Exit();
                    }));
                }
                catch (Exception ex)
                {
                    this.Invoke(new Action(() =>
                    {
                        MessageBox.Show("Có lỗi xảy ra trong quá trình cài đặt:\n" + ex.Message, "Lỗi Cài Đặt", MessageBoxButtons.OK, MessageBoxIcon.Error);
                        btnInstall.Enabled = true;
                        btnBrowse.Enabled = true;
                        btnCancel.Enabled = true;
                    }));
                }
            });
        }

        private void UpdateStatus(string message, int progress)
        {
            if (this.InvokeRequired)
            {
                this.Invoke(new Action(() => UpdateStatus(message, progress)));
                return;
            }
            lblStatus.Text = message;
            progressBar.Value = Math.Min(100, progress);
        }

        private void ExtractPayload(string targetDir)
        {
            if (!Directory.Exists(targetDir))
            {
                Directory.CreateDirectory(targetDir);
            }

            Assembly assembly = Assembly.GetExecutingAssembly();
            using (Stream zipStream = assembly.GetManifestResourceStream("MedicaPayload"))
            {
                if (zipStream == null)
                {
                    throw new Exception("Không tìm thấy gói dữ liệu MedicaPayload được đính kèm trong bộ cài đặt!");
                }

                using (ZipArchive archive = new ZipArchive(zipStream, ZipArchiveMode.Read))
                {
                    int total = archive.Entries.Count;
                    int count = 0;

                    foreach (ZipArchiveEntry entry in archive.Entries)
                    {
                        count++;
                        string destPath = Path.Combine(targetDir, entry.FullName);
                        string destDir = Path.GetDirectoryName(destPath);
                        if (!string.IsNullOrEmpty(destDir) && !Directory.Exists(destDir))
                        {
                            Directory.CreateDirectory(destDir);
                        }

                        // Không ghi đè nếu là thư mục
                        if (string.IsNullOrEmpty(entry.Name)) continue;

                        // Bảo vệ file database.json cũ không bị ghi đè nếu người dùng cài nâng cấp
                        if (entry.FullName.Replace('\\', '/').EndsWith("data/database.json") && File.Exists(destPath))
                        {
                            continue;
                        }

                        entry.ExtractToFile(destPath, true);
                        int p = 10 + (int)((count / (float)total) * 45);
                        UpdateStatus("Đang giải nén: " + entry.Name, p);
                    }
                }
            }
        }

        private void ConfigureHostsFile()
        {
            try
            {
                string windir = Environment.GetFolderPath(Environment.SpecialFolder.Windows);
                string hostsFile = Path.Combine(windir, @"System32\drivers\etc\hosts");
                if (File.Exists(hostsFile))
                {
                    string content = File.ReadAllText(hostsFile);
                    if (!content.Contains("medica.com"))
                    {
                        File.AppendAllText(hostsFile, "\r\n127.0.0.1 medica.com\r\n", Encoding.UTF8);
                    }
                }
            }
            catch { }
        }

        private void ConfigureFirewallRules()
        {
            try
            {
                RunHiddenCommand("netsh", "advfirewall firewall delete rule name=\"Medica Pharmacy Server\"");
                RunHiddenCommand("netsh", "advfirewall firewall add rule name=\"Medica Pharmacy Server\" dir=in action=allow protocol=TCP localport=80,8080");
                RunHiddenCommand("netsh", "http add urlacl url=http://+:80/ sddl=D:(A;;GX;;;WD)");
                RunHiddenCommand("netsh", "http add urlacl url=http://+:8080/ sddl=D:(A;;GX;;;WD)");
            }
            catch { }
        }

        private void CreateDesktopShortcut(string targetDir)
        {
            try
            {
                string desktop = Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory);
                string shortcutPath = Path.Combine(desktop, "Medica Pharmacy.lnk");
                CreateShortcut(shortcutPath, Path.Combine(targetDir, "MedicaServer.exe"), targetDir, "Phần mềm Quản lý Nhà thuốc MedicaPharmacy GPP");
            }
            catch { }
        }

        private void CreateStartMenuShortcut(string targetDir)
        {
            try
            {
                string startMenu = Environment.GetFolderPath(Environment.SpecialFolder.StartMenu);
                string programs = Path.Combine(startMenu, "Programs");
                string shortcutPath = Path.Combine(programs, "Medica Pharmacy.lnk");
                CreateShortcut(shortcutPath, Path.Combine(targetDir, "MedicaServer.exe"), targetDir, "Phần mềm Quản lý Nhà thuốc MedicaPharmacy GPP");
            }
            catch { }
        }

        private void CreateShortcut(string shortcutPath, string targetPath, string workingDir, string description)
        {
            try
            {
                Type shellType = Type.GetTypeFromProgID("WScript.Shell");
                if (shellType != null)
                {
                    dynamic shell = Activator.CreateInstance(shellType);
                    dynamic shortcut = shell.CreateShortcut(shortcutPath);
                    shortcut.TargetPath = targetPath;
                    shortcut.WorkingDirectory = workingDir;
                    shortcut.Description = description;
                    shortcut.Save();
                }
            }
            catch { }
        }

        private void RunHiddenCommand(string exe, string args)
        {
            try
            {
                ProcessStartInfo psi = new ProcessStartInfo
                {
                    FileName = exe,
                    Arguments = args,
                    CreateNoWindow = true,
                    WindowStyle = ProcessWindowStyle.Hidden,
                    UseShellExecute = false
                };
                using (Process p = Process.Start(psi))
                {
                    p.WaitForExit(3000);
                }
            }
            catch { }
        }
    }
}
