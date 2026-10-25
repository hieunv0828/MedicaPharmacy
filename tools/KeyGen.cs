using System;
using System.Drawing;
using System.Windows.Forms;

namespace MedicaPharmacy.KeyGen
{
    static class Program
    {
        [STAThread]
        static void Main(string[] args)
        {
            if (args.Length > 0 && !string.IsNullOrEmpty(args[0]))
            {
                // Chế độ Command Line nhanh
                string machineCode = args[0].Trim();
                string key = LicenseManager.GenerateLicenseKey(machineCode);
                Console.WriteLine(key);
                try { Clipboard.SetText(key); } catch { }
                return;
            }

            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.Run(new KeyGenForm());
        }
    }

    public class KeyGenForm : Form
    {
        private TextBox txtMachineCode;
        private TextBox txtLicenseKey;
        private Button btnGenerate;
        private Button btnCopy;
        private Label lblStatus;

        public KeyGenForm()
        {
            InitializeComponent();
        }

        private void InitializeComponent()
        {
            this.Text = "MedicaPharmacy - Trình Tạo Khóa Bản Quyền (Dành Riêng Cho Quản Trị Viên)";
            this.Size = new Size(540, 360);
            this.StartPosition = FormStartPosition.CenterScreen;
            this.FormBorderStyle = FormBorderStyle.FixedDialog;
            this.MaximizeBox = false;
            this.BackColor = Color.FromArgb(248, 250, 252);
            this.Font = new Font("Segoe UI", 9F, FontStyle.Regular);

            // Header
            Panel header = new Panel
            {
                Dock = DockStyle.Top,
                Height = 75,
                BackColor = Color.FromArgb(15, 23, 42) // Slate 900
            };

            Label lblTitle = new Label
            {
                Text = "CÔNG CỤ CẤP BẢN QUYỀN MEDICAPHARMACY",
                Font = new Font("Segoe UI", 11.5F, FontStyle.Bold),
                ForeColor = Color.White,
                Location = new Point(20, 16),
                AutoSize = true
            };

            Label lblSub = new Label
            {
                Text = "Tạo mã kích hoạt bản quyền gắn liền theo phần cứng máy tính khách hàng",
                Font = new Font("Segoe UI", 8.5F),
                ForeColor = Color.FromArgb(148, 163, 184),
                Location = new Point(20, 42),
                AutoSize = true
            };

            header.Controls.Add(lblTitle);
            header.Controls.Add(lblSub);
            this.Controls.Add(header);

            // Nhập Mã Thiết Bị
            Label lblInput = new Label
            {
                Text = "1. Nhập Mã Thiết Bị của khách hàng (VD: MED-A89F-72BC-10D4):",
                Font = new Font("Segoe UI", 9F, FontStyle.Bold),
                ForeColor = Color.FromArgb(30, 41, 59),
                Location = new Point(20, 95),
                AutoSize = true
            };
            this.Controls.Add(lblInput);

            txtMachineCode = new TextBox
            {
                Location = new Point(20, 120),
                Size = new Size(365, 27),
                Font = new Font("Segoe UI", 10.5F, FontStyle.Bold),
                CharacterCasing = CharacterCasing.Upper,
                ForeColor = Color.FromArgb(15, 118, 110)
            };
            txtMachineCode.TextChanged += (s, e) => {
                lblStatus.Text = "";
                txtLicenseKey.Text = "";
            };
            this.Controls.Add(txtMachineCode);

            btnGenerate = new Button
            {
                Text = "Tạo Key ⚡",
                Font = new Font("Segoe UI", 9.5F, FontStyle.Bold),
                ForeColor = Color.White,
                BackColor = Color.FromArgb(5, 150, 105),
                FlatStyle = FlatStyle.Flat,
                Location = new Point(395, 118),
                Size = new Size(110, 31),
                Cursor = Cursors.Hand
            };
            btnGenerate.FlatAppearance.BorderSize = 0;
            btnGenerate.Click += BtnGenerate_Click;
            this.Controls.Add(btnGenerate);

            // Kết quả Mã Kích Hoạt
            Label lblResult = new Label
            {
                Text = "2. Mã Kích Hoạt (License Key) được sinh ra:",
                Font = new Font("Segoe UI", 9F, FontStyle.Bold),
                ForeColor = Color.FromArgb(30, 41, 59),
                Location = new Point(20, 165),
                AutoSize = true
            };
            this.Controls.Add(lblResult);

            txtLicenseKey = new TextBox
            {
                Location = new Point(20, 190),
                Size = new Size(365, 27),
                Font = new Font("Segoe UI", 10.5F, FontStyle.Bold),
                ReadOnly = true,
                BackColor = Color.FromArgb(241, 245, 249),
                ForeColor = Color.FromArgb(30, 41, 59)
            };
            this.Controls.Add(txtLicenseKey);

            btnCopy = new Button
            {
                Text = "📋 Sao Chép",
                Font = new Font("Segoe UI", 9F, FontStyle.Bold),
                ForeColor = Color.FromArgb(30, 41, 59),
                BackColor = Color.FromArgb(226, 232, 240),
                FlatStyle = FlatStyle.Flat,
                Location = new Point(395, 188),
                Size = new Size(110, 31),
                Cursor = Cursors.Hand
            };
            btnCopy.FlatAppearance.BorderSize = 0;
            btnCopy.Click += (s, e) => {
                if (!string.IsNullOrEmpty(txtLicenseKey.Text))
                {
                    Clipboard.SetText(txtLicenseKey.Text);
                    lblStatus.Text = "✅ Đã sao chép License Key vào bộ nhớ tạm! Bạn có thể dán gửi Zalo cho khách.";
                    lblStatus.ForeColor = Color.FromArgb(5, 150, 105);
                }
            };
            this.Controls.Add(btnCopy);

            // Status message
            lblStatus = new Label
            {
                Text = "",
                Font = new Font("Segoe UI", 8.5F, FontStyle.Italic),
                ForeColor = Color.FromArgb(100, 116, 139),
                Location = new Point(20, 230),
                Size = new Size(485, 35)
            };
            this.Controls.Add(lblStatus);

            // Tự động điền mã máy hiện tại để thử nghiệm nếu muốn
            Button btnUseCurrentMachine = new Button
            {
                Text = "🔍 Thử với mã máy này",
                Font = new Font("Segoe UI", 8F),
                ForeColor = Color.FromArgb(71, 85, 105),
                BackColor = Color.Transparent,
                FlatStyle = FlatStyle.Flat,
                Location = new Point(20, 275),
                Size = new Size(160, 25),
                Cursor = Cursors.Hand
            };
            btnUseCurrentMachine.FlatAppearance.BorderSize = 1;
            btnUseCurrentMachine.Click += (s, e) => {
                txtMachineCode.Text = LicenseManager.GetCurrentMachineCode();
                BtnGenerate_Click(null, null);
            };
            this.Controls.Add(btnUseCurrentMachine);
        }

        private void BtnGenerate_Click(object sender, EventArgs e)
        {
            string code = txtMachineCode.Text.Trim();
            if (string.IsNullOrEmpty(code))
            {
                MessageBox.Show("Vui lòng nhập Mã Thiết Bị của khách hàng!", "Thông Báo", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return;
            }

            string key = LicenseManager.GenerateLicenseKey(code);
            txtLicenseKey.Text = key;
            try { Clipboard.SetText(key); } catch { }

            lblStatus.Text = "✅ Đã tạo key thành công và tự động sao chép vào bộ nhớ tạm!\nBạn chỉ cần mở Zalo bấm Ctrl+V để gửi cho khách.";
            lblStatus.ForeColor = Color.FromArgb(5, 150, 105);
        }
    }
}
