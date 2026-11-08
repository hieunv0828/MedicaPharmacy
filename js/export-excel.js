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

        // Tự động ghi nhật ký thao tác (Audit Log)
        if (window.Store && typeof Store.logAction === 'function') {
            let feat = 'Xuất file';
            if (filename.includes('ChiTietHoaDon') || filename.includes('HoaDon')) feat = 'Hóa đơn';
            else if (filename.includes('SoQuy') || filename.includes('ThuChi')) feat = 'Sổ quỹ';
            else if (filename.includes('SanPham') || filename.includes('KhoThuoc') || filename.includes('TonKho')) feat = 'Danh mục hàng hóa';
            else if (filename.includes('KhachHang')) feat = 'Khách hàng';
            else if (filename.includes('DoanhSo') || filename.includes('BaoCao')) feat = 'Báo cáo';
            else if (filename.includes('LichSuThaoTac')) feat = 'Lịch sử thao tác';
            Store.logAction(feat, `Xuất file ${filename}`, (window.AuthModule ? AuthModule.getCurrentUser()?.fullName : null) || 'ADMIN', 'export');
        }
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
        if (window.AuthModule && !AuthModule.canAccessTab('reports')) {
            if (window.AppUtils && AppUtils.showToast) {
                AppUtils.showToast('Bạn không có quyền xuất báo cáo tài chính!', 'warning');
            }
            return;
        }
        const lines = [];
        const settings = Store.getSettings();

        lines.push(`${this.csvCell(settings.pharmacyName || 'NHÀ THUỐC MEDICA')}`);
        lines.push(`${this.csvCell('BÁO CÁO TỔNG HỢP DOANH SỐ BÁN THUỐC THÁNG ' + month + '/' + year)}`);
        lines.push(`${this.csvCell('Ngày xuất báo cáo: ' + AppUtils.formatDateTime(new Date()))}`);
        lines.push('');

        // Tóm tắt chỉ số
        lines.push(`${this.csvCell('CHỈ SỐ TỔNG QUAN')},${this.csvCell('GIÁ TRỊ')}`);
        lines.push(`${this.csvCell('Tổng Doanh Thu Bán Ra (Gross)')},${this.csvCell(reportData.grossRevenue || reportData.totalRevenue)}`);
        if (reportData.totalCustomerRefund > 0) {
            lines.push(`${this.csvCell('Tiền Khách Trả Hàng Hoàn Lại (Returns)')},${this.csvCell('-' + reportData.totalCustomerRefund)}`);
        }
        lines.push(`${this.csvCell('Doanh Thu Thuần (Net Revenue)')},${this.csvCell(reportData.totalRevenue)}`);
        lines.push(`${this.csvCell('Doanh Thu Tiền Mặt (Cash)')},${this.csvCell(reportData.cashRevenue)}`);
        lines.push(`${this.csvCell('Doanh Thu Chuyển Khoản (Bank Transfer)')},${this.csvCell(reportData.transferRevenue)}`);
        lines.push(`${this.csvCell('Tổng Tiền Vốn')},${this.csvCell(reportData.totalCost)}`);
        lines.push(`${this.csvCell('Lợi Nhuận Gộp')},${this.csvCell(reportData.grossProfit)}`);
        lines.push(`${this.csvCell('Tỷ Suất Lợi Nhuận Gộp')},${this.csvCell(reportData.profitMargin + '%')}`);
        lines.push(`${this.csvCell('Tổng Số Đơn Bán Hàng')},${this.csvCell(reportData.totalOrders)}`);
        if (reportData.customerRefundCount > 0) {
            lines.push(`${this.csvCell('Số Phiếu Khách Trả Hàng')},${this.csvCell(reportData.customerRefundCount)}`);
        }
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
        const isAdmin = !window.AuthModule || AuthModule.canViewCostPrice();
        
        const header = [
            this.csvCell('Mã Hóa Đơn'),
            this.csvCell('Ngày Giờ'),
            this.csvCell('Hình Thức'),
            this.csvCell('Tên Khách Hàng'),
            this.csvCell('SĐT Khách'),
            this.csvCell('Điểm Tích Lũy'),
            this.csvCell('Điểm Đã Dùng'),
            this.csvCell('Giảm Trừ Điểm (đ)'),
            this.csvCell('Dược Sĩ'),
            this.csvCell('Tổng Tiền Hàng (đ)'),
            this.csvCell('Giảm Giá (đ)'),
            this.csvCell('Khách Thanh Toán (đ)')
        ];

        if (isAdmin) {
            header.push(this.csvCell('Tổng Vốn (đ)'));
            header.push(this.csvCell('Lợi Nhuận (đ)'));
            header.push(this.csvCell('Tỷ Suất LN (%)'));
        }

        header.push(
            this.csvCell('Tiền Khách Đưa (đ)'),
            this.csvCell('Tiền Thừa Trả (đ)'),
            this.csvCell('Mã GD Chuyển Khoản'),
            this.csvCell('Trạng Thái'),
            this.csvCell('Chi Tiết Thuốc Bán')
        );

        lines.push(header.join(','));

        orders.forEach(o => {
            const isReturnOrder = !!(o.isReturn || o.orderType === 'return');
            const itemsSummary = (o.items || []).map(i => `${i.medicineName} (${i.quantity} ${i.unit})`).join('; ');
            let methodLabel = o.paymentMethod === 'cash' ? 'Tiền mặt' : 'Chuyển khoản (VietQR)';
            let statusLabel = o.isCancelled ? 'ĐÃ HỦY' : (o.returnStatus === 'fully_returned' ? 'ĐÃ TRẢ HẾT' : (o.returnStatus === 'partially_returned' ? 'TRẢ 1 PHẦN' : 'Thành công'));

            if (isReturnOrder) {
                methodLabel = o.paymentMethod === 'cash' ? 'Hoàn tiền mặt' : 'Hoàn chuyển khoản';
                statusLabel = 'ĐÃ HOÀN TRẢ';
            }

            const isCancelled = o.isCancelled;
            let netRevenue = 0;
            let orderCost = 0;
            let profit = 0;
            let profitMargin = 0;

            if (isReturnOrder) {
                const totalRefund = o.totalRefund || o.totalAmount || 0;
                const retCost = o.totalCost || 0;
                netRevenue = -totalRefund;
                orderCost = -retCost;
                profit = netRevenue - orderCost;
            } else {
                netRevenue = isCancelled ? 0 : Math.max(0, (o.totalAmount || 0) - (o.totalRefunded || 0));
                orderCost = (isAdmin && window.OrdersModule && OrdersModule.calculateOrderCost) ? OrdersModule.calculateOrderCost(o) : 0;
                profit = isCancelled ? 0 : (netRevenue - orderCost);
                profitMargin = (netRevenue > 0 && !isCancelled) ? ((profit / netRevenue) * 100).toFixed(1) : 0;
            }

            const row = [
                this.csvCell(o.id),
                this.csvCell(AppUtils.formatDateTime(o.createdAt)),
                this.csvCell(methodLabel),
                this.csvCell(o.customerName || 'Khách vãng lai'),
                this.csvCell(o.customerPhone || ''),
                this.csvCell(o.pointsEarned || 0),
                this.csvCell(o.pointsUsed || 0),
                this.csvCell(o.pointsDiscount || (o.pointsUsed ? o.pointsUsed * 1000 : 0)),
                this.csvCell(o.pharmacist || ''),
                this.csvCell(isReturnOrder ? -netRevenue : (o.subTotal || 0)),
                this.csvCell(o.discount || 0),
                this.csvCell(isReturnOrder ? netRevenue : (o.totalAmount || 0))
            ];

            if (isAdmin) {
                row.push(this.csvCell(isCancelled ? 0 : orderCost));
                row.push(this.csvCell(profit));
                row.push(this.csvCell(profitMargin + '%'));
            }

            row.push(
                this.csvCell(o.customerCash || 0),
                this.csvCell(o.changeAmount || 0),
                this.csvCell(o.transferCode || ''),
                this.csvCell(statusLabel),
                this.csvCell(itemsSummary)
            );

            lines.push(row.join(','));
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
        if (window.AuthModule && !AuthModule.canViewCostPrice()) {
            if (window.AppUtils && AppUtils.showToast) {
                AppUtils.showToast('Bạn không có quyền xuất dữ liệu kho thuốc!', 'warning');
            }
            return;
        }
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

