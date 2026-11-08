/**
 * MedicaPharmacy - Main Application Controller
 * Điều phối các module, thanh điều hướng chính, Cài đặt & Sao lưu dữ liệu
 */

const App = {
    currentTab: 'pos', // 'pos', 'inventory', 'stockin', 'orders', 'reports', 'settings'

    init() {
        console.log('🚀 Khởi động MedicaPharmacy...');
        
        // Khởi tạo hệ thống Phân Quyền Admin & Staff
        if (window.AuthModule) {
            AuthModule.init();
        }

        // Khởi tạo các module
        POSModule.init();
        InventoryModule.init();
        OrdersModule.init();
        if (window.CustomersModule) {
            CustomersModule.init();
            CustomersModule.renderSummaryCards();
            CustomersModule.renderCustomersTable();
        }
        if (window.VouchersModule) {
            VouchersModule.init();
        }
        if (window.BarcodePrinterModule) {
            BarcodePrinterModule.init();
        }
        ReportsModule.init();
        this.initSettingsModule();
        if (window.AuditLogModule) {
            AuditLogModule.init();
        }
        this.setupNavigation();

        // Khởi tạo các Combobox tìm kiếm thông minh
        if (window.SearchableSelect) {
            SearchableSelect.init('stockin-supplier', { richType: 'supplier', placeholder: '🔍 Tìm nhà cung cấp...' });
            SearchableSelect.init('stockin-medicine-select', { richType: 'medicine', placeholder: '🔍 Tìm tên thuốc cần nhập...' });
            SearchableSelect.init('med-supplier', { richType: 'supplier', placeholder: '🔍 Tìm nhà cung cấp...' });
            SearchableSelect.init('med-category', { richType: 'category', placeholder: '🔍 Tìm nhóm dược lý...' });
            SearchableSelect.init('voucher-input-category', { richType: 'category', placeholder: '🔍 Tìm loại thu / chi...' });
        }

        // Khởi tạo icons Lucide
        if (window.lucide) {
            lucide.createIcons();
        }

        // Tự động kiểm tra cảnh báo tồn kho và HSD khi khởi động
        this.checkStartupAlerts();
        this.updateHeaderPharmacist();
        Store.on('settings:changed', () => this.updateHeaderPharmacist());

        // Đồng bộ phân quyền sau khi các module khởi tạo xong
        if (window.AuthModule) {
            AuthModule.applyPermissions();
        }
    },

    updateHeaderPharmacist() {
        const settings = Store.getSettings();
        const headerPharm = document.getElementById('header-pharmacist');
        if (headerPharm && settings && settings.pharmacist) {
            headerPharm.innerText = settings.pharmacist.split('(')[0].trim();
        }
    },

    setupNavigation() {
        const navButtons = document.querySelectorAll('.nav-tab-btn');
        navButtons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const targetTab = btn.getAttribute('data-tab');
                this.switchTab(targetTab);
            });
        });
    },

    switchTab(tabId) {
        // Kiểm tra phân quyền truy cập tab
        if (window.AuthModule && !AuthModule.canAccessTab(tabId)) {
            if (!AuthModule.isAuthenticated()) {
                this.showToast('Vui lòng đăng nhập để sử dụng hệ thống.', 'warning');
                AuthModule.openLoginModal(true);
            } else {
                this.showToast('Bạn không có quyền truy cập mục này. Chỉ dành cho Quản Trị Viên (Admin).', 'error');
                if (this.currentTab !== 'pos') {
                    this.switchTab('pos');
                }
            }
            return;
        }

        this.currentTab = tabId;

        // Ẩn tất cả các view sections
        document.querySelectorAll('.app-tab-section').forEach(sec => {
            sec.classList.add('hidden');
        });

        // Hiển thị view được chọn
        const targetSection = document.getElementById(`section-${tabId}`);
        if (targetSection) {
            targetSection.classList.remove('hidden');
        }

        // Cập nhật trạng thái active của menu
        document.querySelectorAll('.nav-tab-btn').forEach(btn => {
            const btnTab = btn.getAttribute('data-tab');
            if (btnTab === tabId) {
                btn.classList.add('bg-emerald-700', 'text-white', 'shadow-sm');
                btn.classList.remove('text-slate-300', 'hover:bg-emerald-800/60');
            } else {
                btn.classList.remove('bg-emerald-700', 'text-white', 'shadow-sm');
                btn.classList.add('text-slate-300', 'hover:bg-emerald-800/60');
            }
        });

        // Kích hoạt lại icon và tính năng khi chuyển tab
        if (window.lucide) lucide.createIcons();

        if (tabId === 'pos') {
            document.getElementById('pos-search-input')?.focus();
        } else if (tabId === 'reports') {
            ReportsModule.loadMonthlyReport();
        } else if (tabId === 'orders') {
            OrdersModule.renderOrdersTable();
            OrdersModule.updateTabSummaryCards();
        } else if (tabId === 'inventory') {
            InventoryModule.renderMedicineTable();
            InventoryModule.updateInventoryStats();
        } else if (tabId === 'stockin') {
            InventoryModule.renderStockInHistory();
        } else if (tabId === 'vouchers') {
            if (window.VouchersModule) {
                VouchersModule.renderSummaryCards();
                VouchersModule.renderVouchersTable();
            }
        } else if (tabId === 'customers') {
            if (window.CustomersModule) {
                CustomersModule.init();
                CustomersModule.renderSummaryCards();
                CustomersModule.renderCustomersTable();
            }
        } else if (tabId === 'settings') {
            if (window.AuditLogModule && typeof AuditLogModule.switchSettingsSubTab === 'function') {
                AuditLogModule.switchSettingsSubTab(AuditLogModule.activeSubTab || 'store');
            } else {
                this.renderSettingsHistory();
            }
        }
    },

    checkStartupAlerts() {
        const medicines = Store.getMedicines();
        let nearExpiryMeds = [];
        let outOfStockMeds = [];

        medicines.forEach(m => {
            const exp = AppUtils.checkExpiryStatus(m.expiryDate);
            if (exp.status === 'expired' || exp.status === 'warning') {
                nearExpiryMeds.push(m);
            }
            const stock = AppUtils.checkStockStatus(m);
            if (stock.status === 'out_of_stock' || stock.status === 'low_stock') {
                outOfStockMeds.push(m);
            }
        });

        // Cập nhật badge trên menu Kho
        const badgeInventory = document.getElementById('nav-badge-inventory');
        if (badgeInventory) {
            const alertCount = nearExpiryMeds.length + outOfStockMeds.length;
            if (alertCount > 0) {
                badgeInventory.innerText = alertCount;
                badgeInventory.classList.remove('hidden');
            } else {
                badgeInventory.classList.add('hidden');
            }
        }
    },

    switchSettingsSubTab(tabName) {
        if (window.AuditLogModule && typeof AuditLogModule.switchSettingsSubTab === 'function') {
            AuditLogModule.switchSettingsSubTab(tabName);
        }
    },

    // --- CÀI ĐẶT & THÔNG TIN NHÀ THUỐC & VIETQR ---
    initSettingsModule() {
        this.renderBankSelector();
        this.loadSettingsForm();

        const form = document.getElementById('form-settings');
        if (form) {
            form.addEventListener('submit', (e) => {
                e.preventDefault();
                this.saveSettingsFromForm();
            });
        }
    },

    renderBankSelector() {
        const sel = document.getElementById('settings-bank-select');
        if (!sel) return;

        const banks = VietQRService.getBanks();
        let html = '';
        banks.forEach(b => {
            html += `<option value="${b.bin}">${b.name}</option>`;
        });
        sel.innerHTML = html;
    },

    loadSettingsForm() {
        const settings = Store.getSettings();

        const setVal = (id, val) => {
            const el = document.getElementById(id);
            if (el) el.value = val;
        };

        setVal('settings-pharmacy-name', settings.pharmacyName || '');
        setVal('settings-gpp-cert', settings.gppCert || '');
        setVal('settings-address', settings.address || '');
        setVal('settings-phone', settings.phone || '');
        setVal('settings-pharmacist', settings.pharmacist || '');
        setVal('settings-receipt-note', settings.receiptNote || '');
        setVal('settings-receipt-thankyou', settings.receiptThankYou || '');

        // VietQR
        if (settings.bankBin) {
            setVal('settings-bank-select', settings.bankBin);
        }
        setVal('settings-account-no', settings.accountNo || '');
        setVal('settings-account-name', settings.accountName || '');

        // Khổ in
        setVal('settings-print-format', settings.printFormat || 'k80');
        const soundEl = document.getElementById('settings-sound-enabled');
        if (soundEl) soundEl.checked = settings.soundEnabled !== false;

        this.previewVietQROnSettings();
    },

    saveSettingsFromForm() {
        const current = Store.getSettings();
        const bankBin = document.getElementById('settings-bank-select').value;
        const bank = VietQRService.getBankByBin(bankBin);

        const updated = {
            ...current,
            pharmacyName: document.getElementById('settings-pharmacy-name').value.trim(),
            gppCert: document.getElementById('settings-gpp-cert').value.trim(),
            address: document.getElementById('settings-address').value.trim(),
            phone: document.getElementById('settings-phone').value.trim(),
            pharmacist: document.getElementById('settings-pharmacist').value.trim(),
            receiptNote: document.getElementById('settings-receipt-note').value.trim(),
            receiptThankYou: document.getElementById('settings-receipt-thankyou').value.trim(),
            bankBin: bankBin,
            bankCode: bank ? bank.code : '',
            bankName: bank ? bank.name : '',
            accountNo: document.getElementById('settings-account-no').value.trim(),
            accountName: document.getElementById('settings-account-name').value.trim().toUpperCase(),
            printFormat: document.getElementById('settings-print-format').value,
            soundEnabled: document.getElementById('settings-sound-enabled').checked
        };

        // Ghi lại lịch sử các trường đã bị thay đổi
        const fieldLabels = {
            pharmacyName: 'Tên Nhà Thuốc',
            gppCert: 'Số Chứng Chỉ GPP',
            address: 'Địa Chỉ Nhà Thuốc',
            phone: 'Hotline / Số ĐT',
            pharmacist: 'Dược Sĩ Phụ Trách',
            receiptNote: 'Ghi Chú Chân Hóa Đơn',
            receiptThankYou: 'Lời Cảm Ơn',
            bankBin: 'Ngân Hàng',
            accountNo: 'Số Tài Khoản',
            accountName: 'Chủ Tài Khoản',
            printFormat: 'Khổ In Nhiệt',
            soundEnabled: 'Âm Thanh Bip'
        };

        const changes = [];
        for (const [key, label] of Object.entries(fieldLabels)) {
            const oldVal = current[key] !== undefined && current[key] !== null ? String(current[key]).trim() : '';
            const newVal = updated[key] !== undefined && updated[key] !== null ? String(updated[key]).trim() : '';
            if (oldVal !== newVal) {
                changes.push({
                    field: label,
                    oldVal: oldVal || '(trống)',
                    newVal: newVal || '(trống)'
                });
            }
        }

        Store.saveSettings(updated);

        if (changes.length > 0) {
            Store.addSettingsHistoryEntry({
                timestamp: new Date().toISOString(),
                pharmacist: updated.pharmacist || current.pharmacist || 'Dược sĩ',
                changes: changes
            });
            Store.logAction('Cài đặt', `Cập nhật cấu hình: ${changes.map(c => c.field).join(', ')}`, updated.pharmacist || 'ADMIN', 'update');
        }

        this.renderSettingsHistory();
        AppUtils.playBeepSound('success');
        this.showToast('Đã lưu cấu hình nhà thuốc & cập nhật lịch sử thành công!', 'success');
        this.previewVietQROnSettings();
    },

    renderSettingsHistory() {
        const tbody = document.getElementById('settings-history-tbody');
        if (!tbody) return;

        const history = Store.getSettingsHistory();
        if (history.length === 0) {
            tbody.innerHTML = '<tr><td colspan="3" class="text-center py-6 text-slate-400">Chưa có lịch sử thay đổi cấu hình nào.</td></tr>';
            return;
        }

        let html = '';
        history.forEach(entry => {
            const changesList = (entry.changes || []).map(c => `
                <div class="py-0.5">
                    <span class="font-bold text-slate-700">${c.field}:</span>
                    <span class="text-rose-600 line-through bg-rose-50 px-1 rounded">${c.oldVal}</span>
                    <span class="text-slate-400 mx-1">➔</span>
                    <span class="text-emerald-700 font-bold bg-emerald-50 px-1 rounded">${c.newVal}</span>
                </div>
            `).join('');

            html += `
                <tr class="border-b border-slate-100 hover:bg-slate-50 text-xs">
                    <td class="py-2.5 px-3 font-mono text-slate-600 whitespace-nowrap">${AppUtils.formatDateTime(entry.timestamp)}</td>
                    <td class="py-2.5 px-3 font-semibold text-slate-800 whitespace-nowrap">${entry.pharmacist || '---'}</td>
                    <td class="py-2.5 px-3">${changesList || '<span class="text-slate-400 italic">Không có chi tiết</span>'}</td>
                </tr>
            `;
        });
        tbody.innerHTML = html;
    },

    clearSettingsHistory() {
        if (confirm('Bạn có chắc chắn muốn xóa toàn bộ lịch sử thay đổi cài đặt?')) {
            Store.saveSettingsHistory([]);
            this.renderSettingsHistory();
            this.showToast('Đã xóa sạch lịch sử chỉnh sửa cài đặt.', 'info');
        }
    },

    previewVietQROnSettings() {
        const container = document.getElementById('settings-vietqr-preview');
        if (!container) return;

        const settings = Store.getSettings();
        VietQRService.renderToElement(container, {
            bankBin: settings.bankBin || '970422',
            accountNo: settings.accountNo,
            accountName: settings.accountName,
            amount: 150000,
            description: 'MEDICA DEMO'
        });
    },

    // --- QUẢN LÝ MẬT KHẨU TÀI KHOẢN (Chỉ Admin) ---
    handleUpdateAdminPassword() {
        const input = document.getElementById('settings-admin-new-pass');
        const pass = input ? input.value.trim() : '';
        if (!pass) {
            this.showToast('Vui lòng nhập mật khẩu mới cho tài khoản Admin!', 'error');
            return;
        }
        if (pass.length < 3) {
            this.showToast('Mật khẩu Admin phải có ít nhất 3 ký tự!', 'error');
            return;
        }
        const res = AuthModule.changePassword('admin', pass);
        if (res.success) {
            this.showToast(res.message, 'success');
            if (input) input.value = '';
        } else {
            this.showToast(res.message, 'error');
        }
    },

    handleUpdateStaffPassword() {
        const input = document.getElementById('settings-staff-new-pass');
        const pass = input ? input.value.trim() : '';
        if (!pass) {
            this.showToast('Vui lòng nhập mật khẩu mới cho tài khoản Staff!', 'error');
            return;
        }
        if (pass.length < 3) {
            this.showToast('Mật khẩu Staff phải có ít nhất 3 ký tự!', 'error');
            return;
        }
        const res = AuthModule.changePassword('staff', pass);
        if (res.success) {
            this.showToast(res.message, 'success');
            if (input) input.value = '';
        } else {
            this.showToast(res.message, 'error');
        }
    },

    // --- SAO LƯU & PHỤC HỒI DỮ LIỆU ---
    exportBackup() {
        const jsonStr = Store.exportBackupJSON();
        const blob = new Blob([jsonStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        const dateStr = new Date().toISOString().slice(0, 10);
        link.setAttribute('href', url);
        link.setAttribute('download', `Sao_Luu_MedicaPharmacy_${dateStr}.json`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        this.showToast('Đã xuất file sao lưu thành công!', 'success');
    },

    importBackup(event) {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            const content = e.target.result;
            const res = Store.importBackupJSON(content);
            if (res.success) {
                alert('Phục hồi dữ liệu từ file thành công! Trang web sẽ được làm mới.');
                window.location.reload();
            } else {
                alert('Lỗi phục hồi dữ liệu: ' + res.message);
            }
        };
        reader.readAsText(file);
    },

    resetToDemoData() {
        if (confirm('Khôi phục toàn bộ danh mục thuốc mẫu và hóa đơn ban đầu? Lưu ý dữ liệu nhập thêm sẽ bị ghi đè!')) {
            Store.resetToSampleData();
            alert('Đã khôi phục dữ liệu mẫu thành công!');
            window.location.reload();
        }
    },

    clearAllDataConfirm() {
        if (confirm('CẢNH BÁO: Thao tác này sẽ xóa sạch toàn bộ thuốc, hóa đơn, phiếu nhập trên máy! Bạn có chắc chắn không?')) {
            if (confirm('Xác nhận lần 2: Dữ liệu bị xóa sẽ không thể lấy lại nếu chưa có file backup. Tiếp tục xóa?')) {
                Store.clearAllData();
                alert('Đã làm sạch toàn bộ dữ liệu.');
                window.location.reload();
            }
        }
    },

    // --- KẾT NỐI ĐIỆN THOẠI & IPAD ---
    async openMobileConnectModal() {
        const modal = document.getElementById('modal-mobile-connect');
        const container = document.getElementById('mobile-qr-canvas');
        const urlEl = document.getElementById('mobile-connect-url');
        if (!modal || !container) return;

        let connectUrl = 'http://192.168.10.100';
        try {
            const res = await fetch('/api/status');
            if (res.ok) {
                const data = await res.json();
                if (data.ips && data.ips.length > 0) {
                    const bestIp = data.ips.find(ip => !ip.startsWith('192.168.56')) || data.ips[0];
                    const portStr = data.port === 80 ? '' : `:${data.port}`;
                    connectUrl = `http://${bestIp}${portStr}`;
                }
            }
        } catch (e) {}

        if (urlEl) urlEl.innerText = connectUrl;

        // Sinh mã QR quét trực tiếp bằng Camera điện thoại
        container.innerHTML = '';
        if (typeof QRCode !== 'undefined') {
            new QRCode(container, {
                text: connectUrl,
                width: 210,
                height: 210,
                colorDark: '#064e3b',
                colorLight: '#ffffff',
                correctLevel: QRCode.CorrectLevel.M
            });
        }

        modal.classList.remove('hidden');
        if (window.lucide) lucide.createIcons();
    },

    closeMobileConnectModal() {
        document.getElementById('modal-mobile-connect')?.classList.add('hidden');
    },

    // --- KHÁCH HÀNG & TRA CỨU ĐIỂM TÍCH LŨY ---
    openCustomerModal() {
        const modal = document.getElementById('modal-customers');
        if (!modal) return;
        this.renderCustomerTable();
        modal.classList.remove('hidden');
        if (window.lucide) lucide.createIcons();
    },

    closeCustomerModal() {
        document.getElementById('modal-customers')?.classList.add('hidden');
    },

    renderCustomerTable() {
        const tbody = document.getElementById('customer-table-tbody');
        if (!tbody) return;

        const q = (document.getElementById('customer-search-input')?.value || '').trim().toLowerCase();
        let customers = Store.getCustomers();

        // Thống kê nhanh
        const totalCust = customers.length;
        const totalPoints = customers.reduce((sum, c) => sum + (c.points || 0), 0);
        const topCust = [...customers].sort((a, b) => (b.points || 0) - (a.points || 0))[0];

        const elStatTotal = document.getElementById('cust-stat-total');
        const elStatPoints = document.getElementById('cust-stat-points');
        const elStatTop = document.getElementById('cust-stat-top');

        if (elStatTotal) elStatTotal.innerText = totalCust;
        if (elStatPoints) elStatPoints.innerText = totalPoints;
        if (elStatTop) {
            elStatTop.innerText = topCust ? `${topCust.name} (${topCust.points}đ)` : '---';
        }

        // Lọc theo từ khóa tìm kiếm
        if (q) {
            customers = customers.filter(c => 
                (c.name && c.name.toLowerCase().includes(q)) || 
                (c.phone && c.phone.includes(q))
            );
        }

        // Sắp xếp theo điểm tích lũy giảm dần
        customers.sort((a, b) => (b.points || 0) - (a.points || 0));

        if (customers.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="7" class="py-12 text-center text-slate-400">
                        <i data-lucide="user-x" class="w-10 h-10 mx-auto mb-2 opacity-30 stroke-[1.5]"></i>
                        <p class="font-medium">Chưa tìm thấy khách hàng nào</p>
                        <p class="text-[11px] text-slate-400 mt-0.5">Khi bán thuốc có nhập SĐT, hệ thống sẽ tự động lưu và tích điểm</p>
                    </td>
                </tr>
            `;
            if (window.lucide) lucide.createIcons();
            return;
        }

        let html = '';
        customers.forEach((c, idx) => {
            const tier = Store.getCustomerTier(c.points || 0);
            const safeName = (c.name || 'Khách hàng').replace(/'/g, "\\'");
            const safePhone = (c.phone || '').replace(/'/g, "\\'");

            html += `
                <tr class="hover:bg-slate-50 transition border-b border-slate-100">
                    <td class="py-2.5 px-3 text-center text-slate-400 font-mono">${idx + 1}</td>
                    <td class="py-2.5 px-3 font-semibold text-slate-800">
                        <div class="flex items-center gap-1.5">
                            <button type="button" 
                                    onclick="CustomersModule.openCustomerOrdersModal('${safePhone || c.id}')" 
                                    class="text-left font-bold text-slate-800 hover:text-emerald-700 hover:underline cursor-pointer flex items-center gap-1"
                                    title="Bấm để xem các đơn khách từng mua">
                                <span>${c.name}</span>
                                <i data-lucide="receipt" class="w-3 h-3 text-emerald-600 opacity-60"></i>
                            </button>
                            <span class="px-1.5 py-0.2 rounded text-[10px] font-bold border ${tier.badge}">
                                ${tier.icon} ${tier.name}
                            </span>
                        </div>
                        <div class="text-[10px] text-slate-400">Mã KH: ${c.id || '---'}</div>
                    </td>
                    <td class="py-2.5 px-3 font-mono font-bold text-slate-700">${c.phone}</td>
                    <td class="py-2.5 px-3 text-center">
                        <span class="inline-flex items-center gap-1 px-2.5 py-1 bg-amber-50 text-amber-800 border border-amber-300 font-black rounded-full font-mono text-xs">
                            ⭐ ${c.points || 0} điểm
                        </span>
                    </td>
                    <td class="py-2.5 px-3 text-right font-medium text-slate-700 font-mono">${AppUtils.formatVND(c.totalSpent || 0)}</td>
                    <td class="py-2.5 px-3 text-center font-mono font-semibold">
                        <button type="button" 
                                onclick="CustomersModule.openCustomerOrdersModal('${safePhone || c.id}')" 
                                class="px-2 py-0.5 bg-slate-100 hover:bg-emerald-100 text-slate-700 hover:text-emerald-800 rounded font-bold transition cursor-pointer"
                                title="Bấm để xem danh sách hóa đơn">
                            ${c.ordersCount || 0}
                        </button>
                    </td>
                    <td class="py-2.5 px-3 text-center">
                        <div class="flex items-center justify-center gap-1">
                            <button onclick="CustomersModule.openCustomerOrdersModal('${safePhone || c.id}')" 
                                    class="p-1 bg-purple-50 hover:bg-purple-100 text-purple-700 rounded text-[11px] transition cursor-pointer" 
                                    title="Xem các hóa đơn từng mua">
                                <i data-lucide="receipt" class="w-3.5 h-3.5"></i>
                            </button>
                            <button onclick="App.selectCustomerForPOS('${safePhone}', '${safeName}')" 
                                    class="px-2 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded font-bold text-[11px] shadow-sm transition" title="Chọn khách cho đơn hiện tại">
                                Chọn
                            </button>
                            <button onclick="App.adjustPointsPrompt('${safePhone}')" 
                                    class="px-1.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded text-[11px] transition" title="Cộng / Trừ điểm thủ công">
                                +/-
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        });

        tbody.innerHTML = html;
        if (window.lucide) lucide.createIcons();
    },

    selectCustomerForPOS(phone, name) {
        const phoneInput = document.getElementById('pos-customer-phone');
        const nameInput = document.getElementById('pos-customer-name');
        if (phoneInput) phoneInput.value = phone;
        if (nameInput) nameInput.value = name;
        this.closeCustomerModal();
        if (window.POSModule) {
            POSModule.updatePointsPreview();
        }
        this.showToast(`Đã chọn khách hàng: ${name} (${phone})`, 'success');
    },

    adjustPointsPrompt(phone) {
        const cust = Store.getCustomerByPhone(phone);
        if (!cust) return;

        const deltaStr = prompt(`Khách hàng: ${cust.name} (${cust.phone})\nĐiểm hiện có: ${cust.points} điểm\n\nNhập số điểm cần thay đổi (ví dụ: +5 để thưởng thêm, hoặc -3 để trừ điểm khi đổi quà):`, '+1');
        if (deltaStr !== null) {
            const delta = parseInt(deltaStr);
            if (!isNaN(delta) && delta !== 0) {
                const updated = Store.adjustCustomerPoints(phone, delta);
                this.renderCustomerTable();
                if (window.POSModule) POSModule.updatePointsPreview();
                this.showToast(`Đã cập nhật điểm cho ${cust.name}: ${updated.points} điểm`, 'success');
            }
        }
    },

    exportCustomersExcel() {
        const customers = Store.getCustomers();
        if (customers.length === 0) {
            alert('Chưa có danh sách khách hàng để xuất Excel!');
            return;
        }
        if (window.ExportService && ExportService.exportCustomers) {
            ExportService.exportCustomers(customers);
        } else {
            alert('Đang tải công cụ xuất file Excel...');
        }
    },

    showToast(message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `fixed bottom-5 right-5 z-50 px-4 py-3 rounded-lg shadow-xl text-white font-medium text-sm flex items-center gap-2 transition-all transform duration-300 ${
            type === 'success' ? 'bg-emerald-600' : type === 'error' ? 'bg-rose-600' : 'bg-slate-800'
        }`;
        toast.innerHTML = `<i data-lucide="${type === 'success' ? 'check-circle' : 'info'}" class="w-5 h-5"></i><span>${message}</span>`;
        document.body.appendChild(toast);
        if (window.lucide) lucide.createIcons();

        setTimeout(() => {
            toast.style.opacity = '0';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }
};

window.App = App;

// Kích hoạt khi trang tải xong
document.addEventListener('DOMContentLoaded', () => {
    App.init();
});

