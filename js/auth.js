/**
 * MedicaPharmacy - Authentication & Role-Based Access Control (RBAC) Module
 * Quản lý tài khoản Admin (Toàn quyền) và Staff (Chỉ bán hàng & thanh toán)
 */

window.AuthModule = {
    STORAGE_KEY: 'medica_current_user',
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
        
        // Nạp người dùng hiện tại từ bộ nhớ
        const users = this.getUsers();
        const savedUserJson = localStorage.getItem(this.STORAGE_KEY);
        if (savedUserJson) {
            try {
                const parsed = JSON.parse(savedUserJson);
                this.currentUser = users.find(u => u.id === parsed.id) || users[0];
            } catch(e) {
                this.currentUser = users[0];
            }
        } else {
            // Mặc định khởi đầu với Admin
            this.currentUser = users[0];
            this.saveCurrentUser();
        }

        this.applyPermissions();
        this.renderHeaderUserInfo();
    },

    saveCurrentUser() {
        if (this.currentUser) {
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.currentUser));
        } else {
            localStorage.removeItem(this.STORAGE_KEY);
        }
    },

    getCurrentUser() {
        if (!this.currentUser) {
            this.currentUser = this.DEFAULT_USERS[0];
        }
        return this.currentUser;
    },

    isAdmin() {
        return this.getCurrentUser()?.role === 'admin';
    },

    isStaff() {
        return this.getCurrentUser()?.role === 'staff';
    },

    canAccessTab(tabId) {
        if (this.isAdmin()) return true;
        // Staff chỉ được vào pos, inventory, orders
        const allowedTabs = ['pos', 'inventory', 'orders'];
        return allowedTabs.includes(tabId);
    },

    canViewCostPrice() {
        return this.getCurrentUser()?.permissions?.canViewCostPrice === true;
    },

    canEditInventory() {
        return this.getCurrentUser()?.permissions?.canEditInventory === true;
    },

    canCancelOrReturnOrder() {
        return this.getCurrentUser()?.permissions?.canCancelOrReturnOrder === true;
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

        if (window.App && App.showToast) {
            App.showToast(`Đăng nhập thành công: ${userTemplate.roleName}`, 'success');
            if (window.AppUtils && AppUtils.playBeepSound) {
                AppUtils.playBeepSound('success');
            }
        }

        return { success: true, user: this.currentUser };
    },

    logout() {
        this.openLoginModal(true);
    },

    // --- ÁP DỤNG QUYỀN HẠN LÊN TOÀN BỘ GIAO DIỆN ---
    applyPermissions() {
        const isAdmin = this.isAdmin();
        const user = this.getCurrentUser();

        console.log(`🔐 Đang áp dụng quyền hạn cho: [${user.role.toUpperCase()}] ${user.fullName}`);

        // 1. Điều chỉnh thanh Menu Tabs
        const forbiddenTabsForStaff = ['stockin', 'vouchers', 'reports', 'settings'];
        forbiddenTabsForStaff.forEach(tabKey => {
            const btns = document.querySelectorAll(`.nav-tab-btn[data-tab="${tabKey}"]`);
            btns.forEach(btn => {
                if (isAdmin) {
                    btn.classList.remove('hidden');
                } else {
                    btn.classList.add('hidden');
                }
            });
        });

        // Nếu người dùng đang đứng ở tab bị cấm, tự động chuyển về Bán Hàng (POS)
        if (!isAdmin && window.App) {
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
        const user = this.getCurrentUser();
        const isAdmin = user.role === 'admin';

        // Avatar
        const avatarEl = document.getElementById('header-user-avatar');
        if (avatarEl) {
            avatarEl.innerText = user.avatar;
            avatarEl.className = `w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center text-white font-black text-xs shrink-0 shadow-sm ${isAdmin ? 'bg-amber-600 border border-amber-300' : 'bg-blue-600 border border-blue-300'}`;
        }

        // Tên
        const nameEl = document.getElementById('header-user-name');
        if (nameEl) {
            nameEl.innerText = user.fullName;
        }

        // Huy hiệu vai trò
        const badgeEl = document.getElementById('header-user-role-badge');
        if (badgeEl) {
            badgeEl.innerText = isAdmin ? 'ADMIN' : 'STAFF';
            badgeEl.className = `px-1.5 py-0.5 rounded text-[10px] font-black uppercase tracking-wider ${isAdmin ? 'bg-amber-400 text-slate-900 border border-amber-500' : 'bg-blue-400 text-slate-950 border border-blue-500'}`;
        }

        // Mô tả quyền hạn
        const descEl = document.getElementById('header-user-permission-desc');
        if (descEl) {
            descEl.innerText = isAdmin ? 'Toàn quyền quản trị' : 'Chỉ bán hàng & thu tiền';
        }

        // Mobile badge
        const mobileBadge = document.getElementById('header-user-role-badge-mobile');
        if (mobileBadge) {
            mobileBadge.innerText = isAdmin ? 'ADMIN' : 'STAFF';
            mobileBadge.className = `px-1.5 py-0.5 rounded text-[9px] font-black uppercase ${isAdmin ? 'bg-amber-400 text-slate-950' : 'bg-blue-400 text-slate-950'}`;
        }

        if (window.lucide) lucide.createIcons();
    },

    // --- MODAL ĐĂNG NHẬP / CHUYỂN ĐỔI TÀI KHOẢN ---
    openLoginModal(isForced = false) {
        const modal = document.getElementById('modal-auth-login');
        if (!modal) return;

        const closeBtn = document.getElementById('auth-modal-close-btn');
        if (closeBtn) {
            if (isForced) {
                closeBtn.classList.add('hidden');
            } else {
                closeBtn.classList.remove('hidden');
            }
        }

        // Reset form
        const user = this.getCurrentUser();
        const inputUser = document.getElementById('auth-input-username');
        const inputPass = document.getElementById('auth-input-password');
        const errorEl = document.getElementById('auth-error-msg');

        if (inputUser) inputUser.value = user.username || 'admin';
        if (inputPass) inputPass.value = '';
        if (errorEl) errorEl.classList.add('hidden');

        this.selectRoleTab(user.role || 'admin');

        modal.classList.remove('hidden');
        if (inputPass) inputPass.focus();
        if (window.lucide) lucide.createIcons();
    },

    closeLoginModal() {
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
    }
};
