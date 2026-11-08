/**
 * MedicaPharmacy - Orders Management Module
 * Quản lý lịch sử hóa đơn bán thuốc
 * Tách biệt rõ ràng ĐƠN TIỀN MẶT và ĐƠN CHUYỂN KHOẢN
 */

const OrdersModule = {
    currentTab: 'all', // 'all', 'cash', 'transfer'
    timeFilter: 'this_month', // 'today', 'yesterday', 'last_7_days', 'this_month', 'all', 'custom'
    dateFrom: '',
    dateTo: '',
    searchKeyword: '',
    currentPage: 1,
    pageSize: 25,
    selectedOrder: null,
    pendingCancelOrderId: null,
    pendingReturnOrderId: null,

    init() {
        this.bindEvents();
        this.setTab('all');
        this.updateTabSummaryCards();

        Store.on('orders:changed', () => {
            this.renderOrdersTable();
            this.updateTabSummaryCards();
        });
    },

    bindEvents() {
        // Tìm kiếm đơn hàng
        const searchInput = document.getElementById('orders-search-input');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                this.searchKeyword = e.target.value.trim().toLowerCase();
                this.currentPage = 1;
                this.renderOrdersTable();
                this.updateTabSummaryCards();
            });
        }

        // Lọc theo mốc thời gian
        const timeSelect = document.getElementById('orders-time-filter');
        if (timeSelect) {
            timeSelect.addEventListener('change', (e) => {
                this.timeFilter = e.target.value;
                this.currentPage = 1;
                const customDiv = document.getElementById('orders-custom-dates');
                if (customDiv) {
                    if (e.target.value === 'custom') {
                        customDiv.classList.remove('hidden');
                        const dateFromInput = document.getElementById('orders-date-from');
                        const dateToInput = document.getElementById('orders-date-to');
                        if (dateFromInput && !dateFromInput.value) {
                            const now = new Date();
                            const todayStr = AppUtils.getLocalDateStr(now);
                            const firstDayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
                            dateFromInput.value = firstDayStr;
                            this.dateFrom = firstDayStr;
                        } else if (dateFromInput) {
                            this.dateFrom = dateFromInput.value;
                        }
                        if (dateToInput && !dateToInput.value) {
                            const now = new Date();
                            const todayStr = AppUtils.getLocalDateStr(now);
                            dateToInput.value = todayStr;
                            this.dateTo = todayStr;
                        } else if (dateToInput) {
                            this.dateTo = dateToInput.value;
                        }
                    } else {
                        customDiv.classList.add('hidden');
                    }
                }
                this.renderOrdersTable();
                this.updateTabSummaryCards();
            });
        }

        const dateFromInput = document.getElementById('orders-date-from');
        if (dateFromInput) {
            dateFromInput.addEventListener('change', (e) => {
                this.dateFrom = e.target.value;
                this.currentPage = 1;
                this.renderOrdersTable();
                this.updateTabSummaryCards();
            });
        }

        const dateToInput = document.getElementById('orders-date-to');
        if (dateToInput) {
            dateToInput.addEventListener('change', (e) => {
                this.dateTo = e.target.value;
                this.currentPage = 1;
                this.renderOrdersTable();
                this.updateTabSummaryCards();
            });
        }
    },

    setTab(tab) {
        this.currentTab = tab;
        this.currentPage = 1;

        // Cập nhật giao diện tab buttons với highlight & gạch chân rõ nét
        const tabAll = document.getElementById('tab-btn-orders-all');
        const tabCash = document.getElementById('tab-btn-orders-cash');
        const tabTransfer = document.getElementById('tab-btn-orders-transfer');

        if (tabAll) tabAll.className = 'tab-filter-btn' + (tab === 'all' ? ' active-emerald' : '');
        if (tabCash) tabCash.className = 'tab-filter-btn' + (tab === 'cash' ? ' active-amber' : '');
        if (tabTransfer) tabTransfer.className = 'tab-filter-btn' + (tab === 'transfer' ? ' active-blue' : '');

        this.renderOrdersTable();
    },

    getFilteredOrders() {
        let orders = Store.getOrders();

        // 1. Lọc theo Tab (Tất cả / Tiền mặt / Chuyển khoản)
        if (this.currentTab === 'cash') {
            orders = orders.filter(o => o.paymentMethod === 'cash');
        } else if (this.currentTab === 'transfer') {
            orders = orders.filter(o => o.paymentMethod === 'transfer');
        }

        // 2. Lọc theo Thời gian
        orders = orders.filter(o => AppUtils.matchesTimeFilter(o.createdAt, this.timeFilter, this.dateFrom, this.dateTo));

        // 3. Lọc theo từ khóa tìm kiếm
        if (this.searchKeyword) {
            const q = this.searchKeyword;
            orders = orders.filter(o => 
                (o.id && o.id.toLowerCase().includes(q)) ||
                (o.customerName && o.customerName.toLowerCase().includes(q)) ||
                (o.customerPhone && o.customerPhone.includes(q)) ||
                (o.transferCode && o.transferCode.toLowerCase().includes(q)) ||
                (o.items && o.items.some(i => i.medicineName && i.medicineName.toLowerCase().includes(q)))
            );
        }

        return orders;
    },

    updateTabSummaryCards() {
        const allOrders = Store.getOrders();
        
        // 1. Chỉ tính các đơn không bị hủy
        let validOrders = allOrders.filter(o => !o.isCancelled);

        // 2. Lọc theo mốc thời gian đang chọn
        validOrders = validOrders.filter(o => AppUtils.matchesTimeFilter(o.createdAt, this.timeFilter, this.dateFrom, this.dateTo));

        // 3. Lọc theo từ khóa tìm kiếm (nếu có)
        if (this.searchKeyword) {
            const q = this.searchKeyword;
            validOrders = validOrders.filter(o => 
                (o.id && o.id.toLowerCase().includes(q)) ||
                (o.customerName && o.customerName.toLowerCase().includes(q)) ||
                (o.customerPhone && o.customerPhone.includes(q)) ||
                (o.transferCode && o.transferCode.toLowerCase().includes(q)) ||
                (o.items && o.items.some(i => i.medicineName && i.medicineName.toLowerCase().includes(q)))
            );
        }

        const cashOrders = validOrders.filter(o => o.paymentMethod === 'cash');
        const transferOrders = validOrders.filter(o => o.paymentMethod === 'transfer');

        const totalCashAmount = cashOrders.reduce((sum, o) => sum + (o.totalAmount || 0), 0);
        const totalTransferAmount = transferOrders.reduce((sum, o) => sum + (o.totalAmount || 0), 0);
        const totalAllAmount = validOrders.reduce((sum, o) => sum + (o.totalAmount || 0), 0);

        // Update badge counts trên tabs tương ứng theo bộ lọc
        const badgeAll = document.getElementById('badge-count-all');
        const badgeCash = document.getElementById('badge-count-cash');
        const badgeTransfer = document.getElementById('badge-count-transfer');

        if (badgeAll) badgeAll.innerText = validOrders.length;
        if (badgeCash) badgeCash.innerText = cashOrders.length;
        if (badgeTransfer) badgeTransfer.innerText = transferOrders.length;

        // Update thẻ thống kê trên cùng trang Đơn Hàng tương ứng theo bộ lọc
        const cardTotalAll = document.getElementById('card-orders-total-all');
        const cardTotalCash = document.getElementById('card-orders-total-cash');
        const cardTotalTransfer = document.getElementById('card-orders-total-transfer');

        if (cardTotalAll) cardTotalAll.innerText = AppUtils.formatVND(totalAllAmount);
        if (cardTotalCash) cardTotalCash.innerText = AppUtils.formatVND(totalCashAmount);
        if (cardTotalTransfer) cardTotalTransfer.innerText = AppUtils.formatVND(totalTransferAmount);
    },

    // --- PHÂN TRANG HÓA ĐƠN ---
    changePageSize(newSize) {
        this.pageSize = (newSize === 'all') ? 'all' : parseInt(newSize, 10);
        this.currentPage = 1;
        this.renderOrdersTable();
    },

    goToPage(page) {
        this.currentPage = page;
        this.renderOrdersTable();
    },

    renderPaginationControls(total, totalPages, startIdx, count) {
        const pageInfoEl = document.getElementById('orders-page-info');
        const badgeTotal = document.getElementById('orders-count-badge');
        const btnsEl = document.getElementById('orders-pagination-buttons');
        
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
            <button onclick="OrdersModule.goToPage(1)" ${cur <= 1 ? 'disabled' : ''} 
                    class="p-1 px-2 rounded border border-slate-200 text-xs font-bold ${cur <= 1 ? 'opacity-40 cursor-not-allowed text-slate-400 bg-slate-50' : 'bg-white hover:bg-emerald-50 text-slate-700 hover:text-emerald-700 cursor-pointer'} transition" 
                    title="Về trang đầu">
                «
            </button>
        `;

        html += `
            <button onclick="OrdersModule.goToPage(${cur - 1})" ${cur <= 1 ? 'disabled' : ''} 
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
                    <button onclick="OrdersModule.goToPage(${p})" 
                            class="p-1 px-2.5 rounded bg-white hover:bg-emerald-50 text-slate-700 hover:text-emerald-700 border border-slate-200 text-xs font-bold transition cursor-pointer">
                        ${p}
                    </button>
                `;
            }
        }

        html += `
            <button onclick="OrdersModule.goToPage(${cur + 1})" ${cur >= totalPages ? 'disabled' : ''} 
                    class="p-1 px-2.5 rounded border border-slate-200 text-xs font-bold ${cur >= totalPages ? 'opacity-40 cursor-not-allowed text-slate-400 bg-slate-50' : 'bg-white hover:bg-emerald-50 text-slate-700 hover:text-emerald-700 cursor-pointer'} transition" 
                    title="Trang sau">
                ›
            </button>
        `;

        html += `
            <button onclick="OrdersModule.goToPage(${totalPages})" ${cur >= totalPages ? 'disabled' : ''} 
                    class="p-1 px-2 rounded border border-slate-200 text-xs font-bold ${cur >= totalPages ? 'opacity-40 cursor-not-allowed text-slate-400 bg-slate-50' : 'bg-white hover:bg-emerald-50 text-slate-700 hover:text-emerald-700 cursor-pointer'} transition" 
                    title="Đến trang cuối">
                »
            </button>
        `;

        btnsEl.innerHTML = html;
    },

    renderOrdersTable() {
        const tbody = document.getElementById('orders-table-tbody');
        if (!tbody) return;

        const orders = this.getFilteredOrders();
        const total = orders.length;

        if (total === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="8" class="text-center py-12 text-slate-400">
                        <i data-lucide="receipt-text" class="w-10 h-10 mx-auto mb-2 opacity-50"></i>
                        Không có hóa đơn nào thỏa mãn điều kiện lọc.
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

        let displayedOrders = orders;
        let startIdx = 0;
        if (this.pageSize !== 'all') {
            startIdx = (this.currentPage - 1) * this.pageSize;
            displayedOrders = orders.slice(startIdx, startIdx + this.pageSize);
        }

        this.renderPaginationControls(total, totalPages, startIdx, displayedOrders.length);

        const canCancelOrReturn = !window.AuthModule || AuthModule.canCancelOrReturnOrder();
        let html = '';
        displayedOrders.forEach((o, idx) => {
            const isCash = o.paymentMethod === 'cash';
            const isCancelled = o.isCancelled;
            const hasReturn = o.returns && o.returns.length > 0;
            const isFullyReturned = o.returnStatus === 'fully_returned';

            let methodBadge = '';
            if (isCash) {
                methodBadge = `<span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-300">
                    <i data-lucide="banknote" class="w-3.5 h-3.5"></i> Tiền mặt
                </span>`;
            } else {
                methodBadge = `<span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-100 text-blue-800 border border-blue-300">
                    <i data-lucide="qr-code" class="w-3.5 h-3.5"></i> Chuyển khoản (VietQR)
                </span>`;
            }

            let statusBadge = '';
            if (isCancelled) {
                statusBadge = '<span class="px-2 py-0.5 rounded text-xs font-bold bg-rose-100 text-rose-800">ĐÃ HỦY</span>';
            } else if (isFullyReturned) {
                statusBadge = `<span class="px-2 py-0.5 rounded text-xs font-bold bg-purple-100 text-purple-800" title="Đã hoàn trả toàn bộ ${AppUtils.formatVND(o.totalRefunded || 0)}">ĐÃ TRẢ HẾT</span>`;
            } else if (o.returnStatus === 'partially_returned') {
                statusBadge = `<span class="px-2 py-0.5 rounded text-xs font-bold bg-amber-100 text-amber-800" title="Đã hoàn trả ${AppUtils.formatVND(o.totalRefunded || 0)}">TRẢ 1 PHẦN</span>`;
            } else {
                statusBadge = '<span class="px-2 py-0.5 rounded text-xs font-semibold bg-emerald-100 text-emerald-800">Hoàn tất</span>';
            }

            const itemsSummary = (o.items || []).map(i => `${i.medicineName} (${i.quantity} ${i.unit})`).join(', ');

            // Cột Khách Hàng: click vào tên để xem thông tin & lịch sử khách hàng
            const custPhone = (o.customerPhone || '').trim();
            const custName = (o.customerName || '').trim();
            const isRetail = !custPhone && (!custName || custName.toLowerCase() === 'khách vãng lai' || custName.toLowerCase() === 'khách lẻ');

            let customerCellHtml = '';
            if (!isRetail) {
                const safeCustLookup = (custPhone || o.customerId || custName).replace(/'/g, "\\'");
                customerCellHtml = `
                    <button type="button" 
                            onclick="CustomersModule.openCustomerOrdersModal('${safeCustLookup}')"
                            class="font-semibold text-slate-800 hover:text-emerald-700 hover:underline cursor-pointer text-left transition flex items-center gap-1 group"
                            title="Bấm để xem hồ sơ và lịch sử đơn hàng của khách">
                        <span>${custName || 'Khách hàng'}</span>
                        <i data-lucide="user-check" class="w-3.5 h-3.5 text-emerald-600 opacity-60 group-hover:opacity-100"></i>
                    </button>
                    ${custPhone ? `<div class="text-xs text-slate-500 font-mono mt-0.5">${custPhone}</div>` : ''}
                    ${o.pointsEarned ? `<div class="inline-flex items-center gap-1 text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.2 rounded-full mt-0.5">⭐ +${o.pointsEarned} điểm</div>` : ''}
                `;
            } else {
                customerCellHtml = `
                    <div class="font-semibold text-slate-400 italic">Khách vãng lai</div>
                `;
            }

            html += `
                <tr class="border-b border-slate-100 hover:bg-slate-50 transition text-sm ${isCancelled ? 'opacity-50 bg-slate-50/80 line-through' : ''}">
                    <td class="py-3 px-3 text-center text-slate-400 font-mono text-xs">${startIdx + idx + 1}</td>
                    <td class="py-3 px-3">
                        <div class="font-mono font-bold text-slate-800 text-sm hover:text-emerald-700 cursor-pointer" onclick="OrdersModule.openOrderDetails('${o.id}')" title="Bấm để xem chi tiết hóa đơn">${o.id}</div>
                        <div class="text-[11px] text-slate-400">${AppUtils.formatDateTime(o.createdAt)}</div>
                    </td>
                    <td class="py-3 px-3">
                        ${methodBadge}
                        ${o.transferCode ? `<div class="text-[11px] font-mono text-slate-500 mt-1">Mã GD: ${o.transferCode}</div>` : ''}
                    </td>
                    <td class="py-3 px-3">
                        ${customerCellHtml}
                    </td>
                    <td class="py-3 px-3">
                        <div class="text-xs text-slate-600 line-clamp-1 max-w-xs" title="${itemsSummary}">${itemsSummary}</div>
                        <div class="text-[11px] text-slate-400 mt-0.5">Dược sĩ: ${o.pharmacist || '---'}</div>
                    </td>
                    <td class="py-3 px-3 text-right">
                        <div class="font-bold text-slate-900 text-sm">${AppUtils.formatVND(o.totalAmount)}</div>
                        ${hasReturn ? `<div class="text-[11px] text-rose-600 font-semibold">Đã hoàn: -${AppUtils.formatVND(o.totalRefunded)}</div>` : ''}
                        ${isCash && o.changeAmount > 0 && !hasReturn ? `<div class="text-[11px] text-slate-400">Thối: ${AppUtils.formatVND(o.changeAmount)}</div>` : ''}
                    </td>
                    <td class="py-3 px-3 text-center">
                        ${statusBadge}
                    </td>
                    <td class="py-3 px-3 text-center">
                        <div class="flex items-center justify-center gap-1">
                            <button onclick="OrdersModule.reprintOrder('${o.id}')" title="In lại hóa đơn" class="p-1.5 text-slate-600 hover:text-blue-700 hover:bg-blue-50 rounded transition cursor-pointer">
                                <i data-lucide="printer" class="w-4 h-4"></i>
                            </button>
                            ${!isCancelled ? `
                            <button onclick="OrdersModule.openEditOrderModal('${o.id}')" title="Chỉnh sửa hóa đơn (Đổi tiền mặt / chuyển khoản, thông tin khách, ghi chú)" class="p-1.5 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded transition cursor-pointer">
                                <i data-lucide="edit-3" class="w-4 h-4"></i>
                            </button>` : ''}
                            ${canCancelOrReturn && !isCancelled && !isFullyReturned ? `
                            <button onclick="OrdersModule.openReturnModal('${o.id}')" title="Khách trả thuốc & trừ quỹ tiền mặt" class="p-1.5 text-amber-600 hover:text-amber-800 hover:bg-amber-50 rounded transition cursor-pointer">
                                <i data-lucide="corner-down-left" class="w-4 h-4"></i>
                            </button>` : ''}
                            ${canCancelOrReturn && !isCancelled ? `
                            <button onclick="OrdersModule.openCancelModal('${o.id}')" title="Hủy hóa đơn & hoàn kho" class="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition cursor-pointer">
                                <i data-lucide="x-circle" class="w-4 h-4"></i>
                            </button>` : ''}
                        </div>
                    </td>
                </tr>
            `;
        });

        tbody.innerHTML = html;
        if (window.lucide) lucide.createIcons();
    },

    openOrderDetailsModal(orderId) {
        this.openOrderDetails(orderId);
    },

    openOrderDetails(orderId) {
        const order = Store.getOrderById(orderId);
        if (!order) return;

        this.selectedOrder = order;
        const modal = document.getElementById('modal-order-details');
        const body = document.getElementById('order-details-body');
        if (!modal || !body) return;

        const isCash = order.paymentMethod === 'cash';
        const hasReturns = order.returns && order.returns.length > 0;
        const isFullyReturned = order.returnStatus === 'fully_returned';
        const canCancelOrReturn = !window.AuthModule || AuthModule.canCancelOrReturnOrder();
        const netTotal = Math.max(0, (order.totalAmount || 0) - (order.totalRefunded || 0));

        let itemsHtml = '';
        (order.items || []).forEach((item, i) => {
            // Tính số lượng đã trả của món này nếu có
            const returnedQty = (order.returns || []).reduce((sum, r) => {
                const ri = (r.items || []).find(x => x.medicineId === item.medicineId && x.unit === item.unit);
                return sum + (ri ? ri.quantity : 0);
            }, 0);

            const med = Store.getMedicineById(item.medicineId) || Store.getMedicines().find(m => m.name === item.medicineName);
            const medId = med ? med.id : item.medicineId;
            const stockDisplay = med ? AppUtils.formatStockUnitsDisplay(med) : 'Chưa rõ';

            itemsHtml += `
                <tr class="border-b border-slate-100 text-xs hover:bg-slate-50/70 transition">
                    <td class="py-2.5 px-2 text-center text-slate-400 font-mono">${i + 1}</td>
                    <td class="py-2.5 px-2">
                        <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                            <button type="button" onclick="OrdersModule.viewMedicineWarehouseDetails('${medId}')" 
                                class="text-left font-bold text-emerald-700 hover:text-emerald-900 hover:underline inline-flex items-center gap-1.5 group cursor-pointer flex-wrap" 
                                title="Nhấn để xem số lượng tồn kho & toàn bộ lịch sử xuất/nhập/bán của thuốc này">
                                <span class="font-mono text-[11px] font-bold text-emerald-800 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">${item.medicineId || medId}</span>
                                <span class="text-xs sm:text-sm font-bold">${item.medicineName}</span>
                                <i data-lucide="external-link" class="w-3.5 h-3.5 opacity-70 group-hover:opacity-100 text-emerald-600 shrink-0"></i>
                            </button>
                            <span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 w-fit cursor-pointer hover:bg-emerald-100 transition" onclick="OrdersModule.viewMedicineWarehouseDetails('${medId}')" title="Tồn kho thực tế trong hệ thống">
                                <i data-lucide="boxes" class="w-3 h-3 text-emerald-600"></i>
                                <span>Tồn: ${stockDisplay}</span>
                            </span>
                        </div>
                        ${item.usage ? `<div class="italic text-[11px] text-slate-500 mt-0.5">${item.usage}</div>` : ''}
                    </td>
                    <td class="py-2.5 px-2 text-center font-semibold text-slate-700">
                        ${item.quantity} ${item.unit}
                        ${returnedQty > 0 ? `<div class="text-[10px] text-rose-600 font-bold">(Đã trả: ${returnedQty} ${item.unit})</div>` : ''}
                    </td>
                    <td class="py-2.5 px-2 text-right">${AppUtils.formatVND(item.price || item.unitPrice || 0)}</td>
                    <td class="py-2.5 px-2 text-right font-bold text-emerald-700">${AppUtils.formatVND((item.price || item.unitPrice || 0) * (item.quantity || 1))}</td>
                </tr>
            `;
        });

        // Bảng lịch sử trả hàng nếu có
        let returnsHtml = '';
        if (hasReturns) {
            returnsHtml = `
                <div class="bg-amber-50/80 border border-amber-200 rounded-xl p-3 space-y-2">
                    <div class="flex items-center justify-between text-xs font-bold text-amber-900 border-b border-amber-200 pb-1.5">
                        <span class="flex items-center gap-1.5">
                            <i data-lucide="corner-down-left" class="w-4 h-4 text-amber-600"></i>
                            LỊCH SỬ TRẢ HÀNG & HOÀN TIỀN MẶT
                        </span>
                        <span class="text-rose-700 font-black">Tổng hoàn: -${AppUtils.formatVND(order.totalRefunded)}</span>
                    </div>
                    <div class="space-y-1.5 divide-y divide-amber-100 text-xs">
                        ${order.returns.map((ret, rIdx) => {
                            const rItems = (ret.items || []).map(ri => `${ri.medicineName} (${ri.quantity} ${ri.unit})`).join(', ');
                            return `
                                <div class="pt-1.5 text-slate-700">
                                    <div class="flex justify-between font-semibold">
                                        <span>#${rIdx + 1} • ${AppUtils.formatDateTime(ret.createdAt)}</span>
                                        <span class="text-rose-700 font-bold">-${AppUtils.formatVND(ret.refundTotal)} (Trừ quỹ tiền mặt)</span>
                                    </div>
                                    <div class="text-[11px] text-slate-600 mt-0.5">Thuốc trả: ${rItems}</div>
                                    <div class="text-[11px] text-slate-500 italic">Lý do: ${ret.reason || 'Khách trả hàng'} • Dược sĩ: ${ret.pharmacist || '---'}</div>
                                </div>
                            `;
                        }).join('')}
                    </div>
                </div>
            `;
        }

        body.innerHTML = `
            <div class="space-y-4 text-sm">
                <div class="flex justify-between items-start pb-3 border-b border-slate-200">
                    <div>
                        <div class="text-lg font-bold text-slate-800">Hóa đơn: <span class="font-mono text-emerald-700">${order.id}</span></div>
                        <div class="text-xs text-slate-500">Thời gian tạo: ${AppUtils.formatDateTime(order.createdAt)}</div>
                    </div>
                    <div class="text-right">
                        ${order.isCancelled ? 
                            '<span class="bg-rose-100 text-rose-800 font-bold px-3 py-1 rounded-full text-xs">ĐÃ HỦY ĐƠN</span>' : 
                            (isFullyReturned ? 
                                '<span class="bg-purple-100 text-purple-800 font-bold px-3 py-1 rounded-full text-xs">ĐÃ TRẢ HẾT</span>' :
                                (order.returnStatus === 'partially_returned' ?
                                    '<span class="bg-amber-100 text-amber-800 font-bold px-3 py-1 rounded-full text-xs">TRẢ 1 PHẦN</span>' :
                                    '<span class="bg-emerald-100 text-emerald-800 font-bold px-3 py-1 rounded-full text-xs">HOÀN TẤT</span>'))}
                    </div>
                </div>

                <div class="grid grid-cols-2 gap-4 bg-slate-50 p-3 rounded-lg text-xs">
                    <div>
                        <p class="text-slate-500">Khách hàng:</p>
                        ${order.customerPhone || (order.customerName && order.customerName !== 'Khách vãng lai') ? `
                            <button type="button" 
                                    onclick="CustomersModule.openCustomerOrdersModal('${(order.customerPhone || order.customerId || order.customerName).replace(/'/g, "\\'")}');" 
                                    class="font-bold text-slate-800 hover:text-emerald-700 hover:underline cursor-pointer text-left flex items-center gap-1 mt-0.5" 
                                    title="Bấm để xem hồ sơ và lịch sử đơn hàng của khách">
                                <span>${order.customerName || 'Khách hàng'}</span>
                                <i data-lucide="user-check" class="w-3.5 h-3.5 text-emerald-600"></i>
                            </button>
                        ` : `<p class="font-bold text-slate-800 mt-0.5">${order.customerName || 'Khách vãng lai'}</p>`}
                        <p class="text-slate-500 mt-1">Số điện thoại: <span class="font-mono text-slate-700">${order.customerPhone || '---'}</span></p>
                        ${order.pointsEarned ? `<p class="mt-1"><span class="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-800 bg-emerald-100 border border-emerald-300 px-2 py-0.5 rounded-full">⭐ Tích lũy đơn: +${order.pointsEarned} điểm</span></p>` : ''}
                        ${order.pointsUsed ? `<p class="mt-0.5"><span class="inline-flex items-center gap-1 text-[11px] font-bold text-rose-800 bg-rose-100 border border-rose-300 px-2 py-0.5 rounded-full">⭐ Đã dùng: -${order.pointsUsed} điểm (-${AppUtils.formatVND(order.pointsDiscount || order.pointsUsed * 1000)})</span></p>` : ''}
                    </div>
                    <div>
                        <p class="text-slate-500">Phương thức thanh toán:</p>
                        <p class="font-bold ${isCash ? 'text-amber-700' : 'text-blue-700'}">
                            ${isCash ? 'TIỀN MẶT' : 'CHUYỂN KHOẢN (VietQR)'}
                        </p>
                        ${order.transferCode ? `<p class="text-slate-500 mt-1">Mã GD: <span class="font-mono font-bold">${order.transferCode}</span></p>` : ''}
                        <p class="text-slate-500 mt-1">Dược sĩ: <span class="text-slate-700">${order.pharmacist}</span></p>
                    </div>
                </div>

                <div>
                    <h4 class="font-bold text-slate-700 mb-1 text-xs uppercase tracking-wider">Danh sách thuốc trong đơn:</h4>
                    <table class="w-full text-left border border-slate-200 rounded overflow-hidden">
                        <thead class="bg-slate-100 text-[11px] text-slate-600 font-semibold">
                            <tr>
                                <th class="p-2 text-center w-8">#</th>
                                <th class="p-2">Tên Thuốc / Liều dùng</th>
                                <th class="p-2 text-center">Số lượng</th>
                                <th class="p-2 text-right">Đơn giá</th>
                                <th class="p-2 text-right">Thành tiền</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${itemsHtml}
                        </tbody>
                    </table>
                </div>

                ${returnsHtml}

                <div class="border-t border-slate-200 pt-3 space-y-1.5 text-xs">
                    <div class="flex justify-between">
                        <span class="text-slate-600">Tiền hàng gốc:</span>
                        <span class="font-medium">${AppUtils.formatVND(order.subTotal || order.totalAmount || 0)}</span>
                    </div>
                    ${order.discount > 0 ? `
                    <div class="flex justify-between text-rose-600">
                        <span>Chiết khấu / Giảm giá:</span>
                        <span>-${AppUtils.formatVND(order.discount)}</span>
                    </div>` : ''}
                    ${order.pointsUsed > 0 ? `
                    <div class="flex justify-between text-amber-800 font-bold">
                        <span>⭐ Dùng điểm tích lũy (-${order.pointsUsed} điểm):</span>
                        <span>-${AppUtils.formatVND(order.pointsDiscount || order.pointsUsed * 1000)}</span>
                    </div>` : ''}
                    <div class="flex justify-between text-sm font-extrabold text-slate-900 border-t border-slate-200 pt-1.5">
                        <span>TỔNG THANH TOÁN BAN ĐẦU:</span>
                        <span class="text-emerald-700">${AppUtils.formatVND(order.totalAmount)}</span>
                    </div>
                    ${hasReturns ? `
                    <div class="flex justify-between text-rose-700 font-bold">
                        <span>Đã hoàn tiền mặt khách trả thuốc:</span>
                        <span>-${AppUtils.formatVND(order.totalRefunded)}</span>
                    </div>
                    <div class="flex justify-between text-base font-black text-slate-900 border-t border-slate-200 pt-1">
                        <span>THỰC THU SAU TRẢ HÀNG:</span>
                        <span class="text-emerald-800">${AppUtils.formatVND(netTotal)}</span>
                    </div>` : ''}
                </div>

                ${order.note ? `
                <div class="bg-amber-50 p-2.5 rounded border border-amber-200 text-xs text-amber-900">
                    <span class="font-bold">Ghi chú bệnh nhân:</span> ${order.note}
                </div>` : ''}

                ${order.isCancelled && order.cancelReason ? `
                <div class="bg-rose-50 p-2.5 rounded border border-rose-200 text-xs text-rose-900">
                    <span class="font-bold">Lý do hủy đơn:</span> ${order.cancelReason} (${AppUtils.formatDateTime(order.cancelledAt)})
                </div>` : ''}

                <!-- Các nút hành động nghiệp vụ -->
                <div class="pt-3 border-t border-slate-200 flex flex-wrap justify-end gap-2">
                    ${canCancelOrReturn && !order.isCancelled && !isFullyReturned ? `
                    <button onclick="OrdersModule.openReturnModal('${order.id}')" class="px-3.5 py-2 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 text-xs font-bold rounded-lg transition flex items-center gap-1.5 cursor-pointer">
                        <i data-lucide="corner-down-left" class="w-4 h-4"></i>
                        <span>Trả Hàng & Hoàn Tiền Mặt</span>
                    </button>` : ''}

                    ${canCancelOrReturn && !order.isCancelled ? `
                    <button onclick="OrdersModule.openCancelModal('${order.id}')" class="px-3.5 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-bold rounded-lg transition flex items-center gap-1.5 cursor-pointer">
                        <i data-lucide="x-circle" class="w-4 h-4"></i>
                        <span>Hủy Đơn Hàng</span>
                    </button>` : ''}
                </div>
            </div>
        `;

        const btnEditFromDetails = document.getElementById('btn-edit-from-order-details');
        if (btnEditFromDetails) {
            if (order.isCancelled) {
                btnEditFromDetails.classList.add('hidden');
            } else {
                btnEditFromDetails.classList.remove('hidden');
            }
        }

        modal.classList.remove('hidden');
        if (window.lucide) lucide.createIcons();
    },

    closeOrderDetailsModal() {
        document.getElementById('modal-order-details')?.classList.add('hidden');
    },

    // Mở xem thông tin tồn kho & lịch sử xuất nhập bên kho thuốc
    viewMedicineWarehouseDetails(medicineId) {
        if (!medicineId) {
            AppUtils.showToast('Không tìm thấy thông tin thuốc trong hệ thống kho', 'error');
            return;
        }
        if (window.InventoryModule && InventoryModule.openMedicineHistoryModal) {
            InventoryModule.openMedicineHistoryModal(medicineId);
        } else {
            AppUtils.showToast('Chức năng kho thuốc chưa sẵn sàng', 'error');
        }
    },

    reprintOrder(orderId) {
        const order = Store.getOrderById(orderId);
        if (!order) return;
        POSModule.showReceiptPreview(order);
    },

    // --- HỦY ĐƠN HÀNG (CANCEL ORDER MODAL) ---
    openCancelModal(orderId) {
        if (window.AuthModule && !AuthModule.canCancelOrReturnOrder()) {
            if (window.AppUtils && AppUtils.showToast) {
                AppUtils.showToast('Bạn không có quyền hủy đơn hàng. Chỉ Quản trị viên (Admin) mới có quyền này!', 'warning');
            } else {
                alert('Chỉ Admin mới có quyền hủy đơn hàng!');
            }
            return;
        }

        const order = Store.getOrderById(orderId);
        if (!order || order.isCancelled) return;

        this.pendingCancelOrderId = orderId;
        const modal = document.getElementById('modal-cancel-order');
        if (!modal) return;

        document.getElementById('cancel-order-id').innerText = order.id;
        document.getElementById('cancel-order-customer').innerText = `${order.customerName || 'Khách vãng lai'} ${order.customerPhone ? `(${order.customerPhone})` : ''}`;
        document.getElementById('cancel-order-amount').innerText = AppUtils.formatVND(order.totalAmount);

        const pointsWarn = document.getElementById('cancel-order-points-warning');
        if (order.pointsEarned && order.pointsEarned > 0) {
            pointsWarn.innerText = `⚠️ Lưu ý: Thu hồi lại ${order.pointsEarned} điểm tích lũy của khách từ đơn này.`;
            if (order.pointsUsed && order.pointsUsed > 0) {
                pointsWarn.innerText += ` Đồng thời hoàn trả lại ${order.pointsUsed} điểm khách đã sử dụng.`;
            }
            pointsWarn.classList.remove('hidden');
        } else if (order.pointsUsed && order.pointsUsed > 0) {
            pointsWarn.innerText = `⚠️ Lưu ý: Hoàn trả lại ${order.pointsUsed} điểm khách đã sử dụng cho đơn này.`;
            pointsWarn.classList.remove('hidden');
        } else {
            pointsWarn.classList.add('hidden');
        }

        const reasonSelect = document.getElementById('cancel-order-reason-select');
        if (reasonSelect) reasonSelect.value = 'Khách đổi ý không mua';
        const reasonCustom = document.getElementById('cancel-order-reason-custom');
        if (reasonCustom) {
            reasonCustom.value = '';
            reasonCustom.classList.add('hidden');
        }

        modal.classList.remove('hidden');
        if (window.lucide) lucide.createIcons();
    },

    closeCancelModal() {
        document.getElementById('modal-cancel-order')?.classList.add('hidden');
        this.pendingCancelOrderId = null;
    },

    handleCancelReasonChange() {
        const sel = document.getElementById('cancel-order-reason-select');
        const custom = document.getElementById('cancel-order-reason-custom');
        if (!sel || !custom) return;

        if (sel.value === 'other') {
            custom.classList.remove('hidden');
            custom.focus();
        } else {
            custom.classList.add('hidden');
        }
    },

    confirmCancelOrder() {
        if (!this.pendingCancelOrderId) return;
        const orderId = this.pendingCancelOrderId;
        const order = Store.getOrderById(orderId);
        if (!order) return;

        const sel = document.getElementById('cancel-order-reason-select');
        const custom = document.getElementById('cancel-order-reason-custom');
        let reason = sel ? sel.value : 'Khách hủy đơn';
        if (reason === 'other' && custom && custom.value.trim()) {
            reason = custom.value.trim();
        }

        Store.cancelOrder(orderId, reason);
        this.closeCancelModal();

        // Nếu đang mở xem chi tiết đơn này thì đóng lại
        this.closeOrderDetailsModal();

        App.showToast(`Đã hủy đơn ${orderId}, hoàn trả thuốc vào kho thành công!`, 'success');
        AppUtils.playBeepSound('success');
    },

    // --- TRẢ HÀNG & HOÀN TIỀN MẶT (RETURN ITEMS MODAL) ---
    openReturnModal(orderId) {
        if (window.AuthModule && !AuthModule.canCancelOrReturnOrder()) {
            if (window.AppUtils && AppUtils.showToast) {
                AppUtils.showToast('Bạn không có quyền thực hiện trả hàng / hoàn tiền. Chỉ Quản trị viên (Admin) mới có quyền này!', 'warning');
            } else {
                alert('Chỉ Admin mới có quyền thực hiện trả hàng / hoàn tiền!');
            }
            return;
        }

        const order = Store.getOrderById(orderId);
        if (!order || order.isCancelled || order.returnStatus === 'fully_returned') {
            alert('Đơn hàng này không thể trả hàng (đã hủy hoặc đã trả hết).');
            return;
        }

        this.pendingReturnOrderId = orderId;
        const modal = document.getElementById('modal-return-order');
        const tbody = document.getElementById('return-items-tbody');
        if (!modal || !tbody) return;

        document.getElementById('return-modal-order-id').innerText = order.id;
        document.getElementById('return-modal-customer').innerText = order.customerName || 'Khách vãng lai';
        document.getElementById('return-modal-time').innerText = AppUtils.formatDateTime(order.createdAt);
        document.getElementById('return-modal-original-total').innerText = AppUtils.formatVND(order.totalAmount);

        // Reset lý do trả
        const selReason = document.getElementById('return-reason-select');
        if (selReason) selReason.value = 'Khách dùng không hết / dư thuốc';
        const customReason = document.getElementById('return-reason-custom');
        if (customReason) {
            customReason.value = '';
            customReason.classList.add('hidden');
        }

        // Render từng loại thuốc trong đơn để người dùng nhập số lượng trả
        let rowsHtml = '';
        (order.items || []).forEach((item, idx) => {
            // Số lượng đã trả trước đó
            const alreadyReturned = (order.returns || []).reduce((sum, r) => {
                const ri = (r.items || []).find(x => x.medicineId === item.medicineId && x.unit === item.unit);
                return sum + (ri ? ri.quantity : 0);
            }, 0);

            const remainingQty = Math.max(0, item.quantity - alreadyReturned);

            if (remainingQty > 0) {
                const med = Store.getMedicineById(item.medicineId) || Store.getMedicines().find(m => m.name === item.medicineName);
                const medId = med ? med.id : item.medicineId;
                const stockDisplay = med ? AppUtils.formatStockUnitsDisplay(med) : '---';

                rowsHtml += `
                    <tr class="border-b border-slate-100 hover:bg-slate-50 text-xs">
                        <td class="p-2.5">
                            <div>
                                <button type="button" onclick="OrdersModule.viewMedicineWarehouseDetails('${medId}')" 
                                    class="text-left font-bold text-emerald-700 hover:text-emerald-900 hover:underline inline-flex items-center gap-1 group cursor-pointer"
                                    title="Xem tồn kho & lịch sử xuất nhập">
                                    <span>${item.medicineName}</span>
                                    <i data-lucide="external-link" class="w-3.5 h-3.5 opacity-70 group-hover:opacity-100 text-emerald-600 shrink-0"></i>
                                </button>
                            </div>
                            <div class="text-[11px] text-slate-400 font-mono flex items-center gap-2 mt-0.5">
                                <span>Mã: ${item.medicineId}</span>
                                <span class="text-emerald-700 font-bold bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">Tồn: ${stockDisplay}</span>
                            </div>
                        </td>
                        <td class="p-2.5 text-center font-semibold text-slate-600">${item.unit}</td>
                        <td class="p-2.5 text-right font-medium text-slate-700">${AppUtils.formatVND(item.price)}</td>
                        <td class="p-2.5 text-center text-slate-500">${item.quantity}</td>
                        <td class="p-2.5 text-center font-bold text-emerald-700">${remainingQty}</td>
                        <td class="p-2.5 text-center">
                            <div class="flex items-center justify-center gap-1">
                                <input type="number" id="return-qty-${idx}" min="0" max="${remainingQty}" value="0"
                                       data-idx="${idx}" data-medid="${item.medicineId}" data-medname="${item.medicineName}" data-unit="${item.unit}" data-price="${item.price}" data-max="${remainingQty}"
                                       oninput="OrdersModule.updateReturnCalculations()"
                                       class="w-16 px-2 py-1 text-center font-bold text-rose-700 bg-white border border-slate-300 rounded focus:ring-1 focus:ring-amber-500 outline-none" />
                                <button type="button" onclick="OrdersModule.setReturnQtyMax(${idx}, ${remainingQty})" class="text-[10px] bg-slate-100 hover:bg-amber-100 text-slate-700 px-1.5 py-1 rounded border border-slate-200 transition" title="Trả hết số lượng">Hết</button>
                            </div>
                        </td>
                        <td class="p-2.5 text-right font-bold text-rose-700 font-mono" id="return-line-total-${idx}">0 đ</td>
                    </tr>
                `;
            }
        });

        if (!rowsHtml) {
            tbody.innerHTML = '<tr><td colspan="7" class="text-center py-6 text-slate-400">Tất cả thuốc trong đơn này đã được hoàn trả hết.</td></tr>';
        } else {
            tbody.innerHTML = rowsHtml;
        }

        this.updateReturnCalculations();
        modal.classList.remove('hidden');
        if (window.lucide) lucide.createIcons();
    },

    setReturnQtyMax(idx, max) {
        const inp = document.getElementById(`return-qty-${idx}`);
        if (inp) {
            inp.value = max;
            this.updateReturnCalculations();
        }
    },

    closeReturnModal() {
        document.getElementById('modal-return-order')?.classList.add('hidden');
        this.pendingReturnOrderId = null;
    },

    handleReturnReasonChange() {
        const sel = document.getElementById('return-reason-select');
        const custom = document.getElementById('return-reason-custom');
        if (!sel || !custom) return;

        if (sel.value === 'other') {
            custom.classList.remove('hidden');
            custom.focus();
        } else {
            custom.classList.add('hidden');
        }
    },

    updateReturnCalculations() {
        const inputs = document.querySelectorAll('input[id^="return-qty-"]');
        let totalRefund = 0;

        inputs.forEach(inp => {
            const idx = inp.dataset.idx;
            const max = parseInt(inp.dataset.max) || 0;
            let val = parseInt(inp.value) || 0;

            if (val < 0) val = 0;
            if (val > max) val = max;
            inp.value = val;

            const price = parseFloat(inp.dataset.price) || 0;
            const lineTotal = val * price;
            totalRefund += lineTotal;

            const lineEl = document.getElementById(`return-line-total-${idx}`);
            if (lineEl) lineEl.innerText = AppUtils.formatVND(lineTotal);
        });

        const totalEl = document.getElementById('return-calc-total-refund');
        if (totalEl) totalEl.innerText = AppUtils.formatVND(totalRefund);

        // Điểm tích lũy bị trừ tương ứng
        const pointsDeduct = Math.floor(totalRefund / 100000);
        const ptsEl = document.getElementById('return-calc-points-deduct');
        if (ptsEl) {
            ptsEl.innerText = `⭐ Điểm tích lũy trừ lại: -${pointsDeduct} điểm (Quy đổi 100k = 1đ)`;
        }

        const confirmBtn = document.getElementById('btn-confirm-return');
        if (confirmBtn) {
            confirmBtn.disabled = (totalRefund <= 0);
        }
    },

    confirmReturnOrder() {
        if (!this.pendingReturnOrderId) return;
        const orderId = this.pendingReturnOrderId;

        const inputs = document.querySelectorAll('input[id^="return-qty-"]');
        const returnedItems = [];

        inputs.forEach(inp => {
            const qty = parseInt(inp.value) || 0;
            if (qty > 0) {
                returnedItems.push({
                    medicineId: inp.dataset.medid,
                    medicineName: inp.dataset.medname,
                    unit: inp.dataset.unit,
                    quantity: qty,
                    price: parseFloat(inp.dataset.price) || 0
                });
            }
        });

        if (returnedItems.length === 0) {
            alert('Vui lòng nhập số lượng thuốc khách muốn trả lại!');
            return;
        }

        const sel = document.getElementById('return-reason-select');
        const custom = document.getElementById('return-reason-custom');
        let reason = sel ? sel.value : 'Khách trả hàng';
        if (reason === 'other' && custom && custom.value.trim()) {
            reason = custom.value.trim();
        }

        const res = Store.returnOrderItems(orderId, returnedItems, reason, 'cash');
        if (!res) {
            alert('Có lỗi xảy ra khi thực hiện trả hàng.');
            return;
        }

        this.closeReturnModal();
        // Cập nhật lại modal chi tiết nếu đang mở
        this.openOrderDetails(orderId);

        App.showToast(`Đã trả hàng thành công! Đã trừ ${AppUtils.formatVND(res.returnRecord.refundTotal)} vào quỹ tiền mặt và hoàn kho thuốc.`, 'success');
        AppUtils.playBeepSound('success');
    },

    // ========================================================
    // MODAL: CHỈNH SỬA HÓA ĐƠN
    // ========================================================
    openEditOrderModal(orderId) {
        const order = Store.getOrderById(orderId);
        if (!order) {
            App.showToast('Không tìm thấy hóa đơn cần chỉnh sửa.', 'error');
            return;
        }

        if (order.isCancelled) {
            App.showToast('Không thể chỉnh sửa hóa đơn đã bị hủy.', 'warning');
            return;
        }

        const modal = document.getElementById('modal-edit-order');
        if (!modal) return;

        // Điền dữ liệu tóm tắt
        const elId = document.getElementById('edit-order-id');
        const elDispId = document.getElementById('edit-order-display-id');
        const elDispTime = document.getElementById('edit-order-display-time');
        const elDispAmount = document.getElementById('edit-order-display-amount');

        if (elId) elId.value = order.id;
        if (elDispId) elDispId.innerText = order.id;
        if (elDispTime) elDispTime.innerText = `Tạo lúc: ${AppUtils.formatDateTime(order.createdAt)}`;
        if (elDispAmount) elDispAmount.innerText = AppUtils.formatVND(order.totalAmount);

        // Hình thức thanh toán
        const isTransfer = order.paymentMethod === 'transfer';
        const radioTransfer = document.getElementById('edit-method-transfer');
        const radioCash = document.getElementById('edit-method-cash');
        if (isTransfer) {
            if (radioTransfer) radioTransfer.checked = true;
            this.onEditPaymentMethodChange('transfer');
        } else {
            if (radioCash) radioCash.checked = true;
            this.onEditPaymentMethodChange('cash');
        }

        const elTransferCode = document.getElementById('edit-transfer-code');
        const elCashGiven = document.getElementById('edit-cash-given');
        if (elTransferCode) elTransferCode.value = order.transferCode || '';
        if (elCashGiven) elCashGiven.value = order.cashGiven || order.totalAmount || 0;
        this.calculateEditChangeDue();

        // Khách hàng & ghi chú
        const elCustName = document.getElementById('edit-customer-name');
        const elCustPhone = document.getElementById('edit-customer-phone');
        const elNote = document.getElementById('edit-order-note');

        if (elCustName) elCustName.value = order.customerName || '';
        if (elCustPhone) elCustPhone.value = order.customerPhone || '';
        if (elNote) elNote.value = order.note || '';

        modal.classList.remove('hidden');
        if (window.lucide) lucide.createIcons();
    },

    onEditPaymentMethodChange(method) {
        const labelCash = document.getElementById('label-method-cash');
        const labelTransfer = document.getElementById('label-method-transfer');
        const groupTransfer = document.getElementById('edit-transfer-code-group');
        const groupCash = document.getElementById('edit-cash-group');

        const activeCashClass = ['border-emerald-500', 'bg-emerald-50/50'];
        const activeTransferClass = ['border-blue-500', 'bg-blue-50/50'];
        const inactiveClass = ['border-slate-200', 'bg-white'];

        if (method === 'cash') {
            labelCash?.classList.remove(...inactiveClass);
            labelCash?.classList.add(...activeCashClass);
            labelTransfer?.classList.remove(...activeTransferClass);
            labelTransfer?.classList.add(...inactiveClass);

            groupCash?.classList.remove('hidden');
            groupTransfer?.classList.add('hidden');
            this.calculateEditChangeDue();
        } else {
            labelTransfer?.classList.remove(...inactiveClass);
            labelTransfer?.classList.add(...activeTransferClass);
            labelCash?.classList.remove(...activeCashClass);
            labelCash?.classList.add(...inactiveClass);

            groupCash?.classList.add('hidden');
            groupTransfer?.classList.remove('hidden');
        }
    },

    calculateEditChangeDue() {
        const orderId = document.getElementById('edit-order-id')?.value;
        const order = Store.getOrderById(orderId);
        if (!order) return;

        const given = parseFloat(document.getElementById('edit-cash-given')?.value) || 0;
        const changeDue = Math.max(0, given - (order.totalAmount || 0));
        const elChange = document.getElementById('edit-change-due');
        if (elChange) {
            elChange.value = AppUtils.formatVND(changeDue);
        }
    },

    closeEditOrderModal() {
        document.getElementById('modal-edit-order')?.classList.add('hidden');
    },

    saveOrderEdit() {
        const orderId = document.getElementById('edit-order-id')?.value;
        const order = Store.getOrderById(orderId);
        if (!order) {
            App.showToast('Không tìm thấy hóa đơn cần cập nhật.', 'error');
            return;
        }

        const radioTransfer = document.getElementById('edit-method-transfer');
        const newMethod = (radioTransfer && radioTransfer.checked) ? 'transfer' : 'cash';
        const transferCode = document.getElementById('edit-transfer-code')?.value.trim() || '';
        const cashGiven = parseFloat(document.getElementById('edit-cash-given')?.value) || order.totalAmount;
        const customerName = document.getElementById('edit-customer-name')?.value.trim() || 'Khách vãng lai';
        const customerPhone = document.getElementById('edit-customer-phone')?.value.trim() || '';
        const note = document.getElementById('edit-order-note')?.value.trim() || '';

        const changeAmount = (newMethod === 'cash') ? Math.max(0, cashGiven - order.totalAmount) : 0;

        const updateData = {
            paymentMethod: newMethod,
            transferCode: (newMethod === 'transfer') ? transferCode : '',
            cashGiven: (newMethod === 'cash') ? cashGiven : 0,
            changeAmount: changeAmount,
            customerName: customerName,
            customerPhone: customerPhone,
            note: note
        };

        const updated = Store.updateOrder(orderId, updateData);
        if (updated) {
            this.closeEditOrderModal();
            App.showToast(`Đã cập nhật hóa đơn ${orderId} thành công (Phương thức: ${newMethod === 'cash' ? 'Tiền mặt' : 'Chuyển khoản'})`, 'success');
            AppUtils.playBeepSound('success');
            
            // Cập nhật lại giao diện và modal chi tiết nếu đang mở
            this.renderOrdersTable();
            this.updateTabSummaryCards();
            if (this.selectedOrder && this.selectedOrder.id === orderId) {
                this.openOrderDetails(orderId);
            }
        } else {
            App.showToast('Không thể cập nhật hóa đơn.', 'error');
        }
    },

    exportCurrentTabOrders() {
        const orders = this.getFilteredOrders();
        if (orders.length === 0) {
            alert('Không có hóa đơn nào để xuất file!');
            return;
        }
        ExportService.exportOrders(orders, this.currentTab);
    }
};

window.OrdersModule = OrdersModule;

