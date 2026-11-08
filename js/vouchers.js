/**
 * MedicaPharmacy - Vouchers & Cash Flow Management Module
 * Quản lý Sổ Quỹ Thu Chi (Phiếu Thu / Phiếu Chi Tiền Mặt & Chuyển Khoản)
 */

const VouchersModule = {
    currentTab: 'all', // 'all', 'receipt' (Thu), 'payment' (Chi)
    paymentFilter: 'all', // 'all', 'cash', 'transfer'
    timeFilter: 'this_month', // 'all', 'today', 'yesterday', 'last_7_days', 'this_month', 'custom'
    dateFrom: '',
    dateTo: '',
    searchKeyword: '',
    currentPage: 1,
    pageSize: 25,
    currentPrintingVoucher: null,
    editingVoucherId: null,

    // Danh mục thu / chi chuẩn nhà thuốc
    categories: {
        payment: [
            'Chi tiền hàng Nhà Cung Cấp',
            'Chi trả tiền thuê mặt bằng',
            'Chi điện nước & internet',
            'Chi lương & thưởng nhân viên',
            'Chi văn phòng phẩm & túi đựng',
            'Chi sửa chữa & bảo trì thiết bị',
            'Chi tiếp khách & ngoại giao',
            'Chi nộp thuế / phí nhà nước',
            'Chi khác...'
        ],
        receipt: [
            'Thu nợ khách hàng',
            'Thu hoàn tiền từ Nhà Cung Cấp',
            'Thu thanh lý vỏ hộp & bao bì',
            'Thu hoàn ứng nhân viên',
            'Thu khác...'
        ]
    },

    init() {
        this.bindEvents();
        this.setTab('all');
        this.renderSummaryCards();
        this.renderVouchersTable();

        Store.on('vouchers:changed', () => {
            this.renderSummaryCards();
            this.renderVouchersTable();
        });

        Store.on('orders:changed', () => {
            this.renderSummaryCards();
        });

        Store.on('stockin:changed', () => {
            this.renderSummaryCards();
        });
    },

    bindEvents() {
        const searchInput = document.getElementById('vouchers-search-input');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                this.searchKeyword = e.target.value.trim().toLowerCase();
                this.currentPage = 1;
                this.renderVouchersTable();
                this.renderSummaryCards();
            });
        }

        const timeSel = document.getElementById('vouchers-time-filter');
        if (timeSel) {
            timeSel.addEventListener('change', (e) => {
                this.timeFilter = e.target.value;
                this.currentPage = 1;
                const customDiv = document.getElementById('vouchers-custom-dates');
                if (customDiv) {
                    if (e.target.value === 'custom') {
                        customDiv.classList.remove('hidden');
                    } else {
                        customDiv.classList.add('hidden');
                    }
                }
                this.renderSummaryCards();
                this.renderVouchersTable();
            });
        }

        const dateFrom = document.getElementById('vouchers-date-from');
        if (dateFrom) {
            dateFrom.addEventListener('change', (e) => {
                this.dateFrom = e.target.value;
                this.currentPage = 1;
                this.renderSummaryCards();
                this.renderVouchersTable();
            });
        }

        const dateTo = document.getElementById('vouchers-date-to');
        if (dateTo) {
            dateTo.addEventListener('change', (e) => {
                this.dateTo = e.target.value;
                this.currentPage = 1;
                this.renderSummaryCards();
                this.renderVouchersTable();
            });
        }
    },

    setTab(tab) {
        this.currentTab = tab;
        this.currentPage = 1;

        const btnAll = document.getElementById('tab-btn-vouchers-all');
        const btnReceipt = document.getElementById('tab-btn-vouchers-receipt');
        const btnPayment = document.getElementById('tab-btn-vouchers-payment');

        if (btnAll) btnAll.className = 'tab-filter-btn' + (tab === 'all' ? ' active-emerald' : '');
        if (btnReceipt) btnReceipt.className = 'tab-filter-btn' + (tab === 'receipt' ? ' active-emerald' : '');
        if (btnPayment) btnPayment.className = 'tab-filter-btn' + (tab === 'payment' ? ' active-rose' : '');

        this.renderVouchersTable();
    },

    setPaymentFilter(method) {
        this.paymentFilter = method;
        this.currentPage = 1;

        const btnAll = document.getElementById('filter-voucher-method-all');
        const btnCash = document.getElementById('filter-voucher-method-cash');
        const btnTransfer = document.getElementById('filter-voucher-method-transfer');

        const activeClass = ['bg-slate-800', 'text-white'];
        const inactiveClass = ['bg-slate-100', 'text-slate-600', 'hover:bg-slate-200'];

        [btnAll, btnCash, btnTransfer].forEach(b => {
            b?.classList.remove(...activeClass);
            b?.classList.add(...inactiveClass);
        });

        if (method === 'all') btnAll?.classList.add(...activeClass);
        if (method === 'cash') btnCash?.classList.add(...activeClass);
        if (method === 'transfer') btnTransfer?.classList.add(...activeClass);

        this.renderVouchersTable();
        this.renderSummaryCards();
    },

    renderSummaryCards() {
        const summary = Store.getCashFlowSummary(this.timeFilter, this.dateFrom, this.dateTo);

        const elCash = document.getElementById('voucher-stat-cash-balance');
        const elBank = document.getElementById('voucher-stat-bank-balance');
        const elIn = document.getElementById('voucher-stat-period-in');
        const elOut = document.getElementById('voucher-stat-period-out');
        const elNet = document.getElementById('voucher-stat-period-net');

        if (elCash) elCash.innerText = AppUtils.formatVND(summary.cashBalance);
        if (elBank) elBank.innerText = AppUtils.formatVND(summary.bankBalance);
        if (elIn) elIn.innerText = AppUtils.formatVND(summary.periodIncome);
        if (elOut) elOut.innerText = AppUtils.formatVND(summary.periodExpense);
        if (elNet) {
            elNet.innerText = AppUtils.formatVND(summary.periodNet);
            if (summary.periodNet >= 0) {
                elNet.className = 'text-base sm:text-lg font-black text-emerald-700 font-mono';
            } else {
                elNet.className = 'text-base sm:text-lg font-black text-rose-700 font-mono';
            }
        }

        // Cập nhật số lượng trên các tab theo đúng mốc thời gian và bộ lọc
        let periodVouchers = Store.getVouchers().filter(v =>
            AppUtils.matchesTimeFilter(v.createdAt, this.timeFilter, this.dateFrom, this.dateTo)
        );

        // Lọc theo phương thức tiền mặt/chuyển khoản
        if (this.paymentFilter === 'cash') {
            periodVouchers = periodVouchers.filter(v => v.paymentMethod === 'cash');
        } else if (this.paymentFilter === 'transfer') {
            periodVouchers = periodVouchers.filter(v => v.paymentMethod === 'transfer');
        }

        // Lọc theo từ khóa tìm kiếm (nếu có)
        if (this.searchKeyword) {
            const q = this.searchKeyword;
            periodVouchers = periodVouchers.filter(v =>
                (v.id && v.id.toLowerCase().includes(q)) ||
                (v.category && v.category.toLowerCase().includes(q)) ||
                (v.targetName && v.targetName.toLowerCase().includes(q)) ||
                (v.note && v.note.toLowerCase().includes(q)) ||
                (v.refId && v.refId.toLowerCase().includes(q))
            );
        }

        const badgeAll = document.getElementById('badge-vouchers-all');
        const badgeReceipt = document.getElementById('badge-vouchers-receipt');
        const badgePayment = document.getElementById('badge-vouchers-payment');

        if (badgeAll) badgeAll.innerText = periodVouchers.length;
        if (badgeReceipt) badgeReceipt.innerText = periodVouchers.filter(v => v.type === 'receipt').length;
        if (badgePayment) badgePayment.innerText = periodVouchers.filter(v => v.type === 'payment').length;
    },

    getFilteredVouchers() {
        let vouchers = Store.getVouchers();

        // 1. Lọc theo Tab (Tất cả / Thu / Chi)
        if (this.currentTab === 'receipt') {
            vouchers = vouchers.filter(v => v.type === 'receipt');
        } else if (this.currentTab === 'payment') {
            vouchers = vouchers.filter(v => v.type === 'payment');
        }

        // 2. Lọc theo Phương thức (Tiền mặt / Chuyển khoản)
        if (this.paymentFilter === 'cash') {
            vouchers = vouchers.filter(v => v.paymentMethod === 'cash');
        } else if (this.paymentFilter === 'transfer') {
            vouchers = vouchers.filter(v => v.paymentMethod === 'transfer');
        }

        // 3. Lọc theo thời gian
        vouchers = vouchers.filter(v =>
            AppUtils.matchesTimeFilter(v.createdAt, this.timeFilter, this.dateFrom, this.dateTo)
        );

        // 4. Tìm kiếm từ khóa
        if (this.searchKeyword) {
            const q = this.searchKeyword;
            vouchers = vouchers.filter(v => 
                (v.id && v.id.toLowerCase().includes(q)) ||
                (v.targetName && v.targetName.toLowerCase().includes(q)) ||
                (v.category && v.category.toLowerCase().includes(q)) ||
                (v.note && v.note.toLowerCase().includes(q)) ||
                (v.pharmacist && v.pharmacist.toLowerCase().includes(q))
            );
        }

        return vouchers;
    },

    // --- PHÂN TRANG SỔ QUỸ THU CHI ---
    changePageSize(newSize) {
        this.pageSize = (newSize === 'all') ? 'all' : parseInt(newSize, 10);
        this.currentPage = 1;
        this.renderVouchersTable();
    },

    goToPage(page) {
        this.currentPage = page;
        this.renderVouchersTable();
    },

    renderPaginationControls(total, totalPages, startIdx, count) {
        const pageInfoEl = document.getElementById('vouchers-page-info');
        const badgeTotal = document.getElementById('vouchers-count-badge');
        const btnsEl = document.getElementById('vouchers-pagination-buttons');
        
        if (badgeTotal) badgeTotal.innerText = total;

        if (pageInfoEl) {
            if (total === 0) {
                pageInfoEl.innerText = "0";
            } else {
                pageInfoEl.innerText = `${startIdx + 1} - ${startIdx + count}`;
            }
        }

        if (!btnsEl) return;

        if (this.pageSize === 'all' || totalPages <= 1) {
            btnsEl.innerHTML = '';
            return;
        }

        const cur = this.currentPage;
        let html = '';

        html += `
            <button onclick="VouchersModule.goToPage(1)" ${cur <= 1 ? 'disabled' : ''} 
                    class="p-1 px-2 rounded border border-slate-200 text-xs font-bold ${cur <= 1 ? 'opacity-40 cursor-not-allowed text-slate-400 bg-slate-50' : 'bg-white hover:bg-emerald-50 text-slate-700 hover:text-emerald-700 cursor-pointer'} transition" 
                    title="Về trang đầu">
                «
            </button>
        `;

        html += `
            <button onclick="VouchersModule.goToPage(${cur - 1})" ${cur <= 1 ? 'disabled' : ''} 
                    class="p-1 px-2.5 rounded border border-slate-200 text-xs font-bold ${cur <= 1 ? 'opacity-40 cursor-not-allowed text-slate-400 bg-slate-50' : 'bg-white hover:bg-emerald-50 text-slate-700 hover:text-emerald-700 cursor-pointer'} transition" 
                    title="Trang trước">
                ‹
            </button>
        `;

        let startPage = Math.max(1, cur - 2);
        let endPage = Math.min(totalPages, startPage + 4);
        if (endPage - startPage < 4) {
            startPage = Math.max(1, endPage - 4);
        }

        for (let p = startPage; p <= endPage; p++) {
            if (p === cur) {
                html += `
                    <button class="p-1 px-2.5 rounded bg-emerald-600 text-white text-xs font-black shadow-xs cursor-default">
                        ${p}
                    </button>
                `;
            } else {
                html += `
                    <button onclick="VouchersModule.goToPage(${p})" 
                            class="p-1 px-2.5 rounded bg-white hover:bg-emerald-50 text-slate-700 hover:text-emerald-700 border border-slate-200 text-xs font-bold transition cursor-pointer">
                        ${p}
                    </button>
                `;
            }
        }

        html += `
            <button onclick="VouchersModule.goToPage(${cur + 1})" ${cur >= totalPages ? 'disabled' : ''} 
                    class="p-1 px-2.5 rounded border border-slate-200 text-xs font-bold ${cur >= totalPages ? 'opacity-40 cursor-not-allowed text-slate-400 bg-slate-50' : 'bg-white hover:bg-emerald-50 text-slate-700 hover:text-emerald-700 cursor-pointer'} transition" 
                    title="Trang sau">
                ›
            </button>
        `;

        html += `
            <button onclick="VouchersModule.goToPage(${totalPages})" ${cur >= totalPages ? 'disabled' : ''} 
                    class="p-1 px-2 rounded border border-slate-200 text-xs font-bold ${cur >= totalPages ? 'opacity-40 cursor-not-allowed text-slate-400 bg-slate-50' : 'bg-white hover:bg-emerald-50 text-slate-700 hover:text-emerald-700 cursor-pointer'} transition" 
                    title="Đến trang cuối">
                »
            </button>
        `;

        btnsEl.innerHTML = html;
    },

    renderVouchersTable() {
        const tbody = document.getElementById('vouchers-table-tbody');
        if (!tbody) return;

        const list = this.getFilteredVouchers();
        const total = list.length;

        if (total === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="9" class="text-center py-10 text-slate-400">
                        <i data-lucide="wallet" class="w-10 h-10 mx-auto mb-2 opacity-40"></i>
                        Không có phiếu thu / chi nào thỏa mãn điều kiện lọc.
                    </td>
                </tr>
            `;
            this.renderPaginationControls(0, 1, 0, 0);
            if (window.lucide) lucide.createIcons();
            return;
        }

        const totalPages = (this.pageSize === 'all') ? 1 : Math.max(1, Math.ceil(total / this.pageSize));
        if (this.currentPage > totalPages) this.currentPage = totalPages;
        if (this.currentPage < 1) this.currentPage = 1;

        let displayedVouchers = list;
        let startIdx = 0;
        if (this.pageSize !== 'all') {
            startIdx = (this.currentPage - 1) * this.pageSize;
            displayedVouchers = list.slice(startIdx, startIdx + this.pageSize);
        }

        this.renderPaginationControls(total, totalPages, startIdx, displayedVouchers.length);

        let html = '';
        displayedVouchers.forEach((v, idx) => {
            const isReceipt = v.type === 'receipt';
            const isCash = v.paymentMethod === 'cash';

            let typeBadge = '';
            if (v.isCancelled) {
                typeBadge = '<span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-200 text-slate-600 border border-slate-300 line-through">ĐÃ HỦY</span>';
            } else if (isReceipt) {
                typeBadge = '<span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300"><i data-lucide="arrow-down-left" class="w-3.5 h-3.5"></i> PHIẾU THU</span>';
            } else {
                typeBadge = '<span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-100 text-rose-800 border border-rose-300"><i data-lucide="arrow-up-right" class="w-3.5 h-3.5"></i> PHIẾU CHI</span>';
            }

            const methodBadge = isCash
                ? '<span class="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-800 bg-amber-50 px-2 py-0.5 rounded border border-amber-200"><i data-lucide="banknote" class="w-3 h-3"></i> Tiền mặt</span>'
                : '<span class="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-800 bg-blue-50 px-2 py-0.5 rounded border border-blue-200"><i data-lucide="qr-code" class="w-3 h-3"></i> Chuyển khoản</span>';

            const absAmt = Math.abs(Number(v.amount) || 0);
            const amountHtml = isReceipt
                ? `<span class="font-extrabold text-emerald-700 text-sm font-mono ${v.isCancelled ? 'line-through text-slate-400' : ''}">+${AppUtils.formatVND(absAmt)}</span>`
                : `<span class="font-extrabold text-rose-700 text-sm font-mono ${v.isCancelled ? 'line-through text-slate-400' : ''}">-${AppUtils.formatVND(absAmt)}</span>`;

            const refBadge = v.refId ? `<div class="text-[10px] font-mono text-emerald-700 font-semibold mt-0.5">Ref: ${v.refId}</div>` : '';

            html += `
                <tr class="border-b border-slate-100 hover:bg-slate-50 transition text-xs ${v.isCancelled ? 'opacity-50' : ''}">
                    <td class="py-3 px-3 text-center text-slate-400 font-mono">${startIdx + idx + 1}</td>
                    <td class="py-3 px-3 font-mono font-bold text-slate-800">
                        <span class="hover:text-emerald-700 cursor-pointer" onclick="VouchersModule.viewVoucherDetail('${v.id}')">${v.id}</span>
                        <div class="text-[11px] text-slate-400 font-sans font-normal">${AppUtils.formatDateTime(v.createdAt)}</div>
                        ${refBadge}
                    </td>
                    <td class="py-3 px-3 text-center">${typeBadge}</td>
                    <td class="py-3 px-3">${methodBadge}</td>
                    <td class="py-3 px-3 font-semibold text-slate-800">
                        ${v.category || '---'}
                        ${v.note ? `<div class="text-[11px] text-slate-500 font-normal italic line-clamp-1" title="${v.note}">${v.note}</div>` : ''}
                    </td>
                    <td class="py-3 px-3">
                        <div class="font-bold text-slate-800">${v.targetName || '---'}</div>
                        <div class="text-[10px] text-slate-400 uppercase tracking-wider">${this.formatTargetType(v.targetType)}</div>
                    </td>
                    <td class="py-3 px-3 text-right">${amountHtml}</td>
                    <td class="py-3 px-3 text-center">
                        ${v.isAccounting !== false ? 
                            '<span class="inline-block px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200" title="Được tính vào kết quả kinh doanh">Hạch toán KD</span>' : 
                            '<span class="inline-block px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-500" title="Chi phí ngoài bảng">Ngoại bảng</span>'}
                    </td>
                    <td class="py-3 px-3 text-center">
                        <div class="flex items-center justify-center gap-1">
                            <button onclick="VouchersModule.openEditModal('${v.id}')" title="Chỉnh sửa phiếu" class="p-1.5 text-slate-500 hover:text-emerald-700 hover:bg-emerald-50 rounded transition">
                                <i data-lucide="edit-3" class="w-4 h-4"></i>
                            </button>
                            <button onclick="VouchersModule.printVoucher('${v.id}')" title="In phiếu" class="p-1.5 text-slate-600 hover:text-blue-700 hover:bg-blue-50 rounded transition">
                                <i data-lucide="printer" class="w-4 h-4"></i>
                            </button>
                            <button onclick="VouchersModule.deleteVoucherConfirm('${v.id}')" title="Xóa phiếu" class="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition">
                                <i data-lucide="trash-2" class="w-4 h-4"></i>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        });

        tbody.innerHTML = html;
        if (window.lucide) lucide.createIcons();
    },

    formatTargetType(t) {
        if (t === 'supplier') return 'Nhà cung cấp';
        if (t === 'customer') return 'Khách hàng';
        if (t === 'employee') return 'Nhân viên';
        return 'Đối tác khác';
    },

    // --- TẠO & CHỈNH SỬA PHIẾU THU / CHI (MODAL) ---
    openCreateModal(type = 'payment', paymentMethod = 'cash') {
        if (window.AuthModule && !AuthModule.canAccessTab('vouchers')) {
            if (window.AppUtils && AppUtils.showToast) {
                AppUtils.showToast('Bạn không có quyền lập phiếu thu/chi. Chỉ Quản trị viên (Admin) mới có quyền này!', 'warning');
            } else {
                alert('Chỉ Admin mới có quyền lập phiếu thu/chi!');
            }
            return;
        }

        this.editingVoucherId = null;
        const modal = document.getElementById('modal-voucher-create');
        if (!modal) return;

        this.setModalType(type);
        this.setModalPaymentMethod(paymentMethod);

        const idInput = document.getElementById('voucher-input-id');
        if (idInput) idInput.value = 'Tự động';

        // Đặt ngày giờ hiện tại
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const timeInput = document.getElementById('voucher-input-time');
        if (timeInput) {
            timeInput.value = `${year}-${month}-${day}T${hours}:${minutes}`;
        }

        // Đặt người lập phiếu
        const settings = Store.getSettings();
        const pharmInput = document.getElementById('voucher-input-pharmacist');
        if (pharmInput) {
            pharmInput.value = (window.AuthModule ? AuthModule.getCurrentUser()?.fullName : null) || settings.pharmacist || 'DS. Nguyễn Thanh Dung';
        }

        // Reset các trường
        const elAmt = document.getElementById('voucher-input-amount');
        if (elAmt) elAmt.value = '';
        const elTarget = document.getElementById('voucher-input-target-name');
        if (elTarget) elTarget.value = '';
        const elNote = document.getElementById('voucher-input-note');
        if (elNote) elNote.value = '';
        const elAcc = document.getElementById('voucher-input-accounting');
        if (elAcc) elAcc.checked = true;

        this.updateTargetSuggestions();

        if (window.SearchableSelect) {
            SearchableSelect.init('voucher-input-category', { richType: 'category', placeholder: '🔍 Tìm hoặc chọn loại thu / chi...' });
            SearchableSelect.refresh('voucher-input-category');
        }

        modal.classList.remove('hidden');
        if (window.lucide) lucide.createIcons();
    },

    openEditModal(voucherId) {
        if (window.AuthModule && !AuthModule.canAccessTab('vouchers')) {
            if (window.AppUtils && AppUtils.showToast) {
                AppUtils.showToast('Chỉ Quản trị viên (Admin) mới có quyền chỉnh sửa phiếu thu/chi!', 'warning');
            } else {
                alert('Chỉ Admin mới có quyền chỉnh sửa phiếu thu/chi!');
            }
            return;
        }

        const vouchers = Store.getVouchers();
        const v = vouchers.find(x => x.id === voucherId);
        if (!v) {
            alert('Không tìm thấy thông tin phiếu ' + voucherId);
            return;
        }

        this.editingVoucherId = voucherId;
        const modal = document.getElementById('modal-voucher-create');
        if (!modal) return;

        const type = v.type || 'payment';
        const method = v.paymentMethod || 'cash';
        this.setModalType(type);
        this.setModalPaymentMethod(method);

        const titleEl = document.getElementById('voucher-modal-title');
        const methodText = method === 'cash' ? 'tiền mặt' : 'chuyển khoản';
        if (titleEl) {
            titleEl.innerHTML = `Chỉnh sửa phiếu ${type === 'receipt' ? 'thu' : 'chi'} ${methodText}: <span class="font-mono text-emerald-700">${v.id}</span>`;
        }

        const idInput = document.getElementById('voucher-input-id');
        if (idInput) idInput.value = v.id;

        const timeInput = document.getElementById('voucher-input-time');
        if (timeInput && v.createdAt) {
            try {
                const dt = new Date(v.createdAt);
                const year = dt.getFullYear();
                const month = String(dt.getMonth() + 1).padStart(2, '0');
                const day = String(dt.getDate()).padStart(2, '0');
                const hours = String(dt.getHours()).padStart(2, '0');
                const minutes = String(dt.getMinutes()).padStart(2, '0');
                timeInput.value = `${year}-${month}-${day}T${hours}:${minutes}`;
            } catch(e) {
                timeInput.value = '';
            }
        }

        const pharmInput = document.getElementById('voucher-input-pharmacist');
        if (pharmInput) {
            pharmInput.value = v.pharmacist || v.createdBy || (window.AuthModule ? AuthModule.getCurrentUser()?.fullName : null) || 'admin';
        }

        const sel = document.getElementById('voucher-input-category');
        if (sel) {
            if (v.category) {
                let hasOpt = false;
                for (let i = 0; i < sel.options.length; i++) {
                    if (sel.options[i].value === v.category) {
                        hasOpt = true;
                        break;
                    }
                }
                if (!hasOpt) {
                    const opt = document.createElement('option');
                    opt.value = v.category;
                    opt.innerText = v.category;
                    sel.insertBefore(opt, sel.lastElementChild);
                }
            }
            sel.value = v.category || '';
            if (window.SearchableSelect) {
                SearchableSelect.refresh('voucher-input-category');
            }
        }

        const elTargetType = document.getElementById('voucher-input-target-type');
        if (elTargetType) elTargetType.value = v.targetType || 'other';

        const elTargetName = document.getElementById('voucher-input-target-name');
        if (elTargetName) elTargetName.value = v.targetName || v.recipientName || v.person || '';

        const elAmt = document.getElementById('voucher-input-amount');
        if (elAmt) elAmt.value = Math.abs(Number(v.amount) || 0);

        const elNote = document.getElementById('voucher-input-note');
        if (elNote) elNote.value = v.note || v.reason || v.description || '';

        const elAcc = document.getElementById('voucher-input-accounting');
        if (elAcc) elAcc.checked = (v.isAccounting !== false);

        this.updateTargetSuggestions();

        modal.classList.remove('hidden');
        if (window.lucide) lucide.createIcons();
    },

    editCurrentPrintingVoucher() {
        if (!this.currentPrintingVoucher) return;
        const vId = this.currentPrintingVoucher.id;
        this.closePrintModal();
        this.openEditModal(vId);
    },

    closeCreateModal() {
        this.editingVoucherId = null;
        document.getElementById('modal-voucher-create')?.classList.add('hidden');
        if (window.SearchableSelect) {
            SearchableSelect.closeAll();
        }
    },

    setModalType(type) {
        const titleEl = document.getElementById('voucher-modal-title');
        const method = this.getModalPaymentMethod();
        const methodText = method === 'cash' ? 'tiền mặt' : 'chuyển khoản';

        const lblType = document.getElementById('voucher-label-type');
        const lblPerson = document.getElementById('voucher-label-person');
        const lblTarget = document.getElementById('voucher-label-target');
        const lblTargetName = document.getElementById('voucher-label-target-name');

        if (type === 'receipt') {
            if (titleEl) titleEl.innerText = `Tạo phiếu thu ${methodText}`;
            if (lblType) lblType.innerText = 'Loại thu *';
            if (lblPerson) lblPerson.innerText = 'Người thu';
            if (lblTarget) lblTarget.innerText = 'Đối tượng nộp';
            if (lblTargetName) lblTargetName.innerText = 'Tên người nộp';
            document.getElementById('voucher-type-receipt-btn')?.classList.add('bg-emerald-600', 'text-white');
            document.getElementById('voucher-type-receipt-btn')?.classList.remove('bg-slate-100', 'text-slate-600');
            document.getElementById('voucher-type-payment-btn')?.classList.remove('bg-rose-600', 'text-white');
            document.getElementById('voucher-type-payment-btn')?.classList.add('bg-slate-100', 'text-slate-600');
        } else {
            if (titleEl) titleEl.innerText = `Tạo phiếu chi ${methodText}`;
            if (lblType) lblType.innerText = 'Loại chi *';
            if (lblPerson) lblPerson.innerText = 'Người chi';
            if (lblTarget) lblTarget.innerText = 'Đối tượng nhận';
            if (lblTargetName) lblTargetName.innerText = 'Tên người nhận';
            document.getElementById('voucher-type-payment-btn')?.classList.add('bg-rose-600', 'text-white');
            document.getElementById('voucher-type-payment-btn')?.classList.remove('bg-slate-100', 'text-slate-600');
            document.getElementById('voucher-type-receipt-btn')?.classList.remove('bg-emerald-600', 'text-white');
            document.getElementById('voucher-type-receipt-btn')?.classList.add('bg-slate-100', 'text-slate-600');
        }

        // Cập nhật dropdown loại thu/chi (kết hợp danh mục mặc định, tùy chỉnh và dữ liệu hiện có)
        const sel = document.getElementById('voucher-input-category');
        if (sel) {
            const defaultList = this.categories[type] || [];
            const customList = (typeof Store.getCustomCategories === 'function') ? (Store.getCustomCategories()[type] || []) : [];
            const existingVouchers = (typeof Store.getVouchers === 'function') ? Store.getVouchers() : [];
            const existingCats = existingVouchers.filter(v => v.type === type && v.category).map(v => v.category);
            const allCategories = Array.from(new Set([...defaultList, ...customList, ...existingCats]));

            let html = '<option value="">-- Chọn loại ' + (type === 'receipt' ? 'thu' : 'chi') + ' --</option>';
            allCategories.forEach(c => {
                html += `<option value="${c}">${c}</option>`;
            });
            html += `<option value="__custom__" class="font-bold text-blue-600">+ Thêm loại ${type === 'receipt' ? 'thu' : 'chi'} mới...</option>`;
            sel.innerHTML = html;
            if (window.SearchableSelect) {
                SearchableSelect.refresh('voucher-input-category');
            }
        }

        this.currentModalType = type;
    },

    promptAddCategory() {
        const type = this.currentModalType || 'payment';
        const typeName = type === 'receipt' ? 'thu' : 'chi';
        const newCat = prompt(`Nhập tên loại ${typeName} mới:`);
        if (newCat && newCat.trim()) {
            const added = Store.addCustomCategory(type, newCat.trim());
            this.setModalType(type);
            const sel = document.getElementById('voucher-input-category');
            if (sel) sel.value = added;
            App.showToast(`Đã thêm loại ${typeName} mới: "${added}"`, 'success');
        } else {
            const sel = document.getElementById('voucher-input-category');
            if (sel && sel.value === '__custom__') sel.value = '';
        }
    },

    setModalPaymentMethod(method) {
        const btnCash = document.getElementById('voucher-method-cash-btn');
        const btnTransfer = document.getElementById('voucher-method-transfer-btn');

        if (method === 'cash') {
            btnCash?.classList.add('bg-amber-600', 'text-white');
            btnCash?.classList.remove('bg-slate-100', 'text-slate-600');
            btnTransfer?.classList.remove('bg-blue-600', 'text-white');
            btnTransfer?.classList.add('bg-slate-100', 'text-slate-600');
        } else {
            btnTransfer?.classList.add('bg-blue-600', 'text-white');
            btnTransfer?.classList.remove('bg-slate-100', 'text-slate-600');
            btnCash?.classList.remove('bg-amber-600', 'text-white');
            btnCash?.classList.add('bg-slate-100', 'text-slate-600');
        }

        this.currentModalMethod = method;
        this.setModalType(this.currentModalType || 'payment');
    },

    getModalPaymentMethod() {
        return this.currentModalMethod || 'cash';
    },

    updateTargetSuggestions() {
        const targetType = document.getElementById('voucher-input-target-type')?.value || 'other';
        const datalist = document.getElementById('voucher-targets-datalist');
        if (!datalist) return;

        let suggestions = [];
        if (targetType === 'supplier') {
            const suppliers = Store.getSuppliers();
            suggestions = suppliers.map(s => s.name);
        } else if (targetType === 'customer') {
            const customers = Store.getCustomers();
            suggestions = customers.map(c => `${c.name} (${c.phone})`);
        } else if (targetType === 'employee') {
            const settings = Store.getSettings();
            suggestions = [settings.pharmacist || 'DS. Nguyễn Thanh Dung', 'Nhân viên ca sáng', 'Nhân viên ca tối'];
        }

        datalist.innerHTML = suggestions.map(s => `<option value="${s}">`).join('');
    },

    saveVoucher(andPrint = false) {
        const type = this.currentModalType || 'payment';
        const paymentMethod = this.currentModalMethod || 'cash';
        const category = document.getElementById('voucher-input-category')?.value;
        const timeVal = document.getElementById('voucher-input-time')?.value;
        const pharmacist = document.getElementById('voucher-input-pharmacist')?.value.trim();
        const targetType = document.getElementById('voucher-input-target-type')?.value;
        const targetName = document.getElementById('voucher-input-target-name')?.value.trim();
        const amountRaw = document.getElementById('voucher-input-amount')?.value;
        const amount = parseFloat(amountRaw.toString().replace(/\D/g, '')) || 0;
        const note = document.getElementById('voucher-input-note')?.value.trim();
        const isAccounting = document.getElementById('voucher-input-accounting')?.checked;

        if (!category) {
            if (window.App && App.showToast) App.showToast('Vui lòng chọn loại thu / chi!', 'warning');
            else alert('Vui lòng chọn loại thu / chi!');
            return;
        }

        if (amount <= 0) {
            if (window.App && App.showToast) App.showToast('Vui lòng nhập số tiền lớn hơn 0!', 'warning');
            else alert('Vui lòng nhập số tiền lớn hơn 0!');
            return;
        }

        const isEditing = !!this.editingVoucherId;
        const voucherData = {
            type,
            paymentMethod,
            category,
            targetType,
            targetName: targetName || 'Khác',
            amount,
            note,
            isAccounting: isAccounting !== false,
            pharmacist: pharmacist || 'admin',
            createdAt: timeVal ? new Date(timeVal).toISOString() : new Date().toISOString()
        };

        let saved = null;
        if (isEditing) {
            saved = Store.updateVoucher(this.editingVoucherId, voucherData);
            if (!saved) {
                App.showToast('Không thể cập nhật phiếu ' + this.editingVoucherId, 'error');
                return;
            }

            // Đồng bộ sang hóa đơn/phiếu nhập nếu có refId và hình thức thay đổi
            if (saved.refId && typeof Store.getOrders === 'function' && saved.refId.startsWith('HD')) {
                const orders = Store.getOrders();
                const ord = orders.find(o => o.id === saved.refId);
                if (ord && ord.paymentMethod !== paymentMethod) {
                    ord.paymentMethod = paymentMethod;
                    Store.saveOrders(orders);
                }
            } else if (saved.refId && typeof Store.getStockInOrders === 'function' && saved.refId.startsWith('PN')) {
                const stockins = Store.getStockInOrders();
                const st = stockins.find(s => s.id === saved.refId);
                if (st && st.paymentMethod !== paymentMethod) {
                    st.paymentMethod = paymentMethod;
                    Store.saveStockInOrders(stockins);
                }
            }

            // Ghi nhật ký thao tác (Audit Log)
            if (window.Store && typeof Store.logAction === 'function') {
                const feat = type === 'receipt' ? 'Phiếu thu' : 'Phiếu chi';
                Store.logAction(feat, `Chỉnh sửa phiếu: ${saved.id}, giá trị: ${AppUtils.formatVND(saved.amount)}, loại: ${saved.category || ''}`, saved.pharmacist || 'ADMIN', 'update');
            }

            App.showToast(`Đã cập nhật thành công phiếu ${type === 'receipt' ? 'thu' : 'chi'}: ${saved.id}`, 'success');
        } else {
            saved = Store.addVoucher(voucherData);

            // Ghi nhật ký thao tác (Audit Log)
            if (window.Store && typeof Store.logAction === 'function') {
                const feat = type === 'receipt' ? 'Phiếu thu' : 'Phiếu chi';
                const actionName = type === 'receipt' ? 'Tạo phiếu thu' : 'Tạo phiếu chi';
                Store.logAction(feat, `${actionName}: ${saved.id}, giá trị: ${AppUtils.formatVND(saved.amount)}, nội dung: ${saved.category || saved.note || ''}`, saved.pharmacist || 'ADMIN', 'create');
            }

            App.showToast(`Đã tạo thành công phiếu ${type === 'receipt' ? 'thu' : 'chi'}: ${saved.id}`, 'success');
        }

        AppUtils.playBeepSound('success');
        this.closeCreateModal();

        // Cập nhật lại giao diện bảng và thẻ thống kê
        this.renderVouchersTable();
        this.renderSummaryCards();

        // Cập nhật lại báo cáo tài chính nếu tab báo cáo đang mở
        if (window.ReportsModule && typeof ReportsModule.loadMonthlyReport === 'function') {
            ReportsModule.loadMonthlyReport();
        }

        if (andPrint && saved && saved.id) {
            this.printVoucher(saved.id);
        }
    },

    // --- IN PHIẾU THU / PHIẾU CHI ---
    printVoucher(voucherId) {
        const vouchers = Store.getVouchers();
        const v = vouchers.find(x => x.id === voucherId);
        if (!v) return;

        this.currentPrintingVoucher = v;
        const modal = document.getElementById('modal-voucher-print');
        const container = document.getElementById('voucher-print-content');
        if (!modal || !container) return;

        const isReceipt = v.type === 'receipt';
        const settings = Store.getSettings();

        container.innerHTML = `
            <div class="receipt-paper k80-width bg-white text-slate-900 mx-auto p-4 shadow-lg font-sans text-xs">
                <div class="text-center pb-2 border-b border-dashed border-slate-300">
                    <div class="font-extrabold text-sm uppercase">${settings.pharmacyName || 'MEDICA PHARMACY'}</div>
                    <div class="text-[10px] text-slate-500">${settings.address || ''}</div>
                    <div class="text-[10px] text-slate-500">Hotline: ${settings.phone || ''}</div>
                </div>

                <div class="text-center my-3">
                    <div class="font-black text-base uppercase text-slate-800">${isReceipt ? 'PHIẾU THU TIỀN' : 'PHIẾU CHI TIỀN'}</div>
                    <div class="text-[11px] font-mono font-bold text-slate-600">Số: ${v.id}</div>
                    <div class="text-[10px] text-slate-400">${AppUtils.formatDateTime(v.createdAt)}</div>
                </div>

                <div class="space-y-1.5 border-t border-b border-dashed border-slate-300 py-2 text-xs">
                    <div class="flex justify-between">
                        <span class="text-slate-500">${isReceipt ? 'Người nộp tiền:' : 'Người nhận tiền:'}</span>
                        <span class="font-bold text-slate-800">${v.targetName || '---'}</span>
                    </div>
                    <div class="flex justify-between">
                        <span class="text-slate-500">Đối tượng:</span>
                        <span>${this.formatTargetType(v.targetType)}</span>
                    </div>
                    <div class="flex justify-between">
                        <span class="text-slate-500">Hình thức:</span>
                        <span class="font-semibold">${v.paymentMethod === 'cash' ? 'Tiền mặt' : 'Chuyển khoản'}</span>
                    </div>
                    <div class="flex justify-between">
                        <span class="text-slate-500">Lý do ${isReceipt ? 'thu' : 'chi'}:</span>
                        <span class="font-medium text-right">${v.category}</span>
                    </div>
                    ${v.note ? `
                    <div class="text-[11px] text-slate-600 italic">
                        Ghi chú: ${v.note}
                    </div>` : ''}
                    <div class="flex justify-between items-baseline pt-2 border-t border-slate-200">
                        <span class="font-extrabold text-slate-800">SỐ TIỀN:</span>
                        <span class="font-black text-base ${isReceipt ? 'text-emerald-700' : 'text-rose-700'}">${AppUtils.formatVND(Math.abs(Number(v.amount) || 0))}</span>
                    </div>
                </div>

                <div class="grid grid-cols-2 text-center text-[10px] text-slate-600 pt-3">
                    <div>
                        <p class="font-bold uppercase">${isReceipt ? 'Người nộp' : 'Người nhận'}</p>
                        <p class="italic text-[9px] text-slate-400">(Ký, họ tên)</p>
                        <div class="h-10"></div>
                        <p class="font-semibold">${v.targetName || ''}</p>
                    </div>
                    <div>
                        <p class="font-bold uppercase">Người lập phiếu</p>
                        <p class="italic text-[9px] text-slate-400">(Ký, họ tên)</p>
                        <div class="h-10"></div>
                        <p class="font-semibold">${v.pharmacist || ''}</p>
                    </div>
                </div>
            </div>
        `;

        modal.classList.remove('hidden');
        if (window.lucide) lucide.createIcons();
    },

    executePrint() {
        window.print();
    },

    closePrintModal() {
        document.getElementById('modal-voucher-print')?.classList.add('hidden');
    },

    deleteVoucherConfirm(voucherId) {
        if (confirm(`Bạn có chắc chắn muốn xóa phiếu ${voucherId} khỏi sổ quỹ?`)) {
            Store.deleteVoucher(voucherId);
            App.showToast(`Đã xóa phiếu ${voucherId}.`, 'info');
        }
    },

    viewVoucherDetail(voucherId) {
        this.printVoucher(voucherId);
    },

    exportExcel() {
        if (window.AuthModule && !AuthModule.canAccessTab('vouchers')) {
            if (window.AppUtils && AppUtils.showToast) {
                AppUtils.showToast('Bạn không có quyền xuất sổ quỹ thu chi!', 'warning');
            }
            return;
        }
        const list = this.getFilteredVouchers();
        if (list.length === 0) {
            alert('Không có phiếu thu chi nào để xuất file!');
            return;
        }

        let csv = '\uFEFFMã Phiếu,Thời Gian,Phân Loại,Phương Thức,Danh Mục / Lý Do,Người Nhận/Nộp,Đối Tượng,Số Tiền,Hạch Toán KD,Người Lập,Ghi Chú\n';
        list.forEach(v => {
            const typeStr = v.type === 'receipt' ? 'Phiếu Thu' : 'Phiếu Chi';
            const methodStr = v.paymentMethod === 'cash' ? 'Tiền mặt' : 'Chuyển khoản';
            const accStr = v.isAccounting !== false ? 'Có' : 'Không';
            const absAmt = Math.abs(Number(v.amount) || 0);
            csv += `"${v.id}","${AppUtils.formatDateTime(v.createdAt)}","${typeStr}","${methodStr}","${v.category}","${v.targetName || ''}","${this.formatTargetType(v.targetType)}",${absAmt},"${accStr}","${v.pharmacist || ''}","${(v.note || '').replace(/"/g, '""')}"\n`;
        });

        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `So_Quy_Thu_Chi_${new Date().toISOString().slice(0, 10)}.csv`;
        link.click();
    }
};

window.VouchersModule = VouchersModule;

