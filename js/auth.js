/**
 * MedicaPharmacy - Authentication & Role-Based Access Control (RBAC) Module
 * Quản lý tài khoản Admin (Toàn quyền) và Staff (Chỉ bán hàng & thanh toán)
 * Yêu cầu đăng nhập bắt buộc khi truy cập, không mặc định Admin
 */

window.AuthModule = {
    STORAGE_KEY: 'medica_session_user',
    STORAGE_USERS_KEY: 'medica_system_users',

    DEFAULT_USERS: [
        {
            id: 'u_admin',
            username: 'admin',
            passwords: ['admin', 'admin123'], // Mật khẩu riêng của Quản Trị Viên
            role: 'admin',
            fullName: 'DS. Nguyễn Thanh Dung',
            roleName: 'Quản Trị Viên (Toàn quyền)',
            avatar: 'AD',
            permissions: {
                canSell: true,
                canViewInventory: true,
                canViewCostPrice: true,
                canEditInventory: true,
                canStockIn: true,
                canViewOrders: true,
                canCancelOrReturnOrder: true,
                canViewVouchers: true,
                canManageVouchers: true,
                canViewReports: true,
                canAccessSettings: true
            }
        },
        {
            id: 'u_staff',
            username: 'staff',
            passwords: ['staff', '123'], // Mật khẩu của Nhân Viên
            role: 'staff',
            fullName: 'DS. Bán Hàng',
            roleName: 'Nhân Viên Bán Lẻ (Chỉ bán hàng)',
            avatar: 'NV',
            permissions: {
                canSell: true,
                canViewInventory: true,
                canViewCostPrice: false,      // TUYỆT ĐỐI KHÔNG XEM GIÁ NHẬP
                canEditInventory: false,       // KHÔNG THÊM, SỬA, XÓA THUỐC
                canStockIn: false,             // KHÔNG NHẬP THUỐC
                canViewOrders: true,           // ĐƯỢC XEM ĐƠN & IN LẠI HÓA ĐƠN
                canCancelOrReturnOrder: false, // KHÔNG HỦY ĐƠN, KHÔNG TRẢ HÀNG
                canViewVouchers: false,        // KHÔNG XEM SỔ THU CHI
                canManageVouchers: false,
                canViewReports: false,         // KHÔNG XEM BÁO CÁO
                canAccessSettings: false       // KHÔNG VÀO CÀI ĐẶT
            }
        }
    ],

    currentUser: null,
    _listenersInitialized: false,

    getUsers() {
        const saved = localStorage.getItem(this.STORAGE_USERS_KEY);
        if (saved) {
            try {
                return JSON.parse(saved);
            } catch(e) {}
        }
        return this.DEFAULT_USERS;
    },

    saveUsers(users) {
        localStorage.setItem(this.STORAGE_USERS_KEY, JSON.stringify(users));
    },

    changePassword(role, newPassword) {
        if (!newPassword || newPassword.trim().length < 3) {
            return { success: false, message: 'Mật khẩu mới phải có ít nhất 3 ký tự!' };
        }
        const users = this.getUsers();
        const user = users.find(u => u.role === role);
        if (!user) {
            return { success: false, message: 'Không tìm thấy tài khoản!' };
        }
        user.passwords = [newPassword.trim()];
        this.saveUsers(users);

        if (this.currentUser && this.currentUser.role === role) {
            this.currentUser.passwords = [newPassword.trim()];
            this.saveCurrentUser();
        }

        return { success: true, message: `Đã đổi mật khẩu cho tài khoản ${role.toUpperCase()} thành công!` };
    },

    init() {
        console.log('🔒 Khởi tạo hệ thống Phân Quyền MedicaPharmacy...');
        
        // Xóa sạch user lưu vĩnh viễn trong localStorage để bảo đảm an toàn
        localStorage.removeItem('medica_current_user');

        // Nạp người dùng hiện tại từ sessionStorage
        const users = this.getUsers();
        const savedSession = sessionStorage.getItem(this.STORAGE_KEY);
        if (savedSession) {
            try {
                const parsed = JSON.parse(savedSession);
                this.currentUser = users.find(u => u.id === parsed.id) || null;
            } catch(e) {
                this.currentUser = null;
            }
        } else {
            // Mặc định lúc mới truy cập KHÔNG tự động đăng nhập Admin
            this.currentUser = null;
        }

        this.setupEventListeners();
        this.applyPermissions();
        this.renderHeaderUserInfo();

        // Nếu chưa đăng nhập: Luôn hiển thị màn hình đăng nhập bắt buộc
        if (!this.isAuthenticated()) {
            this.openLoginModal(true);
        } else {
            this.closeLoginModal();
        }
    },

    saveCurrentUser() {
        if (this.currentUser) {
            sessionStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.currentUser));
        } else {
            sessionStorage.removeItem(this.STORAGE_KEY);
        }
    },

    getCurrentUser() {
        return this.currentUser;
    },

    isAuthenticated() {
        return !!this.currentUser;
    },

    isAdmin() {
        return this.isAuthenticated() && this.currentUser?.role === 'admin';
    },

    isStaff() {
        return this.isAuthenticated() && this.currentUser?.role === 'staff';
    },

    canAccessTab(tabId) {
        if (!this.isAuthenticated()) return false;
        if (this.isAdmin()) return true;
        // Staff chỉ được vào pos, inventory, orders
        const allowedTabs = ['pos', 'inventory', 'orders'];
        return allowedTabs.includes(tabId);
    },

    canViewCostPrice() {
        return this.isAuthenticated() && this.currentUser?.permissions?.canViewCostPrice === true;
    },

    canEditInventory() {
        return this.isAuthenticated() && this.currentUser?.permissions?.canEditInventory === true;
    },

    canCancelOrReturnOrder() {
        return this.isAuthenticated() && this.currentUser?.permissions?.canCancelOrReturnOrder === true;
    },

    login(username, password) {
        username = (username || '').trim().toLowerCase();
        password = (password || '').trim();

        if (!username) {
            return { success: false, message: 'Vui lòng chọn hoặc nhập tên tài khoản!' };
        }

        if (!password) {
            return { success: false, message: 'Vui lòng nhập mật khẩu tài khoản!' };
        }

        const users = this.getUsers();
        const userTemplate = users.find(u => u.username === username);
        if (!userTemplate) {
            return { success: false, message: 'Tài khoản không tồn tại trong hệ thống!' };
        }

        // Kiểm tra mật khẩu chính xác
        const isValidPass = (userTemplate.passwords || []).includes(password) || (userTemplate.password === password);
        if (!isValidPass) {
            return { success: false, message: 'Mật khẩu không chính xác! Vui lòng kiểm tra lại.' };
        }

        this.currentUser = Object.assign({}, userTemplate);
        this.saveCurrentUser();
        this.applyPermissions();
        this.renderHeaderUserInfo();
        this.closeLoginModal();

        // Chuyển tab phù hợp sau khi đăng nhập
        if (window.App) {
            if (this.isStaff()) {
                App.switchTab('pos');
            } else if (!App.currentTab || App.currentTab === '') {
                App.switchTab('pos');
            }
        }

        if (window.App && App.showToast) {
            App.showToast(`Đăng nhập thành công: ${userTemplate.roleName}`, 'success');
            if (window.AppUtils && AppUtils.playBeepSound) {
                AppUtils.playBeepSound('success');
            }
        }

        return { success: true, user: this.currentUser };
    },

    logout() {
        sessionStorage.removeItem(this.STORAGE_KEY);
        this.currentUser = null;
        this.applyPermissions();
        this.renderHeaderUserInfo();

        if (window.App && App.showToast) {
            App.showToast('Đã đăng xuất tài khoản.', 'info');
        }

        this.openLoginModal(true);
    },

    // --- ÁP DỤNG QUYỀN HẠN LÊN TOÀN BỘ GIAO DIỆN ---
    applyPermissions() {
        const isAuth = this.isAuthenticated();
        const isAdmin = this.isAdmin();
        const user = this.currentUser;

        console.log(`🔐 Đang áp dụng quyền hạn: ${isAuth ? `[${user.role.toUpperCase()}] ${user.fullName}` : 'CHƯA ĐĂNG NHẬP'}`);

        // 1. Điều chỉnh thanh Menu Tabs
        const forbiddenTabsForStaff = ['stockin', 'vouchers', 'reports', 'settings'];
        const allNavTabs = ['pos', 'inventory', 'stockin', 'orders', 'vouchers', 'reports', 'settings'];

        allNavTabs.forEach(tabKey => {
            const btns = document.querySelectorAll(`.nav-tab-btn[data-tab="${tabKey}"]`);
            btns.forEach(btn => {
                if (!isAuth) {
                    btn.classList.add('opacity-40', 'pointer-events-none');
                } else if (isAdmin) {
                    btn.classList.remove('hidden', 'opacity-40', 'pointer-events-none');
                } else if (forbiddenTabsForStaff.includes(tabKey)) {
                    btn.classList.add('hidden');
                    btn.classList.remove('opacity-40', 'pointer-events-none');
                } else {
                    btn.classList.remove('hidden', 'opacity-40', 'pointer-events-none');
                }
            });
        });

        // Nếu người dùng đang đứng ở tab bị cấm hoặc chưa đăng nhập, tự động chuyển về Bán Hàng (POS)
        if (isAuth && !isAdmin && window.App) {
            if (forbiddenTabsForStaff.includes(App.currentTab)) {
                App.switchTab('pos');
            }
        }

        // 2. Điều chỉnh giao diện Kho Thuốc (Inventory)
        // - Nút "Thêm Thuốc Mới"
        const btnAddMed = document.getElementById('btn-add-medicine');
        if (btnAddMed) {
            if (isAdmin) {
                btnAddMed.classList.remove('hidden');
            } else {
                btnAddMed.classList.add('hidden');
            }
        }

        // - Cột "Giá Vốn Nhập" trong bảng kho thuốc
        const thCostPrice = document.getElementById('th-cost-price');
        if (thCostPrice) {
            if (isAdmin) {
                thCostPrice.classList.remove('hidden');
            } else {
                thCostPrice.classList.add('hidden');
            }
        }

        // - Thẻ KPI "Giá Trị Tồn Kho" (tính theo giá vốn)
        const kpiStockValue = document.getElementById('kpi-card-stock-value');
        if (kpiStockValue) {
            if (isAdmin) {
                kpiStockValue.classList.remove('hidden');
            } else {
                kpiStockValue.classList.add('hidden');
            }
        }

        // - Nút "Xuất Excel Kho" (Staff không được tải dữ liệu kho về)
        const btnExportInv = document.getElementById('btn-export-inventory');
        if (btnExportInv) {
            if (isAdmin) {
                btnExportInv.classList.remove('hidden');
            } else {
                btnExportInv.classList.add('hidden');
            }
        }

        // - Tiêu đề cột Thao Tác
        const thActions = document.getElementById('th-actions');
        if (thActions) {
            thActions.innerText = isAdmin ? 'Thao Tác' : 'Lịch Sử';
        }

        // Cập nhật lại bảng kho thuốc nếu đang hiển thị
        if (window.InventoryModule) {
            if (InventoryModule.renderMedicineTable) InventoryModule.renderMedicineTable();
            if (InventoryModule.renderInventoryStats) InventoryModule.renderInventoryStats();
        }

        // 3. Cập nhật giao diện Đơn Hàng (Orders)
        if (window.OrdersModule && OrdersModule.renderOrdersTable) {
            OrdersModule.renderOrdersTable();
        }
    },

    renderHeaderUserInfo() {
        const isAuth = this.isAuthenticated();
        const user = this.currentUser;
        const isAdmin = user?.role === 'admin';

        // Avatar
        const avatarEl = document.getElementById('header-user-avatar');
        if (avatarEl) {
            if (!isAuth) {
                avatarEl.innerHTML = '<i data-lucide="lock" class="w-4 h-4 text-slate-300"></i>';
                avatarEl.className = 'w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center bg-slate-700 text-slate-300 border border-slate-600 shrink-0';
            } else {
                avatarEl.innerText = user.avatar;
                avatarEl.className = `w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center text-white font-black text-xs shrink-0 shadow-sm ${isAdmin ? 'bg-amber-600 border border-amber-300' : 'bg-blue-600 border border-blue-300'}`;
            }
        }

        // Tên & Dược sĩ hiển thị (2 dòng trên Header theo yêu cầu)
        const nameEl = document.getElementById('header-user-name');
        if (nameEl) {
            if (!isAuth) {
                nameEl.innerHTML = `
                    <span class="font-bold text-[11px] sm:text-xs text-white whitespace-nowrap">Chưa Đăng Nhập</span>
                    <span class="text-[10px] text-rose-300 whitespace-nowrap">Bấm để đăng nhập</span>
                `;
                nameEl.title = 'Chưa Đăng Nhập';
            } else if (isAdmin) {
                nameEl.innerHTML = `
                    <span class="font-bold text-[11px] sm:text-xs text-white whitespace-nowrap">DS. Nguyễn Thanh Dung</span>
                    <span class="font-bold text-[11px] sm:text-xs text-emerald-200 whitespace-nowrap">DS. Nguyễn Thị Kiều</span>
                `;
                nameEl.title = 'DS. Nguyễn Thanh Dung - DS. Nguyễn Thị Kiều';
            } else {
                nameEl.innerHTML = `
                    <span class="font-bold text-[11px] sm:text-xs text-white whitespace-nowrap">${user.fullName || 'Dược Sĩ Bán Hàng'}</span>
                    <span class="text-[10px] text-emerald-300 whitespace-nowrap">Nhân viên quầy • Đổi TK</span>
                `;
                nameEl.title = user.fullName;
            }
        }

        // Huy hiệu vai trò (đã có avatar AD/NV nên không cần hiển thị chữ ADMIN/STAFF trên Desktop)
        const badgeEl = document.getElementById('header-user-role-badge');
        if (badgeEl) {
            badgeEl.classList.add('hidden');
        }

        // Mô tả quyền hạn (nếu còn)
        const descEl = document.getElementById('header-user-permission-desc');
        if (descEl) {
            if (!isAuth) {
                descEl.innerText = 'Vui lòng đăng nhập';
            } else {
                descEl.innerText = isAdmin ? 'Toàn quyền' : 'Chỉ bán hàng';
            }
        }

        // Mobile badge
        const mobileBadge = document.getElementById('header-user-role-badge-mobile');
        if (mobileBadge) {
            if (!isAuth) {
                mobileBadge.innerText = 'KHÓA';
                mobileBadge.className = 'px-1.5 py-0.5 rounded text-[9px] font-black uppercase bg-slate-600 text-white';
            } else {
                mobileBadge.innerText = isAdmin ? 'ADMIN' : 'STAFF';
                mobileBadge.className = `px-1.5 py-0.5 rounded text-[9px] font-black uppercase ${isAdmin ? 'bg-amber-400 text-slate-950' : 'bg-blue-400 text-slate-950'}`;
            }
        }

        // Nút Đăng Xuất trên Header
        const headerLogoutBtn = document.getElementById('header-logout-btn');
        if (headerLogoutBtn) {
            if (isAuth) {
                headerLogoutBtn.classList.remove('hidden');
            } else {
                headerLogoutBtn.classList.add('hidden');
            }
        }

        const headerLogoutMobile = document.getElementById('header-logout-btn-mobile');
        if (headerLogoutMobile) {
            if (isAuth) {
                headerLogoutMobile.classList.remove('hidden');
            } else {
                headerLogoutMobile.classList.add('hidden');
            }
        }

        if (window.lucide) lucide.createIcons();
    },

    // --- MODAL ĐĂNG NHẬP / CHUYỂN ĐỔI TÀI KHOẢN ---
    openLoginModal(isForced = false) {
        const modal = document.getElementById('modal-auth-login');
        if (!modal) return;

        // Nếu chưa đăng nhập thì LUÔN là chế độ bắt buộc (forced)
        if (!this.isAuthenticated()) {
            isForced = true;
        }

        const closeBtn = document.getElementById('auth-modal-close-btn');
        if (closeBtn) {
            if (isForced) {
                closeBtn.classList.add('hidden');
            } else {
                closeBtn.classList.remove('hidden');
            }
        }

        // Hiển thị khung thông tin tài khoản hiện tại kèm nút Đăng Xuất (nếu đã đăng nhập)
        const currentUserBox = document.getElementById('auth-modal-current-user-box');
        if (currentUserBox) {
            if (this.isAuthenticated()) {
                currentUserBox.classList.remove('hidden');
                const curName = document.getElementById('auth-modal-current-name');
                if (curName) {
                    if (this.isAdmin()) {
                        curName.innerHTML = `
                            <div class="font-bold text-slate-800 text-xs">DS. Nguyễn Thanh Dung</div>
                            <div class="font-bold text-slate-800 text-xs mt-0.5">DS. Nguyễn Thị Kiều</div>
                        `;
                    } else {
                        curName.innerHTML = `
                            <div class="font-bold text-slate-800 text-xs">${this.currentUser.fullName || 'Nhân Viên Bán Hàng'}</div>
                        `;
                    }
                }
                const curRole = document.getElementById('auth-modal-current-role');
                if (curRole) curRole.remove();
            } else {
                currentUserBox.classList.add('hidden');
            }
        }

        // Cập nhật tiêu đề modal
        const titleEl = document.getElementById('auth-modal-title');
        const subEl = document.getElementById('auth-modal-subtitle');
        if (titleEl) {
            titleEl.innerText = this.isAuthenticated() ? 'Chuyển Đổi Tài Khoản' : 'Đăng Nhập Hệ Thống';
        }
        if (subEl) {
            subEl.innerText = this.isAuthenticated() ? 'Chọn tài khoản làm việc hoặc chuyển đổi vai trò' : 'Vui lòng chọn tài khoản và nhập mật khẩu để vào làm việc';
        }

        // Reset form
        const user = this.getCurrentUser();
        const defaultRole = user ? user.role : 'staff';
        const inputUser = document.getElementById('auth-input-username');
        const inputPass = document.getElementById('auth-input-password');
        const errorEl = document.getElementById('auth-error-msg');

        if (inputUser) inputUser.value = defaultRole;
        if (inputPass) inputPass.value = '';
        if (errorEl) errorEl.classList.add('hidden');

        this.selectRoleTab(defaultRole);

        modal.classList.remove('hidden');
        setTimeout(() => {
            if (inputPass) inputPass.focus();
        }, 100);
        if (window.lucide) lucide.createIcons();
    },

    closeLoginModal() {
        if (!this.isAuthenticated()) {
            // TUYỆT ĐỐI không cho đóng modal nếu chưa đăng nhập
            return;
        }
        document.getElementById('modal-auth-login')?.classList.add('hidden');
    },

    selectRoleTab(role) {
        const tabAdmin = document.getElementById('auth-tab-admin');
        const tabStaff = document.getElementById('auth-tab-staff');
        const inputUser = document.getElementById('auth-input-username');

        if (role === 'admin') {
            tabAdmin?.classList.add('border-emerald-600', 'bg-emerald-50/70', 'text-emerald-900', 'font-bold');
            tabAdmin?.classList.remove('border-slate-200', 'bg-white', 'text-slate-600');

            tabStaff?.classList.remove('border-blue-600', 'bg-blue-50/70', 'text-blue-900', 'font-bold');
            tabStaff?.classList.add('border-slate-200', 'bg-white', 'text-slate-600');

            if (inputUser) inputUser.value = 'admin';
        } else {
            tabStaff?.classList.add('border-blue-600', 'bg-blue-50/70', 'text-blue-900', 'font-bold');
            tabStaff?.classList.remove('border-slate-200', 'bg-white', 'text-slate-600');

            tabAdmin?.classList.remove('border-emerald-600', 'bg-emerald-50/70', 'text-emerald-900', 'font-bold');
            tabAdmin?.classList.add('border-slate-200', 'bg-white', 'text-slate-600');

            if (inputUser) inputUser.value = 'staff';
        }

        const inputPass = document.getElementById('auth-input-password');
        if (inputPass) {
            inputPass.value = '';
            inputPass.focus();
        }
    },

    handleFormSubmit(e) {
        if (e) e.preventDefault();
        const username = document.getElementById('auth-input-username')?.value;
        const password = document.getElementById('auth-input-password')?.value;
        const errorEl = document.getElementById('auth-error-msg');

        const result = this.login(username, password);
        if (!result.success) {
            if (errorEl) {
                errorEl.innerText = result.message;
                errorEl.classList.remove('hidden');
            }
        }
    },

    togglePassword() {
        const input = document.getElementById('auth-input-password');
        const icon = document.getElementById('auth-password-toggle-icon');
        if (!input) return;

        if (input.type === 'password') {
            input.type = 'text';
            if (icon) icon.setAttribute('data-lucide', 'eye-off');
        } else {
            input.type = 'password';
            if (icon) icon.setAttribute('data-lucide', 'eye');
        }
        if (window.lucide) lucide.createIcons();
    },

    setupEventListeners() {
        if (this._listenersInitialized) return;
        this._listenersInitialized = true;

        // Bắt phím Escape
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                if (!this.isAuthenticated()) {
                    e.preventDefault();
                    e.stopPropagation();
                } else {
                    this.closeLoginModal();
                }
            }
        });

        // Bắt click vào backdrop modal
        const modal = document.getElementById('modal-auth-login');
        if (modal) {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    if (this.isAuthenticated()) {
                        this.closeLoginModal();
                    }
                }
            });
        }
    }
};
