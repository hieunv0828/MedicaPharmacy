# MedicaPharmacy — Import Commands Log

> Bắt đầu: 2026-11-19T23:16 +07:00  
> Hoàn thành: 2026-11-19T23:33 +07:00  
> Mục tiêu: Dọn sạch hoàn toàn thư mục `data/` (kể cả backup) và import lại dữ liệu từ đầu từ các file `imports/*.xlsx`.

---

## Bước 0 — Dừng Server MedicaServer

```powershell
Stop-Process -Name MedicaServer -Force -ErrorAction SilentlyContinue
```
- Đã dừng tiến trình server thành công.

---

## Bước 1 — Dọn sạch thư mục data/

Giữ lại 2 file cấu hình máy: `license.key` và `remote_domain.txt`. Xóa toàn bộ file và thư mục backup bên trong.

```powershell
$dataDir = "F:\MedicaPharmacy\data"
$keep = @("license.key", "remote_domain.txt")

# Xóa toàn bộ file trừ file bảo vệ
Get-ChildItem $dataDir -File | Where-Object { $keep -notcontains $_.Name } | Remove-Item -Force

# Xóa toàn bộ thư mục con (backups, backup_pre_import_*)
Get-ChildItem $dataDir -Directory | Remove-Item -Recurse -Force

# Khởi tạo các file JSON rỗng và settings.json chuẩn
$emptyArrayFiles = @("medicines.json", "suppliers.json", "customers.json", "orders_2026.json", "stockin_2026.json", "vouchers_2026.json", "returns_2026.json", "audit_log.json", "settings_history.json")
foreach ($f in $emptyArrayFiles) { [System.IO.File]::WriteAllText("$dataDir\$f", "[]", [System.Text.Encoding]::UTF8) }
```

---

## Bước 2 — Import Danh Mục Thuốc & Tồn Kho (Medicines)

- **File nguồn:** `imports\DanhSachSanPham_KV19112026-023938-639.xlsx`
- **Script:** `scripts\import_medicines_kiotviet.ps1`

```powershell
$xlsxPath = "F:\MedicaPharmacy\imports\DanhSachSanPham_KV19112026-023938-639.xlsx"
$projectDir = "F:\MedicaPharmacy"
$scriptContent = [System.IO.File]::ReadAllText("F:\MedicaPharmacy\scripts\import_medicines_kiotviet.ps1", [System.Text.Encoding]::UTF8)
$scriptBlock = [ScriptBlock]::Create($scriptContent)
& $scriptBlock -xlsxPath $xlsxPath -projectDir $projectDir
```
- **Kết quả:** Đã import **5.844** mặt hàng thuốc, 2.002 mặt hàng có ĐVT phụ quy đổi, 1.448 mặt hàng còn tồn kho.

---

## Bước 3 — Import Danh Sách Nhà Cung Cấp (Suppliers)

- **File nguồn:** `imports\DanhSachNhaCungCap_KV19112026-030334-872.xlsx`
- **Script:** `scripts\import_suppliers_kiotviet.ps1`

```powershell
$scriptContent = [System.IO.File]::ReadAllText("F:\MedicaPharmacy\scripts\import_suppliers_kiotviet.ps1", [System.Text.Encoding]::UTF8)
$patchedScript = $scriptContent -replace [regex]::Escape('$xlsxPath = "C:\Users\qoffe\.gemini\antigravity\brain\d37817d0-d77b-4e5e-85fe-68b9f7c78692\.user_uploaded\media_1794073867226_f94956d0.xlsx"'), '$xlsxPath = "F:\MedicaPharmacy\imports\DanhSachNhaCungCap_KV19112026-030334-872.xlsx"'
$patchedScript = $patchedScript -replace [regex]::Escape('$outputPath = "f:\MedicaPharmacy\data\suppliers.json"'), '$outputPath = "F:\MedicaPharmacy\data\suppliers.json"'
& ([ScriptBlock]::Create($patchedScript))
```
- **Kết quả:** Đã import **386** nhà cung cấp.

---

## Bước 4 — Import Danh Sách Khách Hàng (Customers)

- **File nguồn:** `imports\DanhSachKhachHang_KV19112026-024239-907.xlsx`
- **Script:** `scripts\import_customers_kiotviet.ps1`

```powershell
$scriptContent = [System.IO.File]::ReadAllText("F:\MedicaPharmacy\scripts\import_customers_kiotviet.ps1", [System.Text.Encoding]::UTF8)
$patchedScript = $scriptContent -replace [regex]::Escape('$xlsxPath = "C:\Users\qoffe\.gemini\antigravity\brain\d37817d0-d77b-4e5e-85fe-68b9f7c78692\.user_uploaded\media_1794071889382_93ea95e4.xlsx"'), '$xlsxPath = "F:\MedicaPharmacy\imports\DanhSachKhachHang_KV19112026-024239-907.xlsx"'
$patchedScript = $patchedScript -replace [regex]::Escape('$outputJsonPath = "f:\MedicaPharmacy\data\customers.json"'), '$outputJsonPath = "F:\MedicaPharmacy\data\customers.json"'
& ([ScriptBlock]::Create($patchedScript))
```
- **Kết quả:** Đã import **2.656** khách hàng.

---

## Bước 5 — Import & Khử Trùng Hóa Đơn Bán Lẻ (7 File Orders)

- **Các file nguồn:**
  1. `DanhSachChiTietHoaDon_KV08112026-202052-428.xlsx`
  2. `DanhSachChiTietHoaDon_KV08112026-202159-517.xlsx`
  3. `DanhSachChiTietHoaDon_KV08112026-202256-670.xlsx`
  4. `DanhSachChiTietHoaDon_KV08112026-202408-736.xlsx`
  5. `DanhSachChiTietHoaDon_KV08112026-202454-963.xlsx`
  6. `DanhSachChiTietHoaDon_KV08112026-214148-821.xlsx`
  7. `DanhSachChiTietHoaDon_KV19112026-024056-697.xlsx` (file mới nhất, ưu tiên khi trùng)
- **Script:** `scripts\do_import_orders_all.ps1`

```powershell
$scriptContent = [System.IO.File]::ReadAllText("F:\MedicaPharmacy\scripts\do_import_orders_all.ps1", [System.Text.Encoding]::UTF8)
& ([ScriptBlock]::Create($scriptContent)) -projectDir "F:\MedicaPharmacy"
```
- **Kết quả:** Đã tổng hợp và khử trùng thành công **13.310** hóa đơn bán lẻ duy nhất.

---

## Bước 6 — Import Phiếu Nhập Kho (Stock-In)

- **File nguồn:** `imports\DanhSachChiTietNhapHang_KV19112026-040512-356.xlsx`
- **Script:** `scripts\do_import_stockin.ps1`

```powershell
$scriptContent = [System.IO.File]::ReadAllText("F:\MedicaPharmacy\scripts\do_import_stockin.ps1", [System.Text.Encoding]::UTF8)
& ([ScriptBlock]::Create($scriptContent)) -projectDir "F:\MedicaPharmacy"
```
- **Kết quả:** Đã import **717** phiếu nhập kho (4.470 dòng chi tiết).

---

## Bước 7 — Import Phiếu Trả Hàng Nhà Cung Cấp (Purchase Returns)

- **File nguồn:** `imports\DanhSachChiTietTraHangNhap_KV19112026-040615-725.xlsx`
- **Script:** `scripts\do_import_supplier_returns.ps1`

```powershell
$scriptContent = [System.IO.File]::ReadAllText("F:\MedicaPharmacy\scripts\do_import_supplier_returns.ps1", [System.Text.Encoding]::UTF8)
& ([ScriptBlock]::Create($scriptContent)) -projectDir "F:\MedicaPharmacy"
```
- **Kết quả:** Đã import **141** phiếu xuất trả hàng NCC vào `data\returns_2026.json`.

---

## Bước 8 — Import Sổ Quỹ Thu Chi (Vouchers)

- **Các file nguồn:**
  1. `imports\SoQuy_KV19112026-033409-041_chuyen_khoan.xlsx` (8.656 phiếu)
  2. `imports\SoQuy_KV19112026-033457-075_tien_mat.xlsx` (9.433 phiếu)
- **Script:** `scripts\do_import_vouchers.ps1` (tự động ánh xạ header theo tên cột, khử trùng theo ID)

```powershell
$scriptContent = [System.IO.File]::ReadAllText("F:\MedicaPharmacy\scripts\do_import_vouchers.ps1", [System.Text.Encoding]::UTF8)
& ([ScriptBlock]::Create($scriptContent)) -projectDir "F:\MedicaPharmacy"
```
- **Kết quả:** Đã import **18.089** phiếu thu chi vào `data\vouchers_2026.json`.

---

## Bước 9 — Đồng Bộ Phiếu Khách Trả Hàng (Customer Returns)

- **File nguồn đối soát:** `imports\DanhSachChiTietTraHang_KV18112026-225958-816.xlsx`
- **Script áp dụng:** `scratch\apply_returns_fix.ps1`
- **Nghiệp vụ đã chuẩn hóa:**
  - `TH002961` (11/11): Đơn HD578374, khách trả Que thử thai Medstand Test (giá vốn = 0, hoàn tiền 20.000đ).
  - `TH002962` (14/11): Trả hàng tổng hợp (Flumetholon + Sanlein), hoàn tiền 108.000đ, giá vốn 100.967,05đ.
  - `TH002960` (06/11): Trả hàng tổng hợp (Dạ dày Khang Vị), hoàn tiền 120.000đ, giá vốn 75.000đ.
  - `TH002959` (06/11): Đơn HD578008, Flustad 75 (giá vốn 142.106đ, hoàn tiền 250.000đ).
  - Đã cập nhật `returnCost` và `returnedItems` chính xác trong sổ quỹ `vouchers_2026.json`.
  - Tổng số đơn sau khi bổ sung đơn trả tổng hợp: **13.312** đơn.

---

## Bước 10 — Khởi Động Server & Kiểm Thử Backend

```powershell
# Tạo mốc db_counts.json
# Khởi động server
cmd.exe /c "f:\MedicaPharmacy\Start-App.bat"

# Chạy bộ test backend
powershell -NoProfile -ExecutionPolicy Bypass -File "F:\MedicaPharmacy\tests\test-backend-suite.ps1"
```

---

## Bước 11 — Import Bổ Sung Hóa Đơn Tháng 9 & Tháng 10

- **File nguồn:** `imports\DanhSachChiTietHoaDon_KV20112026-000611-006.xlsx`
- **Khoảng thời gian:** `01/09/2026` đến `31/10/2026`
- **Script:** `scripts\do_import_additional_orders.ps1`

```powershell
$scriptContent = [System.IO.File]::ReadAllText("F:\MedicaPharmacy\scripts\do_import_additional_orders.ps1", [System.Text.Encoding]::UTF8)
& ([ScriptBlock]::Create($scriptContent)) -xlsxFile "DanhSachChiTietHoaDon_KV20112026-000611-006.xlsx" -projectDir "F:\MedicaPharmacy"

# Khởi động lại server và chạy test
cmd.exe /c "f:\MedicaPharmacy\Start-App.bat"
powershell -NoProfile -ExecutionPolicy Bypass -File "F:\MedicaPharmacy\tests\test-backend-suite.ps1"
```
- **Kết quả:** Đã import bổ sung thành công **3.090** hóa đơn duy nhất (0 trùng lặp).
- Tổng số hóa đơn bán lẻ trong hệ thống tăng từ 13.312 lên **16.402** đơn.

---

## Bước 12 — Đóng Gói Bộ Cài Đặt Standalone (.exe) Mới Nhất

- **Mục tiêu:** Build lại `MedicaServer.exe` (đã bỏ xác thực bản quyền `_isLicensed = true`, tích hợp bảo vệ dữ liệu 2 lớp) và đóng gói trọn gói vào file cài đặt `MedicaPharmacy_Setup.exe`.
- **Script:** `build-installer.ps1`

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File "F:\MedicaPharmacy\build-installer.ps1"
```
- **Kết quả đóng gói:**
  - `MedicaServer.exe`: Đã biên dịch mới nhất từ mã nguồn C#.
  - `MedicaPharmacy_Setup.exe` (14.93 MB): File cài đặt độc lập duy nhất. Khi cài đặt trên máy mới, phần mềm tự động giải nén, cấu hình tên miền `medica.com`, mở tường lửa, tạo shortcut và khởi động ngay mà không yêu cầu nhập key/license.

---

## Tổng Kết Dữ Liệu Sau Khi Hoàn Thành

| Danh mục | File lưu trữ | Số bản ghi | Trạng thái |
|---|---|---|---|
| Thuốc & Tồn kho | `data\medicines.json` | **5.844** | ✅ Hoàn tất |
| Khách hàng | `data\customers.json` | **2.656** | ✅ Hoàn tất |
| Nhà cung cấp | `data\suppliers.json` | **386** | ✅ Hoàn tất |
| Hóa đơn bán lẻ | `data\orders_2026.json` | **16.402** | ✅ Hoàn tất (Đầy đủ cả năm, gồm tháng 9, 10) |
| Phiếu nhập kho | `data\stockin_2026.json` | **717** | ✅ Hoàn tất |
| Phiếu xuất trả NCC | `data\returns_2026.json` | **141** | ✅ Hoàn tất |
| Sổ quỹ thu/chi | `data\vouchers_2026.json` | **18.089** | ✅ Hoàn tất (CK + TM) |
| Cài đặt | `data\settings.json` | 1 object | ✅ Sẵn sàng |
| Bản quyền & Domain | `license.key`, `remote_domain.txt` | 2 file | ✅ Đã bảo toàn |
| Thư mục sao lưu `data/backups/` | - | Đã dọn sạch | ✅ Sạch hoàn toàn |

**Kết quả Backend Test Suite: 12/12 ĐẠT (0 Thất Bại).**
Server hiện đang chạy ổn định tại port 80 (`http://medica.com` hoặc `http://localhost`).
