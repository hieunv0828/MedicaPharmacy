/**
 * MedicaPharmacy - Audit Log Module (Lịch Sử Thao Tác KiotViet Style)
 * Ghi lại đầy đủ nhật ký thao tác: Hóa đơn, Thu chi, Danh mục hàng hóa, Xuất file...
 */

const AuditLogModule = {
    searchKeyword: '',
    currentFeature: 'all',
    currentStaff: 'all',
    currentTimeFilter: 'all',
    currentPage: 1,
    pageSize: 25,

    init() {
        this.setupSettingsSubTabs();
        this.bindEvents();
        this.renderTable();

        Store.on('audit_log:changed', () => {
            this.renderTable();
        });

        console.log('✅ Khởi tạo AuditLogModule thành công');
    },

    setupSettingsSubTabs() {
        const navBtns = document.querySelectorAll('.settings-nav-item');
        navBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                const targetTab = btn.getAttribute('data-settings-nav');
                this.switchSettingsSubTab(targetTab);
            });
        });
    },

    switchSettingsSubTab(tabName) {
        const navBtns = document.querySelectorAll('.settings-nav-item');
        navBtns.forEach(btn => {
            const nav = btn.getAttribute('data-settings-nav');
            if (nav === tabName) {
                btn.className = 'settings-nav-item w-full flex items-center gap-2.5 px-3 py-2 text-xs font-bold rounded-xl transition text-emerald-800 bg-emerald-50 border-l-4 border-emerald-600 shadow-xs';
            } else {
                btn.className = 'settings-nav-item w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 hover:text-slate-900 rounded-xl transition';
            }
        });

        const panels = document.querySelectorAll('.settings-subpanel');
        panels.forEach(panel => {
            if (panel.id === `settings-panel-${tabName}`) {
                panel.classList.remove('hidden');
            } else {
                panel.classList.add('hidden');
            }
        });

        if (tabName === 'audit_log') {
            this.renderTable();
        }

        if (window.lucide) lucide.createIcons();
    },

    bindEvents() {
        // Search
        const searchInput = document.getElementById('audit-search-keyword');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                this.searchKeyword = e.target.value.trim().toLowerCase();
                this.currentPage = 1;
                this.renderTable();
            });
        }

        // Filter Feature
        const featSelect = document.getElementById('audit-filter-feature');
        if (featSelect) {
            featSelect.addEventListener('change', (e) => {
                this.currentFeature = e.target.value;
                this.currentPage = 1;
                this.renderTable();
            });
        }

        // Filter Staff
        const staffSelect = document.getElementById('audit-filter-staff');
        if (staffSelect) {
            staffSelect.addEventListener('change', (e) => {
                this.currentStaff = e.target.value;
                this.currentPage = 1;
                this.renderTable();
            });
        }

        // Filter Time
        const timeSelect = document.getElementById('audit-filter-time');
        if (timeSelect) {
            timeSelect.addEventListener('change', (e) => {
                this.currentTimeFilter = e.target.value;
                this.currentPage = 1;
                this.renderTable();
            });
        }

        // Toggle filter bar
        const toggleBtn = document.getElementById('audit-toggle-filter-btn');
        const filterBar = document.getElementById('audit-filter-bar');
        if (toggleBtn && filterBar) {
            toggleBtn.addEventListener('click', () => {
                filterBar.classList.toggle('hidden');
            });
        }

        // Refresh
        const refreshBtn = document.getElementById('audit-refresh-btn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => {
                this.renderTable();
                if (window.AppUtils && AppUtils.showToast) {
                    AppUtils.showToast('Đã làm mới lịch sử thao tác', 'info');
                }
            });
        }

        // Export
        const exportBtn = document.getElementById('audit-export-excel-btn');
        if (exportBtn) {
            exportBtn.addEventListener('click', () => {
                this.exportExcel();
            });
        }
    },

    getFilteredLogs() {
        const logs = Store.getAuditLog() || [];
        return logs.filter(item => {
            // Keyword
            if (this.searchKeyword) {
                const kw = this.searchKeyword;
                const matchStaff = (item.staff || '').toLowerCase().includes(kw);
                const matchFeat = (item.feature || '').toLowerCase().includes(kw);
                const matchDetail = (item.details || '').toLowerCase().includes(kw);
                if (!matchStaff && !matchFeat && !matchDetail) return false;
            }

            // Feature
            if (this.currentFeature !== 'all') {
                if (item.feature !== this.currentFeature) return false;
            }

            // Staff
            if (this.currentStaff !== 'all') {
                if (item.staff !== this.currentStaff) return false;
            }

            // Time filter
            if (this.currentTimeFilter !== 'all') {
                const itemDate = new Date(item.timestamp);
                const now = new Date();
                if (this.currentTimeFilter === 'today') {
                    if (itemDate.toDateString() !== now.toDateString()) return false;
                } else if (this.currentTimeFilter === 'yesterday') {
                    const yest = new Date(now);
                    yest.setDate(now.getDate() - 1);
                    if (itemDate.toDateString() !== yest.toDateString()) return false;
                } else if (this.currentTimeFilter === 'last_7_days') {
                    const sevenDaysAgo = new Date(now.getTime() - 7 * 86400000);
                    if (itemDate < sevenDaysAgo) return false;
                } else if (this.currentTimeFilter === 'this_month') {
                    if (itemDate.getMonth() !== now.getMonth() || itemDate.getFullYear() !== now.getFullYear()) return false;
                }
            }

            return true;
        });
    },

    renderTable() {
        const tbody = document.getElementById('audit-log-tbody');
        const badge = document.getElementById('audit-total-badge');
        const pInfo = document.getElementById('audit-pagination-info');
        const pControls = document.getElementById('audit-pagination-controls');
        if (!tbody) return;

        const filtered = this.getFilteredLogs();
        if (badge) badge.innerText = `${filtered.length} thao tác`;

        if (filtered.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="4" class="py-12 text-center text-slate-400">
                        <i data-lucide="inbox" class="w-8 h-8 mx-auto mb-2 opacity-50"></i>
                        <div>Không tìm thấy thao tác nào phù hợp với bộ lọc</div>
                    </td>
                </tr>
            `;
            if (pInfo) pInfo.innerText = 'Hiển thị 0 trong 0 thao tác';
            if (pControls) pControls.innerHTML = '';
            if (window.lucide) lucide.createIcons();
            return;
        }

        // Pagination
        const totalPages = Math.ceil(filtered.length / this.pageSize);
        if (this.currentPage > totalPages) this.currentPage = totalPages;
        if (this.currentPage < 1) this.currentPage = 1;

        const startIdx = (this.currentPage - 1) * this.pageSize;
        const pageItems = filtered.slice(startIdx, startIdx + this.pageSize);

        let html = '';
        pageItems.forEach(item => {
            const timeFormatted = this.formatDateTime(item.timestamp);
            const badgeClass = this.getFeatureBadgeClass(item.feature);

            html += `
                <tr class="hover:bg-slate-50/80 transition-colors">
                    <td class="py-3 px-4 font-bold text-slate-700 whitespace-nowrap">
                        <span class="inline-flex items-center gap-1.5">
                            <span class="w-5 h-5 rounded-full bg-slate-100 text-slate-600 font-extrabold text-[10px] flex items-center justify-center border border-slate-200">
                                ${(item.staff || 'AD').substring(0, 2).toUpperCase()}
                            </span>
                            <span>${AppUtils.escapeHtml(item.staff || 'ADMIN')}</span>
                        </span>
                    </td>
                    <td class="py-3 px-4 whitespace-nowrap">
                        <span class="inline-block px-2.5 py-1 rounded-md text-[11px] font-bold ${badgeClass}">
                            ${AppUtils.escapeHtml(item.feature || 'Hệ thống')}
                        </span>
                    </td>
                    <td class="py-3 px-4 font-mono text-[11px] text-slate-500 whitespace-nowrap">
                        ${timeFormatted}
                    </td>
                    <td class="py-3 px-4 text-slate-700 font-medium break-words leading-relaxed">
                        ${AppUtils.escapeHtml(item.details || '')}
                    </td>
                </tr>
            `;
        });
        tbody.innerHTML = html;

        if (pInfo) {
            const endIdx = Math.min(startIdx + this.pageSize, filtered.length);
            pInfo.innerText = `Hiển thị ${startIdx + 1} - ${endIdx} trong tổng số ${filtered.length} thao tác`;
        }

        this.renderPaginationControls(pControls, totalPages);
        if (window.lucide) lucide.createIcons();
    },

    getFeatureBadgeClass(feat) {
        switch (feat) {
            case 'Hóa đơn':
                return 'bg-emerald-50 text-emerald-700 border border-emerald-200';
            case 'Phiếu thu':
                return 'bg-sky-50 text-sky-700 border border-sky-200';
            case 'Phiếu chi':
                return 'bg-rose-50 text-rose-700 border border-rose-200';
            case 'Danh mục hàng hóa':
                return 'bg-indigo-50 text-indigo-700 border border-indigo-200';
            case 'Sổ quỹ':
                return 'bg-amber-50 text-amber-800 border border-amber-200';
            case 'Khách hàng':
                return 'bg-purple-50 text-purple-700 border border-purple-200';
            case 'Kho thuốc':
            case 'Nhập hàng':
                return 'bg-teal-50 text-teal-700 border border-teal-200';
            case 'Cài đặt':
                return 'bg-slate-100 text-slate-700 border border-slate-300';
            default:
                return 'bg-slate-50 text-slate-600 border border-slate-200';
        }
    },

    formatDateTime(isoStr) {
        if (!isoStr) return '';
        const d = new Date(isoStr);
        if (isNaN(d.getTime())) return isoStr;
        const pad = (n) => String(n).padStart(2, '0');
        const day = pad(d.getDate());
        const month = pad(d.getMonth() + 1);
        const year = d.getFullYear();
        const hour = pad(d.getHours());
        const min = pad(d.getMinutes());
        const sec = pad(d.getSeconds());
        return `${day}/${month}/${year} ${hour}:${min}:${sec}`;
    },

    renderPaginationControls(container, totalPages) {
        if (!container) return;
        if (totalPages <= 1) {
            container.innerHTML = '';
            return;
        }

        let html = '';
        // Previous
        html += `
            <button onclick="AuditLogModule.goToPage(${this.currentPage - 1})" 
                    ${this.currentPage === 1 ? 'disabled class="opacity-40 cursor-not-allowed"' : 'class="hover:bg-slate-200"'} 
                    class="px-2.5 py-1 bg-white border border-slate-200 rounded-lg text-xs font-bold transition">
                Trước
            </button>
        `;

        // Pages
        for (let p = 1; p <= totalPages; p++) {
            if (p === 1 || p === totalPages || (p >= this.currentPage - 1 && p <= this.currentPage + 1)) {
                if (p === this.currentPage) {
                    html += `<span class="px-3 py-1 bg-emerald-600 text-white rounded-lg text-xs font-bold">${p}</span>`;
                } else {
                    html += `<button onclick="AuditLogModule.goToPage(${p})" class="px-3 py-1 bg-white border border-slate-200 hover:bg-slate-100 rounded-lg text-xs font-semibold transition">${p}</button>`;
                }
            } else if (p === this.currentPage - 2 || p === this.currentPage + 2) {
                html += `<span class="px-1 text-slate-400">...</span>`;
            }
        }

        // Next
        html += `
            <button onclick="AuditLogModule.goToPage(${this.currentPage + 1})" 
                    ${this.currentPage === totalPages ? 'disabled class="opacity-40 cursor-not-allowed"' : 'class="hover:bg-slate-200"'} 
                    class="px-2.5 py-1 bg-white border border-slate-200 rounded-lg text-xs font-bold transition">
                Sau
            </button>
        `;

        container.innerHTML = html;
    },

    goToPage(page) {
        this.currentPage = page;
        this.renderTable();
    },

    exportExcel() {
        const filtered = this.getFilteredLogs();
        if (filtered.length === 0) {
            alert('Không có dữ liệu thao tác để xuất file!');
            return;
        }

        const lines = [];
        const csvCell = (v) => `"${String(v || '').replace(/"/g, '""')}"`;
        lines.push(`${csvCell('Nhân viên')},${csvCell('Tính năng')},${csvCell('Thời gian')},${csvCell('Chi tiết')}`);

        filtered.forEach(item => {
            lines.push(`${csvCell(item.staff || 'ADMIN')},${csvCell(item.feature || '')},${csvCell(this.formatDateTime(item.timestamp))},${csvCell(item.details || '')}`);
        });

        const csvContent = '\uFEFF' + lines.join('\r\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        const nowStr = new Date().toISOString().replace(/[-:T.]/g, '').slice(0, 14);
        link.href = url;
        link.download = `LichSuThaoTac_KV_${nowStr}.csv`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);

        Store.logAction('Lịch sử thao tác', `Xuất file Danh sách lịch sử thao tác (${filtered.length} dòng)`, 'ADMIN', 'export');
    }
};
