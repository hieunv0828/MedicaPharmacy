using System;
using System.IO;
using System.Text;
using System.Security.Cryptography;
using System.Runtime.InteropServices;
using Microsoft.Win32;

namespace MedicaPharmacy
{
    public static class LicenseManager
    {
        // Khóa bí mật của tác giả dùng để ký số bản quyền
        // Chỉ bạn mới biết khóa này để sinh ra các Key hợp lệ
        private const string SecretSalt = "MEDICA_PHARMACY_MASTER_KEY_2026_@DS_DUNG_SECURE#!";

        [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Auto)]
        private static extern bool GetVolumeInformation(
            string rootPathName,
            StringBuilder volumeNameBuffer,
            int volumeNameSize,
            out uint volumeSerialNumber,
            out uint maximumComponentLength,
            out uint fileSystemFlags,
            StringBuilder fileSystemNameBuffer,
            int fileSystemNameSize);

        /// <summary>
        /// Lấy Mã Thiết Bị (Hardware ID) độc nhất của máy tính này
        /// Định dạng: MED-XXXX-XXXX-XXXX (Ví dụ: MED-8F12-A39C-04D1)
        /// </summary>
        public static string GetCurrentMachineCode()
        {
            try
            {
                string machineGuid = "";
                try
                {
                    using (RegistryKey key = Registry.LocalMachine.OpenSubKey(@"SOFTWARE\Microsoft\Cryptography"))
                    {
                        if (key != null && key.GetValue("MachineGuid") != null)
                        {
                            machineGuid = key.GetValue("MachineGuid").ToString().Trim();
                        }
                    }
                }
                catch { }

                uint volumeSerial = 0;
                try
                {
                    string sysDrive = Path.GetPathRoot(Environment.SystemDirectory);
                    if (string.IsNullOrEmpty(sysDrive)) sysDrive = "C:\\";
                    uint maxComp, flags;
                    GetVolumeInformation(sysDrive, null, 0, out volumeSerial, out maxComp, out flags, null, 0);
                }
                catch { }

                string cpuId = Environment.GetEnvironmentVariable("PROCESSOR_IDENTIFIER") ?? "";

                // Chuỗi định danh phần cứng kết hợp
                string rawHardwareId = string.Format("{0}#{1:X8}#{2}", machineGuid, volumeSerial, cpuId);

                using (SHA256 sha = SHA256.Create())
                {
                    byte[] hash = sha.ComputeHash(Encoding.UTF8.GetBytes(rawHardwareId));
                    string hex = BitConverter.ToString(hash).Replace("-", "").ToUpper();

                    // Rút gọn thành 12 ký tự hex chia làm 3 nhóm: MED-XXXX-XXXX-XXXX
                    return string.Format("MED-{0}-{1}-{2}",
                        hex.Substring(0, 4),
                        hex.Substring(4, 4),
                        hex.Substring(8, 4));
                }
            }
            catch
            {
                // Dự phòng trường hợp lỗi hệ thống
                string fallback = Environment.MachineName + "#" + Environment.UserName;
                using (SHA256 sha = SHA256.Create())
                {
                    byte[] hash = sha.ComputeHash(Encoding.UTF8.GetBytes(fallback));
                    string hex = BitConverter.ToString(hash).Replace("-", "").ToUpper();
                    return string.Format("MED-{0}-{1}-{2}",
                        hex.Substring(0, 4),
                        hex.Substring(4, 4),
                        hex.Substring(8, 4));
                }
            }
        }

        /// <summary>
        /// Sinh Mã Kích Hoạt (License Key) cho một Mã Thiết Bị cụ thể
        /// Chỉ công cụ sinh key của bạn mới tạo ra mã này
        /// Định dạng: LIC-XXXX-XXXX-XXXX-XXXX
        /// </summary>
        public static string GenerateLicenseKey(string machineCode)
        {
            if (string.IsNullOrEmpty(machineCode)) return "";
            string normalizedCode = NormalizeCode(machineCode);

            // Ký số HMAC-SHA256 với SecretSalt
            using (HMACSHA256 hmac = new HMACSHA256(Encoding.UTF8.GetBytes(SecretSalt)))
            {
                byte[] hash = hmac.ComputeHash(Encoding.UTF8.GetBytes(normalizedCode + "#LIFETIME"));
                string hex = BitConverter.ToString(hash).Replace("-", "").ToUpper();

                // Sinh chuỗi 16 ký tự: LIC-XXXX-XXXX-XXXX-XXXX
                return string.Format("LIC-{0}-{1}-{2}-{3}",
                    hex.Substring(0, 4),
                    hex.Substring(4, 4),
                    hex.Substring(8, 4),
                    hex.Substring(12, 4));
            }
        }

        /// <summary>
        /// Kiểm tra tính hợp lệ của License Key đối với máy hiện tại
        /// </summary>
        public static bool ValidateLicenseForCurrentMachine(string inputKey)
        {
            string currentCode = GetCurrentMachineCode();
            return ValidateLicenseKey(currentCode, inputKey);
        }

        /// <summary>
        /// Kiểm tra tính hợp lệ của License Key với một Mã Thiết Bị bất kỳ
        /// </summary>
        public static bool ValidateLicenseKey(string machineCode, string inputKey)
        {
            if (string.IsNullOrEmpty(machineCode) || string.IsNullOrEmpty(inputKey)) return false;

            string expectedKey = GenerateLicenseKey(machineCode);
            string cleanInput = NormalizeCode(inputKey);
            string cleanExpected = NormalizeCode(expectedKey);

            return string.Equals(cleanInput, cleanExpected, StringComparison.OrdinalIgnoreCase);
        }

        private static string NormalizeCode(string code)
        {
            if (string.IsNullOrEmpty(code)) return "";
            return code.Trim().ToUpper().Replace(" ", "").Replace("-", "");
        }
    }
}
