# AGENTS.md

Hướng dẫn cho AI coding agent (và lập trình viên) khi làm việc trong repository **MedicaPharmacy**.

> Đọc kỹ mục **6. Quy tắc an toàn dữ liệu** trước khi chạy bất kỳ lệnh nào có thể ghi vào `data/`.

---

## 1. Tổng quan

MedicaPharmacy là phần mềm quản lý nhà thuốc GPP, chạy **offline trên Windows**, truy cập qua trình duyệt tại `http://medica.com` (hoặc IP LAN / tunnel).

- **Frontend**: SPA thuần — HTML + Tailwind (runtime, offline) + JavaScript ES6. Không framework, **không bundler, không `package.json`, không npm**.
- **Backend**: `MedicaServer.exe` — C# WinForms (.NET Framework 4.x), HTTP server tự viết trên `TcpListener`, không ASP.NET.
- **Dữ liệu**: file JSON trong `data/`, không SQL. Đơn bán / phiếu nhập / sổ quỹ / trả hàng được tách file theo năm.
- **Ngôn ngữ UI**: tiếng Việt. Code, tên biến, commit message dùng tiếng Việt không dấu hoặc tiếng Anh tùy chỗ — ưu tiên theo code xung quanh.
- **Mô hình vận hành thực tế**: **1 máy POS là nguồn ghi chính**; iPad/điện thoại thường chỉ xem báo cáo (nhưng UI hiện không chặn ghi).

---

## 2. Lệnh thường dùng

Chạy từ thư mục gốc `F:\MedicaPharmacy`.

```bat
:: Khởi động server (tray icon, mở browser)
Start-App.bat
:: hoặc
MedicaServer.exe

:: Tắt server + ngrok
Stop-Server.bat

:: Build lại server + keygen + bộ cài
build-installer.bat
:: hoặc
powershell -NoProfile -ExecutionPolicy Bypass -File build-installer.ps1

:: Test backend (server PHẢI đang chạy ở http://localhost)
powershell -NoProfile -ExecutionPolicy Bypass -File tests\test-backend-suite.ps1

:: Test frontend: mở bằng browser
:: http://localhost/tests/test-frontend-suite.html
```

- Compiler: `C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe` (`/platform:anycpu`).
- Server bind **port 80**, fallback **8080** nếu 80 bị chiếm.
- Không có bước build frontend. Sửa `js/*.js` hoặc `index.html` → tải lại trang (cache-busting bằng `?v=...` ở cuối `index.html`).
- Scripts trong `scripts/` là công cụ ETL một lần (KiotViet → JSON). Đọc phần đầu file trước khi chạy; nhiều script ghi trực tiếp vào `data/`.

---

## 3. Kiến trúc & luồng dữ liệu

```
Browser (index.html + js/*.js)
   │  GET  /api/database          → toàn bộ DB (tất cả các năm)
   │  POST /api/database          → ghi đè toàn bộ DB
   │  GET  /api/database/status   → {version, lastUpdated} (poll mỗi 8s)
   ▼
MedicaServer.exe (TcpListener, port 80/8080)
   │  static files + API
   ▼
data/*.json  (settings, medicines, suppliers, customers, audit_log,
             orders_<year>, stockin_<year>, vouchers_<year>, returns_<year>)
   │
   └── data/backups/backup_auto_<timestamp>/  (mỗi 4h, giữ 20 bản)
```

Điểm cốt lõi cần nhớ:

1. **Client không tải theo năm.** `/api/database` luôn gộp mọi partition năm thành 1 JSON.
2. **Mỗi thay đổi POST toàn bộ DB** (debounce 500 ms, hoặc `persistImmediately()` sau khi bán/nhập).
3. **Server ghi lại toàn bộ collection** mỗi lần nhận POST, rồi tách lại theo năm.
4. **Đồng bộ đa máy là last-write-wins**, không merge theo bản ghi. Chỉ có merge tạm cho các bản ghi < 5 phút khi *tải về*.
5. **Polling 8 giây chỉ áp dụng dữ liệu mới khi độ dài mảng thay đổi** — sửa giá/tồn/hủy đơn không lan sang máy khác.

---

## 4. Bản đồ mã nguồn

| Đường dẫn | Vai trò | Ghi chú |
|---|---|---|
| `index.html` | Toàn bộ UI, 8 section tab, modal | ~5.700 dòng; thêm tab phải sửa cả `section-*`, nút `data-tab`, và `App.switchTab` |
| `js/store.js` | Data layer + nghiệp vụ lõi + sync server + event bus | File quan trọng nhất; ~2.900 dòng |
| `js/app.js` | Controller: `App.init()`, `App.switchTab()`, settings, theme, backup | Gọi `init()` của mọi module |
| `js/pos.js` | Bán hàng, giỏ hàng, quy đổi đơn vị, điểm, VietQR, in bill | |
| `js/inventory.js` | Kho, nhập hàng, trả NCC, xuất hủy, lịch sử thuốc | File dài nhất (~4.600 dòng) |
| `js/orders.js` | Danh sách đơn, chi tiết, hủy, trả hàng, tái in | |
| `js/customers.js` | Khách hàng, điểm, lịch sử mua | |
| `js/vouchers.js` | Sổ quỹ thu/chi | |
| `js/reports.js` | Báo cáo tháng/năm/P&L, Chart.js, Excel | |
| `js/auth.js` | RBAC Admin/Staff, **hardcode tài khoản, chỉ ở client** | Không phải bảo mật thật |
| `js/audit-log.js` | Lịch sử thao tác (tối đa 500 bản ghi) | |
| `js/export-excel.js` | CSV UTF-8 BOM | |
| `js/barcode-printer.js` | In tem mã vạch (JsBarcode) | |
| `js/searchable-select.js` | Combobox tìm kiếm có/không dấu | |
| `js/vietqr.js` | Sinh QR Napas 247 offline | |
| `js/sample-data.js` | Dữ liệu demo | Không dùng để ghi đè server |
| `server/MedicaServer.cs` | HTTP server, tray icon, API, đọc/ghi JSON, backup | |
| `server/LicenseManager.cs` | Sinh/kiểm tra key theo machine code | **Đã ngừng dùng** (server luôn `_isLicensed = true`); vẫn **không đổi `SecretSalt`** |
| `installer/MedicaInstaller.cs` | Bộ cài WinForms, cấu hình hosts + firewall | |
| `tools/KeyGen.cs` | Công cụ sinh license key | |
| `css/app.css`, `css/print.css` | Theme GPP; định dạng in K80/K58 | |
| `vendor/` | Tailwind, Chart.js, Lucide, QRCode, JsBarcode, Mermaid | Thư viện offline, **không sửa** |
| `data/` | **DB thật** | Xem mục 6 |
| `scripts/` | Import/đối soát KiotViet | Chạy thủ công |
| `tests/` | Test suite frontend + backend | |

Thứ tự nạp script cuối `index.html` là dependency order:
`vietqr → sample-data → store → auth → export-excel → barcode-printer → searchable-select → vouchers → inventory → pos → orders → customers → reports → audit-log → app`.

---

## 5. Quy ước code

### Frontend
- Mỗi module là object toàn cục: `window.POSModule = POSModule;` … Không dùng ES module/import.
- Trong `index.html`, sự kiện inline gọi trực tiếp `App.switchTab(...)`, `POSModule.checkout()`, v.v.
- Truy cập dữ liệu **luôn qua `Store`**, không đọc `localStorage` trực tiếp trong module nghiệp vụ.
- Phát sự kiện sau khi đổi dữ liệu: `store.emit('orders:changed', ...)`; module khác lắng nghe bằng `Store.on(...)`.
- Escape HTML khi chèn dữ liệu người dùng: `AppUtils.escapeHtml(str)` hoặc `textContent`. Nhiều chỗ cũ vẫn dùng `innerHTML` trần — khi sửa, hãy escape.
- Định dạng tiền/ngày: `AppUtils.formatVND`, `formatDate`, `formatDateTime`, `formatNumber`.
- **Ngày giờ bản ghi mới**: dùng `Store.formatLocalISO()` (có `+07:00`) cho dữ liệu mới. Không dùng `new Date().toISOString()` cho `createdAt` (gây lệch báo cáo do UTC).
- UI tiếng Việt, class Tailwind trực tiếp trong HTML; icon dùng `lucide`.
- Không thêm thư viện ngoài nếu chưa có trong `vendor/` (app phải chạy offline).

### Backend
- .NET Framework 4.x, C# cũ (không nullable, không async/await trong server).
- API mới thêm vào `ProcessClient()` trong `MedicaServer.cs`, theo mẫu `rawUrl.Equals(...)`.
- Nếu thêm endpoint có query string: phải tự tách `?` khỏi `rawUrl` (code hiện tại so sánh chuỗi tuyệt đối).
- Ghi file JSON: dùng `WriteAtomicJson()` (tmp → replace), không `File.WriteAllText` trực tiếp.
- Mọi thao tác DB phải nằm trong `lock (_dbLock)`.
- Không làm hỏng `MigrateSingleDatabaseIfPresent()` (hỗ trợ DB cũ 1 file).

---

## 6. Quy tắc an toàn dữ liệu (BẮT BUỘC)

`data/` là dữ liệu thật của nhà thuốc, hiện ~16,5 MB / 16.300+ hóa đơn (2026: 16.354 đơn, 18.023 phiếu quỹ). **Không** commit, không xóa, không "reset" để test.

- **Không bao giờ** gọi `Store.resetToSampleData()` / `clearAllData()` khi đang ở server mode.
- **Không** chạy `import_*.ps1` khi chưa backup `data/` (các script này ghi đè cả file).
- **Không** sửa `data/*.json` bằng tay khi server đang chạy — server cache 2 giây và sẽ ghi đè.
- Trước khi thử nghiệm thao tác ghi: copy `data/` sang thư mục tạm, hoặc dùng bản backup trong `data/backups/`.
- `data/license.key`, `data/remote_domain.txt` là cấu hình máy — không xóa.
- `.gitignore` đã loại `data/backup_*`, `imports/*.xlsx`, `*.exe`, `*.log`. Không thêm các file này vào git.

### Trạng thái dữ liệu hiện tại cần biết
Dữ liệu **không sạch**; đừng giả định các bất biến sau là đúng:

- 2.655/2.656 khách hàng có **cùng `id = "Cá nhân"`**, `name` là tên chi nhánh, `phone` chứa tên người, `address` chứa số điện thoại (lỗi map cột khi import cũ). Hậu quả: sửa/xóa 1 khách có thể tác động cả danh bạ.
- Tất cả khách hàng có `points = 0`; chỉ 1 khách có `totalSpent`/`ordersCount`.
- 70 đơn có `sum(items) - discount ≠ totalAmount`; 76 phiếu thu lệch tiền so với đơn; 0 voucher mồ côi sau khi sync.
- **2 đơn đã trả hàng** (`HD578374` 20.000đ, `HD578008` 250.000đ) và mỗi đơn bị sinh **2 phiếu chi trùng** (xem mục 8.19) → sổ quỹ đang chi dư 270.000đ.
- Không có đơn `isCancelled`; nhánh hủy đơn chưa từng chạy thật.
- 4 đơn mới nhất (POS, 18/11) lưu `createdAt` dạng UTC `...Z`, toàn bộ phần còn lại dùng `+07:00` → chuỗi thời gian không đồng nhất.

---

## 7. Mô hình dữ liệu

`data/` (server trả về dạng object):

```
{
  settings, medicines, suppliers, customers,
  settingsHistory, auditLog,
  orders, stockInOrders, vouchers, purchaseReturns,
  version, lastUpdated
}
```

| Collection | File | Khóa | Trường chính |
|---|---|---|---|
| Cài đặt | `settings.json` | 1 object | `pharmacyName, gppCert, address, phone, pharmacist, bankBin, bankCode, bankName, accountNo, accountName, printFormat` |
| Thuốc | `medicines.json` | `id` (`SP…`) | `name, barcode, activeIngredient, category, baseUnit, packUnit, packRatio, subUnit, subRatio, costPrice, priceBox, priceSub, priceBase, stockUnits, minStock, batchNo, expiryDate` |
| Đơn bán | `orders_<year>.json` | `id` (`HD…`) | `customerId, customerName, customerPhone, paymentMethod (cash/transfer), items[], subTotal, discount, pointsUsed, pointsDiscount, totalAmount, customerCash, changeAmount, transferCode, isCancelled, returns[], totalRefunded, createdAt` |
| Nhập kho | `stockin_<year>.json` | `id` (`PN…`) | `supplierId, supplierName, items[], totalAmount, paymentMethod, status, returns[], totalRefunded` |
| Sổ quỹ | `vouchers_<year>.json` | `id` (`PT…`/`PC…`) | `type (receipt/payment), paymentMethod, category, targetType, targetName, amount, refId, isCancelled, createdAt` |
| Trả hàng | `returns_<year>.json` | `id` (`THN…`) | `type, stockInId, supplierName, items[], refundTotal, reason, status` |
| Khách hàng | `customers.json` | `id`/`phone` | `name, phone, address, points, totalSpent, ordersCount, note` |
| Nhà cung cấp | `suppliers.json` | `id` (`NCC…`) | `name, phone, address, email, taxCode, debt` |
| Audit | `audit_log.json` | `id` (`AUDIT…`) | `staff, feature, details, actionType, timestamp` |

Quan hệ chính:
- `order.items[].medicineId → medicines.id`
- `voucher.refId → orders.id` hoặc `stockin.id` hoặc `returns.id`
- `stockIn.items[].medicineId → medicines.id`
- `order.returns[].items[].medicineId → medicines.id`

Tồn kho `stockUnits` tính theo **đơn vị cơ bản** (`baseUnit`). `packRatio` = số baseUnit trong 1 `packUnit`; `subRatio` = số baseUnit trong 1 `subUnit`.

---

## 8. Bẫy logic đã biết (đừng "sửa mù")

1. **`safeSet` cắt dữ liệu localStorage**: chỉ giữ 2.000 thuốc / 100 đơn / 100 phiếu. Nếu server chưa tải xong mà người dùng thao tác, `getCurrentFullDatabase()` có thể gửi bản rút gọn và **ghi đè server**. Mọi thay đổi liên quan sync phải giữ nguyên hoặc tăng cường guard này.
2. **Guard chống ghi đè (đã có 2 lớp, đừng gỡ)**: client dùng `Store.ready`, `_loadedFromServer`, `_serverCounts`, `_ensureReadyForWrite()`, `_findAbnormalShrink()`; server dùng `CheckCountGuard()` + `data/db_counts.json` và trả **HTTP 409** `data_shrink_blocked`. Ngưỡng: giảm **> 20% và > 20 bản ghi**. Đường thoát hiểm khi thực sự cần thu gọn: header `X-Force-Shrink: true`.
3. **`App.init()` vẫn không `await Store.init()`** — bù lại mọi lần ghi đều đi qua `_ensureReadyForWrite()`. Nếu thêm luồng ghi mới, phải gọi hàm này (hoặc `persistImmediately()`), không `fetch` POST trực tiếp.
4. **`backgroundCheckServerSync`** giờ áp dụng dữ liệu khi **`version` đổi** (không còn phụ thuộc độ dài mảng), nhưng vẫn tải toàn bộ DB mỗi lần → iPad tải 16 MB mỗi khi POS ghi. Chỉ giảm được khi làm API theo năm.
5. **Hủy đơn hoàn kho toàn bộ** kể cả phần đã trả (`cancelOrder` vs `returnOrderItems`) → có thể cộng tồn 2 lần.
6. **Báo cáo trừ tiền trả hàng**: tháng / chi tiết ngày / P&L đều dùng chung `_collectRefundVouchers()` + `_returnCostOfVoucher()`. Hàm này tự loại phiếu chi trùng khi số phiếu > số lần trả hàng thực tế. Không quay lại trừ `order.totalRefunded` song song với phiếu chi (sẽ trừ 2 lần). P&L tính giá vốn theo **số lượng bán ra**, hàng trả trừ đúng một lần ở mục 2.2 (trước đây vừa trừ `returnedQty` vừa trừ `customerReturnCost`).
7. **`updateStockInOrder` không hoàn nguyên giá vốn cũ** khi sửa phiếu nhập → giá bình quân trôi.
8. **`updateStockUnits` kẹp `Math.max(0, …)`** → bán âm kho bị che.
9. **`saveCustomer`/`addPointsToCustomer`** sinh ID `KH + (length+1)` → trùng sau khi xóa.
10. **`deleteCustomer(id)` xóa mọi bản ghi cùng id** — với dữ liệu hiện tại là xóa toàn bộ khách "Cá nhân".
11. **ID chứng từ sinh bằng `countToday + 1`** → trùng khi nhiều nơi ghi; `THN/TH` dùng random 3 chữ số.
12. **Múi giờ**: dữ liệu POS cũ dùng `toISOString()` (UTC), báo cáo so prefix chuỗi → đơn 00:00–06:59 bị tính sang ngày/tháng trước.
13. **Thu tiền mặt thiếu vẫn ghi phiếu thu đủ**, không có công nợ.
14. **`totalSpent` chỉ tăng**, không giảm khi hủy/trả.
15. **Báo cáo lấy giá vốn hiện tại**, không phải giá vốn tại thời điểm bán → sửa giá nhập làm thay đổi lợi nhuận quá khứ.
16. **API không xác thực**, `Access-Control-Allow-Origin: *`, license luôn trả `true`. Không thêm endpoint ghi mà bỏ qua các ràng buộc hiện có; không mở thêm dữ liệu ra Internet.
17. **Không đổi `SecretSalt`** trong `LicenseManager.cs` — sẽ làm vô hiệu toàn bộ key đã phát hành.
18. **`README.md` lỗi thời** (thiếu customers, vouchers, returns, audit log, báo cáo năm/P&L; có nhắc IndexedDB nhưng code không dùng).
19. **Trả hàng từng sinh 2 phiếu chi trùng** (đã sửa 19/11): `returnOrderItems` tạo phiếu chi `refId = order.id`, `syncOrdersAndStockInsToVouchers()` tạo thêm `refId = RETURN_<returnId>`. Nay `sync...` đếm số phiếu đã có cho đơn (kể cả `TTTH…`) và chỉ tạo bổ sung khi thiếu. **Dữ liệu cũ vẫn còn 2 phiếu trùng**: `PC261111-295` (20.000đ, trùng `TTTH002961`) và `PC261106-667` (250.000đ, trùng `TTTH002959`) — báo cáo đã tự bỏ qua, nhưng sổ quỹ vẫn hiển thị; dọn bằng `scripts\clean_duplicate_refund_vouchers.ps1` (mặc định xem trước, `-Apply` mới ghi, tự backup).
20. **TDZ trong `reports.js`** (đã sửa): `grossCost`/`grossRevenue` nay khai báo trước khối xử lý phiếu trả hàng.
21. **Giá vốn trả hàng** (đã sửa): `returnOrderItems` lưu `returnCost`, `returnedItems`, `returnId` vào phiếu chi; báo cáo dùng `_returnCostOfVoucher()` theo thứ tự `returnCost` → `returnedItems` → `order.returns[]`, không còn đoán tỷ lệ 0,70; không xác định được thì ghi 0.
22. **`WriteAtomicJson` không còn atomic**: ghi `.tmp` → copy file cũ sang `.bak` → `File.Copy(tmp, path, true)`. Mỗi lần lưu gấp ~3 lần I/O và có thể để lại file dở dang nếu tắt máy giữa lúc copy. `InitDatabaseIfEmpty` khôi phục **toàn bộ** `*.json` từ snapshot cũ khi `medicines.json` rỗng → có thể lùi cả đơn hàng mới.
23. **`RunAutoBackup` copy cả `backup_medicines_*.json`** (1,9 MB/file rác ở `data/`) và giữ 20 bản → ~22,7 MB × 20 ≈ 450 MB. Backup chạy trong `lock (_dbLock)` nên chặn request trong lúc copy.
24. **`MedicaServer.exe` trong repo là bản build cũ** (11/11) so với `server/MedicaServer.cs`. Sửa server phải build lại (`build-installer.bat`) rồi khởi động lại thì mới có hiệu lực. Bản quyền đã bị bỏ kiểm tra (`_isLicensed = true`, `/api/license/*` luôn thành công) — `LicenseManager`/`KeyGen` chỉ còn là mã chết.
25. **`data/db_counts.json`** (mới): mốc đếm bản ghi do server ghi, đã thêm vào `.gitignore`. Xoá file này thì server tự đếm lại từ dữ liệu (chỉ chậm lần ghi đầu tiên).

---

## 9. Testing

- Backend suite yêu cầu server chạy: `powershell -File tests\test-backend-suite.ps1`. Kết quả ghi ra `tests/backend-test-results.json`.
- Frontend suite: mở `tests/test-frontend-suite.html` qua `http://localhost/...` để tránh CORS/file://.
- Khi sửa logic tiền/kho, **tự kiểm tra bằng dữ liệu copy**:
  ```
  copy data → temp
  chạy kịch bản
  so sánh tổng doanh thu, tổng tồn, số đơn trước/sau
  ```
- Không có test tự động cho `store.js`; nếu thêm hàm thuần (tính tiền, quy đổi đơn vị, điểm), nên thêm case vào frontend suite.

---

## 10. Git

- Branch chính: `main`, remote `origin`.
- Commit message tiếng Việt không dấu, theo mẫu đã dùng:
  ```
  feat: <mô tả ngắn>
  fix: <mô tả ngắn>
  feat(pos): ...
  fix(reports): ...
  ```
- Không commit: `*.exe`, `*.log`, `data/backup_*`, `imports/*.xlsx`, `installer/staging/`.
- Không format lại toàn bộ `index.html` / `store.js` trong một commit tính năng — diff sẽ không đọc được.
- Trước khi commit, kiểm tra `git status` vì `data/*.json` có thể đã bị server ghi trong lúc test.

---

## 11. Công thức thêm tính năng

### Thêm tab mới
1. `index.html`: thêm `<section id="section-<ten>" class="app-tab-section hidden ...">`.
2. Thêm nút `<button data-tab="<ten>" class="nav-tab-btn ...">` (desktop + mobile).
3. `js/app.js`: thêm nhánh trong `switchTab()` nếu cần render lazy.
4. Tạo `js/<ten>.js` theo mẫu `window.XModule = { init(), bindEvents(), render...() }`.
5. Nạp script trước `app.js`; gọi `XModule.init()` trong `App.init()`.
6. `js/auth.js`: cập nhật `canAccessTab()` nếu tab chỉ dành cho Admin.

### Thêm collection mới
1. `store.js`: thêm key vào `STORAGE_KEYS`, cache `_cachedX`, getter/setter, đưa vào `getCurrentFullDatabase()` và `saveToLocalCache()`.
2. `MedicaServer.cs`: thêm đọc trong `GetFullDatabaseJson()`, ghi trong `SaveFullDatabaseInternal()`; nếu là giao dịch theo thời gian → partition theo năm.
3. `scripts/` (nếu cần import) và backup/restore trong `exportBackupJSON` / `importBackupJSON`.

### Thêm API
1. `MedicaServer.cs` `ProcessClient()` — thêm nhánh trước phần static file.
2. Dùng `SendResponse(...)`, `lock (_dbLock)`, `WriteAtomicJson(...)`.
3. Cập nhật `README.md` nếu là API công khai.

---

## 12. Ưu tiên kỹ thuật đề xuất

Danh sách đầy đủ (P0→P3, kèm trạng thái) nằm ở **`docs/IMPROVEMENTS.md`**. Tóm tắt thứ tự:

**Đợt 1 — đã xong trong mã nguồn (19/11):**
1. Guard chống ghi đè 2 lớp (client `_ensureReadyForWrite`/`_findAbnormalShrink` + server `CheckCountGuard` → HTTP 409).
2. Trả hàng: hết sinh 2 phiếu chi, lưu `returnCost`/`returnedItems`/`returnId`.
3. `reports.js`: bỏ TDZ, bỏ fallback tỷ lệ 0,70, thống nhất `_collectRefundVouchers()` cho tháng/ngày/P&L.
4. Sync 8 giây áp dụng theo `version`.

**Đợt 1 — còn phải làm khi phát hành:**
- Build lại `MedicaServer.exe` + khởi động lại server.
- Dọn 2 phiếu chi trùng trong `data/vouchers_2026.json` (sau khi backup) bằng
  `scripts\clean_duplicate_refund_vouchers.ps1` (`-Apply`; tắt server trước).

**Đợt 2:**
5. `formatLocalISO()` cho mọi `createdAt` mới; sinh ID không dựa `countToday + 1`.
6. iPad/điện thoại: chế độ chỉ xem + server chỉ nhận POST từ máy POS chính.
7. `cancelOrder` sau trả một phần, `updateStockUnits` không kẹp 0, công nợ khi thu thiếu.

**Đợt 3:**
8. Sửa dữ liệu khách hàng (map cột + gộp bản ghi trùng) và logic sửa/xóa khách.
9. API theo năm (`?years=`), ghi theo bản ghi, archive năm cũ, `File.Replace` cho `WriteAtomicJson`.

**Đợt 4 (khi cần):** SQLite/LiteDB nếu DB vượt ~40–50 MB; xác thực API.

---

## 13. Definition of Done

- [ ] Thay đổi chạy được ở cả server mode (`http://`) và không làm hỏng chế độ `file://`.
- [ ] Không ghi đè / làm mất dữ liệu trong `data/`.
- [ ] Đã kiểm tra luồng: bán hàng → tồn kho → sổ quỹ → báo cáo.
- [ ] Đã kiểm tra đơn bị hủy/trả hàng nếu có đụng tới tiền/kho.
- [ ] Escape HTML cho dữ liệu người dùng mới.
- [ ] Dùng `formatLocalISO()` cho `createdAt` mới.
- [ ] Không thêm dependency mạng/bundler.
- [ ] `git status` sạch các file không liên quan.
