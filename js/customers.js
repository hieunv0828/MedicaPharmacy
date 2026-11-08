/**
 * MedicaPharmacy - Quản Lý Khách Hàng & Lịch Sử Đơn Hàng (Customers Module)
 * - Quản lý danh sách khách hàng, điểm tích lũy, phân hạng thành viên
 * - Tra cứu toàn bộ các hóa đơn mà khách từng mua hàng
 * - Thêm / Sửa / Xóa thông tin khách hàng & Xuất file Excel
 */

const CustomersModule = {
    searchQuery: '',
    tierFilter: 'all',
    sortBy: 'points_desc',
    selectedCustomer: null,
    selectedCustomerOrders: [],
    orderSearchQuery: '',
    currentPage: 1,
    pageSize: 25,

    init() {
        const searchInput = document.getElementById('customers-search-input');
        if (searchInput && !searchInput._bound) {
            searchInput.addEventListener('input', (e) => {
                this.searchQuery = e.target.value.trim().toLowerCase();
                this.currentPage = 1;
                this.renderCustomersTable();
            });
            searchInput._bound = true;
        }

        const tierFilterEl = document.getElementById('customers-tier-filter');
        if (tierFilterEl && !tierFilterEl._bound) {
            tierFilterEl.addEventListener('change', (e) => {
                this.tierFilter = e.target.value;
                this.currentPage = 1;
                this.renderCustomersTable();
            });
            tierFilterEl._bound = true;
        }

        const sortFilterEl = document.getElementById('customers-sort-filter');
        if (sortFilterEl && !sortFilterEl._bound) {
            sortFilterEl.addEventListener('change', (e) => {
                this.sortBy = e.target.value;
                this.currentPage = 1;
                this.renderCustomersTable();
            });
            sortFilterEl._bound = true;
        }

        const modalOrderSearch = document.getElementById('customer-orders-search-input');
        if (modalOrderSearch && !modalOrderSearch._bound) {
            modalOrderSearch.addEventListener('input', (e) => {
                this.orderSearchQuery = e.target.value.trim().toLowerCase();
                this.renderCustomerOrdersTable();
            });
            modalOrderSearch._bound = true;
        }

        // Lắng nghe sự kiện cập nhật khách hàng & đơn hàng từ Store
        if (window.Store && typeof Store.on === 'function' && !this._storeListening) {
            Store.on('customers:changed', () => {
                this.renderSummaryCards();
                this.renderCustomersTable();
            });
            Store.on('orders:changed', () => {
                if (typeof Store.syncCustomerOrdersStats === 'function') {
                    Store.syncCustomerOrdersStats();
                }
                this.renderSummaryCards();
                this.renderCustomersTable();
            });
            this._storeListening = true;
        }
    },

    // --- THỐNG KÊ KPI TRÊN ĐẦU TAB ---
    renderSummaryCards() {
        const customers = Store.getCustomers();
        const totalCust = customers.length;
        const totalPoints = customers.reduce((sum, c) => sum + (c.points || 0), 0);
        const totalSpent = customers.reduce((sum, c) => sum + (c.totalSpent || 0), 0);
        const vipCount = customers.filter(c => (c.points || 0) >= 20).length;

        const elTotal = document.getElementById('card-customers-total');
        const elPoints = document.getElementById('card-customers-points');
        const elVip = document.getElementById('card-customers-vip');
        const elSpent = document.getElementById('card-customers-spent');

        if (elTotal) elTotal.innerText = totalCust;
        if (elPoints) elPoints.innerText = totalPoints.toLocaleString('vi-VN');
        if (elVip) elVip.innerText = `${vipCount} khách`;
        if (elSpent) elSpent.innerText = AppUtils.formatVND(totalSpent);
    },

    // --- BỘ LỌC VÀ SẮP XẾP KHÁCH HÀNG ---
    getFilteredCustomers() {
        let customers = [...Store.getCustomers()];

        // 1. Lọc theo từ khóa tìm kiếm (Tên, SĐT, Mã KH, Ghi chú, Địa chỉ)
        if (this.searchQuery) {
            const q = this.searchQuery;
            customers = customers.filter(c => {
                const name = (c.name || '').toLowerCase();
                const phone = (c.phone || '').toLowerCase();
                const id = (c.id || '').toLowerCase();
                const note = (c.note || '').toLowerCase();
                const addr = (c.address || '').toLowerCase();
                return name.includes(q) || phone.includes(q) || id.includes(q) || note.includes(q) || addr.includes(q);
            });
        }

        // 2. Lọc theo hạng thành viên
        if (this.tierFilter !== 'all') {
            customers = customers.filter(c => {
                const pts = c.points || 0;
                if (this.tierFilter === 'diamond') return pts >= 50;
                if (this.tierFilter === 'gold') return pts >= 20 && pts < 50;
                if (this.tierFilter === 'silver') return pts >= 5 && pts < 20;
                if (this.tierFilter === 'member') return pts < 5;
                return true;
            });
        }

        // 3. Sắp xếp danh sách
        customers.sort((a, b) => {
            if (this.sortBy === 'points_desc') {
                return (b.points || 0) - (a.points || 0);
            }
            if (this.sortBy === 'spent_desc') {
                return (b.totalSpent || 0) - (a.totalSpent || 0);
            }
            if (this.sortBy === 'orders_desc') {
                return (b.ordersCount || 0) - (a.ordersCount || 0);
            }
            if (this.sortBy === 'recent') {
                return new Date(b.lastVisit || b.createdAt || 0) - new Date(a.lastVisit || a.createdAt || 0);
            }
            if (this.sortBy === 'name_asc') {
                return (a.name || '').localeCompare(b.name || '', 'vi');
            }
            return 0;
        });

        return customers;
    },

    // --- PHÂN TRANG KHÁCH HÀNG ---
    changePageSize(newSize) {
        this.pageSize = (newSize === 'all') ? 'all' : parseInt(newSize, 10);
        this.currentPage = 1;
        this.renderCustomersTable();
    },

    goToPage(page) {
        this.currentPage = page;
        this.renderCustomersTable();
    },

    renderPaginationControls(total, totalPages, startIdx, count) {
        const pageInfoEl = document.getElementById('cust-page-info');
        const btnsEl = document.getElementById('cust-pagination-buttons');
        
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

        // Nút Trang đầu
        html += `
            <button onclick="CustomersModule.goToPage(1)" ${cur <= 1 ? 'disabled' : ''} 
                    class="p-1 px-2 rounded border border-slate-200 text-xs font-bold ${cur <= 1 ? 'opacity-40 cursor-not-allowed text-slate-400 bg-slate-50' : 'bg-white hover:bg-emerald-50 text-slate-700 hover:text-emerald-700 cursor-pointer'} transition" 
                    title="Về trang đầu">
                «
            </button>
        `;

        // Nút Trước
        html += `
            <button onclick="CustomersModule.goToPage(${cur - 1})" ${cur <= 1 ? 'disabled' : ''} 
                    class="p-1 px-2.5 rounded border border-slate-200 text-xs font-bold ${cur <= 1 ? 'opacity-40 cursor-not-allowed text-slate-400 bg-slate-50' : 'bg-white hover:bg-emerald-50 text-slate-700 hover:text-emerald-700 cursor-pointer'} transition" 
                    title="Trang trước">
                ‹
            </button>
        `;

        // Các số trang
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
                    <button onclick="CustomersModule.goToPage(${p})" 
                            class="p-1 px-2.5 rounded bg-white hover:bg-emerald-50 text-slate-700 hover:text-emerald-700 border border-slate-200 text-xs font-bold transition cursor-pointer">
                        ${p}
                    </button>
                `;
            }
        }

        // Nút Sau
        html += `
            <button onclick="CustomersModule.goToPage(${cur + 1})" ${cur >= totalPages ? 'disabled' : ''} 
                    class="p-1 px-2.5 rounded border border-slate-200 text-xs font-bold ${cur >= totalPages ? 'opacity-40 cursor-not-allowed text-slate-400 bg-slate-50' : 'bg-white hover:bg-emerald-50 text-slate-700 hover:text-emerald-700 cursor-pointer'} transition" 
                    title="Trang sau">
                ›
            </button>
        `;

        // Nút Trang cuối
        html += `
            <button onclick="CustomersModule.goToPage(${totalPages})" ${cur >= totalPages ? 'disabled' : ''} 
                    class="p-1 px-2 rounded border border-slate-200 text-xs font-bold ${cur >= totalPages ? 'opacity-40 cursor-not-allowed text-slate-400 bg-slate-50' : 'bg-white hover:bg-emerald-50 text-slate-700 hover:text-emerald-700 cursor-pointer'} transition" 
                    title="Đến trang cuối">
                »
            </button>
        `;

        btnsEl.innerHTML = html;
    },

    // --- RENDER BẢNG KHÁCH HÀNG CHÍNH ---
    renderCustomersTable() {
        const tbody = document.getElementById('customers-table-tbody');
        if (!tbody) return;

        const customers = this.getFilteredCustomers();
        const total = customers.length;
        const badgeTotal = document.getElementById('customers-count-badge');
        if (badgeTotal) badgeTotal.innerText = total;

        if (total === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="8" class="py-12 text-center text-slate-400">
                        <i data-lucide="user-x" class="w-12 h-12 mx-auto mb-2 opacity-30 stroke-[1.5]"></i>
                        <p class="font-bold text-slate-600">Không tìm thấy khách hàng nào phù hợp</p>
                        <p class="text-xs text-slate-400 mt-1">Thử thay đổi từ khóa tìm kiếm hoặc bấm "+ Thêm Khách Hàng" ở trên</p>
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

        let displayedCustomers = customers;
        let startIdx = 0;
        if (this.pageSize !== 'all') {
            startIdx = (this.currentPage - 1) * this.pageSize;
            displayedCustomers = customers.slice(startIdx, startIdx + this.pageSize);
        }

        this.renderPaginationControls(total, totalPages, startIdx, displayedCustomers.length);

        let html = '';
        displayedCustomers.forEach((c, idx) => {
            const tier = Store.getCustomerTier(c.points || 0);
            const safeName = (c.name || 'Khách hàng').replace(/'/g, "\\'");
            const safePhone = (c.phone || '').replace(/'/g, "\\'");
            const lastVisitStr = c.lastVisit ? AppUtils.formatDateTime(c.lastVisit) : '---';

            html += `
                <tr class="hover:bg-emerald-50/40 transition border-b border-slate-100 group">
                    <td class="py-3 px-3 text-center text-slate-400 font-mono text-xs">${startIdx + idx + 1}</td>
                    
                    <!-- Cột Khách Hàng (Tên click để xem danh sách hóa đơn) -->
                    <td class="py-3 px-3">
                        <div class="flex items-center gap-2">
                            <button type="button" 
                                    onclick="CustomersModule.openCustomerOrdersModal('${c.id || safePhone}')"
                                    class="font-bold text-slate-800 hover:text-emerald-700 hover:underline cursor-pointer text-left transition flex items-center gap-1.5"
                                    title="Bấm vào tên để xem danh sách toàn bộ hóa đơn khách đã mua">
                                <span>${c.name || 'Khách hàng'}</span>
                                <i data-lucide="receipt" class="w-3.5 h-3.5 text-emerald-600 opacity-60 group-hover:opacity-100"></i>
                            </button>
                            <span class="inline-flex items-center gap-1 px-1.5 py-0.2 rounded text-[10px] font-bold border ${tier.badge}">
                                ${tier.icon} ${tier.name}
                            </span>
                        </div>
                        <div class="flex items-center gap-2 mt-0.5 text-[11px] text-slate-400">
                            <span class="font-mono">Mã: ${c.id || '---'}</span>
                            ${c.address ? `<span class="truncate max-w-[200px]" title="${c.address}">• ${c.address}</span>` : ''}
                        </div>
                    </td>

                    <!-- Số Điện Thoại -->
                    <td class="py-3 px-3">
                        ${c.phone ? `
                            <span class="font-mono font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded text-xs">
                                ${c.phone}
                            </span>
                        ` : `<span class="text-slate-400 italic text-xs">Chưa có SĐT</span>`}
                    </td>

                    <!-- Điểm Tích Lũy -->
                    <td class="py-3 px-3 text-center">
                        <div class="inline-flex items-center gap-1">
                            <span class="inline-flex items-center gap-1 px-2.5 py-1 bg-amber-50 text-amber-800 border border-amber-300 font-black rounded-full font-mono text-xs shadow-2xs">
                                ⭐ ${c.points || 0} điểm
                            </span>
                            <button onclick="CustomersModule.adjustPoints('${safePhone}')" 
                                    class="p-1 text-slate-400 hover:text-amber-700 hover:bg-amber-100 rounded transition cursor-pointer" 
                                    title="Cộng / Trừ điểm thưởng thủ công">
                                <i data-lucide="plus-circle" class="w-3.5 h-3.5"></i>
                            </button>
                        </div>
                    </td>

                    <!-- Tổng Chi Tiêu -->
                    <td class="py-3 px-3 text-right">
                        <span class="font-bold text-slate-800 font-mono text-xs">
                            ${AppUtils.formatVND(c.totalSpent || 0)}
                        </span>
                    </td>

                    <!-- Lượt Mua (Click để xem danh sách hóa đơn) -->
                    <td class="py-3 px-3 text-center">
                        <button type="button" 
                                onclick="CustomersModule.openCustomerOrdersModal('${c.id || safePhone}')"
                                class="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-100 hover:bg-emerald-100 text-slate-700 hover:text-emerald-800 rounded-lg text-xs font-bold transition font-mono border border-slate-200 hover:border-emerald-300 cursor-pointer"
                                title="Bấm để xem các đơn hàng đã mua">
                            <i data-lucide="shopping-bag" class="w-3 h-3 text-emerald-600"></i>
                            <span>${c.ordersCount || 0} đơn</span>
                        </button>
                    </td>

                    <!-- Lần Ghé Gần Nhất -->
                    <td class="py-3 px-3 text-slate-500 text-xs">
                        <div class="text-[11px]">${lastVisitStr}</div>
                    </td>

                    <!-- Thao Tác -->
                    <td class="py-3 px-3 text-center">
                        <div class="flex items-center justify-center gap-1">
                            <button onclick="CustomersModule.openCustomerOrdersModal('${c.id || safePhone}')" 
                                    class="p-1.5 text-emerald-700 hover:bg-emerald-100 rounded-lg transition cursor-pointer" 
                                    title="Xem lịch sử hóa đơn">
                                <i data-lucide="receipt" class="w-4 h-4"></i>
                            </button>
                            <button onclick="CustomersModule.openEditCustomerModal('${c.id}')" 
                                    class="p-1.5 text-blue-600 hover:bg-blue-100 rounded-lg transition cursor-pointer" 
                                    title="Chỉnh sửa thông tin khách">
                                <i data-lucide="edit-3" class="w-4 h-4"></i>
                            </button>
                            <button onclick="CustomersModule.deleteCustomerConfirm('${c.id}')" 
                                    class="p-1.5 text-rose-500 hover:bg-rose-100 rounded-lg transition cursor-pointer" 
                                    title="Xóa khách hàng">
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

    // ========================================================
    // MODAL: LỊCH SỬ CÁC HÓA ĐƠN KHÁCH HÀNG TỪNG MUA
    // ========================================================
    openCustomerOrdersModal(phoneOrId) {
        if (!phoneOrId) {
            App.showToast('Không xác định được thông tin khách hàng.', 'warning');
            return;
        }

        let cust = Store.getCustomerByPhone(phoneOrId) || Store.getCustomerById(phoneOrId);
        if (!cust) {
            // Trường hợp khách chưa lưu vào danh sách (vd: nhập SĐT ở POS nhưng chưa hoàn tất đơn)
            cust = {
                id: 'KH-NEW',
                phone: phoneOrId,
                name: 'Khách hàng ' + phoneOrId,
                points: 0,
                totalSpent: 0,
                ordersCount: 0
            };
        }

        this.selectedCustomer = cust;
        this.orderSearchQuery = '';

        // Lấy tất cả hóa đơn mà khách từng mua
        const orders = Store.getOrdersByCustomer(cust.id || cust.phone, cust.name);
        this.selectedCustomerOrders = orders;

        // Cập nhật thông tin Header Modal
        const elName = document.getElementById('modal-cust-orders-name');
        const elPhone = document.getElementById('modal-cust-orders-phone');
        const elId = document.getElementById('modal-cust-orders-id');
        const elTier = document.getElementById('modal-cust-orders-tier');
        const elCount = document.getElementById('modal-cust-orders-count');
        const elSpent = document.getElementById('modal-cust-orders-spent');
        const elPoints = document.getElementById('modal-cust-orders-points');
        const searchInput = document.getElementById('customer-orders-search-input');

        if (searchInput) searchInput.value = '';

        const tier = Store.getCustomerTier(cust.points || 0);

        if (elName) elName.innerText = cust.name || 'Khách hàng';
        if (elPhone) elPhone.innerText = cust.phone ? `SĐT: ${cust.phone}` : 'Chưa có SĐT';
        if (elId) elId.innerText = `Mã: ${cust.id || '---'}`;
        if (elTier) {
            elTier.className = `inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold border ${tier.badge}`;
            elTier.innerHTML = `${tier.icon} Hạng: ${tier.name}`;
        }

        // Tính tổng tiền thực tế từ các hóa đơn hợp lệ
        const validOrders = orders.filter(o => !o.isCancelled);
        const actualSpent = validOrders.reduce((sum, o) => sum + (o.totalAmount || 0), 0);

        if (elCount) elCount.innerText = `${orders.length} hóa đơn`;
        if (elSpent) elSpent.innerText = AppUtils.formatVND(actualSpent > 0 ? actualSpent : (cust.totalSpent || 0));
        if (elPoints) elPoints.innerText = `${cust.points || 0} điểm`;

        // Render bảng danh sách đơn hàng của khách
        this.renderCustomerOrdersTable();

        const modal = document.getElementById('modal-customer-orders-history');
        if (modal) {
            modal.classList.remove('hidden');
            if (window.lucide) lucide.createIcons();
        }
    },

    renderCustomerOrdersTable() {
        const tbody = document.getElementById('modal-cust-orders-tbody');
        if (!tbody) return;

        let orders = [...(this.selectedCustomerOrders || [])];

        // Lọc nhanh trong modal nếu có tìm kiếm mã đơn hoặc tên thuốc
        if (this.orderSearchQuery) {
            const q = this.orderSearchQuery;
            orders = orders.filter(o => {
                const id = (o.id || '').toLowerCase();
                const itemsStr = (o.items || []).map(it => (it.medicineName || '')).join(' ').toLowerCase();
                const note = (o.note || '').toLowerCase();
                return id.includes(q) || itemsStr.includes(q) || note.includes(q);
            });
        }

        if (orders.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="8" class="py-12 text-center text-slate-400">
                        <i data-lucide="receipt-text" class="w-12 h-12 mx-auto mb-2 opacity-30 stroke-[1.5]"></i>
                        <p class="font-bold text-slate-600">Khách hàng chưa có hóa đơn nào</p>
                        <p class="text-xs text-slate-400 mt-1">Khi khách thanh toán đơn thuốc tại quầy POS có nhập SĐT, đơn sẽ tự động lưu vào đây</p>
                    </td>
                </tr>
            `;
            if (window.lucide) lucide.createIcons();
            return;
        }

        let html = '';
        orders.forEach((o, idx) => {
            const isCancelled = o.isCancelled === true;
            const hasReturns = o.returns && o.returns.length > 0;
            const isFullyReturned = o.returnStatus === 'fully_returned';

            // Huy hiệu trạng thái đơn
            let statusBadge = '';
            if (isCancelled) {
                statusBadge = '<span class="px-2 py-0.5 rounded-full text-[10px] font-black bg-rose-100 text-rose-800 border border-rose-300">ĐÃ HỦY</span>';
            } else if (isFullyReturned) {
                statusBadge = '<span class="px-2 py-0.5 rounded-full text-[10px] font-black bg-purple-100 text-purple-800 border border-purple-300">ĐÃ TRẢ HẾT</span>';
            } else if (hasReturns) {
                statusBadge = '<span class="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-100 text-amber-800 border border-amber-300">TRẢ MỘT PHẦN</span>';
            } else {
                statusBadge = '<span class="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-800 border border-emerald-300">HOÀN TẤT</span>';
            }

            // Hình thức thanh toán
            const isCash = o.paymentMethod === 'cash';
            const methodBadge = isCash 
                ? '<span class="inline-flex items-center gap-1 text-[11px] font-bold text-amber-700"><i data-lucide="banknote" class="w-3.5 h-3.5"></i> Tiền mặt</span>'
                : '<span class="inline-flex items-center gap-1 text-[11px] font-bold text-blue-700"><i data-lucide="qr-code" class="w-3.5 h-3.5"></i> Chuyển khoản</span>';

            // Tóm tắt danh sách thuốc trong đơn
            const itemsList = (o.items || []).map(it => `• <b>${it.medicineName}</b> (x${it.quantity} ${it.unit})`).join('<br>');
            const itemsShort = (o.items || []).map(it => `${it.medicineName} (x${it.quantity})`).join(', ');

            html += `
                <tr class="hover:bg-slate-50 transition border-b border-slate-100 ${isCancelled ? 'opacity-60 bg-rose-50/20' : ''}">
                    <td class="py-2.5 px-3 text-center text-slate-400 font-mono text-xs">${idx + 1}</td>
                    
                    <!-- Mã HĐ (Bấm xem chi tiết) -->
                    <td class="py-2.5 px-3">
                        <button type="button" onclick="OrdersModule.openOrderDetails('${o.id}')"
                                class="font-mono font-bold text-slate-800 hover:text-emerald-700 hover:underline cursor-pointer transition text-xs block text-left"
                                title="Bấm để xem chi tiết hóa đơn">
                            ${o.id}
                        </button>
                        <div class="text-[10px] text-slate-400 mt-0.5">${AppUtils.formatDateTime(o.createdAt)}</div>
                    </td>

                    <!-- Danh sách thuốc đã mua -->
                    <td class="py-2.5 px-3">
                        <div class="text-xs text-slate-700 max-w-sm line-clamp-2 leading-relaxed" title="${itemsShort}">
                            ${(o.items || []).map(it => `<span class="inline-block bg-slate-100 px-1.5 py-0.2 rounded text-[11px] text-slate-700 mr-1 mb-0.5"><b>${it.medicineName}</b> x${it.quantity}</span>`).join('')}
                        </div>
                        ${o.note ? `<div class="text-[10px] text-slate-400 italic mt-0.5 truncate max-w-xs">Ghi chú: ${o.note}</div>` : ''}
                    </td>

                    <!-- Hình Thức TT -->
                    <td class="py-2.5 px-3 whitespace-nowrap">
                        ${methodBadge}
                        ${o.transferCode ? `<div class="text-[10px] font-mono text-slate-400">Mã: ${o.transferCode}</div>` : ''}
                    </td>

                    <!-- Điểm Đơn Này -->
                    <td class="py-2.5 px-3 text-center whitespace-nowrap">
                        ${o.pointsEarned ? `
                            <span class="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                                ⭐ +${o.pointsEarned}đ
                            </span>
                        ` : (o.pointsUsed ? `
                            <span class="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                                -${o.pointsUsed}đ
                            </span>
                        ` : `<span class="text-slate-300 text-xs">---</span>`)}
                    </td>

                    <!-- Trạng Thái -->
                    <td class="py-2.5 px-3 text-center whitespace-nowrap">
                        ${statusBadge}
                    </td>

                    <!-- Tổng Tiền -->
                    <td class="py-2.5 px-3 text-right whitespace-nowrap">
                        <div class="font-bold text-slate-900 font-mono text-xs">
                            ${AppUtils.formatVND(o.totalAmount || 0)}
                        </div>
                        ${o.discount > 0 ? `<div class="text-[10px] text-rose-600">Giảm: -${AppUtils.formatVND(o.discount)}</div>` : ''}
                    </td>

                    <!-- Thao Tác -->
                    <td class="py-2.5 px-3 text-center whitespace-nowrap">
                        <div class="flex items-center justify-center gap-1">
                            <button onclick="OrdersModule.openOrderDetails('${o.id}')" 
                                    class="p-1.5 text-slate-600 hover:text-emerald-700 hover:bg-emerald-50 rounded transition cursor-pointer" 
                                    title="Xem chi tiết hóa đơn">
                                <i data-lucide="eye" class="w-4 h-4"></i>
                            </button>
                            <button onclick="OrdersModule.reprintOrder('${o.id}')" 
                                    class="p-1.5 text-slate-600 hover:text-blue-700 hover:bg-blue-50 rounded transition cursor-pointer" 
                                    title="In lại hóa đơn">
                                <i data-lucide="printer" class="w-4 h-4"></i>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        });

        tbody.innerHTML = html;
        if (window.lucide) lucide.createIcons();
    },

    closeCustomerOrdersModal() {
        const modal = document.getElementById('modal-customer-orders-history');
        if (modal) modal.classList.add('hidden');
    },

    // ========================================================
    // MODAL: THÊM / CHỈNH SỬA KHÁCH HÀNG
    // ========================================================
    openAddCustomerModal() {
        const modal = document.getElementById('modal-customer-edit');
        if (!modal) return;

        document.getElementById('cust-form-title').innerText = 'Thêm Khách Hàng Mới';
        document.getElementById('cust-form-id').value = '';
        document.getElementById('cust-form-name').value = '';
        document.getElementById('cust-form-phone').value = '';
        document.getElementById('cust-form-points').value = '0';
        document.getElementById('cust-form-address').value = '';
        document.getElementById('cust-form-note').value = '';

        modal.classList.remove('hidden');
        document.getElementById('cust-form-name')?.focus();
        if (window.lucide) lucide.createIcons();
    },

    openEditCustomerModal(id) {
        const cust = Store.getCustomerById(id);
        if (!cust) {
            App.showToast('Không tìm thấy thông tin khách hàng.', 'error');
            return;
        }

        const modal = document.getElementById('modal-customer-edit');
        if (!modal) return;

        document.getElementById('cust-form-title').innerText = `Chỉnh Sửa: ${cust.name}`;
        document.getElementById('cust-form-id').value = cust.id || '';
        document.getElementById('cust-form-name').value = cust.name || '';
        document.getElementById('cust-form-phone').value = cust.phone || '';
        document.getElementById('cust-form-points').value = cust.points || 0;
        document.getElementById('cust-form-address').value = cust.address || '';
        document.getElementById('cust-form-note').value = cust.note || '';

        modal.classList.remove('hidden');
        document.getElementById('cust-form-name')?.focus();
        if (window.lucide) lucide.createIcons();
    },

    closeEditCustomerModal() {
        const modal = document.getElementById('modal-customer-edit');
        if (modal) modal.classList.add('hidden');
    },

    saveCustomerForm() {
        const id = document.getElementById('cust-form-id')?.value.trim();
        const name = document.getElementById('cust-form-name')?.value.trim();
        const phone = document.getElementById('cust-form-phone')?.value.trim();
        const points = parseInt(document.getElementById('cust-form-points')?.value) || 0;
        const address = document.getElementById('cust-form-address')?.value.trim();
        const note = document.getElementById('cust-form-note')?.value.trim();

        if (!name) {
            alert('Vui lòng nhập họ và tên khách hàng.');
            document.getElementById('cust-form-name')?.focus();
            return;
        }

        if (phone && phone.replace(/\D/g, '').length < 8) {
            alert('Số điện thoại không hợp lệ. Vui lòng kiểm tra lại.');
            document.getElementById('cust-form-phone')?.focus();
            return;
        }

        const saved = Store.saveCustomer({
            id: id || undefined,
            name: name,
            phone: phone,
            points: points,
            address: address,
            note: note
        });

        this.closeEditCustomerModal();
        this.renderSummaryCards();
        this.renderCustomersTable();

        App.showToast(`Đã lưu khách hàng: ${saved.name} (${saved.phone || 'Không SĐT'})`, 'success');
        if (window.AppUtils && AppUtils.playBeepSound) AppUtils.playBeepSound('success');
    },

    deleteCustomerConfirm(id) {
        const cust = Store.getCustomerById(id);
        if (!cust) return;

        if (confirm(`Bạn có chắc chắn muốn xóa khách hàng "${cust.name}" (SĐT: ${cust.phone || 'Chưa có'}) khỏi hệ thống không?`)) {
            Store.deleteCustomer(id);
            this.renderSummaryCards();
            this.renderCustomersTable();
            App.showToast(`Đã xóa khách hàng ${cust.name}`, 'success');
        }
    },

    adjustPoints(phone) {
        if (!phone) {
            App.showToast('Khách hàng này chưa có số điện thoại để tích điểm.', 'warning');
            return;
        }
        App.adjustPointsPrompt(phone);
        this.renderSummaryCards();
        this.renderCustomersTable();
    },

    exportExcel() {
        const customers = this.getFilteredCustomers();
        if (customers.length === 0) {
            alert('Chưa có khách hàng nào để xuất file!');
            return;
        }
        ExportService.exportCustomers(customers);
    }
};

window.CustomersModule = CustomersModule;

