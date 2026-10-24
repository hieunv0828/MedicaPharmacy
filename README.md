# 🏥 MedicaPharmacy - Hệ Thống Quản Lý Nhà Thuốc Chuẩn GPP

Phần mềm chuyên nghiệp dành cho quầy thuốc và nhà thuốc tư nhân chuẩn GPP:
- **Quản lý Nhập thuốc & Tồn kho**: Theo dõi số lô, hạn sử dụng, định mức tồn kho, cảnh báo thuốc sắp hết hạn & hết hàng.
- **Bán thuốc tại quầy (POS)**: Tìm kiếm tức thì, quét mã vạch, quy đổi đơn vị (Hộp / Vỉ / Viên), hướng dẫn liều dùng cho bệnh nhân.
- **Xuất hóa đơn in nhiệt K80 (80mm) & K58 (58mm)**: Chuẩn định dạng hóa đơn nhà thuốc bán lẻ, in 1-click hoặc lưu đơn không in.
- **Tách biệt Đơn Tiền Mặt & Đơn Chuyển Khoản**: Tích hợp tự động sinh mã **VietQR** động (chuẩn Napas 247) theo số tiền từng đơn hàng.
- **Tổng hợp Doanh số theo tháng**: Báo cáo chi tiết theo ngày, biểu đồ phân tích tỷ trọng Tiền mặt vs Chuyển khoản, lợi nhuận gộp và xuất file Microsoft Excel (UTF-8 BOM không lỗi font).

---

## 🚀 Cách Khởi Động & Truy Cập `http://medica.com`

### 1. Cấu hình tên miền `http://medica.com` (Chỉ cần làm 1 lần duy nhất)
- Nhấp chuột phải vào file [**`Setup-Domain-Medica.bat`**](file:///f:/MedicaPharmacy/Setup-Domain-Medica.bat) $\rightarrow$ Chọn **"Run as administrator"** (Chạy với quyền Quản trị viên).
- File sẽ tự động gán tên miền `medica.com` về máy tính của bạn và mở cổng mạng Wifi nội bộ.

### 2. Khởi động phần mềm hàng ngày (Chạy ngầm 100% không hiện cửa sổ đen)
- Nhấp đúp chuột vào file [**`Start-App.bat`**](file:///f:/MedicaPharmacy/Start-App.bat) hoặc [**`MedicaServer.exe`**](file:///f:/MedicaPharmacy/MedicaServer.exe).
- **Hoàn toàn không có cửa sổ đen nào làm phiền bạn!**
- Máy chủ sẽ chạy êm ru dưới **Khay hệ thống (System Tray)** ở góc dưới bên phải màn hình (cạnh đồng hồ Windows) với icon chữ thập xanh `[+]`.
- Trình duyệt web sẽ tự động mở lên địa chỉ: **`http://medica.com`**
- Khi nhấp chuột phải vào icon ở khay hệ thống, bạn có thể:
  - 🌐 Mở lại giao diện web bán thuốc bất cứ lúc nào.
  - 📱 Xem nhanh IP kết nối điện thoại.
  - 🚀 Bật tùy chọn **"Tự Động Chạy Cùng Windows"** (Mỗi sáng bật máy tính lên là phần mềm tự chạy ngầm luôn, không cần bấm gì cả!).
  - ❌ Tắt máy chủ khi cần.

### 3. Truy Cập Từ Xa Qua Internet (4G / Ở Nhà) - Miễn Phí 100% (1-Click)
- **Không cần tạo tài khoản, không cần cấu hình phức tạp**:
  1. Nhấp đúp chuột vào file [**`Ket-Noi-Internet-1Click.bat`**](file:///f:/MedicaPharmacy/Ket-Noi-Internet-1Click.bat).
  2. Màn hình sẽ tự động cấp một đường link HTTPS bảo mật (ví dụ: `https://xxxx.trycloudflare.com`) và **tự động Copy sẵn vào bộ nhớ tạm**.
  3. Bạn chỉ cần mở Zalo/Tin nhắn bấm **Dán (Ctrl+V)** rồi gửi sang điện thoại mở lên là xem được toàn bộ doanh số từ xa!
  4. Giữ nguyên cửa sổ đó khi bạn đang xem từ xa; khi nào không xem nữa chỉ cần nhấn Enter để tắt.

### 4. Kết nối từ máy khác (hoặc iPad / Điện thoại) chung Wifi nội bộ:
- Trên máy tính phụ hoặc điện thoại của nhân viên, mở trình duyệt gõ:
  - `http://192.168.10.100` (hoặc địa chỉ IP hiển thị trên cửa sổ đen của máy chủ).
- Tất cả các máy đều dùng **CHUNG 1 DỮ LIỆU THỜI GIAN THỰC** lưu tại file `data/database.json`. Khi máy A bán thuốc, máy B sẽ thấy tồn kho giảm ngay lập tức!

---

## 📋 Hướng Dẫn Sử Dụng Các Tính Năng Chính

### 1. 🛒 Bán Thuốc Tại Quầy (POS)
- **Tìm thuốc nhanh**: Nhập tên thuốc, hoạt chất hoặc quét mã vạch barcode tại ô tìm kiếm (Phím tắt: **F2**).
- **Chọn đơn vị bán**: Hỗ trợ linh hoạt **Hộp**, **Vỉ**, **Viên/Gói/Chai**; đơn giá và tồn kho tự động quy đổi tương ứng.
- **Ghi chú liều dùng**: Nhập hướng dẫn sử dụng cho bệnh nhân (ví dụ: *Uống 1 viên sau ăn sáng-chiều*), thông tin này sẽ in trực tiếp lên hóa đơn cho bệnh nhân xem.
- **Thanh toán Tiền mặt (Cash)**:
  - Nhập số tiền khách đưa hoặc chọn nhanh mệnh giá (50k, 100k, 200k, 500k, Đúng số tiền).
  - Hệ thống tự động tính chính xác số tiền thối lại cho khách.
- **Thanh toán Chuyển khoản (VietQR)**:
  - Hệ thống tự động hiển thị **Mã VietQR động** chứa chính xác số tiền của đơn hàng và cú pháp nội dung chuyển khoản.
  - Khách chỉ cần mở App ngân hàng (Vietcombank, MB, Techcombank, BIDV, v.v.) quét mã là xong.
- **Thanh toán & In hóa đơn (Phím tắt: F4)**:
  - Bấm **"THANH TOÁN & IN HÓA ĐƠN"** để lưu đơn và in ra máy in hóa đơn nhiệt.
  - Hoặc chọn **"Chỉ lưu đơn"** nếu khách không cần bill giấy.

### 2. 🧾 Quản Lý Hóa Đơn & Lưu Trữ Riêng Biệt
- Hệ thống chia thành 3 Tab chuyên biệt:
  - **Tất Cả Đơn Hàng**: Xem toàn bộ lịch sử bán hàng.
  - **Đơn Tiền Mặt**: Theo dõi riêng các đơn thu tiền mặt, tổng tiền mặt thực thu trong ngày/tháng.
  - **Đơn Chuyển Khoản**: Theo dõi riêng các đơn thanh toán qua VietQR, mã giao dịch ngân hàng và đối soát tài khoản.
- Xem lại chi tiết đơn thuốc, **In lại bill nhiệt K80/K58** bất kỳ lúc nào.
- Hỗ trợ **Hủy đơn hàng** và hoàn trả lại số lượng thuốc vào tồn kho nếu thao tác nhầm hoặc khách trả thuốc.
- Xuất danh sách đơn ra file **Excel (.CSV UTF-8 BOM)**.

### 3. 📦 Quản Lý Kho & Danh Mục Thuốc GPP
- Xem danh mục thuốc với đầy đủ thông tin: Tên thuốc, hoạt chất, nhóm dược lý, số lô, hạn sử dụng, tồn kho quy đổi, giá vốn, giá bán lẻ.
- Tự động hiển thị các nhãn cảnh báo:
  - 🔴 **Đã hết hạn / 🟡 Sắp hết hạn** (Dưới 90 ngày).
  - 🔴 **Hết hàng / 🟡 Sắp hết hàng** (Dưới mức tồn tối thiểu).
- Bộ lọc nhanh theo Nhóm thuốc, Tình trạng tồn kho, Tình trạng hạn sử dụng.
- Thêm mới, sửa thông tin thuốc, thiết lập tỷ lệ quy đổi (Ví dụ: 1 Hộp = 10 Vỉ = 100 Viên).
- Xuất toàn bộ danh mục tồn kho ra Excel.

### 4. 📥 Quản Lý Nhập Thuốc Từ Nhà Cung Cấp
- Lập **Phiếu nhập kho**: Chọn nhà cung cấp (DHG Pharma, Traphaco, Sanofi, v.v.), nhập ngày nhập, ghi chú.
- Thêm nhiều loại thuốc vào phiếu: Cập nhật số lô mới, hạn sử dụng mới, số lượng và đơn giá vốn nhập.
- Khi bấm **"Hoàn Tất Nhập Kho"**, hệ thống sẽ **tự động cộng dồn số lượng tồn kho** và cập nhật giá vốn của thuốc trong kho.
- Xem lại lịch sử các phiếu nhập hàng đã thực hiện.

### 5. 📊 Tổng Hợp Doanh Số Theo Tháng
- Chọn **Tháng** và **Năm** cần xem báo cáo.
- Xem các chỉ số KPI then chốt:
  - **Tổng doanh thu tháng**.
  - **Doanh thu Tiền mặt** (số tiền & tỷ lệ %).
  - **Doanh thu Chuyển khoản VietQR** (số tiền & tỷ lệ %).
  - **Tổng tiền vốn nhập** & **Lợi nhuận gộp ước tính** (kèm tỷ suất lợi nhuận %).
  - **Tổng số hóa đơn** & Giá trị trung bình trên mỗi hóa đơn.
- **Biểu đồ trực quan (Chart.js)**:
  - Biểu đồ diễn biến doanh số từng ngày trong tháng (phân tầng Tiền mặt & Chuyển khoản).
  - Biểu đồ tròn cơ cấu phương thức thanh toán.
  - Biểu đồ Top 5/10 thuốc bán chạy nhất trong tháng.
- Bảng kê chi tiết từng ngày trong tháng với dòng tổng kết tháng.
- Nút **"Xuất Excel Báo Cáo"** và **"In Báo Cáo Doanh Thu"**.

### 6. ⚙️ Cài Đặt Nhà Thuốc & Mã VietQR
- Tùy chỉnh Tên nhà thuốc, Số chứng chỉ GPP, Địa chỉ, Số điện thoại, Tên dược sĩ trực, Lời dặn dò chân trang hóa đơn.
- Chọn ngân hàng (hơn 30+ ngân hàng Việt Nam: MBBank, Vietcombank, Techcombank, BIDV, VPBank, ACB, v.v.), nhập số tài khoản và tên chủ tài khoản để tự động sinh mã VietQR.
- Chọn khổ in nhiệt mặc định: **K80 (80mm)** hoặc **K58 (58mm)**.

### 7. 💾 Sao Lưu & Phục Hồi Dữ Liệu (Backup & Restore)
- **Tải File Sao Lưu (.JSON)**: Tải file dữ liệu lưu về máy tính hoặc USB để phòng ngừa sự cố máy tính.
- **Phục Hồi Từ File**: Chọn file backup JSON để nạp lại toàn bộ dữ liệu trên máy tính mới một cách nhanh chóng.
- **Nạp Lại Dữ Liệu Mẫu (Demo)**: Khôi phục lại bộ dữ liệu 25+ loại thuốc thông dụng tại Việt Nam cùng các hóa đơn mẫu để thử nghiệm.

---

## ⌨️ Bảng Phím Tắt Tiện Dụng Tại Quầy

| Phím Tắt | Chức Năng |
| :--- | :--- |
| **F2** | Đưa con trỏ nhanh vào ô tìm kiếm thuốc / quét mã vạch |
| **F4** | Thanh toán nhanh & In hóa đơn nhiệt |
| **Esc** | Đóng popup / Đóng cửa sổ xem trước hóa đơn |

---

## 📁 Cấu Trúc Mã Nguồn

```
f:\MedicaPharmacy\
├── index.html              # Giao diện chính Single Page Application
├── Start-App.bat           # File khởi chạy nhanh trên Windows
├── README.md               # Tài liệu hướng dẫn sử dụng
├── css/
│   ├── app.css             # Giao diện y tế chuẩn GPP, typography
│   └── print.css           # Định dạng in nhiệt K80 và K58
├── js/
│   ├── app.js              # Điều phối ứng dụng & Cài đặt
│   ├── vietqr.js           # Xử lý tạo mã VietQR Napas 247
│   ├── sample-data.js      # Danh mục 25+ loại thuốc Việt Nam & dữ liệu mẫu
│   ├── store.js            # Cơ sở dữ liệu cục bộ LocalStorage / IndexedDB
│   ├── pos.js              # Bán hàng tại quầy, tính tiền thối & in bill
│   ├── inventory.js        # Quản lý kho thuốc, hạn dùng & nhập hàng
│   ├── orders.js           # Phân loại đơn Tiền mặt vs Chuyển khoản
│   ├── reports.js          # Tổng hợp doanh số tháng & Biểu đồ Chart.js
│   └── export-excel.js     # Xuất báo cáo Excel UTF-8 BOM
└── vendor/
    ├── tailwind.js         # Tailwind CSS Engine offline
    ├── lucide.min.js       # Bộ icon y tế
    ├── chart.min.js        # Thư viện biểu đồ doanh thu
    └── qrcode.min.js       # Bộ sinh mã QR offline
```

*Phát triển bởi đội ngũ kỹ thuật y tế MedicaPharmacy • 2026*

