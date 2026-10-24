/**
 * MedicaPharmacy - Export Excel & CSV Module
 * Hỗ trợ xuất file báo cáo tương thích 100% với Microsoft Excel (UTF-8 with BOM)
 */

const ExportService = {
    /**
     * Tải về file CSV kèm UTF-8 BOM để Excel hiển thị đúng tiếng Việt có dấu
     * @param {string} content
     * @param {string} filename
     */
    downloadCsv(content, filename) {
        // UTF-8 BOM: \uFEFF
        const blob = new Blob(['\uFEFF' + content], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', filename);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    },

    // Hàm escape ký tự đặc biệt trong CSV
    csvCell(val) {
        if (val === null || val === undefined) return '""';
        let str = String(val).replace(/"/g, '""');
        return `"${str}"`;
    },

    /**
     * Xuất Báo Cáo Doanh Số Theo Tháng
     * @param {number} month (1-12)
     * @param {number} year
     * @param {Object} reportData
     */
    exportMonthlyRevenue(month, year, reportData) {
        const lines = [];
        const settings = Store.getSettings();

        lines.push(`${this.csvCell(settings.pharmacyName || 'NHÀ THUỐC MEDICA')}`);
        lines.push(`${this.csvCell('BÁO CÁO TỔNG HỢP DOANH SỐ BÁN THUỐC THÁNG ' + month + '/' + year)}`);
        lines.push(`${this.csvCell('Ngày xuất báo cáo: ' + AppUtils.formatDateTime(new Date()))}`);
        lines.push('');

        // Tóm tắt chỉ số
        lines.push(`${this.csvCell('CHỈ SỐ TỔNG QUAN')},${this.csvCell('GIÁ TRỊ')}`);
        lines.push(`${this.csvCell('Tổng Doanh Thu')},${this.csvCell(reportData.totalRevenue)}`);
        lines.push(`${this.csvCell('Doanh Thu Tiền Mặt (Cash)')},${this.csvCell(reportData.cashRevenue)}`);
        lines.push(`${this.csvCell('Doanh Thu Chuyển Khoản (Bank Transfer)')},${this.csvCell(reportData.transferRevenue)}`);
        lines.push(`${this.csvCell('Tổng Tiền Vốn')},${this.csvCell(reportData.totalCost)}`);
        lines.push(`${this.csvCell('Lợi Nhuận Gộp Ước Tính')},${this.csvCell(reportData.grossProfit)}`);
        lines.push(`${this.csvCell('Tỷ Suất Lợi Nhuận Gộp')},${this.csvCell(reportData.profitMargin + '%')}`);
        lines.push(`${this.csvCell('Tổng Số Đơn Hàng')},${this.csvCell(reportData.totalOrders)}`);
        lines.push(`${this.csvCell('Số Đơn Tiền Mặt')},${this.csvCell(reportData.cashOrdersCount)}`);
        lines.push(`${this.csvCell('Số Đơn Chuyển Khoản')},${this.csvCell(reportData.transferOrdersCount)}`);
        lines.push('');

        // Bảng chi tiết từng ngày trong tháng
        lines.push(`${this.csvCell('CHI TIẾT DOANH THU THEO TỪNG NGÀY TRONG THÁNG ' + month + '/' + year)}`);
        lines.push([
            this.csvCell('Ngày'),
            this.csvCell('Số Đơn'),
            this.csvCell('Doanh Thu Tiền Mặt (đ)'),
            this.csvCell('Doanh Thu Chuyển Khoản (đ)'),
            this.csvCell('Tổng Doanh Thu Ngày (đ)'),
            this.csvCell('Tiền Vốn (đ)'),
            this.csvCell('Lợi Nhuận Gộp (đ)')
        ].join(','));

        if (reportData.dailyBreakdown && reportData.dailyBreakdown.length > 0) {
            reportData.dailyBreakdown.forEach(row => {
                lines.push([
                    this.csvCell(row.dateStr),
                    this.csvCell(row.orderCount),
                    this.csvCell(row.cashRevenue),
                    this.csvCell(row.transferRevenue),
                    this.csvCell(row.totalRevenue),
                    this.csvCell(row.totalCost),
                    this.csvCell(row.profit)
                ].join(','));
            });
        }

        lines.push('');
        // Top 10 Thuốc Bán Chạy
        lines.push(`${this.csvCell('TOP THUỐC BÁN CHẠY TRONG THÁNG')}`);
        lines.push([
            this.csvCell('Mã Thuốc'),
            this.csvCell('Tên Thuốc'),
            this.csvCell('Số Lượng Bán'),
            this.csvCell('Tổng Tiền Bán (đ)')
        ].join(','));

        if (reportData.topMedicines && reportData.topMedicines.length > 0) {
            reportData.topMedicines.forEach(m => {
                lines.push([
                    this.csvCell(m.id),
                    this.csvCell(m.name),
                    this.csvCell(m.totalQty + ' ' + m.unit),
                    this.csvCell(m.totalAmount)
                ].join(','));
            });
        }

        const csvContent = lines.join('\r\n');
        const filename = `Bao_Cao_Doanh_So_Thang_${String(month).padStart(2, '0')}_${year}.csv`;
        this.downloadCsv(csvContent, filename);
    },

    /**
     * Xuất danh sách đơn hàng
     * @param {Array} orders
     * @param {string} filterType ('all' | 'cash' | 'transfer')
     */
    exportOrders(orders, filterType = 'all') {
        const lines = [];
        const typeName = filterType === 'cash' ? 'DON_TIEN_MAT' : filterType === 'transfer' ? 'DON_CHUYEN_KHOAN' : 'TAT_CA_DON';
        
        lines.push([
            this.csvCell('Mã Hóa Đơn'),
            this.csvCell('Ngày Giờ'),
            this.csvCell('Hình Thức'),
            this.csvCell('Tên Khách Hàng'),
            this.csvCell('SĐT Khách'),
            this.csvCell('Điểm Tích Lũy'),
            this.csvCell('Dược Sĩ'),
            this.csvCell('Tổng Tiền Hàng (đ)'),
            this.csvCell('Giảm Giá (đ)'),
            this.csvCell('Khách Thanh Toán (đ)'),
            this.csvCell('Tiền Khách Đưa (đ)'),
            this.csvCell('Tiền Thừa Trả (đ)'),
            this.csvCell('Mã GD Chuyển Khoản'),
            this.csvCell('Trạng Thái'),
            this.csvCell('Chi Tiết Thuốc Bán')
        ].join(','));

        orders.forEach(o => {
            const itemsSummary = (o.items || []).map(i => `${i.medicineName} (${i.quantity} ${i.unit})`).join('; ');
            const methodLabel = o.paymentMethod === 'cash' ? 'Tiền mặt' : 'Chuyển khoản (VietQR)';
            const statusLabel = o.isCancelled ? 'ĐÃ HỦY' : 'Thành công';

            lines.push([
                this.csvCell(o.id),
                this.csvCell(AppUtils.formatDateTime(o.createdAt)),
                this.csvCell(methodLabel),
                this.csvCell(o.customerName || 'Khách vãng lai'),
                this.csvCell(o.customerPhone || ''),
                this.csvCell(o.pointsEarned || 0),
                this.csvCell(o.pharmacist || ''),
                this.csvCell(o.subTotal || 0),
                this.csvCell(o.discount || 0),
                this.csvCell(o.totalAmount || 0),
                this.csvCell(o.customerCash || 0),
                this.csvCell(o.changeAmount || 0),
                this.csvCell(o.transferCode || ''),
                this.csvCell(statusLabel),
                this.csvCell(itemsSummary)
            ].join(','));
        });

        const csvContent = lines.join('\r\n');
        const filename = `Danh_Sach_Hoa_Don_${typeName}_${Date.now()}.csv`;
        this.downloadCsv(csvContent, filename);
    },

    /**
     * Xuất danh mục tồn kho thuốc
     * @param {Array} medicines
     */
    exportInventory(medicines) {
        const lines = [];
        lines.push([
            this.csvCell('Mã Thuốc'),
            this.csvCell('Mã Vạch'),
            this.csvCell('Tên Thuốc'),
            this.csvCell('Hoạt Chất'),
            this.csvCell('Nhóm Dược Lý'),
            this.csvCell('Đơn Vị Cơ Bản'),
            this.csvCell('Đơn Vị Đóng Gói'),
            this.csvCell('Tồn Kho Hiện Tại'),
            this.csvCell('Định Mức Tồn Tối Thiểu'),
            this.csvCell('Giá Nhập Hộp (đ)'),
            this.csvCell('Giá Bán Hộp (đ)'),
            this.csvCell('Số Lô'),
            this.csvCell('Hạn Sử Dụng'),
            this.csvCell('Trạng Thái Tồn'),
            this.csvCell('Trạng Thái Hạn Dùng')
        ].join(','));

        medicines.forEach(m => {
            const stockStatus = AppUtils.checkStockStatus(m).label;
            const expiryStatus = AppUtils.checkExpiryStatus(m.expiryDate).label;
            const stockDisplay = AppUtils.formatStockUnitsDisplay(m);

            lines.push([
                this.csvCell(m.id),
                this.csvCell(m.barcode || ''),
                this.csvCell(m.name),
                this.csvCell(m.activeIngredient || ''),
                this.csvCell(m.category || ''),
                this.csvCell(m.baseUnit || ''),
                this.csvCell(m.packUnit || ''),
                this.csvCell(stockDisplay),
                this.csvCell(m.minStock || 0),
                this.csvCell(m.costPrice || 0),
                this.csvCell(m.priceBox || 0),
                this.csvCell(m.batchNo || ''),
                this.csvCell(AppUtils.formatDate(m.expiryDate)),
                this.csvCell(stockStatus),
                this.csvCell(expiryStatus)
            ].join(','));
        });

        const csvContent = lines.join('\r\n');
        const filename = `Ton_Kho_Nha_Thuoc_${Date.now()}.csv`;
        this.downloadCsv(csvContent, filename);
    },

    /**
     * Xuất danh sách khách hàng & Điểm tích lũy
     * @param {Array} customers
     */
    exportCustomers(customers) {
        const lines = [];
        lines.push(this.csvCell('BÁO CÁO DANH SÁCH KHÁCH HÀNG & ĐIỂM TÍCH LŨY'));
        lines.push(this.csvCell(`Ngày xuất: ${AppUtils.formatDateTime(new Date())}`));
        lines.push(this.csvCell('Quy tắc tích điểm: 100.000đ = +1 điểm'));
        lines.push('');

        lines.push([
            this.csvCell('Mã KH'),
            this.csvCell('Tên Khách Hàng'),
            this.csvCell('Số Điện Thoại'),
            this.csvCell('Điểm Tích Lũy'),
            this.csvCell('Hạng Thành Viên'),
            this.csvCell('Tổng Chi Tiêu (đ)'),
            this.csvCell('Số Đơn Đã Mua'),
            this.csvCell('Lần Mua Gần Nhất'),
            this.csvCell('Ngày Tạo')
        ].join(','));

        customers.forEach(c => {
            const tier = Store.getCustomerTier(c.points || 0);
            lines.push([
                this.csvCell(c.id || ''),
                this.csvCell(c.name || ''),
                this.csvCell(c.phone || ''),
                this.csvCell(c.points || 0),
                this.csvCell(tier.name),
                this.csvCell(c.totalSpent || 0),
                this.csvCell(c.ordersCount || 0),
                this.csvCell(AppUtils.formatDateTime(c.lastVisit)),
                this.csvCell(AppUtils.formatDateTime(c.createdAt))
            ].join(','));
        });

        const csvContent = lines.join('\r\n');
        const filename = `Khach_Hang_Tich_Diem_${Date.now()}.csv`;
        this.downloadCsv(csvContent, filename);
    }
};

window.ExportService = ExportService;

