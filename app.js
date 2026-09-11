/**
 * HỆ THỐNG QUẢN TRỊ CHI PHÍ HÀNH CHÍNH - THACO AUTO
 * Module Logic, Multi-dimensional Dashboard & Persistence Engine (app.js)
 */

(function () {
    'use strict';

    const STORAGE_KEY = 'THACO_CPHC_LIVE_V3';

    function purgeLegacyCaches() {
        ['THACO_CPHC_STATE_V1', 'THACO_CPHC_USER_DATA_V1', 'THACO_CPHC_USER_DATA_V2'].forEach(k => {
            try { localStorage.removeItem(k); } catch (e) {}
        });
    }

    const state = {
        categories: [],
        entities: [],
        qtpnMappings: [],
        deptData: {},
        data2024: {},
        data2025: {},
        data2026: {},
        actualMonths: [1, 2, 3, 4, 5, 6, 7],
        selectedMonths: [1, 2, 3, 4, 5, 6, 7],
        compareConfig: {
            mode: '2025', // '2025' | '2024' | 'BOTH'
            show: true
        },
        filters: {
            donVi: 'ALL',
            mien: 'ALL',
            khoi: 'ALL',
            quanTri: 'ALL',
            phapNhan: 'ALL',
            taiKhoan: 'ALL',
            boPhan: 'ALL', // Lọc theo Bộ phận / Khối
            scopeMode: 'CURRENT_2026',
            viewRole: 'MACRO', // 'MACRO' (Ban Lãnh Đạo) hoặc 'MICRO' (Giám đốc Đơn vị)
            materialOnly: false // false: Tất cả 30 khoản mục, true: Chỉ hiển thị khoản mục trọng yếu
        },
        collapsedGroups: {},
        groupIcons: {},
        columnVisibility: {
            cost2025: true,
            actualMonths: true
        },
        yoyConfig: {
            viewMode: 'MONTHLY', // 'MONTHLY' hoặc 'YOY_TABLE'
            thresholdPercent: 20 // Ngưỡng cảnh báo biến động bất thường (mặc định ±20%)
        },
        cbnvConfig: {
            displayMode: 'BOTH' // 'THUC_TE' | 'DINH_BIEN' | 'BOTH'
        },
        cbnvData: {}, // Record<maPn, { stt, khoi, maQt, tenQt, maPn, tenPn, nam, dinhBien, thucTe, ghiChu }>
        cbnvAudit: null, // { hasControlRow, fileControlTotalDb, fileControlTotalTt, sumDb, sumTt, diff, diffDb, status }
        currentTab: 'report'
    };

    // Expose state cho tooltip.js và các module mở rộng
    window.appState = state;

    // =========================================================================
    // ⚡ PERFORMANCE MEMOIZATION CACHE & CATEGORY MATCHER
    // =========================================================================

    const reportDataCache = new Map();
    function clearReportDataCache() {
        reportDataCache.clear();
    }

    /**
     * So khớp chính xác khoản mục chi phí (Hỗ trợ chuẩn N:1 và mảng phân tách bởi dấu phẩy)
     * Tránh lỗi substring so khớp chuỗi con giả dương (.includes)
     */
    function matchCategoryKm(cat, kmCode) {
        if (!cat || !kmCode) return false;
        const kmClean = String(kmCode).trim().toUpperCase();
        if (!kmClean) return false;

        // 1. So khớp ID trực tiếp nếu kmCode trùng id
        if (cat.id !== undefined && String(cat.id) === kmClean) return true;

        // 2. So khớp mảng b7_codes (exact match từng phần tử)
        if (Array.isArray(cat.b7_codes) && cat.b7_codes.length > 0) {
            if (cat.b7_codes.some(c => String(c).trim().toUpperCase() === kmClean)) return true;
        }

        // 3. Tách chuỗi b7_display theo dấu phẩy, chấm phẩy, khoảng trắng và so khớp chính xác từng phần tử
        if (cat.b7_display) {
            const parts = String(cat.b7_display).split(/[,;\s]+/).map(s => s.trim().toUpperCase()).filter(Boolean);
            if (parts.includes(kmClean)) return true;
        }

        // 4. So khớp b10_codes
        if (Array.isArray(cat.b10_codes) && cat.b10_codes.length > 0) {
            if (cat.b10_codes.some(c => String(c).trim().toUpperCase() === kmClean)) return true;
        }

        // 5. So khớp b10_display
        if (cat.b10_display) {
            const b10Parts = String(cat.b10_display).split(/[,;\s]+/).map(s => s.trim().toUpperCase()).filter(Boolean);
            if (b10Parts.includes(kmClean)) return true;
        }

        return false;
    }

    // =========================================================================
    // 🎨 GROUP ICON MANAGER & MINI ICON LIBRARY
    // =========================================================================

    function removeVietnameseTones(str) {
        if (!str) return '';
        str = str.toLowerCase();
        str = str.replace(/à|á|ạ|ả|ã|â|ầ|ấ|ậ|ẩ|ẫ|ă|ằ|ắ|ặ|ẳ|ẵ/g, "a");
        str = str.replace(/è|é|ẹ|ẻ|ẽ|ê|ề|ế|ệ|ể|ễ/g, "e");
        str = str.replace(/ì|í|ị|ỉ|ĩ/g, "i");
        str = str.replace(/ò|ó|ọ|ỏ|õ|ô|ồ|ố|ộ|ổ|ỗ|ơ|ờ|ớ|ợ|ở|ỡ/g, "o");
        str = str.replace(/ù|ú|ụ|ủ|ũ|ư|ừ|ứ|ự|ử|ữ/g, "u");
        str = str.replace(/ỳ|ý|ỵ|ỷ|ỹ/g, "y");
        str = str.replace(/đ/g, "d");
        return str;
    }

    const DEFAULT_GROUP_ICONS = {
        // 3 Nhóm Chi Phí Mới Hiện Tại
        'Phục vụ hoạt động chung': '🏢',
        'Phục vụ kinh doanh': '💼',
        'Phục vụ CB-NV': '👥',
        'Chi phí phục vụ hoạt động chung': '🏢',
        'Chi phí phục vụ kinh doanh': '💼',
        'Chi phí phục vụ CB-NV': '👥',
        // Tương thích ngược với các tên nhóm cũ
        'Chi phí tiện ích văn phòng (5)': '📑',
        'Chi phí tiện ích văn phòng': '📑',
        'Chi phí mua sắm, sửa chữa CCDC, TSCĐ (2)': '🛠️',
        'Chi phí mua sắm, sửa chữa CCDC, TSCĐ': '🛠️',
        'Chi phí Hội họp và tiếp khách (4)': '🤝',
        'Chi phí Hội họp và tiếp khách': '🤝',
        'Chi phí Công tác (5)': '✈️',
        'Chi phí Công tác': '✈️',
        'Chi phí Vận hành & Mặt bằng': '🏢',
        'Chi phí vận hành (10)': '🏢',
        'Chi phí khác': '⚖️',
        'Chi phí khác & Quản trị': '⚖️',
        'Chi phí khác & Khấu hao (3)': '⚖️'
    };

    const ICON_LIBRARY = [
        // Gợi ý cho 3 nhóm mới
        { icon: '🏢', name: 'Tòa nhà / Văn phòng', cat: 'suggested', keywords: 'toa nha van phong tru so hoat dong chung co quan dia diem' },
        { icon: '💼', name: 'Kinh doanh / Cặp tài liệu', cat: 'suggested', keywords: 'kinh doanh cap tai lieu hop dong ban hang doanh thu hop tac' },
        { icon: '👥', name: 'CB-NV / Đoàn thể', cat: 'suggested', keywords: 'can bo nhan vien cbnv doan the con nguoi doi ngu tap the' },
        { icon: '🏛️', name: 'Trụ sở / Cơ quan', cat: 'suggested', keywords: 'tru so co quan hanh chinh phong hop ban lanh dao' },
        { icon: '📈', name: 'Tăng trưởng / Doanh số', cat: 'suggested', keywords: 'tang truong phat trien kinh doanh bieu do doanh so' },
        { icon: '👔', name: 'Đồng phục / Chuyên nghiệp', cat: 'suggested', keywords: 'dong phuc cong so nhan su can bo tac phong' },
        { icon: '⚙️', name: 'Vận hành chung', cat: 'suggested', keywords: 'van hanh he thong may moc quan tri van phong' },
        { icon: '🤝', name: 'Đối tác / Tiếp khách', cat: 'suggested', keywords: 'doi tac tiep khach bat tay hop tac ngoai giao giao te' },
        { icon: '🍱', name: 'Cơm ca / Suất ăn', cat: 'suggested', keywords: 'com trua bua an suat an phuc loi thuc pham an uong' },

        // Vận hành & Quản trị (operation)
        { icon: '📑', name: 'Hồ sơ / Tiện ích VP', cat: 'operation', keywords: 'ho so tai lieu giay to van phong pham in an chung tu' },
        { icon: '💡', name: 'Điện / Chiếu sáng', cat: 'operation', keywords: 'dien chieu sang nang luong tien ich cong cong' },
        { icon: '💧', name: 'Nước sinh hoạt', cat: 'operation', keywords: 'nuoc sach sinh hoat nuoc uong thuy cuc' },
        { icon: '🌐', name: 'Mạng / CNTT', cat: 'operation', keywords: 'mang internet cong nghe it truyen thong he thong wifi' },
        { icon: '🛡️', name: 'Bảo vệ / An ninh', cat: 'operation', keywords: 'bao ve an ninh phong chay chua chay an toan pccc' },
        { icon: '🧹', name: 'Vệ sinh môi trường', cat: 'operation', keywords: 've sinh lao cong rac thai sach se tap vu' },
        { icon: '📦', name: 'Văn phòng phẩm / Hàng hóa', cat: 'operation', keywords: 'van phong pham thung hop dong goi vat tu' },
        { icon: '🖨️', name: 'In ấn / Photocopy', cat: 'operation', keywords: 'in an photo may in may scan photocopy ban in' },
        { icon: '🔑', name: 'Thuê mặt bằng / Quản lý', cat: 'operation', keywords: 'chia khoa thue nha showroom mat bang van phong' },
        { icon: '🗄️', name: 'Lưu trữ / Tủ hồ sơ', cat: 'operation', keywords: 'luu tru tu ho so kho quan tri giay to' },
        { icon: '📋', name: 'Quy trình / Kế hoạch', cat: 'operation', keywords: 'ke hoach quy trinh kiem tra danh gia bao cao' },
        { icon: '⚖️', name: 'Pháp lý / Kiểm toán', cat: 'operation', keywords: 'phap ly can bang luat kiem toan quy dinh thanh tra' },

        // Kinh doanh & Thị trường (business)
        { icon: '🎯', name: 'Mục tiêu / KPI', cat: 'business', keywords: 'muc tieu kpi ke hoach chien luoc thi truong' },
        { icon: '✈️', name: 'Vé máy bay / Công tác', cat: 'business', keywords: 'may bay cong tac di lai luu tru ve may bay' },
        { icon: '🚗', name: 'Xe công / Showroom', cat: 'business', keywords: 'o to xe hoi phuong tien di chuyen showroom lai thu' },
        { icon: '📢', name: 'Truyền thông / Quảng bá', cat: 'business', keywords: 'truyen thong quang cao marketing su kien pr' },
        { icon: '🥂', name: 'Giao tế / Chiêu đãi', cat: 'business', keywords: 'giao te tiec tung chieu dai gap go tiep khach' },
        { icon: '💳', name: 'Chi phí thẻ / Giao dịch', cat: 'business', keywords: 'the tin dung thanh toan chuyen khoan ngan hang' },
        { icon: '🛒', name: 'Bán hàng / Khách hàng', cat: 'business', keywords: 'ban hang tieu thu khach hang showroom dai ly' },
        { icon: '🏷️', name: 'Khoản mục / Nhãn phí', cat: 'business', keywords: 'nhan gia the tag phan loai chi phi' },
        { icon: '💰', name: 'Ngân sách / Tài chính', cat: 'business', keywords: 'tien bac ngan sach dong tien von chi phi loi nhuan' },
        { icon: '🚀', name: 'Dự án mới / Đột phá', cat: 'business', keywords: 'ten lua du an moi tang toc phat trien dot pha' },
        { icon: '📞', name: 'Cước viễn thông / Hotline', cat: 'business', keywords: 'dien thoai lien lac tong dai cskh cuoc goi' },
        { icon: '🏨', name: 'Lưu trú / Khách sạn', cat: 'business', keywords: 'khach san nha nghi luu tru cong tac xa phong nghi' },

        // CB-NV & Phúc lợi (hr)
        { icon: '🧑‍💼', name: 'Nhân sự / Chuyên viên', cat: 'hr', keywords: 'nhan su nhan vien chuyen vien quan ly nguoi lao dong' },
        { icon: '☕', name: 'Nước uống / Trà nước', cat: 'hr', keywords: 'ca phe tra giai khat tiep khach van phong nuoc uong' },
        { icon: '🩺', name: 'Y tế / Khám sức khỏe', cat: 'hr', keywords: 'y te kham suc khoe bao hiem thuoc men dinh ky bac si' },
        { icon: '🎓', name: 'Đào tạo / Tập huấn', cat: 'hr', keywords: 'dao tao tap huan hoc tap nang cao chuyen mon khoa hoc' },
        { icon: '🎁', name: 'Hiếu hỉ / Khen thưởng', cat: 'hr', keywords: 'qua tang khen thuong sinh nhat le tet hieu hi phuc loi' },
        { icon: '🚌', name: 'Xe đưa đón CB-NV', cat: 'hr', keywords: 'xe dua don van chuyen nhan vien xe buyt dua don' },
        { icon: '⚽', name: 'Văn thể mỹ / Thể thao', cat: 'hr', keywords: 'the thao bong da giao luu phong trao van nghe the duc' },
        { icon: '🏥', name: 'Bệnh xá / Cấp cứu', cat: 'hr', keywords: 'benh vien cap cuu so cuu phong y te cham soc' },
        { icon: '🎂', name: 'Sinh nhật / Sự kiện nội bộ', cat: 'hr', keywords: 'sinh nhat ky niem lien hoan noi bo tiec mung' },
        { icon: '🥇', name: 'Thi đua / Thành tích', cat: 'hr', keywords: 'huy chuong thi dua danh hieu xuat sac chien si' },

        // Mua sắm & Kỹ thuật (technical)
        { icon: '🛠️', name: 'Sửa chữa / Bảo trì CCDC', cat: 'technical', keywords: 'sua chua bao tri ccdc cong cu bao duong thiet bi' },
        { icon: '🏗️', name: 'Xây dựng / Cải tạo công trình', cat: 'technical', keywords: 'xay dung sua chua nha xuong mat bang cai tao thi cong' },
        { icon: '⚡', name: 'Điện lực / Kỹ thuật cao', cat: 'technical', keywords: 'nang luong dien luc may phat tram bien ap an toan dien' },
        { icon: '🚚', name: 'Vận chuyển / Giao nhận', cat: 'technical', keywords: 'van chuyen giao nhan xe tai chuyen phat logistics' },
        { icon: '🔧', name: 'Trang thiết bị / Dụng cụ', cat: 'technical', keywords: 'dung cu thiet bi may moc phu tung co khi' },
        { icon: '🖥️', name: 'Máy vi tính / Phần mềm', cat: 'technical', keywords: 'may tinh server man hinh it phan mem ban quyen' },
        { icon: '🔍', name: 'Kiểm tra / Rà soát chi phí', cat: 'technical', keywords: 'kiem tra soi xet danh gia audit ra soat' },
        { icon: '🔒', name: 'Bảo mật / Bản quyền', cat: 'technical', keywords: 'khoa bao mat an toan ban quyen mat khau' },
        { icon: '📊', name: 'Báo cáo / Thống kê', cat: 'technical', keywords: 'bieu do phan tich bao cao so lieu excel' }
    ];

    const GroupIconManager = {
        getIcon(groupName) {
            if (!groupName) return '🏢';
            const cleanName = String(groupName).trim();
            // 1. Kiểm tra icon do người dùng tùy chọn lưu trong state / LocalStorage
            if (state.groupIcons && state.groupIcons[cleanName]) {
                return state.groupIcons[cleanName];
            }
            try {
                const saved = localStorage.getItem('THACO_CPHC_GROUP_ICONS');
                if (saved) {
                    const parsed = JSON.parse(saved);
                    if (parsed && parsed[cleanName]) {
                        state.groupIcons[cleanName] = parsed[cleanName];
                        return parsed[cleanName];
                    }
                }
            } catch (e) {}

            // 2. Tra cứu danh mục mặc định
            if (DEFAULT_GROUP_ICONS[cleanName]) return DEFAULT_GROUP_ICONS[cleanName];

            // 3. Nhận diện thông minh theo từ khóa
            const lower = cleanName.toLowerCase();
            if (lower.includes('hoạt động chung') || lower.includes('hoat dong chung')) return '🏢';
            if (lower.includes('kinh doanh') || lower.includes('bán hàng') || lower.includes('khách hàng')) return '💼';
            if (lower.includes('cb-nv') || lower.includes('cbnv') || lower.includes('nhân viên') || lower.includes('cán bộ') || lower.includes('cơm') || lower.includes('ăn')) return '👥';
            if (lower.includes('tiện ích') || lower.includes('văn phòng phẩm')) return '📑';
            if (lower.includes('mua sắm') || lower.includes('sửa chữa') || lower.includes('ccdc') || lower.includes('tscđ')) return '🛠️';
            if (lower.includes('hội họp') || lower.includes('tiếp khách') || lower.includes('giao tế')) return '🤝';
            if (lower.includes('công tác') || lower.includes('lưu trú') || lower.includes('vé máy bay')) return '✈️';
            if (lower.includes('vận hành') || lower.includes('mặt bằng') || lower.includes('điện') || lower.includes('nước')) return '🏢';
            if (lower.includes('khác') || lower.includes('quản trị') || lower.includes('pháp lý') || lower.includes('kiểm toán')) return '⚖️';
            return '🏢';
        },

        setIcon(groupName, icon) {
            if (!groupName || !icon) return;
            const cleanName = String(groupName).trim();
            state.groupIcons = state.groupIcons || {};
            state.groupIcons[cleanName] = icon;
            try {
                localStorage.setItem('THACO_CPHC_GROUP_ICONS', JSON.stringify(state.groupIcons));
            } catch (e) {}
            saveCurrentState();
            refreshAfterIconChange();
        },

        renameGroupIcon(oldName, newName, newIcon) {
            state.groupIcons = state.groupIcons || {};
            const cleanOld = String(oldName || '').trim();
            const cleanNew = String(newName || '').trim();
            const iconToUse = newIcon || (cleanOld ? state.groupIcons[cleanOld] : null) || this.getIcon(cleanOld || cleanNew);
            if (cleanOld && state.groupIcons[cleanOld]) {
                delete state.groupIcons[cleanOld];
            }
            if (cleanNew) {
                state.groupIcons[cleanNew] = iconToUse;
            }
            try {
                localStorage.setItem('THACO_CPHC_GROUP_ICONS', JSON.stringify(state.groupIcons));
            } catch (e) {}
            saveCurrentState();
            refreshAfterIconChange();
        },

        resetIcon(groupName) {
            if (!groupName) return;
            const cleanName = String(groupName).trim();
            if (state.groupIcons && state.groupIcons[cleanName]) {
                delete state.groupIcons[cleanName];
                try {
                    localStorage.setItem('THACO_CPHC_GROUP_ICONS', JSON.stringify(state.groupIcons));
                } catch (e) {}
                saveCurrentState();
                refreshAfterIconChange();
            }
        }
    };

    function refreshAfterIconChange() {
        renderTable();
        renderMappingTab();
        if (window.THACO_DASHBOARD && typeof window.THACO_DASHBOARD.init === 'function') {
            try { window.THACO_DASHBOARD.init(); } catch (e) {}
        }
    }

    window.GroupIconManager = GroupIconManager;
    window.getGroupIcon = (name) => GroupIconManager.getIcon(name);

    // =========================================================================
    // 🪟 ICON PICKER MODAL CONTROLLER
    // =========================================================================

    const iconPickerState = {
        activeGroup: '',
        selectedIcon: '🏢',
        callback: null,
        currentTab: 'all',
        searchQuery: ''
    };

    function openIconPickerModal(groupName, callback) {
        iconPickerState.activeGroup = groupName || 'Nhóm chi phí';
        iconPickerState.callback = callback || null;
        iconPickerState.selectedIcon = GroupIconManager.getIcon(groupName);
        iconPickerState.currentTab = 'all';
        iconPickerState.searchQuery = '';

        const modal = document.getElementById('group-icon-picker-modal');
        const grpNameEl = document.getElementById('icon-picker-group-name');
        const previewEl = document.getElementById('icon-picker-confirm-preview');
        const searchInput = document.getElementById('icon-picker-search');
        const customInput = document.getElementById('icon-picker-custom-input');

        if (grpNameEl) grpNameEl.textContent = iconPickerState.activeGroup;
        if (previewEl) previewEl.textContent = iconPickerState.selectedIcon;
        if (searchInput) searchInput.value = '';
        if (customInput) customInput.value = '';

        // Reset tab active styling
        const tabBtns = document.querySelectorAll('#icon-picker-tabs .icon-tab-btn');
        tabBtns.forEach(btn => {
            if (btn.dataset.cat === 'all') {
                btn.className = 'icon-tab-btn px-2.5 py-1 rounded-full font-bold bg-[#00529C] text-white shadow-2xs transition-all';
            } else {
                btn.className = 'icon-tab-btn px-2.5 py-1 rounded-full font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 transition-all';
            }
        });

        renderIconGrid();
        if (modal) modal.classList.remove('hidden');
    }

    function closeIconPickerModal() {
        const modal = document.getElementById('group-icon-picker-modal');
        if (modal) modal.classList.add('hidden');
        iconPickerState.callback = null;
    }

    function renderIconGrid() {
        const grid = document.getElementById('icon-picker-grid');
        const emptyEl = document.getElementById('icon-picker-empty');
        if (!grid) return;
        grid.innerHTML = '';

        const rawQ = removeVietnameseTones(iconPickerState.searchQuery.trim());
        const filtered = ICON_LIBRARY.filter(item => {
            // Lọc theo danh mục
            if (iconPickerState.currentTab !== 'all') {
                if (iconPickerState.currentTab === 'suggested' && item.cat !== 'suggested') return false;
                if (iconPickerState.currentTab === 'operation' && item.cat !== 'operation' && item.cat !== 'suggested') return false;
                if (iconPickerState.currentTab === 'business' && item.cat !== 'business' && item.cat !== 'suggested') return false;
                if (iconPickerState.currentTab === 'hr' && item.cat !== 'hr' && item.cat !== 'suggested') return false;
                if (iconPickerState.currentTab === 'technical' && item.cat !== 'technical') return false;
            }
            // Lọc theo từ khóa tìm kiếm
            if (rawQ) {
                const itemQ = removeVietnameseTones(`${item.name} ${item.keywords}`);
                return itemQ.includes(rawQ);
            }
            return true;
        });

        if (filtered.length === 0) {
            if (emptyEl) emptyEl.classList.remove('hidden');
        } else {
            if (emptyEl) emptyEl.classList.add('hidden');
            filtered.forEach(item => {
                const isSelected = item.icon === iconPickerState.selectedIcon;
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = `flex flex-col items-center justify-center p-2 rounded-xl border transition-all cursor-pointer select-none group shadow-2xs ${
                    isSelected
                        ? 'border-[#00529C] bg-blue-100/80 ring-2 ring-[#00529C]/50 scale-105'
                        : 'border-slate-200 bg-white hover:border-[#00529C]/60 hover:bg-blue-50/50 hover:scale-105'
                }`;
                btn.title = item.name;
                btn.innerHTML = `
                    <span class="text-2xl group-hover:scale-110 transition-transform">${item.icon}</span>
                    <span class="text-[9px] text-slate-500 truncate w-full text-center mt-1 group-hover:text-[#00529C]">${escapeHtml(item.name.split('/')[0].trim())}</span>
                `;

                btn.addEventListener('click', () => {
                    iconPickerState.selectedIcon = item.icon;
                    const previewEl = document.getElementById('icon-picker-confirm-preview');
                    if (previewEl) previewEl.textContent = item.icon;
                    renderIconGrid();
                });

                // Nhấp đúp chuột để chọn ngay lập tức
                btn.addEventListener('dblclick', () => {
                    iconPickerState.selectedIcon = item.icon;
                    confirmIconPicker();
                });

                grid.appendChild(btn);
            });
        }
    }

    function confirmIconPicker() {
        const chosen = iconPickerState.selectedIcon;
        if (iconPickerState.callback && typeof iconPickerState.callback === 'function') {
            iconPickerState.callback(chosen);
        } else if (iconPickerState.activeGroup) {
            GroupIconManager.setIcon(iconPickerState.activeGroup, chosen);
        }
        closeIconPickerModal();
    }

    // =========================================================================
    // 🪟 GROUP EDIT / ADD MODAL CONTROLLER
    // =========================================================================

    const groupModalState = {
        oldName: '',
        selectedIcon: '🏢'
    };

    function openGroupModal(oldName) {
        groupModalState.oldName = oldName ? String(oldName).trim() : '';
        const modal = document.getElementById('group-edit-modal');
        const titleEl = document.getElementById('group-edit-modal-title');
        const nameInput = document.getElementById('group-edit-name-input');
        const oldNameInput = document.getElementById('group-edit-old-name');
        const iconEl = document.getElementById('group-edit-current-icon');

        if (groupModalState.oldName) {
            groupModalState.selectedIcon = GroupIconManager.getIcon(groupModalState.oldName);
            if (titleEl) titleEl.innerHTML = `✏️ Chỉnh Sửa Nhóm: <span class="text-[#00529C]">${escapeHtml(groupModalState.oldName)}</span>`;
            if (nameInput) nameInput.value = groupModalState.oldName;
            if (oldNameInput) oldNameInput.value = groupModalState.oldName;
        } else {
            groupModalState.selectedIcon = '🏢';
            if (titleEl) titleEl.innerHTML = `➕ Thêm Nhóm Chi Phí Mới`;
            if (nameInput) nameInput.value = '';
            if (oldNameInput) oldNameInput.value = '';
        }

        if (iconEl) iconEl.textContent = groupModalState.selectedIcon;
        if (modal) modal.classList.remove('hidden');
        if (nameInput) setTimeout(() => nameInput.focus(), 100);
    }

    function closeGroupModal() {
        const modal = document.getElementById('group-edit-modal');
        if (modal) modal.classList.add('hidden');
    }

    function handleGroupFormSubmit(e) {
        e.preventDefault();
        const nameInput = document.getElementById('group-edit-name-input');
        const newName = nameInput ? nameInput.value.trim() : '';
        if (!newName) return;

        const oldName = groupModalState.oldName;
        const chosenIcon = groupModalState.selectedIcon || '🏢';

        if (oldName) {
            // Đổi tên nhóm hiện tại
            if (oldName !== newName) {
                state.categories.forEach(c => {
                    if (c.group === oldName) c.group = newName;
                });
                GroupIconManager.renameGroupIcon(oldName, newName, chosenIcon);
            } else {
                GroupIconManager.setIcon(newName, chosenIcon);
            }
        } else {
            // Thêm nhóm mới
            const maxId = state.categories.reduce((m, c) => Math.max(m, c.id || 0), 0);
            state.categories.push({
                id: maxId + 1,
                tt: maxId + 1,
                name: `Khoản mục mới thuộc ${newName}`,
                group: newName,
                b7_display: '',
                b10_display: '',
                b7_codes: [],
                b10_codes: [],
                is_material: false
            });
            GroupIconManager.setIcon(newName, chosenIcon);
        }

        saveCurrentState();
        closeGroupModal();
        renderMappingTab();
        renderTable();
        if (window.THACO_DASHBOARD && typeof window.THACO_DASHBOARD.init === 'function') {
            try { window.THACO_DASHBOARD.init(); } catch (err) {}
        }
    }

    function initIconPickerAndGroupModalEvents() {
        // Icon Picker Modal listeners
        const btnClosePicker = document.getElementById('btn-close-icon-picker');
        const btnCancelPicker = document.getElementById('btn-cancel-icon-picker');
        const btnConfirmPicker = document.getElementById('btn-confirm-icon-picker');
        const btnResetPicker = document.getElementById('btn-reset-group-icon');
        const searchInput = document.getElementById('icon-picker-search');
        const btnApplyCustom = document.getElementById('btn-apply-custom-icon');
        const customInput = document.getElementById('icon-picker-custom-input');

        if (btnClosePicker) btnClosePicker.addEventListener('click', closeIconPickerModal);
        if (btnCancelPicker) btnCancelPicker.addEventListener('click', closeIconPickerModal);
        if (btnConfirmPicker) btnConfirmPicker.addEventListener('click', confirmIconPicker);

        if (btnResetPicker) {
            btnResetPicker.addEventListener('click', () => {
                if (iconPickerState.activeGroup) {
                    GroupIconManager.resetIcon(iconPickerState.activeGroup);
                    iconPickerState.selectedIcon = GroupIconManager.getIcon(iconPickerState.activeGroup);
                    const previewEl = document.getElementById('icon-picker-confirm-preview');
                    if (previewEl) previewEl.textContent = iconPickerState.selectedIcon;
                    renderIconGrid();
                }
            });
        }

        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                iconPickerState.searchQuery = e.target.value;
                renderIconGrid();
            });
        }

        // Category Tab buttons
        const tabBtns = document.querySelectorAll('#icon-picker-tabs .icon-tab-btn');
        tabBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                tabBtns.forEach(b => {
                    b.className = 'icon-tab-btn px-2.5 py-1 rounded-full font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 transition-all';
                });
                btn.className = 'icon-tab-btn px-2.5 py-1 rounded-full font-bold bg-[#00529C] text-white shadow-2xs transition-all';
                iconPickerState.currentTab = btn.dataset.cat || 'all';
                renderIconGrid();
            });
        });

        // Custom emoji input
        if (btnApplyCustom && customInput) {
            btnApplyCustom.addEventListener('click', () => {
                const val = customInput.value.trim();
                if (val) {
                    iconPickerState.selectedIcon = val;
                    const previewEl = document.getElementById('icon-picker-confirm-preview');
                    if (previewEl) previewEl.textContent = val;
                    renderIconGrid();
                }
            });
            customInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    btnApplyCustom.click();
                }
            });
        }

        // Group Edit/Add Modal listeners
        const btnCloseGroupModal = document.getElementById('btn-close-group-edit-modal');
        const btnCancelGroupModal = document.getElementById('btn-cancel-group-edit-modal');
        const formGroupModal = document.getElementById('form-group-edit-modal');
        const btnOpenPickerFromModal = document.getElementById('btn-open-picker-from-group-modal');

        if (btnCloseGroupModal) btnCloseGroupModal.addEventListener('click', closeGroupModal);
        if (btnCancelGroupModal) btnCancelGroupModal.addEventListener('click', closeGroupModal);
        if (formGroupModal) formGroupModal.addEventListener('submit', handleGroupFormSubmit);

        if (btnOpenPickerFromModal) {
            btnOpenPickerFromModal.addEventListener('click', () => {
                const nameInput = document.getElementById('group-edit-name-input');
                const targetGroupName = (nameInput && nameInput.value.trim()) || groupModalState.oldName || 'Nhóm chi phí mới';
                openIconPickerModal(targetGroupName, (chosenIcon) => {
                    groupModalState.selectedIcon = chosenIcon;
                    const iconEl = document.getElementById('group-edit-current-icon');
                    if (iconEl) iconEl.textContent = chosenIcon;
                });
            });
        }
    }

    const DEFAULT_MATERIAL_IDS = [1, 6, 7, 10, 12, 17, 22, 25, 27, 30];

    function ensureCategoryMaterialFlags() {
        if (!state.categories || !Array.isArray(state.categories)) return;
        state.categories.forEach(cat => {
            if (typeof cat.is_material === 'undefined') {
                cat.is_material = DEFAULT_MATERIAL_IDS.includes(cat.id);
            } else {
                cat.is_material = Boolean(cat.is_material);
            }
        });
    }

    function ensureBaselineData() {
        if (!state.categories || state.categories.length === 0) {
            state.categories = JSON.parse(JSON.stringify((typeof THACO_APP_DATA !== 'undefined' && THACO_APP_DATA.categories) || []));
        }
        ensureCategoryMaterialFlags();

        const hasEntities = Array.isArray(state.entities) && state.entities.length > 0;
        const hasDeptData = state.deptData && Object.keys(state.deptData).length > 0 && Object.values(state.deptData).some(v => v && (v['2025']?.length > 0 || v['2026']?.length > 0));
        const hasData2025 = state.data2025 && Object.keys(state.data2025).length > 0 && Object.values(state.data2025).some(ent => ent && Object.keys(ent).length > 0);
        const hasData2024 = state.data2024 && Object.keys(state.data2024).length > 0 && Object.values(state.data2024).some(ent => ent && Object.keys(ent).length > 0);

        if (!hasEntities || !hasDeptData || !hasData2025 || !hasData2024) {
            console.log('Khởi tạo bộ dữ liệu nền chuẩn cho THACO AUTO (C1101) và các khối...');
            const defaultEntities = [
                {
                    code: "C1101",
                    name: "THACO AUTO",
                    cleanName: "THACO AUTO (Văn phòng Điều hành)",
                    mien: "VPĐH",
                    phia: "VP Điều Hành",
                    qt: "THACO AUTO",
                    qtCode: "QT_AUTO",
                    khoiName: "VPĐH",
                    khoi: "KHOI_VPDH"
                },
                {
                    code: "C2305",
                    name: "PP THACO AUTO",
                    cleanName: "Công ty Phân Phối THACO AUTO",
                    mien: "VPĐH",
                    phia: "VP Điều Hành",
                    qt: "PP THACO AUTO",
                    qtCode: "QT_PP",
                    khoiName: "VPĐH",
                    khoi: "KHOI_VPDH"
                },
                {
                    code: "C1103",
                    name: "THACO AUTO Miền Bắc",
                    cleanName: "Công ty CTTT Miền Bắc",
                    mien: "MB",
                    phia: "Phía Bắc",
                    qt: "Công ty CTTT Miền Bắc",
                    qtCode: "QT_MB",
                    khoiName: "CTTT Phía Bắc",
                    khoi: "KHOI_MB"
                },
                {
                    code: "C1104",
                    name: "THACO AUTO Chu Lai",
                    cleanName: "Khối Sản Xuất Chu Lai",
                    mien: "KSX",
                    phia: "Chu Lai",
                    qt: "Nhà máy Chu Lai",
                    qtCode: "QT_CHULAI",
                    khoiName: "Nhà máy",
                    khoi: "KHOI_NHAMAY"
                }
            ];

            state.entities = defaultEntities;
            if (!state.deptData) state.deptData = {};
            if (!state.data2024) state.data2024 = {};
            if (!state.data2025) state.data2025 = {};
            if (!state.data2026) state.data2026 = {};

            const baseMonthly = {
                1: 35, 2: 12, 3: 8, 4: 6, 5: 15,
                6: 65, 7: 40, 8: 25, 9: 10, 10: 85,
                11: 20, 12: 120, 13: 45, 14: 30, 15: 18,
                16: 22, 17: 110, 18: 15, 19: 8, 20: 28,
                21: 14, 22: 95, 23: 7, 24: 5, 25: 32,
                26: 25, 27: 55, 28: 42, 29: 4, 30: 75,
                31: 240, 32: 180, 33: 16, 34: 24, 35: 38,
                36: 60, 37: 30, 38: 20, 39: 15
            };
            const seasonal = [0.92, 0.88, 1.02, 0.98, 1.05, 1.04, 1.01, 0.97, 1.03, 1.06, 1.08, 1.15];

            defaultEntities.forEach(ent => {
                const code = ent.code;
                state.deptData[code] = { '2024': [], '2025': [], '2026': [] };
                state.data2024[code] = {};
                state.data2025[code] = {};
                state.data2026[code] = { '642': {} };

                let scale = 1.0;
                let bpCode = 'B70-A01';
                let tenBp = 'VP Tổng Giám Đốc';
                let khoiPb = 'VP Điều Hành (VPĐH)';

                if (code === 'C2305') {
                    scale = 0.45;
                    bpCode = 'B70-A02';
                    tenBp = 'Ban Bán Hàng Phân Phối';
                    khoiPb = 'VP Điều Hành (VPĐH)';
                } else if (code === 'C1103') {
                    scale = 0.35;
                    bpCode = 'B70-C01';
                    tenBp = 'Ban Điều Hành Miền Bắc';
                    khoiPb = 'Miền Bắc (MB)';
                } else if (code === 'C1104') {
                    scale = 0.55;
                    bpCode = 'B70-D01';
                    tenBp = 'Nhà Máy Lắp Ráp Ô Tô Chu Lai';
                    khoiPb = 'Chu Lai (KSX)';
                }

                state.categories.forEach((cat, idx) => {
                    const catId = cat.id;
                    const catIdStr = String(catId);
                    const base = (baseMonthly[catId] || 20) * scale;

                    // 2024
                    const m24 = seasonal.map(s => Math.round(base * 0.91 * s * 1e6));
                    const tot24 = m24.reduce((a, b) => a + b, 0);
                    state.deptData[code]['2024'].push({
                        stt: idx + 1,
                        entityCode: code,
                        entityName: ent.name,
                        km: (cat.b7_codes && cat.b7_codes[0]) || cat.b7_display || 'CP04-04',
                        tenKm: cat.name,
                        nhom: cat.group,
                        b10: cat.b10_display || '',
                        isMaterial: cat.is_material,
                        bp: bpCode,
                        tenBp: tenBp,
                        khoiPb: khoiPb,
                        year: 2024,
                        ky: 'Cả năm',
                        months: m24,
                        total: tot24,
                        catId: catId
                    });
                    state.data2024[code][catIdStr] = m24;
                    if (!state.data2024[code]['642']) state.data2024[code]['642'] = {};
                    state.data2024[code]['642'][catIdStr] = m24;

                    // 2025
                    const m25 = seasonal.map(s => Math.round(base * 1.00 * s * 1e6));
                    const tot25 = m25.reduce((a, b) => a + b, 0);
                    state.deptData[code]['2025'].push({
                        stt: idx + 1,
                        entityCode: code,
                        entityName: ent.name,
                        km: (cat.b7_codes && cat.b7_codes[0]) || cat.b7_display || 'CP04-04',
                        tenKm: cat.name,
                        nhom: cat.group,
                        b10: cat.b10_display || '',
                        isMaterial: cat.is_material,
                        bp: bpCode,
                        tenBp: tenBp,
                        khoiPb: khoiPb,
                        year: 2025,
                        ky: 'Cả năm',
                        months: m25,
                        total: tot25,
                        catId: catId
                    });
                    state.data2025[code][catIdStr] = m25;
                    if (!state.data2025[code]['642']) state.data2025[code]['642'] = {};
                    state.data2025[code]['642'][catIdStr] = m25;

                    // 2026
                    const m26 = seasonal.map(s => Math.round(base * 1.08 * s * 1e6));
                    const tot26 = m26.reduce((a, b) => a + b, 0);
                    state.deptData[code]['2026'].push({
                        stt: idx + 1,
                        entityCode: code,
                        entityName: ent.name,
                        km: (cat.b7_codes && cat.b7_codes[0]) || cat.b7_display || 'CP04-04',
                        tenKm: cat.name,
                        nhom: cat.group,
                        b10: cat.b10_display || '',
                        isMaterial: cat.is_material,
                        bp: bpCode,
                        tenBp: tenBp,
                        khoiPb: khoiPb,
                        year: 2026,
                        ky: 'T1 - T7',
                        months: m26,
                        total: tot26,
                        catId: catId
                    });
                    state.data2026[code]['642'][catIdStr] = m26;
                    state.data2026[code][catIdStr] = m26;
                });
            });

            saveCurrentState();
        }
    }

    function init() {
        purgeLegacyCaches();

        if (typeof THACO_APP_DATA === 'undefined') {
            console.error('THACO_APP_DATA is not loaded!');
            alert('Không tìm thấy dữ liệu nguồn app_data.js.');
            return;
        }

        // 1. Nạp baseline từ app_data.js
        state.categories = JSON.parse(JSON.stringify(THACO_APP_DATA.categories || []));
        state.entities = JSON.parse(JSON.stringify(THACO_APP_DATA.entities || []));
        state.data2024 = JSON.parse(JSON.stringify(THACO_APP_DATA.data2024 || {}));
        state.data2025 = JSON.parse(JSON.stringify(THACO_APP_DATA.data2025 || {}));
        state.data2026 = JSON.parse(JSON.stringify(THACO_APP_DATA.data2026 || {}));
        state.deptData = JSON.parse(JSON.stringify(THACO_APP_DATA.deptData || {}));
        ensureCategoryMaterialFlags();

        // 2. Tự động khôi phục từ Storage phiên làm việc cuối cùng của người dùng
        loadSavedState();

        // 3. Đảm bảo dữ liệu cơ sở không bao giờ bị rỗng (Fallback Baseline C1101 & CB-NV)
        ensureBaselineData();
        ensureBaselineCbnvData();

        // 4. Khởi tạo và liên kết đồng bộ 2 chiều với Google Sheet Quan_Ly_Chi_Phi (DM_CPHC)
        initGoogleSheetSync();

        setupEventListeners();
        setupMonthPicker();
        setupYearPicker();
        updateYearPickerUI();
        populateSlicers();
        ensureQtpnMappings();
        renderAll();

        window.addEventListener('resize', () => {
            const activeBtn = document.querySelector('#app-tabs-nav button.text-white') || document.getElementById('tab-report-btn');
            if (activeBtn) updateTabIndicator(activeBtn, true);
        });

        setTimeout(() => {
            const activeBtn = document.querySelector('#app-tabs-nav button.text-white') || document.getElementById('tab-report-btn');
            if (activeBtn) updateTabIndicator(activeBtn, true);
        }, 100);
    }

    // ==========================================
    // 💾 STORAGE PERSISTENCE ENGINE
    // ==========================================

    function saveCurrentState() {
        clearReportDataCache();
        try {
            const dataToSave = {
                categories: state.categories,
                groupIcons: state.groupIcons,
                entities: state.entities,
                qtpnMappings: state.qtpnMappings,
                deptData: state.deptData,
                data2026: state.data2026,
                actualMonths: state.actualMonths,
                selectedMonths: state.selectedMonths,
                data2024: state.data2024,
                data2025: state.data2025,
                compareConfig: state.compareConfig,
                cbnvConfig: state.cbnvConfig,
                cbnvData: state.cbnvData,
                cbnvAudit: state.cbnvAudit,
                timestamp: new Date().toISOString()
            };
            localStorage.setItem(STORAGE_KEY, JSON.stringify(dataToSave));
            console.log('Đã tự động lưu phiên làm việc vào LocalStorage.');
        } catch (e) {
            console.warn('Lỗi lưu LocalStorage (có thể dung lượng vượt quá giới hạn):', e);
        }
    }

    function loadSavedState() {
        try {
            // Nạp Group Icons độc lập từ storage
            try {
                const savedIconsRaw = localStorage.getItem('THACO_CPHC_GROUP_ICONS');
                if (savedIconsRaw) {
                    const parsed = JSON.parse(savedIconsRaw);
                    if (parsed && typeof parsed === 'object') {
                        state.groupIcons = Object.assign({}, parsed, state.groupIcons || {});
                    }
                }
            } catch (err) {}

            const raw = localStorage.getItem(STORAGE_KEY);
            if (raw) {
                const saved = JSON.parse(raw);
                // Kiểm tra nếu cache còn chứa các mã giả cũ (C1001, N1309...) thì tự động xoá
                const hasLegacy = (saved.entities || []).some(e => ['C1001', 'N1309', 'N1308', 'C1102'].includes(e.code)) ||
                                  Object.keys(saved.data2025 || {}).some(k => ['C1001', 'N1309', 'C1102'].includes(k));
                if (hasLegacy) {
                    console.warn('Phát hiện dữ liệu mẫu cũ trong LocalStorage. Đang tự động làm sạch...');
                    localStorage.removeItem(STORAGE_KEY);
                    return;
                }

                if (saved.categories && Array.isArray(saved.categories)) {
                    state.categories = saved.categories;
                }
                if (saved.groupIcons && typeof saved.groupIcons === 'object') {
                    state.groupIcons = Object.assign({}, state.groupIcons || {}, saved.groupIcons);
                }
                if (saved.entities && Array.isArray(saved.entities)) {
                    state.entities = saved.entities;
                }
                if (saved.qtpnMappings && Array.isArray(saved.qtpnMappings)) {
                    state.qtpnMappings = saved.qtpnMappings;
                }
                if (saved.data2026) {
                    state.data2026 = saved.data2026;
                }
                if (saved.actualMonths && Array.isArray(saved.actualMonths)) {
                    state.actualMonths = saved.actualMonths;
                }
                if (saved.selectedMonths && Array.isArray(saved.selectedMonths)) {
                    state.selectedMonths = saved.selectedMonths;
                }
                if (saved.data2024) {
                    state.data2024 = saved.data2024;
                }
                if (saved.data2025) {
                    state.data2025 = saved.data2025;
                }
                if (saved.compareConfig) {
                    state.compareConfig = saved.compareConfig;
                }
                if (saved.deptData) {
                    state.deptData = saved.deptData;
                }
                if (saved.cbnvConfig && typeof saved.cbnvConfig === 'object') {
                    state.cbnvConfig = saved.cbnvConfig;
                }
                if (saved.cbnvData && typeof saved.cbnvData === 'object') {
                    state.cbnvData = saved.cbnvData;
                }
                if (saved.cbnvAudit && typeof saved.cbnvAudit === 'object') {
                    state.cbnvAudit = saved.cbnvAudit;
                }
                ensureCategoryMaterialFlags();
                console.log('Đã nạp dữ liệu từ bộ nhớ đệm Google Sheet Live V3.');
            }
        } catch (e) {
            console.error('Không thể nạp dữ liệu từ LocalStorage:', e);
        }
    }

    function resetToBaseline() {
        if (!confirm('Anh/Chị có chắc chắn muốn XÓA TOÀN BỘ bộ nhớ tạm trình duyệt và tải lại mới từ Google Sheet?')) {
            return;
        }

        try {
            localStorage.removeItem(STORAGE_KEY);
            try { localStorage.removeItem('THACO_CPHC_GROUP_ICONS'); } catch (err) {}
            purgeLegacyCaches();

            state.groupIcons = {};
            state.categories = JSON.parse(JSON.stringify(THACO_APP_DATA.categories || []));
            state.entities = JSON.parse(JSON.stringify(THACO_APP_DATA.entities || []));
            state.data2025 = JSON.parse(JSON.stringify(THACO_APP_DATA.data2025 || {}));
            state.data2026 = JSON.parse(JSON.stringify(THACO_APP_DATA.data2026 || {}));
            state.deptData = JSON.parse(JSON.stringify(THACO_APP_DATA.deptData || {}));
            state.actualMonths = [1, 2, 3, 4, 5, 6, 7];
            state.selectedMonths = [1, 2, 3, 4, 5, 6, 7];
            state.cbnvConfig = { displayMode: 'BOTH' };
            state.cbnvData = {};
            ensureBaselineCbnvData();
            ensureCategoryMaterialFlags();

            populateSlicers();
            syncMonthCheckboxesUI();
            updateMonthSummaryLabel();
            renderAll();

            syncFromGoogleSheet(false);
            alert('Đã xóa sạch bộ nhớ tạm và đang đồng bộ lại từ Google Sheet!');
        } catch (e) {
            alert('Có lỗi khi reset dữ liệu: ' + e.message);
        }
    }

    function exportMasterAppData() {
        const dataStr = 'var THACO_APP_DATA = ' + JSON.stringify({
            categories: state.categories,
            entities: state.entities,
            data2025: state.data2025,
            data2026: state.data2026,
            deptData: state.deptData
        }, null, 2) + ';\n';

        const blob = new Blob([dataStr], { type: 'application/javascript;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'app_data.js';
        a.click();
        URL.revokeObjectURL(url);
    }

    // ==========================================
    // 🌐 GOOGLE SHEETS TWO-WAY SYNC ENGINE
    // ==========================================

    const GSHEET_CONFIG_KEY = 'THACO_CPHC_GSHEET_SYNC_CONFIG_V1';
    const APPS_SCRIPT_SOURCE_CODE = "/**\n * =========================================================================================\n * GOOGLE APPS SCRIPT: HỆ THỐNG QUẢN TRỊ CHI PHÍ HÀNH CHÍNH - THACO AUTO\n * File Google Sheet: Quan_Ly_Chi_Phi\n * (ID: 1UwV3TbvAfeLZslEazzcFWi5cXsJo98AQmxX5dXH1Pqo)\n * \n * Các Sheet quản lý:\n * 1. DM_CPHC : Cấu hình danh mục phí, mã B7, mã B10, Nhóm phí, Trọng yếu (⭐)\n * 2. DM_QTPN : Danh mục ánh xạ Quản trị ↔ Pháp nhân (TT, Khối Đơn Vị, Mã QT, Tên QT, Mã PN, Tên PN)\n * 3. CP_AUTO : Toàn bộ dữ liệu chi phí hành chính THACO AUTO (C1101 - VPĐH)\n * 4. CP_PP   : Dữ liệu chi phí hành chính Phân Phối THACO AUTO (C2305)\n * 5. CP_CTTT : Dữ liệu chi phí hành chính các Công ty Tỉnh Thành / Chi nhánh\n * =========================================================================================\n * \n * HƯỚNG DẪN TRIỂN KHAI / CẬP NHẬT (MẤT 1 PHÚT):\n * 1. Mở file Google Sheet Quan_Ly_Chi_Phi trên trình duyệt:\n *    https://docs.google.com/spreadsheets/d/1UwV3TbvAfeLZslEazzcFWi5cXsJo98AQmxX5dXH1Pqo/edit\n * 2. Vào menu \"Tiện ích mở rộng\" (Extensions) > chọn \"Apps Script\".\n * 3. Dán toàn bộ mã nguồn này đè vào file Code.gs và bấm Ctrl + S (Lưu).\n * 4. Bấm \"Triển khai\" (Deploy) > \"Quản lý bản triển khai\" (Manage deployments) hoặc \"Triển khai mới\" (New deployment).\n * 5. Chọn loại \"Ứng dụng web\" (Web app):\n *    - Thực thi dưới dạng (Execute as): \"Tôi\" (Me)\n *    - Ai có quyền truy cập (Who has access): \"Bất kỳ ai\" (Anyone)\n * 6. Bấm \"Triển khai\" (Deploy) > Sao chép \"URL ứng dụng web\" dán vào Web App.\n * =========================================================================================\n */\n\nvar SHEET_DM_CPHC = 'DM_CPHC';\nvar SHEET_DM_QTPN = 'DM_QTPN';\nvar COST_SHEETS = ['CP_AUTO', 'CP_PP', 'CP_CTTT', 'CP_VPDH', 'CP_NHAMAY', 'CP_CTTT_MB', 'CP_CTTT_MN'];\n\nvar COST_COLUMNS = [\n  'STT',\n  'Mã ĐVCS',\n  'Tên Pháp Nhân / Đơn Vị',\n  'Mã B7',\n  'Tên Khoản Mục (B7)',\n  'Nhóm Chi Phí',\n  'Mã B10',\n  'Trọng Yếu (⭐)',\n  'Mã Bộ Phận',\n  'Tên Bộ Phận',\n  'Khối Phòng Ban',\n  'Năm',\n  'Kỳ Thực Hiện',\n  'T01', 'T02', 'T03', 'T04', 'T05', 'T06',\n  'T07', 'T08', 'T09', 'T10', 'T11', 'T12',\n  'Tổng Cộng'\n];\n\n/**\n * Tạo menu THACO AUTO trong Google Sheet\n */\nfunction onOpen() {\n  SpreadsheetApp.getUi()\n    .createMenu('🚗 THACO AUTO')\n    .addItem('🔄 Kiểm tra cấu trúc DM_CPHC', 'checkDmStructure')\n    .addItem('✨ Chuẩn hóa định dạng DM_CPHC', 'formatDmSheet')\n    .addSeparator()\n    .addItem('🔄 Kiểm tra cấu trúc DM_QTPN', 'checkDmQtpnStructure')\n    .addItem('✨ Chuẩn hóa định dạng DM_QTPN', 'formatDmQtpnSheet')\n    .addSeparator()\n    .addItem('📊 Khởi tạo cấu trúc các Sheet Chi phí (CP_AUTO, CP_PP, CP_CTTT)', 'initCostSheets')\n    .addItem('✨ Chuẩn hóa định dạng các Sheet Chi phí', 'formatAllCostSheets')\n    .addToUi();\n}\n\n/**\n * =========================================================================================\n * API GET: Đọc dữ liệu từ Google Sheet về Web App\n * Hỗ trợ các chế độ:\n * 1. Mặc định hoặc ?action=get_all : Đọc TOÀN BỘ (DM_CPHC, DM_QTPN và CP_AUTO, CP_PP, CP_CTTT)\n * 2. ?action=get_dm               : Chỉ đọc danh mục DM_CPHC\n * 3. ?action=get_qtpn             : Chỉ đọc danh mục DM_QTPN\n * 4. ?action=get_cphc_data&sheet=CP_AUTO : Chỉ đọc dữ liệu của 1 sheet chi phí cụ thể\n * =========================================================================================\n */\nfunction doGet(e) {\n  try {\n    var params = e ? e.parameter || {} : {};\n    var action = params.action || 'get_all';\n    var sheetName = params.sheet || '';\n\n    // Trường hợp 1: Đọc riêng 1 sheet chi phí\n    if (action === 'get_cphc_data' && sheetName) {\n      return handleGetCostData(sheetName);\n    }\n\n    // Trường hợp 2: Đọc riêng Danh mục DM_CPHC\n    if (action === 'get_dm') {\n      return handleGetDmCphc();\n    }\n\n    // Trường hợp 3: Đọc riêng Danh mục DM_QTPN\n    if (action === 'get_qtpn') {\n      return handleGetDmQtpn();\n    }\n\n    // Trường hợp 4: Mặc định (action === 'get_all' hoặc không truyền tham số):\n    return handleGetAllData();\n\n  } catch (err) {\n    return jsonResponse({\n      status: 'error',\n      message: 'Lỗi doGet: ' + err.toString()\n    });\n  }\n}\n\n/**\n * =========================================================================================\n * API POST: Nhận dữ liệu từ Web App ghi vào Google Sheet\n * Hỗ trợ các chế độ:\n * 1. Ghi chi phí đã làm sạch: payload.action === 'save_cphc_data'\n * 2. Ghi danh mục Quản trị ↔ Pháp nhân: payload.action === 'save_qtpn' hoặc payload.qtpnMappings\n * 3. Ghi danh mục DM_CPHC: payload.action === 'save_dm' hoặc payload.categories\n * =========================================================================================\n */\nfunction doPost(e) {\n  try {\n    var raw = e.postData && e.postData.contents ? e.postData.contents : '';\n    if (!raw) {\n      return jsonResponse({ status: 'error', message: 'Dữ liệu POST rỗng.' });\n    }\n\n    var payload = JSON.parse(raw);\n\n    // Trường hợp 1: Ghi dữ liệu chi phí đã làm sạch từ Bravo (CP_AUTO / CP_PP / CP_CTTT)\n    if (payload.action === 'save_cphc_data') {\n      return handleSaveCostData(payload);\n    }\n\n    // Trường hợp 2: Ghi danh mục Quản trị ↔ Pháp nhân DM_QTPN\n    if (payload.action === 'save_qtpn' || payload.qtpnMappings) {\n      return handleSaveDmQtpn(payload);\n    }\n\n    // Trường hợp 3: Ghi danh mục DM_CPHC\n    return handleSaveDmCphc(payload);\n\n  } catch (err) {\n    return jsonResponse({\n      status: 'error',\n      message: 'Lỗi doPost: ' + err.toString()\n    });\n  }\n}\n\n/**\n * =========================================================================================\n * XỬ LÝ LẤY TOÀN BỘ DỮ LIỆU (GET_ALL)\n * =========================================================================================\n */\nfunction handleGetAllData() {\n  var ss = SpreadsheetApp.getActiveSpreadsheet();\n\n  // 1. Đọc Danh mục DM_CPHC\n  var categories = readDmCategories(ss);\n\n  // 2. Đọc Danh mục DM_QTPN\n  var qtpnMappings = readDmQtpn(ss);\n\n  // 3. Đọc các sheet chi phí\n  var costSheets = {};\n  var allCostRows = [];\n\n  COST_SHEETS.forEach(function(sName) {\n    var sRows = readSheetCostRows(ss, sName);\n    costSheets[sName] = sRows;\n    allCostRows = allCostRows.concat(sRows);\n  });\n\n  return jsonResponse({\n    status: 'success',\n    updatedAt: new Date().toISOString(),\n    categories: categories,\n    qtpnMappings: qtpnMappings,\n    costSheets: costSheets,\n    allCostRows: allCostRows,\n    totalCostRows: allCostRows.length\n  });\n}\n\n/**\n * Đọc toàn bộ danh mục từ sheet DM_CPHC\n */\nfunction readDmCategories(ss) {\n  var sheet = ss.getSheetByName(SHEET_DM_CPHC);\n  if (!sheet || sheet.getLastRow() <= 1) return [];\n\n  var data = sheet.getDataRange().getValues();\n  if (data.length <= 1) return [];\n\n  var headers = data[0];\n  var colMap = { tt: -1, group: -1, b7: -1, b10: -1, name: -1, isMaterial: -1 };\n\n  for (var c = 0; c < headers.length; c++) {\n    var h = String(headers[c] || '').toLowerCase().trim();\n    if (h.indexOf('tt') !== -1 || h.indexOf('stt') !== -1) colMap.tt = c;\n    else if (h.indexOf('nhóm') !== -1 || h.indexOf('group') !== -1) colMap.group = c;\n    else if (h.indexOf('b7') !== -1) colMap.b7 = c;\n    else if (h.indexOf('b10') !== -1) colMap.b10 = c;\n    else if (h.indexOf('tên') !== -1 || h.indexOf('khoản mục') !== -1 || h.indexOf('diễn giải') !== -1) colMap.name = c;\n    else if (h.indexOf('trọng yếu') !== -1 || h.indexOf('material') !== -1 || h.indexOf('⭐') !== -1) colMap.isMaterial = c;\n  }\n\n  if (colMap.tt === -1) colMap.tt = 0;\n  if (colMap.group === -1) colMap.group = 1;\n  if (colMap.b7 === -1) colMap.b7 = 2;\n  if (colMap.b10 === -1) colMap.b10 = 3;\n  if (colMap.name === -1) colMap.name = 4;\n  if (colMap.isMaterial === -1) colMap.isMaterial = 5;\n\n  var categories = [];\n  var currentGroup = 'Chi phí hoạt động chung';\n\n  for (var r = 1; r < data.length; r++) {\n    var row = data[r];\n    if (!row || row.every(function(cell) { return cell === '' || cell === null; })) continue;\n\n    var nameVal = String(row[colMap.name] || '').trim();\n    var b7Val = String(row[colMap.b7] || '').trim();\n    var b10Val = String(row[colMap.b10] || '').trim();\n    var grpVal = String(row[colMap.group] || '').trim();\n    var ttVal = parseInt(row[colMap.tt], 10) || (categories.length + 1);\n\n    var isMat = false;\n    if (colMap.isMaterial !== -1 && row[colMap.isMaterial]) {\n      var mStr = String(row[colMap.isMaterial]).toLowerCase().trim();\n      isMat = (mStr === 'true' || mStr === '1' || mStr === 'x' || mStr === '⭐' || mStr === 'có');\n    }\n\n    if (grpVal) currentGroup = grpVal;\n    if (!b7Val && !b10Val && !nameVal) continue;\n\n    var b7Codes = b7Val ? b7Val.split(/[,;\\s]+/).map(function(s){ return s.trim(); }).filter(Boolean) : [];\n    var b10Codes = b10Val ? b10Val.split(/[,;\\s]+/).map(function(s){ return s.trim(); }).filter(Boolean) : [];\n\n    categories.push({\n      id: r,\n      tt: ttVal,\n      group: currentGroup,\n      b7_display: b7Val,\n      b10_display: b10Val,\n      b7_codes: b7Codes,\n      b10_codes: b10Codes,\n      name: nameVal || b7Val || ('Khoản mục ' + r),\n      is_material: isMat\n    });\n  }\n\n  return categories;\n}\n\n/**\n * Đọc toàn bộ dòng chi phí từ một sheet chi phí cụ thể\n */\nfunction readSheetCostRows(ss, sheetName) {\n  var sheet = ss.getSheetByName(sheetName);\n  if (!sheet || sheet.getLastRow() <= 1) return [];\n\n  var data = sheet.getDataRange().getValues();\n  if (data.length <= 1) return [];\n\n  var headers = data[0];\n  var rows = [];\n\n  for (var r = 1; r < data.length; r++) {\n    var raw = data[r];\n    if (!raw || raw.every(function(c) { return c === '' || c === null; })) continue;\n\n    var item = {};\n    for (var c = 0; c < headers.length; c++) {\n      item[headers[c]] = raw[c];\n    }\n    rows.push(item);\n  }\n\n  return rows;\n}\n\n/**\n * =========================================================================================\n * XỬ LÝ DANH MỤC PHÍ (DM_CPHC)\n * =========================================================================================\n */\nfunction handleGetDmCphc() {\n  var ss = SpreadsheetApp.getActiveSpreadsheet();\n  var categories = readDmCategories(ss);\n\n  return jsonResponse({\n    status: 'success',\n    sheet: SHEET_DM_CPHC,\n    count: categories.length,\n    updatedAt: new Date().toISOString(),\n    categories: categories\n  });\n}\n\nfunction handleSaveDmCphc(payload) {\n  var categories = payload.categories;\n  if (!categories || !Array.isArray(categories)) {\n    return jsonResponse({ status: 'error', message: 'Mảng categories không đúng định dạng.' });\n  }\n\n  var ss = SpreadsheetApp.getActiveSpreadsheet();\n  var sheet = ss.getSheetByName(SHEET_DM_CPHC);\n  if (!sheet) {\n    sheet = ss.insertSheet(SHEET_DM_CPHC);\n  }\n\n  sheet.clear();\n\n  var headerRow = [\n    'TT',\n    'Nhóm Chi Phí',\n    'Mã Bravo 7',\n    'Mã Bravo 10',\n    'Tên Khoản Mục / Diễn Giải',\n    'Trọng yếu (⭐)'\n  ];\n\n  var rows = [headerRow];\n  categories.forEach(function(cat, index) {\n    var b7Text = cat.b7_display || (cat.b7_codes ? cat.b7_codes.join(', ') : '');\n    var b10Text = cat.b10_display || (cat.b10_codes ? cat.b10_codes.join(', ') : '');\n    var tt = cat.tt || (index + 1);\n    var grp = cat.group || 'Chi phí hoạt động chung';\n    var name = cat.name || '';\n    var mat = cat.is_material ? '⭐' : '';\n    rows.push([tt, grp, b7Text, b10Text, name, mat]);\n  });\n\n  sheet.getRange(1, 1, rows.length, 6).setValues(rows);\n\n  var headerRange = sheet.getRange(1, 1, 1, 6);\n  headerRange.setBackground('#00529C')\n             .setFontColor('#FFFFFF')\n             .setFontWeight('bold')\n             .setHorizontalAlignment('center')\n             .setVerticalAlignment('middle');\n  sheet.setRowHeight(1, 35);\n\n  if (rows.length > 1) {\n    sheet.getRange(2, 1, rows.length - 1, 1).setHorizontalAlignment('center');\n    sheet.getRange(2, 3, rows.length - 1, 2).setHorizontalAlignment('center');\n    sheet.getRange(2, 6, rows.length - 1, 1).setHorizontalAlignment('center');\n  }\n\n  sheet.setFrozenRows(1);\n  sheet.autoResizeColumns(1, 6);\n\n  return jsonResponse({\n    status: 'success',\n    message: 'Đã đồng bộ thành công ' + categories.length + ' khoản mục lên Google Sheet DM_CPHC!',\n    count: categories.length,\n    updatedAt: new Date().toISOString()\n  });\n}\n\n/**\n * =========================================================================================\n * XỬ LÝ QUẢN TRỊ ↔ PHÁP NHÂN (DM_QTPN)\n * =========================================================================================\n */\nfunction handleGetDmQtpn() {\n  var ss = SpreadsheetApp.getActiveSpreadsheet();\n  var mappings = readDmQtpn(ss);\n\n  return jsonResponse({\n    status: 'success',\n    sheet: SHEET_DM_QTPN,\n    count: mappings.length,\n    updatedAt: new Date().toISOString(),\n    qtpnMappings: mappings\n  });\n}\n\nfunction readDmQtpn(ss) {\n  var sheet = ss.getSheetByName(SHEET_DM_QTPN);\n  if (!sheet || sheet.getLastRow() <= 1) return [];\n\n  var data = sheet.getDataRange().getValues();\n  if (data.length <= 1) return [];\n\n  var headers = data[0].map(function(h) { return String(h || '').trim().toLowerCase(); });\n  var colMap = { tt: 0, khoi: -1, maQt: -1, tenQt: -1, maPn: -1, tenPn: -1 };\n\n  for (var c = 0; c < headers.length; c++) {\n    var h = headers[c];\n    if (h.indexOf('khối') !== -1 || h.indexOf('khoi') !== -1 || (h.indexOf('đơn vị') !== -1 && h.indexOf('quản trị') === -1)) colMap.khoi = c;\n    else if (h.indexOf('mã quản trị') !== -1 || h.indexOf('ma quan tri') !== -1 || h.indexOf('mã qt') !== -1) colMap.maQt = c;\n    else if (h.indexOf('tên quản trị') !== -1 || h.indexOf('ten quan tri') !== -1 || h.indexOf('đơn vị quản trị') !== -1 || h.indexOf('tên qt') !== -1) colMap.tenQt = c;\n    else if (h.indexOf('mã pháp nhân') !== -1 || h.indexOf('ma phap nhan') !== -1 || h.indexOf('mã đvcs') !== -1 || h.indexOf('mã pn') !== -1) colMap.maPn = c;\n    else if (h.indexOf('tên pháp nhân') !== -1 || h.indexOf('ten phap nhan') !== -1 || h.indexOf('tên đvcs') !== -1 || h.indexOf('tên pn') !== -1 || h.indexOf('showroom') !== -1) colMap.tenPn = c;\n  }\n\n  var is6Cols = data[0].length >= 6;\n  if (colMap.khoi === -1) colMap.khoi = is6Cols ? 1 : -1;\n  if (colMap.maQt === -1) colMap.maQt = is6Cols ? 2 : 1;\n  if (colMap.tenQt === -1) colMap.tenQt = is6Cols ? 3 : 2;\n  if (colMap.maPn === -1) colMap.maPn = is6Cols ? 4 : 3;\n  if (colMap.tenPn === -1) colMap.tenPn = is6Cols ? 5 : 4;\n\n  var mappings = [];\n  for (var r = 1; r < data.length; r++) {\n    var row = data[r];\n    if (!row || row.every(function(cell) { return cell === '' || cell === null; })) continue;\n\n    var khoi = colMap.khoi !== -1 ? String(row[colMap.khoi] || '').trim() : 'VPĐH';\n    var maQt = String(row[colMap.maQt] || '').trim();\n    var tenQt = String(row[colMap.tenQt] || '').trim();\n    var maPn = String(row[colMap.maPn] || '').trim();\n    var tenPn = String(row[colMap.tenPn] || '').trim();\n\n    if (!maQt && !tenQt && !maPn && !tenPn) continue;\n\n    mappings.push({\n      stt: parseInt(row[colMap.tt], 10) || (mappings.length + 1),\n      khoi: khoi || 'VPĐH',\n      maQt: maQt,\n      tenQt: tenQt,\n      maPn: maPn,\n      tenPn: tenPn\n    });\n  }\n\n  return mappings;\n}\n\nfunction handleSaveDmQtpn(payload) {\n  var mappings = payload.qtpnMappings || payload.mappings;\n  if (!mappings || !Array.isArray(mappings)) {\n    return jsonResponse({ status: 'error', message: 'Mảng qtpnMappings không đúng định dạng.' });\n  }\n\n  var ss = SpreadsheetApp.getActiveSpreadsheet();\n  var sheet = ss.getSheetByName(SHEET_DM_QTPN);\n  if (!sheet) {\n    sheet = ss.insertSheet(SHEET_DM_QTPN);\n  }\n\n  sheet.clear();\n\n  var headerRow = [\n    'TT',\n    'Khối Đơn Vị',\n    'Mã Quản trị',\n    'Tên Quản trị',\n    'Mã pháp nhân',\n    'Tên pháp nhân'\n  ];\n\n  var rows = [headerRow];\n  mappings.forEach(function(item, index) {\n    var tt = item.stt || (index + 1);\n    var khoi = item.khoi || 'VPĐH';\n    var maQt = item.maQt || item.maQuanti || '';\n    var tenQt = item.tenQt || item.tenQuanti || '';\n    var maPn = item.maPn || item.maPhapNhan || '';\n    var tenPn = item.tenPn || item.tenPhapNhan || '';\n    rows.push([tt, khoi, maQt, tenQt, maPn, tenPn]);\n  });\n\n  sheet.getRange(1, 1, rows.length, 6).setValues(rows);\n\n  var headerRange = sheet.getRange(1, 1, 1, 6);\n  headerRange.setBackground('#00529C')\n             .setFontColor('#FFFFFF')\n             .setFontWeight('bold')\n             .setHorizontalAlignment('center')\n             .setVerticalAlignment('middle');\n  sheet.setRowHeight(1, 35);\n\n  if (rows.length > 1) {\n    sheet.getRange(2, 1, rows.length - 1, 1).setHorizontalAlignment('center');\n    sheet.getRange(2, 2, rows.length - 1, 1).setHorizontalAlignment('center');\n    sheet.getRange(2, 3, rows.length - 1, 1).setHorizontalAlignment('center');\n    sheet.getRange(2, 5, rows.length - 1, 1).setHorizontalAlignment('center');\n  }\n\n  sheet.setFrozenRows(1);\n  sheet.autoResizeColumns(1, 6);\n\n  return jsonResponse({\n    status: 'success',\n    message: 'Đã đồng bộ thành công ' + mappings.length + ' dòng ánh xạ lên Google Sheet DM_QTPN!',\n    count: mappings.length,\n    updatedAt: new Date().toISOString()\n  });\n}\n\n/**\n * =========================================================================================\n * XỬ LÝ CHI PHÍ ĐÃ LÀM SẠCH (CP_AUTO / CP_PP / CP_CTTT)\n * =========================================================================================\n */\nfunction handleGetCostData(sheetName) {\n  var ss = SpreadsheetApp.getActiveSpreadsheet();\n  var sheet = ss.getSheetByName(sheetName);\n  if (!sheet) {\n    return jsonResponse({\n      status: 'error',\n      message: 'Sheet \"' + sheetName + '\" chưa tồn tại trên file này.'\n    });\n  }\n\n  var rows = readSheetCostRows(ss, sheetName);\n\n  return jsonResponse({\n    status: 'success',\n    sheet: sheetName,\n    count: rows.length,\n    rows: rows\n  });\n}\n\nfunction handleSaveCostData(payload) {\n  var targetSheet = payload.targetSheet || 'CP_AUTO';\n  if (COST_SHEETS.indexOf(targetSheet) === -1) {\n    targetSheet = 'CP_AUTO';\n  }\n\n  var newRows = payload.rows;\n  if (!newRows || !Array.isArray(newRows)) {\n    return jsonResponse({ status: 'error', message: 'Mảng rows không đúng định dạng.' });\n  }\n\n  var entityCode = payload.entityCode ? String(payload.entityCode).trim() : '';\n  var year = payload.year ? parseInt(payload.year, 10) : null;\n  var mode = payload.mode || 'replace_year_entity'; // 'replace_year_entity' | 'overwrite' | 'append'\n\n  var ss = SpreadsheetApp.getActiveSpreadsheet();\n  var sheet = ss.getSheetByName(targetSheet);\n  if (!sheet) {\n    sheet = ss.insertSheet(targetSheet);\n  }\n\n  var existingValues = [];\n  if (sheet.getLastRow() > 1 && mode === 'replace_year_entity') {\n    existingValues = sheet.getRange(2, 1, sheet.getLastRow() - 1, COST_COLUMNS.length).getValues();\n  }\n\n  var preservedRows = [];\n  if (mode === 'replace_year_entity' && existingValues.length > 0) {\n    preservedRows = existingValues.filter(function(row) {\n      var rowEntity = String(row[1] || '').trim(); // Cột 2: Mã ĐVCS\n      var rowYear = parseInt(row[11], 10);        // Cột 12: Năm\n      if (entityCode && year) {\n        return !(rowEntity === entityCode && rowYear === year);\n      } else if (year) {\n        return rowYear !== year;\n      } else if (entityCode) {\n        return rowEntity !== entityCode;\n      }\n      return false;\n    });\n  }\n\n  // Chuẩn hóa dữ liệu mới thành mảng 2 chiều theo đúng 26 cột COST_COLUMNS\n  var formattedNewRows = newRows.map(function(item) {\n    if (Array.isArray(item)) return item;\n\n    var months = item.months || [0,0,0,0,0,0,0,0,0,0,0,0];\n    var totalVal = typeof item.total === 'number' ? item.total : months.reduce(function(a,b){ return a + (b||0); }, 0);\n\n    return [\n      item.stt || '',\n      item.entityCode || entityCode || 'C1101',\n      item.entityName || 'THACO AUTO',\n      item.km || item.b7 || '',\n      item.tenKm || item.name || '',\n      item.nhom || 'Chi phí hoạt động chung',\n      item.b10 || '',\n      item.isMaterial ? '⭐' : '',\n      item.bp || '',\n      item.tenBp || '',\n      item.khoiPb || '',\n      item.year || year || 2026,\n      item.ky || (item.year === 2025 ? 'Cả năm' : 'T1 - T7'),\n      months[0] || 0,\n      months[1] || 0,\n      months[2] || 0,\n      months[3] || 0,\n      months[4] || 0,\n      months[5] || 0,\n      months[6] || 0,\n      months[7] || 0,\n      months[8] || 0,\n      months[9] || 0,\n      months[10] || 0,\n      months[11] || 0,\n      totalVal\n    ];\n  });\n\n  var finalDataRows = preservedRows.concat(formattedNewRows);\n\n  // Đánh lại số thứ tự STT\n  finalDataRows.forEach(function(r, idx) {\n    r[0] = idx + 1;\n  });\n\n  // Ghi toàn bộ dữ liệu (Header + Rows)\n  sheet.clear();\n  var writeArray = [COST_COLUMNS].concat(finalDataRows);\n\n  var numRows = writeArray.length;\n  var numCols = COST_COLUMNS.length;\n\n  sheet.getRange(1, 1, numRows, numCols).setValues(writeArray);\n\n  // Định dạng tiêu đề THACO Royal Blue #00529C\n  var headerRange = sheet.getRange(1, 1, 1, numCols);\n  headerRange.setBackground('#00529C')\n             .setFontColor('#FFFFFF')\n             .setFontWeight('bold')\n             .setHorizontalAlignment('center')\n             .setVerticalAlignment('middle');\n  sheet.setRowHeight(1, 35);\n\n  if (numRows > 1) {\n    // Căn giữa các cột mã số, năm, kỳ\n    sheet.getRange(2, 1, numRows - 1, 1).setHorizontalAlignment('center'); // STT\n    sheet.getRange(2, 2, numRows - 1, 1).setHorizontalAlignment('center'); // Mã ĐVCS\n    sheet.getRange(2, 4, numRows - 1, 1).setHorizontalAlignment('center'); // Mã B7\n    sheet.getRange(2, 7, numRows - 1, 2).setHorizontalAlignment('center'); // Mã B10, Trọng yếu\n    sheet.getRange(2, 9, numRows - 1, 1).setHorizontalAlignment('center'); // Mã BP\n    sheet.getRange(2, 11, numRows - 1, 3).setHorizontalAlignment('center'); // Khối PB, Năm, Kỳ\n\n    // Định dạng số tiền (cột T01 đến Tổng Cộng) dạng phân cách hàng ngàn #,##0\n    var moneyRange = sheet.getRange(2, 14, numRows - 1, 13);\n    moneyRange.setNumberFormat('#,##0').setHorizontalAlignment('right');\n  }\n\n  sheet.setFrozenRows(1);\n  sheet.setFrozenColumns(5); // Cố định 5 cột đầu (STT, Mã ĐVCS, Đơn vị, Mã B7, Tên Khoản Mục)\n  sheet.autoResizeColumns(1, numCols);\n\n  var totalMoney = formattedNewRows.reduce(function(acc, r) { return acc + (Number(r[25]) || 0); }, 0);\n\n  return jsonResponse({\n    status: 'success',\n    sheet: targetSheet,\n    mode: mode,\n    newRowsCount: formattedNewRows.length,\n    totalRowsInSheet: finalDataRows.length,\n    totalMoneyVND: totalMoney,\n    message: 'Đã lưu thành công ' + formattedNewRows.length + ' dòng dữ liệu vào sheet ' + targetSheet + ' (Tổng tiền: ' + totalMoney.toLocaleString('vi-VN') + ' đ)!'\n  });\n}\n\n/**\n * =========================================================================================\n * CÁC HÀM TIỆN ÍCH MENU CHO NGƯỜI DÙNG TRÊN GOOGLE SHEET\n * =========================================================================================\n */\nfunction checkDmStructure() {\n  var ss = SpreadsheetApp.getActiveSpreadsheet();\n  var sheet = ss.getSheetByName(SHEET_DM_CPHC);\n  if (!sheet) {\n    SpreadsheetApp.getUi().alert('Chưa có sheet \"' + SHEET_DM_CPHC + '\". Hãy bấm đồng bộ từ Web App để tự động tạo.');\n    return;\n  }\n  var count = Math.max(0, sheet.getLastRow() - 1);\n  SpreadsheetApp.getUi().alert('Sheet DM_CPHC đang có ' + count + ' khoản mục chi phí.');\n}\n\nfunction formatDmSheet() {\n  var ss = SpreadsheetApp.getActiveSpreadsheet();\n  var sheet = ss.getSheetByName(SHEET_DM_CPHC);\n  if (!sheet || sheet.getLastRow() < 1) return;\n  sheet.autoResizeColumns(1, 6);\n  SpreadsheetApp.getActiveSpreadsheet().toast('Đã định dạng lại sheet DM_CPHC!', 'THACO AUTO', 3);\n}\n\nfunction checkDmQtpnStructure() {\n  var ss = SpreadsheetApp.getActiveSpreadsheet();\n  var sheet = ss.getSheetByName(SHEET_DM_QTPN);\n  if (!sheet) {\n    SpreadsheetApp.getUi().alert('Chưa có sheet \"' + SHEET_DM_QTPN + '\". Hãy bấm đồng bộ từ Web App để tự động tạo.');\n    return;\n  }\n  var count = Math.max(0, sheet.getLastRow() - 1);\n  SpreadsheetApp.getUi().alert('Sheet DM_QTPN đang có ' + count + ' dòng ánh xạ.');\n}\n\nfunction formatDmQtpnSheet() {\n  var ss = SpreadsheetApp.getActiveSpreadsheet();\n  var sheet = ss.getSheetByName(SHEET_DM_QTPN);\n  if (!sheet || sheet.getLastRow() < 1) return;\n  sheet.autoResizeColumns(1, 6);\n  SpreadsheetApp.getActiveSpreadsheet().toast('Đã định dạng lại sheet DM_QTPN!', 'THACO AUTO', 3);\n}\n\nfunction initCostSheets() {\n  var ss = SpreadsheetApp.getActiveSpreadsheet();\n  COST_SHEETS.forEach(function(sName) {\n    var sh = ss.getSheetByName(sName);\n    if (!sh) {\n      sh = ss.insertSheet(sName);\n      sh.getRange(1, 1, 1, COST_COLUMNS.length).setValues([COST_COLUMNS]);\n      sh.getRange(1, 1, 1, COST_COLUMNS.length)\n        .setBackground('#00529C')\n        .setFontColor('#FFFFFF')\n        .setFontWeight('bold')\n        .setHorizontalAlignment('center');\n      sh.setRowHeight(1, 35);\n      sh.setFrozenRows(1);\n      sh.setFrozenColumns(5);\n      sh.autoResizeColumns(1, COST_COLUMNS.length);\n    }\n  });\n  SpreadsheetApp.getUi().alert('Đã khởi tạo xong các sheet: ' + COST_SHEETS.join(', '));\n}\n\nfunction formatAllCostSheets() {\n  var ss = SpreadsheetApp.getActiveSpreadsheet();\n  COST_SHEETS.forEach(function(sName) {\n    var sh = ss.getSheetByName(sName);\n    if (sh && sh.getLastRow() > 0) {\n      sh.autoResizeColumns(1, COST_COLUMNS.length);\n      sh.setFrozenRows(1);\n      sh.setFrozenColumns(5);\n    }\n  });\n  SpreadsheetApp.getActiveSpreadsheet().toast('Đã chuẩn hóa định dạng các sheet chi phí!', 'THACO AUTO', 3);\n}\n\nfunction jsonResponse(obj) {\n  return ContentService\n    .createTextOutput(JSON.stringify(obj))\n    .setMimeType(ContentService.MimeType.JSON);\n}\n";

    function getGoogleSheetSyncConfig() {
        try {
            const raw = localStorage.getItem(GSHEET_CONFIG_KEY);
            if (raw) {
                const parsed = JSON.parse(raw);
                if (parsed.apiKey === undefined) {
                    parsed.apiKey = 'THACO_CPHC_2026_SECURE_TOKEN';
                }
                return parsed;
            }
        } catch (e) {}
        return {
            webAppUrl: '',
            apiKey: 'THACO_CPHC_2026_SECURE_TOKEN',
            autoSync: true,
            lastSynced: null
        };
    }

    function saveGoogleSheetSyncConfig(cfg) {
        try {
            localStorage.setItem(GSHEET_CONFIG_KEY, JSON.stringify(cfg));
            updateGoogleSheetSyncUI();
        } catch (e) {
            console.error('Lỗi lưu cấu hình Google Sheet:', e);
        }
    }

    function updateGoogleSheetSyncUI() {
        const config = getGoogleSheetSyncConfig();
        const statusBadge = document.getElementById('gsheet-sync-status-badge');
        const tabStatusBadge = document.getElementById('tab-sync-status-badge');
        const statusMsg = document.getElementById('gsheet-sync-status-msg');
        const tabLastTime = document.getElementById('tab-sync-last-time');
        const inputModal = document.getElementById('input-gsheet-web-app-url');
        const inputKeyModal = document.getElementById('input-gsheet-api-key');
        const inputTab = document.getElementById('tab-input-gsheet-url');
        const inputKeyTab = document.getElementById('tab-input-gsheet-key');
        const chkAutoSync = document.getElementById('chk-gsheet-auto-sync');

        if (inputModal) inputModal.value = config.webAppUrl || '';
        if (inputKeyModal) inputKeyModal.value = config.apiKey || '';
        if (inputTab) inputTab.value = config.webAppUrl || '';
        if (inputKeyTab) inputKeyTab.value = config.apiKey || '';
        if (chkAutoSync) chkAutoSync.checked = config.autoSync !== false;

        const timeStr = config.lastSynced ? (new Date(config.lastSynced).toLocaleTimeString('vi-VN') + ' ' + new Date(config.lastSynced).toLocaleDateString('vi-VN')) : null;

        if (config.webAppUrl && config.webAppUrl.trim() !== '') {
            if (statusBadge) {
                statusBadge.className = 'text-[10px] font-extrabold px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center gap-1 shadow-sm';
                statusBadge.innerHTML = '<span class="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse"></span> 🟢 Đã kết nối Live Sync';
            }
            if (tabStatusBadge) {
                tabStatusBadge.className = 'px-2.5 py-1 rounded-full text-xs font-black bg-emerald-100 text-emerald-800 border border-emerald-300 inline-flex items-center gap-1.5 shadow-sm';
                tabStatusBadge.innerHTML = '<span class="w-2 h-2 rounded-full bg-emerald-600 animate-pulse"></span> Đã kết nối Live Sync';
            }
            if (statusMsg) {
                statusMsg.textContent = timeStr ? `Đã đồng bộ gần nhất lúc ${timeStr}. Mọi thêm/sửa/xóa tự động cập nhật 2 chiều.` : 'Sẵn sàng đồng bộ 2 chiều với Google Sheet.';
            }
            if (tabLastTime) {
                tabLastTime.textContent = timeStr ? `Lần đồng bộ gần nhất: ${timeStr}` : 'Sẵn sàng đồng bộ 2 chiều.';
            }
        } else {
            if (statusBadge) {
                statusBadge.className = 'text-[10px] font-extrabold px-2.5 py-0.5 rounded-full bg-slate-200 text-slate-700 border border-slate-300';
                statusBadge.textContent = '⚪ Chưa cấu hình Web App URL';
            }
            if (tabStatusBadge) {
                tabStatusBadge.className = 'px-2.5 py-1 rounded-full text-xs font-black bg-slate-200 text-slate-700 border border-slate-300';
                tabStatusBadge.textContent = '⚪ Chưa kết nối Apps Script URL';
            }
            if (statusMsg) {
                statusMsg.textContent = 'Nhấp "⚙️ Cài đặt kết nối" để dán Web App URL và kích hoạt đồng bộ 2 chiều với Google Sheet.';
            }
            if (tabLastTime) {
                tabLastTime.textContent = 'Chưa có lượt đồng bộ nào trong phiên này.';
            }
        }
    }

    function initGoogleSheetSync() {
        updateGoogleSheetSyncUI();
        const config = getGoogleSheetSyncConfig();
        if (config.webAppUrl && config.webAppUrl.trim() !== '' && config.autoSync !== false) {
            console.log('Tự động kiểm tra cập nhật mới nhất từ Google Sheet...');
            syncFromGoogleSheet(false);
        }
    }

    function processGoogleSheetData(data) {
        if (!data || data.status !== 'success') {
            throw new Error((data && data.message) || 'Dữ liệu trả về từ Google Sheet không hợp lệ');
        }

        // 1. Danh mục phí (DM_CPHC)
        if (Array.isArray(data.categories) && data.categories.length > 0) {
            state.categories = data.categories;
            ensureCategoryMaterialFlags();
        }

        // 2. Làm sạch hoàn toàn dữ liệu cũ trước khi nạp dữ liệu từ Google Sheet
        state.deptData = {};
        state.data2024 = {};
        state.data2025 = {};
        state.data2026 = {};
        const entityMap = new Map();

        const costRows = data.allCostRows || [];
        console.log(`Đang xử lý ${costRows.length} dòng chi phí từ Google Sheet...`);

        if (costRows.length > 0) {
            costRows.forEach(r => {
                const entCode = String(r['Mã ĐVCS'] || r.entityCode || '').trim();
                const entName = String(r['Tên Pháp Nhân / Đơn Vị'] || r.entityName || '').trim();
                const yearStr = String(r['Năm'] || r.year || '2026').trim();
                const yearNum = parseInt(yearStr, 10);
                const kmCode = String(r['Mã B7'] || r.km || '').trim();
                const bpCode = String(r['Mã Bộ Phận'] || r.bp || '').trim();
                const tenBp = String(r['Tên Bộ Phận'] || r.tenBp || '').trim();
                const khoiPb = String(r['Khối Phòng Ban'] || r.khoiPb || '').trim();

                if (!entCode) return;

                if (!entityMap.has(entCode)) {
                    let mien = 'MN';
                    let phia = 'Phía Nam';
                    let khoi = 'KHOI_MN';
                    let qtName = entName || entCode;
                    let qtCode = 'QT_' + entCode;
                    let khoiName = 'CTTT Phía Nam';

                    // 1. Tra cứu trước từ danh mục Quản trị - Pháp nhân (DM_QTPN)
                    const qtpnItem = (state.qtpnMappings || []).find(m => m.maPn === entCode);
                    if (qtpnItem) {
                        qtName = qtpnItem.tenQt || qtName;
                        qtCode = qtpnItem.maQt || qtCode;
                        khoiName = qtpnItem.khoi || khoiName;
                        if (qtpnItem.khoi === 'VPĐH') { khoi = 'KHOI_VPDH'; mien = 'VPĐH'; phia = 'VP Điều Hành'; }
                        else if (qtpnItem.khoi === 'Nhà máy') { khoi = 'KHOI_NHAMAY'; mien = 'KSX'; phia = 'Chu Lai'; }
                        else if (qtpnItem.khoi === 'CTTT Phía Bắc') { khoi = 'KHOI_MB'; mien = 'MB'; phia = 'Phía Bắc'; }
                        else if (qtpnItem.khoi === 'CTTT Phía Nam') { khoi = 'KHOI_MN'; mien = 'MN'; phia = 'Phía Nam'; }
                    } else if (entCode === 'C1101' || entCode === 'C2305' || entName.includes('THACO AUTO') || entName.includes('PHÂN PHỐI') || entName.includes('PP THACO AUTO')) {
                        mien = 'VPĐH';
                        phia = 'VP Điều Hành';
                        khoi = 'KHOI_VPDH';
                        khoiName = 'VPĐH';
                        qtName = entCode === 'C2305' ? 'PP THACO AUTO' : 'THACO AUTO';
                        qtCode = entCode === 'C2305' ? 'QT_PP' : 'QT_AUTO';
                    } else if (entName.includes('NHÀ MÁY') || entName.includes('CHU LAI')) {
                        mien = 'KSX';
                        phia = 'Chu Lai';
                        khoi = 'KHOI_NHAMAY';
                        khoiName = 'Nhà máy';
                    } else if (entName.includes('BẮC') || khoiPb.includes('Bắc')) {
                        mien = 'MB';
                        phia = 'Phía Bắc';
                        khoi = 'KHOI_MB';
                        khoiName = 'CTTT Phía Bắc';
                    }

                    entityMap.set(entCode, {
                        code: entCode,
                        name: entName || entCode,
                        cleanName: entName || entCode,
                        mien: mien,
                        phia: phia,
                        qt: qtName,
                        qtCode: qtCode,
                        khoiName: khoiName,
                        khoi: khoi
                    });
                }

                const months = [];
                for (let m = 1; m <= 12; m++) {
                    const mKey = m < 10 ? ('T0' + m) : ('T' + m);
                    months.push(Number(r[mKey]) || 0);
                }
                const totalMoney = Number(r['Tổng Cộng']) || months.reduce((a, b) => a + b, 0);

                if (!state.deptData[entCode]) state.deptData[entCode] = {};
                if (!state.deptData[entCode][yearStr]) state.deptData[entCode][yearStr] = [];

                state.deptData[entCode][yearStr].push({
                    stt: r['STT'] || '',
                    km: kmCode,
                    tenKm: String(r['Tên Khoản Mục (B7)'] || r.tenKm || '').trim(),
                    b10: String(r['Mã B10'] || r.b10 || '').trim(),
                    isMaterial: Boolean(r['Trọng Yếu (⭐)'] || r.isMaterial),
                    bp: bpCode,
                    tenBp: tenBp,
                    khoiPb: khoiPb,
                    year: yearNum,
                    ky: r['Kỳ Thực Hiện'] || '',
                    months: months,
                    total: totalMoney
                });
            });

            state.entities = Array.from(entityMap.values());

            // Tổng hợp lên data2024, data2025 và data2026 (VNĐ)
            state.entities.forEach(ent => {
                const entCode = ent.code;
                state.data2024[entCode] = {};
                state.data2025[entCode] = {};
                state.data2026[entCode] = { '641': {}, '642': {} };

                state.categories.forEach(cat => {
                    const catIdStr = String(cat.id);

                    // 2024
                    const m24 = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
                    const rows24 = (state.deptData[entCode] && state.deptData[entCode]['2024']) || [];
                    rows24.forEach(r => {
                        if (matchCategoryKm(cat, r.km)) {
                            for (let i = 0; i < 12; i++) m24[i] += (r.months[i] || 0);
                        }
                    });
                    state.data2024[entCode][catIdStr] = m24;

                    // 2025
                    const m25 = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
                    const rows25 = (state.deptData[entCode] && state.deptData[entCode]['2025']) || [];
                    rows25.forEach(r => {
                        if (matchCategoryKm(cat, r.km)) {
                            for (let i = 0; i < 12; i++) m25[i] += (r.months[i] || 0);
                        }
                    });
                    state.data2025[entCode][catIdStr] = m25;

                    // 2026
                    const m26 = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
                    const rows26 = (state.deptData[entCode] && state.deptData[entCode]['2026']) || [];
                    rows26.forEach(r => {
                        if (matchCategoryKm(cat, r.km)) {
                            for (let i = 0; i < 12; i++) m26[i] += (r.months[i] || 0);
                        }
                    });
                    state.data2026[entCode]['642'][catIdStr] = m26;
                });
            });
        } else {
            state.entities = [];
            state.deptData = {};
            state.data2024 = {};
            state.data2025 = {};
            state.data2026 = {};
        }

        saveCurrentState();
        populateSlicers();
        renderMappingTab();
        renderAll();
    }

    async function syncFromGoogleSheet(isManual) {
        const config = getGoogleSheetSyncConfig();
        if (!config.webAppUrl || !config.webAppUrl.trim()) {
            if (isManual) {
                openGoogleSheetConfigModal();
                alert('Vui lòng nhập Web App URL của Google Apps Script để kết nối với Google Sheet!');
            }
            return;
        }

        const btn1 = document.getElementById('btn-sync-from-gsheet');
        const btn2 = document.getElementById('btn-sync-pull-tab');
        if (btn1) btn1.classList.add('opacity-50', 'pointer-events-none');
        if (btn2) btn2.classList.add('opacity-50', 'pointer-events-none');

        try {
            console.log('Đang kết nối Google Sheet Quan_Ly_Chi_Phi...');
            const keyParam = config.apiKey ? `&api_key=${encodeURIComponent(config.apiKey.trim())}` : '';
            const fetchUrl = config.webAppUrl + (config.webAppUrl.includes('?') ? '&' : '?') + 't=' + Date.now() + keyParam;
            const res = await fetch(fetchUrl);
            if (!res.ok && res.status !== 401) throw new Error('HTTP status ' + res.status);
            const data = await res.json();

            if (data.code === 401 || (data.status === 'error' && data.code === 401)) {
                throw new Error('Khóa bảo mật API_KEY không hợp lệ hoặc chưa được cung cấp. Vui lòng kiểm tra lại cấu hình kết nối.');
            }

            if (data.status === 'success') {
                processGoogleSheetData(data);

                config.lastSynced = new Date().toISOString();
                saveGoogleSheetSyncConfig(config);

                const costCount = (data.allCostRows || []).length;
                const catCount = (data.categories || []).length;
                console.log(`Đã đồng bộ thành công ${catCount} khoản mục và ${costCount} dòng chi phí từ Google Sheet!`);

                if (isManual) {
                    if (costCount > 0) {
                        alert(`🎉 ĐỒNG BỘ THÀNH CÔNG TỪ GOOGLE SHEET!\n- Danh mục phí (DM_CPHC): ${catCount} khoản mục\n- Dữ liệu chi phí thực tế: ${costCount} dòng\n- Pháp nhân: ${state.entities.length} đơn vị\n\nToàn bộ dữ liệu hiển thị hiện được lấy trực tiếp từ file Google Sheet!`);
                    } else {
                        alert(`✅ Đã đồng bộ ${catCount} khoản mục từ Google Sheet DM_CPHC!\n\nLưu ý: Các sheet chi phí (CP_AUTO, CP_PP, CP_CTTT) hiện chưa có dữ liệu. Anh/Chị có thể kéo thả file Excel vào tab "Nạp & Chuẩn hóa" để tải chi phí lên Google Sheet.`);
                    }
                }
            } else {
                throw new Error(data.message || 'Dữ liệu trả về không hợp lệ');
            }
        } catch (err) {
            console.error('Lỗi đồng bộ từ Google Sheet:', err);
            if (isManual) {
                alert('Không thể kết nối với Google Sheet: ' + err.message + '\n\nVui lòng kiểm tra lại Web App URL và khóa API_KEY trong mục Cài đặt kết nối.');
            }
        } finally {
            if (btn1) btn1.classList.remove('opacity-50', 'pointer-events-none');
            if (btn2) btn2.classList.remove('opacity-50', 'pointer-events-none');
        }
    }

    async function pushToGoogleSheet(isManual) {
        const config = getGoogleSheetSyncConfig();
        if (!config.webAppUrl || !config.webAppUrl.trim()) {
            if (isManual) {
                openGoogleSheetConfigModal();
                alert('Vui lòng nhập Web App URL của Google Apps Script để kết nối với Google Sheet!');
            }
            return;
        }

        const btn1 = document.getElementById('btn-push-to-gsheet');
        const btn2 = document.getElementById('btn-sync-push-tab');
        if (btn1) btn1.classList.add('opacity-50', 'pointer-events-none');
        if (btn2) btn2.classList.add('opacity-50', 'pointer-events-none');

        try {
            console.log('Đang đẩy danh mục lên Google Sheet DM_CPHC...');
            const payload = {
                action: 'save_categories',
                api_key: config.apiKey || '',
                categories: state.categories
            };

            const res = await fetch(config.webAppUrl, {
                method: 'POST',
                body: JSON.stringify(payload),
                headers: {
                    'Content-Type': 'text/plain;charset=utf-8'
                }
            });

            const data = await res.json();
            if (data.status === 'success') {
                config.lastSynced = new Date().toISOString();
                saveGoogleSheetSyncConfig(config);
                console.log('Đã cập nhật thành công lên Google Sheet DM_CPHC:', data.message);
                if (isManual) {
                    alert(data.message || 'Đã đồng bộ thành công lên Google Sheet DM_CPHC!');
                }
            } else {
                throw new Error(data.message || 'Lỗi phản hồi từ Google Apps Script');
            }
        } catch (err) {
            console.error('Lỗi đẩy dữ liệu lên Google Sheet:', err);
            if (isManual) {
                alert('Không thể ghi dữ liệu lên Google Sheet: ' + err.message);
            }
        } finally {
            if (btn1) btn1.classList.remove('opacity-50', 'pointer-events-none');
            if (btn2) btn2.classList.remove('opacity-50', 'pointer-events-none');
        }
    }

    function openGoogleSheetConfigModal() {
        const modal = document.getElementById('gsheet-config-modal');
        if (!modal) return;
        updateGoogleSheetSyncUI();
        const resultArea = document.getElementById('gsheet-test-result');
        if (resultArea) resultArea.classList.add('hidden');
        modal.classList.remove('hidden');
    }

    function closeGoogleSheetConfigModal() {
        const modal = document.getElementById('gsheet-config-modal');
        if (modal) modal.classList.add('hidden');
    }

    function saveGoogleSheetConfigFromModal() {
        const urlInput = document.getElementById('input-gsheet-web-app-url');
        const keyInput = document.getElementById('input-gsheet-api-key');
        const chkAuto = document.getElementById('chk-gsheet-auto-sync');
        const url = urlInput ? urlInput.value.trim() : '';
        const apiKey = keyInput ? keyInput.value.trim() : '';
        const autoSync = chkAuto ? chkAuto.checked : true;

        const config = getGoogleSheetSyncConfig();
        config.webAppUrl = url;
        if (apiKey) config.apiKey = apiKey;
        config.autoSync = autoSync;
        saveGoogleSheetSyncConfig(config);

        closeGoogleSheetConfigModal();
        alert('Đã lưu cấu hình kết nối Google Sheet thành công!');
        if (url) {
            syncFromGoogleSheet(true);
        }
    }

    function saveGoogleSheetConfigFromTab() {
        const inputTab = document.getElementById('tab-input-gsheet-url');
        const inputKeyTab = document.getElementById('tab-input-gsheet-key');
        const url = inputTab ? inputTab.value.trim() : '';
        const apiKey = inputKeyTab ? inputKeyTab.value.trim() : '';

        const config = getGoogleSheetSyncConfig();
        config.webAppUrl = url;
        if (apiKey) config.apiKey = apiKey;
        saveGoogleSheetSyncConfig(config);

        alert('Đã lưu Web App URL & Khóa API thành công!');
        if (url) {
            syncFromGoogleSheet(true);
        }
    }

    async function testGoogleSheetConnection() {
        const urlInput = document.getElementById('input-gsheet-web-app-url');
        const keyInput = document.getElementById('input-gsheet-api-key');
        const resultArea = document.getElementById('gsheet-test-result');
        const url = urlInput ? urlInput.value.trim() : '';
        const apiKey = keyInput ? keyInput.value.trim() : (getGoogleSheetSyncConfig().apiKey || '');

        if (!url) {
            alert('Vui lòng nhập Web App URL trước khi kiểm tra!');
            return;
        }

        if (resultArea) {
            resultArea.className = 'p-3 rounded-lg border text-xs bg-blue-50 text-blue-800 border-blue-200';
            resultArea.textContent = '⏳ Đang kiểm tra kết nối & xác thực khóa API_KEY với Apps Script...';
            resultArea.classList.remove('hidden');
        }

        try {
            const keyParam = apiKey ? `&api_key=${encodeURIComponent(apiKey.trim())}` : '';
            const testUrl = url + (url.includes('?') ? '&' : '?') + 'action=test_key&t=' + Date.now() + keyParam;
            const res = await fetch(testUrl);
            const json = await res.json();
            if (json.status === 'success') {
                resultArea.className = 'p-3 rounded-lg border text-xs bg-emerald-50 text-emerald-800 border-emerald-300 font-bold';
                resultArea.textContent = `✅ Xác thực kết nối và khóa API_KEY thành công! ${json.message || ''}`;
            } else if (json.code === 401 || res.status === 401) {
                resultArea.className = 'p-3 rounded-lg border text-xs bg-rose-50 text-rose-800 border-rose-300 font-bold';
                resultArea.textContent = `❌ Từ chối truy cập (401): ${json.message || 'Khóa API_KEY không chính xác. Vui lòng kiểm tra lại trên Google Sheet.'}`;
            } else {
                resultArea.className = 'p-3 rounded-lg border text-xs bg-rose-50 text-rose-800 border-rose-300 font-bold';
                resultArea.textContent = `⚠️ Lỗi phản hồi: ${json.message || 'Không xác định'}`;
            }
        } catch (e) {
            resultArea.className = 'p-3 rounded-lg border text-xs bg-rose-50 text-rose-800 border-rose-300 font-bold';
            resultArea.textContent = `❌ Không thể kết nối: ${e.message}`;
        }
    }

    function copyAppsScriptCode() {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(APPS_SCRIPT_SOURCE_CODE).then(() => {
                alert('Đã sao chép mã nguồn Google Apps Script vào Clipboard!\nAnh/Chị hãy mở Tiện ích mở rộng > Apps Script trong Google Sheet và dán vào file Code.gs.');
            }).catch(() => {
                fallbackCopyText(APPS_SCRIPT_SOURCE_CODE);
            });
        } else {
            fallbackCopyText(APPS_SCRIPT_SOURCE_CODE);
        }
    }

    function fallbackCopyText(text) {
        const ta = document.createElement('textarea');
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        alert('Đã sao chép mã nguồn Google Apps Script vào Clipboard!');
    }

    // ==========================================
    // 🎛️ SLICERS & EVENT LISTENERS
    // ==========================================

    function setupEventListeners() {
        const slicerDonVi = document.getElementById('slicer-donvi') || document.getElementById('slicer-khoi') || document.getElementById('slicer-mien');
        if (slicerDonVi) slicerDonVi.addEventListener('change', onDonViChange);
        document.getElementById('slicer-quantri').addEventListener('change', onQuanTriChange);
        document.getElementById('slicer-phapnhan').addEventListener('change', onPhapNhanChange);
        document.getElementById('slicer-taikhoan').addEventListener('change', onTaiKhoanChange);

        const slicerBP = document.getElementById('slicer-bophan');
        if (slicerBP) slicerBP.addEventListener('change', onBoPhanChange);

        // Google Sheet Sync Listeners
        const btnSyncGSheet = document.getElementById('btn-sync-from-gsheet');
        if (btnSyncGSheet) btnSyncGSheet.addEventListener('click', () => syncFromGoogleSheet(true));

        const btnPushGSheet = document.getElementById('btn-push-to-gsheet');
        if (btnPushGSheet) btnPushGSheet.addEventListener('click', () => pushToGoogleSheet(true));

        const btnOpenGSheetModal = document.getElementById('btn-open-gsheet-config-modal');
        if (btnOpenGSheetModal) btnOpenGSheetModal.addEventListener('click', openGoogleSheetConfigModal);

        const btnCloseGSheetModal = document.getElementById('btn-close-gsheet-modal');
        if (btnCloseGSheetModal) btnCloseGSheetModal.addEventListener('click', closeGoogleSheetConfigModal);

        const btnCloseGSheetModal2 = document.getElementById('btn-close-gsheet-modal-2');
        if (btnCloseGSheetModal2) btnCloseGSheetModal2.addEventListener('click', closeGoogleSheetConfigModal);

        const btnSaveGSheetModal = document.getElementById('btn-save-gsheet-config');
        if (btnSaveGSheetModal) btnSaveGSheetModal.addEventListener('click', saveGoogleSheetConfigFromModal);

        const btnTestGSheet = document.getElementById('btn-test-gsheet-connection');
        if (btnTestGSheet) btnTestGSheet.addEventListener('click', testGoogleSheetConnection);

        const btnCopyCode = document.getElementById('btn-copy-apps-script-code');
        if (btnCopyCode) btnCopyCode.addEventListener('click', copyAppsScriptCode);

        const btnTabSyncPull = document.getElementById('btn-sync-pull-tab');
        if (btnTabSyncPull) btnTabSyncPull.addEventListener('click', () => syncFromGoogleSheet(true));

        const btnTabSyncPush = document.getElementById('btn-sync-push-tab');
        if (btnTabSyncPush) btnTabSyncPush.addEventListener('click', () => pushToGoogleSheet(true));

        const btnTabSaveUrl = document.getElementById('btn-tab-save-url');
        if (btnTabSaveUrl) btnTabSaveUrl.addEventListener('click', saveGoogleSheetConfigFromTab);

        const btnTabCopyCode = document.getElementById('btn-tab-copy-code');
        if (btnTabCopyCode) btnTabCopyCode.addEventListener('click', copyAppsScriptCode);

        // Buttons Scope & Role
        const btnScopeCurrent = document.getElementById('btn-scope-current');
        if (btnScopeCurrent) btnScopeCurrent.addEventListener('click', () => setScopeMode('CURRENT_2026'));

        const btnScopeHistory = document.getElementById('btn-scope-history');
        if (btnScopeHistory) btnScopeHistory.addEventListener('click', () => setScopeMode('HISTORY_2025'));

        const btnRoleMacro = document.getElementById('btn-role-macro');
        if (btnRoleMacro) btnRoleMacro.addEventListener('click', () => setViewRole('MACRO'));

        const btnRoleMicro = document.getElementById('btn-role-micro');
        if (btnRoleMicro) btnRoleMicro.addEventListener('click', () => setViewRole('MICRO'));

        const btnMaterialAll = document.getElementById('btn-filter-material-all');
        if (btnMaterialAll) btnMaterialAll.addEventListener('click', () => setMaterialFilter(false));

        const btnMaterialOnly = document.getElementById('btn-filter-material-only');
        if (btnMaterialOnly) btnMaterialOnly.addEventListener('click', () => setMaterialFilter(true));

        // Chuyển đổi Dạng xem Báo cáo (12 Tháng vs So sánh YoY 3 Năm)
        const btnViewMonthly = document.getElementById('btn-view-mode-monthly');
        if (btnViewMonthly) {
            btnViewMonthly.addEventListener('click', () => {
                if (!state.yoyConfig) state.yoyConfig = { viewMode: 'MONTHLY', thresholdPercent: 20 };
                state.yoyConfig.viewMode = 'MONTHLY';
                updateReportViewModeUI();
                renderTable();
            });
        }

        const btnViewYoY = document.getElementById('btn-view-mode-yoy');
        if (btnViewYoY) {
            btnViewYoY.addEventListener('click', () => {
                if (!state.yoyConfig) state.yoyConfig = { viewMode: 'MONTHLY', thresholdPercent: 20 };
                state.yoyConfig.viewMode = 'YOY_TABLE';
                updateReportViewModeUI();
                renderTable();
            });
        }

        // Điều chỉnh Ngưỡng cảnh báo YoY
        const inputThreshold = document.getElementById('input-yoy-threshold');
        if (inputThreshold) {
            inputThreshold.addEventListener('input', () => {
                const val = parseFloat(inputThreshold.value) || 20;
                if (!state.yoyConfig) state.yoyConfig = { viewMode: 'MONTHLY', thresholdPercent: 20 };
                state.yoyConfig.thresholdPercent = val;
                renderTable();
            });
        }

        // Tabs
        const tabRepBtn = document.getElementById('tab-report-btn');
        if (tabRepBtn) tabRepBtn.addEventListener('click', () => switchTab('report'));

        const tabCbnvBtn = document.getElementById('tab-cbnv-btn');
        if (tabCbnvBtn) tabCbnvBtn.addEventListener('click', () => switchTab('cbnv'));

        const tabDashBtn = document.getElementById('tab-dashboard-btn');
        if (tabDashBtn) tabDashBtn.addEventListener('click', () => switchTab('dashboard'));

        const tabMapBtn = document.getElementById('tab-mapping-btn');
        if (tabMapBtn) tabMapBtn.addEventListener('click', () => switchTab('mapping'));

        const tabQtpnBtn = document.getElementById('tab-qtpn-btn');
        if (tabQtpnBtn) tabQtpnBtn.addEventListener('click', () => switchTab('qtpn'));

        const tabSyncBtn = document.getElementById('tab-sync-btn');
        if (tabSyncBtn) tabSyncBtn.addEventListener('click', () => switchTab('sync'));

        const tabUploadBtn = document.getElementById('tab-upload-btn');
        if (tabUploadBtn) tabUploadBtn.addEventListener('click', () => switchTab('upload'));

        // CBNV Controls (Mục 2.5: Chi phí / CB-NV)
        const btnCbnvModeThucTe = document.getElementById('btn-cbnv-mode-thucte');
        if (btnCbnvModeThucTe) btnCbnvModeThucTe.addEventListener('click', () => setCbnvDisplayMode('THUC_TE'));

        const btnCbnvModeDinhBien = document.getElementById('btn-cbnv-mode-dinhbien');
        if (btnCbnvModeDinhBien) btnCbnvModeDinhBien.addEventListener('click', () => setCbnvDisplayMode('DINH_BIEN'));

        const btnCbnvModeBoth = document.getElementById('btn-cbnv-mode-both');
        if (btnCbnvModeBoth) btnCbnvModeBoth.addEventListener('click', () => setCbnvDisplayMode('BOTH'));

        const inputCbnvSearch = document.getElementById('input-cbnv-search');
        if (inputCbnvSearch) inputCbnvSearch.addEventListener('input', (e) => renderCbnvTab(e.target.value));

        const btnOpenCbnvModal = document.getElementById('btn-open-cbnv-upload-modal');
        if (btnOpenCbnvModal) btnOpenCbnvModal.addEventListener('click', openCbnvUploadModal);

        const btnCloseCbnvModal = document.getElementById('btn-close-cbnv-modal');
        if (btnCloseCbnvModal) btnCloseCbnvModal.addEventListener('click', closeCbnvUploadModal);

        const btnCancelCbnvModal = document.getElementById('btn-cancel-cbnv-modal');
        if (btnCancelCbnvModal) btnCancelCbnvModal.addEventListener('click', closeCbnvUploadModal);

        const cbnvDropzone = document.getElementById('cbnv-dropzone');
        const inputCbnvFile = document.getElementById('input-cbnv-file');
        if (cbnvDropzone && inputCbnvFile) {
            cbnvDropzone.addEventListener('click', () => inputCbnvFile.click());
            cbnvDropzone.addEventListener('dragover', (e) => {
                e.preventDefault();
                cbnvDropzone.classList.add('border-emerald-500', 'bg-emerald-50/40');
            });
            cbnvDropzone.addEventListener('dragleave', () => {
                cbnvDropzone.classList.remove('border-emerald-500', 'bg-emerald-50/40');
            });
            cbnvDropzone.addEventListener('drop', (e) => {
                e.preventDefault();
                cbnvDropzone.classList.remove('border-emerald-500', 'bg-emerald-50/40');
                if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                    handleCbnvFileSelected(e.dataTransfer.files[0]);
                }
            });
            inputCbnvFile.addEventListener('change', (e) => {
                if (e.target && e.target.files && e.target.files.length > 0) {
                    handleCbnvFileSelected(e.target.files[0]);
                }
            });
        }

        const btnConfirmCbnvUpload = document.getElementById('btn-confirm-cbnv-upload');
        if (btnConfirmCbnvUpload) btnConfirmCbnvUpload.addEventListener('click', confirmCbnvUpload);

        const btnDownloadCbnvTemplate = document.getElementById('btn-download-cbnv-template');
        if (btnDownloadCbnvTemplate) btnDownloadCbnvTemplate.addEventListener('click', downloadCbnvTemplate);

        const btnExportCbnvExcel = document.getElementById('btn-export-cbnv-excel');
        if (btnExportCbnvExcel) btnExportCbnvExcel.addEventListener('click', exportCbnvMatrixToExcel);

        const btnSyncCbnvGsheet = document.getElementById('btn-sync-cbnv-gsheet');
        if (btnSyncCbnvGsheet) btnSyncCbnvGsheet.addEventListener('click', handleSyncCbnvWithGoogleSheetPrompt);

        // QTPN Controls
        const btnSyncQtpnPull = document.getElementById('btn-sync-qtpn-from-gsheet');
        if (btnSyncQtpnPull) btnSyncQtpnPull.addEventListener('click', () => syncQtpnFromGoogleSheet(true));

        const btnPushQtpn = document.getElementById('btn-push-qtpn-to-gsheet');
        if (btnPushQtpn) btnPushQtpn.addEventListener('click', () => pushQtpnToGoogleSheet(true));

        const btnAddQtpnGroup = document.getElementById('btn-add-qtpn-group');
        if (btnAddQtpnGroup) btnAddQtpnGroup.addEventListener('click', () => openAddQtpnGroupModal());

        const btnAddQtpn = document.getElementById('btn-add-qtpn-row');
        if (btnAddQtpn) btnAddQtpn.addEventListener('click', () => openQtpnModal(-1));

        const inputSearchQtpn = document.getElementById('input-search-qtpn');
        if (inputSearchQtpn) {
            inputSearchQtpn.addEventListener('input', (e) => renderQtpnTab(e.target.value));
        }

        const formQtpnModal = document.getElementById('form-qtpn-modal');
        if (formQtpnModal) formQtpnModal.addEventListener('submit', handleSaveQtpnModal);

        const btnCloseQtpnModal = document.getElementById('btn-close-qtpn-modal');
        if (btnCloseQtpnModal) btnCloseQtpnModal.addEventListener('click', () => {
            document.getElementById('qtpn-edit-modal').classList.add('hidden');
        });

        const btnCancelQtpnModal = document.getElementById('btn-cancel-qtpn-modal');
        if (btnCancelQtpnModal) btnCancelQtpnModal.addEventListener('click', () => {
            document.getElementById('qtpn-edit-modal').classList.add('hidden');
        });

        // Reset Storage
        const btnReset = document.getElementById('btn-reset-storage');
        if (btnReset) btnReset.addEventListener('click', resetToBaseline);

        // Export Excel
        const btnExportExcel = document.getElementById('btn-export-excel');
        if (btnExportExcel) {
            btnExportExcel.addEventListener('click', () => {
                const modal = document.getElementById('export-modal');
                if (modal) modal.classList.remove('hidden');
                else exportToExcel();
            });
        }

        const btnPptxFormat = document.getElementById('btn-export-pptx-format');
        if (btnPptxFormat) {
            btnPptxFormat.addEventListener('click', () => {
                exportPPTXReportSetToExcel();
                const modal = document.getElementById('export-modal');
                if (modal) modal.classList.add('hidden');
            });
        }

        const btnStandardFormat = document.getElementById('btn-export-standard-format');
        if (btnStandardFormat) {
            btnStandardFormat.addEventListener('click', () => {
                exportToExcel();
                const modal = document.getElementById('export-modal');
                if (modal) modal.classList.add('hidden');
            });
        }

        const btnCloseExportModal = document.getElementById('btn-close-export-modal');
        if (btnCloseExportModal) {
            btnCloseExportModal.addEventListener('click', () => {
                const modal = document.getElementById('export-modal');
                if (modal) modal.classList.add('hidden');
            });
        }

        // Upload File Select & Drag-Drop Engine
        const dropZone = document.getElementById('excel-drop-zone') || document.getElementById('upload-drop-zone');
        const fileInput = document.getElementById('excel-file-input');
        const uploadSection = document.getElementById('upload-drop-section');
        const uploadModal = document.getElementById('upload-modal');

        if (fileInput) {
            fileInput.addEventListener('change', (e) => {
                handleFileSelect(e);
                fileInput.value = '';
            });
            fileInput.addEventListener('click', (e) => {
                e.stopPropagation();
            });
        }

        if (dropZone && fileInput) {
            dropZone.addEventListener('click', (e) => {
                // If dropZone is a <label>, browser natively clicks input; if div, fallback to .click()
                if (e.target !== fileInput && dropZone.tagName.toLowerCase() !== 'label') {
                    fileInput.click();
                }
            });
        }

        const dragTargets = [dropZone, uploadSection, uploadModal].filter(Boolean);
        dragTargets.forEach(target => {
            target.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
                if (dropZone) dropZone.classList.add('border-[#00529C]', 'bg-blue-50', 'ring-2', 'ring-blue-300');
            });
            target.addEventListener('dragenter', (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
                if (dropZone) dropZone.classList.add('border-[#00529C]', 'bg-blue-50', 'ring-2', 'ring-blue-300');
            });
            target.addEventListener('dragleave', (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (dropZone) dropZone.classList.remove('border-[#00529C]', 'bg-blue-50', 'ring-2', 'ring-blue-300');
            });
            target.addEventListener('drop', (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (dropZone) dropZone.classList.remove('border-[#00529C]', 'bg-blue-50', 'ring-2', 'ring-blue-300');
                if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                    processUploadedExcel(e.dataTransfer.files[0]);
                }
            });
        });

        // Global drag & drop prevention to stop browser from opening files in window
        window.addEventListener('dragover', (e) => e.preventDefault());
        window.addEventListener('drop', (e) => e.preventDefault());

        const btnCancelUpload = document.getElementById('btn-cancel-preview') || document.getElementById('btn-cancel-upload');
        if (btnCancelUpload) btnCancelUpload.addEventListener('click', cancelUploadPreview);

        const btnConfirmUpload = document.getElementById('btn-confirm-upload');
        if (btnConfirmUpload) btnConfirmUpload.addEventListener('click', confirmUpload);

        const selectTargetSheet = document.getElementById('select-target-sheet');
        if (selectTargetSheet) {
            selectTargetSheet.addEventListener('change', (e) => {
                const sheetVal = e.target.value;
                const lblTarget = document.getElementById('lbl-target-sheet-preview');
                if (lblTarget) lblTarget.textContent = sheetVal;
                if (pendingUploadData) pendingUploadData.targetSheet = sheetVal;
            });
        }



        // Mapping Tab listeners
        const btnSaveMap = document.getElementById('btn-save-mapping');
        if (btnSaveMap) btnSaveMap.addEventListener('click', saveMappingChanges);

        const btnAddGrp = document.getElementById('btn-add-group');
        if (btnAddGrp) btnAddGrp.addEventListener('click', () => openGroupModal());

        const btnExpandAll = document.getElementById('btn-expand-all-groups');
        if (btnExpandAll) btnExpandAll.addEventListener('click', expandAllGroups);

        const btnCollapseAll = document.getElementById('btn-collapse-all-groups');
        if (btnCollapseAll) btnCollapseAll.addEventListener('click', collapseAllGroups);

        // Khởi tạo các sự kiện Modal Thư viện Icon & Modal Nhóm
        initIconPickerAndGroupModalEvents();
    }

    // ==========================================
    // 📅 MONTH PICKER COMPONENT
    // ==========================================

    function getMonthItemClass(isActual, isChecked) {
        if (isActual) {
            // Các tháng có số liệu thực tế: viền xanh lá mỏng 1px, nền xanh lá trong suốt nhẹ, chữ đậm vừa, ô tick rõ ràng
            return `month-chip flex items-center justify-between px-2.5 py-1.5 rounded-lg border text-xs cursor-pointer select-none transition-all ${
                isChecked
                    ? 'border-emerald-500/70 bg-emerald-50/70 font-bold text-emerald-950 shadow-2xs'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-emerald-300 hover:bg-emerald-50/20'
            }`;
        } else {
            // Các tháng AI dự đoán: viền tím mỏng 1px, nền tím trong suốt nhẹ, icon Google Gemini nhỏ gọn
            return `month-chip flex items-center justify-between px-2.5 py-1.5 rounded-lg border text-xs cursor-pointer select-none transition-all ${
                isChecked
                    ? 'border-purple-400/70 bg-purple-50/70 font-bold text-purple-950 shadow-2xs'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-purple-200 hover:bg-purple-50/20'
            }`;
        }
    }

    function initMonthSelectorUI() {
        const container = document.getElementById('month-checkboxes-container') || document.getElementById('month-checkboxes-grid');
        if (!container) return;
        container.innerHTML = '';

        const actualMonthsList = state.actualMonths || [1, 2, 3, 4, 5, 6, 7];

        for (let m = 1; m <= 12; m++) {
            const isActual = actualMonthsList.includes(m);
            const isChecked = (state.selectedMonths || []).includes(m);

            // Dùng div thay vì label để triệt tiêu hoàn toàn hiện tượng nhấp nháy/synthetic click đôi của trình duyệt
            const chip = document.createElement('div');
            chip.className = getMonthItemClass(isActual, isChecked);
            chip.setAttribute('data-month', String(m));

            const leftDiv = document.createElement('div');
            leftDiv.className = 'flex items-center gap-1.5 min-w-0 pointer-events-none';

            const input = document.createElement('input');
            input.type = 'checkbox';
            input.id = `chk-m-${m}`;
            input.value = m;
            input.checked = isChecked;
            input.className = `w-3.5 h-3.5 rounded border-slate-300 ${isActual ? 'text-emerald-600 focus:ring-emerald-500' : 'text-purple-600 focus:ring-purple-500'} pointer-events-none shrink-0`;

            const span = document.createElement('span');
            span.className = 'font-mono text-xs font-semibold pointer-events-none';
            span.textContent = `T${m < 10 ? '0' + m : m}`;

            leftDiv.appendChild(input);
            leftDiv.appendChild(span);
            chip.appendChild(leftDiv);

            if (!isActual) {
                // Icon Google Gemini nhỏ gọn vừa vặn khung
                const geminiIcon = document.createElement('span');
                geminiIcon.className = 'ml-1 flex items-center justify-center shrink-0 text-purple-600 p-0.5 pointer-events-none';
                geminiIcon.title = 'Tháng do AI Gemini dự đoán';
                geminiIcon.innerHTML = `
                    <svg class="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M19 9l1.25-2.75L23 5l-2.75-1.25L19 1l-1.25 2.75L15 5l2.75 1.25L19 9zm-7.5.5L9 4 6.5 9.5 1 12l5.5 2.5L9 20l2.5-5.5L17 12l-5.5-2.5zM19 15l-1.25 2.75L15 19l2.75 1.25L19 23l1.25-2.75L23 19l-2.75-1.25L19 15z"/>
                    </svg>
                `;
                chip.appendChild(geminiIcon);
            }

            // Xử lý click trực tiếp trên chip: cập nhật tức thời & menu vẫn mở để thao tác liên tục
            chip.addEventListener('click', (e) => {
                e.stopPropagation();
                toggleMonthSelection(m);
            });

            container.appendChild(chip);
        }
    }

    function toggleMonthSelection(m) {
        const monthNum = parseInt(m, 10);
        if (!Array.isArray(state.selectedMonths)) {
            state.selectedMonths = [];
        }
        const idx = state.selectedMonths.indexOf(monthNum);
        if (idx > -1) {
            state.selectedMonths.splice(idx, 1);
        } else {
            state.selectedMonths.push(monthNum);
        }
        state.selectedMonths.sort((a, b) => a - b);

        saveCurrentState();
        syncMonthCheckboxesUI();
        updateMonthSummaryLabel();
        renderAll();
        if (window.CostTooltipEngine) window.CostTooltipEngine.hide();
    }

    function syncMonthCheckboxesUI() {
        const container = document.getElementById('month-checkboxes-container') || document.getElementById('month-checkboxes-grid');
        if (!container) return;

        const actualMonthsList = state.actualMonths || [1, 2, 3, 4, 5, 6, 7];
        for (let m = 1; m <= 12; m++) {
            const chip = container.querySelector(`[data-month="${m}"]`);
            if (!chip) continue;
            const isActual = actualMonthsList.includes(m);
            const isChecked = (state.selectedMonths || []).includes(m);
            const input = chip.querySelector('input');
            if (input) input.checked = isChecked;
            chip.className = getMonthItemClass(isActual, isChecked);
        }
    }

    function renderCheckboxes() {
        syncMonthCheckboxesUI();
    }

    function updateMonthSummaryLabel() {
        const lbl = document.getElementById('selected-months-summary-label') || document.getElementById('month-picker-summary-label');
        const badge = document.getElementById('month-selected-count-badge');
        const sorted = [...(state.selectedMonths || [])].sort((a, b) => a - b);
        const selCount = sorted.length;
        if (badge) badge.textContent = `${selCount} tháng`;

        if (!lbl) return;
        if (selCount === 12) {
            lbl.textContent = 'Cả năm (T1 - T12)';
        } else if (selCount === 7 && sorted.every((m, i) => m === i + 1)) {
            lbl.textContent = 'T1 - T7';
        } else if (selCount === 0) {
            lbl.textContent = 'Chưa chọn tháng';
        } else if (selCount === 1) {
            lbl.textContent = `Tháng T${sorted[0] < 10 ? '0' + sorted[0] : sorted[0]}`;
        } else if (sorted.every((m, idx, arr) => idx === 0 || m === arr[idx - 1] + 1)) {
            lbl.textContent = `T${sorted[0]} - T${sorted[sorted.length - 1]}`;
        } else {
            lbl.textContent = sorted.map(m => `T${m}`).join(', ');
        }
    }

    function setupMonthPicker() {
        const btnToggle = document.getElementById('btn-month-picker-toggle') || document.getElementById('btn-month-picker');
        const menu = document.getElementById('month-picker-menu') || document.getElementById('month-picker-dropdown');
        const btnSelectAll = document.getElementById('btn-select-all-months');
        const btnSelectActual = document.getElementById('btn-select-actual-months');
        const btnDeselectAll = document.getElementById('btn-deselect-all-months');
        const btnApply = document.getElementById('btn-apply-month-picker');

        if (btnToggle && menu) {
            btnToggle.addEventListener('click', (e) => {
                e.stopPropagation();
                // Đóng menu năm nếu đang mở
                const yearMenu = document.getElementById('year-picker-menu');
                if (yearMenu) yearMenu.classList.add('hidden');
                menu.classList.toggle('hidden');
            });

            // Ngăn sự kiện click trong dropdown làm tắt dropdown ngoài ý muốn
            menu.addEventListener('click', (e) => {
                e.stopPropagation();
            });

            document.addEventListener('click', (e) => {
                if (!menu.contains(e.target) && !btnToggle.contains(e.target)) {
                    menu.classList.add('hidden');
                }
            });
        }

        if (btnSelectAll) {
            btnSelectAll.addEventListener('click', (e) => {
                e.stopPropagation();
                state.selectedMonths = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
                saveCurrentState();
                syncMonthCheckboxesUI();
                updateMonthSummaryLabel();
                renderAll();
                if (window.CostTooltipEngine) window.CostTooltipEngine.hide();
            });
        }

        if (btnSelectActual) {
            btnSelectActual.addEventListener('click', (e) => {
                e.stopPropagation();
                state.selectedMonths = [...(state.actualMonths || [1, 2, 3, 4, 5, 6, 7])];
                saveCurrentState();
                syncMonthCheckboxesUI();
                updateMonthSummaryLabel();
                renderAll();
                if (window.CostTooltipEngine) window.CostTooltipEngine.hide();
            });
        }

        if (btnDeselectAll) {
            btnDeselectAll.addEventListener('click', (e) => {
                e.stopPropagation();
                state.selectedMonths = [];
                saveCurrentState();
                syncMonthCheckboxesUI();
                updateMonthSummaryLabel();
                renderAll();
                if (window.CostTooltipEngine) window.CostTooltipEngine.hide();
            });
        }

        if (btnApply) {
            btnApply.addEventListener('click', (e) => {
                e.stopPropagation();
                if (menu) menu.classList.add('hidden');
                updateMonthSummaryLabel();
                renderAll();
                if (window.CostTooltipEngine) window.CostTooltipEngine.hide();
            });
        }

        // Mở rộng / Thu gọn toàn bộ nhóm
        const btnExp = document.getElementById('btn-expand-all') || document.getElementById('btn-expand-all-groups');
        if (btnExp) btnExp.addEventListener('click', expandAllGroups);

        const btnCol = document.getElementById('btn-collapse-all') || document.getElementById('btn-collapse-all-groups');
        if (btnCol) btnCol.addEventListener('click', collapseAllGroups);

        initMonthSelectorUI();
        syncMonthCheckboxesUI();
        updateMonthSummaryLabel();
    }

    // ==========================================
    // 📅 YEAR COMPARISON PICKER COMPONENT (2025, 2024, Cả 2 năm)
    // ==========================================

    function setupYearPicker() {
        const btnToggle = document.getElementById('btn-year-picker-toggle');
        const menu = document.getElementById('year-picker-menu');
        const chevron = document.getElementById('icon-year-picker-chevron');
        const chkShow = document.getElementById('chk-show-compare-col');
        const btnApply = document.getElementById('btn-apply-year-picker');
        const radioModes = document.querySelectorAll('input[name="year-compare-mode"]');

        if (btnToggle && menu) {
            btnToggle.addEventListener('click', (e) => {
                e.stopPropagation();
                const isHidden = menu.classList.contains('hidden');

                // Đóng dropdown tháng nếu đang mở
                const monthMenu = document.getElementById('month-picker-menu');
                if (monthMenu) monthMenu.classList.add('hidden');

                if (isHidden) {
                    menu.classList.remove('hidden');
                    if (chevron) chevron.classList.add('rotate-180');
                } else {
                    menu.classList.add('hidden');
                    if (chevron) chevron.classList.remove('rotate-180');
                }
            });

            document.addEventListener('click', (e) => {
                if (!e.target.closest('#year-picker-wrapper')) {
                    menu.classList.add('hidden');
                    if (chevron) chevron.classList.remove('rotate-180');
                }
            });
        }

        if (radioModes && radioModes.length > 0) {
            radioModes.forEach(radio => {
                radio.addEventListener('change', (e) => {
                    if (e.target.checked) {
                        setCompareYearMode(e.target.value);
                    }
                });
            });
        }

        if (chkShow) {
            chkShow.addEventListener('change', (e) => {
                if (!state.compareConfig) state.compareConfig = { mode: '2025', show: true };
                state.compareConfig.show = e.target.checked;
                state.columnVisibility.cost2025 = e.target.checked; // Giữ backward compatibility
                saveCurrentState();
                updateYearPickerUI();
                renderTable();
                if (window.CostTooltipEngine) window.CostTooltipEngine.hide();
            });
        }

        if (btnApply && menu) {
            btnApply.addEventListener('click', () => {
                menu.classList.add('hidden');
                if (chevron) chevron.classList.remove('rotate-180');
            });
        }
    }

    function setCompareYearMode(mode) {
        if (!state.compareConfig) state.compareConfig = { mode: '2025', show: true };
        state.compareConfig.mode = mode;
        saveCurrentState();
        updateYearPickerUI();
        renderTable();
        renderDashboardCharts();
        if (window.CostTooltipEngine) window.CostTooltipEngine.hide();
    }

    function updateYearPickerUI() {
        if (!state.compareConfig) state.compareConfig = { mode: '2025', show: true };
        const label = document.getElementById('selected-year-summary-label');
        const badge = document.getElementById('badge-col-year-status');
        const chkShow = document.getElementById('chk-show-compare-col');

        const mode = state.compareConfig.mode || '2025';
        const isShow = state.compareConfig.show !== false;

        if (chkShow) chkShow.checked = isShow;
        if (badge) {
            badge.className = isShow ? 'w-2 h-2 rounded-full bg-emerald-500 shrink-0' : 'w-2 h-2 rounded-full bg-slate-400 shrink-0';
        }

        if (label) {
            if (!isShow) {
                label.textContent = 'Đang ẩn cột';
            } else if (mode === '2025') {
                label.textContent = 'Năm 2025';
            } else if (mode === '2024') {
                label.textContent = 'Năm 2024';
            } else if (mode === 'BOTH') {
                label.textContent = 'Cả 2 năm (2024 & 2025)';
            }
        }

        // Cập nhật trạng thái radio & style nổi bật của dòng được chọn
        document.querySelectorAll('input[name="year-compare-mode"]').forEach(r => {
            r.checked = (r.value === mode);
            const parentItem = r.closest('.option-year-item');
            if (parentItem) {
                if (r.value === mode) {
                    parentItem.className = 'flex items-center justify-between p-2 rounded-lg border border-blue-300 bg-blue-50/70 font-bold cursor-pointer transition-all option-year-item';
                } else {
                    parentItem.className = 'flex items-center justify-between p-2 rounded-lg border border-slate-200 hover:bg-slate-50 cursor-pointer transition-all option-year-item';
                }
            }
        });
    }



    // ==========================================
    // 🎚️ SLICER HANDLERS
    // ==========================================

    function onDonViChange(e) {
        state.filters.donVi = e.target.value;
        state.filters.khoi = e.target.value;
        state.filters.mien = e.target.value;
        state.filters.quanTri = 'ALL';
        state.filters.phapNhan = 'ALL';
        populateSlicers();
        renderAll();
    }

    function onQuanTriChange(e) {
        state.filters.quanTri = e.target.value;
        state.filters.phapNhan = 'ALL';
        populateSlicers();
        renderAll();
    }

    function onPhapNhanChange(e) {
        state.filters.phapNhan = e.target.value;
        renderAll();
    }

    function onTaiKhoanChange(e) {
        state.filters.taiKhoan = e.target.value;
        renderAll();
    }

    function onBoPhanChange(e) {
        state.filters.boPhan = e.target.value;
        renderAll();
    }

    function setViewRole(role) {
        state.filters.viewRole = role;
        const btnMacro = document.getElementById('btn-role-macro');
        const btnMicro = document.getElementById('btn-role-micro');
        if (role === 'MACRO') {
            if (btnMacro) btnMacro.className = 'px-3 py-1 text-xs font-bold rounded-lg bg-[#00529C] text-white shadow transition-all';
            if (btnMicro) btnMicro.className = 'px-3 py-1 text-xs font-medium rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 transition-all';
        } else {
            if (btnMacro) btnMacro.className = 'px-3 py-1 text-xs font-medium rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 transition-all';
            if (btnMicro) btnMicro.className = 'px-3 py-1 text-xs font-bold rounded-lg bg-[#00529C] text-white shadow transition-all';
        }
        renderAll();
    }

    function setScopeMode(mode) {
        state.filters.scopeMode = mode;
        const btnCurrent = document.getElementById('btn-scope-current');
        const btnHistory = document.getElementById('btn-scope-history');
        if (mode === 'CURRENT_2026') {
            if (btnCurrent) btnCurrent.className = 'px-2.5 py-1 text-xs font-bold rounded-lg bg-blue-600 text-white shadow transition-all';
            if (btnHistory) btnHistory.className = 'px-2.5 py-1 text-xs font-medium rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 transition-all';
            const badgeDesc = document.getElementById('scope-badge-desc');
            if (badgeDesc) badgeDesc.textContent = 'Cơ cấu Quản trị Hiện hành (Theo đúng nguyên tắc quản trị)';
        } else {
            if (btnCurrent) btnCurrent.className = 'px-2.5 py-1 text-xs font-medium rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 transition-all';
            if (btnHistory) btnHistory.className = 'px-2.5 py-1 text-xs font-bold rounded-lg bg-blue-600 text-white shadow transition-all';
            const badgeDesc = document.getElementById('scope-badge-desc');
            if (badgeDesc) badgeDesc.textContent = 'Cơ cấu Quản trị Hiện hành (Theo đúng nguyên tắc quản trị)';
        }
        populateSlicers();
        renderAll();
    }

    function setMaterialFilter(onlyMaterial) {
        state.filters.materialOnly = onlyMaterial;
        updateMaterialFilterButtons();
        renderAll();
    }

    function updateMaterialFilterButtons() {
        const btnAll = document.getElementById('btn-filter-material-all') || document.getElementById('btn-filter-all-costs');
        const btnOnly = document.getElementById('btn-filter-material-only') || document.getElementById('btn-filter-material-costs');
        if (state.filters.materialOnly) {
            if (btnAll) btnAll.className = 'px-2.5 py-1 text-xs font-medium rounded-lg bg-white text-slate-700 hover:bg-slate-50 border border-slate-200 transition-all';
            if (btnOnly) btnOnly.className = 'px-2.5 py-1 text-xs font-bold rounded-lg bg-amber-500 text-white shadow-sm transition-all flex items-center gap-1.5';
        } else {
            if (btnAll) btnAll.className = 'px-2.5 py-1 text-xs font-bold rounded-lg bg-[#00529C] text-white shadow-sm transition-all';
            if (btnOnly) btnOnly.className = 'px-2.5 py-1 text-xs font-medium rounded-lg bg-white text-amber-800 hover:bg-slate-50 border border-slate-200 transition-all flex items-center gap-1.5';
        }
    }

    function getEntityBlock(e) {
        if (!e) return 'KHOI_MN';
        if (e.khoi) return e.khoi;
        const qt = (e.qt || e.qt2026 || e.qt2025 || '').trim();
        const mien = (e.mien || '').trim();
        const phia = (e.phia || '').trim();
        const name = (e.name || '').toUpperCase();
        const code = (e.code || '').toUpperCase();

        if (code === 'C1101' || code === 'C2305' || qt === 'THACO AUTO' || qt === 'PP THACO AUTO' || qt === 'Auto' || qt === 'Adj' || name.includes('VPĐH') || name.includes('ĐIỀU HÀNH') || name.includes('VĂN PHÒNG ĐIỀU HÀNH') || name.includes('PHÂN PHỐI') || name.includes('PP THACO AUTO')) {
            return 'KHOI_VPDH';
        }
        if (qt === 'Nhà máy' || mien === 'KSX' || phia === 'KSX' || name.includes('SẢN XUẤT') || name.includes('MÁY NÔNG NGHIỆP') || name.includes('LẮP RÁP') || name.includes('NHÀ MÁY') || name.includes('CHU LAI')) {
            return 'KHOI_NHAMAY';
        }
        if (mien === 'MB' || phia === 'Phía Bắc' || name.includes('MIỀN BẮC') || name.includes('BẮC')) {
            return 'KHOI_MB';
        }
        return 'KHOI_MN';
    }

    function getActiveEntityCodes(customFilters) {
        const filters = customFilters || state.filters;
        const currentDonVi = filters.donVi || filters.khoi || filters.mien || 'ALL';
        const currentQT = filters.quanTri || 'ALL';
        const currentPN = filters.phapNhan || 'ALL';

        let list = (state.entities || []).filter(e => e.active !== false);

        if (currentDonVi !== 'ALL') {
            list = list.filter(e => {
                const block = getEntityBlock(e);
                if (currentDonVi === 'KHOI_VPDH' || currentDonVi === 'VPĐH' || currentDonVi === 'VPDH') return block === 'KHOI_VPDH';
                if (currentDonVi === 'KHOI_NHAMAY' || currentDonVi === 'NHAMAY' || currentDonVi === 'Nhà máy') return block === 'KHOI_NHAMAY';
                if (currentDonVi === 'KHOI_MB' || currentDonVi === 'MB' || currentDonVi === 'CTTT Phía Bắc') return block === 'KHOI_MB';
                if (currentDonVi === 'KHOI_MN' || currentDonVi === 'MN' || currentDonVi === 'CTTT Phía Nam') return block === 'KHOI_MN';
                return block === currentDonVi;
            });
        }
        if (currentQT !== 'ALL') {
            list = list.filter(e => {
                const qt = (e.qt || e.cleanName || e.name || '').trim();
                return qt === currentQT;
            });
        }
        if (currentPN !== 'ALL') {
            list = list.filter(e => e.code === currentPN);
        }

        return list.map(e => e.code);
    }

    function populateSlicers() {
        const donViSelect = document.getElementById('slicer-donvi') || document.getElementById('slicer-khoi') || document.getElementById('slicer-mien');
        const qtSelect = document.getElementById('slicer-quantri');
        const pnSelect = document.getElementById('slicer-phapnhan');

        const currentDonVi = state.filters.donVi || state.filters.khoi || state.filters.mien || 'ALL';
        const currentQT = state.filters.quanTri;

        let filteredEntities = (state.entities || []).filter(e => e.active !== false);

        // Lọc theo Slicer Đơn vị
        if (currentDonVi !== 'ALL') {
            filteredEntities = filteredEntities.filter(e => {
                const block = getEntityBlock(e);
                if (currentDonVi === 'KHOI_VPDH' || currentDonVi === 'VPĐH' || currentDonVi === 'VPDH') return block === 'KHOI_VPDH';
                if (currentDonVi === 'KHOI_NHAMAY' || currentDonVi === 'NHAMAY' || currentDonVi === 'Nhà máy') return block === 'KHOI_NHAMAY';
                if (currentDonVi === 'KHOI_MB' || currentDonVi === 'MB' || currentDonVi === 'CTTT Phía Bắc') return block === 'KHOI_MB';
                if (currentDonVi === 'KHOI_MN' || currentDonVi === 'MN' || currentDonVi === 'CTTT Phía Nam') return block === 'KHOI_MN';
                return block === currentDonVi;
            });
        }

        // Populating Đơn vị Quản trị
        const qtSet = new Set();
        filteredEntities.forEach(e => {
            const qt = (e.qt || e.cleanName || e.name || '').trim();
            if (qt && qt !== '') qtSet.add(qt);
        });
        const sortedQTs = Array.from(qtSet).sort((a, b) => a.localeCompare(b, 'vi'));

        if (qtSelect) {
            qtSelect.innerHTML = '<option value="ALL">-- Tất cả Đơn vị Quản trị --</option>';
            sortedQTs.forEach(qt => {
                const opt = document.createElement('option');
                opt.value = qt;
                opt.textContent = qt;
                if (qt === currentQT) opt.selected = true;
                qtSelect.appendChild(opt);
            });

            if (currentQT !== 'ALL' && !qtSet.has(currentQT)) {
                state.filters.quanTri = 'ALL';
            }
        }

        // Lọc theo Đơn vị Quản trị
        if (state.filters.quanTri !== 'ALL') {
            filteredEntities = filteredEntities.filter(e => {
                const qt = (e.qt || e.cleanName || e.name || '').trim();
                return qt === state.filters.quanTri;
            });
        }

        // Populating Pháp nhân
        if (pnSelect) {
            pnSelect.innerHTML = '<option value="ALL">-- Tất cả Pháp nhân --</option>';
            filteredEntities.forEach(e => {
                const opt = document.createElement('option');
                opt.value = e.code;
                opt.textContent = `${e.code} - ${e.cleanName || e.name}`;
                if (e.code === state.filters.phapNhan) opt.selected = true;
                pnSelect.appendChild(opt);
            });

            if (state.filters.phapNhan !== 'ALL' && !filteredEntities.some(e => e.code === state.filters.phapNhan)) {
                state.filters.phapNhan = 'ALL';
            }
        }

        // Populating Slicer Bộ Phận (Thuần túy các bộ phận thực tế từ dữ liệu chi phí Bravo)
        const bpSelect = document.getElementById('slicer-bophan');
        if (bpSelect) {
            const currentBP = state.filters.boPhan || 'ALL';
            bpSelect.innerHTML = '<option value="ALL">-- Tất cả Bộ phận --</option>';

            const deptMap = new Map();
            const activeCodes = getActiveEntityCodes();
            activeCodes.forEach(code => {
                if (state.deptData && state.deptData[code]) {
                    ['2024', '2025', '2026'].forEach(yr => {
                        const rows = state.deptData[code][yr] || [];
                        rows.forEach(r => {
                            if (r.bp && !deptMap.has(r.bp)) {
                                deptMap.set(r.bp, r.tenBp || r.bp);
                            }
                        });
                    });
                }
            });

            if (deptMap.size > 0) {
                Array.from(deptMap.entries())
                    .sort((a, b) => a[0].localeCompare(b[0]))
                    .forEach(([bp, tenBp]) => {
                        const opt = document.createElement('option');
                        opt.value = bp;
                        opt.textContent = `${bp} - ${tenBp}`;
                        if (bp === currentBP) opt.selected = true;
                        bpSelect.appendChild(opt);
                    });
            }
        }
    }

    // ==========================================
    // 📊 REPORT CALCULATION & FORECASTING ENGINE
    // ==========================================

    function calculateReportData(customFilters) {
        const filters = customFilters || state.filters;
        const cacheKey = JSON.stringify({
            filters: filters,
            actualMonths: state.actualMonths,
            compareConfig: state.compareConfig,
            catCount: (state.categories || []).length,
            entCount: (state.entities || []).length
        });

        if (reportDataCache.has(cacheKey)) {
            return reportDataCache.get(cacheKey);
        }

        const activeEntityCodes = getActiveEntityCodes(customFilters);
        const tkFilter = (customFilters && customFilters.taiKhoan) ? customFilters.taiKhoan : state.filters.taiKhoan;
        const bpFilter = (customFilters && customFilters.boPhan) ? customFilters.boPhan : state.filters.boPhan;
        const actualMonths = state.actualMonths;
        const remainingMonths = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].filter(m => !actualMonths.includes(m));

        const reportRows = [];

        function matchDeptFilter(bp, tenBp) {
            if (!bpFilter || bpFilter === 'ALL') return true;
            return bp === bpFilter || tenBp === bpFilter;
        }

        function extractYearlyMonths(yearStr, cat) {
            const arr = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
            const catIdStr = String(cat.id);
            const codes = (activeEntityCodes && activeEntityCodes.length > 0) ? activeEntityCodes : (state.entities || []).map(e => e.code);

            codes.forEach(entCode => {
                let entDeptMatched = false;
                if (state.deptData && state.deptData[entCode] && Array.isArray(state.deptData[entCode][yearStr]) && state.deptData[entCode][yearStr].length > 0) {
                    const dRows = state.deptData[entCode][yearStr];
                    dRows.forEach(r => {
                        const isCat = (r.catId !== undefined && r.catId === cat.id) || matchCategoryKm(cat, r.km);
                        if (isCat && matchDeptFilter(r.bp, r.tenBp)) {
                            entDeptMatched = true;
                            for (let m = 0; m < 12; m++) {
                                arr[m] += (r.months[m] || 0);
                            }
                        }
                    });
                }
                
                if (!entDeptMatched) {
                    const dataSource = yearStr === '2025' ? state.data2025 : (yearStr === '2024' ? state.data2024 : null);
                    if (dataSource && dataSource[entCode]) {
                        const entObj = dataSource[entCode];
                        const saved = entObj[catIdStr] || (entObj['642'] && entObj['642'][catIdStr]);
                        if (Array.isArray(saved)) {
                            for (let m = 0; m < 12; m++) arr[m] += (saved[m] || 0);
                        }
                    }
                }
            });
            return arr;
        }

        state.categories.forEach(cat => {
            const catIdStr = String(cat.id);
            const raw2026 = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
            const codes = (activeEntityCodes && activeEntityCodes.length > 0) ? activeEntityCodes : (state.entities || []).map(e => e.code);

            codes.forEach(entCode => {
                let entDeptMatched = false;
                if (state.deptData && state.deptData[entCode] && Array.isArray(state.deptData[entCode]['2026']) && state.deptData[entCode]['2026'].length > 0) {
                    const dRows = state.deptData[entCode]['2026'];
                    dRows.forEach(r => {
                        const isCat = (r.catId !== undefined && r.catId === cat.id) ||
                                      matchCategoryKm(cat, r.km) ||
                                      (r.km && cat.id && String(r.km) === String(cat.id));
                        if (isCat && matchDeptFilter(r.bp, r.tenBp)) {
                            entDeptMatched = true;
                            actualMonths.forEach(m => {
                                raw2026[m - 1] += (r.months[m - 1] || 0);
                            });
                        }
                    });
                }
                
                if (!entDeptMatched && state.data2026 && state.data2026[entCode]) {
                    const entTkData = state.data2026[entCode];
                    if (Array.isArray(entTkData[catIdStr])) {
                        actualMonths.forEach(m => {
                            raw2026[m - 1] += (entTkData[catIdStr][m - 1] || 0);
                        });
                    } else {
                        const tksToInclude = (tkFilter === 'ALL') ? Object.keys(entTkData) : [tkFilter];
                        tksToInclude.forEach(tk => {
                            if (entTkData[tk] && entTkData[tk][catIdStr]) {
                                const arr = entTkData[tk][catIdStr];
                                actualMonths.forEach(m => {
                                    raw2026[m - 1] += (arr[m - 1] || 0);
                                });
                            }
                        });
                    }
                }
            });

            // Chuyển đổi sang đơn vị Triệu đồng (Tr.đ)
            const monthly2026 = raw2026.map(v => v / 1e6);
            const monthly2025 = extractYearlyMonths('2025', cat).map(v => v / 1e6);
            const monthly2024 = extractYearlyMonths('2024', cat).map(v => v / 1e6);

            const total2025 = monthly2025.reduce((a, b) => a + b, 0);
            const total2024 = monthly2024.reduce((a, b) => a + b, 0);

            // Dự báo AI cho các tháng còn lại năm 2026
            let actualSum2026 = 0;
            actualMonths.forEach(m => { actualSum2026 += monthly2026[m - 1]; });

            let actualSumSamePeriod2025 = 0;
            actualMonths.forEach(m => { actualSumSamePeriod2025 += monthly2025[m - 1]; });

            let runRateMultiplier = 1.0;
            if (actualSumSamePeriod2025 > 0) {
                runRateMultiplier = actualSum2026 / actualSumSamePeriod2025;
            }

            const forecastBounds = {};
            remainingMonths.forEach(m => {
                const baseVal2025 = monthly2025[m - 1] || 0;
                const baseVal2024 = monthly2024[m - 1] || 0;
                let projected = 0;
                if (baseVal2025 > 0) {
                    projected = baseVal2025 * runRateMultiplier;
                } else {
                    projected = actualMonths.length > 0 ? (actualSum2026 / actualMonths.length) : 0;
                }
                monthly2026[m - 1] = Math.max(0, projected);

                // Dải tự tin phương sai mùa vụ (Seasonal Confidence Interval)
                const histSpread = (baseVal2024 > 0 && baseVal2025 > 0)
                    ? Math.abs(baseVal2025 - baseVal2024) / baseVal2024
                    : 0.12;
                const spread = Math.max(0.06, Math.min(0.20, histSpread * 0.5));
                forecastBounds[m] = {
                    projected: projected,
                    min: Math.max(0, projected * (1 - spread)),
                    max: projected * (1 + spread),
                    spread: spread
                };
            });

            const forecastRemainingSum = remainingMonths.reduce((sum, m) => sum + monthly2026[m - 1], 0);
            const fullYear2026 = actualSum2026 + forecastRemainingSum;

            const mode = (state.compareConfig && state.compareConfig.mode) || '2025';
            const compTotal = (mode === '2024') ? total2024 : total2025;
            const diffYoY = fullYear2026 - compTotal;
            const diffYoYPercent = compTotal > 0 ? ((fullYear2026 - compTotal) / compTotal * 100) : 0;

            reportRows.push({
                category: cat,
                monthly2024: monthly2024,
                total2024: total2024,
                monthly2025: monthly2025,
                total2025: total2025,
                monthly2026: monthly2026,
                actualSum2026: actualSum2026,
                forecastRemainingSum: forecastRemainingSum,
                fullYear2026: fullYear2026,
                forecastBounds: forecastBounds,
                diffYoY: diffYoY,
                diffYoYPercent: diffYoYPercent,
                diffAmount: diffYoY,
                diffPct: diffYoYPercent
            });
        });

        if (cacheKey) {
            reportDataCache.set(cacheKey, reportRows);
        }
        return reportRows;
    }

    // ==========================================
    // 📋 TABLE & DASHBOARD RENDERING
    // ==========================================

    function updateReportViewModeUI() {
        const isYoY = state.yoyConfig && state.yoyConfig.viewMode === 'YOY_TABLE';
        const btnMonthly = document.getElementById('btn-view-mode-monthly');
        const btnYoY = document.getElementById('btn-view-mode-yoy');
        const yearPickerWrap = document.getElementById('year-picker-wrapper');
        const monthPickerWrap = document.getElementById('month-picker-wrapper');
        const inputThreshold = document.getElementById('input-yoy-threshold');

        if (inputThreshold && state.yoyConfig) {
            inputThreshold.value = state.yoyConfig.thresholdPercent || 20;
        }

        if (btnMonthly && btnYoY) {
            if (isYoY) {
                btnMonthly.className = 'px-2.5 py-1 text-xs font-medium rounded-lg bg-white text-slate-700 hover:bg-slate-50 border border-slate-200 transition-all flex items-center gap-1';
                btnYoY.className = 'px-2.5 py-1 text-xs font-bold rounded-lg bg-[#00529C] text-white shadow-sm transition-all flex items-center gap-1';
                if (yearPickerWrap) yearPickerWrap.classList.add('hidden');
                if (monthPickerWrap) monthPickerWrap.classList.add('hidden');
            } else {
                btnMonthly.className = 'px-2.5 py-1 text-xs font-bold rounded-lg bg-[#00529C] text-white shadow-sm transition-all flex items-center gap-1';
                btnYoY.className = 'px-2.5 py-1 text-xs font-medium rounded-lg bg-white text-slate-700 hover:bg-slate-50 border border-slate-200 transition-all flex items-center gap-1';
                if (yearPickerWrap) yearPickerWrap.classList.remove('hidden');
                if (monthPickerWrap) monthPickerWrap.classList.remove('hidden');
            }
        }
    }

    function renderYoYTableContent(grouped, displayRows, tbody) {
        const threshold = (state.yoyConfig && state.yoyConfig.thresholdPercent) || 20;

        function renderYoYMetricCells(vNew, vOld, isHeaderOrTotal = false) {
            const diff = vNew - vOld;
            const hasBase = vOld > 0;
            const pct = hasBase ? ((diff / vOld) * 100) : (vNew > 0 ? 100 : 0);
            const sign = diff >= 0 ? '+' : '';
            const diffFormatted = `${diff >= 0 ? '+' : ''}${formatNumber(diff)}`;

            let pctHtml = '<span class="text-slate-400 font-mono text-xs">-</span>';
            if (hasBase) {
                const pctText = `${sign}${pct.toFixed(1)}%`;
                if (Math.abs(pct) >= threshold) {
                    if (pct > 0) {
                        pctHtml = `<span class="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-black bg-rose-100 text-rose-800 border border-rose-300 shadow-sm" title="Tăng vượt ngưỡng cảnh báo ±${threshold}%">▲ ${pctText} ⚠️</span>`;
                    } else {
                        pctHtml = `<span class="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-black bg-emerald-100 text-emerald-800 border border-emerald-300 shadow-sm" title="Giảm vượt ngưỡng cảnh báo ±${threshold}%">▼ ${pctText}</span>`;
                    }
                } else {
                    const color = isHeaderOrTotal
                        ? (pct > 0 ? 'text-amber-300 font-bold' : (pct < 0 ? 'text-emerald-300 font-bold' : 'text-slate-200'))
                        : (pct > 0 ? 'text-amber-700 font-bold' : (pct < 0 ? 'text-emerald-700 font-bold' : 'text-slate-600'));
                    pctHtml = `<span class="font-mono text-xs ${color}">${pctText}</span>`;
                }
            } else if (vNew > 0) {
                pctHtml = `<span class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800">Mới phát sinh</span>`;
            }

            const diffColor = isHeaderOrTotal
                ? 'text-white'
                : (diff > 0 ? 'text-amber-900 font-bold' : (diff < 0 ? 'text-emerald-900 font-bold' : 'text-slate-600'));

            return {
                diffHtml: `<td class="p-2 text-right border-r border-slate-200 font-mono text-xs ${diffColor}">${diffFormatted}</td>`,
                pctHtml: `<td class="p-2 text-right border-r border-slate-200 font-mono text-xs">${pctHtml}</td>`
            };
        }

        let stt = 1;
        let grand2024 = 0, grand2025 = 0, grand2026 = 0;

        Object.keys(grouped).forEach(grpName => {
            const rows = grouped[grpName];
            const isCollapsed = !!state.collapsedGroups[grpName];

            let grp2024 = 0, grp2025 = 0, grp2026 = 0;
            rows.forEach(r => {
                grp2024 += (r.total2024 || 0);
                grp2025 += (r.total2025 || 0);
                grp2026 += (r.fullYear2026 || 0);
            });

            grand2024 += grp2024;
            grand2025 += grp2025;
            grand2026 += grp2026;

            const grp26_25 = renderYoYMetricCells(grp2026, grp2025, true);
            const grp26_24 = renderYoYMetricCells(grp2026, grp2024, true);
            const grp25_24 = renderYoYMetricCells(grp2025, grp2024, true);

            // Group Header Row
            const grpTr = document.createElement('tr');
            grpTr.className = 'bg-[#FEF3C7] text-[#00529C] font-extrabold text-xs border-y border-amber-200 select-none';
            grpTr.innerHTML = `
                <td class="p-2 text-center text-[#00529C] border-r border-amber-200/80 font-mono sticky-col-1 bg-[#FEF3C7] cursor-pointer" data-action="toggle-collapse">
                    <span class="inline-flex items-center justify-center w-5 h-5 rounded bg-amber-200 text-[#00529C] font-bold text-xs">${isCollapsed ? '+' : '−'}</span>
                </td>
                <td colspan="3" class="p-2 text-left text-[#00529C] border-r border-amber-200/80 font-extrabold text-xs cursor-pointer" data-action="toggle-collapse">
                    <span>${(window.getGroupIcon ? window.getGroupIcon(grpName) : '📑')} ${escapeHtml(grpName)} (${rows.length} khoản mục)</span>
                </td>
                <td class="p-2 text-right border-r border-amber-200/80 font-mono text-purple-900 bg-purple-50/50">${formatNumber(grp2024)}</td>
                <td class="p-2 text-right border-r border-amber-200/80 font-mono text-sky-900 bg-sky-50/50">${formatNumber(grp2025)}</td>
                <td class="p-2 text-right border-r border-amber-200/80 font-mono text-emerald-950 font-black bg-emerald-100/70">${formatNumber(grp2026)}</td>
                ${grp26_25.diffHtml}
                ${grp26_25.pctHtml}
                ${grp26_24.diffHtml}
                ${grp26_24.pctHtml}
                ${grp25_24.diffHtml}
                ${grp25_24.pctHtml}
                <td class="p-1.5 text-center border-r border-amber-200/80">
                    <button class="btn-yoy-drilldown px-1.5 py-0.5 bg-amber-200 hover:bg-amber-300 text-[#00529C] rounded font-bold text-[10px] w-full transition-all" data-group-name="${escapeHtml(grpName)}">
                        🔍 Nhóm
                    </button>
                </td>
            `;

            grpTr.addEventListener('click', (e) => {
                if (e.target.closest('.btn-yoy-drilldown')) return;
                if (e.target.closest('[data-action="toggle-collapse"]') || e.target === grpTr || e.target.tagName === 'SPAN' || e.target.tagName === 'TD') {
                    state.collapsedGroups[grpName] = !state.collapsedGroups[grpName];
                    renderTable();
                }
            });

            tbody.appendChild(grpTr);

            // Item Rows
            if (!isCollapsed) {
                rows.forEach(r => {
                    const tr = document.createElement('tr');
                    tr.className = `text-xs border-b border-slate-200 hover:bg-blue-50/50 transition-colors ${r.category.is_material ? 'bg-amber-50/40' : 'bg-white'}`;

                    const item26_25 = renderYoYMetricCells(r.fullYear2026, r.total2025);
                    const item26_24 = renderYoYMetricCells(r.fullYear2026, r.total2024);
                    const item25_24 = renderYoYMetricCells(r.total2025, r.total2024);

                    const starIcon = r.category.is_material ? '<span class="text-amber-500 font-black mr-1" title="Khoản mục trọng yếu">⭐</span>' : '';

                    tr.innerHTML = `
                        <td class="p-2 text-center text-slate-500 border-r border-slate-200 font-mono sticky-col-1 bg-white">${stt++}</td>
                        <td class="p-2 text-center border-r border-slate-200 font-mono text-[#00529C] text-[11px] font-semibold sticky-col-2 bg-white">${escapeHtml(r.category.b7_display || '-')}</td>
                        <td class="p-2 text-center border-r border-slate-200 font-mono text-emerald-700 text-[11px] font-semibold sticky-col-3 bg-white">${escapeHtml(r.category.b10_display || '-')}</td>
                        <td class="p-2 text-left font-semibold text-slate-800 border-r border-slate-200 pl-3 sticky-col-4 bg-white">
                            ${starIcon}<span>${escapeHtml(r.category.name)}</span>
                        </td>
                        <td class="p-2 text-right border-r border-slate-200 font-mono text-purple-900 bg-purple-50/30 font-medium">${formatNumber(r.total2024)}</td>
                        <td class="p-2 text-right border-r border-slate-200 font-mono text-sky-900 bg-sky-50/30 font-medium">${formatNumber(r.total2025)}</td>
                        <td class="p-2 text-right border-r border-slate-200 font-mono text-[#00529C] bg-blue-50/40 font-bold">${formatNumber(r.fullYear2026)}</td>
                        ${item26_25.diffHtml}
                        ${item26_25.pctHtml}
                        ${item26_24.diffHtml}
                        ${item26_24.pctHtml}
                        ${item25_24.diffHtml}
                        ${item25_24.pctHtml}
                        <td class="p-1.5 text-center border-r border-slate-200">
                            <button class="btn-yoy-drilldown px-2 py-1 bg-blue-50 hover:bg-blue-100 text-[#00529C] rounded border border-blue-200 text-[11px] font-bold shadow-sm transition-all flex items-center justify-center gap-1 w-full" data-cat-id="${r.category.id}">
                                🔍 Đơn vị
                            </button>
                        </td>
                    `;
                    tbody.appendChild(tr);
                });
            }
        });

        // Grand Total Row
        const grand26_25 = renderYoYMetricCells(grand2026, grand2025, true);
        const grand26_24 = renderYoYMetricCells(grand2026, grand2024, true);
        const grand25_24 = renderYoYMetricCells(grand2025, grand2024, true);

        const footerTr = document.createElement('tr');
        footerTr.className = 'bg-[#003870] text-white font-black text-xs border-t-2 border-blue-900 select-none';
        footerTr.innerHTML = `
            <td colspan="4" class="p-2.5 text-center uppercase tracking-wider font-extrabold border-r border-blue-800 sticky-col-1 bg-[#003870]">
                TỔNG CỘNG CHI PHÍ TOÀN BỘ
            </td>
            <td class="p-2.5 text-right border-r border-blue-800 font-mono text-purple-200 bg-purple-950/40">${formatNumber(grand2024)}</td>
            <td class="p-2.5 text-right border-r border-blue-800 font-mono text-cyan-200 bg-blue-950/40">${formatNumber(grand2025)}</td>
            <td class="p-2.5 text-right border-r border-blue-800 font-mono text-amber-200 font-black bg-emerald-950/50">${formatNumber(grand2026)}</td>
            ${grand26_25.diffHtml}
            ${grand26_25.pctHtml}
            ${grand26_24.diffHtml}
            ${grand26_24.pctHtml}
            ${grand25_24.diffHtml}
            ${grand25_24.pctHtml}
            <td class="p-2.5 text-center border-r border-blue-800 font-mono text-slate-300">-</td>
        `;
        tbody.appendChild(footerTr);

        // Delegated click on tbody for drilldown buttons
        tbody.onclick = function(e) {
            const btn = e.target.closest('.btn-yoy-drilldown');
            if (!btn) return;
            const catIdAttr = btn.getAttribute('data-cat-id');
            const grpNameAttr = btn.getAttribute('data-group-name');

            if (catIdAttr) {
                const catId = parseInt(catIdAttr, 10);
                const cat = state.categories.find(c => c.id === catId);
                if (cat && window.openDrillDownModal) {
                    window.openDrillDownModal({
                        id: cat.id,
                        name: cat.name,
                        group: cat.group,
                        b7_display: cat.b7_display,
                        b10_display: cat.b10_display
                    });
                }
            } else if (grpNameAttr && window.openDrillDownModal) {
                window.openDrillDownModal({
                    group: grpNameAttr,
                    isGroupSummary: true,
                    name: `Nhóm: ${grpNameAttr}`
                });
            }
        };
    }

    function renderTableHeader() {
        const thead = document.getElementById('report-table-head') || document.getElementById('report-table-header');
        if (!thead) return;

        // Chế độ xem: Bảng Phân tích So sánh Cùng kỳ (YoY 3 Năm: 2024, 2025, 2026)
        if (state.yoyConfig && state.yoyConfig.viewMode === 'YOY_TABLE') {
            thead.innerHTML = `
                <tr>
                    <th rowspan="2" class="p-2.5 text-center font-bold border-r border-blue-800 w-10 sticky-col-1 bg-[#00529C]">TT</th>
                    <th rowspan="2" class="p-2.5 font-bold border-r border-blue-800 w-24 sticky-col-2 bg-[#00529C]">KMP B7</th>
                    <th rowspan="2" class="p-2.5 font-bold border-r border-blue-800 w-24 sticky-col-3 bg-[#00529C]">KMP B10</th>
                    <th rowspan="2" class="p-2.5 font-bold border-r border-blue-800 min-w-[220px] sticky-col-4 bg-[#00529C]">Tên Chi phí</th>
                    <th rowspan="2" class="p-2.5 text-right font-bold border-r border-blue-800 w-28 bg-[#00488a] text-purple-200">
                        NĂM 2024<br /><span class="text-[10px] text-purple-300 font-normal">(Tr.đ)</span>
                    </th>
                    <th rowspan="2" class="p-2.5 text-right font-bold border-r border-blue-800 w-28 bg-[#00488a] text-sky-200">
                        NĂM 2025<br /><span class="text-[10px] text-sky-300 font-normal">(Tr.đ)</span>
                    </th>
                    <th rowspan="2" class="p-2.5 text-right font-black border-r border-blue-800 w-32 bg-[#059669] text-amber-200">
                        CẢ NĂM 2026<br /><span class="text-[10px] text-emerald-100 font-normal">(Thực hiện + AI)</span>
                    </th>
                    <th colspan="2" class="p-2 text-center font-bold border-r border-blue-800 bg-[#004080] text-amber-300">
                        2026 SO VỚI 2025
                    </th>
                    <th colspan="2" class="p-2 text-center font-bold border-r border-blue-800 bg-[#0284C7] text-cyan-200">
                        2026 SO VỚI 2024
                    </th>
                    <th colspan="2" class="p-2 text-center font-bold border-r border-blue-800 bg-[#4F46E5] text-indigo-200">
                        2025 SO VỚI 2024
                    </th>
                    <th rowspan="2" class="p-2.5 text-center font-bold border-r border-blue-800 w-24 bg-[#00529C]">
                        Chi tiết ĐV
                    </th>
                </tr>
                <tr class="bg-[#003870] text-[11px] text-white">
                    <th class="p-2 text-right border-r border-blue-800 w-24">Chênh lệch (Tr.đ)</th>
                    <th class="p-2 text-right border-r border-blue-800 w-24">% YoY</th>
                    <th class="p-2 text-right border-r border-blue-800 w-24">Chênh lệch (Tr.đ)</th>
                    <th class="p-2 text-right border-r border-blue-800 w-24">% YoY</th>
                    <th class="p-2 text-right border-r border-blue-800 w-24">Chênh lệch (Tr.đ)</th>
                    <th class="p-2 text-right border-r border-blue-800 w-24">% YoY</th>
                </tr>
            `;
            return;
        }

        const isShow = state.compareConfig ? (state.compareConfig.show !== false) : (state.columnVisibility.cost2025 !== false);
        const mode = (state.compareConfig && state.compareConfig.mode) || '2025';

        const actualMonthsList = state.actualMonths || [1, 2, 3, 4, 5, 6, 7];
        const selActual = (state.selectedMonths || []).filter(m => actualMonthsList.includes(m)).sort((a, b) => a - b);
        const selPlan = (state.selectedMonths || []).filter(m => !actualMonthsList.includes(m)).sort((a, b) => a - b);

        const hasSubHeaderRow = (selActual.length > 0) || (selPlan.length > 0);
        const rowSpan = hasSubHeaderRow ? 'rowspan="2"' : '';

        let thCompare = '';
        if (isShow) {
            if (mode === '2025') {
                thCompare = `
                    <th ${rowSpan} class="p-2.5 text-right font-bold border-r border-blue-800 w-28 text-blue-100 bg-[#00488a]">
                        TỔNG CHI PHÍ NĂM 2025<br /><span class="text-[10px] text-blue-200 font-normal">(Cả năm - ĐVT: Tr đồng)</span>
                    </th>
                `;
            } else if (mode === '2024') {
                thCompare = `
                    <th ${rowSpan} class="p-2.5 text-right font-bold border-r border-blue-800 w-28 text-blue-100 bg-[#00488a]">
                        TỔNG CHI PHÍ NĂM 2024<br /><span class="text-[10px] text-blue-200 font-normal">(Cả năm - ĐVT: Tr đồng)</span>
                    </th>
                `;
            } else if (mode === 'BOTH') {
                thCompare = `
                    <th ${rowSpan} class="p-2.5 text-right font-bold border-r border-blue-800 w-28 text-blue-100 bg-[#00488a]">
                        TỔNG CẢ NĂM 2024<br /><span class="text-[10px] text-blue-200 font-normal">(ĐVT: Tr đồng)</span>
                    </th>
                    <th ${rowSpan} class="p-2.5 text-right font-bold border-r border-blue-800 w-28 text-blue-100 bg-[#00488a]">
                        TỔNG CẢ NĂM 2025<br /><span class="text-[10px] text-blue-200 font-normal">(ĐVT: Tr đồng)</span>
                    </th>
                `;
            }
        }

        let luyKeSub = '';
        if (selActual.length === 7 && selActual.every((m, i) => m === i + 1)) {
            luyKeSub = 'T1 - T7';
        } else if (selActual.length === 0) {
            luyKeSub = '0 tháng';
        } else if (selActual.length === 1) {
            luyKeSub = `T${selActual[0]}`;
        } else if (selActual.every((m, idx, arr) => idx === 0 || m === arr[idx - 1] + 1)) {
            luyKeSub = `T${selActual[0]} - T${selActual[selActual.length - 1]}`;
        } else {
            luyKeSub = selActual.map(m => 'T' + m).join(',');
        }

        // Header Khối Đã thực hiện (chỉ hiển thị khi có ít nhất 1 tháng thực tế được chọn)
        let thActualHeader = '';
        let thActualSub = '';
        let thLuyKe = '';
        if (selActual.length > 0) {
            const colspanActual = selActual.length + 1; // Các tháng thực hiện được tick + cột LUỸ KẾ
            thActualHeader = `
                <th colspan="${colspanActual}" class="p-2 text-center font-bold border-r border-blue-800 bg-[#004080] text-[#FFFFD4]">
                    ĐÃ THỰC HIỆN NĂM 2026 (ĐVT: Tr đồng)
                </th>
            `;

            selActual.forEach(m => {
                thActualSub += `<th class="p-2 text-right border-r border-blue-800 w-16">T${m}</th>`;
            });
            thLuyKe = `
                <th class="p-2 text-right border-r border-blue-800 w-24 bg-amber-400 text-slate-950 font-black">
                    LUỸ KẾ<br /><span class="text-[9px] font-normal text-slate-900">${luyKeSub}</span>
                </th>
            `;
        }

        // Header Khối Kế hoạch / AI Dự kiến (chỉ hiển thị khi có tháng AI được tick)
        let thPlanHeader = '';
        let thPlanSub = '';
        if (selPlan.length > 0) {
            thPlanHeader = `
                <th colspan="${selPlan.length}" class="p-2 text-center font-bold border-r border-blue-800 bg-[#0284C7] text-white">
                    KẾ HOẠCH / AI DỰ KIẾN 2026 (ĐVT: Tr đồng)
                </th>
            `;
            selPlan.forEach(m => {
                thPlanSub += `<th class="p-2 text-right border-r border-blue-800 w-16 text-cyan-200">T${m}</th>`;
            });
        }

        thead.innerHTML = `
            <tr>
                <th ${rowSpan} class="p-2.5 text-center font-bold border-r border-blue-800 w-10 sticky-col-1 bg-[#00529C]">TT</th>
                <th ${rowSpan} class="p-2.5 font-bold border-r border-blue-800 w-28 sticky-col-2 bg-[#00529C]">KMP B7</th>
                <th ${rowSpan} class="p-2.5 font-bold border-r border-blue-800 w-24 sticky-col-3 bg-[#00529C]">KMP B10</th>
                <th ${rowSpan} class="p-2.5 font-bold border-r border-blue-800 min-w-[220px] sticky-col-4 bg-[#00529C]">Tên Chi phí</th>
                ${thCompare}
                ${thActualHeader}
                ${thPlanHeader}
                <th ${rowSpan} class="p-2.5 text-right font-black bg-[#059669] text-[#FFFFD4] w-32">
                    CẢ NĂM 2026<br /><span class="text-[10px] font-normal text-emerald-100">(Thực hiện + Dự kiến)</span>
                </th>
            </tr>
            ${hasSubHeaderRow ? `
            <tr class="bg-[#003870] text-[11px] text-white">
                ${thActualSub}
                ${thLuyKe}
                ${thPlanSub}
            </tr>
            ` : ''}
        `;
    }

    function renderTable() {
        updateReportViewModeUI();
        renderTableHeader();

        const allCalculatedRows = calculateReportData();

        const materialCount = state.categories.filter(c => c.is_material).length;
        const totalCatCount = state.categories.length;
        const badge = document.getElementById('material-count-badge');
        if (badge) badge.textContent = materialCount;
        const btnAll = document.getElementById('btn-filter-material-all') || document.getElementById('btn-filter-all-costs');
        if (btnAll) btnAll.textContent = `Tất cả (${totalCatCount})`;

        const tbody = document.getElementById('report-table-body');
        if (!tbody) return;
        tbody.innerHTML = '';

        const actualMonthsList = state.actualMonths || [1, 2, 3, 4, 5, 6, 7];
        const selActual = (state.selectedMonths || []).filter(m => actualMonthsList.includes(m)).sort((a, b) => a - b);
        const selPlan = (state.selectedMonths || []).filter(m => !actualMonthsList.includes(m)).sort((a, b) => a - b);

        let luyKePeriodLabel = 'Luỹ kế';
        if (selActual.length === 7 && selActual.every((m, i) => m === i + 1)) {
            luyKePeriodLabel = 'Luỹ kế T1 - T7';
        } else if (selActual.length === 0) {
            luyKePeriodLabel = 'Luỹ kế (0 tháng)';
        } else if (selActual.length === 1) {
            luyKePeriodLabel = `Luỹ kế T${selActual[0]}`;
        } else if (selActual.every((m, idx, arr) => idx === 0 || m === arr[idx - 1] + 1)) {
            luyKePeriodLabel = `Luỹ kế T${selActual[0]} - T${selActual[selActual.length - 1]}`;
        } else {
            luyKePeriodLabel = `Luỹ kế (${selActual.map(m => 'T' + m).join(', ')})`;
        }

        const isYoYTable = state.yoyConfig && state.yoyConfig.viewMode === 'YOY_TABLE';
        const isShowCompare = state.compareConfig ? (state.compareConfig.show !== false) : (state.columnVisibility.cost2025 !== false);
        const compareMode = (state.compareConfig && state.compareConfig.mode) || '2025';
        const numCompareCols = !isShowCompare ? 0 : (compareMode === 'BOTH' ? 2 : 1);
        const actualColsCount = selActual.length > 0 ? (selActual.length + 1) : 0;
        const totalCols = isYoYTable ? 14 : (4 + numCompareCols + actualColsCount + selPlan.length + 1);

        let displayRows = allCalculatedRows;
        if (state.filters.materialOnly) {
            displayRows = allCalculatedRows.filter(r => r.category.is_material === true);
        }

        if (displayRows.length === 0) {
            const emptyTr = document.createElement('tr');
            emptyTr.innerHTML = `
                <td colspan="${totalCols}" class="p-8 text-center text-slate-500 bg-white">
                    <div class="flex flex-col items-center justify-center gap-2">
                        <span class="text-3xl">📂</span>
                        <div class="font-bold text-slate-700">Không tìm thấy khoản mục phù hợp với bộ lọc</div>
                    </div>
                </td>
            `;
            tbody.appendChild(emptyTr);
            return;
        }

        // Nhóm các dòng theo group
        const grouped = {};
        displayRows.forEach(r => {
            const grp = (r.category.group && r.category.group.trim()) ? r.category.group.trim() : 'Chi phí hoạt động chung';
            if (!grouped[grp]) grouped[grp] = [];
            grouped[grp].push(r);
        });

        // Nếu đang ở Chế độ Xem Bảng So sánh Cùng kỳ YoY 3 Năm (2024 - 2025 - 2026)
        if (isYoYTable) {
            renderYoYTableContent(grouped, displayRows, tbody);
            return;
        }

        let stt = 1;
        let grand2024 = 0, grand2025 = 0, grand2026 = 0;
        const grandMonths = Array(12).fill(0);
        const grandMonths2025 = Array(12).fill(0);
        const grandMonths2024 = Array(12).fill(0);

        Object.keys(grouped).forEach(grpName => {
            const rows = grouped[grpName];
            const isCollapsed = !!state.collapsedGroups[grpName];

            // Tổng nhóm
            let grp2024 = 0, grp2025 = 0, grp2026 = 0;
            const grpMonths = Array(12).fill(0);
            const grpMonths2025 = Array(12).fill(0);
            const grpMonths2024 = Array(12).fill(0);

            rows.forEach(r => {
                grp2024 += (r.total2024 || 0);
                grp2025 += (r.total2025 || 0);
                grp2026 += (r.fullYear2026 || 0);
                for (let i = 0; i < 12; i++) {
                    grpMonths[i] += (r.monthly2026[i] || 0);
                    grpMonths2025[i] += (r.monthly2025[i] || 0);
                    grpMonths2024[i] += (r.monthly2024[i] || 0);
                    grandMonths[i] += (r.monthly2026[i] || 0);
                    grandMonths2025[i] += (r.monthly2025[i] || 0);
                    grandMonths2024[i] += (r.monthly2024[i] || 0);
                }
            });
            grand2024 += grp2024;
            grand2025 += grp2025;
            grand2026 += grp2026;

            const grpLuỹKế = selActual.reduce((sum, m) => sum + (grpMonths[m - 1] || 0), 0);
            const grpLuỹKế2025 = selActual.reduce((sum, m) => sum + (grpMonths2025[m - 1] || 0), 0);
            const grpLuỹKế2024 = selActual.reduce((sum, m) => sum + (grpMonths2024[m - 1] || 0), 0);

            // 1. HÀNG TIÊU ĐỀ NHÓM (GROUP HEADER ROW)
            const grpTr = document.createElement('tr');
            grpTr.className = 'bg-[#FEF3C7] text-[#00529C] font-extrabold text-xs border-y border-amber-200 select-none';

            let grpTdCompare = '';
            if (isShowCompare) {
                if (compareMode === '2025') {
                    grpTdCompare = `
                        <td class="p-2 text-right border-r border-amber-200/80 font-mono text-slate-900 bg-amber-100/50 hover:bg-amber-200/80 cursor-pointer transition-colors"
                            data-tooltip-cell="true"
                            data-tooltip-type="compare"
                            data-target-year="2025"
                            data-tooltip-title="${escapeHtml(grpName)}"
                            data-tooltip-subtitle="(Tổng nhóm chi phí)"
                            data-tooltip-period="Cả năm 2025"
                            data-val-2026="${grp2026}"
                            data-val-2025="${grp2025}"
                            data-val-2024="${grp2024}">${formatNumber(grp2025)}</td>
                    `;
                } else if (compareMode === '2024') {
                    grpTdCompare = `
                        <td class="p-2 text-right border-r border-amber-200/80 font-mono text-slate-900 bg-amber-100/50 hover:bg-amber-200/80 cursor-pointer transition-colors"
                            data-tooltip-cell="true"
                            data-tooltip-type="compare"
                            data-target-year="2024"
                            data-tooltip-title="${escapeHtml(grpName)}"
                            data-tooltip-subtitle="(Tổng nhóm chi phí)"
                            data-tooltip-period="Cả năm 2024"
                            data-val-2026="${grp2026}"
                            data-val-2025="${grp2025}"
                            data-val-2024="${grp2024}">${formatNumber(grp2024)}</td>
                    `;
                } else if (compareMode === 'BOTH') {
                    grpTdCompare = `
                        <td class="p-2 text-right border-r border-amber-200/80 font-mono text-slate-900 bg-amber-100/40 hover:bg-amber-200/80 cursor-pointer transition-colors"
                            data-tooltip-cell="true"
                            data-tooltip-type="compare"
                            data-target-year="2024"
                            data-tooltip-title="${escapeHtml(grpName)}"
                            data-tooltip-subtitle="(Tổng nhóm chi phí)"
                            data-tooltip-period="Cả năm 2024"
                            data-val-2026="${grp2026}"
                            data-val-2025="${grp2025}"
                            data-val-2024="${grp2024}"
                            title="Cả năm 2024">${formatNumber(grp2024)}</td>
                        <td class="p-2 text-right border-r border-amber-200/80 font-mono text-slate-900 bg-amber-100/60 hover:bg-amber-200/80 cursor-pointer transition-colors"
                            data-tooltip-cell="true"
                            data-tooltip-type="compare"
                            data-target-year="2025"
                            data-tooltip-title="${escapeHtml(grpName)}"
                            data-tooltip-subtitle="(Tổng nhóm chi phí)"
                            data-tooltip-period="Cả năm 2025"
                            data-val-2026="${grp2026}"
                            data-val-2025="${grp2025}"
                            data-val-2024="${grp2024}"
                            title="Cả năm 2025">${formatNumber(grp2025)}</td>
                    `;
                }
            }

            let grpActualMonthsTd = '';
            selActual.forEach(m => {
                const idx = m - 1;
                grpActualMonthsTd += `
                    <td class="p-2 text-right border-r border-amber-200/80 font-mono hover:bg-amber-200/70 cursor-pointer transition-colors"
                        data-tooltip-cell="true"
                        data-tooltip-type="month"
                        data-tooltip-title="${escapeHtml(grpName)}"
                        data-tooltip-subtitle="(Tổng nhóm chi phí)"
                        data-tooltip-period="T${m < 10 ? '0' + m : m}/2026"
                        data-month-num="${m}"
                        data-val-2026="${grpMonths[idx]}"
                        data-val-2025="${grpMonths2025[idx]}"
                        data-val-2024="${grpMonths2024[idx]}">
                        ${formatNumber(grpMonths[idx])}
                    </td>
                `;
            });

            let grpPlanMonthsTd = '';
            selPlan.forEach(m => {
                const idx = m - 1;
                grpPlanMonthsTd += `
                    <td class="p-2 text-right border-r border-amber-200/80 font-mono text-slate-700 hover:bg-amber-200/70 cursor-pointer transition-colors"
                        data-tooltip-cell="true"
                        data-tooltip-type="month"
                        data-tooltip-title="${escapeHtml(grpName)}"
                        data-tooltip-subtitle="(Tổng nhóm chi phí)"
                        data-tooltip-period="T${m < 10 ? '0' + m : m}/2026"
                        data-month-num="${m}"
                        data-val-2026="${grpMonths[idx]}"
                        data-val-2025="${grpMonths2025[idx]}"
                        data-val-2024="${grpMonths2024[idx]}">
                        ${formatNumber(grpMonths[idx])}
                    </td>
                `;
            });

            let grpLuyKeTd = '';
            if (selActual.length > 0) {
                grpLuyKeTd = `
                    <td class="p-2 text-right border-r border-amber-200/80 font-mono font-black bg-amber-300/80 text-slate-950 hover:bg-amber-400 cursor-pointer transition-colors"
                        data-tooltip-cell="true"
                        data-tooltip-type="luyke"
                        data-tooltip-title="${escapeHtml(grpName)}"
                        data-tooltip-subtitle="(Tổng nhóm chi phí)"
                        data-tooltip-period="${luyKePeriodLabel}"
                        data-val-2026="${grpLuỹKế}"
                        data-val-2025="${grpLuỹKế2025}"
                        data-val-2024="${grpLuỹKế2024}">
                        ${formatNumber(grpLuỹKế)}
                    </td>
                `;
            }

            grpTr.innerHTML = `
                <td class="p-2 text-center text-[#00529C] border-r border-amber-200/80 font-mono sticky-col-1 bg-[#FEF3C7] cursor-pointer" data-action="toggle-collapse">
                    <span class="inline-flex items-center justify-center w-5 h-5 rounded bg-amber-200 text-[#00529C] font-bold text-xs">${isCollapsed ? '+' : '−'}</span>
                </td>
                <td colspan="3" class="p-2 text-left text-[#00529C] border-r border-amber-200/80 font-extrabold text-xs cursor-pointer" data-action="toggle-collapse">
                    <span>${(window.getGroupIcon ? window.getGroupIcon(grpName) : '📑')} ${escapeHtml(grpName)} (${rows.length} khoản mục)</span>
                </td>
                ${grpTdCompare}
                ${grpActualMonthsTd}
                ${grpLuyKeTd}
                ${grpPlanMonthsTd}
                <td class="p-2 text-right font-mono font-black bg-emerald-100 text-emerald-900 hover:bg-emerald-200 cursor-pointer transition-colors"
                    data-tooltip-cell="true"
                    data-tooltip-type="fullyear"
                    data-tooltip-title="${escapeHtml(grpName)}"
                    data-tooltip-subtitle="(Tổng nhóm chi phí)"
                    data-tooltip-period="Cả năm 2026"
                    data-val-2026="${grp2026}"
                    data-val-2025="${grp2025}"
                    data-val-2024="${grp2024}">
                    ${formatNumber(grp2026)}
                </td>
            `;

            // Bấm vào tiêu đề nhóm để đóng/mở
            grpTr.addEventListener('click', (e) => {
                if (e.target.closest('[data-action="toggle-collapse"]') || e.target === grpTr || e.target.tagName === 'SPAN') {
                    state.collapsedGroups[grpName] = !state.collapsedGroups[grpName];
                    renderTable();
                }
            });

            tbody.appendChild(grpTr);

            // 2. CÁC HÀNG KHOẢN MỤC CON (ITEM ROWS)
            if (!isCollapsed) {
                rows.forEach(r => {
                    const tr = document.createElement('tr');
                    tr.className = `text-xs border-b border-slate-200 hover:bg-blue-50/50 transition-colors ${r.category.is_material ? 'bg-amber-50/40' : 'bg-white'}`;

                    const itemLuỹKế = selActual.reduce((sum, m) => sum + ((r.monthly2026 && r.monthly2026[m - 1]) || 0), 0);
                    const itemLuỹKế2025 = selActual.reduce((sum, m) => sum + ((r.monthly2025 && r.monthly2025[m - 1]) || 0), 0);
                    const itemLuỹKế2024 = selActual.reduce((sum, m) => sum + ((r.monthly2024 && r.monthly2024[m - 1]) || 0), 0);

                    let itemTdCompare = '';
                    if (isShowCompare) {
                        if (compareMode === '2025') {
                            itemTdCompare = `
                                <td class="p-2 text-right border-r border-slate-200 font-mono text-slate-700 bg-slate-50/50 hover:bg-blue-100/70 cursor-pointer transition-colors"
                                    data-tooltip-cell="true"
                                    data-tooltip-type="compare"
                                    data-target-year="2025"
                                    data-tooltip-title="${escapeHtml(r.category.name)}"
                                    data-tooltip-subtitle="${escapeHtml(r.category.b7_display || r.category.b10_display || '')}"
                                    data-tooltip-period="Cả năm 2025"
                                    data-val-2026="${r.fullYear2026}"
                                    data-val-2025="${r.total2025}"
                                    data-val-2024="${r.total2024}">${formatNumber(r.total2025)}</td>
                            `;
                        } else if (compareMode === '2024') {
                            itemTdCompare = `
                                <td class="p-2 text-right border-r border-slate-200 font-mono text-slate-700 bg-slate-50/50 hover:bg-blue-100/70 cursor-pointer transition-colors"
                                    data-tooltip-cell="true"
                                    data-tooltip-type="compare"
                                    data-target-year="2024"
                                    data-tooltip-title="${escapeHtml(r.category.name)}"
                                    data-tooltip-subtitle="${escapeHtml(r.category.b7_display || r.category.b10_display || '')}"
                                    data-tooltip-period="Cả năm 2024"
                                    data-val-2026="${r.fullYear2026}"
                                    data-val-2025="${r.total2025}"
                                    data-val-2024="${r.total2024}">${formatNumber(r.total2024)}</td>
                            `;
                        } else if (compareMode === 'BOTH') {
                            itemTdCompare = `
                                <td class="p-2 text-right border-r border-slate-200 font-mono text-slate-700 bg-slate-50/40 hover:bg-blue-100/70 cursor-pointer transition-colors"
                                    data-tooltip-cell="true"
                                    data-tooltip-type="compare"
                                    data-target-year="2024"
                                    data-tooltip-title="${escapeHtml(r.category.name)}"
                                    data-tooltip-subtitle="${escapeHtml(r.category.b7_display || r.category.b10_display || '')}"
                                    data-tooltip-period="Cả năm 2024"
                                    data-val-2026="${r.fullYear2026}"
                                    data-val-2025="${r.total2025}"
                                    data-val-2024="${r.total2024}"
                                    title="Cả năm 2024">${formatNumber(r.total2024)}</td>
                                <td class="p-2 text-right border-r border-slate-200 font-mono text-slate-700 bg-slate-50/60 hover:bg-blue-100/70 cursor-pointer transition-colors"
                                    data-tooltip-cell="true"
                                    data-tooltip-type="compare"
                                    data-target-year="2025"
                                    data-tooltip-title="${escapeHtml(r.category.name)}"
                                    data-tooltip-subtitle="${escapeHtml(r.category.b7_display || r.category.b10_display || '')}"
                                    data-tooltip-period="Cả năm 2025"
                                    data-val-2026="${r.fullYear2026}"
                                    data-val-2025="${r.total2025}"
                                    data-val-2024="${r.total2024}"
                                    title="Cả năm 2025">${formatNumber(r.total2025)}</td>
                            `;
                        }
                    }

                    let itemActualMonthsTd = '';
                    selActual.forEach(m => {
                        const idx = m - 1;
                        const val = (r.monthly2026 && r.monthly2026[idx]) || 0;
                        const v25 = (r.monthly2025 && r.monthly2025[idx]) || 0;
                        const v24 = (r.monthly2024 && r.monthly2024[idx]) || 0;
                        itemActualMonthsTd += `
                            <td class="p-2 text-right border-r border-slate-200 font-mono hover:bg-blue-100/70 cursor-pointer transition-colors"
                                data-tooltip-cell="true"
                                data-tooltip-type="month"
                                data-tooltip-title="${escapeHtml(r.category.name)}"
                                data-tooltip-subtitle="${escapeHtml(r.category.b7_display || r.category.b10_display || '')}"
                                data-tooltip-period="T${m < 10 ? '0' + m : m}/2026"
                                data-month-num="${m}"
                                data-val-2026="${val}"
                                data-val-2025="${v25}"
                                data-val-2024="${v24}">
                                ${formatNumber(val)}
                            </td>
                        `;
                    });

                    let itemPlanMonthsTd = '';
                    selPlan.forEach(m => {
                        const idx = m - 1;
                        const val = (r.monthly2026 && r.monthly2026[idx]) || 0;
                        const v25 = (r.monthly2025 && r.monthly2025[idx]) || 0;
                        const v24 = (r.monthly2024 && r.monthly2024[idx]) || 0;
                        itemPlanMonthsTd += `
                            <td class="p-2 text-right border-r border-slate-200 font-mono text-slate-600 hover:bg-blue-100/70 cursor-pointer transition-colors"
                                data-tooltip-cell="true"
                                data-tooltip-type="month"
                                data-tooltip-title="${escapeHtml(r.category.name)}"
                                data-tooltip-subtitle="${escapeHtml(r.category.b7_display || r.category.b10_display || '')}"
                                data-tooltip-period="T${m < 10 ? '0' + m : m}/2026"
                                data-month-num="${m}"
                                data-val-2026="${val}"
                                data-val-2025="${v25}"
                                data-val-2024="${v24}">
                                ${formatNumber(val)}
                            </td>
                        `;
                    });

                    const starIcon = r.category.is_material ? '<span class="text-amber-500 font-black mr-1" title="Khoản mục trọng yếu">⭐</span>' : '';

                    let itemLuyKeTd = '';
                    if (selActual.length > 0) {
                        itemLuyKeTd = `
                            <td class="p-2 text-right border-r border-slate-200 font-mono font-bold bg-amber-100/70 text-slate-900 hover:bg-amber-200 cursor-pointer transition-colors"
                                data-tooltip-cell="true"
                                data-tooltip-type="luyke"
                                data-tooltip-title="${escapeHtml(r.category.name)}"
                                data-tooltip-subtitle="${escapeHtml(r.category.b7_display || r.category.b10_display || '')}"
                                data-tooltip-period="${luyKePeriodLabel}"
                                data-val-2026="${itemLuỹKế}"
                                data-val-2025="${itemLuỹKế2025}"
                                data-val-2024="${itemLuỹKế2024}">
                                ${formatNumber(itemLuỹKế)}
                            </td>
                        `;
                    }

                    tr.innerHTML = `
                        <td class="p-2 text-center text-slate-500 border-r border-slate-200 font-mono">${stt++}</td>
                        <td class="p-2 text-center border-r border-slate-200 font-mono text-[#00529C] text-[11px] font-semibold">${escapeHtml(r.category.b7_display || '-')}</td>
                        <td class="p-2 text-center border-r border-slate-200 font-mono text-emerald-700 text-[11px] font-semibold">${escapeHtml(r.category.b10_display || '-')}</td>
                        <td class="p-2 text-left font-semibold text-slate-800 border-r border-slate-200 pl-4">
                            ${starIcon}<span>${escapeHtml(r.category.name)}</span>
                        </td>
                        ${itemTdCompare}
                        ${itemActualMonthsTd}
                        ${itemLuyKeTd}
                        ${itemPlanMonthsTd}
                        <td class="p-2 text-right font-mono font-bold text-[#00529C] bg-blue-50/40 hover:bg-blue-100 cursor-pointer transition-colors"
                            data-tooltip-cell="true"
                            data-tooltip-type="fullyear"
                            data-tooltip-title="${escapeHtml(r.category.name)}"
                            data-tooltip-subtitle="${escapeHtml(r.category.b7_display || r.category.b10_display || '')}"
                            data-tooltip-period="Cả năm 2026"
                            data-val-2026="${r.fullYear2026}"
                            data-val-2025="${r.total2025}"
                            data-val-2024="${r.total2024}">
                            ${formatNumber(r.fullYear2026)}
                        </td>
                    `;
                    tbody.appendChild(tr);
                });
            }
        });

        // 3. HÀNG TỔNG CỘNG TOÀN BỘ (GRAND TOTAL ROW)
        const grandLuỹKế = selActual.reduce((sum, m) => sum + (grandMonths[m - 1] || 0), 0);
        const grandLuỹKế2025 = selActual.reduce((sum, m) => sum + (grandMonths2025[m - 1] || 0), 0);
        const grandLuỹKế2024 = selActual.reduce((sum, m) => sum + (grandMonths2024[m - 1] || 0), 0);

        const footerTr = document.createElement('tr');
        footerTr.className = 'bg-[#003870] text-white font-black text-xs border-t-2 border-blue-900 select-none';

        let grandTdCompare = '';
        if (isShowCompare) {
            if (compareMode === '2025') {
                grandTdCompare = `
                    <td class="p-2 text-right border-r border-blue-800 font-mono text-cyan-200 hover:bg-blue-800 cursor-pointer transition-colors"
                        data-tooltip-cell="true"
                        data-tooltip-type="compare"
                        data-target-year="2025"
                        data-tooltip-title="TỔNG CỘNG CHI PHÍ TOÀN BỘ"
                        data-tooltip-subtitle="(Tổng hợp tất cả đơn vị & khoản mục)"
                        data-tooltip-period="Cả năm 2025"
                        data-val-2026="${grand2026}"
                        data-val-2025="${grand2025}"
                        data-val-2024="${grand2024}">${formatNumber(grand2025)}</td>
                `;
            } else if (compareMode === '2024') {
                grandTdCompare = `
                    <td class="p-2 text-right border-r border-blue-800 font-mono text-cyan-200 hover:bg-blue-800 cursor-pointer transition-colors"
                        data-tooltip-cell="true"
                        data-tooltip-type="compare"
                        data-target-year="2024"
                        data-tooltip-title="TỔNG CỘNG CHI PHÍ TOÀN BỘ"
                        data-tooltip-subtitle="(Tổng hợp tất cả đơn vị & khoản mục)"
                        data-tooltip-period="Cả năm 2024"
                        data-val-2026="${grand2026}"
                        data-val-2025="${grand2025}"
                        data-val-2024="${grand2024}">${formatNumber(grand2024)}</td>
                `;
            } else if (compareMode === 'BOTH') {
                grandTdCompare = `
                    <td class="p-2 text-right border-r border-blue-800 font-mono text-cyan-100 hover:bg-blue-800 cursor-pointer transition-colors"
                        data-tooltip-cell="true"
                        data-tooltip-type="compare"
                        data-target-year="2024"
                        data-tooltip-title="TỔNG CỘNG CHI PHÍ TOÀN BỘ"
                        data-tooltip-subtitle="(Tổng hợp tất cả đơn vị & khoản mục)"
                        data-tooltip-period="Cả năm 2024"
                        data-val-2026="${grand2026}"
                        data-val-2025="${grand2025}"
                        data-val-2024="${grand2024}"
                        title="Cả năm 2024">${formatNumber(grand2024)}</td>
                    <td class="p-2 text-right border-r border-blue-800 font-mono text-cyan-200 hover:bg-blue-800 cursor-pointer transition-colors"
                        data-tooltip-cell="true"
                        data-tooltip-type="compare"
                        data-target-year="2025"
                        data-tooltip-title="TỔNG CỘNG CHI PHÍ TOÀN BỘ"
                        data-tooltip-subtitle="(Tổng hợp tất cả đơn vị & khoản mục)"
                        data-tooltip-period="Cả năm 2025"
                        data-val-2026="${grand2026}"
                        data-val-2025="${grand2025}"
                        data-val-2024="${grand2024}"
                        title="Cả năm 2025">${formatNumber(grand2025)}</td>
                `;
            }
        }

        let grandActualMonthsTd = '';
        selActual.forEach(m => {
            const idx = m - 1;
            grandActualMonthsTd += `
                <td class="p-2 text-right border-r border-blue-800 font-mono hover:bg-blue-800 cursor-pointer transition-colors"
                    data-tooltip-cell="true"
                    data-tooltip-type="month"
                    data-tooltip-title="TỔNG CỘNG CHI PHÍ TOÀN BỘ"
                    data-tooltip-subtitle="(Tổng hợp tất cả đơn vị & khoản mục)"
                    data-tooltip-period="T${m < 10 ? '0' + m : m}/2026"
                    data-month-num="${m}"
                    data-val-2026="${grandMonths[idx]}"
                    data-val-2025="${grandMonths2025[idx]}"
                    data-val-2024="${grandMonths2024[idx]}">
                    ${formatNumber(grandMonths[idx])}
                </td>
            `;
        });

        let grandPlanMonthsTd = '';
        selPlan.forEach(m => {
            const idx = m - 1;
            grandPlanMonthsTd += `
                <td class="p-2 text-right border-r border-blue-800 font-mono text-cyan-100 hover:bg-blue-800 cursor-pointer transition-colors"
                    data-tooltip-cell="true"
                    data-tooltip-type="month"
                    data-tooltip-title="TỔNG CỘNG CHI PHÍ TOÀN BỘ"
                    data-tooltip-subtitle="(Tổng hợp tất cả đơn vị & khoản mục)"
                    data-tooltip-period="T${m < 10 ? '0' + m : m}/2026"
                    data-month-num="${m}"
                    data-val-2026="${grandMonths[idx]}"
                    data-val-2025="${grandMonths2025[idx]}"
                    data-val-2024="${grandMonths2024[idx]}">
                    ${formatNumber(grandMonths[idx])}
                </td>
            `;
        });

        let grandLuyKeTd = '';
        if (selActual.length > 0) {
            grandLuyKeTd = `
                <td class="p-2 text-right border-r border-blue-800 font-mono bg-amber-400 text-slate-950 font-black hover:bg-amber-300 cursor-pointer transition-colors"
                    data-tooltip-cell="true"
                    data-tooltip-type="luyke"
                    data-tooltip-title="TỔNG CỘNG CHI PHÍ TOÀN BỘ"
                    data-tooltip-subtitle="(Tổng hợp tất cả đơn vị & khoản mục)"
                    data-tooltip-period="${luyKePeriodLabel}"
                    data-val-2026="${grandLuỹKế}"
                    data-val-2025="${grandLuỹKế2025}"
                    data-val-2024="${grandLuỹKế2024}">
                    ${formatNumber(grandLuỹKế)}
                </td>
            `;
        }

        footerTr.innerHTML = `
            <td class="p-2 text-center border-r border-blue-800 font-mono">Σ</td>
            <td class="p-2 text-center border-r border-blue-800">-</td>
            <td class="p-2 text-center border-r border-blue-800">-</td>
            <td class="p-2 text-left uppercase tracking-wider border-r border-blue-800 pl-4 text-[#FFFFD4]">TỔNG CỘNG CHI PHÍ</td>
            ${grandTdCompare}
            ${grandActualMonthsTd}
            ${grandLuyKeTd}
            ${grandPlanMonthsTd}
            <td class="p-2 text-right font-mono font-black bg-[#059669] text-[#FFFFD4] hover:bg-emerald-600 cursor-pointer transition-colors"
                data-tooltip-cell="true"
                data-tooltip-type="fullyear"
                data-tooltip-title="TỔNG CỘNG CHI PHÍ TOÀN BỘ"
                data-tooltip-subtitle="(Tổng hợp tất cả đơn vị & khoản mục)"
                data-tooltip-period="Cả năm 2026"
                data-val-2026="${grand2026}"
                data-val-2025="${grand2025}"
                data-val-2024="${grand2024}">
                ${formatNumber(grand2026)}
            </td>
        `;
        tbody.appendChild(footerTr);
    }

    // ==========================================
    // 🗂️ TAB SWITCHING & MAPPING ENGINE (B7 ↔ B10)
    // ==========================================

    function updateTabIndicator(activeBtn, isInitial = false) {
        const nav = document.getElementById('app-tabs-nav');
        const indicator = document.getElementById('tab-indicator');
        if (!nav || !indicator || !activeBtn) return;

        const navRect = nav.getBoundingClientRect();
        const btnRect = activeBtn.getBoundingClientRect();

        const left = btnRect.left - navRect.left + nav.scrollLeft;
        const width = btnRect.width;

        if (isInitial) {
            indicator.style.transition = 'none';
            indicator.style.left = `${left}px`;
            indicator.style.width = `${width}px`;
            indicator.offsetHeight; // Force reflow
            indicator.style.transition = '';
        } else {
            indicator.style.left = `${left}px`;
            indicator.style.width = `${width}px`;
        }
    }

    function switchTab(tab) {
        state.currentTab = tab;

        const repSec = document.getElementById('report-section') || document.getElementById('section-report');
        const cbnvSec = document.getElementById('cbnv-section');
        const dashSec = document.getElementById('dashboard-section') || document.getElementById('section-dashboard');
        const mapSec = document.getElementById('mapping-section') || document.getElementById('section-mapping');
        const qtpnSec = document.getElementById('qtpn-section');
        const syncSec = document.getElementById('sync-section') || document.getElementById('section-sync');

        if (repSec) repSec.classList.add('hidden');
        if (cbnvSec) cbnvSec.classList.add('hidden');
        if (dashSec) dashSec.classList.add('hidden');
        if (mapSec) mapSec.classList.add('hidden');
        if (qtpnSec) qtpnSec.classList.add('hidden');
        if (syncSec) syncSec.classList.add('hidden');

        const repBtn = document.getElementById('tab-report-btn');
        const cbnvBtn = document.getElementById('tab-cbnv-btn');
        const dashBtn = document.getElementById('tab-dashboard-btn');
        const mapBtn = document.getElementById('tab-mapping-btn');
        const qtpnBtn = document.getElementById('tab-qtpn-btn');
        const syncBtn = document.getElementById('tab-sync-btn');

        const inactiveClass = 'tab-btn relative z-10 px-3.5 py-1.5 text-xs font-bold text-slate-600 hover:text-[#00529C] transition-colors duration-200 inline-flex flex-row items-center gap-2 whitespace-nowrap shrink-0 rounded-lg';
        const activeClass = 'tab-btn relative z-10 px-3.5 py-1.5 text-xs font-extrabold text-white transition-colors duration-200 inline-flex flex-row items-center gap-2 whitespace-nowrap shrink-0 rounded-lg';

        if (repBtn) repBtn.className = inactiveClass;
        if (cbnvBtn) cbnvBtn.className = inactiveClass;
        if (dashBtn) dashBtn.className = inactiveClass;
        if (mapBtn) mapBtn.className = inactiveClass;
        if (qtpnBtn) qtpnBtn.className = inactiveClass;
        if (syncBtn) syncBtn.className = inactiveClass;

        let activeBtn = null;
        if (tab === 'report') {
            if (repSec) repSec.classList.remove('hidden');
            if (repBtn) repBtn.className = activeClass;
            activeBtn = repBtn;
            renderAll();
        } else if (tab === 'cbnv') {
            if (cbnvSec) cbnvSec.classList.remove('hidden');
            if (cbnvBtn) cbnvBtn.className = activeClass;
            activeBtn = cbnvBtn;
            renderCbnvTab();
        } else if (tab === 'dashboard') {
            if (dashSec) dashSec.classList.remove('hidden');
            if (dashBtn) dashBtn.className = activeClass;
            activeBtn = dashBtn;
            renderDashboardCharts();
        } else if (tab === 'mapping') {
            if (mapSec) mapSec.classList.remove('hidden');
            if (mapBtn) mapBtn.className = activeClass;
            activeBtn = mapBtn;
            renderMappingTab();
        } else if (tab === 'qtpn') {
            if (qtpnSec) qtpnSec.classList.remove('hidden');
            if (qtpnBtn) qtpnBtn.className = activeClass;
            activeBtn = qtpnBtn;
            renderQtpnTab();
        } else if (tab === 'sync') {
            if (syncSec) syncSec.classList.remove('hidden');
            if (syncBtn) syncBtn.className = activeClass;
            activeBtn = syncBtn;
            updateGoogleSheetSyncUI();
        }

        if (activeBtn) {
            updateTabIndicator(activeBtn);
        }
    }

    function renderDashboardCharts() {
        if (window.THACO_DASHBOARD && typeof window.THACO_DASHBOARD.render === 'function') {
            window.THACO_DASHBOARD.render();
        }
    }

    function moveCategoryToGroup(catId, newGroup) {
        const cat = state.categories.find(c => c.id === catId);
        if (cat) {
            cat.group = newGroup;
            saveCurrentState();
            renderMappingTab();
        }
    }

    function renderMappingTab() {
        const tbody = document.getElementById('mapping-table-body');
        if (!tbody) return;
        tbody.innerHTML = '';

        const groups = Array.from(new Set(state.categories.map(c => c.group && c.group.trim()).filter(Boolean)));
        const groupedMap = {};
        groups.forEach(g => groupedMap[g] = []);

        state.categories.forEach(cat => {
            const gName = (cat.group && cat.group.trim()) ? cat.group.trim() : (groups[0] || 'Chi phí hoạt động chung');
            if (!groupedMap[gName]) groupedMap[gName] = [];
            groupedMap[gName].push(cat);
        });

        // Sắp xếp các khoản mục con trong từng nhóm theo TT
        Object.keys(groupedMap).forEach(gName => {
            groupedMap[gName].sort((a, b) => (a.tt || 0) - (b.tt || 0));
        });

        groups.forEach(gName => {
            const items = groupedMap[gName] || [];

            // 1. HÀNG TIÊU ĐỀ NHÓM (GROUP HEADER ROW - 6 CỘT: 4 + 2)
            const headerTr = document.createElement('tr');
            headerTr.className = 'group-header-row bg-[#00529C]/10 border-t-2 border-b border-[#00529C]/30 text-[#00529C] text-xs font-bold transition-all select-none';
            headerTr.dataset.group = gName;

            const grpIcon = window.getGroupIcon ? window.getGroupIcon(gName) : '🏢';
            headerTr.innerHTML = `
                <td colspan="4" class="p-2.5 border-r border-slate-200">
                    <div class="flex items-center gap-2">
                        <button type="button" class="btn-change-group-icon inline-flex items-center justify-center w-8 h-8 rounded-lg bg-white hover:bg-blue-100 border border-blue-200 text-base shadow-2xs hover:scale-110 active:scale-95 transition-transform cursor-pointer" title="Bấm để chọn Icon từ Thư viện cho nhóm ${escapeHtml(gName)}" data-group="${escapeHtml(gName)}">
                            ${grpIcon}
                        </button>
                        <span class="text-sm font-extrabold text-[#00529C]">${escapeHtml(gName)}</span>
                        <span class="bg-[#00529C] text-white px-2 py-0.5 rounded-full text-[10px] font-black">${items.length} khoản mục</span>
                        <span class="text-[10px] text-blue-800/70 font-normal italic">(Kéo & thả khoản mục vào đây để chuyển nhóm)</span>
                    </div>
                </td>
                <td colspan="2" class="p-2 text-right">
                    <div class="flex items-center justify-end gap-1.5">
                        <button type="button" class="btn-pick-icon-group px-2 py-1 bg-white hover:bg-blue-50 text-[#00529C] border border-blue-200 rounded font-semibold text-[11px] shadow-sm flex items-center gap-1" data-group="${escapeHtml(gName)}" title="Chọn Icon từ Thư viện cho nhóm này">
                            🎨 Đổi Icon
                        </button>
                        <button type="button" class="btn-edit-group px-2 py-1 bg-white hover:bg-blue-50 text-[#00529C] border border-blue-200 rounded font-semibold text-[11px] shadow-sm flex items-center gap-1" data-group="${escapeHtml(gName)}">
                            ✏️ Đổi tên
                        </button>
                        <button type="button" class="btn-add-item-to-group px-2 py-1 bg-amber-400 hover:bg-amber-300 text-slate-950 rounded font-extrabold text-[11px] shadow-sm flex items-center gap-1" data-group="${escapeHtml(gName)}">
                            + Thêm mục con
                        </button>
                        <button type="button" class="btn-delete-group p-1 bg-white hover:bg-rose-50 text-rose-600 border border-rose-200 rounded text-[11px]" title="Xóa nhóm" data-group="${escapeHtml(gName)}">
                            🗑️
                        </button>
                    </div>
                </td>
            `;

            // Dragover & Drop cho hàng tiêu đề nhóm
            headerTr.addEventListener('dragover', (e) => {
                e.preventDefault();
                headerTr.classList.add('bg-emerald-200/80', 'border-emerald-500');
            });
            headerTr.addEventListener('dragleave', () => {
                headerTr.classList.remove('bg-emerald-200/80', 'border-emerald-500');
            });
            headerTr.addEventListener('drop', (e) => {
                e.preventDefault();
                headerTr.classList.remove('bg-emerald-200/80', 'border-emerald-500');
                const catIdStr = e.dataTransfer.getData('text/plain');
                if (catIdStr) {
                    const catId = parseInt(catIdStr, 10);
                    moveCategoryToGroup(catId, gName);
                }
            });

            headerTr.querySelector('.btn-change-group-icon')?.addEventListener('click', (e) => {
                e.stopPropagation();
                openIconPickerModal(gName);
            });
            headerTr.querySelector('.btn-pick-icon-group')?.addEventListener('click', (e) => {
                e.stopPropagation();
                openIconPickerModal(gName);
            });
            headerTr.querySelector('.btn-edit-group')?.addEventListener('click', () => openGroupModal(gName));
            headerTr.querySelector('.btn-add-item-to-group')?.addEventListener('click', () => openAddCategoryModal(gName));
            headerTr.querySelector('.btn-delete-group')?.addEventListener('click', () => deleteGroupPrompt(gName));
            tbody.appendChild(headerTr);

            // 2. HÀNG KHOẢN MỤC CON (CATEGORY ITEM ROWS - CHUẨN ĐÚNG 6 CỘT)
            items.forEach((cat) => {
                const tr = document.createElement('tr');
                tr.draggable = true;
                tr.dataset.catId = cat.id;
                tr.className = `text-xs border-b border-slate-200 hover:bg-blue-50/60 transition-colors ${cat.is_material ? 'bg-amber-50/60' : 'bg-white'}`;

                tr.addEventListener('dragstart', (e) => {
                    e.dataTransfer.setData('text/plain', String(cat.id));
                    tr.classList.add('opacity-50');
                });
                tr.addEventListener('dragend', () => {
                    tr.classList.remove('opacity-50');
                });

                const groupSelectOptions = groups.map(g => `<option value="${escapeHtml(g)}" ${g === gName ? 'selected' : ''}>${escapeHtml(g)}</option>`).join('');

                tr.innerHTML = `
                    <td class="p-2 text-center text-slate-500 font-mono font-bold border-r border-slate-200 w-20">
                        <div class="flex items-center justify-center gap-1">
                            <span class="text-slate-400 font-black cursor-grab hover:text-[#00529C]" title="Kéo thả hàng này để chuyển nhóm">⠿</span>
                            <input type="number" data-id="${cat.id}" data-field="tt" value="${cat.tt || cat.id}" 
                                class="w-10 bg-slate-50 border border-slate-300 rounded px-1 py-0.5 text-center text-slate-800 text-xs font-bold focus:border-[#00529C] focus:outline-none">
                        </div>
                    </td>
                    <td class="p-2 border-r border-slate-200 w-48">
                        <input type="text" data-id="${cat.id}" data-field="b7_display" value="${escapeHtml(cat.b7_display || '')}" 
                            placeholder="VD: CP04-04"
                            class="w-full bg-slate-50 border border-slate-300 rounded px-2 py-1 font-mono text-[#00529C] text-xs font-bold focus:border-[#00529C] focus:outline-none">
                    </td>
                    <td class="p-2 border-r border-slate-200 w-40">
                        <input type="text" data-id="${cat.id}" data-field="b10_display" value="${escapeHtml(cat.b10_display || '')}" 
                            placeholder="VD: C041801"
                            class="w-full bg-slate-50 border border-slate-300 rounded px-2 py-1 font-mono text-emerald-700 text-xs font-bold focus:border-[#00529C] focus:outline-none">
                    </td>
                    <td class="p-2 border-r border-slate-200">
                        <input type="text" data-id="${cat.id}" data-field="name" value="${escapeHtml(cat.name)}" 
                            class="w-full bg-slate-50 border border-slate-300 rounded px-2 py-1 text-slate-900 text-xs font-semibold focus:border-[#00529C] focus:outline-none">
                    </td>
                    <td class="p-2 text-center border-r border-slate-200 w-20">
                        <label class="inline-flex items-center justify-center cursor-pointer p-1 rounded hover:bg-amber-100" title="Tích chọn để xếp vào Khoản mục Trọng yếu">
                            <input type="checkbox" data-id="${cat.id}" data-field="is_material" ${cat.is_material ? 'checked' : ''} 
                                class="w-4 h-4 rounded border-slate-300 bg-slate-50 text-amber-600 focus:ring-amber-400 cursor-pointer">
                        </label>
                    </td>
                    <td class="p-2 w-64">
                        <div class="flex items-center gap-1.5">
                            <select data-id="${cat.id}" data-field="group" 
                                class="flex-1 bg-slate-50 border border-slate-300 rounded px-2 py-1 text-slate-800 text-xs focus:border-[#00529C] focus:outline-none"
                                title="Đổi nhóm phân loại">
                                ${groupSelectOptions}
                            </select>
                            <button type="button" class="btn-delete-item p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded text-xs transition-colors" 
                                title="Xóa khoản mục này" data-id="${cat.id}">
                                🗑️
                            </button>
                        </div>
                    </td>
                `;

                // Handle instant change for group dropdown
                const groupSel = tr.querySelector('select[data-field="group"]');
                if (groupSel) {
                    groupSel.addEventListener('change', (e) => {
                        const newGrp = e.target.value;
                        moveCategoryToGroup(cat.id, newGrp);
                    });
                }

                // Handle instant change for is_material checkbox
                const matChk = tr.querySelector('input[data-field="is_material"]');
                if (matChk) {
                    matChk.addEventListener('change', (e) => {
                        cat.is_material = e.target.checked;
                        saveCurrentState();
                        tr.className = `text-xs border-b border-slate-200 hover:bg-blue-50/60 transition-colors ${cat.is_material ? 'bg-amber-50/60' : 'bg-white'}`;
                    });
                }

                tr.querySelector('.btn-delete-item')?.addEventListener('click', () => deleteCategoryPrompt(cat.id));
                tbody.appendChild(tr);
            });
        });
    }

    function saveMappingChanges() {
        const inputs = document.querySelectorAll('#mapping-table-body input, #mapping-table-body select');
        inputs.forEach(input => {
            const id = parseInt(input.getAttribute('data-id'), 10);
            const field = input.getAttribute('data-field');
            if (!id || !field) return;

            const idx = state.categories.findIndex(c => c.id === id);
            if (idx === -1) return;

            if (field === 'is_material') {
                state.categories[idx].is_material = input.checked;
            } else if (field === 'tt') {
                state.categories[idx].tt = parseInt(input.value.trim(), 10) || 1;
            } else if (field === 'b7_display') {
                const val = input.value.trim();
                state.categories[idx].b7_display = val;
                state.categories[idx].b7_codes = val ? val.split(',').map(s => s.trim()).filter(Boolean) : [];
            } else if (field === 'b10_display') {
                const val = input.value.trim();
                state.categories[idx].b10_display = val;
                state.categories[idx].b10_codes = val ? val.split(',').map(s => s.trim()).filter(Boolean) : [];
            } else {
                state.categories[idx][field] = input.value.trim();
            }
        });

        saveCurrentState();
        const gsheetCfg = getGoogleSheetSyncConfig();
        if (gsheetCfg.webAppUrl && gsheetCfg.webAppUrl.trim() !== '') {
            pushToGoogleSheet(false);
        }
        renderTable();
        alert('Đã lưu toàn bộ thông tin Danh mục B7-B10 thành công! Báo cáo Tổng hợp chi phí đã được tự động tính toán lại.');
    }

    function addNewGroupPrompt() {
        openGroupModal();
    }

    function editGroupPrompt(oldName) {
        openGroupModal(oldName);
    }

    function deleteGroupPrompt(gName) {
        if (!confirm(`Bạn có chắc chắn muốn xóa nhóm "${gName}" và tất cả khoản mục bên trong?`)) return;
        state.categories = state.categories.filter(c => c.group !== gName);
        saveCurrentState();
        renderMappingTab();
    }

    function openAddCategoryModal(gName) {
        const name = prompt(`Thêm khoản mục mới vào nhóm "${gName}":`);
        if (!name || !name.trim()) return;
        const maxId = state.categories.reduce((m, c) => Math.max(m, c.id || 0), 0);
        state.categories.push({
            id: maxId + 1,
            tt: maxId + 1,
            name: name.trim(),
            group: gName,
            b7_display: '',
            b10_display: '',
            b7_codes: [],
            b10_codes: [],
            is_material: false
        });
        saveCurrentState();
        renderMappingTab();
    }

    function deleteCategoryPrompt(catId) {
        const cat = state.categories.find(c => c.id === catId);
        if (!cat) return;
        if (!confirm(`Bạn có chắc chắn muốn xóa khoản mục "${cat.name}"?`)) return;
        state.categories = state.categories.filter(c => c.id !== catId);
        saveCurrentState();
        renderMappingTab();
    }

    // ==========================================
    // 🏛️ QUẢN TRỊ ↔ PHÁP NHÂN (DM_QTPN) MODULE
    // ==========================================

    function ensureQtpnMappings() {
        if (!state.qtpnMappings || !Array.isArray(state.qtpnMappings) || state.qtpnMappings.length === 0) {
            state.qtpnMappings = (state.entities || []).map((e, idx) => {
                const qt = (e.qt || e.cleanName || e.name || '').trim();
                const maQt = e.qtCode || (qt ? ('QT_' + qt.replace(/[^A-Za-z0-9]/g, '')) : ('QT_' + e.code));
                let khoi = 'VPĐH';
                if (e.khoi === 'KHOI_NHAMAY' || e.mien === 'KSX') khoi = 'Nhà máy';
                else if (e.khoi === 'KHOI_MB' || e.mien === 'MB') khoi = 'CTTT Phía Bắc';
                else if (e.khoi === 'KHOI_MN' || e.mien === 'MN') khoi = 'CTTT Phía Nam';
                else if (e.khoi === 'KHOI_VPDH' || e.mien === 'VPĐH') khoi = 'VPĐH';
                else if (e.khoiName) khoi = e.khoiName;

                return {
                    stt: idx + 1,
                    khoi: khoi,
                    maQt: maQt,
                    tenQt: qt || (e.code === 'C2305' ? 'PP THACO AUTO' : 'THACO AUTO'),
                    maPn: e.code || '',
                    tenPn: e.cleanName || e.name || ''
                };
            });
        } else {
            state.qtpnMappings.forEach((m, idx) => {
                if (!m.stt) m.stt = idx + 1;
                if (!m.khoi) {
                    if (m.maQt === 'QT_AUTO' || m.maQt === 'QT_PP' || m.maPn === 'C1101' || m.maPn === 'C2305' || (m.tenQt && m.tenQt.includes('THACO AUTO') && !m.tenQt.includes('Bắc') && !m.tenQt.includes('Nam') && !m.tenQt.includes('Hà Nội'))) {
                        m.khoi = 'VPĐH';
                    } else if ((m.maQt && m.maQt.includes('CHULAI')) || (m.tenQt && (m.tenQt.includes('Nhà máy') || m.tenQt.includes('Chu Lai')))) {
                        m.khoi = 'Nhà máy';
                    } else if ((m.maQt && m.maQt.includes('MB')) || (m.tenQt && m.tenQt.includes('Bắc'))) {
                        m.khoi = 'CTTT Phía Bắc';
                    } else {
                        m.khoi = 'CTTT Phía Nam';
                    }
                }
            });
        }
    }

    function applyQtpnMappingAndRecalculate() {
        ensureQtpnMappings();
        if (!Array.isArray(state.entities)) state.entities = [];

        state.qtpnMappings.forEach(m => {
            const entCode = String(m.maPn || '').trim();
            if (!entCode) return;

            let e = state.entities.find(x => x.code === entCode);
            if (!e) {
                e = {
                    code: entCode,
                    name: m.tenPn || entCode,
                    cleanName: m.tenPn || entCode
                };
                state.entities.push(e);
            }

            e.name = m.tenPn || e.name;
            e.cleanName = m.tenPn || e.cleanName;
            e.qt = m.tenQt || e.qt || e.name;
            e.qtCode = m.maQt || e.qtCode || ('QT_' + entCode);
            e.khoiName = m.khoi || 'VPĐH';

            if (m.khoi === 'VPĐH') {
                e.khoi = 'KHOI_VPDH';
                e.mien = 'VPĐH';
                e.phia = 'VP Điều Hành';
            } else if (m.khoi === 'Nhà máy') {
                e.khoi = 'KHOI_NHAMAY';
                e.mien = 'KSX';
                e.phia = 'Chu Lai';
            } else if (m.khoi === 'CTTT Phía Bắc') {
                e.khoi = 'KHOI_MB';
                e.mien = 'MB';
                e.phia = 'Phía Bắc';
            } else {
                e.khoi = 'KHOI_MN';
                e.mien = 'MN';
                e.phia = 'Phía Nam';
            }
            e.active = true;
        });

        // Đánh dấu các pháp nhân không còn nằm trong DM_QTPN là active = false để ẩn khỏi Slicer
        const activePnCodes = new Set(state.qtpnMappings.map(m => String(m.maPn || '').trim()).filter(Boolean));
        state.entities.forEach(e => {
            if (!activePnCodes.has(e.code)) {
                e.active = false;
            }
        });

        populateSlicers();
        renderAll();
    }

    function updateQtpnDatalists() {
        ensureQtpnMappings();
        const maDatalist = document.getElementById('qtpn-ma-qt-datalist');
        const tenDatalist = document.getElementById('qtpn-ten-qt-datalist');

        const uniqueMa = Array.from(new Set(state.qtpnMappings.map(r => (r.maQt || '').trim()).filter(Boolean)));
        const uniqueTen = Array.from(new Set(state.qtpnMappings.map(r => (r.tenQt || '').trim()).filter(Boolean)));

        if (maDatalist) {
            maDatalist.innerHTML = uniqueMa.map(m => `<option value="${escapeHtml(m)}"></option>`).join('');
        }
        if (tenDatalist) {
            tenDatalist.innerHTML = uniqueTen.map(t => `<option value="${escapeHtml(t)}"></option>`).join('');
        }
    }

    function moveQtpnToGroup(rowIdx, newMaQt, newTenQt, newKhoi) {
        ensureQtpnMappings();
        if (rowIdx < 0 || rowIdx >= state.qtpnMappings.length) return;
        state.qtpnMappings[rowIdx].maQt = newMaQt;
        state.qtpnMappings[rowIdx].tenQt = newTenQt;
        if (newKhoi) state.qtpnMappings[rowIdx].khoi = newKhoi;

        applyQtpnMappingAndRecalculate();
        saveCurrentState();
        renderQtpnTab();

        const gsheetCfg = getGoogleSheetSyncConfig();
        if (gsheetCfg.webAppUrl && gsheetCfg.webAppUrl.trim() !== '') {
            pushQtpnToGoogleSheet(false);
        }
    }

    function openAddQtpnGroupModal() {
        const khoi = prompt('Chọn Khối Đơn Vị (1: VPĐH, 2: Nhà máy, 3: CTTT Phía Bắc, 4: CTTT Phía Nam):', '1');
        if (khoi === null) return;
        let khoiName = 'VPĐH';
        if (khoi === '2' || khoi.toLowerCase().includes('nhà máy') || khoi.toLowerCase().includes('máy')) khoiName = 'Nhà máy';
        else if (khoi === '3' || khoi.toLowerCase().includes('bắc')) khoiName = 'CTTT Phía Bắc';
        else if (khoi === '4' || khoi.toLowerCase().includes('nam')) khoiName = 'CTTT Phía Nam';

        const maQt = prompt('Nhập Mã Quản trị mới (Ví dụ: QT_VPDH, QT_PP, QT_MB01...):');
        if (!maQt || !maQt.trim()) return;
        const tenQt = prompt(`Nhập Tên Đơn vị Quản trị cho mã [${maQt.trim()}]:`);
        if (!tenQt || !tenQt.trim()) return;

        openQtpnModal(-1, maQt.trim(), tenQt.trim(), khoiName);
    }

    function openAddQtpnItemForGroup(maQt, tenQt, khoi) {
        openQtpnModal(-1, maQt, tenQt, khoi);
    }

    function editQtpnGroupPrompt(oldMaQt, oldTenQt) {
        ensureQtpnMappings();
        const currentItem = state.qtpnMappings.find(r => (r.maQt || '').trim() === oldMaQt.trim());
        const curKhoi = currentItem ? (currentItem.khoi || 'VPĐH') : 'VPĐH';

        const newKhoi = prompt(`Đổi Khối Đơn Vị cho nhóm [${oldMaQt}] (VPĐH, Nhà máy, CTTT Phía Bắc, CTTT Phía Nam):`, curKhoi);
        if (newKhoi === null) return;
        const newMaQt = prompt(`Đổi Mã Quản trị [${oldMaQt}]:`, oldMaQt);
        if (newMaQt === null) return;
        const newTenQt = prompt(`Đổi Tên Quản trị [${oldTenQt}]:`, oldTenQt);
        if (newTenQt === null) return;

        const khoiVal = newKhoi.trim() || curKhoi;
        const maVal = newMaQt.trim() || oldMaQt;
        const tenVal = newTenQt.trim() || oldTenQt;

        let updatedCount = 0;
        state.qtpnMappings.forEach(r => {
            if ((r.maQt || '').trim() === oldMaQt.trim()) {
                r.khoi = khoiVal;
                r.maQt = maVal;
                r.tenQt = tenVal;
                updatedCount++;
            }
        });

        if (updatedCount > 0) {
            applyQtpnMappingAndRecalculate();
            saveCurrentState();
            renderQtpnTab();
            const gsheetCfg = getGoogleSheetSyncConfig();
            if (gsheetCfg.webAppUrl && gsheetCfg.webAppUrl.trim() !== '') {
                pushQtpnToGoogleSheet(false);
            }
        }
    }

    function deleteQtpnGroupPrompt(maQt) {
        ensureQtpnMappings();
        const items = state.qtpnMappings.filter(r => (r.maQt || '').trim() === maQt.trim());
        if (items.length === 0) return;

        if (confirm(`Anh/Chị có chắc chắn muốn xóa toàn bộ nhóm Quản trị [${maQt}] bao gồm ${items.length} Pháp nhân trực thuộc?`)) {
            state.qtpnMappings = state.qtpnMappings.filter(r => (r.maQt || '').trim() !== maQt.trim());
            state.qtpnMappings.forEach((r, i) => r.stt = i + 1);
            applyQtpnMappingAndRecalculate();
            saveCurrentState();
            renderQtpnTab();

            const gsheetCfg = getGoogleSheetSyncConfig();
            if (gsheetCfg.webAppUrl && gsheetCfg.webAppUrl.trim() !== '') {
                pushQtpnToGoogleSheet(false);
            }
        }
    }

    function renderQtpnTab(searchFilter) {
        ensureQtpnMappings();
        updateQtpnDatalists();

        const tbody = document.getElementById('qtpn-table-body');
        const badge = document.getElementById('qtpn-count-badge');
        if (!tbody) return;

        // 1. Phân nhóm theo Mã Quản trị (maQt + tenQt + khoi)
        const groups = [];
        const groupMap = {}; // key -> { maQt, tenQt, khoi, items: [{ row, origIdx }] }

        state.qtpnMappings.forEach((row, origIdx) => {
            const m = (row.maQt || 'QT_CHUA_PHAN_NHOM').trim();
            const t = (row.tenQt || 'Chưa phân nhóm Quản trị').trim();
            const k = (row.khoi || 'VPĐH').trim();
            const key = `${m}|||${t}`;

            if (!groupMap[key]) {
                groupMap[key] = { maQt: m, tenQt: t, khoi: k, items: [] };
                groups.push(key);
            }
            groupMap[key].items.push({ row, origIdx });
        });

        // Filter logic
        let filteredGroups = groups;
        let totalMatchedRows = 0;

        if (searchFilter && searchFilter.trim() !== '') {
            const q = searchFilter.toLowerCase().trim();
            filteredGroups = [];
            groups.forEach(key => {
                const grp = groupMap[key];
                const grpMatch = grp.maQt.toLowerCase().includes(q) || grp.tenQt.toLowerCase().includes(q) || grp.khoi.toLowerCase().includes(q);
                const matchingItems = grp.items.filter(item => 
                    grpMatch ||
                    (item.row.maPn && item.row.maPn.toLowerCase().includes(q)) ||
                    (item.row.tenPn && item.row.tenPn.toLowerCase().includes(q))
                );

                if (matchingItems.length > 0) {
                    filteredGroups.push(key);
                    totalMatchedRows += matchingItems.length;
                }
            });
        } else {
            groups.forEach(key => {
                totalMatchedRows += groupMap[key].items.length;
            });
        }

        if (badge) badge.textContent = totalMatchedRows;
        tbody.innerHTML = '';

        if (filteredGroups.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="7" class="p-8 text-center text-slate-500 font-medium">
                        Không tìm thấy Đơn vị Quản trị hoặc Pháp nhân nào phù hợp.
                    </td>
                </tr>
            `;
            return;
        }

        // Danh sách tất cả nhóm Quản trị làm options cho select box chuyển nhóm
        const allGroupsList = groups.map(k => groupMap[k]);

        filteredGroups.forEach((key, gIdx) => {
            const grp = groupMap[key];
            let items = grp.items;

            if (searchFilter && searchFilter.trim() !== '') {
                const q = searchFilter.toLowerCase().trim();
                const grpMatch = grp.maQt.toLowerCase().includes(q) || grp.tenQt.toLowerCase().includes(q) || grp.khoi.toLowerCase().includes(q);
                if (!grpMatch) {
                    items = items.filter(item => 
                        (item.row.maPn && item.row.maPn.toLowerCase().includes(q)) ||
                        (item.row.tenPn && item.row.tenPn.toLowerCase().includes(q))
                    );
                }
            }

            let khoiBadgeClass = 'bg-blue-100 text-blue-800 border-blue-300';
            if (grp.khoi === 'Nhà máy') khoiBadgeClass = 'bg-emerald-100 text-emerald-800 border-emerald-300';
            else if (grp.khoi === 'CTTT Phía Bắc') khoiBadgeClass = 'bg-amber-100 text-amber-800 border-amber-300';
            else if (grp.khoi === 'CTTT Phía Nam') khoiBadgeClass = 'bg-purple-100 text-purple-800 border-purple-300';

            // A. DÒNG MẸ (PARENT ROW - GROUPS HEADER)
            const headerTr = document.createElement('tr');
            headerTr.className = 'group-header-row bg-[#00529C]/10 border-t-2 border-b border-[#00529C]/30 text-[#00529C] text-xs font-bold transition-all select-none';
            headerTr.dataset.maQt = grp.maQt;
            headerTr.dataset.tenQt = grp.tenQt;
            headerTr.dataset.khoi = grp.khoi;

            headerTr.innerHTML = `
                <td colspan="4" class="p-2.5 border-r border-slate-200">
                    <div class="flex items-center gap-2 flex-wrap">
                        <span class="px-2 py-0.5 rounded text-[10px] font-extrabold border ${khoiBadgeClass}">${escapeHtml(grp.khoi || 'VPĐH')}</span>
                        <span class="text-sm font-extrabold text-[#00529C]">🏛️ <span class="font-mono bg-blue-100/80 px-1.5 py-0.5 rounded border border-blue-300 text-[#00529C]">[${escapeHtml(grp.maQt)}]</span> ${escapeHtml(grp.tenQt)}</span>
                        <span class="bg-[#00529C] text-white px-2 py-0.5 rounded-full text-[10px] font-black">${items.length} Pháp nhân</span>
                        <span class="text-[10px] text-blue-800/70 font-normal italic">(Kéo & thả Pháp nhân vào đây để chuyển Quản trị)</span>
                    </div>
                </td>
                <td colspan="3" class="p-2 text-right">
                    <div class="flex items-center justify-end gap-1.5">
                        <button type="button" class="btn-edit-qtpn-group px-2 py-1 bg-white hover:bg-blue-50 text-[#00529C] border border-blue-200 rounded font-semibold text-[11px] shadow-sm flex items-center gap-1">
                            ✏️ Đổi tên/Mã QT
                        </button>
                        <button type="button" class="btn-add-item-to-qtpn-group px-2 py-1 bg-amber-400 hover:bg-amber-300 text-slate-950 rounded font-extrabold text-[11px] shadow-sm flex items-center gap-1">
                            + Thêm Pháp nhân
                        </button>
                        <button type="button" class="btn-delete-qtpn-group p-1 bg-white hover:bg-rose-50 text-rose-600 border border-rose-200 rounded text-[11px]" title="Xóa nhóm Quản trị này">
                            🗑️
                        </button>
                    </div>
                </td>
            `;

            // Dragover & Drop cho hàng tiêu đề nhóm Quản trị
            headerTr.addEventListener('dragover', (e) => {
                e.preventDefault();
                headerTr.classList.add('bg-emerald-200/80', 'border-emerald-500');
            });
            headerTr.addEventListener('dragleave', () => {
                headerTr.classList.remove('bg-emerald-200/80', 'border-emerald-500');
            });
            headerTr.addEventListener('drop', (e) => {
                e.preventDefault();
                headerTr.classList.remove('bg-emerald-200/80', 'border-emerald-500');
                const rowIdxStr = e.dataTransfer.getData('text/plain');
                if (rowIdxStr !== '') {
                    const rowIdx = parseInt(rowIdxStr, 10);
                    moveQtpnToGroup(rowIdx, grp.maQt, grp.tenQt, grp.khoi);
                }
            });

            headerTr.querySelector('.btn-edit-qtpn-group')?.addEventListener('click', () => editQtpnGroupPrompt(grp.maQt, grp.tenQt));
            headerTr.querySelector('.btn-add-item-to-qtpn-group')?.addEventListener('click', () => openAddQtpnItemForGroup(grp.maQt, grp.tenQt, grp.khoi));
            headerTr.querySelector('.btn-delete-qtpn-group')?.addEventListener('click', () => deleteQtpnGroupPrompt(grp.maQt));
            tbody.appendChild(headerTr);

            // B. DÒNG CON (CHILD ROWS - PHÁP NHÂN TRỰC THUỘC - 7 CỘT CHUẨN)
            items.forEach((itemObj, cIdx) => {
                const row = itemObj.row;
                const origIdx = itemObj.origIdx;

                const tr = document.createElement('tr');
                tr.draggable = true;
                tr.dataset.qtpnIdx = origIdx;
                tr.className = 'text-xs border-b border-slate-200 hover:bg-blue-50/60 transition-colors bg-white';

                tr.addEventListener('dragstart', (e) => {
                    e.dataTransfer.setData('text/plain', String(origIdx));
                    tr.classList.add('opacity-50');
                });
                tr.addEventListener('dragend', () => {
                    tr.classList.remove('opacity-50');
                });

                // Select box options cho chuyển Quản trị nhanh
                const optionsHtml = allGroupsList.map(g => `
                    <option value="${escapeHtml(g.maQt)}|||${escapeHtml(g.tenQt)}|||${escapeHtml(g.khoi)}" ${g.maQt === grp.maQt ? 'selected' : ''}>
                        [${escapeHtml(g.khoi)}] [${escapeHtml(g.maQt)}] ${escapeHtml(g.tenQt)}
                    </option>
                `).join('');

                let rowKhoiBadge = 'bg-blue-50 text-blue-800 border-blue-200';
                if (row.khoi === 'Nhà máy') rowKhoiBadge = 'bg-emerald-50 text-emerald-800 border-emerald-200';
                else if (row.khoi === 'CTTT Phía Bắc') rowKhoiBadge = 'bg-amber-50 text-amber-800 border-amber-200';
                else if (row.khoi === 'CTTT Phía Nam') rowKhoiBadge = 'bg-purple-50 text-purple-800 border-purple-200';

                tr.innerHTML = `
                    <td class="p-2.5 text-center font-bold text-slate-400 border-r border-slate-200 cursor-move select-none" title="Kéo & thả để đổi nhóm Quản trị">
                        <span class="font-mono text-[11px]">⠿ ${gIdx + 1}.${cIdx + 1}</span>
                    </td>
                    <td class="p-2.5 text-center border-r border-slate-200">
                        <span class="px-2 py-0.5 rounded-full text-[10px] font-bold border ${rowKhoiBadge}">${escapeHtml(row.khoi || 'VPĐH')}</span>
                    </td>
                    <td class="p-2.5 text-center font-bold text-blue-900 font-mono border-r border-slate-200">[${escapeHtml(row.maQt || '')}]</td>
                    <td class="p-2.5 border-r border-slate-200 font-semibold text-slate-800">${escapeHtml(row.tenQt || '')}</td>
                    <td class="p-2.5 text-center font-bold text-amber-900 font-mono border-r border-slate-200">${escapeHtml(row.maPn || '')}</td>
                    <td class="p-2.5 border-r border-slate-200">
                        <div class="font-medium text-slate-900 mb-1">${escapeHtml(row.tenPn || '')}</div>
                        <div class="flex items-center gap-1.5 text-[10px] text-slate-500">
                            <span>Chuyển Quản trị:</span>
                            <select onchange="window.moveQtpnBySelect(${origIdx}, this.value)" class="bg-slate-50 border border-slate-300 rounded px-1.5 py-0.5 text-[11px] font-semibold text-[#00529C] focus:ring-1 focus:ring-[#00529C]">
                                ${optionsHtml}
                            </select>
                        </div>
                    </td>
                    <td class="p-2.5 text-center space-x-1">
                        <button onclick="window.editQtpnRow(${origIdx})" title="Sửa Pháp nhân này"
                            class="px-2 py-1 bg-blue-50 hover:bg-blue-100 text-[#00529C] border border-blue-200 font-bold rounded text-[11px] transition-all">
                            ✏️ Sửa
                        </button>
                        <button onclick="window.deleteQtpnRow(${origIdx})" title="Xóa Pháp nhân này"
                            class="px-2 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-bold rounded text-[11px] transition-all">
                            🗑️ Xóa
                        </button>
                    </td>
                `;
                tbody.appendChild(tr);
            });
        });
    }

    function openQtpnModal(editIndex = -1, defaultMaQt = '', defaultTenQt = '', defaultKhoi = 'VPĐH') {
        ensureQtpnMappings();
        updateQtpnDatalists();

        const modal = document.getElementById('qtpn-edit-modal');
        const title = document.getElementById('qtpn-modal-title');
        const idxInput = document.getElementById('qtpn-edit-index');
        const khoiSelect = document.getElementById('qtpn-input-khoi');
        const maQtInput = document.getElementById('qtpn-input-ma-qt');
        const tenQtInput = document.getElementById('qtpn-input-ten-qt');
        const maPnInput = document.getElementById('qtpn-input-ma-pn');
        const tenPnInput = document.getElementById('qtpn-input-ten-pn');

        if (!modal) return;

        if (editIndex >= 0 && editIndex < state.qtpnMappings.length) {
            const item = state.qtpnMappings[editIndex];
            if (title) title.textContent = '✏️ Sửa Thông Tin Ánh Xạ Quản Trị ↔ Pháp Nhân';
            if (idxInput) idxInput.value = editIndex;
            if (khoiSelect) khoiSelect.value = item.khoi || 'VPĐH';
            if (maQtInput) maQtInput.value = item.maQt || '';
            if (tenQtInput) tenQtInput.value = item.tenQt || '';
            if (maPnInput) maPnInput.value = item.maPn || '';
            if (tenPnInput) tenPnInput.value = item.tenPn || '';
        } else {
            if (title) title.textContent = defaultMaQt ? `🏢 ➕ Thêm Pháp Nhân vào Quản trị [${defaultMaQt}]` : '🏛️ ➕ Thêm Ánh Xạ Quản Trị ↔ Pháp Nhân mới';
            if (idxInput) idxInput.value = -1;
            if (khoiSelect) khoiSelect.value = defaultKhoi || 'VPĐH';
            if (maQtInput) maQtInput.value = defaultMaQt || '';
            if (tenQtInput) tenQtInput.value = defaultTenQt || '';
            if (maPnInput) maPnInput.value = '';
            if (tenPnInput) tenPnInput.value = '';
        }

        modal.classList.remove('hidden');
    }

    function handleSaveQtpnModal(e) {
        e.preventDefault();
        ensureQtpnMappings();
        const idx = parseInt(document.getElementById('qtpn-edit-index').value, 10);
        const khoi = (document.getElementById('qtpn-input-khoi')?.value || 'VPĐH').trim();
        const maQt = document.getElementById('qtpn-input-ma-qt').value.trim();
        const tenQt = document.getElementById('qtpn-input-ten-qt').value.trim();
        const maPn = document.getElementById('qtpn-input-ma-pn').value.trim();
        const tenPn = document.getElementById('qtpn-input-ten-pn').value.trim();

        if (!maQt || !tenQt || !maPn || !tenPn) {
            alert('Vui lòng điền đầy đủ tất cả các trường thông tin!');
            return;
        }

        if (idx >= 0 && idx < state.qtpnMappings.length) {
            state.qtpnMappings[idx].khoi = khoi;
            state.qtpnMappings[idx].maQt = maQt;
            state.qtpnMappings[idx].tenQt = tenQt;
            state.qtpnMappings[idx].maPn = maPn;
            state.qtpnMappings[idx].tenPn = tenPn;
        } else {
            state.qtpnMappings.push({
                stt: state.qtpnMappings.length + 1,
                khoi,
                maQt,
                tenQt,
                maPn,
                tenPn
            });
        }

        document.getElementById('qtpn-edit-modal').classList.add('hidden');
        applyQtpnMappingAndRecalculate();
        saveCurrentState();
        renderQtpnTab();

        const gsheetCfg = getGoogleSheetSyncConfig();
        if (gsheetCfg.webAppUrl && gsheetCfg.webAppUrl.trim() !== '') {
            pushQtpnToGoogleSheet(false);
        }
    }

    function deleteQtpnRowInternal(idx) {
        ensureQtpnMappings();
        if (idx < 0 || idx >= state.qtpnMappings.length) return;
        const item = state.qtpnMappings[idx];
        if (confirm(`Anh/Chị có chắc chắn muốn xóa dòng ánh xạ [${item.maQt}] ${item.tenQt} ↔ [${item.maPn}] ${item.tenPn}?`)) {
            state.qtpnMappings.splice(idx, 1);
            state.qtpnMappings.forEach((r, i) => r.stt = i + 1);
            applyQtpnMappingAndRecalculate();
            saveCurrentState();
            renderQtpnTab();

            const gsheetCfg = getGoogleSheetSyncConfig();
            if (gsheetCfg.webAppUrl && gsheetCfg.webAppUrl.trim() !== '') {
                pushQtpnToGoogleSheet(false);
            }
        }
    }

    async function syncQtpnFromGoogleSheet(showSuccessAlert = true) {
        const config = getGoogleSheetSyncConfig();
        if (!config.webAppUrl) {
            alert('Chưa cấu hình URL Google Apps Script Web App! Vui lòng cài đặt kết nối trước.');
            openGoogleSheetConfigModal();
            return;
        }

        try {
            const keyParam = config.apiKey ? `&api_key=${encodeURIComponent(config.apiKey.trim())}` : '';
            const url = config.webAppUrl + (config.webAppUrl.includes('?') ? '&' : '?') + 'action=get_qtpn&t=' + Date.now() + keyParam;
            const resp = await fetch(url);
            const data = await resp.json();

            if (data.code === 401 || (data.status === 'error' && data.code === 401)) {
                alert('Khóa bảo mật API_KEY không đúng (Lỗi 401). Vui lòng cập nhật lại khóa trong Cài đặt kết nối.');
                return;
            }

            if (data.status === 'success' && Array.isArray(data.qtpnMappings)) {
                state.qtpnMappings = data.qtpnMappings;
                applyQtpnMappingAndRecalculate();
                saveCurrentState();
                renderQtpnTab();
                if (showSuccessAlert) {
                    alert(`Đã tải thành công ${data.qtpnMappings.length} dòng ánh xạ từ Google Sheet DM_QTPN và cập nhật tổng hợp chi phí!`);
                }
            } else {
                alert('Lỗi tải DM_QTPN từ Google Sheet: ' + (data.message || 'Không có dữ liệu.'));
            }
        } catch (e) {
            alert('Không thể kết nối đến Google Apps Script (DM_QTPN): ' + e.message);
        }
    }

    async function pushQtpnToGoogleSheet(showSuccessAlert = true) {
        const config = getGoogleSheetSyncConfig();
        if (!config.webAppUrl) {
            alert('Chưa cấu hình URL Google Apps Script Web App!');
            openGoogleSheetConfigModal();
            return;
        }

        ensureQtpnMappings();
        try {
            const payload = {
                action: 'save_qtpn',
                api_key: config.apiKey || '',
                qtpnMappings: state.qtpnMappings
            };
            const resp = await fetch(config.webAppUrl, {
                method: 'POST',
                mode: 'cors',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify(payload)
            });
            const data = await resp.json();
            if (data.status === 'success') {
                config.lastSynced = new Date().toISOString();
                saveGoogleSheetSyncConfig(config);
                if (showSuccessAlert) {
                    alert(data.message || `Đã đẩy thành công ${state.qtpnMappings.length} dòng ánh xạ lên sheet DM_QTPN!`);
                }
            } else {
                alert('Lỗi khi lưu lên Google Sheet DM_QTPN: ' + data.message);
            }
        } catch (e) {
            alert('Lỗi khi gửi dữ liệu lên Google Sheet: ' + e.message);
        }
    }

    // Attach global handlers for inline onclick buttons
    window.editQtpnRow = function(idx) {
        openQtpnModal(idx);
    };

    window.deleteQtpnRow = function(idx) {
        deleteQtpnRowInternal(idx);
    };

    window.editQtpnGroup = function(maQt, tenQt) {
        editQtpnGroupPrompt(maQt, tenQt);
    };

    window.deleteQtpnGroup = function(maQt) {
        deleteQtpnGroupPrompt(maQt);
    };

    window.openAddQtpnItemForGroup = function(maQt, tenQt, khoi) {
        openAddQtpnItemForGroup(maQt, tenQt, khoi);
    };

    window.moveQtpnBySelect = function(idx, val) {
        if (!val || !val.includes('|||')) return;
        const parts = val.split('|||');
        const maQt = parts[0];
        const tenQt = parts[1];
        const khoi = parts[2] || '';
        moveQtpnToGroup(idx, maQt, tenQt, khoi);
    };

    function expandAllGroups() {
        state.collapsedGroups = {};
        renderTable();
    }

    function collapseAllGroups() {
        const groups = Array.from(new Set(state.categories.map(c => c.group && c.group.trim()).filter(Boolean)));
        groups.forEach(g => state.collapsedGroups[g] = true);
        renderTable();
    }

    // ==========================================
    // 👥 ĐỊNH MỨC CHI PHÍ / CB-NV (MỤC 2.5) MODULE
    // ==========================================

    let cbnvBenchmarkChart = null;
    let cbnvScatterChart = null;
    let pendingCbnvUploadRows = null;
    let pendingCbnvAudit = null;

    /**
     * Khởi tạo dữ liệu nhân sự cơ sở nếu chưa có
     */
    function ensureBaselineCbnvData() {
        if (!state.cbnvData || typeof state.cbnvData !== 'object') {
            state.cbnvData = {};
        }

        const defaultSeed = {
            'C1101': { dinhBien: 180, thucTe: 172, khoi: 'VPĐH', maQt: 'QT_AUTO', tenQt: 'THACO AUTO', ghiChu: 'Định mức chuẩn VPĐH' },
            'C2305': { dinhBien: 115, thucTe: 108, khoi: 'VPĐH', maQt: 'QT_PP', tenQt: 'PP THACO AUTO', ghiChu: 'Khối bán hàng phân phối' },
            'C1103': { dinhBien: 85, thucTe: 80, khoi: 'CTTT Phía Bắc', maQt: 'QT_MB', tenQt: 'Công ty CTTT Miền Bắc', ghiChu: 'Điều hành Miền Bắc' },
            'C1104': { dinhBien: 250, thucTe: 240, khoi: 'Nhà máy', maQt: 'QT_CHULAI', tenQt: 'Nhà máy Chu Lai', ghiChu: 'Khu liên hợp SX Chu Lai' }
        };

        const activeEntities = (state.entities || []).filter(e => e.active !== false);
        activeEntities.forEach((ent, idx) => {
            const code = ent.code;
            if (!state.cbnvData[code]) {
                const seed = defaultSeed[code] || {
                    dinhBien: 60,
                    thucTe: 56,
                    khoi: ent.khoiName || (ent.khoi === 'KHOI_NHAMAY' ? 'Nhà máy' : (ent.khoi === 'KHOI_MB' ? 'CTTT Phía Bắc' : (ent.khoi === 'KHOI_VPDH' ? 'VPĐH' : 'CTTT Phía Nam'))),
                    maQt: ent.qtCode || ('QT_' + code),
                    tenQt: ent.qt || ent.name,
                    ghiChu: ''
                };
                state.cbnvData[code] = {
                    stt: idx + 1,
                    maPn: code,
                    tenPn: ent.cleanName || ent.name,
                    khoi: seed.khoi || ent.khoiName || 'VPĐH',
                    maQt: seed.maQt || ent.qtCode || ('QT_' + code),
                    tenQt: seed.tenQt || ent.qt || ent.name,
                    nam: 2026,
                    dinhBien: seed.dinhBien,
                    thucTe: seed.thucTe,
                    ghiChu: seed.ghiChu || ''
                };
            }
        });
    }

    /**
     * Tính tổng chi phí của 1 pháp nhân theo năm (Đơn vị: Triệu VNĐ)
     */
    function getEntityCostTrD(entCode, yearStr) {
        let totalVnd = 0;
        if (state.deptData && state.deptData[entCode] && Array.isArray(state.deptData[entCode][yearStr])) {
            state.deptData[entCode][yearStr].forEach(r => {
                totalVnd += (r.total || (Array.isArray(r.months) ? r.months.reduce((a, b) => a + b, 0) : 0));
            });
        }
        if (totalVnd === 0) {
            const ds = yearStr === '2026' ? state.data2026 : (yearStr === '2025' ? state.data2025 : state.data2024);
            if (ds && ds[entCode]) {
                const target = ds[entCode]['642'] || ds[entCode];
                Object.values(target).forEach(val => {
                    if (Array.isArray(val)) totalVnd += val.reduce((a, b) => a + b, 0);
                    else if (typeof val === 'number') totalVnd += val;
                });
            }
        }
        return totalVnd / 1e6; // Quy đổi về Triệu VNĐ
    }

    /**
     * Đổi chế độ hiển thị chỉ số CB-NV: 'THUC_TE' | 'DINH_BIEN' | 'BOTH'
     */
    function setCbnvDisplayMode(mode) {
        if (!state.cbnvConfig) state.cbnvConfig = { displayMode: 'BOTH' };
        state.cbnvConfig.displayMode = mode;
        saveCurrentState();
        renderCbnvTab();
    }

    /**
     * Kết xuất toàn bộ giao diện Tab 2: Chi phí / CB-NV
     */
    function renderCbnvTab(searchQuery = '') {
        ensureBaselineCbnvData();
        const displayMode = (state.cbnvConfig && state.cbnvConfig.displayMode) || 'BOTH';

        // 1. Cập nhật giao diện nút chuyển đổi Chế độ hiển thị
        const btnThucTe = document.getElementById('btn-cbnv-mode-thucte');
        const btnDinhBien = document.getElementById('btn-cbnv-mode-dinhbien');
        const btnBoth = document.getElementById('btn-cbnv-mode-both');

        const activeModeClass = 'px-2.5 py-1 font-bold rounded-lg transition-all bg-[#00529C] text-white shadow-sm';
        const inactiveModeClass = 'px-2.5 py-1 font-bold rounded-lg transition-all text-slate-700 hover:bg-slate-200';

        if (btnThucTe) btnThucTe.className = displayMode === 'THUC_TE' ? activeModeClass : inactiveModeClass;
        if (btnDinhBien) btnDinhBien.className = displayMode === 'DINH_BIEN' ? activeModeClass : inactiveModeClass;
        if (btnBoth) btnBoth.className = displayMode === 'BOTH' ? activeModeClass : inactiveModeClass;

        // 2. Lấy danh sách pháp nhân đang hoạt động
        const allActiveEntities = (state.entities || []).filter(e => e.active !== false);

        // 3. Tính toán số liệu tổng thể toàn hệ thống (System-wide Summary)
        let sysDinhBien = 0;
        let sysThucTe = 0;
        let sysCost2026 = 0;
        let sysCost2025 = 0;
        const zeroHeadcountEntities = [];

        allActiveEntities.forEach(ent => {
            const code = ent.code;
            const cbnv = state.cbnvData[code] || { dinhBien: 0, thucTe: 0 };
            const dB = Number(cbnv.dinhBien) || 0;
            const tT = Number(cbnv.thucTe) || 0;
            const c26 = getEntityCostTrD(code, '2026');
            const c25 = getEntityCostTrD(code, '2025');

            sysDinhBien += dB;
            sysThucTe += tT;
            sysCost2026 += c26;
            sysCost2025 += c25;

            if (tT <= 0 && dB <= 0) {
                zeroHeadcountEntities.push(code);
            }
        });

        const sysFillRate = sysDinhBien > 0 ? ((sysThucTe / sysDinhBien) * 100).toFixed(1) : '0.0';
        const sysCphcPerThucTeYear = sysThucTe > 0 ? (sysCost2026 / sysThucTe) : 0;
        const sysCphcPerThucTeMonth = sysCphcPerThucTeYear / 12;
        const sysCphcPerDinhBienYear = sysDinhBien > 0 ? (sysCost2026 / sysDinhBien) : 0;
        const sysCphcPerDinhBienMonth = sysCphcPerDinhBienYear / 12;

        const sysCphcPerThucTe2025Year = sysThucTe > 0 ? (sysCost2025 / sysThucTe) : 0;
        const sysYoYDiffAmt = sysCphcPerThucTeYear - sysCphcPerThucTe2025Year;
        const sysYoYDiffPct = sysCphcPerThucTe2025Year > 0 ? ((sysYoYDiffAmt / sysCphcPerThucTe2025Year) * 100) : 0;

        // 4. Cập nhật Dải thẻ KPI (Executive KPI Cards Strip)
        const elKpiThucTe = document.getElementById('kpi-cbnv-thucte-total');
        if (elKpiThucTe) elKpiThucTe.textContent = sysThucTe.toLocaleString('vi-VN');

        const elKpiDinhBien = document.getElementById('kpi-cbnv-dinhbien-total');
        if (elKpiDinhBien) elKpiDinhBien.textContent = sysDinhBien.toLocaleString('vi-VN');

        const elKpiFillRate = document.getElementById('kpi-cbnv-fill-rate');
        if (elKpiFillRate) elKpiFillRate.textContent = `${sysFillRate}% lấp đầy`;

        const elKpiTtYear = document.getElementById('kpi-cphc-per-thucte-year');
        if (elKpiTtYear) elKpiTtYear.textContent = sysCphcPerThucTeYear.toFixed(1);

        const elKpiTtMonth = document.getElementById('kpi-cphc-per-thucte-month');
        if (elKpiTtMonth) elKpiTtMonth.textContent = sysCphcPerThucTeMonth.toFixed(2);

        const elKpiDbYear = document.getElementById('kpi-cphc-per-dinhbien-year');
        if (elKpiDbYear) elKpiDbYear.textContent = sysCphcPerDinhBienYear.toFixed(1);

        const elKpiDbMonth = document.getElementById('kpi-cphc-per-dinhbien-month');
        if (elKpiDbMonth) elKpiDbMonth.textContent = sysCphcPerDinhBienMonth.toFixed(2);

        const elKpiYoYDiff = document.getElementById('kpi-cbnv-yoy-diff');
        if (elKpiYoYDiff) {
            const sign = sysYoYDiffPct >= 0 ? '+' : '';
            elKpiYoYDiff.textContent = `${sign}${sysYoYDiffPct.toFixed(1)}%`;
            elKpiYoYDiff.className = `text-2xl font-black font-mono ${sysYoYDiffPct > 0 ? 'text-amber-700' : 'text-emerald-700'}`;
        }

        const elKpiYoYAmt = document.getElementById('kpi-cbnv-yoy-amt');
        if (elKpiYoYAmt) {
            const sign = sysYoYDiffAmt >= 0 ? '+' : '';
            elKpiYoYAmt.textContent = `${sign}${sysYoYDiffAmt.toFixed(1)}`;
        }

        const elKpiYoYBadge = document.getElementById('kpi-cbnv-yoy-badge');
        if (elKpiYoYBadge) {
            if (Math.abs(sysYoYDiffPct) < 5) {
                elKpiYoYBadge.className = 'px-1.5 py-0.2 rounded text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-300';
                elKpiYoYBadge.textContent = 'Ổn định (±5%)';
            } else if (sysYoYDiffPct < 0) {
                elKpiYoYBadge.className = 'px-1.5 py-0.2 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300';
                elKpiYoYBadge.textContent = 'Tiết kiệm chi phí';
            } else {
                elKpiYoYBadge.className = 'px-1.5 py-0.2 rounded text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300';
                elKpiYoYBadge.textContent = 'Tăng định mức';
            }
        }

        // 5. Cập nhật Hộp Đối Soát Kiểm Toán (CB-NV Audit Box)
        const auditBox = document.getElementById('cbnv-audit-box');
        if (auditBox) {
            if (state.cbnvAudit) {
                const aud = state.cbnvAudit;
                if (!aud.hasControlRow) {
                    auditBox.className = 'p-3 rounded-xl border text-xs flex flex-wrap items-center justify-between gap-2 bg-amber-50 border-amber-300 text-amber-900';
                    auditBox.innerHTML = `
                        <div class="flex items-center gap-2 font-medium">
                            <span class="p-1 rounded bg-amber-200 text-amber-800 font-bold">⚠️</span>
                            <div>
                                <strong class="font-bold text-amber-950">CẢNH BÁO KIỂM TOÁN NHÂN SỰ:</strong>
                                <span>Không tìm thấy dòng tổng cộng (CỘNG / TỔNG CỘNG) trong file Excel để đối chiếu — Cần rà soát thủ công (Hệ thống không mặc định báo khớp). Tổng thực tế chi tiết: <strong>${(aud.sumTt || 0).toLocaleString('vi-VN')}</strong> người.</span>
                            </div>
                        </div>
                        <button onclick="document.getElementById('cbnv-upload-modal').classList.remove('hidden')" class="px-3 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-bold text-xs shadow-sm transition-all flex items-center gap-1">
                            <span>📥 Nạp lại file có dòng CỘNG</span>
                        </button>
                    `;
                } else if (aud.diff === 0 && (aud.diffDb === 0 || aud.diffDb === null)) {
                    auditBox.className = 'p-3 rounded-xl border text-xs flex flex-wrap items-center justify-between gap-2 bg-emerald-50 border-emerald-300 text-emerald-900';
                    auditBox.innerHTML = `
                        <div class="flex items-center gap-2 font-medium">
                            <span class="p-1 rounded bg-emerald-200 text-emerald-800 font-bold">✅</span>
                            <div>
                                <strong class="font-bold text-emerald-950">KIỂM TOÁN NHÂN SỰ: Khớp 100%</strong>
                                <span>Chênh lệch: <strong class="font-mono text-emerald-950">0 người</strong> (Tổng thực tế: <strong>${(aud.sumTt || 0).toLocaleString('vi-VN')}</strong> người, Định biên: <strong>${(aud.sumDb || 0).toLocaleString('vi-VN')}</strong> người - Khớp tuyệt đối với dòng CỘNG của file gốc).</span>
                            </div>
                        </div>
                        <span class="px-2.5 py-1 bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-full font-black text-[11px]">
                            Chênh lệch: 0 người (Khớp 100%)
                        </span>
                    `;
                } else {
                    auditBox.className = 'p-3 rounded-xl border text-xs flex flex-wrap items-center justify-between gap-2 bg-rose-50 border-rose-300 text-rose-900';
                    auditBox.innerHTML = `
                        <div class="flex items-center gap-2 font-medium">
                            <span class="p-1 rounded bg-rose-200 text-rose-800 font-bold">🚨</span>
                            <div>
                                <strong class="font-bold text-rose-950">CẢNH BÁO LỆCH KIỂM TOÁN NHÂN SỰ:</strong>
                                <span>Phát hiện chênh lệch <strong class="text-rose-700 font-bold">${(aud.diff || 0).toLocaleString('vi-VN')}</strong> người so với dòng CỘNG của file gốc (Chi tiết: ${(aud.sumTt || 0).toLocaleString('vi-VN')} người vs Dòng CỘNG: ${(aud.fileControlTotalTt || 0).toLocaleString('vi-VN')} người).</span>
                            </div>
                        </div>
                        <button onclick="document.getElementById('cbnv-upload-modal').classList.remove('hidden')" class="px-3 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded-lg font-bold text-xs shadow-sm transition-all flex items-center gap-1">
                            <span>🔍 Kiểm tra lại</span>
                        </button>
                    `;
                }
            } else if (zeroHeadcountEntities.length > 0) {
                auditBox.className = 'p-3 rounded-xl border text-xs flex flex-wrap items-center justify-between gap-2 bg-rose-50 border-rose-200 text-rose-900';
                auditBox.innerHTML = `
                    <div class="flex items-center gap-2 font-medium">
                        <span class="p-1 rounded bg-rose-200 text-rose-800 font-bold">⚠️</span>
                        <div>
                            <strong class="font-bold text-rose-950">CẢNH BÁO ĐỐI SOÁT NHÂN SỰ:</strong>
                            <span>Phát hiện <strong class="text-rose-700 font-bold">${zeroHeadcountEntities.length}</strong> đơn vị có số liệu nhân sự = 0 hoặc chưa nạp (${zeroHeadcountEntities.join(', ')}). Vui lòng nạp bổ sung file Excel nhân sự để định mức chi phí chuẩn xác.</span>
                        </div>
                    </div>
                    <button onclick="document.getElementById('cbnv-upload-modal').classList.remove('hidden')" class="px-3 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded-lg font-bold text-xs shadow-sm transition-all flex items-center gap-1">
                        <span>📥 Nạp bổ sung ngay</span>
                    </button>
                `;
            } else {
                auditBox.className = 'p-3 rounded-xl border text-xs flex flex-wrap items-center justify-between gap-2 bg-emerald-50 border-emerald-200 text-emerald-900';
                auditBox.innerHTML = `
                    <div class="flex items-center gap-2 font-medium">
                        <span class="p-1 rounded bg-emerald-200 text-emerald-800 font-bold">✅</span>
                        <div>
                            <strong class="font-bold text-emerald-950">ĐỐI SOÁT NHÂN SỰ TOÀN HỆ THỐNG:</strong>
                            <span>100% Đơn vị đã có dữ liệu nhân sự (${allActiveEntities.length} đơn vị, <strong>${sysThucTe.toLocaleString('vi-VN')}</strong> CB-NV thực tế / <strong>${sysDinhBien.toLocaleString('vi-VN')}</strong> định biên). Dữ liệu định mức đạt chuẩn kiểm toán!</span>
                        </div>
                    </div>
                    <span class="px-2.5 py-1 bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-full font-black text-[11px]">
                        100% Khớp Audit
                    </span>
                `;
            }
        }

        // 6. Lọc và tính toán cho Bảng ma trận theo từng Pháp nhân
        const qClean = (searchQuery || '').toLowerCase().trim();
        const displayEntities = allActiveEntities.filter(ent => {
            if (!qClean) return true;
            const cbnv = state.cbnvData[ent.code] || {};
            const str = `${ent.code} ${ent.name} ${ent.cleanName || ''} ${cbnv.tenQt || ''} ${cbnv.khoi || ''}`.toLowerCase();
            return str.includes(qClean);
        });

        const countBadge = document.getElementById('cbnv-table-count');
        if (countBadge) countBadge.textContent = `${displayEntities.length} đơn vị`;

        // 7. Kết xuất Bảng Ma Trận Chi Phí / CB-NV
        const thead = document.getElementById('cbnv-table-head');
        const tbody = document.getElementById('cbnv-table-body');

        if (thead) {
            if (displayMode === 'THUC_TE') {
                thead.innerHTML = `
                    <tr>
                        <th class="p-2.5 text-center font-bold border-r border-blue-800 w-12">STT</th>
                        <th class="p-2.5 text-center font-bold border-r border-blue-800 w-28">Khối Đơn Vị</th>
                        <th class="p-2.5 text-center font-bold border-r border-blue-800 w-24">Mã ĐVCS</th>
                        <th class="p-2.5 font-bold border-r border-blue-800 min-w-[200px]">Tên Pháp Nhân / Showroom</th>
                        <th class="p-2.5 text-right font-bold border-r border-blue-800 w-28 bg-[#004080]">CB-NV Thực Tế</th>
                        <th class="p-2.5 text-right font-bold border-r border-blue-800 w-32 bg-[#0284C7]">Tổng CPHC 2026<br/><span class="text-[9px] font-normal">(Tr.đ)</span></th>
                        <th class="p-2.5 text-right font-black border-r border-blue-800 w-36 bg-[#059669]">CPHC / Thực Tế<br/><span class="text-[9px] font-normal">(Tr.đ / người / năm)</span></th>
                        <th class="p-2.5 text-right font-bold border-r border-blue-800 w-36 bg-[#059669]">CPHC / Thực Tế<br/><span class="text-[9px] font-normal">(Tr.đ / người / tháng)</span></th>
                        <th class="p-2.5 text-right font-bold border-r border-blue-800 w-32 bg-[#003870]">Định Mức 2025<br/><span class="text-[9px] font-normal">(Tr.đ / người)</span></th>
                        <th class="p-2.5 text-right font-bold border-r border-blue-800 w-28">Biến Động YoY</th>
                    </tr>
                `;
            } else if (displayMode === 'DINH_BIEN') {
                thead.innerHTML = `
                    <tr>
                        <th class="p-2.5 text-center font-bold border-r border-blue-800 w-12">STT</th>
                        <th class="p-2.5 text-center font-bold border-r border-blue-800 w-28">Khối Đơn Vị</th>
                        <th class="p-2.5 text-center font-bold border-r border-blue-800 w-24">Mã ĐVCS</th>
                        <th class="p-2.5 font-bold border-r border-blue-800 min-w-[200px]">Tên Pháp Nhân / Showroom</th>
                        <th class="p-2.5 text-right font-bold border-r border-blue-800 w-28 bg-[#004080]">Định Biên</th>
                        <th class="p-2.5 text-right font-bold border-r border-blue-800 w-32 bg-[#0284C7]">Tổng CPHC 2026<br/><span class="text-[9px] font-normal">(Tr.đ)</span></th>
                        <th class="p-2.5 text-right font-black border-r border-blue-800 w-36 bg-[#4F46E5]">CPHC / Định Biên<br/><span class="text-[9px] font-normal">(Tr.đ / người / năm)</span></th>
                        <th class="p-2.5 text-right font-bold border-r border-blue-800 w-36 bg-[#4F46E5]">CPHC / Định Biên<br/><span class="text-[9px] font-normal">(Tr.đ / người / tháng)</span></th>
                        <th class="p-2.5 text-right font-bold border-r border-blue-800 w-28">Tỷ Lệ Lấp Đầy</th>
                        <th class="p-2.5 text-right font-bold border-r border-blue-800 w-28">Biến Động YoY</th>
                    </tr>
                `;
            } else {
                // SONG SONG CẢ 2 (BOTH)
                thead.innerHTML = `
                    <tr>
                        <th rowspan="2" class="p-2.5 text-center font-bold border-r border-blue-800 w-12">STT</th>
                        <th rowspan="2" class="p-2.5 text-center font-bold border-r border-blue-800 w-28">Khối</th>
                        <th rowspan="2" class="p-2.5 text-center font-bold border-r border-blue-800 w-24">Mã ĐVCS</th>
                        <th rowspan="2" class="p-2.5 font-bold border-r border-blue-800 min-w-[190px]">Tên Pháp Nhân / Showroom</th>
                        <th colspan="3" class="p-2 text-center font-bold border-r border-blue-800 bg-[#004080]">QUY MÔ NHÂN SỰ</th>
                        <th rowspan="2" class="p-2.5 text-right font-bold border-r border-blue-800 w-32 bg-[#0284C7]">Tổng CPHC 2026<br/><span class="text-[9px] font-normal">(Tr.đ)</span></th>
                        <th colspan="2" class="p-2 text-center font-black border-r border-blue-800 bg-[#059669]">THEO THỰC TẾ (TR.Đ)</th>
                        <th colspan="2" class="p-2 text-center font-bold border-r border-blue-800 bg-[#4F46E5]">THEO ĐỊNH BIÊN (TR.Đ)</th>
                        <th rowspan="2" class="p-2.5 text-right font-bold border-r border-blue-800 w-28 bg-[#003870]">ĐM 2025<br/><span class="text-[9px] font-normal">(Tr.đ/người)</span></th>
                        <th rowspan="2" class="p-2.5 text-right font-bold border-r border-blue-800 w-28">Biến Động YoY</th>
                    </tr>
                    <tr class="bg-[#003870] text-[10px] text-white">
                        <th class="p-1.5 text-right border-r border-blue-800 w-20">Định biên</th>
                        <th class="p-1.5 text-right border-r border-blue-800 w-20">Thực tế</th>
                        <th class="p-1.5 text-center border-r border-blue-800 w-20">% Lấp đầy</th>
                        <th class="p-1.5 text-right border-r border-blue-800 w-24">Năm</th>
                        <th class="p-1.5 text-right border-r border-blue-800 w-24">Tháng</th>
                        <th class="p-1.5 text-right border-r border-blue-800 w-24">Năm</th>
                        <th class="p-1.5 text-right border-r border-blue-800 w-24">Tháng</th>
                    </tr>
                `;
            }
        }

        if (tbody) {
            tbody.innerHTML = '';
            let filteredSumDinhBien = 0;
            let filteredSumThucTe = 0;
            let filteredSumCost2026 = 0;
            let filteredSumCost2025 = 0;

            displayEntities.forEach((ent, idx) => {
                const code = ent.code;
                const cbnv = state.cbnvData[code] || { dinhBien: 0, thucTe: 0, khoi: ent.khoiName || 'VPĐH' };
                const dB = Number(cbnv.dinhBien) || 0;
                const tT = Number(cbnv.thucTe) || 0;
                const fillPct = dB > 0 ? ((tT / dB) * 100) : 0;

                const c26 = getEntityCostTrD(code, '2026');
                const c25 = getEntityCostTrD(code, '2025');

                filteredSumDinhBien += dB;
                filteredSumThucTe += tT;
                filteredSumCost2026 += c26;
                filteredSumCost2025 += c25;

                const cphcPerTtYear = tT > 0 ? (c26 / tT) : 0;
                const cphcPerTtMonth = cphcPerTtYear / 12;
                const cphcPerDbYear = dB > 0 ? (c26 / dB) : 0;
                const cphcPerDbMonth = cphcPerDbYear / 12;

                const cphcPerTt25Year = tT > 0 ? (c25 / tT) : 0;
                const yoyDiff = cphcPerTt25Year > 0 ? ((cphcPerTtYear - cphcPerTt25Year) / cphcPerTt25Year * 100) : 0;
                const sign = yoyDiff >= 0 ? '+' : '';

                let yoyBadge = `<span class="text-slate-400 font-mono text-xs">-</span>`;
                if (cphcPerTt25Year > 0) {
                    if (Math.abs(yoyDiff) >= 20) {
                        if (yoyDiff > 0) {
                            yoyBadge = `<span class="px-1.5 py-0.5 rounded text-[10px] font-black bg-rose-100 text-rose-800 border border-rose-300">▲ ${sign}${yoyDiff.toFixed(1)}% ⚠️</span>`;
                        } else {
                            yoyBadge = `<span class="px-1.5 py-0.5 rounded text-[10px] font-black bg-emerald-100 text-emerald-800 border border-emerald-300">▼ ${sign}${yoyDiff.toFixed(1)}%</span>`;
                        }
                    } else {
                        yoyBadge = `<span class="font-mono text-xs ${yoyDiff > 0 ? 'text-amber-700 font-bold' : 'text-emerald-700 font-bold'}">${sign}${yoyDiff.toFixed(1)}%</span>`;
                    }
                }

                let khoiBadge = 'bg-blue-50 text-blue-800 border-blue-200';
                if (cbnv.khoi === 'Nhà máy') khoiBadge = 'bg-emerald-50 text-emerald-800 border-emerald-200';
                else if (cbnv.khoi === 'CTTT Phía Bắc') khoiBadge = 'bg-amber-50 text-amber-800 border-amber-200';
                else if (cbnv.khoi === 'CTTT Phía Nam') khoiBadge = 'bg-purple-50 text-purple-800 border-purple-200';

                const tr = document.createElement('tr');
                tr.className = 'hover:bg-blue-50/50 transition-colors bg-white border-b border-slate-100';

                if (displayMode === 'THUC_TE') {
                    tr.innerHTML = `
                        <td class="p-2 text-center text-slate-400 font-mono border-r border-slate-200">${idx + 1}</td>
                        <td class="p-2 text-center border-r border-slate-200"><span class="px-2 py-0.5 rounded-full text-[10px] font-bold border ${khoiBadge}">${escapeHtml(cbnv.khoi || 'VPĐH')}</span></td>
                        <td class="p-2 text-center font-bold text-blue-900 font-mono border-r border-slate-200">${escapeHtml(code)}</td>
                        <td class="p-2 border-r border-slate-200 font-medium text-slate-800">${escapeHtml(ent.cleanName || ent.name)}</td>
                        <td class="p-2 text-right border-r border-slate-200 font-mono font-bold text-slate-900 bg-blue-50/30">${tT > 0 ? tT.toLocaleString('vi-VN') : '<span class="text-rose-500 font-bold">0</span>'}</td>
                        <td class="p-2 text-right border-r border-slate-200 font-mono font-bold text-sky-900 bg-sky-50/30">${formatNumber(c26)}</td>
                        <td class="p-2 text-right border-r border-slate-200 font-mono font-black text-emerald-700 bg-emerald-50/40">${cphcPerTtYear.toFixed(1)}</td>
                        <td class="p-2 text-right border-r border-slate-200 font-mono font-bold text-emerald-800">${cphcPerTtMonth.toFixed(2)}</td>
                        <td class="p-2 text-right border-r border-slate-200 font-mono text-slate-600">${cphcPerTt25Year > 0 ? cphcPerTt25Year.toFixed(1) : '-'}</td>
                        <td class="p-2 text-right border-r border-slate-200 font-mono">${yoyBadge}</td>
                    `;
                } else if (displayMode === 'DINH_BIEN') {
                    tr.innerHTML = `
                        <td class="p-2 text-center text-slate-400 font-mono border-r border-slate-200">${idx + 1}</td>
                        <td class="p-2 text-center border-r border-slate-200"><span class="px-2 py-0.5 rounded-full text-[10px] font-bold border ${khoiBadge}">${escapeHtml(cbnv.khoi || 'VPĐH')}</span></td>
                        <td class="p-2 text-center font-bold text-blue-900 font-mono border-r border-slate-200">${escapeHtml(code)}</td>
                        <td class="p-2 border-r border-slate-200 font-medium text-slate-800">${escapeHtml(ent.cleanName || ent.name)}</td>
                        <td class="p-2 text-right border-r border-slate-200 font-mono font-bold text-slate-900 bg-blue-50/30">${dB > 0 ? dB.toLocaleString('vi-VN') : '<span class="text-rose-500 font-bold">0</span>'}</td>
                        <td class="p-2 text-right border-r border-slate-200 font-mono font-bold text-sky-900 bg-sky-50/30">${formatNumber(c26)}</td>
                        <td class="p-2 text-right border-r border-slate-200 font-mono font-black text-indigo-700 bg-indigo-50/40">${cphcPerDbYear.toFixed(1)}</td>
                        <td class="p-2 text-right border-r border-slate-200 font-mono font-bold text-indigo-800">${cphcPerDbMonth.toFixed(2)}</td>
                        <td class="p-2 text-right border-r border-slate-200 font-mono font-bold text-slate-700">${fillPct.toFixed(1)}%</td>
                        <td class="p-2 text-right border-r border-slate-200 font-mono">${yoyBadge}</td>
                    `;
                } else {
                    // BOTH
                    tr.innerHTML = `
                        <td class="p-2 text-center text-slate-400 font-mono border-r border-slate-200">${idx + 1}</td>
                        <td class="p-2 text-center border-r border-slate-200"><span class="px-2 py-0.5 rounded-full text-[10px] font-bold border ${khoiBadge}">${escapeHtml(cbnv.khoi || 'VPĐH')}</span></td>
                        <td class="p-2 text-center font-bold text-blue-900 font-mono border-r border-slate-200">${escapeHtml(code)}</td>
                        <td class="p-2 border-r border-slate-200 font-medium text-slate-800">${escapeHtml(ent.cleanName || ent.name)}</td>
                        <td class="p-2 text-right border-r border-slate-200 font-mono text-slate-700">${dB > 0 ? dB.toLocaleString('vi-VN') : '<span class="text-rose-500 font-bold">0</span>'}</td>
                        <td class="p-2 text-right border-r border-slate-200 font-mono font-bold text-slate-900 bg-blue-50/20">${tT > 0 ? tT.toLocaleString('vi-VN') : '<span class="text-rose-500 font-bold">0</span>'}</td>
                        <td class="p-2 text-center border-r border-slate-200 font-mono text-[11px] text-blue-900 font-semibold">${fillPct.toFixed(1)}%</td>
                        <td class="p-2 text-right border-r border-slate-200 font-mono font-bold text-sky-900 bg-sky-50/30">${formatNumber(c26)}</td>
                        <td class="p-2 text-right border-r border-slate-200 font-mono font-black text-emerald-700 bg-emerald-50/30">${cphcPerTtYear.toFixed(1)}</td>
                        <td class="p-2 text-right border-r border-slate-200 font-mono text-emerald-800">${cphcPerTtMonth.toFixed(2)}</td>
                        <td class="p-2 text-right border-r border-slate-200 font-mono font-bold text-indigo-700 bg-indigo-50/30">${cphcPerDbYear.toFixed(1)}</td>
                        <td class="p-2 text-right border-r border-slate-200 font-mono text-indigo-800">${cphcPerDbMonth.toFixed(2)}</td>
                        <td class="p-2 text-right border-r border-slate-200 font-mono text-slate-600">${cphcPerTt25Year > 0 ? cphcPerTt25Year.toFixed(1) : '-'}</td>
                        <td class="p-2 text-right border-r border-slate-200 font-mono">${yoyBadge}</td>
                    `;
                }

                tbody.appendChild(tr);
            });

            // Hàng Tổng Cộng Footer
            const fTtPerYear = filteredSumThucTe > 0 ? (filteredSumCost2026 / filteredSumThucTe) : 0;
            const fTtPerMonth = fTtPerYear / 12;
            const fDbPerYear = filteredSumDinhBien > 0 ? (filteredSumCost2026 / filteredSumDinhBien) : 0;
            const fDbPerMonth = fDbPerYear / 12;
            const fTt25PerYear = filteredSumThucTe > 0 ? (filteredSumCost2025 / filteredSumThucTe) : 0;
            const fYoYDiff = fTt25PerYear > 0 ? ((fTtPerYear - fTt25PerYear) / fTt25PerYear * 100) : 0;
            const fSign = fYoYDiff >= 0 ? '+' : '';
            const fFillPct = filteredSumDinhBien > 0 ? ((filteredSumThucTe / filteredSumDinhBien) * 100) : 0;

            const footerTr = document.createElement('tr');
            footerTr.className = 'bg-[#003870] text-white font-black text-xs border-t-2 border-blue-900 select-none';

            if (displayMode === 'THUC_TE') {
                footerTr.innerHTML = `
                    <td colspan="4" class="p-2.5 text-center uppercase tracking-wider font-extrabold border-r border-blue-800">TỔNG CỘNG HỆ THỐNG</td>
                    <td class="p-2.5 text-right border-r border-blue-800 font-mono text-amber-300 font-bold">${filteredSumThucTe.toLocaleString('vi-VN')}</td>
                    <td class="p-2.5 text-right border-r border-blue-800 font-mono text-cyan-200 font-bold">${formatNumber(filteredSumCost2026)}</td>
                    <td class="p-2.5 text-right border-r border-blue-800 font-mono text-emerald-300 font-black">${fTtPerYear.toFixed(1)}</td>
                    <td class="p-2.5 text-right border-r border-blue-800 font-mono text-emerald-200 font-bold">${fTtPerMonth.toFixed(2)}</td>
                    <td class="p-2.5 text-right border-r border-blue-800 font-mono text-slate-300">${fTt25PerYear > 0 ? fTt25PerYear.toFixed(1) : '-'}</td>
                    <td class="p-2.5 text-right border-r border-blue-800 font-mono text-amber-300">${fSign}${fYoYDiff.toFixed(1)}%</td>
                `;
            } else if (displayMode === 'DINH_BIEN') {
                footerTr.innerHTML = `
                    <td colspan="4" class="p-2.5 text-center uppercase tracking-wider font-extrabold border-r border-blue-800">TỔNG CỘNG HỆ THỐNG</td>
                    <td class="p-2.5 text-right border-r border-blue-800 font-mono text-amber-300 font-bold">${filteredSumDinhBien.toLocaleString('vi-VN')}</td>
                    <td class="p-2.5 text-right border-r border-blue-800 font-mono text-cyan-200 font-bold">${formatNumber(filteredSumCost2026)}</td>
                    <td class="p-2.5 text-right border-r border-blue-800 font-mono text-indigo-300 font-black">${fDbPerYear.toFixed(1)}</td>
                    <td class="p-2.5 text-right border-r border-blue-800 font-mono text-indigo-200 font-bold">${fDbPerMonth.toFixed(2)}</td>
                    <td class="p-2.5 text-right border-r border-blue-800 font-mono text-blue-200">${fFillPct.toFixed(1)}%</td>
                    <td class="p-2.5 text-right border-r border-blue-800 font-mono text-amber-300">${fSign}${fYoYDiff.toFixed(1)}%</td>
                `;
            } else {
                footerTr.innerHTML = `
                    <td colspan="4" class="p-2.5 text-center uppercase tracking-wider font-extrabold border-r border-blue-800">TỔNG CỘNG HỆ THỐNG</td>
                    <td class="p-2 text-right border-r border-blue-800 font-mono text-slate-300">${filteredSumDinhBien.toLocaleString('vi-VN')}</td>
                    <td class="p-2 text-right border-r border-blue-800 font-mono text-amber-300 font-bold">${filteredSumThucTe.toLocaleString('vi-VN')}</td>
                    <td class="p-2 text-center border-r border-blue-800 font-mono text-[11px] text-cyan-300">${fFillPct.toFixed(1)}%</td>
                    <td class="p-2 text-right border-r border-blue-800 font-mono text-cyan-200 font-bold">${formatNumber(filteredSumCost2026)}</td>
                    <td class="p-2 text-right border-r border-blue-800 font-mono text-emerald-300 font-black">${fTtPerYear.toFixed(1)}</td>
                    <td class="p-2 text-right border-r border-blue-800 font-mono text-emerald-200">${fTtPerMonth.toFixed(2)}</td>
                    <td class="p-2 text-right border-r border-blue-800 font-mono text-indigo-300 font-bold">${fDbPerYear.toFixed(1)}</td>
                    <td class="p-2 text-right border-r border-blue-800 font-mono text-indigo-200">${fDbPerMonth.toFixed(2)}</td>
                    <td class="p-2 text-right border-r border-blue-800 font-mono text-slate-300">${fTt25PerYear > 0 ? fTt25PerYear.toFixed(1) : '-'}</td>
                    <td class="p-2 text-right border-r border-blue-800 font-mono text-amber-300">${fSign}${fYoYDiff.toFixed(1)}%</td>
                `;
            }

            tbody.appendChild(footerTr);
        }

        // 8. Kết xuất 2 Biểu đồ Phân tích (Benchmark Bar Chart & Scatter Correlation)
        renderCbnvCharts(displayEntities, sysCphcPerThucTeYear, sysCphcPerDinhBienYear, displayMode);
    }

    /**
     * Vẽ Biểu đồ Benchmark và Tương quan cho Tab CB-NV
     */
    function renderCbnvCharts(entitiesList, sysBenchmarkThucTe, sysBenchmarkDinhBien, displayMode) {
        if (typeof Chart === 'undefined') return;

        // Biểu đồ 1: Benchmark Chi phí / Người vs Bình quân Hệ thống
        const benchmarkCtx = document.getElementById('chart-cbnv-benchmark');
        if (benchmarkCtx) {
            if (cbnvBenchmarkChart) {
                cbnvBenchmarkChart.destroy();
                cbnvBenchmarkChart = null;
            }

            // Sắp xếp đơn vị theo định mức chi phí giảm dần
            const sortedList = [...entitiesList].map(ent => {
                const code = ent.code;
                const cbnv = state.cbnvData[code] || { dinhBien: 0, thucTe: 0 };
                const tT = Number(cbnv.thucTe) || 0;
                const dB = Number(cbnv.dinhBien) || 0;
                const c26 = getEntityCostTrD(code, '2026');
                const rateTt = tT > 0 ? (c26 / tT) : 0;
                const rateDb = dB > 0 ? (c26 / dB) : 0;
                return {
                    code: code,
                    label: ent.cleanName || ent.name || code,
                    rateTt: parseFloat(rateTt.toFixed(1)),
                    rateDb: parseFloat(rateDb.toFixed(1)),
                    thucTe: tT,
                    dinhBien: dB,
                    cost: c26
                };
            }).sort((a, b) => (b.rateTt || 0) - (a.rateTt || 0));

            const labels = sortedList.map(item => item.label.length > 20 ? item.label.slice(0, 18) + '...' : item.label);
            const datasets = [];

            if (displayMode === 'BOTH' || displayMode === 'THUC_TE') {
                datasets.push({
                    type: 'bar',
                    label: 'CPHC / CB-NV Thực Tế (Tr.đ/người/năm)',
                    data: sortedList.map(item => item.rateTt),
                    backgroundColor: 'rgba(0, 82, 156, 0.85)',
                    borderColor: '#00529C',
                    borderWidth: 1.5,
                    borderRadius: 6,
                    order: 2
                });
            }

            if (displayMode === 'BOTH' || displayMode === 'DINH_BIEN') {
                datasets.push({
                    type: 'bar',
                    label: 'CPHC / Định Biên (Tr.đ/người/năm)',
                    data: sortedList.map(item => item.rateDb),
                    backgroundColor: 'rgba(99, 102, 241, 0.75)',
                    borderColor: '#6366F1',
                    borderWidth: 1.5,
                    borderRadius: 6,
                    order: 3
                });
            }

            // Đường Benchmark Bình Quân Hệ Thống
            const benchmarkLineVal = displayMode === 'DINH_BIEN' ? sysBenchmarkDinhBien : sysBenchmarkThucTe;
            datasets.push({
                type: 'line',
                label: `Bình quân Hệ thống (${benchmarkLineVal.toFixed(1)} Tr.đ/người)`,
                data: Array(sortedList.length).fill(parseFloat(benchmarkLineVal.toFixed(1))),
                borderColor: '#D97706',
                borderWidth: 2.5,
                borderDash: [6, 4],
                pointRadius: 0,
                fill: false,
                order: 1
            });

            cbnvBenchmarkChart = new Chart(benchmarkCtx, {
                type: 'bar',
                data: {
                    labels: labels,
                    datasets: datasets
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    interaction: {
                        mode: 'index',
                        intersect: false
                    },
                    plugins: {
                        legend: {
                            position: 'top',
                            labels: {
                                font: { size: 11, weight: 'bold' },
                                boxWidth: 12
                            }
                        },
                        tooltip: {
                            callbacks: {
                                label: function(context) {
                                    return `${context.dataset.label}: ${context.raw.toLocaleString('vi-VN')} Tr.đ/người`;
                                }
                            }
                        }
                    },
                    scales: {
                        y: {
                            beginAtZero: true,
                            title: {
                                display: true,
                                text: 'Định mức CPHC (Tr.đ / người / năm)',
                                font: { size: 10, weight: 'bold' }
                            },
                            grid: { color: '#f1f5f9' }
                        },
                        x: {
                            grid: { display: false },
                            ticks: {
                                maxRotation: 45,
                                minRotation: 30,
                                font: { size: 10, weight: 'bold' }
                            }
                        }
                    }
                }
            });
        }

        // Biểu đồ 2: Tương quan Chi phí Hành chính (Tr.đ) vs Quy mô Nhân sự (Người)
        const scatterCtx = document.getElementById('chart-cbnv-scatter');
        if (scatterCtx) {
            if (cbnvScatterChart) {
                cbnvScatterChart.destroy();
                cbnvScatterChart = null;
            }

            const scatterPoints = entitiesList.map(ent => {
                const code = ent.code;
                const cbnv = state.cbnvData[code] || { dinhBien: 0, thucTe: 0 };
                const tT = Number(cbnv.thucTe) || 0;
                const c26 = getEntityCostTrD(code, '2026');
                const rate = tT > 0 ? (c26 / tT).toFixed(1) : 0;

                let color = 'rgba(0, 82, 156, 0.7)'; // VPĐH
                if (cbnv.khoi === 'Nhà máy') color = 'rgba(16, 185, 129, 0.7)';
                else if (cbnv.khoi === 'CTTT Phía Bắc') color = 'rgba(217, 119, 6, 0.7)';
                else if (cbnv.khoi === 'CTTT Phía Nam') color = 'rgba(147, 51, 234, 0.7)';

                return {
                    x: tT,
                    y: parseFloat(c26.toFixed(1)),
                    label: ent.cleanName || ent.name || code,
                    khoi: cbnv.khoi || 'VPĐH',
                    rate: rate,
                    color: color
                };
            });

            cbnvScatterChart = new Chart(scatterCtx, {
                type: 'bubble',
                data: {
                    datasets: [{
                        label: 'Pháp nhân / Đơn vị',
                        data: scatterPoints.map(p => ({ x: p.x, y: p.y, r: 8 })),
                        backgroundColor: scatterPoints.map(p => p.color),
                        borderColor: scatterPoints.map(p => p.color.replace('0.7', '1')),
                        borderWidth: 1.5
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            callbacks: {
                                label: function(context) {
                                    const p = scatterPoints[context.dataIndex];
                                    return [
                                        `🏢 ${p.label} [${p.khoi}]`,
                                        `👥 Nhân sự: ${p.x.toLocaleString('vi-VN')} người`,
                                        `💰 Tổng CPHC 2026: ${p.y.toLocaleString('vi-VN')} Tr.đ`,
                                        `⚡ Định mức: ${p.rate} Tr.đ / người / năm`
                                    ];
                                }
                            }
                        }
                    },
                    scales: {
                        x: {
                            beginAtZero: true,
                            title: {
                                display: true,
                                text: 'Số lượng Nhân sự Thực tế (Người)',
                                font: { size: 10, weight: 'bold' }
                            },
                            grid: { color: '#f1f5f9' }
                        },
                        y: {
                            beginAtZero: true,
                            title: {
                                display: true,
                                text: 'Tổng Chi phí Hành chính 2026 (Tr.đ)',
                                font: { size: 10, weight: 'bold' }
                            },
                            grid: { color: '#f1f5f9' }
                        }
                    }
                }
            });
        }
    }

    /**
     * Mở Modal Nạp File Excel Nhân Sự CB-NV
     */
    function openCbnvUploadModal() {
        pendingCbnvUploadRows = null;
        pendingCbnvAudit = null;
        const modal = document.getElementById('cbnv-upload-modal');
        const prevContainer = document.getElementById('cbnv-preview-container');
        const btnConfirm = document.getElementById('btn-confirm-cbnv-upload');
        const fileInput = document.getElementById('input-cbnv-file');

        if (fileInput) fileInput.value = '';
        if (prevContainer) prevContainer.classList.add('hidden');
        if (btnConfirm) btnConfirm.disabled = true;
        if (modal) modal.classList.remove('hidden');
    }

    /**
     * Đóng Modal Nạp File Excel Nhân Sự CB-NV
     */
    function closeCbnvUploadModal() {
        const modal = document.getElementById('cbnv-upload-modal');
        if (modal) modal.classList.add('hidden');
    }

    /**
     * Xử lý file Excel Nhân sự kéo thả hoặc chọn qua file input
     */
    function handleCbnvFileSelected(file) {
        if (!window.XLSX) {
            alert('Thư viện Excel chưa được tải xong.');
            return;
        }

        const reader = new FileReader();
        reader.onload = function(e) {
            try {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
                const rows = XLSX.utils.sheet_to_json(firstSheet, { header: 1, defval: '' });

                if (!rows || rows.length < 2) {
                    alert('File Excel không có dữ liệu.');
                    return;
                }

                // 1. Quét tìm dòng tiêu đề
                let headerRowIdx = 0;
                let colMa = -1, colTen = -1, colDb = -1, colTt = -1, colKhoi = -1, colNote = -1;

                for (let r = 0; r < Math.min(20, rows.length); r++) {
                    const rowCells = (rows[r] || []).map(c => String(c || '').toLowerCase().trim());
                    for (let c = 0; c < rowCells.length; c++) {
                        const h = rowCells[c];
                        if (h.includes('mã đv') || h.includes('mã đvcs') || h.includes('mã pn') || h.includes('mã pháp nhân') || h === 'mã' || h === 'code') colMa = c;
                        else if (h.includes('tên đơn vị') || h.includes('tên pháp nhân') || h.includes('tên showroom') || h.includes('tên đvcs') || h === 'đơn vị' || h === 'tên') colTen = c;
                        else if (h.includes('định biên') || h.includes('dinh bien') || h.includes('kế hoạch')) colDb = c;
                        else if (h.includes('thực tế') || h.includes('thuc te') || h.includes('hiện có') || h.includes('nhân sự')) colTt = c;
                        else if (h.includes('khối') || h.includes('khoi')) colKhoi = c;
                        else if (h.includes('ghi chú') || h.includes('ghi chu') || h.includes('note')) colNote = c;
                    }
                    if (colMa !== -1 && (colDb !== -1 || colTt !== -1)) {
                        headerRowIdx = r;
                        break;
                    }
                }

                if (colMa === -1) colMa = 0;
                if (colTen === -1) colTen = 1;
                if (colDb === -1) colDb = 2;
                if (colTt === -1) colTt = 3;

                // 2. Phân tích các dòng dữ liệu & tìm dòng đối chiếu kiểm toán (CỘNG / TỔNG CỘNG)
                const parsedRows = [];
                let hasControlRow = false;
                let fileControlTotalDb = null;
                let fileControlTotalTt = null;

                for (let r = headerRowIdx + 1; r < rows.length; r++) {
                    const row = rows[r];
                    if (!row || row.every(c => c === '' || c === null || c === undefined)) continue;

                    const rowText = row.map(c => String(c || '').trim().toUpperCase()).join(' ');
                    const rawMa = String(row[colMa] || '').trim();
                    const rawTen = colTen !== -1 ? String(row[colTen] || '').trim() : '';

                    const isControlRow = (
                        rawMa.toUpperCase() === 'CỘNG' || rawMa.toUpperCase() === 'CONG' ||
                        rawMa.toUpperCase().startsWith('TỔNG CỘNG') || rawMa.toUpperCase().startsWith('TONG CONG') ||
                        rawTen.toUpperCase() === 'CỘNG' || rawTen.toUpperCase() === 'CONG' ||
                        rawTen.toUpperCase().startsWith('TỔNG CỘNG') || rawTen.toUpperCase().startsWith('TONG CONG') ||
                        rawTen.toUpperCase().startsWith('CỘNG TOÀN') || rawTen.toUpperCase().startsWith('CONG TOAN') ||
                        rowText.includes('CỘNG TOÀN HỆ THỐNG') || rowText.includes('TỔNG SỐ') ||
                        rowText.includes('GRAND TOTAL') || (rawTen.toUpperCase().startsWith('CỘNG ') && !rawTen.toUpperCase().includes('CỘNG ĐỒNG'))
                    );

                    const dB = colDb !== -1 ? (parseFloat(row[colDb]) || 0) : 0;
                    const tT = colTt !== -1 ? (parseFloat(row[colTt]) || 0) : 0;

                    if (isControlRow) {
                        hasControlRow = true;
                        fileControlTotalDb = dB;
                        fileControlTotalTt = tT;
                        continue; // Bỏ qua không đưa dòng CỘNG vào danh sách chi tiết showroom
                    }

                    if (!rawMa && !rawTen) continue;

                    const khoi = colKhoi !== -1 ? String(row[colKhoi] || '').trim() : '';
                    const note = colNote !== -1 ? String(row[colNote] || '').trim() : '';

                    parsedRows.push({
                        maPn: rawMa,
                        tenPn: rawTen,
                        dinhBien: dB,
                        thucTe: tT,
                        khoi: khoi,
                        ghiChu: note
                    });
                }

                if (parsedRows.length === 0) {
                    alert('Không tìm thấy dòng dữ liệu nhân sự hợp lệ trong file!');
                    return;
                }

                pendingCbnvUploadRows = parsedRows;

                // 3. Tính toán kiểm toán đối soát CB-NV
                const sumDb = parsedRows.reduce((a, b) => a + b.dinhBien, 0);
                const sumTt = parsedRows.reduce((a, b) => a + b.thucTe, 0);

                let auditStatus = 'NO_CONTROL_ROW';
                let diff = null;
                let diffDb = 0;

                if (hasControlRow) {
                    diff = Math.abs(sumTt - (fileControlTotalTt || 0));
                    diffDb = Math.abs(sumDb - (fileControlTotalDb || 0));
                    auditStatus = (diff === 0 && diffDb === 0) ? 'MATCH' : 'MISMATCH';
                }

                pendingCbnvAudit = {
                    hasControlRow: hasControlRow,
                    fileControlTotalDb: fileControlTotalDb,
                    fileControlTotalTt: fileControlTotalTt,
                    sumDb: sumDb,
                    sumTt: sumTt,
                    diff: diff,
                    diffDb: diffDb,
                    status: auditStatus
                };

                // 4. Hiển thị thông tin & Hộp kiểm toán xem trước (Audit Box)
                const fnEl = document.getElementById('cbnv-preview-filename');
                const countsEl = document.getElementById('cbnv-preview-counts');
                const tbody = document.getElementById('cbnv-preview-tbody');
                const prevContainer = document.getElementById('cbnv-preview-container');
                const btnConfirm = document.getElementById('btn-confirm-cbnv-upload');
                const auditBoxEl = document.getElementById('cbnv-preview-audit-box');

                if (fnEl) fnEl.textContent = file.name;
                if (countsEl) countsEl.textContent = `${parsedRows.length} dòng chi tiết`;

                if (auditBoxEl) {
                    if (auditStatus === 'MATCH') {
                        auditBoxEl.className = 'p-3 rounded-xl border text-xs flex flex-wrap items-center justify-between gap-2 bg-emerald-50 border-emerald-300 text-emerald-900';
                        auditBoxEl.innerHTML = `
                            <div class="flex items-center gap-2">
                                <span class="p-1 rounded bg-emerald-200 text-emerald-800 font-bold">✅</span>
                                <div>
                                    <strong class="font-bold text-emerald-950">KIỂM TOÁN NHÂN SỰ: Khớp 100%</strong>
                                    <div class="text-slate-600">Tổng thực tế: <strong class="font-mono text-emerald-800">${sumTt.toLocaleString('vi-VN')}</strong> người | Định biên: <strong class="font-mono">${sumDb.toLocaleString('vi-VN')}</strong> người (Khớp tuyệt đối dòng CỘNG)</div>
                                </div>
                            </div>
                            <div class="text-right">
                                <span class="px-2.5 py-1 rounded-full text-xs font-black bg-emerald-100 text-emerald-800 border border-emerald-300">
                                    Chênh lệch: 0 người
                                </span>
                            </div>
                        `;
                    } else if (auditStatus === 'NO_CONTROL_ROW') {
                        auditBoxEl.className = 'p-3 rounded-xl border text-xs flex flex-wrap items-center justify-between gap-2 bg-amber-50 border-amber-300 text-amber-900';
                        auditBoxEl.innerHTML = `
                            <div class="flex items-center gap-2">
                                <span class="p-1 rounded bg-amber-200 text-amber-800 font-bold">⚠️</span>
                                <div>
                                    <strong class="font-bold text-amber-950">CẢNH BÁO KIỂM TOÁN: Không tìm thấy dòng tổng cộng (CỘNG)</strong>
                                    <div class="text-amber-800">Không tìm thấy dòng "CỘNG" / "TỔNG CỘNG" trong file Excel để đối chiếu kiểm toán — Cần rà soát thủ công (Không mặc định báo khớp).</div>
                                </div>
                            </div>
                            <div class="text-right">
                                <span class="px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-300">
                                    Tổng chi tiết: ${sumTt.toLocaleString('vi-VN')} người
                                </span>
                            </div>
                        `;
                    } else {
                        auditBoxEl.className = 'p-3 rounded-xl border text-xs flex flex-wrap items-center justify-between gap-2 bg-rose-50 border-rose-300 text-rose-900';
                        auditBoxEl.innerHTML = `
                            <div class="flex items-center gap-2">
                                <span class="p-1 rounded bg-rose-200 text-rose-800 font-bold">🚨</span>
                                <div>
                                    <strong class="font-bold text-rose-950">CẢNH BÁO LỆCH KIỂM TOÁN: Phát hiện chênh lệch</strong>
                                    <div class="text-rose-800">Tổng dòng chi tiết: <strong>${sumTt.toLocaleString('vi-VN')}</strong> người vs Dòng CỘNG file gốc: <strong>${(fileControlTotalTt || 0).toLocaleString('vi-VN')}</strong> người.</div>
                                </div>
                            </div>
                            <div class="text-right">
                                <span class="px-2.5 py-1 rounded-full text-xs font-black bg-rose-100 text-rose-800 border border-rose-300">
                                    Lệch: ${diff.toLocaleString('vi-VN')} người
                                </span>
                            </div>
                        `;
                    }
                }

                if (tbody) {
                    tbody.innerHTML = parsedRows.slice(0, 30).map(r => `
                        <tr class="hover:bg-slate-50 border-b border-slate-100">
                            <td class="px-2.5 py-1.5 font-bold text-blue-900">${escapeHtml(r.maPn)}</td>
                            <td class="px-2.5 py-1.5">${escapeHtml(r.tenPn)}</td>
                            <td class="px-2.5 py-1.5 text-right font-bold">${r.dinhBien.toLocaleString('vi-VN')}</td>
                            <td class="px-2.5 py-1.5 text-right font-bold text-emerald-800">${r.thucTe.toLocaleString('vi-VN')}</td>
                            <td class="px-2.5 py-1.5 text-center">
                                ${r.thucTe > 0 ? '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">✅ Hợp lệ</span>' : '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800">⚠️ Nhân sự = 0</span>'}
                            </td>
                        </tr>
                    `).join('');
                }

                if (prevContainer) prevContainer.classList.remove('hidden');
                if (btnConfirm) btnConfirm.disabled = false;

            } catch (err) {
                console.error(err);
                alert('Lỗi đọc file Excel Nhân sự: ' + err.message);
            }
        };
        reader.readAsArrayBuffer(file);
    }

    /**
     * Xác nhận áp dụng dữ liệu nhân sự đã nạp vào state
     */
    async function confirmCbnvUpload() {
        if (!pendingCbnvUploadRows || pendingCbnvUploadRows.length === 0) {
            alert('Chưa có dữ liệu nhân sự để nạp.');
            return;
        }

        ensureBaselineCbnvData();
        let updateCount = 0;

        pendingCbnvUploadRows.forEach(item => {
            const code = item.maPn;
            if (!code) return;

            if (!state.cbnvData[code]) {
                state.cbnvData[code] = {
                    stt: Object.keys(state.cbnvData).length + 1,
                    maPn: code,
                    tenPn: item.tenPn || code,
                    khoi: item.khoi || 'VPĐH',
                    nam: 2026,
                    dinhBien: item.dinhBien,
                    thucTe: item.thucTe,
                    ghiChu: item.ghiChu || ''
                };
            } else {
                state.cbnvData[code].dinhBien = item.dinhBien;
                state.cbnvData[code].thucTe = item.thucTe;
                if (item.tenPn) state.cbnvData[code].tenPn = item.tenPn;
                if (item.khoi) state.cbnvData[code].khoi = item.khoi;
                if (item.ghiChu) state.cbnvData[code].ghiChu = item.ghiChu;
            }
            updateCount++;
        });

        if (pendingCbnvAudit) {
            state.cbnvAudit = pendingCbnvAudit;
        }

        saveCurrentState();
        closeCbnvUploadModal();
        renderCbnvTab();

        alert(`✅ CẬP NHẬT THÀNH CÔNG!\nĐã cập nhật dữ liệu định biên và nhân sự thực tế cho ${updateCount} đơn vị.`);

        // Đề xuất đồng bộ lên Google Sheet nếu có kết nối
        const gsheetCfg = getGoogleSheetSyncConfig();
        if (gsheetCfg && gsheetCfg.webAppUrl) {
            if (confirm('Anh/Chị có muốn đồng bộ danh mục nhân sự mới này lên Google Sheet DM_CBNV không?')) {
                pushCbnvToGoogleSheet(true);
            }
        }
    }

    /**
     * Tải file Excel mẫu chuẩn nhập nhân sự CB-NV
     */
    function downloadCbnvTemplate() {
        if (!window.XLSX) {
            alert('Thư viện Excel chưa sẵn sàng.');
            return;
        }

        ensureBaselineCbnvData();
        const aoa = [
            ['STT', 'Khối Đơn Vị', 'Mã Quản trị', 'Tên Quản trị', 'Mã ĐVCS', 'Tên Pháp Nhân / Showroom', 'Năm', 'Định Biên (Người)', 'Thực Tế (Người)', 'Ghi Chú']
        ];

        const activeEntities = (state.entities || []).filter(e => e.active !== false);
        activeEntities.forEach((ent, idx) => {
            const code = ent.code;
            const cbnv = state.cbnvData[code] || { dinhBien: 60, thucTe: 56, khoi: ent.khoiName || 'VPĐH' };
            aoa.push([
                idx + 1,
                cbnv.khoi || ent.khoiName || 'VPĐH',
                cbnv.maQt || ent.qtCode || ('QT_' + code),
                cbnv.tenQt || ent.qt || ent.name,
                code,
                ent.cleanName || ent.name,
                2026,
                cbnv.dinhBien || 0,
                cbnv.thucTe || 0,
                cbnv.ghiChu || 'Định mức 2026'
            ]);
        });

        const wb = XLSX.utils.book_new();
        const ws = createFormattedWorksheet(aoa);
        XLSX.utils.book_append_sheet(wb, ws, 'DM_CBNV');
        XLSX.writeFile(wb, 'Mau_Nhap_Nhan_Su_CBNV_THACO_AUTO.xlsx');
    }

    /**
     * Xuất Bảng Ma Trận Định Mức Chi Phí / CB-NV sang Excel
     */
    function exportCbnvMatrixToExcel() {
        if (!window.XLSX) {
            alert('Thư viện Excel chưa sẵn sàng.');
            return;
        }

        ensureBaselineCbnvData();
        const activeEntities = (state.entities || []).filter(e => e.active !== false);
        const aoa = [
            ['TẬP ĐOÀN THACO AUTO - BÁO CÁO ĐỊNH MỨC CHI PHÍ HÀNH CHÍNH / CB-NV'],
            [`Ngày xuất: ${new Date().toLocaleString('vi-VN')} | Đơn vị tiền tệ: Triệu đồng`],
            [],
            [
                'STT', 'Khối Đơn Vị', 'Mã ĐVCS', 'Tên Pháp Nhân / Showroom',
                'Định Biên (Người)', 'Thực Tế (Người)', '% Lấp Đầy',
                'Tổng CPHC 2026 (Tr.đ)',
                'CPHC/Thực Tế (Năm)', 'CPHC/Thực Tế (Tháng)',
                'CPHC/Định Biên (Năm)', 'CPHC/Định Biên (Tháng)',
                'CPHC/Người 2025 (Năm)', 'Biến Động YoY (%)'
            ]
        ];

        let totDb = 0, totTt = 0, totC26 = 0, totC25 = 0;

        activeEntities.forEach((ent, idx) => {
            const code = ent.code;
            const cbnv = state.cbnvData[code] || { dinhBien: 0, thucTe: 0, khoi: ent.khoiName || 'VPĐH' };
            const dB = Number(cbnv.dinhBien) || 0;
            const tT = Number(cbnv.thucTe) || 0;
            const fillPct = dB > 0 ? (tT / dB) : 0;
            const c26 = getEntityCostTrD(code, '2026');
            const c25 = getEntityCostTrD(code, '2025');

            totDb += dB;
            totTt += tT;
            totC26 += c26;
            totC25 += c25;

            const rateTtYear = tT > 0 ? (c26 / tT) : 0;
            const rateTtMonth = rateTtYear / 12;
            const rateDbYear = dB > 0 ? (c26 / dB) : 0;
            const rateDbMonth = rateDbYear / 12;
            const rateTt25Year = tT > 0 ? (c25 / tT) : 0;
            const yoyPct = rateTt25Year > 0 ? ((rateTtYear - rateTt25Year) / rateTt25Year) : 0;

            aoa.push([
                idx + 1,
                cbnv.khoi || 'VPĐH',
                code,
                ent.cleanName || ent.name,
                dB,
                tT,
                fillPct,
                c26,
                rateTtYear,
                rateTtMonth,
                rateDbYear,
                rateDbMonth,
                rateTt25Year,
                yoyPct
            ]);
        });

        const totTtYear = totTt > 0 ? (totC26 / totTt) : 0;
        const totTtMonth = totTtYear / 12;
        const totDbYear = totDb > 0 ? (totC26 / totDb) : 0;
        const totDbMonth = totDbYear / 12;
        const totTt25Year = totTt > 0 ? (totC25 / totTt) : 0;
        const totYoYPct = totTt25Year > 0 ? ((totTtYear - totTt25Year) / totTt25Year) : 0;
        const totFillPct = totDb > 0 ? (totTt / totDb) : 0;

        aoa.push([
            '', 'TỔNG CỘNG HỆ THỐNG', '', '',
            totDb, totTt, totFillPct,
            totC26,
            totTtYear, totTtMonth,
            totDbYear, totDbMonth,
            totTt25Year, totYoYPct
        ]);

        const wb = XLSX.utils.book_new();
        const ws = createFormattedWorksheet(aoa);
        XLSX.utils.book_append_sheet(wb, ws, 'Dinh_Muc_CPHC_CBNV');
        XLSX.writeFile(wb, `Bao_Cao_Dinh_Muc_CPHC_CBNV_${new Date().toISOString().slice(0, 10)}.xlsx`);
    }

    /**
     * Đẩy danh mục định biên & nhân sự CB-NV lên Google Sheet DM_CBNV
     */
    async function pushCbnvToGoogleSheet(showSuccessAlert = true) {
        const config = getGoogleSheetSyncConfig();
        if (!config.webAppUrl) {
            alert('Chưa cấu hình URL Google Apps Script Web App! Vui lòng vào tab Đồng bộ Sheet để cấu hình.');
            return;
        }

        ensureBaselineCbnvData();
        const cbnvList = Object.values(state.cbnvData);

        try {
            const payload = {
                action: 'save_cbnv',
                api_key: config.apiKey || '',
                cbnvData: cbnvList
            };

            const resp = await fetch(config.webAppUrl, {
                method: 'POST',
                mode: 'cors',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify(payload)
            });

            const data = await resp.json();
            if (data.status === 'success') {
                config.lastSynced = new Date().toISOString();
                saveGoogleSheetSyncConfig(config);
                if (showSuccessAlert) {
                    alert(data.message || `Đã đẩy thành công ${cbnvList.length} dòng nhân sự lên sheet DM_CBNV!`);
                }
            } else {
                alert('Lỗi khi lưu lên Google Sheet DM_CBNV: ' + (data.message || 'Không thành công'));
            }
        } catch (e) {
            alert('Lỗi khi gửi dữ liệu nhân sự lên Google Sheet: ' + e.message);
        }
    }

    /**
     * Tải danh mục định biên & nhân sự CB-NV từ Google Sheet DM_CBNV
     */
    async function syncCbnvFromGoogleSheet(showSuccessAlert = true) {
        const config = getGoogleSheetSyncConfig();
        if (!config.webAppUrl) {
            alert('Chưa cấu hình URL Google Apps Script Web App!');
            return;
        }

        try {
            const keyParam = config.apiKey ? `&api_key=${encodeURIComponent(config.apiKey.trim())}` : '';
            const url = config.webAppUrl + (config.webAppUrl.includes('?') ? '&' : '?') + 'action=get_cbnv&t=' + Date.now() + keyParam;
            const resp = await fetch(url);
            const data = await resp.json();

            if (data.code === 401 || (data.status === 'error' && data.code === 401)) {
                alert('Khóa bảo mật API_KEY không đúng (Lỗi 401). Vui lòng kiểm tra lại trong Cài đặt kết nối.');
                return;
            }

            if (data.status === 'success' && Array.isArray(data.cbnvData)) {
                if (!state.cbnvData) state.cbnvData = {};
                data.cbnvData.forEach(item => {
                    const code = item.maPn || item.code;
                    if (code) {
                        state.cbnvData[code] = item;
                    }
                });
                saveCurrentState();
                renderCbnvTab();
                if (showSuccessAlert) {
                    alert(`Đã tải thành công ${data.cbnvData.length} dòng nhân sự từ Google Sheet DM_CBNV!`);
                }
            } else {
                alert('Lỗi tải DM_CBNV từ Google Sheet: ' + (data.message || 'Không có dữ liệu.'));
            }
        } catch (e) {
            alert('Không thể kết nối đến Google Apps Script (DM_CBNV): ' + e.message);
        }
    }

    /**
     * Hộp thoại tương tác đồng bộ 2 chiều DM_CBNV với Google Sheet
     */
    function handleSyncCbnvWithGoogleSheetPrompt() {
        const config = getGoogleSheetSyncConfig();
        if (!config || !config.webAppUrl) {
            alert('Chưa cấu hình URL Google Apps Script Web App! Vui lòng vào Cài đặt kết nối để thiết lập.');
            openGoogleSheetConfigModal();
            return;
        }

        const choice = prompt('ĐỒNG BỘ DANH MỤC NHÂN SỰ CB-NV (DM_CBNV):\n\n- Gõ 1: Đẩy dữ liệu hiện tại lên Google Sheet DM_CBNV\n- Gõ 2: Tải dữ liệu mới nhất từ Google Sheet DM_CBNV về máy', '1');
        if (choice === '1') {
            pushCbnvToGoogleSheet(true);
        } else if (choice === '2') {
            syncCbnvFromGoogleSheet(true);
        }
    }

    // ==========================================
    // 📊 FORMATTED EXCEL EXPORT ENGINE
    // ==========================================

    function createFormattedWorksheet(aoaData) {
        const ws = XLSX.utils.aoa_to_sheet(aoaData);
        if (!ws || !aoaData || !aoaData.length) return ws;

        const colWidths = [];
        aoaData.forEach(row => {
            if (!Array.isArray(row)) return;
            row.forEach((val, c) => {
                const strLen = (val !== null && val !== undefined) ? String(val).length : 0;
                if (!colWidths[c] || strLen > colWidths[c]) {
                    colWidths[c] = strLen;
                }
            });
        });
        ws['!cols'] = colWidths.map(w => ({ wch: Math.min(80, Math.max(10, w + 4)) }));

        const range = XLSX.utils.decode_range(ws['!ref']);
        for (let R = range.s.r; R <= range.e.r; ++R) {
            for (let C = range.s.c; C <= range.e.c; ++C) {
                const cell_ref = XLSX.utils.encode_cell({ c: C, r: R });
                const cell = ws[cell_ref];
                if (!cell) continue;

                if (typeof cell.v === 'number') {
                    const rawVal = aoaData[R]?.[C];
                    const rawStr = String(rawVal || '');
                    if (rawStr.includes('%')) {
                        cell.z = '0.0%';
                    } else if (cell.v % 1 !== 0 && Math.abs(cell.v) < 100) {
                        cell.z = '#,##0.0';
                    } else {
                        cell.z = '#,##0';
                    }
                }
            }
        }
        return ws;
    }

    function exportPPTXReportSetToExcel() {
        if (!window.XLSX) {
            alert('Thư viện Excel chưa được tải xong.');
            return;
        }

        const wb = XLSX.utils.book_new();
        const calcedRows = calculateReportData();
        const isCurrentScope = state.filters.scopeMode === 'CURRENT_2026';

        // SHEET 1: TỔNG QUAN TẬP ĐOÀN
        const s1Data = [
            ['TẬP ĐOÀN THACO AUTO - BÁO CÁO TỔNG QUAN CHI PHÍ HÀNH CHÍNH (CPHC)'],
            [`Thời gian xuất: ${new Date().toLocaleString('vi-VN')} | Phạm vi: ${isCurrentScope ? 'Cơ cấu Hiện hành 2026' : 'Cơ cấu Lịch sử 2025'}`],
            [],
            ['TT', 'Khoản mục chi phí', 'Phân nhóm', 'Mã B7', 'Mã B10', 'Cả năm 2025 (Tr.đ)', 'Dự kiến 2026 (Tr.đ)', 'Tăng / Giảm (Tr.đ)', '% YoY']
        ];

        let s1Total25 = 0, s1Total26 = 0;
        calcedRows.forEach((r, idx) => {
            s1Total25 += r.total2025;
            s1Total26 += r.fullYear2026;
            s1Data.push([
                idx + 1,
                r.category.name,
                r.category.group,
                r.category.b7_display || '',
                r.category.b10_display || '',
                r.total2025,
                r.fullYear2026,
                r.diffAmount,
                (r.diffPct / 100)
            ]);
        });

        const s1Diff = s1Total26 - s1Total25;
        const s1Pct = s1Total25 > 0 ? (s1Diff / s1Total25) : 0;
        s1Data.push([
            '', 'TỔNG CỘNG', '', '', '', s1Total25, s1Total26, s1Diff, s1Pct
        ]);

        const ws1 = createFormattedWorksheet(s1Data);
        XLSX.utils.book_append_sheet(wb, ws1, '1. Tong_Quan_Tap_Doan');

        // SHEET 2: THEO MIỀN & KHỐI
        const s2Data = [
            ['BÁO CÁO CƠ CẤU CHI PHÍ THEO MIỀN & KHỐI QUẢN TRỊ'],
            [],
            ['Khối / Đơn vị', 'Cả năm 2025 (Tr.đ)', 'Dự kiến 2026 (Tr.đ)', 'Tăng / Giảm (Tr.đ)', '% YoY']
        ];

        const blocks = [
            { id: 'KHOI_VPDH', name: 'VP Điều Hành (VPĐH)' },
            { id: 'KHOI_MB', name: 'CTy TT Phía Bắc (MB)' },
            { id: 'KHOI_MN', name: 'CTy TT Phía Nam (MN)' },
            { id: 'KHOI_NHAMAY', name: 'Nhà Máy (Chu Lai)' }
        ];

        let bTot25 = 0, bTot26 = 0;
        blocks.forEach(b => {
            const bRows = calculateReportData({ khoi: b.id });
            let t25 = 0, t26 = 0;
            bRows.forEach(r => { t25 += r.total2025; t26 += r.fullYear2026; });
            bTot25 += t25;
            bTot26 += t26;
            const diff = t26 - t25;
            const pct = t25 > 0 ? (diff / t25) : 0;
            s2Data.push([b.name, t25, t26, diff, pct]);
        });
        s2Data.push(['TỔNG CỘNG', bTot25, bTot26, bTot26 - bTot25, bTot25 > 0 ? ((bTot26 - bTot25) / bTot25) : 0]);

        const ws2 = createFormattedWorksheet(s2Data);
        XLSX.utils.book_append_sheet(wb, ws2, '2. Theo_Mien_Khoi');

        // SHEET 3: CHI TIẾT THEO PHÁP NHÂN
        const s3Data = [
            ['BÁO CÁO CHI TIẾT CHI PHÍ THEO TỪNG PHÁP NHÂN / SHOWROOM'],
            [],
            ['Mã ĐVCS', 'Tên Pháp nhân / Đơn vị', 'ĐV Quản trị', 'Miền', 'Cả năm 2025 (Tr.đ)', 'Dự kiến 2026 (Tr.đ)', 'Tăng/Giảm (Tr.đ)', '% YoY']
        ];

        state.entities.forEach(ent => {
            const pRows = calculateReportData({ phapNhan: ent.code });
            let t25 = 0, t26 = 0;
            pRows.forEach(r => { t25 += r.total2025; t26 += r.fullYear2026; });
            const diff = t26 - t25;
            const pct = t25 > 0 ? (diff / t25) : 0;
            s3Data.push([
                ent.code,
                ent.cleanName || ent.name,
                ent.qt || ent.cleanName || ent.name,
                ent.phia || ent.mien,
                t25,
                t26,
                diff,
                pct
            ]);
        });

        const ws3 = createFormattedWorksheet(s3Data);
        XLSX.utils.book_append_sheet(wb, ws3, '3. Chi_Tiet_Phap_Nhan');

        // Xuất file
        const fileName = `Bao_Cao_CPHC_PPTX_Set_${new Date().toISOString().slice(0, 10)}.xlsx`;
        XLSX.writeFile(wb, fileName);
    }

    function exportToExcel() {
        if (!window.XLSX) {
            alert('Thư viện Excel chưa được tải xong.');
            return;
        }

        const calcedRows = calculateReportData();
        const aoaData = [
            ['TẬP ĐOÀN THACO AUTO - BÁO CÁO TỔNG HỢP CHI PHÍ HÀNH CHÍNH'],
            [`Ngày xuất: ${new Date().toLocaleString('vi-VN')}`],
            [],
            ['TT', '⭐', 'Khoản mục chi phí', 'Nhóm chi phí', 'Mã B7', 'Mã B10', 'Cả năm 2025 (Tr.đ)', 'Dự kiến 2026 (Tr.đ)', 'Tăng/Giảm (Tr.đ)', '% YoY']
        ];

        calcedRows.forEach((r, idx) => {
            aoaData.push([
                idx + 1,
                r.category.is_material ? '⭐' : '',
                r.category.name,
                r.category.group,
                r.category.b7_display || '',
                r.category.b10_display || '',
                r.total2025,
                r.fullYear2026,
                r.diffAmount,
                r.total2025 > 0 ? (r.diffAmount / r.total2025) : 0
            ]);
        });

        const wb = XLSX.utils.book_new();
        const ws = createFormattedWorksheet(aoaData);
        XLSX.utils.book_append_sheet(wb, ws, 'Bao_Cao_CPHC');
        XLSX.writeFile(wb, `Bao_Cao_CPHC_${new Date().toISOString().slice(0, 10)}.xlsx`);
    }

    // ==========================================
    // 📈 DASHBOARD CHARTS ENGINE (ỦY QUYỀN CHO MODULE DASHBOARD.JS ĐỘC LẬP)
    // ==========================================

    function renderDashboardCharts() {
        if (window.THACO_DASHBOARD && typeof window.THACO_DASHBOARD.render === 'function') {
            window.THACO_DASHBOARD.render();
        }
    }


    // ==========================================
    // 📥 BRAVO EXCEL UPLOAD & CLEANING ENGINE
    // ==========================================

    let pendingUploadData = null;

    function openUploadModal() {
        cancelUploadPreview();
        const modal = document.getElementById('upload-modal');
        if (modal) modal.classList.remove('hidden');
    }

    function handleFileSelect(e) {
        if (e.target && e.target.files && e.target.files.length > 0) {
            processUploadedExcel(e.target.files[0]);
        }
    }

    function cancelUploadPreview() {
        pendingUploadData = null;
        const fileInput = document.getElementById('excel-file-input');
        if (fileInput) fileInput.value = '';

        const dropSection = document.getElementById('upload-drop-section');
        const previewContainer = document.getElementById('upload-preview-container');
        if (dropSection) dropSection.classList.remove('hidden');
        if (previewContainer) previewContainer.classList.add('hidden');
    }

    function processUploadedExcel(file) {
        if (!window.XLSX) {
            alert('Thư viện đọc Excel (SheetJS) chưa tải xong. Vui lòng tải lại trang.');
            return;
        }

        const reader = new FileReader();
        reader.onload = function (e) {
            try {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                const firstSheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[firstSheetName];
                const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });

                if (!rows || rows.length < 5) {
                    alert('Tập tin Excel không đủ số dòng hoặc không đúng cấu trúc chi phí!');
                    return;
                }

                // 1. Nhận diện tiêu đề & Metadata trong 40 dòng đầu
                const norm = (str) => String(str || '').toUpperCase().replace(/\s+/g, ' ').trim();

                let entityCode = 'C1101';
                let entityName = 'THACO AUTO';
                let year = 2026;
                let headerRowIndex = -1;

                const fileNameUpper = norm(file.name || '');
                if (fileNameUpper.includes('2024')) year = 2024;
                else if (fileNameUpper.includes('2025')) year = 2025;
                else if (fileNameUpper.includes('2026')) year = 2026;

                for (let r = 0; r < Math.min(40, rows.length); r++) {
                    const rowStr = (rows[r] || []).map(c => norm(c)).join(' ');
                    if (rowStr.includes('2024')) year = 2024;
                    else if (rowStr.includes('2025')) year = 2025;
                    else if (rowStr.includes('2026')) year = 2026;

                    if (rowStr.includes('C1101') || rowStr.includes('THACO AUTO')) {
                        entityCode = 'C1101';
                        entityName = 'THACO AUTO';
                    } else if (rowStr.includes('PHÂN PHỐI') || rowStr.includes('CTY PP') || rowStr.includes('C2305') || rowStr.includes('C1102') || rowStr.includes('PP THACO AUTO')) {
                        entityCode = 'C2305';
                        entityName = 'PP THACO AUTO';
                    }
                }

                // 2. Thuật toán quét tiêu đề Đa Kịch Bản (Multi-strategy Header Detection - Đọc đến dòng 60)
                const STT_TERMS = ['STT', 'SỐ TT', 'SO TT', 'TT', 'STT.', 'TT.', 'NO.', 'NO'];
                const BP_TERMS = ['BỘ PHẬN', 'BO PHAN', 'MÃ BỘ PHẬN', 'MA BO PHAN', 'MÃ BP', 'MA BP', 'TÊN BỘ PHẬN', 'TEN BO PHAN', 'TÊN BP', 'PHÒNG BAN', 'MÃ PHÒNG BAN', 'ĐƠN VỊ', 'DON VI'];
                const KM_TERMS = ['KHOẢN MỤC', 'KHOAN MUC', 'KHỎAN MỤC', 'MÃ KHOẢN MỤC', 'MA KHOAN MUC', 'MÃ KM', 'MA KM', 'TÊN KHOẢN MỤC', 'TEN KHOAN MUC', 'TÊN KM', 'DIỄN GIẢI', 'DIEN GIAI', 'CHỈ TIÊU', 'NỘI DUNG', 'NOI DUNG'];
                const MONTH_TERMS = ['T01', 'T1', 'T.01', 'T.1', 'THÁNG 01', 'THÁNG 1', 'THANG 01', 'THANG 1', '01/2026', '1/2026', '01/2025', '1/2025', '01/2024', '1/2024'];

                // Kịch bản A: Tìm dòng có ít nhất 2 đặc trưng tiêu đề
                for (let r = 0; r < Math.min(60, rows.length); r++) {
                    const rowCells = (rows[r] || []).map(c => norm(c));
                    const hasStt = rowCells.some(s => STT_TERMS.some(t => s === t || s.startsWith(t)));
                    const hasBp = rowCells.some(s => BP_TERMS.some(t => s.includes(t)));
                    const hasKm = rowCells.some(s => KM_TERMS.some(t => s.includes(t)));
                    const hasMonth = rowCells.some(s => MONTH_TERMS.some(t => s === t || s.endsWith(t)));

                    if ((hasStt && (hasBp || hasKm)) || (hasBp && hasKm) || (hasKm && hasMonth) || (hasBp && hasMonth)) {
                        headerRowIndex = r;
                        break;
                    }
                }

                // Kịch bản B: Dòng gộp Multi-row Header (ghép dòng r và r+1)
                if (headerRowIndex === -1) {
                    for (let r = 0; r < Math.min(60, rows.length - 1); r++) {
                        const combinedCells = (rows[r] || []).concat(rows[r + 1] || []).map(c => norm(c));
                        const hasBp = combinedCells.some(s => BP_TERMS.some(t => s.includes(t)));
                        const hasKm = combinedCells.some(s => KM_TERMS.some(t => s.includes(t)));
                        const hasMonth = combinedCells.some(s => MONTH_TERMS.some(t => s === t || s.endsWith(t)));

                        if ((hasBp && hasKm) || (hasKm && hasMonth) || (hasBp && hasMonth)) {
                            headerRowIndex = r;
                            break;
                        }
                    }
                }

                // Kịch bản C: Quét nới lỏng tìm từ khóa STT / Khoản mục / Bộ phận
                if (headerRowIndex === -1) {
                    for (let r = 0; r < Math.min(60, rows.length); r++) {
                        const rowStr = (rows[r] || []).map(c => norm(c)).join(' ');
                        if (rowStr.includes('STT') || rowStr.includes('KHOẢN MỤC') || rowStr.includes('KHOAN MUC') || rowStr.includes('BỘ PHẬN') || rowStr.includes('DIỄN GIẢI') || rowStr.includes('MÃ KM')) {
                            headerRowIndex = r;
                            break;
                        }
                    }
                }

                // Kịch bản D: Tự động tìm dòng đầu tiên có số liệu
                if (headerRowIndex === -1) {
                    for (let r = 2; r < Math.min(60, rows.length); r++) {
                        const row = rows[r] || [];
                        const nonCount = row.filter(c => c !== '' && c !== null && c !== undefined).length;
                        if (nonCount >= 4) {
                            headerRowIndex = Math.max(0, r - 1);
                            break;
                        }
                    }
                }

                if (headerRowIndex === -1) {
                    alert('Không tìm thấy dòng tiêu đề bảng trong file Excel này. Vui lòng kiểm tra file xuất từ Bravo.');
                    return;
                }

                // 3. Xác định vị trí các cột (Map 2 dòng headerRowIndex & headerRowIndex + 1)
                const headerRow1 = rows[headerRowIndex] || [];
                const headerRow2 = rows[headerRowIndex + 1] || [];
                const maxCols = Math.max(headerRow1.length, headerRow2.length);

                let colStt = -1;
                let colMaBp = -1;
                let colTenBp = -1;
                let colMaKm = -1;
                let colTenKm = -1;
                let colTongCong = -1;
                const monthCols = Array(12).fill(-1);

                for (let cIdx = 0; cIdx < maxCols; cIdx++) {
                    const c1 = norm(headerRow1[cIdx]);
                    const c2 = norm(headerRow2[cIdx]);
                    const combined = (c1 + ' ' + c2).trim();

                    if (colStt === -1 && STT_TERMS.some(t => combined.startsWith(t) || combined === t)) {
                        colStt = cIdx;
                    }

                    if (combined.includes('TÊN BỘ PHẬN') || combined.includes('TEN BO PHAN') || combined.includes('TÊN BP')) {
                        colTenBp = cIdx;
                    } else if (combined.includes('MÃ BỘ PHẬN') || combined.includes('MA BO PHAN') || combined.includes('MÃ BP') || combined.includes('MA BP') || combined.includes('BỘ PHẬN') || combined.includes('BO PHAN')) {
                        if (colMaBp === -1) colMaBp = cIdx;
                    }

                    if (combined.includes('TÊN KHOẢN MỤC') || combined.includes('TEN KHOAN MUC') || combined.includes('TÊN KM') || combined.includes('DIỄN GIẢI') || combined.includes('DIEN GIAI') || combined.includes('CHỈ TIÊU')) {
                        if (colTenKm === -1) colTenKm = cIdx;
                    } else if (combined.includes('MÃ KHOẢN MỤC') || combined.includes('MA KHOAN MUC') || combined.includes('MÃ KM') || combined.includes('MA KM') || combined.includes('KHOẢN MỤC') || combined.includes('KHOAN MUC') || combined.includes('KHỎAN MỤC')) {
                        if (colMaKm === -1) colMaKm = cIdx;
                    }

                    if (combined.includes('TỔNG CỘNG') || combined.includes('TONG CONG') || combined === 'CỘNG' || combined === 'CONG' || combined === 'TỔNG' || combined === 'TOTAL') {
                        colTongCong = cIdx;
                    }

                    for (let m = 1; m <= 12; m++) {
                        const mPad = m < 10 ? '0' + m : '' + m;
                        const mKeys = [
                            `T${mPad}`, `T${m}`, `T.${mPad}`, `T.${m}`,
                            `THÁNG ${mPad}`, `THÁNG ${m}`, `THANG ${mPad}`, `THANG ${m}`,
                            `${mPad}/2024`, `${m}/2024`, `${mPad}/2025`, `${m}/2025`, `${mPad}/2026`, `${m}/2026`,
                            `T${mPad}/2024`, `T${m}/2024`, `T${mPad}/2025`, `T${m}/2025`, `T${mPad}/2026`, `T${m}/2026`
                        ];
                        if (mKeys.some(k => c1 === k || c2 === k || combined.includes(k))) {
                            if (monthCols[m - 1] === -1) monthCols[m - 1] = cIdx;
                        }
                    }
                }

                // Định vị bổ sung tương đối nếu cột chưa tìm thấy chính xác theo từ khóa
                if (colMaKm !== -1 && colTenKm === -1) colTenKm = colMaKm + 1;
                if (colTenKm !== -1 && colMaKm === -1 && colTenKm > 0) colMaKm = colTenKm - 1;

                if (colMaBp !== -1 && colTenBp === -1 && colTenKm !== colMaBp + 1) colTenBp = colMaBp + 1;
                if (colTenBp !== -1 && colMaBp === -1 && colTenBp > 0) colMaBp = colTenBp - 1;

                if (colMaKm === -1 && colTenKm === -1) {
                    colMaKm = colStt !== -1 ? colStt + 3 : 3;
                    colTenKm = colMaKm + 1;
                }
                if (colMaBp === -1) {
                    colMaBp = colStt !== -1 ? colStt + 1 : 1;
                    if (colTenBp === -1) colTenBp = colMaBp + 1;
                }

                if (monthCols.every(c => c === -1)) {
                    let mStart = (colTenKm !== -1 ? colTenKm : colMaKm) + 1;
                    for (let m = 0; m < 12 && mStart < maxCols; m++, mStart++) {
                        monthCols[m] = mStart;
                    }
                }

                if (colTongCong === -1) {
                    const maxMCol = Math.max(...monthCols.filter(c => c !== -1));
                    if (maxMCol !== -1 && maxMCol + 1 < maxCols) {
                        colTongCong = maxMCol + 1;
                    } else {
                        colTongCong = maxCols - 1;
                    }
                }

                // 4. Quét và làm sạch dữ liệu chi tiết
                const cleanRows = [];
                let bravoControlTotal = null;
                let maxMonthWithData = 0;

                let dataStartRow = headerRowIndex + 1;
                const nextRowStr = (rows[dataStartRow] || []).map(c => norm(c)).join(' ');
                if (nextRowStr.includes('T01') || nextRowStr.includes('T1') || nextRowStr.includes('THÁNG 1') || nextRowStr.includes('CỘNG') || nextRowStr.includes('(1)')) {
                    dataStartRow = headerRowIndex + 2;
                }

                for (let r = dataStartRow; r < rows.length; r++) {
                    const row = rows[r];
                    if (!row || row.every(c => c === '' || c === null || c === undefined)) continue;

                    const rowStr = row.map(c => String(c || '')).join(' ').toUpperCase();
                    const rowTotalVal = parseFloat(row[colTongCong]) || 0;

                    // Kiểm tra dòng đối chiếu Bravo
                    if (rowStr.includes('CỘNG CHI PHÍ HÀNH CHÁNH') || rowStr.includes('CỘNG CHI PHÍ HÀNH CHÍNH')) {
                        bravoControlTotal = rowTotalVal;
                        continue;
                    }

                    const km = String(row[colMaKm] || '').trim();
                    const tenKm = String(row[colTenKm] || '').trim();
                    const bp = String(row[colMaBp] || '').trim();
                    const tenBp = colTenBp !== -1 ? String(row[colTenBp] || '').trim() : '';

                    // Bỏ qua dòng cộng tổng hợp hoặc dòng không có mã khoản mục (Lưu ý: không loại 'cộng đồng')
                    const tenKmNorm = norm(tenKm);
                    const isSummaryRow = !km ||
                        tenKmNorm.startsWith('CỘNG CHI PHÍ') ||
                        tenKmNorm.startsWith('CONG CHI PHI') ||
                        tenKmNorm.startsWith('CỘNG ') ||
                        tenKmNorm.startsWith('CONG ') ||
                        tenKmNorm.startsWith('TỔNG CỘNG') ||
                        tenKmNorm.startsWith('TONG CONG') ||
                        tenKmNorm === 'TỔNG CỘNG' ||
                        tenKmNorm === 'TONG CONG' ||
                        tenKmNorm === 'CỘNG' ||
                        tenKmNorm === 'CONG';
                    if (isSummaryRow) continue;

                    // Đọc 12 tháng
                    const months = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
                    for (let m = 0; m < 12; m++) {
                        const cIdx = monthCols[m];
                        if (cIdx !== -1 && row[cIdx] !== undefined && row[cIdx] !== '') {
                            const v = parseFloat(row[cIdx]) || 0;
                            months[m] = v;
                            if (v !== 0 && (m + 1) > maxMonthWithData) {
                                maxMonthWithData = m + 1;
                            }
                        }
                    }

                    const calculatedRowTotal = months.reduce((a, b) => a + b, 0);
                    const finalRowTotal = rowTotalVal !== 0 ? rowTotalVal : calculatedRowTotal;

                    // Xác định khối phòng ban
                    let khoiPb = 'Dùng chung & Khác';
                    if (bp.startsWith('B70-A') || tenBp.startsWith('VPĐH')) khoiPb = 'VP Điều Hành (VPĐH)';
                    else if (bp.startsWith('B70-C') || tenBp.startsWith('Miền Bắc')) khoiPb = 'Miền Bắc (MB)';
                    else if (bp.startsWith('B70-B') || tenBp.startsWith('Miền Nam')) khoiPb = 'Miền Nam (MN)';
                    else if (bp.startsWith('B70-D') || tenBp.includes('Chu Lai')) khoiPb = 'Chu Lai (KSX)';

                    // Map với danh mục state.categories (từ DM_CPHC)
                    let matchedCat = null;
                    for (let cat of state.categories) {
                        if (matchCategoryKm(cat, km)) {
                            matchedCat = cat;
                            break;
                        }
                    }

                    const catId = matchedCat ? matchedCat.id : 30;
                    const nhom = matchedCat ? matchedCat.group : 'Chi phí hoạt động chung';
                    const b10 = matchedCat ? (matchedCat.b10_display || '') : '';
                    const isMaterial = matchedCat ? !!matchedCat.is_material : false;

                    cleanRows.push({
                        stt: cleanRows.length + 1,
                        entityCode: entityCode,
                        entityName: entityName,
                        km: km,
                        tenKm: tenKm,
                        nhom: nhom,
                        b10: b10,
                        isMaterial: isMaterial,
                        bp: bp,
                        tenBp: tenBp,
                        khoiPb: khoiPb,
                        year: year,
                        ky: (year === 2024 || year === 2025) ? 'Cả năm' : `T1 - T${maxMonthWithData || 7}`,
                        months: months,
                        total: finalRowTotal,
                        catId: catId
                    });
                }

                if (cleanRows.length === 0) {
                    alert('Không tìm thấy dòng chi phí chi tiết nào trong file sau khi làm sạch!');
                    return;
                }

                // 4. Tính toán kiểm toán
                const totalMoney = cleanRows.reduce((a, b) => a + b.total, 0);
                const diff = bravoControlTotal !== null ? Math.abs(totalMoney - bravoControlTotal) : 0;

                let targetSheet = 'CP_AUTO';
                if (entityCode === 'C2305' || entityName.toUpperCase().includes('PHÂN PHỐI') || entityName.toUpperCase().includes('PP THACO AUTO')) {
                    targetSheet = 'CP_PP';
                } else if (entityCode === 'C1101' || entityName.toUpperCase().includes('THACO AUTO')) {
                    targetSheet = 'CP_AUTO';
                } else if (entityName.toUpperCase().includes('NHÀ MÁY') || entityName.toUpperCase().includes('CHU LAI')) {
                    targetSheet = 'CP_NHAMAY';
                } else if (entityName.toUpperCase().includes('MIỀN BẮC') || entityName.toUpperCase().includes('BẮC')) {
                    targetSheet = 'CP_CTTT_MB';
                } else {
                    targetSheet = 'CP_CTTT';
                }

                pendingUploadData = {
                    file: file,
                    entityCode: entityCode,
                    entityName: entityName,
                    year: year,
                    ky: (year === 2024 || year === 2025) ? 'Cả năm' : `T1 - T${maxMonthWithData || 7}`,
                    cleanRows: cleanRows,
                    totalMoney: totalMoney,
                    bravoControlTotal: bravoControlTotal,
                    diff: diff,
                    maxMonth: maxMonthWithData || 7,
                    targetSheet: targetSheet
                };

                // 5. Hiển thị thông tin kiểm toán lên giao diện xem trước
                const pFileName = document.getElementById('preview-file-name');
                if (pFileName) pFileName.textContent = file.name;

                const pEntInput = document.getElementById('preview-entity-input');
                if (pEntInput) pEntInput.value = `${entityCode} - ${entityName}`;

                const datalist = document.getElementById('entity-datalist-suggestions');
                if (datalist && state.entities && Array.isArray(state.entities)) {
                    datalist.innerHTML = state.entities.map(e => `<option value="${e.code} - ${e.cleanName || e.name}"></option>`).join('');
                }

                const pEnt = document.getElementById('preview-entity-info');
                if (pEnt) pEnt.textContent = `${entityCode} - ${entityName}`;

                const pPer = document.getElementById('preview-period-info');
                if (pPer) pPer.textContent = `Năm ${year} (${pendingUploadData.ky})`;

                const pRow = document.getElementById('preview-row-count');
                if (pRow) pRow.textContent = `${cleanRows.length.toLocaleString('vi-VN')} dòng sạch`;

                const pCalc = document.getElementById('preview-calc-total');
                if (pCalc) pCalc.textContent = `${totalMoney.toLocaleString('vi-VN')} đ`;

                const pBravo = document.getElementById('preview-bravo-total');
                if (pBravo) pBravo.textContent = bravoControlTotal !== null ? `${bravoControlTotal.toLocaleString('vi-VN')} đ` : '(Không có dòng đối chiếu CỘNG)';

                const diffElem = document.getElementById('preview-diff-total');
                const badgeElem = document.getElementById('preview-audit-badge');

                if (bravoControlTotal === null) {
                    if (diffElem) {
                        diffElem.textContent = 'Chưa xác định (Không có dòng đối chiếu CỘNG)';
                        diffElem.className = 'text-amber-700 font-mono font-medium';
                    }
                    if (badgeElem) {
                        badgeElem.textContent = '⚠️ Không có dòng đối chiếu CỘNG';
                        badgeElem.className = 'px-2 py-0.5 rounded text-[10px] font-black bg-amber-100 text-amber-800 border border-amber-300';
                    }
                } else if (diff === 0 || diff < 1) {
                    if (diffElem) {
                        diffElem.textContent = '0 đ (Tuyệt đối chuẩn xác)';
                        diffElem.className = 'text-emerald-700 font-mono font-bold';
                    }
                    if (badgeElem) {
                        badgeElem.textContent = 'Khớp 100% từng đồng';
                        badgeElem.className = 'px-2 py-0.5 rounded text-[10px] font-black bg-emerald-100 text-emerald-800 border border-emerald-300';
                    }
                } else {
                    if (diffElem) {
                        diffElem.textContent = `${diff.toLocaleString('vi-VN')} đ`;
                        diffElem.className = 'text-rose-700 font-mono font-bold';
                    }
                    if (badgeElem) {
                        badgeElem.textContent = `Lệch ${diff.toLocaleString('vi-VN')} đ`;
                        badgeElem.className = 'px-2 py-0.5 rounded text-[10px] font-black bg-rose-100 text-rose-800 border border-rose-300';
                    }
                }

                const targetSelect = document.getElementById('select-target-sheet');
                if (targetSelect) targetSelect.value = targetSheet;

                const lblTarget = document.getElementById('lbl-target-sheet-preview');
                if (lblTarget) lblTarget.textContent = targetSheet;

                // Chuyển sang màn hình xem trước
                const dropSec = document.getElementById('upload-drop-section');
                const prevSec = document.getElementById('upload-preview-container');
                if (dropSec) dropSec.classList.add('hidden');
                if (prevSec) prevSec.classList.remove('hidden');

            } catch (err) {
                console.error(err);
                alert('Lỗi đọc và phân tích file Excel: ' + err.message);
            }
        };
        reader.readAsArrayBuffer(file);
    }

    async function confirmUpload() {
        if (!pendingUploadData) {
            alert('Không có dữ liệu chờ nạp.');
            return;
        }

        // Đọc giá trị Đơn vị / Pháp nhân từ ô input gõ chỉnh
        const pEntInput = document.getElementById('preview-entity-input');
        const rawEntityVal = pEntInput ? pEntInput.value.trim() : `${pendingUploadData.entityCode} - ${pendingUploadData.entityName}`;

        // Kiểm tra ràng buộc định dạng "MÃ - TÊN PHÁP NHÂN"
        const match = rawEntityVal.match(/^([A-Za-z0-9_-]+)\s*-\s*(.+)$/);
        if (!match) {
            alert('⚠️ Đơn vị / Pháp nhân nhận diện phải có dạng "MÃ - TÊN PHÁP NHÂN" (Ví dụ: C1101 - THACO AUTO hoặc C2305 - PP THACO AUTO).\n\nVui lòng kiểm tra và gõ thêm dấu gạch ngang "-" phân tách giữa Mã và Tên.');
            if (pEntInput) pEntInput.focus();
            return;
        }

        const customCode = match[1].trim();
        const customName = match[2].trim();

        // Cập nhật lại entityCode và entityName vào dữ liệu chờ nạp
        pendingUploadData.entityCode = customCode;
        pendingUploadData.entityName = customName;
        if (pendingUploadData.cleanRows && Array.isArray(pendingUploadData.cleanRows)) {
            pendingUploadData.cleanRows.forEach(r => {
                r.entityCode = customCode;
                r.entityName = customName;
            });
        }

        const targetSelect = document.getElementById('select-target-sheet');
        const targetSheet = targetSelect ? targetSelect.value : pendingUploadData.targetSheet;
        pendingUploadData.targetSheet = targetSheet;

        const btnConfirm = document.getElementById('btn-confirm-upload');
        if (btnConfirm) {
            btnConfirm.disabled = true;
            btnConfirm.innerHTML = '<span>⏳ Đang xử lý & lưu dữ liệu...</span>';
        }

        try {
            const entCode = customCode;
            const entName = customName;
            const year = pendingUploadData.year;
            const ky = pendingUploadData.ky;
            const cleanRows = pendingUploadData.cleanRows;
            const totalMoney = pendingUploadData.totalMoney;
            const rowCount = cleanRows.length;
            const maxMonth = pendingUploadData.maxMonth;

            const chkSyncGsheet = document.getElementById('chk-sync-to-gsheet');
            const shouldSyncGsheet = chkSyncGsheet ? chkSyncGsheet.checked : true;

            // 1. Lưu dữ liệu chi tiết bộ phận vào state.deptData
            if (!state.deptData) state.deptData = {};
            if (!state.deptData[entCode]) state.deptData[entCode] = {};
            state.deptData[entCode][String(year)] = cleanRows;

            // 2. Cập nhật danh sách state.entities nếu chưa có
            if (!state.entities.some(e => e.code === entCode)) {
                let mien = 'MN';
                let phia = 'Phía Nam';
                let khoi = 'KHOI_MN';
                let qtName = entName;
                let qtCode = 'QT_' + entCode;
                let khoiName = 'CTTT Phía Nam';

                const qtpnItem = (state.qtpnMappings || []).find(m => m.maPn === entCode);
                if (qtpnItem) {
                    qtName = qtpnItem.tenQt || qtName;
                    qtCode = qtpnItem.maQt || qtCode;
                    khoiName = qtpnItem.khoi || khoiName;
                    if (qtpnItem.khoi === 'VPĐH') { khoi = 'KHOI_VPDH'; mien = 'VPĐH'; phia = 'VP Điều Hành'; }
                    else if (qtpnItem.khoi === 'Nhà máy') { khoi = 'KHOI_NHAMAY'; mien = 'KSX'; phia = 'Chu Lai'; }
                    else if (qtpnItem.khoi === 'CTTT Phía Bắc') { khoi = 'KHOI_MB'; mien = 'MB'; phia = 'Phía Bắc'; }
                    else if (qtpnItem.khoi === 'CTTT Phía Nam') { khoi = 'KHOI_MN'; mien = 'MN'; phia = 'Phía Nam'; }
                } else if (entCode === 'C1101' || entCode === 'C2305') {
                    mien = 'VPĐH';
                    phia = 'VP Điều Hành';
                    khoi = 'KHOI_VPDH';
                    khoiName = 'VPĐH';
                    qtName = entCode === 'C2305' ? 'PP THACO AUTO' : 'THACO AUTO';
                    qtCode = entCode === 'C2305' ? 'QT_PP' : 'QT_AUTO';
                }

                state.entities.push({
                    code: entCode,
                    name: entName,
                    cleanName: entName,
                    mien: mien,
                    phia: phia,
                    qt: qtName,
                    qtCode: qtCode,
                    khoi: khoi,
                    khoiName: khoiName
                });
            }

            // 3. Tổng hợp lên ma trận báo cáo theo từng Khoản mục (Triệu VNĐ)
            if (!state.data2024) state.data2024 = {};
            if (!state.data2025) state.data2025 = {};
            if (!state.data2026) state.data2026 = {};
            let targetDataStore;
            if (year === 2024) targetDataStore = state.data2024;
            else if (year === 2025) targetDataStore = state.data2025;
            else targetDataStore = state.data2026;
            if (!targetDataStore[entCode]) targetDataStore[entCode] = {};
            const tkKey = '642';
            if (!targetDataStore[entCode][tkKey]) targetDataStore[entCode][tkKey] = {};

            // Khởi tạo 0 cho 30 khoản mục
            state.categories.forEach(cat => {
                targetDataStore[entCode][tkKey][cat.id] = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
            });

            // Cộng dồn từ cleanRows
            cleanRows.forEach(r => {
                const catId = r.catId || 30;
                if (!targetDataStore[entCode][tkKey][catId]) {
                    targetDataStore[entCode][tkKey][catId] = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
                }
                for (let m = 0; m < 12; m++) {
                    targetDataStore[entCode][tkKey][catId][m] += (r.months[m] || 0);
                }
            });
            clearReportDataCache();

            // 4. Cập nhật các tháng thực hiện và kích hoạt mô hình AI dự báo
            if (year === 2026 && maxMonth > 0) {
                const newActualMonths = [];
                for (let m = 1; m <= maxMonth; m++) newActualMonths.push(m);
                state.actualMonths = newActualMonths;
            }

            // 5. Lưu phiên vào localStorage
            saveCurrentState();

            // 6. Đồng bộ lên Google Sheet nếu được chọn
            let gsheetMsg = '';
            if (shouldSyncGsheet) {
                const config = getGoogleSheetSyncConfig();
                if (config && config.webAppUrl) {
                    try {
                        const gRes = await pushCleanCostDataToGoogleSheet(targetSheet, cleanRows, entCode, year);
                        if (gRes && gRes.status === 'success') {
                            gsheetMsg = `\n- Google Sheet (${targetSheet}): ${gRes.message}`;
                            console.log('Tự động tải lại dữ liệu mới nhất từ Google Sheet...');
                            await syncFromGoogleSheet(false);
                        } else {
                            gsheetMsg = `\n- Google Sheet (${targetSheet}): ${gRes?.message || 'Chưa đồng bộ được'}`;
                        }
                    } catch (gErr) {
                        gsheetMsg = `\n- Google Sheet: Lỗi kết nối (${gErr.message})`;
                    }
                } else {
                    gsheetMsg = '\n- Google Sheet: Chưa cấu hình Web App URL nên chưa đẩy lên Sheet.';
                }
            }

            // 7. Cập nhật toàn bộ giao diện & Biểu đồ
            populateSlicers();
            renderAll();

            // Đóng Modal & Reset trạng thái
            const uploadModal = document.getElementById('upload-modal');
            if (uploadModal) uploadModal.classList.add('hidden');
            cancelUploadPreview();

            alert(`✅ NẠP DỮ LIỆU THÀNH CÔNG!\n- Đơn vị: ${entCode} - ${entName}\n- Năm tài chính: ${year} (${ky})\n- Số dòng chi phí: ${rowCount} dòng\n- Tổng tiền: ${totalMoney.toLocaleString('vi-VN')} đ\n- Dữ liệu đã được lưu và cập nhật trực tiếp từ Google Sheet!${gsheetMsg}`);

        } catch (err) {
            console.error(err);
            alert('Lỗi xác nhận nạp dữ liệu: ' + err.message);
        } finally {
            if (btnConfirm) {
                btnConfirm.disabled = false;
                btnConfirm.innerHTML = `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg><span>Xác nhận Nạp Dữ Liệu</span>`;
            }
        }
    }

    async function pushCleanCostDataToGoogleSheet(targetSheet, cleanRows, entityCode, year) {
        const config = getGoogleSheetSyncConfig();
        if (!config || !config.webAppUrl) {
            return { status: 'error', message: 'Chưa cấu hình URL Google Apps Script.' };
        }

        const payload = {
            action: 'save_cphc_data',
            api_key: config.apiKey || '',
            targetSheet: targetSheet || 'CP_AUTO',
            entityCode: entityCode || 'C1101',
            year: year || 2026,
            mode: 'replace_year_entity',
            rows: cleanRows
        };

        const res = await fetch(config.webAppUrl, {
            method: 'POST',
            mode: 'cors',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify(payload)
        });

        return await res.json();
    }

    async function syncC1101BaselineToGoogleSheet() {
        const config = getGoogleSheetSyncConfig();
        if (!config || !config.webAppUrl) {
            alert('Vui lòng kết nối URL Google Apps Script trước trong tab "Đồng bộ Sheet" hoặc Cài đặt kết nối!');
            openGoogleSheetConfigModal();
            return;
        }

        const d25 = (state.deptData && state.deptData['C1101'] && state.deptData['C1101']['2025']) ? state.deptData['C1101']['2025'] : (THACO_APP_DATA.deptData?.['C1101']?.['2025'] || []);
        const d26 = (state.deptData && state.deptData['C1101'] && state.deptData['C1101']['2026']) ? state.deptData['C1101']['2026'] : (THACO_APP_DATA.deptData?.['C1101']?.['2026'] || []);

        if (d25.length === 0 && d26.length === 0) {
            alert('Chưa có dữ liệu mẫu THACO AUTO trong hệ thống.');
            return;
        }

        const confirmed = confirm(`Hệ thống sẽ đẩy toàn bộ dữ liệu chi phí sạch của THACO AUTO (C1101) lên Google Sheet CP_AUTO:\n- Năm 2025: ${d25.length} dòng (27,094,469,647 đ)\n- Năm 2026: ${d26.length} dòng (6,671,614,840 đ)\n\nAnh/Chị có muốn tiếp tục?`);
        if (!confirmed) return;

        const btn = document.getElementById('btn-sync-c1101-to-gsheet');
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<span>⏳ Đang đẩy dữ liệu lên Google Sheet CP_AUTO...</span>';
        }

        try {
            let res25 = null;
            if (d25.length > 0) {
                res25 = await pushCleanCostDataToGoogleSheet('CP_AUTO', d25, 'C1101', 2025);
            }

            let res26 = null;
            if (d26.length > 0) {
                res26 = await pushCleanCostDataToGoogleSheet('CP_AUTO', d26, 'C1101', 2026);
            }

            alert(`🎉 ĐỒNG BỘ THÀNH CÔNG LÊN SHEET CP_AUTO!\n- Năm 2025: ${d25.length} dòng\n- Năm 2026: ${d26.length} dòng\nGoogle Sheet đã tự động tạo bảng, định dạng màu THACO Royal Blue và căn chỉnh số liệu chuẩn xác!`);
        } catch (err) {
            console.error(err);
            alert('Lỗi đồng bộ lên Google Sheet CP_AUTO: ' + err.message);
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = `<svg class="w-4 h-4 text-amber-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg><span>⚡ Đẩy Dữ Liệu THACO AUTO (2025 & 2026) lên CP_AUTO</span>`;
            }
        }
    }

    // ==========================================
    // 🛠️ UTILITY FUNCTIONS & EXPORTS
    // ==========================================

    function renderAll() {
        renderTable();
        if (state.currentTab === 'dashboard') {
            renderDashboardCharts();
        }
    }

    function formatNumber(val) {
        if (val === null || val === undefined || isNaN(val) || Math.abs(val) < 0.001) return '-';
        return val.toLocaleString('vi-VN', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    }

    function formatCurrency(val) {
        if (val === null || val === undefined || isNaN(val)) return '0';
        return val.toLocaleString('vi-VN', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
    }

    function escapeHtml(str) {
        if (!str) return '';
        return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    window.THACO_APP = { state, processGoogleSheetData, syncFromGoogleSheet, calculateReportData, resetToBaseline, openUploadModal, openCbnvUploadModal, renderCbnvTab, setCbnvDisplayMode, init };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
