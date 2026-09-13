/**
 * THACO AUTO - Cost Management System
 * Independent Dashboard Analysis Engine (dashboard.js)
 * 
 * Features:
 * - Full-width Executive Horizontal Grouped Bar Chart comparing multi-years (2026, 2025, 2024)
 * - Semantic Professional Cost Group Icons (📑, 🛠️, 🤝, ✈️, 🏢, 🍱, ⚖️)
 * - Detail Mode Toggle:
 *   + ON: Group Header IN HOA CANH TRÁI (no bars), Child Categories CANH PHẢI (with bars).
 *         Bars arranged vertically: Top = 2026, Middle = 2025, Bottom = 2024 with 4-5px gap.
 *   + OFF: Clean summary displaying ONLY the 7 parent Cost Groups in one neat screen (~460px).
 * - Exact Tooltip positioning following cursor on hover (interaction: nearest, axis: y, intersect: true).
 * - Dynamic Year Slicer (Toggle 1, 2, or 3 years: 2026 #00529C, 2025 #58a1e0, 2024 #8B5CF6).
 * - Full-width Top Month Slicer (All 12 Months, Q1-Q4, YTD, or custom selected months).
 * - Executive KPI Strip (Total costs, YoY variance %, active categories).
 * - Group Filter & Real-time Search.
 * - Interactive Drill-down Modal (Breakdown by Entity & Department).
 * - Export Chart as PNG image & Export filtered data to Excel (.xlsx).
 * - Supporting 360° Charts (Division structure, 12-month trend, Top entities, Department analysis).
 */

(function () {
    'use strict';

    // Semantic Professional Cost Group Icons
    const GROUP_ICONS = {
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

    function getGroupIcon(groupName) {
        if (!groupName) return '📑';

        // 1. Ưu tiên lấy từ GroupIconManager hoặc LocalStorage nếu người dùng đã tùy chọn icon
        if (window.GroupIconManager && typeof window.GroupIconManager.getIcon === 'function') {
            const userIcon = window.GroupIconManager.getIcon(groupName);
            if (userIcon) return userIcon;
        }
        try {
            const savedIconsRaw = localStorage.getItem('THACO_CPHC_GROUP_ICONS');
            if (savedIconsRaw) {
                const parsed = JSON.parse(savedIconsRaw);
                if (parsed && parsed[groupName]) return parsed[groupName];
            }
        } catch (e) { }

        // 2. Tra cứu theo bảng tên nhóm chuẩn
        if (GROUP_ICONS[groupName]) return GROUP_ICONS[groupName];

        // 3. Nhận diện thông minh theo từ khóa bản chất chi phí
        const lower = groupName.toLowerCase();
        if (lower.includes('hoạt động chung') || lower.includes('hoat dong chung')) return '🏢';
        if (lower.includes('kinh doanh') || lower.includes('bán hàng') || lower.includes('khách hàng')) return '💼';
        if (lower.includes('cb-nv') || lower.includes('cbnv') || lower.includes('nhân viên') || lower.includes('cán bộ') || lower.includes('cơm') || lower.includes('ăn')) return '👥';
        if (lower.includes('tiện ích') || lower.includes('văn phòng phẩm')) return '📑';
        if (lower.includes('mua sắm') || lower.includes('sửa chữa') || lower.includes('ccdc') || lower.includes('tscđ')) return '🛠️';
        if (lower.includes('hội họp') || lower.includes('tiếp khách') || lower.includes('giao tế')) return '🤝';
        if (lower.includes('công tác') || lower.includes('lưu trú') || lower.includes('vé máy bay')) return '✈️';
        if (lower.includes('vận hành') || lower.includes('mặt bằng') || lower.includes('điện') || lower.includes('nước')) return '🏢';
        if (lower.includes('khác') || lower.includes('quản trị') || lower.includes('pháp lý') || lower.includes('kiểm toán')) return '⚖️';
        return '📑';
    }

    const ROMAN_NUMERALS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];

    // Dashboard Internal State
    const dashState = {
        selectedYears: ['2026', '2025', '2024'], // Ordered from top to bottom: 2026 (top), 2025 (mid), 2024 (bottom)
        selectedMonths: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
        showDetail: true,
        selectedGroup: 'ALL',
        searchTerm: '',
        chartMode: 'HORIZONTAL_BAR',
        activeCharts: {},
        isInitialized: false
    };

    // Color definitions
    // Color definitions
    const YEAR_COLORS = {
        '2026': {
            border: '#00529C',
            bg: 'rgba(0, 82, 156, 0.92)',
            light: 'rgba(0, 82, 156, 0.18)',
            label: 'Năm 2026'
        },
        '2025': {
            border: '#58a1e0',
            bg: 'rgba(88, 161, 224, 0.9)',
            light: 'rgba(88, 161, 224, 0.15)',
            label: 'Năm 2025'
        },
        '2024': {
            border: '#8B5CF6',
            bg: 'rgba(139, 92, 246, 0.9)',
            light: 'rgba(139, 92, 246, 0.15)',
            label: 'Năm 2024'
        }
    };

    /**
     * Build the complete DOM structure for #dashboard-section
     */
    function setupDashboardLayout(container) {
        if (!container) return;

        container.innerHTML = `
            <!-- Header & Control Bar -->
            <div class="bg-white border border-slate-200 rounded-xl p-4 shadow-sm space-y-4">
                <div class="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100">
                    <div>
                        <h2 class="text-base font-bold text-slate-900 flex items-center gap-2">
                            📊 Dashboard Phân tích Chi phí Hành chính Trực quan
                            <span class="text-xs bg-blue-100 text-[#00529C] px-2.5 py-0.5 rounded-full font-bold border border-blue-200">
                                360° Executive View
                            </span>
                        </h2>
                        <p class="text-xs text-slate-500 mt-1">
                            Phân tích chuyên sâu chi phí theo từng khoản mục và nhóm danh mục (B7 ↔ B10), so sánh linh hoạt đa năm 2026, 2025, 2024.
                        </p>
                    </div>
                    <div class="flex items-center gap-2">
                        <button id="dash-btn-export-excel" 
                            class="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 text-xs font-semibold rounded-lg shadow-sm transition-all flex items-center gap-1.5"
                            title="Xuất bảng số liệu đang lọc ra file Excel">
                            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.5L19 7.5V19a2 2 0 01-2 2z"/>
                            </svg>
                            Xuất Excel
                        </button>
                        <button id="dash-btn-export-png" 
                            class="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 text-xs font-semibold rounded-lg shadow-sm transition-all flex items-center gap-1.5"
                            title="Tải biểu đồ độ nét cao PNG để chèn vào báo cáo">
                            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/>
                            </svg>
                            Tải Ảnh Biểu Đồ
                        </button>
                        <div class="text-[11px] font-medium text-slate-500 bg-slate-50 border border-slate-200 px-2.5 py-1.5 rounded-lg">
                            Cập nhật: <span class="text-[#00529C] font-bold" id="dash-last-updated">Thời gian thực</span>
                        </div>
                    </div>
                </div>

                <!-- SLICER CONTROLS BAR: Top-level full width -->
                <div class="grid grid-cols-1 xl:grid-cols-12 gap-3 items-center text-xs">
                    <!-- Slicer Năm (Linh hoạt 1, 2 hoặc cả 3 năm) -->
                    <div class="xl:col-span-4 bg-slate-50 p-2.5 rounded-lg border border-slate-200 flex flex-col gap-1.5">
                        <div class="flex items-center justify-between">
                            <span class="font-bold text-slate-700 flex items-center gap-1">
                                📅 Slicer Năm So Sánh:
                            </span>
                            <div class="flex items-center gap-1 text-[11px]">
                                <button id="btn-dash-select-all-years" class="text-blue-600 hover:underline font-semibold">Cả 3 năm</button>
                                <span class="text-slate-300">|</span>
                                <button id="btn-dash-select-latest-two" class="text-slate-600 hover:underline">2026-2025</button>
                            </div>
                        </div>
                        <div class="flex items-center gap-2">
                            <!-- Checkbox 2026 (Năm hiện tại - Trên cùng) -->
                            <label class="flex-1 flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-md border text-xs font-bold cursor-pointer transition-all select-none border-[#00529C] bg-blue-900 text-white shadow-sm"
                                   id="label-year-2026">
                                <input type="checkbox" id="chk-year-2026" value="2026" class="rounded text-white focus:ring-0" checked>
                                <span>2026</span>
                                <span class="w-2 h-2 rounded-full bg-white"></span>
                            </label>
                            <!-- Checkbox 2025 (Ở giữa) -->
                            <label class="flex-1 flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-md border text-xs font-bold cursor-pointer transition-all select-none border-blue-300 bg-blue-50 text-blue-800"
                                   id="label-year-2025">
                                <input type="checkbox" id="chk-year-2025" value="2025" class="rounded text-[#58a1e0] focus:ring-0" checked>
                                <span>2025</span>
                                <span class="w-2 h-2 rounded-full bg-[#58a1e0]"></span>
                            </label>
                            <!-- Checkbox 2024 (Dưới cùng) -->
                            <label class="flex-1 flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-md border text-xs font-bold cursor-pointer transition-all select-none border-purple-300 bg-purple-50 text-purple-800"
                                   id="label-year-2024">
                                <input type="checkbox" id="chk-year-2024" value="2024" class="rounded text-[#8B5CF6] focus:ring-0" checked>
                                <span>2024</span>
                                <span class="w-2 h-2 rounded-full bg-[#8B5CF6]"></span>
                            </label>
                        </div>
                    </div>

                    <!-- Slicer Tháng (Trải ngang trên cùng) -->
                    <div class="xl:col-span-5 bg-slate-50 p-2.5 rounded-lg border border-slate-200 flex flex-col gap-1.5">
                        <div class="flex items-center justify-between">
                            <span class="font-bold text-slate-700 flex items-center gap-1">
                                ⏱️ Slicer Khoảng Tháng:
                            </span>
                            <span class="text-[11px] text-[#00529C] font-semibold" id="dash-selected-months-label">12 Tháng (Cả năm)</span>
                        </div>
                        <div class="flex flex-wrap items-center gap-1">
                            <button data-quick-month="ALL" class="dash-quick-month px-2 py-1 rounded bg-[#00529C] text-white font-bold text-[11px] shadow-sm">
                                Cả năm
                            </button>
                            <button data-quick-month="Q1" class="dash-quick-month px-2 py-1 rounded bg-white text-slate-700 hover:bg-slate-100 border border-slate-200 font-semibold text-[11px]">
                                Quý 1
                            </button>
                            <button data-quick-month="Q2" class="dash-quick-month px-2 py-1 rounded bg-white text-slate-700 hover:bg-slate-100 border border-slate-200 font-semibold text-[11px]">
                                Quý 2
                            </button>
                            <button data-quick-month="Q3" class="dash-quick-month px-2 py-1 rounded bg-white text-slate-700 hover:bg-slate-100 border border-slate-200 font-semibold text-[11px]">
                                Quý 3
                            </button>
                            <button data-quick-month="Q4" class="dash-quick-month px-2 py-1 rounded bg-white text-slate-700 hover:bg-slate-100 border border-slate-200 font-semibold text-[11px]">
                                Quý 4
                            </button>
                            <button data-quick-month="YTD" class="dash-quick-month px-2 py-1 rounded bg-white text-slate-700 hover:bg-slate-100 border border-slate-200 font-semibold text-[11px]">
                                Lũy kế YTD
                            </button>
                            <div class="relative inline-block ml-auto">
                                <button id="btn-toggle-month-picker" class="px-2 py-1 bg-white border border-slate-300 hover:bg-slate-100 rounded text-[11px] font-bold text-slate-700 flex items-center gap-1">
                                    <span>Tùy chọn tháng</span>
                                    <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
                                </button>
                                <!-- Month dropdown panel -->
                                <div id="dash-month-dropdown-panel" class="hidden absolute right-0 mt-1 w-64 bg-white border border-slate-200 rounded-lg shadow-xl p-3 z-50">
                                    <div class="text-[11px] font-bold text-slate-700 mb-2 pb-1 border-b border-slate-100 flex justify-between items-center">
                                        <span>Chọn tháng phân tích:</span>
                                        <button id="btn-dash-select-all-months" class="text-blue-600 text-[10px] hover:underline">Chọn tất cả</button>
                                    </div>
                                    <div class="grid grid-cols-4 gap-1.5 text-center text-xs">
                                        ${[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(m => `
                                            <label class="p-1.5 border border-slate-200 rounded cursor-pointer hover:bg-blue-50 transition-colors flex items-center justify-center gap-1 select-none">
                                                <input type="checkbox" class="dash-chk-month rounded text-[#00529C]" value="${m}" checked>
                                                <span class="font-bold text-slate-700">T${m < 10 ? '0' + m : m}</span>
                                            </label>
                                        `).join('')}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Lọc Nhóm & Tìm kiếm -->
                    <div class="xl:col-span-3 bg-slate-50 p-2.5 rounded-lg border border-slate-200 flex flex-col gap-1.5">
                        <span class="font-bold text-slate-700">Bộ lọc Nhóm & Tìm kiếm:</span>
                        <div class="flex items-center gap-1.5">
                            <select id="dash-group-filter" class="flex-1 bg-white border border-slate-200 rounded px-2 py-1 text-xs font-semibold text-slate-800 focus:ring-1 focus:ring-blue-500">
                                <option value="ALL">Tất cả nhóm chi phí (39 mục)</option>
                            </select>
                            <input type="text" id="dash-search-input" placeholder="Tìm khoản mục..." 
                                   class="w-32 bg-white border border-slate-200 rounded px-2 py-1 text-xs focus:ring-1 focus:ring-blue-500">
                        </div>
                    </div>
                </div>
            </div>

            <!-- EXECUTIVE KPI STRIP -->
            <!-- EXECUTIVE KPI STRIP -->
            <div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <div class="bg-white border border-slate-200 p-3.5 rounded-xl shadow-sm flex items-center justify-between border-l-4 border-l-[#00529C]">
                    <div>
                        <div class="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Tổng Kỳ Chọn 2026</div>
                        <div class="text-lg font-black text-[#00529C] mt-0.5" id="kpi-dash-tot-2026">0 Tr.đ</div>
                        <div class="text-[10px] font-bold text-emerald-600" id="kpi-dash-growth-label">YoY: 0%</div>
                    </div>
                    <div class="w-11 h-9 rounded-lg bg-blue-50 text-[#00529C] flex items-center justify-center font-black text-xs border border-blue-200">
                        2026
                    </div>
                </div>

                <div class="bg-white border border-slate-200 p-3.5 rounded-xl shadow-sm flex items-center justify-between border-l-4 border-l-[#58a1e0]">
                    <div>
                        <div class="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Tổng Kỳ Chọn 2025</div>
                        <div class="text-lg font-black text-sky-600 mt-0.5" id="kpi-dash-tot-2025">0 Tr.đ</div>
                        <div class="text-[10px] text-slate-400">Số liệu thực tế 2025</div>
                    </div>
                    <div class="w-11 h-9 rounded-lg bg-sky-50 text-[#58a1e0] flex items-center justify-center font-black text-xs border border-sky-200">
                        2025
                    </div>
                </div>

                <div class="bg-white border border-slate-200 p-3.5 rounded-xl shadow-sm flex items-center justify-between border-l-4 border-l-[#8B5CF6]">
                    <div>
                        <div class="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Tổng Kỳ Chọn 2024</div>
                        <div class="text-lg font-black text-purple-700 mt-0.5" id="kpi-dash-tot-2024">0 Tr.đ</div>
                        <div class="text-[10px] text-slate-400">Số liệu thực tế 2024</div>
                    </div>
                    <div class="w-11 h-9 rounded-lg bg-purple-50 text-[#8B5CF6] flex items-center justify-center font-black text-xs border border-purple-200">
                        2024
                    </div>
                </div>

                <div class="bg-white border border-slate-200 p-3.5 rounded-xl shadow-sm flex items-center justify-between border-l-4 border-l-amber-500">
                    <div>
                        <div class="text-[11px] font-bold text-slate-500 uppercase tracking-wider" id="kpi-dash-top-title">Khoản Mục Chiếm Lớn Nhất</div>
                        <div class="text-xs font-bold text-slate-800 truncate max-w-[150px] mt-0.5" id="kpi-dash-top-cat-name">-</div>
                        <div class="text-[10px] font-semibold text-amber-700" id="kpi-dash-top-cat-val">0 Tr.đ (0%)</div>
                    </div>
                    <div class="w-11 h-9 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center font-bold text-xs border border-amber-200">
                        TOP
                    </div>
                </div>
            </div>

            <!-- MAIN FULL-WIDTH EXECUTIVE HORIZONTAL BAR CHART -->
            <div class="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden flex flex-col">
                <!-- Main Chart Header -->
                <div class="p-4 border-b border-slate-100 bg-slate-50/60 flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <h3 class="text-sm font-bold text-[#00529C] uppercase tracking-wide flex items-center gap-2">
                            <span id="dash-chart-title">📈 Biểu Đồ Chi Tiết Từng Khoản Mục Chi Phí (Gôm Theo Nhóm)</span>
                            <span class="text-[10px] font-bold px-2 py-0.5 rounded bg-blue-100 text-blue-800" id="dash-chart-item-count">
                                39 Khoản mục
                            </span>
                        </h3>
                        <p class="text-xs text-slate-500 mt-0.5" id="dash-chart-desc">
                        </p>
                    </div>

                    <!-- Controls & View Mode -->
                    <div class="flex flex-wrap items-center gap-2">
                        <!-- NÚT BẬT / TẮT XEM CHI TIẾT -->
                        <button id="dash-toggle-detail" class="px-3 py-1.5 rounded-lg font-bold text-xs flex items-center gap-1.5 transition-all bg-[#00529C] text-white shadow-sm border border-[#00529C]"
                                title="Bật để xem các khoản mục chi tiết | Tắt để xem rút gọn các nhóm chi phí">
                            <span id="dash-detail-icon">👁️</span>
                            <span id="dash-detail-text">Xem Chi Tiết: BẬT</span>
                        </button>

                        <div class="inline-flex rounded-lg border border-slate-200 p-0.5 bg-white text-xs">
                            <button id="dash-view-mode-bar" class="px-2.5 py-1 rounded-md font-bold bg-[#00529C] text-white shadow-xs">
                                📊 Cột Ngang
                            </button>
                            <button id="dash-view-mode-line" class="px-2.5 py-1 rounded-md font-semibold text-slate-600 hover:text-slate-900">
                                📉 Xu Hướng 12T
                            </button>
                        </div>
                        <button id="dash-btn-reset-filters" class="px-2.5 py-1 text-xs text-slate-600 hover:text-blue-700 font-semibold border border-slate-200 rounded-lg hover:bg-slate-100">
                            Đặt lại bộ lọc
                        </button>
                    </div>
                </div>

                <!-- CỐ ĐỊNH DÒNG NĂM PHÍA TRÊN BIỂU ĐỒ (STICKY YEAR HEADER) -->
                <div id="dash-sticky-year-header" class="px-5 py-2.5 bg-slate-50/95 backdrop-blur-xs border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 sticky top-0 z-20 shadow-2xs">
                    <div class="flex items-center gap-4 text-xs font-bold">
                        <span class="text-slate-500 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                            <svg class="w-4 h-4 text-[#00529C]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
                            <span>Dòng Năm Phân Tích:</span>
                        </span>
                        <span id="dash-sticky-year-2026" class="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-blue-50 border border-blue-200 text-[#00529C] font-black shadow-2xs">
                            <span class="w-3.5 h-3.5 rounded-xs bg-[#00529C] shadow-xs"></span>
                            <span>Năm 2026</span>
                        </span>
                        <span id="dash-sticky-year-2025" class="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-sky-50 border border-sky-200 text-sky-800 font-bold shadow-2xs">
                            <span class="w-3.5 h-3.5 rounded-xs bg-[#58a1e0] shadow-xs"></span>
                            <span>Năm 2025</span>
                        </span>
                        <span id="dash-sticky-year-2024" class="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-purple-50 border border-purple-200 text-purple-800 font-bold shadow-2xs">
                            <span class="w-3.5 h-3.5 rounded-xs bg-[#8B5CF6] shadow-xs"></span>
                            <span>Năm 2024</span>
                        </span>
                    </div>
                    <div class="text-[11px] text-slate-500 font-medium italic hidden md:block">
                    </div>
                </div>

                <!-- Chart Canvas Container -->
                <div class="p-4 relative w-full overflow-y-auto max-h-[850px]" id="dash-main-chart-scroll-container">
                    <div id="dash-main-chart-wrapper" class="relative w-full" style="min-height: 500px;">
                        <canvas id="chart-main-horizontal-bars"></canvas>
                    </div>
                </div>

                <!-- Chart Footer Legend & Guidance Note -->
                <div class="px-4 py-2.5 bg-slate-50 border-t border-slate-100 text-[11px] text-slate-500 flex flex-wrap items-center justify-between gap-2">
                    <div class="flex items-center gap-4">
                        <span class="font-bold text-slate-600">Thanh cột xếp từ trên xuống:</span>
                        <span class="flex items-center gap-1"><span class="w-3 h-3 rounded-xs bg-[#00529C]"></span> Năm 2026</span>
                        <span class="flex items-center gap-1"><span class="w-3 h-3 rounded-xs bg-[#58a1e0]"></span> Năm 2025</span>
                        <span class="flex items-center gap-1"><span class="w-3 h-3 rounded-xs bg-[#8B5CF6]"></span> Năm 2024</span>
                    </div>
                    <div class="text-slate-500 italic">
                    </div>
                </div>
            </div>

            <!-- SUPPORTING 360° CHARTS GRID (4 BIỂU ĐỒ BỔ TRỢ) -->
            <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <!-- Card 1: Cơ cấu theo 4 Khối Quản trị -->
                <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-all flex flex-col justify-between">
                    <div class="flex items-center justify-between pb-2 border-b border-slate-100 mb-3">
                        <h3 class="text-xs font-bold text-[#00529C] uppercase tracking-wider flex items-center gap-1.5">
                            <span>🍩 Cơ cấu Chi phí theo 4 Khối Quản trị</span>
                        </h3>
                        <span class="text-[10px] text-slate-400 font-mono">2026</span>
                    </div>
                    <div class="relative h-64 w-full flex items-center justify-center">
                        <canvas id="chart-block-pie"></canvas>
                    </div>
                </div>

                <!-- Card 2: Xu hướng 12 Tháng -->
                <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-all flex flex-col justify-between">
                    <div class="flex items-center justify-between pb-2 border-b border-slate-100 mb-3">
                        <h3 class="text-xs font-bold text-[#00529C] uppercase tracking-wider flex items-center gap-1.5">
                            <span>📈 Diễn biến Chi phí 12 Tháng 2026 (Thực tế vs AI Forecast)</span>
                        </h3>
                        <span class="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded font-bold">
                            T1-T7 Thực tế | T8-T12 AI
                        </span>
                    </div>
                    <div class="relative h-64 w-full">
                        <canvas id="chart-monthly-trend"></canvas>
                    </div>
                </div>

                <!-- Card 3: Phân bổ Chi phí theo Khối Phòng Ban -->
                <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-all flex flex-col justify-between">
                    <div class="flex items-center justify-between pb-2 border-b border-slate-100 mb-3">
                        <h3 class="text-xs font-bold text-[#00529C] uppercase tracking-wider flex items-center gap-1.5">
                            <span>🏢 Phân bổ theo Khối Phòng Ban (VPĐH / MB / MN / Chu Lai)</span>
                        </h3>
                        <span class="text-[10px] text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded font-bold">ĐVT: Tr.đ</span>
                    </div>
                    <div class="relative h-64 w-full flex items-center justify-center">
                        <canvas id="chart-dept-blocks"></canvas>
                    </div>
                </div>

                <!-- Card 4: Top 10 Bộ phận có Chi phí lớn nhất -->
                <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-all flex flex-col justify-between">
                    <div class="flex items-center justify-between pb-2 border-b border-slate-100 mb-3">
                        <h3 class="text-xs font-bold text-[#00529C] uppercase tracking-wider flex items-center gap-1.5">
                            <span>🏆 Top 10 Bộ phận có Chi phí Hành chính lớn nhất</span>
                        </h3>
                        <span class="text-[10px] text-blue-700 bg-blue-50 border border-blue-200 px-1.5 py-0.5 rounded font-bold">Lũy kế 2025-2026</span>
                    </div>
                    <div class="relative h-64 w-full">
                        <canvas id="chart-top-departments"></canvas>
                    </div>
                </div>
            </div>

            <!-- BẢNG ĐÁNH GIÁ KIỂM ĐỊNH ROLLING BACKTEST & ĐỘ TIN CẬY AI FORECAST (GIAI ĐOẠN 4) -->
            <div id="dash-ai-backtest-panel" class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-all mt-4">
                <div class="flex flex-wrap items-center justify-between pb-3 border-b border-slate-100 gap-2 mb-3">
                    <div class="flex items-center gap-2">
                        <span class="p-1.5 rounded-lg bg-indigo-50 text-indigo-700 text-base">🤖</span>
                        <div>
                            <h3 class="text-xs font-bold text-[#00529C] uppercase tracking-wider flex items-center gap-1.5">
                                <span>Kiểm định Mô hình AI Dự báo (Rolling Backtest & Sai số MAPE)</span>
                                <span class="px-1.5 py-0.2 rounded text-[9px] font-black bg-indigo-100 text-indigo-800 border border-indigo-200">Giai đoạn 4</span>
                            </h3>
                            <p class="text-[11px] text-slate-500">
                                Kiểm nghiệm ngược số liệu thực nghiệm: Sử dụng các tháng đầu kỳ để dự báo các tháng gần nhất đã phát sinh nhằm đo lường độ tin cậy của thuật toán.
                            </p>
                        </div>
                    </div>
                    <div class="flex items-center gap-2">
                        <span id="backtest-confidence-badge" class="px-2.5 py-1 rounded-full text-xs font-black bg-emerald-100 text-emerald-800 border border-emerald-300">
                            Độ tin cậy: --%
                        </span>
                    </div>
                </div>

                <!-- 4 KPI Thống kê Backtest -->
                <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4 text-xs">
                    <div class="bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                        <div class="text-[10px] uppercase font-bold text-slate-500">Sai số bình quân (MAPE)</div>
                        <div id="kpi-backtest-mape" class="text-base font-black text-emerald-700 font-mono mt-0.5">--%</div>
                        <div class="text-[10px] text-slate-400 mt-0.5">Mục tiêu: &lt; 15% (Chuẩn mực dự báo)</div>
                    </div>
                    <div class="bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                        <div class="text-[10px] uppercase font-bold text-slate-500">Kỳ huấn luyện (Train)</div>
                        <div id="kpi-backtest-train" class="text-base font-bold text-[#00529C] font-mono mt-0.5">T1 - T5</div>
                        <div class="text-[10px] text-slate-400 mt-0.5">Dữ liệu gốc tính hệ số Run-rate</div>
                    </div>
                    <div class="bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                        <div class="text-[10px] uppercase font-bold text-slate-500">Kỳ kiểm nghiệm (Test)</div>
                        <div id="kpi-backtest-test" class="text-base font-bold text-amber-700 font-mono mt-0.5">T6 - T7</div>
                        <div class="text-[10px] text-slate-400 mt-0.5">Tháng thực nghiệm đối chiếu sai số</div>
                    </div>
                    <div class="bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                        <div class="text-[10px] uppercase font-bold text-slate-500">Mô hình toán học</div>
                        <div class="text-xs font-bold text-indigo-900 mt-1">Multiplicative Run-rate</div>
                        <div class="text-[10px] text-indigo-700 mt-0.5">Kết hợp trọng số mùa vụ 2024-2025</div>
                    </div>
                </div>

                <!-- Bảng chi tiết đối chiếu Backtest -->
                <div class="overflow-x-auto border border-slate-200 rounded-xl">
                    <table class="w-full text-xs text-left text-slate-700">
                        <thead class="bg-slate-100 text-slate-700 text-[11px] font-bold border-b border-slate-200 uppercase select-none">
                            <tr>
                                <th class="px-3 py-2">Kỳ kiểm định</th>
                                <th class="px-3 py-2 text-right">Chi phí Thực tế 2026 (Tr.đ)</th>
                                <th class="px-3 py-2 text-right">AI Dự báo Backtest (Tr.đ)</th>
                                <th class="px-3 py-2 text-right">Sai số Tuyệt đối (Tr.đ)</th>
                                <th class="px-3 py-2 text-right">Sai số Tương đối (%)</th>
                                <th class="px-3 py-2 text-center">Đánh giá Độ chính xác</th>
                            </tr>
                        </thead>
                        <tbody id="backtest-table-body" class="divide-y divide-slate-100 font-mono">
                            <!-- Populated dynamically -->
                        </tbody>
                    </table>
                </div>
            </div>

            <!-- DRILL-DOWN MODAL -->
            <div id="dash-drilldown-modal" class="hidden fixed inset-0 z-50 overflow-y-auto bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
                <div class="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-3xl w-full p-6 space-y-4 transform transition-all">
                    <div class="flex items-start justify-between pb-3 border-b border-slate-100">
                        <div>
                            <span class="text-xs font-bold text-blue-600 uppercase tracking-wider" id="modal-cat-group">Chi phí tiện ích</span>
                            <h3 class="text-base font-bold text-slate-900" id="modal-cat-name">Khoản mục chi tiết</h3>
                        </div>
                        <button id="dash-modal-close" class="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100">
                            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
                        </button>
                    </div>

                    <div class="space-y-3">
                        <div class="text-xs text-slate-600">
                            Cơ cấu phát sinh theo các Pháp nhân / Đơn vị thành viên trong kỳ tháng đã chọn:
                        </div>
                        <div class="overflow-x-auto border border-slate-200 rounded-xl">
                            <table class="w-full text-xs text-left text-slate-700">
                                <thead class="bg-[#00529C] text-white text-xs select-none">
                                    <tr>
                                        <th class="px-3 py-2">Mã ĐV</th>
                                        <th class="px-3 py-2">Tên Pháp Nhân / Đơn Vị</th>
                                        <th class="px-3 py-2 text-right font-bold text-amber-200">2026 (Tr.đ)</th>
                                        <th class="px-3 py-2 text-right text-blue-100">2025 (Tr.đ)</th>
                                        <th class="px-3 py-2 text-right text-purple-200">2024 (Tr.đ)</th>
                                        <th class="px-3 py-2 text-right font-bold text-amber-300">2026 vs 2025</th>
                                        <th class="px-3 py-2 text-right font-bold text-cyan-200">2026 vs 2024</th>
                                        <th class="px-3 py-2 text-right font-bold text-indigo-200">2025 vs 2024</th>
                                    </tr>
                                </thead>
                                <tbody id="modal-drilldown-tbody" class="divide-y divide-slate-100">
                                    <!-- Populated dynamically -->
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <div class="flex justify-end pt-2">
                        <button id="dash-modal-close-btn" class="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-lg transition-all">
                            Đóng cửa sổ
                        </button>
                    </div>
                </div>
            </div>
        `;

        bindDashboardEvents();
        dashState.isInitialized = true;
    }

    /**
     * Attach UI listeners to Slicers, Buttons and Filters
     */
    function bindDashboardEvents() {
        // Toggle Detail Mode Button
        const btnToggleDetail = document.getElementById('dash-toggle-detail');
        const iconDetail = document.getElementById('dash-detail-icon');
        const textDetail = document.getElementById('dash-detail-text');
        const titleElem = document.getElementById('dash-chart-title');
        const descElem = document.getElementById('dash-chart-desc');
        const topTitle = document.getElementById('kpi-dash-top-title');

        if (btnToggleDetail) {
            btnToggleDetail.addEventListener('click', () => {
                dashState.showDetail = !dashState.showDetail;
                if (dashState.showDetail) {
                    btnToggleDetail.className = 'px-3 py-1.5 rounded-lg font-bold text-xs flex items-center gap-1.5 transition-all bg-[#00529C] text-white shadow-sm border border-[#00529C]';
                    if (iconDetail) iconDetail.textContent = '👁️';
                    if (textDetail) textDetail.textContent = 'Xem Chi Tiết: BẬT';
                    if (titleElem) titleElem.textContent = '📈 Biểu Đồ Chi Tiết Từng Khoản Mục Chi Phí (Gôm Theo Nhóm)';
                    if (descElem) descElem.textContent = 'Tiêu đề nhóm IN HOA chữ đỏ (#C00000) nền xám (#e6ebf0). Khoản mục chữ xanh (#00529C) nền vàng (#feffd5).';
                    if (topTitle) topTitle.textContent = 'Khoản Mục Chiếm Lớn Nhất';
                } else {
                    btnToggleDetail.className = 'px-3 py-1.5 rounded-lg font-bold text-xs flex items-center gap-1.5 transition-all bg-amber-50 text-amber-900 border border-amber-300 shadow-sm hover:bg-amber-100';
                    if (iconDetail) iconDetail.textContent = '📑';
                    if (textDetail) textDetail.textContent = 'Xem Chi Tiết: TẮT (Chỉ Xem Nhóm)';
                    if (titleElem) titleElem.textContent = '📊 Biểu Đồ Tổng Hợp Theo Các Nhóm Chi Phí';
                    if (descElem) descElem.textContent = 'Đang hiển thị các Nhóm chi phí tổng hợp cấp điều hành. Bấm nút để xem chi tiết từng khoản mục con.';
                    if (topTitle) topTitle.textContent = 'Nhóm Chi Phí Lớn Nhất';
                }
                renderMainHorizontalChart();
                updateKPIs();
            });
        }

        // Year Slicer checkboxes (Ordered: 2026, 2025, 2024)
        ['2026', '2025', '2024'].forEach(yr => {
            const chk = document.getElementById(`chk-year-${yr}`);
            const lbl = document.getElementById(`label-year-${yr}`);
            if (chk) {
                chk.addEventListener('change', () => {
                    updateYearCheckboxStyle(yr, chk.checked, lbl);

                    const selected = [];
                    ['2026', '2025', '2024'].forEach(y => {
                        const c = document.getElementById(`chk-year-${y}`);
                        if (c && c.checked) selected.push(y);
                    });

                    if (selected.length === 0) {
                        chk.checked = true;
                        updateYearCheckboxStyle(yr, true, lbl);
                        selected.push(yr);
                    }

                    dashState.selectedYears = selected;
                    renderMainHorizontalChart();
                    updateKPIs();
                });
            }
        });

        // Quick Year buttons
        const btnAllYears = document.getElementById('btn-dash-select-all-years');
        if (btnAllYears) {
            btnAllYears.addEventListener('click', () => {
                ['2026', '2025', '2024'].forEach(yr => {
                    const chk = document.getElementById(`chk-year-${yr}`);
                    const lbl = document.getElementById(`label-year-${yr}`);
                    if (chk) {
                        chk.checked = true;
                        updateYearCheckboxStyle(yr, true, lbl);
                    }
                });
                dashState.selectedYears = ['2026', '2025', '2024'];
                renderMainHorizontalChart();
                updateKPIs();
            });
        }

        const btnLatestTwo = document.getElementById('btn-dash-select-latest-two');
        if (btnLatestTwo) {
            btnLatestTwo.addEventListener('click', () => {
                const c26 = document.getElementById('chk-year-2026');
                const c25 = document.getElementById('chk-year-2025');
                const c24 = document.getElementById('chk-year-2024');
                if (c26) { c26.checked = true; updateYearCheckboxStyle('2026', true, document.getElementById('label-year-2026')); }
                if (c25) { c25.checked = true; updateYearCheckboxStyle('2025', true, document.getElementById('label-year-2025')); }
                if (c24) { c24.checked = false; updateYearCheckboxStyle('2024', false, document.getElementById('label-year-2024')); }
                dashState.selectedYears = ['2026', '2025'];
                renderMainHorizontalChart();
                updateKPIs();
            });
        }

        // Quick Month Buttons
        document.querySelectorAll('.dash-quick-month').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.dash-quick-month').forEach(b => {
                    b.classList.remove('bg-[#00529C]', 'text-white');
                    b.classList.add('bg-white', 'text-slate-700');
                });
                btn.classList.remove('bg-white', 'text-slate-700');
                btn.classList.add('bg-[#00529C]', 'text-white');

                const q = btn.getAttribute('data-quick-month');
                applyQuickMonth(q);
            });
        });

        // Month Picker dropdown toggle
        const btnToggleMonth = document.getElementById('btn-toggle-month-picker');
        const monthPanel = document.getElementById('dash-month-dropdown-panel');
        if (btnToggleMonth && monthPanel) {
            btnToggleMonth.addEventListener('click', (e) => {
                e.stopPropagation();
                monthPanel.classList.toggle('hidden');
            });
            document.addEventListener('click', (e) => {
                if (!monthPanel.contains(e.target) && e.target !== btnToggleMonth) {
                    monthPanel.classList.add('hidden');
                }
            });
        }

        // Checkboxes in month dropdown
        document.querySelectorAll('.dash-chk-month').forEach(chk => {
            chk.addEventListener('change', () => {
                const selected = [];
                document.querySelectorAll('.dash-chk-month').forEach(c => {
                    if (c.checked) selected.push(parseInt(c.value, 10));
                });
                if (selected.length === 0) {
                    chk.checked = true;
                    selected.push(parseInt(chk.value, 10));
                }
                dashState.selectedMonths = selected.sort((a, b) => a - b);
                updateSelectedMonthsLabel();
                renderMainHorizontalChart();
                updateKPIs();
            });
        });

        const btnSelectAllMonths = document.getElementById('btn-dash-select-all-months');
        if (btnSelectAllMonths) {
            btnSelectAllMonths.addEventListener('click', () => {
                document.querySelectorAll('.dash-chk-month').forEach(c => c.checked = true);
                dashState.selectedMonths = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
                updateSelectedMonthsLabel();
                renderMainHorizontalChart();
                updateKPIs();
            });
        }

        // Group filter dropdown
        const grpFilter = document.getElementById('dash-group-filter');
        if (grpFilter) {
            grpFilter.addEventListener('change', () => {
                dashState.selectedGroup = grpFilter.value;
                renderMainHorizontalChart();
            });
        }

        // Search input
        const searchInput = document.getElementById('dash-search-input');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                dashState.searchTerm = (e.target.value || '').trim().toLowerCase();
                renderMainHorizontalChart();
            });
        }

        // View mode buttons (Bar vs Line)
        const btnBar = document.getElementById('dash-view-mode-bar');
        const btnLine = document.getElementById('dash-view-mode-line');
        if (btnBar && btnLine) {
            btnBar.addEventListener('click', () => {
                dashState.chartMode = 'HORIZONTAL_BAR';
                btnBar.className = 'px-2.5 py-1 rounded-md font-bold bg-[#00529C] text-white shadow-xs';
                btnLine.className = 'px-2.5 py-1 rounded-md font-semibold text-slate-600 hover:text-slate-900';
                renderMainHorizontalChart();
            });
            btnLine.addEventListener('click', () => {
                dashState.chartMode = 'LINE_TREND';
                btnLine.className = 'px-2.5 py-1 rounded-md font-bold bg-[#00529C] text-white shadow-xs';
                btnBar.className = 'px-2.5 py-1 rounded-md font-semibold text-slate-600 hover:text-slate-900';
                renderMainHorizontalChart();
            });
        }

        // Reset filters button
        const btnReset = document.getElementById('dash-btn-reset-filters');
        if (btnReset) {
            btnReset.addEventListener('click', () => {
                dashState.selectedGroup = 'ALL';
                dashState.searchTerm = '';
                dashState.selectedMonths = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
                dashState.selectedYears = ['2026', '2025', '2024'];
                dashState.showDetail = true;

                if (btnToggleDetail) {
                    btnToggleDetail.className = 'px-3 py-1.5 rounded-lg font-bold text-xs flex items-center gap-1.5 transition-all bg-[#00529C] text-white shadow-sm border border-[#00529C]';
                    if (iconDetail) iconDetail.textContent = '👁️';
                    if (textDetail) textDetail.textContent = 'Xem Chi Tiết: BẬT';
                }

                if (grpFilter) grpFilter.value = 'ALL';
                if (searchInput) searchInput.value = '';
                document.querySelectorAll('.dash-chk-month').forEach(c => c.checked = true);
                ['2026', '2025', '2024'].forEach(yr => {
                    const c = document.getElementById(`chk-year-${yr}`);
                    const l = document.getElementById(`label-year-${yr}`);
                    if (c) { c.checked = true; updateYearCheckboxStyle(yr, true, l); }
                });
                updateSelectedMonthsLabel();
                renderMainHorizontalChart();
                updateKPIs();
            });
        }

        // Export PNG
        const btnExportPNG = document.getElementById('dash-btn-export-png');
        if (btnExportPNG) {
            btnExportPNG.addEventListener('click', exportMainChartPNG);
        }

        // Export Excel
        const btnExportExcel = document.getElementById('dash-btn-export-excel');
        if (btnExportExcel) {
            btnExportExcel.addEventListener('click', exportDashboardDataExcel);
        }

        // Modal Close
        const modalClose = document.getElementById('dash-modal-close');
        const modalCloseBtn = document.getElementById('dash-modal-close-btn');
        const modal = document.getElementById('dash-drilldown-modal');
        if (modalClose && modal) modalClose.addEventListener('click', () => modal.classList.add('hidden'));
        if (modalCloseBtn && modal) modalCloseBtn.addEventListener('click', () => modal.classList.add('hidden'));

        // Ẩn external chart tooltip khi cuộn trang hoặc cuộn container
        const scrollContainer = document.getElementById('dash-main-chart-scroll-container');
        if (scrollContainer) {
            scrollContainer.addEventListener('scroll', () => {
                const el = document.getElementById('chart-global-external-tooltip');
                if (el) {
                    el.style.opacity = '0';
                    el.style.display = 'none';
                }
            }, { passive: true });
        }
        window.addEventListener('scroll', () => {
            const el = document.getElementById('chart-global-external-tooltip');
            if (el) {
                el.style.opacity = '0';
                el.style.display = 'none';
            }
        }, { passive: true });
    }

    function updateYearCheckboxStyle(year, isChecked, labelElem) {
        if (!labelElem) return;
        if (year === '2026') {
            if (isChecked) {
                labelElem.className = 'flex-1 flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-md border text-xs font-bold cursor-pointer transition-all select-none border-[#00529C] bg-blue-900 text-white shadow-sm';
            } else {
                labelElem.className = 'flex-1 flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-md border text-xs font-medium cursor-pointer transition-all select-none border-slate-200 bg-white text-slate-400';
            }
        } else if (year === '2025') {
            if (isChecked) {
                labelElem.className = 'flex-1 flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-md border text-xs font-bold cursor-pointer transition-all select-none border-blue-300 bg-blue-50 text-blue-800';
            } else {
                labelElem.className = 'flex-1 flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-md border text-xs font-medium cursor-pointer transition-all select-none border-slate-200 bg-white text-slate-400';
            }
        } else if (year === '2024') {
            if (isChecked) {
                labelElem.className = 'flex-1 flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-md border text-xs font-bold cursor-pointer transition-all select-none border-purple-300 bg-purple-50 text-purple-800';
            } else {
                labelElem.className = 'flex-1 flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-md border text-xs font-medium cursor-pointer transition-all select-none border-slate-200 bg-white text-slate-400';
            }
        }
    }

    function applyQuickMonth(quickType) {
        let months = [];
        if (quickType === 'ALL') months = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
        else if (quickType === 'Q1') months = [1, 2, 3];
        else if (quickType === 'Q2') months = [4, 5, 6];
        else if (quickType === 'Q3') months = [7, 8, 9];
        else if (quickType === 'Q4') months = [10, 11, 12];
        else if (quickType === 'YTD') {
            const actual = (window.THACO_APP && window.THACO_APP.state && window.THACO_APP.state.actualMonths) || [1, 2, 3, 4, 5, 6];
            months = [...actual];
        }

        dashState.selectedMonths = months;

        document.querySelectorAll('.dash-chk-month').forEach(c => {
            c.checked = months.includes(parseInt(c.value, 10));
        });

        updateSelectedMonthsLabel();
        renderMainHorizontalChart();
        updateKPIs();
    }

    function updateSelectedMonthsLabel() {
        const lbl = document.getElementById('dash-selected-months-label');
        if (!lbl) return;
        const count = dashState.selectedMonths.length;
        if (count === 12) lbl.textContent = '12 Tháng (Cả năm)';
        else if (count === 3 && dashState.selectedMonths[0] === 1 && dashState.selectedMonths[2] === 3) lbl.textContent = 'Quý 1 (T01-T03)';
        else if (count === 3 && dashState.selectedMonths[0] === 4 && dashState.selectedMonths[2] === 6) lbl.textContent = 'Quý 2 (T04-T06)';
        else if (count === 3 && dashState.selectedMonths[0] === 7 && dashState.selectedMonths[2] === 9) lbl.textContent = 'Quý 3 (T07-T09)';
        else if (count === 3 && dashState.selectedMonths[0] === 10 && dashState.selectedMonths[2] === 12) lbl.textContent = 'Quý 4 (T10-T12)';
        else lbl.textContent = `${count} tháng đã chọn (${dashState.selectedMonths.map(m => 'T' + (m < 10 ? '0' + m : m)).join(', ')})`;
    }

    /**
     * Populate group filter dropdown based on B7 <-> B10 mapping categories with professional icons
     */
    function updateGroupFilterOptions() {
        const grpFilter = document.getElementById('dash-group-filter');
        if (!grpFilter || !window.THACO_APP || !window.THACO_APP.state) return;

        const categories = window.THACO_APP.state.categories || [];
        const groups = Array.from(new Set(categories.map(c => c.group || 'Khác'))).filter(Boolean);

        const currentVal = dashState.selectedGroup;
        grpFilter.innerHTML = '<option value="ALL">Tất cả nhóm chi phí (39 mục)</option>';
        groups.forEach(g => {
            const opt = document.createElement('option');
            opt.value = g;
            opt.textContent = `${getGroupIcon(g)} ${g}`;
            grpFilter.appendChild(opt);
        });

        grpFilter.value = currentVal;
    }

    /**
     * Get processed rows from THACO_APP and calculate sums for selected months and years.
     * Strictly fulfills:
     * - showDetail === true:
     *   + Group Header: IN HOA TOÀN BỘ, CANH LỀ TRÁI, has icon & ':', NO bars (sum = null).
     *   + Child Categories: CANH LỀ PHẢI, normal case, has bars for selected years.
     * - showDetail === false:
     *   + Only displays the 7 parent groups with group total bars.
     */
    function getCalculatedData() {
        if (!window.THACO_APP || typeof window.THACO_APP.calculateReportData !== 'function') {
            return [];
        }

        const rawRows = window.THACO_APP.calculateReportData();
        const selMonths = dashState.selectedMonths || [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
        const selGroup = dashState.selectedGroup;
        const search = dashState.searchTerm;
        const showDetail = dashState.showDetail;

        // Process raw category rows
        const processedCategories = rawRows.map(r => {
            const cat = r.category || {};
            let sum24 = 0, sum25 = 0, sum26 = 0;

            selMonths.forEach(m => {
                const idx = m - 1;
                sum24 += (r.monthly2024 && r.monthly2024[idx]) || 0;
                sum25 += (r.monthly2025 && r.monthly2025[idx]) || 0;
                sum26 += (r.monthly2026 && r.monthly2026[idx]) || 0;
            });

            return {
                id: cat.id,
                tt: cat.tt || 999,
                name: cat.name || 'Chưa đặt tên',
                group: cat.group || 'Khác',
                isGroupHeader: false,
                is_material: !!cat.is_material,
                b7_display: cat.b7_display || '',
                b10_display: cat.b10_display || '',
                sum2024: Math.round(sum24 * 10) / 10,
                sum2025: Math.round(sum25 * 10) / 10,
                sum2026: Math.round(sum26 * 10) / 10,
                monthly2024: r.monthly2024 || Array(12).fill(0),
                monthly2025: r.monthly2025 || Array(12).fill(0),
                monthly2026: r.monthly2026 || Array(12).fill(0)
            };
        });

        // -------------------------------------------------------------
        // CHẾ ĐỘ 1: BẬT XEM CHI TIẾT (showDetail === true)
        // Group Header: IN HOA, CANH LỀ TRÁI, KHÔNG CÓ CỘT SỐ LIỆU
        // Khoản mục: CANH LỀ PHẢI, CÓ CỘT SỐ LIỆU
        // -------------------------------------------------------------
        if (showDetail) {
            // Group categories by group name
            const groupOrder = [];
            const groupedMap = new Map();

            processedCategories.forEach(cat => {
                const gName = cat.group;
                if (!groupedMap.has(gName)) {
                    groupedMap.set(gName, []);
                    groupOrder.push(gName);
                }
                groupedMap.get(gName).push(cat);
            });

            const resultRows = [];
            let currentRomanIdx = 0;

            groupOrder.forEach(gName => {
                if (selGroup && selGroup !== 'ALL' && gName !== selGroup) {
                    return;
                }

                let items = groupedMap.get(gName) || [];

                // Filter search
                if (search) {
                    items = items.filter(it =>
                        it.name.toLowerCase().includes(search) ||
                        it.group.toLowerCase().includes(search) ||
                        it.b7_display.toLowerCase().includes(search) ||
                        it.b10_display.toLowerCase().includes(search)
                    );
                    if (items.length === 0) return;
                }

                // Sort items by tt
                items.sort((a, b) => a.tt - b.tt);

                // 1. DÒNG TIÊU ĐỀ NHÓM: IN HOA TOÀN BỘ, CANH LỀ TRÁI, KHÔNG CÓ CỘT
                const roman = ROMAN_NUMERALS[currentRomanIdx] || String(currentRomanIdx + 1);
                currentRomanIdx++;

                resultRows.push({
                    id: `HEADER_${gName}`,
                    isGroupHeader: true,
                    group: gName,
                    name: `${getGroupIcon(gName)} ${roman}. ${gName.toUpperCase()}:`,
                    sum2024: null,
                    sum2025: null,
                    sum2026: null,
                    monthly2024: Array(12).fill(0),
                    monthly2025: Array(12).fill(0),
                    monthly2026: Array(12).fill(0)
                });

                // 2. CÁC DÒNG KHOẢN MỤC CON: CANH LỀ PHẢI, CÓ CỘT
                items.forEach(cat => {
                    resultRows.push({
                        ...cat,
                        isGroupHeader: false
                    });
                });
            });

            return resultRows;
        }

        // -------------------------------------------------------------
        // CHẾ ĐỘ 2: TẮT XEM CHI TIẾT (showDetail === false)
        // Rút gọn: CHỈ hiển thị đúng các Nhóm chi phí (7 nhóm lớn)
        // -------------------------------------------------------------
        const groupMap = new Map();
        processedCategories.forEach(cat => {
            const gName = cat.group;
            if (!groupMap.has(gName)) {
                groupMap.set(gName, {
                    name: gName,
                    isGroupHeader: false,
                    isGroupSummary: true,
                    group: gName,
                    count: 0,
                    sum2024: 0,
                    sum2025: 0,
                    sum2026: 0,
                    monthly2024: Array(12).fill(0),
                    monthly2025: Array(12).fill(0),
                    monthly2026: Array(12).fill(0)
                });
            }
            const gObj = groupMap.get(gName);
            gObj.count += 1;
            gObj.sum2024 += cat.sum2024;
            gObj.sum2025 += cat.sum2025;
            gObj.sum2026 += cat.sum2026;
            for (let i = 0; i < 12; i++) {
                gObj.monthly2024[i] += (cat.monthly2024[i] || 0);
                gObj.monthly2025[i] += (cat.monthly2025[i] || 0);
                gObj.monthly2026[i] += (cat.monthly2026[i] || 0);
            }
        });

        let groupList = Array.from(groupMap.values()).map((g, idx) => {
            const cleanGName = g.name.replace(/\s*\(\d+\)$/, '').trim();
            return {
                id: `GRP_${idx + 1}`,
                name: `${getGroupIcon(g.name)} ${ROMAN_NUMERALS[idx] || idx + 1}. ${cleanGName.toUpperCase()} (${g.count} MỤC)`,
                group: g.name,
                isGroupHeader: false,
                isGroupSummary: true,
                count: g.count,
                sum2024: Math.round(g.sum2024 * 10) / 10,
                sum2025: Math.round(g.sum2025 * 10) / 10,
                sum2026: Math.round(g.sum2026 * 10) / 10,
                monthly2024: g.monthly2024,
                monthly2025: g.monthly2025,
                monthly2026: g.monthly2026
            };
        });

        if (selGroup && selGroup !== 'ALL') {
            groupList = groupList.filter(g => g.group === selGroup);
        }
        if (search) {
            groupList = groupList.filter(g => g.name.toLowerCase().includes(search));
        }

        return groupList;
    }

    /**
     * Update Executive KPI strip
     */
    function updateKPIs() {
        const rawRows = (window.THACO_APP && window.THACO_APP.calculateReportData) ? window.THACO_APP.calculateReportData() : [];
        const selMonths = dashState.selectedMonths || [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

        let tot24 = 0, tot25 = 0, tot26 = 0;
        let topItemName = '-';
        let topItemVal = 0;

        if (dashState.showDetail) {
            let maxVal26 = -1;
            rawRows.forEach(r => {
                let s24 = 0, s25 = 0, s26 = 0;
                selMonths.forEach(m => {
                    s24 += (r.monthly2024 && r.monthly2024[m - 1]) || 0;
                    s25 += (r.monthly2025 && r.monthly2025[m - 1]) || 0;
                    s26 += (r.monthly2026 && r.monthly2026[m - 1]) || 0;
                });
                tot24 += s24;
                tot25 += s25;
                tot26 += s26;
                if (s26 > maxVal26) {
                    maxVal26 = s26;
                    topItemName = (r.category && r.category.name) || '';
                    topItemVal = s26;
                }
            });
        } else {
            const gSums = new Map();
            rawRows.forEach(r => {
                const g = (r.category && r.category.group) || 'Khác';
                let s24 = 0, s25 = 0, s26 = 0;
                selMonths.forEach(m => {
                    s24 += (r.monthly2024 && r.monthly2024[m - 1]) || 0;
                    s25 += (r.monthly2025 && r.monthly2025[m - 1]) || 0;
                    s26 += (r.monthly2026 && r.monthly2026[m - 1]) || 0;
                });
                tot24 += s24;
                tot25 += s25;
                tot26 += s26;
                gSums.set(g, (gSums.get(g) || 0) + s26);
            });
            let maxGVal = -1;
            gSums.forEach((v, k) => {
                if (v > maxGVal) {
                    maxGVal = v;
                    topItemName = `${getGroupIcon(k)} ${k}`;
                    topItemVal = v;
                }
            });
        }

        const el24 = document.getElementById('kpi-dash-tot-2024');
        const el25 = document.getElementById('kpi-dash-tot-2025');
        const el26 = document.getElementById('kpi-dash-tot-2026');
        const elGrowth = document.getElementById('kpi-dash-growth-label');
        const elTopName = document.getElementById('kpi-dash-top-cat-name');
        const elTopVal = document.getElementById('kpi-dash-top-cat-val');
        const elCount = document.getElementById('dash-chart-item-count');

        if (el24) el24.textContent = `${Math.round(tot24).toLocaleString('vi-VN')} Tr.đ`;
        if (el25) el25.textContent = `${Math.round(tot25).toLocaleString('vi-VN')} Tr.đ`;
        if (el26) el26.textContent = `${Math.round(tot26).toLocaleString('vi-VN')} Tr.đ`;
        if (elCount) {
            const distinctGroups = new Set(rawRows.map(r => (r.category && r.category.group) || '').filter(Boolean));
            const groupCount = distinctGroups.size || 3;
            elCount.textContent = dashState.showDetail ? `${rawRows.length} Khoản mục` : `${groupCount} Nhóm Chi Phí`;
        }

        if (elGrowth) {
            if (tot25 > 0) {
                const pct = ((tot26 - tot25) / tot25) * 100;
                const sign = pct >= 0 ? '+' : '';
                elGrowth.textContent = `YoY: ${sign}${pct.toFixed(1)}% so với 2025`;
                elGrowth.className = pct > 0 ? 'text-[10px] font-bold text-amber-600' : 'text-[10px] font-bold text-emerald-600';
            } else {
                elGrowth.textContent = 'YoY: -';
            }
        }

        if (elTopName && elTopVal) {
            elTopName.textContent = topItemName;
            const pct = tot26 > 0 ? ((topItemVal / tot26) * 100).toFixed(1) : 0;
            elTopVal.textContent = `${Math.round(topItemVal).toLocaleString('vi-VN')} Tr.đ (${pct}%)`;
        }
    }

    /**
     * Đồng bộ hóa dòng Năm cố định phía trên biểu đồ với bộ lọc
     */
    function updateStickyYearHeader() {
        const selYears = dashState.selectedYears || ['2026', '2025', '2024'];
        ['2026', '2025', '2024'].forEach(y => {
            const el = document.getElementById(`dash-sticky-year-${y}`);
            if (el) {
                el.style.display = selYears.includes(y) ? 'inline-flex' : 'none';
            }
        });
    }

    // Mouse position tracker for accurate bring-to-front external tooltips
    let lastMouseX = 0;
    let lastMouseY = 0;
    window.addEventListener('mousemove', (e) => {
        lastMouseX = e.clientX;
        lastMouseY = e.clientY;
    }, { passive: true });

    /**
     * GLOBAL EXTERNAL HTML TOOLTIP ENGINE CHO TOÀN BỘ BIỂU ĐỒ CHART.JS
     * Giải quyết triệt để yêu cầu "bring to front" (luôn nổi lên trên cùng):
     * - Tooltip được tạo và quản lý trực tiếp trên document.body với position: fixed và z-index: 99999999
     * - Hoàn toàn không bị cắt (clip) bởi overflow-y: auto của #dash-main-chart-scroll-container
     * - Nổi lên trên dòng Năm cố định (#dash-sticky-year-header, z-20) và mọi thành phần UI khác
     * - Tự động phát hiện mép màn hình (collision detection) chống tràn viền
     */
    function hideChartGlobalTooltip() {
        const tooltipEl = document.getElementById('chart-global-external-tooltip');
        if (tooltipEl) {
            tooltipEl.style.setProperty('opacity', '0', 'important');
            tooltipEl.style.setProperty('display', 'none', 'important');
        }
    }

    function getOrCreateTooltipEl() {
        let tooltipEl = document.getElementById('chart-global-external-tooltip');
        if (!tooltipEl) {
            tooltipEl = document.createElement('div');
            tooltipEl.id = 'chart-global-external-tooltip';
            tooltipEl.className = 'fixed pointer-events-none select-none transition-opacity duration-150 text-xs text-white';
            tooltipEl.style.setProperty('z-index', '99999999', 'important');
            tooltipEl.style.setProperty('position', 'fixed', 'important');
            tooltipEl.style.setProperty('pointer-events', 'none', 'important');
            tooltipEl.style.backgroundColor = 'rgba(15, 23, 42, 0.96)';
            tooltipEl.style.backdropFilter = 'blur(12px)';
            tooltipEl.style.webkitBackdropFilter = 'blur(12px)';
            tooltipEl.style.border = '1px solid rgba(255, 255, 255, 0.18)';
            tooltipEl.style.borderRadius = '12px';
            tooltipEl.style.padding = '12px 14px';
            tooltipEl.style.boxShadow = '0 20px 25px -5px rgba(0, 0, 0, 0.6), 0 8px 10px -6px rgba(0, 0, 0, 0.5)';
            tooltipEl.style.maxWidth = '380px';
            tooltipEl.style.minWidth = '240px';
            tooltipEl.style.setProperty('display', 'none', 'important');
            tooltipEl.style.setProperty('opacity', '0', 'important');
            document.body.appendChild(tooltipEl);
        }
        return tooltipEl;
    }

    function positionAndShowTooltip(tooltipEl, mouseX, mouseY) {
        tooltipEl.style.setProperty('display', 'block', 'important');
        tooltipEl.style.setProperty('opacity', '1', 'important');
        tooltipEl.style.setProperty('z-index', '99999999', 'important');
        tooltipEl.style.setProperty('position', 'fixed', 'important');
        tooltipEl.style.setProperty('pointer-events', 'none', 'important');

        const tooltipWidth = tooltipEl.offsetWidth || 260;
        const tooltipHeight = tooltipEl.offsetHeight || 120;

        let left = (mouseX > 0 ? mouseX + 16 : 20);
        let top = (mouseY > 0 ? mouseY - (tooltipHeight / 2) : 20);

        // Chống tràn mép phải màn hình
        if (left + tooltipWidth > window.innerWidth - 12) {
            left = mouseX - tooltipWidth - 16;
        }
        if (left < 12) left = 12;

        // Chống tràn mép dưới
        if (top + tooltipHeight > window.innerHeight - 12) {
            top = window.innerHeight - tooltipHeight - 12;
        }
        if (top < 12) top = 12;

        tooltipEl.style.setProperty('left', `${Math.round(left)}px`, 'important');
        tooltipEl.style.setProperty('top', `${Math.round(top)}px`, 'important');
    }

    function showDirectItemTooltip(item, mouseX, mouseY) {
        if (!item || item.isGroupHeader) {
            hideChartGlobalTooltip();
            return;
        }

        const tooltipEl = getOrCreateTooltipEl();
        const selYears = dashState.selectedYears || ['2026', '2025', '2024'];

        let titleHtml = item.isGroupSummary
            ? `<div class="font-bold text-xs text-cyan-300 pb-1.5 mb-1.5 border-b border-slate-700/80 leading-snug">${getGroupIcon(item.group)} TỔNG NHÓM: ${item.group}</div>`
            : `<div class="font-bold text-xs text-cyan-300 pb-1.5 mb-1.5 border-b border-slate-700/80 leading-snug">🔹 Khoản mục: ${item.name}</div>`;

        let subtitleHtml = item.isGroupSummary
            ? `<div class="text-[11px] text-slate-300 font-medium mb-1.5 leading-snug">Tổng hợp ${item.count} khoản mục thuộc nhóm</div>`
            : `<div class="text-[11px] text-slate-300 font-medium mb-1.5 leading-snug">Nhóm: ${getGroupIcon(item.group)} ${item.group}</div>`;

        let rowsHtml = '<div class="space-y-1 my-1">';
        if (selYears.includes('2026') && item.sum2026 !== null && item.sum2026 !== undefined) {
            rowsHtml += `
                <div class="flex items-center gap-2 text-xs">
                    <span class="w-2.5 h-2.5 rounded-full flex-shrink-0" style="background-color: ${YEAR_COLORS['2026'].bg}; border: 1px solid ${YEAR_COLORS['2026'].border};"></span>
                    <span class="text-slate-100 font-medium">Năm 2026: ${Math.round(item.sum2026).toLocaleString('vi-VN')} Tr.đ</span>
                </div>`;
        }
        if (selYears.includes('2025') && item.sum2025 !== null && item.sum2025 !== undefined) {
            rowsHtml += `
                <div class="flex items-center gap-2 text-xs">
                    <span class="w-2.5 h-2.5 rounded-full flex-shrink-0" style="background-color: ${YEAR_COLORS['2025'].bg}; border: 1px solid ${YEAR_COLORS['2025'].border};"></span>
                    <span class="text-slate-100 font-medium">Năm 2025: ${Math.round(item.sum2025).toLocaleString('vi-VN')} Tr.đ</span>
                </div>`;
        }
        if (selYears.includes('2024') && item.sum2024 !== null && item.sum2024 !== undefined) {
            rowsHtml += `
                <div class="flex items-center gap-2 text-xs">
                    <span class="w-2.5 h-2.5 rounded-full flex-shrink-0" style="background-color: ${YEAR_COLORS['2024'].bg}; border: 1px solid ${YEAR_COLORS['2024'].border};"></span>
                    <span class="text-slate-100 font-medium">Năm 2024: ${Math.round(item.sum2024).toLocaleString('vi-VN')} Tr.đ</span>
                </div>`;
        }
        rowsHtml += '</div>';

        let afterHtml = '<div class="mt-2 pt-1.5 border-t border-slate-700/60 text-[11px] text-amber-300 font-medium space-y-0.5 leading-snug">';
        if (selYears.includes('2025') && selYears.includes('2026') && item.sum2025 > 0) {
            const yoy = (((item.sum2026 - item.sum2025) / item.sum2025) * 100).toFixed(1);
            const sign = yoy >= 0 ? '+' : '';
            afterHtml += `<div>Biến động YoY (2026 vs 2025): ${sign}${yoy}%</div>`;
        }
        afterHtml += `<div>👉 Bấm chuột để xem chi tiết các Đơn vị phát sinh</div></div>`;

        tooltipEl.innerHTML = titleHtml + subtitleHtml + rowsHtml + afterHtml;
        positionAndShowTooltip(tooltipEl, mouseX, mouseY);
    }

    function renderChartExternalTooltip(context) {
        const { chart, tooltip } = context;
        if (!tooltip || tooltip.opacity === 0) {
            hideChartGlobalTooltip();
            return;
        }

        const tooltipEl = getOrCreateTooltipEl();

        // Định dạng nội dung HTML theo dữ liệu tooltip của Chart.js
        if (tooltip.body) {
            const titleLines = tooltip.title || [];
            const beforeBody = tooltip.beforeBody || [];
            const bodyLines = tooltip.body.map(b => b.lines);
            const afterBody = tooltip.afterBody || [];

            let html = '';

            if (titleLines.length > 0) {
                html += `<div class="font-bold text-xs text-cyan-300 pb-1.5 mb-1.5 border-b border-slate-700/80 leading-snug">${titleLines.join('<br>')}</div>`;
            }

            if (beforeBody.length > 0) {
                html += `<div class="text-[11px] text-slate-300 font-medium mb-1.5 leading-snug">${beforeBody.join('<br>')}</div>`;
            }

            if (bodyLines.length > 0) {
                html += `<div class="space-y-1 my-1">`;
                bodyLines.forEach((body, i) => {
                    const colors = (tooltip.labelColors && tooltip.labelColors[i]) || {};
                    const bg = colors.backgroundColor || '#00529C';
                    const border = colors.borderColor || bg;
                    const textStr = Array.isArray(body) ? body.join(' ') : String(body);
                    html += `
                        <div class="flex items-center gap-2 text-xs">
                            <span class="w-2.5 h-2.5 rounded-full flex-shrink-0" style="background-color: ${bg}; border: 1px solid ${border};"></span>
                            <span class="text-slate-100 font-medium">${textStr}</span>
                        </div>`;
                });
                html += `</div>`;
            }

            if (afterBody.length > 0) {
                html += `<div class="mt-2 pt-1.5 border-t border-slate-700/60 text-[11px] text-amber-300 font-medium space-y-0.5 leading-snug">`;
                afterBody.forEach(line => {
                    html += `<div>${line}</div>`;
                });
                html += `</div>`;
            }

            tooltipEl.innerHTML = html;
        }

        const canvasRect = chart.canvas.getBoundingClientRect();
        const mouseX = (lastMouseX > 0 ? lastMouseX : canvasRect.left + tooltip.caretX);
        const mouseY = (lastMouseY > 0 ? lastMouseY : canvasRect.top + tooltip.caretY);

        positionAndShowTooltip(tooltipEl, mouseX, mouseY);
    }

    /**
     * RENDER THE MAIN EXECUTIVE FULL-WIDTH HORIZONTAL BAR CHART
     */
    function renderMainHorizontalChart() {
        if (!window.Chart) return;

        const ctx = document.getElementById('chart-main-horizontal-bars');
        if (!ctx) return;

        const data = getCalculatedData();
        const selYears = dashState.selectedYears || ['2026', '2025', '2024'];
        const chartWrapper = document.getElementById('dash-main-chart-wrapper');
        const showDetail = dashState.showDetail;

        // Đồng bộ dòng Năm cố định phía trên biểu đồ
        updateStickyYearHeader();

        // Tính toán kích thước Bar và khoảng cách theo yêu cầu người dùng:
        // - Bật xem chi tiết:
        //   * Độ rộng của mỗi chi phí là 100px (rowHeight = 100) theo yêu cầu người dùng
        //   * Bars to rõ ràng (~20px cho 3 năm)
        //   * Khoảng trống giữa các Bars từng năm = 8px
        //   * Khoảng trống giữa các chi phí trong cùng 1 nhóm = 24px (100 - 76 = 24px)
        // - Tắt xem chi tiết:
        //   * Độ rộng của mỗi nhóm chi phí CŨNG LÀ 100px (rowHeight = 100) theo yêu cầu người dùng
        //   * Bars to rõ ràng (~20px cho 3 năm)
        //   * Khoảng trống giữa các Bars từng năm = 8px
        //   * Khoảng trống giữa các nhóm = 24px (100 - 76 = 24px)
        const numBars = selYears.length;
        let rowHeight = 100;
        let barThick = 20;
        let catPct = 76 / 100; // 0.76

        if (showDetail) {
            rowHeight = 100; // ĐỘ RỘNG CỦA MỖI CHI PHÍ LÀ 100PX
            if (numBars === 3) {
                barThick = 20;
                catPct = 76 / 100; // Category space: 76px, 3 bars * 20px = 60px, 2 gaps = 8px. Khoảng trống chi phí = 24px
            } else if (numBars === 2) {
                barThick = 28;
                catPct = 76 / 100; // Category space: 76px, 2 bars * 28px = 56px, gap = 20px. Khoảng trống chi phí = 24px
            } else {
                barThick = 36;
                catPct = 76 / 100; // Bar: 36px. Khoảng trống chi phí = 24px
            }
        } else {
            // TẮT XEM CHI TIẾT THÌ CÁC NHÓM CHI PHÍ CŨNG LÀ 100PX LUÔN
            rowHeight = 100; // ĐỘ RỘNG CỦA MỖI NHÓM CHI PHÍ CŨNG LÀ 100PX
            if (numBars === 3) {
                barThick = 20;
                catPct = 76 / 100; // Category space: 76px, 3 bars * 20px = 60px, 2 gaps = 8px. Khoảng trống = 24px
            } else if (numBars === 2) {
                barThick = 28;
                catPct = 76 / 100; // Category space: 76px, 2 bars * 28px = 56px. Khoảng trống = 24px
            } else {
                barThick = 36;
                catPct = 76 / 100; // Bar: 36px. Khoảng trống = 24px
            }
        }

        // Điều chỉnh chiều cao động cho container canvas (Mỗi chi phí/nhóm chi phí đúng 100px + 80px trục Ox)
        if (chartWrapper) {
            if (dashState.chartMode === 'HORIZONTAL_BAR') {
                const dynamicHeight = Math.max(620, data.length * rowHeight + 80);
                chartWrapper.style.height = `${dynamicHeight}px`;
            } else {
                chartWrapper.style.height = '460px';
            }
        }

        // Destroy existing chart instance
        if (dashState.activeCharts.main) {
            dashState.activeCharts.main.destroy();
            dashState.activeCharts.main = null;
        }

        if (dashState.chartMode === 'LINE_TREND') {
            renderMultiYearLineTrend(ctx, data, selYears);
            return;
        }

        // Calculate dynamic maxVal across all visible rows for selected years to balance Ox scale
        let maxVal = 0;
        data.forEach(d => {
            if (d.isGroupHeader) return;
            if (selYears.includes('2026') && typeof d.sum2026 === 'number' && d.sum2026 > maxVal) maxVal = d.sum2026;
            if (selYears.includes('2025') && typeof d.sum2025 === 'number' && d.sum2025 > maxVal) maxVal = d.sum2025;
            if (selYears.includes('2024') && typeof d.sum2024 === 'number' && d.sum2024 > maxVal) maxVal = d.sum2024;
        });

        // Function to calculate a clean, nicely proportioned upper bound for Ox
        function getNiceMax(val) {
            if (!val || val <= 0) return 100;
            const target = val * 1.18; // 18% headroom so bars occupy ~80-85% width and fit tip labels
            const magnitude = Math.pow(10, Math.floor(Math.log10(target)));
            const factor = target / magnitude;
            let niceFactor;
            if (factor <= 1.2) niceFactor = 1.2;
            else if (factor <= 1.5) niceFactor = 1.5;
            else if (factor <= 2.0) niceFactor = 2.0;
            else if (factor <= 2.5) niceFactor = 2.5;
            else if (factor <= 3.0) niceFactor = 3.0;
            else if (factor <= 4.0) niceFactor = 4.0;
            else if (factor <= 5.0) niceFactor = 5.0;
            else if (factor <= 6.0) niceFactor = 6.0;
            else if (factor <= 8.0) niceFactor = 8.0;
            else niceFactor = 10.0;
            return Math.ceil(niceFactor * magnitude);
        }

        const niceMax = getNiceMax(maxVal);

        // Dummy labels array for Chart.js index mapping
        const labels = data.map(item => item.name);

        // Build datasets in exact order: 2026 (top), 2025 (mid), 2024 (bottom)
        // Hiển thị nhãn là "Năm xxxx", loại bỏ hoàn toàn các ký tự "(N - hiện tại)", "(N-1)", "(N-2)"
        const datasets = [];

        if (selYears.includes('2026')) {
            datasets.push({
                label: 'Năm 2026',
                data: data.map(d => d.isGroupHeader ? null : d.sum2026),
                backgroundColor: YEAR_COLORS['2026'].bg,
                borderColor: YEAR_COLORS['2026'].border,
                borderWidth: 1,
                borderRadius: 4,
                barThickness: barThick,
                categoryPercentage: catPct,
                barPercentage: 1.0
            });
        }

        if (selYears.includes('2025')) {
            datasets.push({
                label: 'Năm 2025',
                data: data.map(d => d.isGroupHeader ? null : d.sum2025),
                backgroundColor: YEAR_COLORS['2025'].bg,
                borderColor: YEAR_COLORS['2025'].border,
                borderWidth: 1,
                borderRadius: 4,
                barThickness: barThick,
                categoryPercentage: catPct,
                barPercentage: 1.0
            });
        }

        if (selYears.includes('2024')) {
            datasets.push({
                label: 'Năm 2024',
                data: data.map(d => d.isGroupHeader ? null : d.sum2024),
                backgroundColor: YEAR_COLORS['2024'].bg,
                borderColor: YEAR_COLORS['2024'].border,
                borderWidth: 1,
                borderRadius: 4,
                barThickness: barThick,
                categoryPercentage: catPct,
                barPercentage: 1.0
            });
        }

        // Custom plugin:
        // 1. beforeDraw:
        //    - Tiêu đề Nhóm: dải nền màu xám (#e6ebf0) độ rộng 40px ngang ngăn cách toàn bộ chiều ngang biểu đồ
        //    - Chi phí thuộc nhóm & Phần lưới: nền màu vàng #feffd5 có độ nhạt gấp đôi (transparency 50%: rgba(254, 255, 213, 0.5))
        // 2. afterDraw:
        //    - Tiêu đề Nhóm: chữ in hoa, màu đỏ (#C00000), canh lề trái
        //    - Chi phí thuộc nhóm: chữ màu xanh dương (#00529C), to lên 2 size (14px), canh lề phải sát trục 300px
        //    - Tắt xem chi tiết: KHÔNG tô nền xám, chỉ hiển thị chữ đỏ (#C00000)
        const customHierarchicalAxisPlugin = {
            id: 'customHierarchicalAxisPlugin',
            beforeDraw: (chart) => {
                if (!showDetail) return;
                const cCtx = chart.ctx;
                const yAxis = chart.scales.y;
                const xAxis = chart.scales.x;
                if (!yAxis) return;

                const leftMargin = chart.chartArea.left; // Strictly 300px
                const rightMargin = chart.chartArea.right;

                // Hàm vẽ khối nền màu vàng (#feffd5) độ nhạt gấp đôi (50% transparency) cho cả phần chữ và phần lưới
                function drawYellowGroupGrid(startIdx, endIdx, headerIdx) {
                    if (startIdx < 0 || endIdx < 0 || startIdx > endIdx) return;
                    const yStartTick = yAxis.getPixelForTick(startIdx);
                    const yEndTick = yAxis.getPixelForTick(endIdx);
                    if (isNaN(yStartTick) || isNaN(yEndTick)) return;

                    // Khối vàng bắt đầu ngay dưới dải xám 40px của nhóm (yHeader + 20)
                    const yTop = (headerIdx >= 0 && !isNaN(yAxis.getPixelForTick(headerIdx)))
                        ? (yAxis.getPixelForTick(headerIdx) + 20)
                        : (yStartTick - (rowHeight / 2));

                    // Khối vàng kết thúc ngay trên dải xám 40px của nhóm tiếp theo (yNextHeader - 20)
                    const hasNextHeader = (endIdx + 1 < data.length) && data[endIdx + 1].isGroupHeader;
                    const yBottom = (hasNextHeader && !isNaN(yAxis.getPixelForTick(endIdx + 1)))
                        ? (yAxis.getPixelForTick(endIdx + 1) - 20)
                        : (yEndTick + (rowHeight / 2));

                    const blockHeight = yBottom - yTop;

                    cCtx.save();
                    // 1. TẠO NỀN MÀU VÀNG (#feffd5) NHẠT HƠN GẤP ĐÔI (TRANSPARENCY 50%)
                    cCtx.fillStyle = 'rgba(254, 255, 213, 0.5)';
                    cCtx.fillRect(0, yTop, rightMargin, blockHeight);

                    // Đường viền bao quanh khối chi phí
                    cCtx.strokeStyle = 'rgba(225, 215, 145, 0.55)';
                    cCtx.lineWidth = 1;
                    cCtx.strokeRect(0, yTop, rightMargin, blockHeight);

                    // Đường phân cách nhẹ giữa cột tiêu đề (300px) và phần lưới biểu đồ
                    cCtx.strokeStyle = 'rgba(215, 195, 120, 0.4)';
                    cCtx.beginPath();
                    cCtx.moveTo(leftMargin, yTop);
                    cCtx.lineTo(leftMargin, yBottom);
                    cCtx.stroke();

                    // 2. CÁC ĐƯỜNG KẺ LƯỚI NGANG (PHÂN TÁCH GIỮA CÁC KHOẢN MỤC CON)
                    cCtx.strokeStyle = 'rgba(215, 200, 140, 0.35)';
                    cCtx.lineWidth = 1;
                    cCtx.setLineDash([4, 4]);
                    for (let k = startIdx; k < endIdx; k++) {
                        const yTickA = yAxis.getPixelForTick(k);
                        const yTickB = yAxis.getPixelForTick(k + 1);
                        const yMid = (yTickA + yTickB) / 2;
                        cCtx.beginPath();
                        cCtx.moveTo(15, yMid);
                        cCtx.lineTo(rightMargin, yMid);
                        cCtx.stroke();
                    }

                    // 3. CÁC ĐƯỜNG KẺ LƯỚI DỌC THEO CÁC MỐC GIÁ TRỊ OX (PHẦN LƯỚI)
                    if (xAxis && xAxis.ticks) {
                        cCtx.strokeStyle = 'rgba(210, 195, 135, 0.28)';
                        cCtx.lineWidth = 1;
                        cCtx.setLineDash([2, 4]);
                        xAxis.ticks.forEach(t => {
                            const xPos = xAxis.getPixelForValue(t.value);
                            if (xPos >= leftMargin && xPos <= rightMargin) {
                                cCtx.beginPath();
                                cCtx.moveTo(xPos, yTop);
                                cCtx.lineTo(xPos, yBottom);
                                cCtx.stroke();
                            }
                        });
                    }
                    cCtx.restore();
                }

                let currentHeaderIdx = -1;
                let groupStartIdx = -1;
                let groupEndIdx = -1;

                data.forEach((item, index) => {
                    const yPos = yAxis.getPixelForTick(index);
                    if (yPos === undefined || isNaN(yPos)) return;

                    if (item.isGroupHeader) {
                        // Trước khi chuyển sang nhóm mới, hoàn thiện khối nền vàng của nhóm trước
                        if (groupStartIdx !== -1) {
                            drawYellowGroupGrid(groupStartIdx, groupEndIdx, currentHeaderIdx);
                            groupStartIdx = -1;
                            groupEndIdx = -1;
                        }
                        currentHeaderIdx = index;

                        // VẼ DẢI NỀN MÀU XÁM (#e6ebf0) ĐỘ RỘNG ĐÚNG 40PX NGANG NGĂN CÁCH TOÀN BỘ BIỂU ĐỒ
                        const bannerHeight = 40;
                        const bTop = yPos - (bannerHeight / 2);
                        const bBottom = yPos + (bannerHeight / 2);

                        cCtx.save();
                        cCtx.fillStyle = '#e6ebf0';
                        cCtx.fillRect(0, bTop, rightMargin, bannerHeight);

                        // Kẻ viền trên và dưới cho dải nền xám ngăn cách
                        cCtx.strokeStyle = '#ccd5de';
                        cCtx.lineWidth = 1;
                        cCtx.beginPath();
                        cCtx.moveTo(0, bTop);
                        cCtx.lineTo(rightMargin, bTop);
                        cCtx.moveTo(0, bBottom);
                        cCtx.lineTo(rightMargin, bBottom);
                        cCtx.stroke();
                        cCtx.restore();
                    } else {
                        if (groupStartIdx === -1) groupStartIdx = index;
                        groupEndIdx = index;
                    }
                });
                if (groupStartIdx !== -1) {
                    drawYellowGroupGrid(groupStartIdx, groupEndIdx, currentHeaderIdx);
                }
            },
            afterDraw: (chart) => {
                const cCtx = chart.ctx;
                const yAxis = chart.scales.y;
                if (!yAxis) return;

                const leftMargin = chart.chartArea.left; // Strictly 300px
                const rightMargin = chart.chartArea.right;

                data.forEach((item, index) => {
                    const yPos = yAxis.getPixelForTick(index);
                    if (yPos === undefined || isNaN(yPos)) return;

                    if (item.isGroupHeader) {
                        // 1. TIÊU ĐỀ NHÓM: CHỮ IN HOA, MÀU ĐỎ (#C00000), CANH LỀ TRÁI (nằm giữa dải xám 40px tại X = 18px)
                        cCtx.save();
                        cCtx.textAlign = 'left';
                        cCtx.textBaseline = 'middle';
                        cCtx.font = 'bold 14px Inter, system-ui, -apple-system, sans-serif';
                        cCtx.fillStyle = '#C00000'; // Màu chữ đỏ (#C00000)
                        cCtx.fillText(item.name, 18, yPos);
                        cCtx.restore();
                    } else if (item.isGroupSummary) {
                        // Chế độ 7 nhóm tổng hợp: TẮT xem chi tiết KHÔNG tô nền xám, CHỈ hiển thị chữ in hoa màu đỏ (#C00000)
                        cCtx.save();
                        cCtx.textAlign = 'left';
                        cCtx.textBaseline = 'middle';
                        cCtx.font = 'bold 13px Inter, system-ui, -apple-system, sans-serif';
                        cCtx.fillStyle = '#C00000'; // Màu chữ đỏ (#C00000)

                        let text = item.name;
                        const maxTextWidth = leftMargin - 30; // 270px
                        if (cCtx.measureText(text).width > maxTextWidth) {
                            while (cCtx.measureText(text + '...').width > maxTextWidth && text.length > 5) {
                                text = text.slice(0, -1);
                            }
                            text += '...';
                        }
                        cCtx.fillText(text, 18, yPos);
                        cCtx.restore();
                    } else {
                        // 2. CÁC CHI PHÍ THUỘC NHÓM: CHỮ MÀU XANH DƯƠNG (#00529C), TO LÊN 2 SIZE (14px), CANH LỀ PHẢI
                        cCtx.save();
                        cCtx.textAlign = 'right';
                        cCtx.textBaseline = 'middle';
                        cCtx.font = '600 14px Inter, system-ui, -apple-system, sans-serif'; // To lên 2 size so với 12px hiện tại
                        cCtx.fillStyle = '#00529C'; // Màu chữ xanh dương (#00529C)

                        // Cắt ngắn chữ nếu quá dài so với khoảng 300px
                        let text = item.name;
                        const maxTextWidth = leftMargin - 35; // 265px
                        if (cCtx.measureText(text).width > maxTextWidth) {
                            while (cCtx.measureText(text + '...').width > maxTextWidth && text.length > 5) {
                                text = text.slice(0, -1);
                            }
                            text += '...';
                        }
                        cCtx.fillText(text, leftMargin - 15, yPos);
                        cCtx.restore();
                    }
                });

                // 3. VẼ NHÃN SỐ LIỆU TẠI ĐẦU THANH ĐỂ TRỰC QUAN CHÍNH XÁC VỀ GIÁ TRỊ
                chart.data.datasets.forEach((dataset, dIdx) => {
                    const meta = chart.getDatasetMeta(dIdx);
                    if (!meta || meta.hidden) return;

                    meta.data.forEach((barElem, bIdx) => {
                        const val = dataset.data[bIdx];
                        if (val !== null && val !== undefined && val > 0) {
                            cCtx.save();
                            cCtx.font = 'bold 11px Inter, system-ui, -apple-system, sans-serif';
                            cCtx.fillStyle = '#334155'; // Slate-700
                            cCtx.textAlign = 'left';
                            cCtx.textBaseline = 'middle';
                            const textVal = `${Math.round(val).toLocaleString('vi-VN')} Tr`;
                            cCtx.fillText(textVal, barElem.x + 6, barElem.y);
                            cCtx.restore();
                        }
                    });
                });
            }
        };

        dashState.activeCharts.main = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: datasets
            },
            plugins: [customHierarchicalAxisPlugin],
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                layout: {
                    padding: {
                        left: 300, // Tiêu đề Oy luôn cố định 300px dù bật hay tắt xem chi tiết
                        right: 40  // Để đủ không gian cho nhãn số liệu ở đầu thanh dài nhất
                    }
                },
                interaction: {
                    mode: 'index',
                    axis: 'y',
                    intersect: false
                },
                plugins: {
                    legend: {
                        display: false // Dòng Năm cố định phía trên biểu đồ đã đảm nhận hiển thị và đồng bộ lọc
                    },
                    tooltip: {
                        enabled: false, // Sử dụng external HTML tooltip để bring to front 100%
                        external: renderChartExternalTooltip,
                        filter: (tooltipItem) => {
                            // Không hiển thị tooltip cho dòng Header Nhóm
                            const idx = tooltipItem.dataIndex;
                            const item = data[idx];
                            return !(item && item.isGroupHeader);
                        },
                        callbacks: {
                            title: (tooltipItems) => {
                                const idx = tooltipItems[0].dataIndex;
                                const item = data[idx];
                                if (!item) return '';
                                if (item.isGroupSummary) {
                                    return `${getGroupIcon(item.group)} TỔNG NHÓM: ${item.group}`;
                                }
                                return `🔹 Khoản mục: ${item.name}`;
                            },
                            beforeBody: (tooltipItems) => {
                                const idx = tooltipItems[0].dataIndex;
                                const item = data[idx];
                                if (!item) return [];
                                if (item.isGroupSummary) {
                                    return [`  Tổng hợp ${item.count} khoản mục thuộc nhóm`];
                                }
                                return [`  Nhóm: ${getGroupIcon(item.group)} ${item.group}`];
                            },
                            label: (context) => {
                                const val = context.raw || 0;
                                return `  ${context.dataset.label}: ${val.toLocaleString('vi-VN')} Tr.đ`;
                            },
                            afterBody: (tooltipItems) => {
                                const idx = tooltipItems[0].dataIndex;
                                const item = data[idx];
                                if (!item || item.isGroupHeader) return [];
                                const lines = [];
                                if (selYears.includes('2025') && selYears.includes('2026') && item.sum2025 > 0) {
                                    const yoy = (((item.sum2026 - item.sum2025) / item.sum2025) * 100).toFixed(1);
                                    const sign = yoy >= 0 ? '+' : '';
                                    lines.push(`  Biến động YoY (2026 vs 2025): ${sign}${yoy}%`);
                                }
                                lines.push('  👉 Bấm chuột để xem chi tiết các Đơn vị phát sinh');
                                return lines;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        min: 0,
                        max: niceMax, // Động theo giá trị lớn nhất giúp biểu đồ luôn cân đối
                        grid: { color: '#f1f5f9', lineWidth: 1 },
                        ticks: {
                            font: { size: 11, weight: 'bold' },
                            callback: (v) => `${v.toLocaleString('vi-VN')} Tr`
                        },
                        title: {
                            display: true,
                            text: `Tổng Chi Phí Kỳ Chọn (Đơn vị: Triệu đồng) — Cao nhất: ${Math.round(maxVal).toLocaleString('vi-VN')} Tr.đ`,
                            font: { size: 11, weight: 'bold' },
                            color: '#64748b'
                        }
                    },
                    y: {
                        grid: { display: false },
                        ticks: {
                            display: false // Drawn custom via plugin for left/right alignments!
                        }
                    }
                },
                onClick: (event, elements) => {
                    if (elements && elements.length > 0) {
                        const idx = elements[0].index;
                        const clickedItem = data[idx];
                        if (clickedItem && !clickedItem.isGroupHeader) {
                            openDrillDownModal(clickedItem);
                        }
                    }
                }
            }
        });

        // Lắng nghe di chuột và click trên toàn bộ Canvas để Tooltip nổi lên ngay lập tức khi rê chuột vào cột nhãn 300px
        if (!ctx._hasCustomTooltipListener) {
            ctx._hasCustomTooltipListener = true;

            ctx.addEventListener('mousemove', (e) => {
                if (!dashState.activeCharts.main || dashState.chartMode !== 'HORIZONTAL_BAR') return;
                const chart = dashState.activeCharts.main;
                const yAxis = chart.scales.y;
                if (!yAxis) return;

                const rect = ctx.getBoundingClientRect();
                const offsetX = e.clientX - rect.left;
                const offsetY = e.clientY - rect.top;

                // Nếu chuột nằm trong khoảng cột nhãn bên trái (X <= 300px):
                if (offsetX <= 300) {
                    const currentData = getCalculatedData();
                    let foundItem = null;
                    for (let i = 0; i < currentData.length; i++) {
                        const tickY = yAxis.getPixelForTick(i);
                        if (Math.abs(offsetY - tickY) <= 50) { // rowHeight = 100px -> bán kính 50px
                            foundItem = currentData[i];
                            break;
                        }
                    }

                    if (foundItem && !foundItem.isGroupHeader) {
                        showDirectItemTooltip(foundItem, e.clientX, e.clientY);
                    } else {
                        hideChartGlobalTooltip();
                    }
                }
            });

            ctx.addEventListener('click', (e) => {
                if (!dashState.activeCharts.main || dashState.chartMode !== 'HORIZONTAL_BAR') return;
                const chart = dashState.activeCharts.main;
                const yAxis = chart.scales.y;
                if (!yAxis) return;

                const rect = ctx.getBoundingClientRect();
                const offsetX = e.clientX - rect.left;
                const offsetY = e.clientY - rect.top;

                // Nếu click vào cột nhãn bên trái 300px:
                if (offsetX <= 300) {
                    const currentData = getCalculatedData();
                    for (let i = 0; i < currentData.length; i++) {
                        const tickY = yAxis.getPixelForTick(i);
                        if (Math.abs(offsetY - tickY) <= 50) {
                            const clickedItem = currentData[i];
                            if (clickedItem && !clickedItem.isGroupHeader) {
                                openDrillDownModal(clickedItem);
                            }
                            break;
                        }
                    }
                }
            });

            ctx.addEventListener('mouseleave', () => {
                hideChartGlobalTooltip();
            });

            const scrollContainer = document.getElementById('dash-main-chart-scroll-container');
            if (scrollContainer) {
                scrollContainer.addEventListener('scroll', () => {
                    hideChartGlobalTooltip();
                }, { passive: true });
            }
        }
    }

    /**
     * Alternative view: 12-Month Multi-Year Trend Line Chart
     */
    function renderMultiYearLineTrend(ctx, data, selYears) {
        const monthLabels = ['T01', 'T02', 'T03', 'T04', 'T05', 'T06', 'T07', 'T08', 'T09', 'T10', 'T11', 'T12'];
        const m26 = Array(12).fill(0);
        const m25 = Array(12).fill(0);
        const m24 = Array(12).fill(0);

        data.forEach(item => {
            if (item.isGroupHeader) return;
            for (let i = 0; i < 12; i++) {
                m26[i] += item.monthly2026[i] || 0;
                m25[i] += item.monthly2025[i] || 0;
                m24[i] += item.monthly2024[i] || 0;
            }
        });

        const datasets = [];

        if (selYears.includes('2026')) {
            datasets.push({
                label: 'Năm 2026',
                data: m26.map(v => Math.round(v)),
                borderColor: YEAR_COLORS['2026'].border,
                backgroundColor: YEAR_COLORS['2026'].light,
                borderWidth: 3.5,
                fill: true,
                tension: 0.35,
                pointRadius: 5
            });
        }

        if (selYears.includes('2025')) {
            datasets.push({
                label: 'Năm 2025',
                data: m25.map(v => Math.round(v)),
                borderColor: YEAR_COLORS['2025'].border,
                backgroundColor: YEAR_COLORS['2025'].light,
                borderWidth: 2.5,
                fill: false,
                tension: 0.35,
                pointRadius: 4
            });
        }

        if (selYears.includes('2024')) {
            datasets.push({
                label: 'Năm 2024',
                data: m24.map(v => Math.round(v)),
                borderColor: YEAR_COLORS['2024'].border,
                backgroundColor: YEAR_COLORS['2024'].light,
                borderWidth: 2,
                fill: false,
                tension: 0.35,
                pointRadius: 4
            });
        }

        dashState.activeCharts.main = new Chart(ctx, {
            type: 'line',
            data: {
                labels: monthLabels,
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
                        labels: { font: { size: 12, weight: 'bold' } }
                    },
                    tooltip: {
                        enabled: false,
                        external: renderChartExternalTooltip,
                        callbacks: {
                            label: (c) => `  ${c.dataset.label}: ${c.raw.toLocaleString('vi-VN')} Tr.đ`
                        }
                    }
                },
                scales: {
                    x: { ticks: { font: { size: 11, weight: 'bold' } } },
                    y: {
                        ticks: {
                            font: { size: 10 },
                            callback: (v) => `${v.toLocaleString('vi-VN')} Tr`
                        }
                    }
                }
            }
        });
    }

    /**
     * Drill-down modal showing entity breakdown
     */
    function openDrillDownModal(item) {
        const modal = document.getElementById('dash-drilldown-modal');
        const modalGroup = document.getElementById('modal-cat-group');
        const modalName = document.getElementById('modal-cat-name');
        const tbody = document.getElementById('modal-drilldown-tbody');
        if (!modal || !tbody) return;

        modalGroup.textContent = `${getGroupIcon(item.group)} Nhóm: ${item.group}`;
        modalName.textContent = `${item.name} (${item.b7_display || item.b10_display || 'Mục ' + item.id})`;

        const app = window.THACO_APP;
        const entities = (app && app.state && app.state.entities) || [];
        const selMonths = dashState.selectedMonths || [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

        tbody.innerHTML = '';

        let totalRow24 = 0, totalRow25 = 0, totalRow26 = 0;

        const threshold = (app && app.state && app.state.yoyConfig && app.state.yoyConfig.thresholdPercent) || 20;

        function renderYoYCell(vNew, vOld) {
            if (!vOld || vOld <= 0) {
                if (vNew > 0) return '<span class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800">Mới</span>';
                return '<span class="text-slate-400 font-mono text-xs">-</span>';
            }
            const diff = ((vNew - vOld) / vOld) * 100;
            const sign = diff >= 0 ? '+' : '';
            const txt = `${sign}${diff.toFixed(1)}%`;
            if (Math.abs(diff) >= threshold) {
                if (diff > 0) {
                    return `<span class="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-black bg-rose-100 text-rose-800 border border-rose-300">▲ ${txt} ⚠️</span>`;
                } else {
                    return `<span class="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-black bg-emerald-100 text-emerald-800 border border-emerald-300">▼ ${txt}</span>`;
                }
            }
            const color = diff > 0 ? 'text-amber-700' : (diff < 0 ? 'text-emerald-700' : 'text-slate-600');
            return `<span class="font-bold font-mono text-xs ${color}">${txt}</span>`;
        }

        entities.forEach(ent => {
            let e24 = 0, e25 = 0, e26 = 0;

            if (app && app.calculateReportData) {
                const rows = app.calculateReportData({ phapNhan: ent.code });
                if (item.isGroupSummary) {
                    const grpRows = rows.filter(x => x.category && x.category.group === item.group);
                    grpRows.forEach(r => {
                        selMonths.forEach(m => {
                            const idx = m - 1;
                            e24 += (r.monthly2024 && r.monthly2024[idx]) || 0;
                            e25 += (r.monthly2025 && r.monthly2025[idx]) || 0;
                            e26 += (r.monthly2026 && r.monthly2026[idx]) || 0;
                        });
                    });
                } else {
                    const r = rows.find(x => x.category && x.category.id === item.id);
                    if (r) {
                        selMonths.forEach(m => {
                            const idx = m - 1;
                            e24 += (r.monthly2024 && r.monthly2024[idx]) || 0;
                            e25 += (r.monthly2025 && r.monthly2025[idx]) || 0;
                            e26 += (r.monthly2026 && r.monthly2026[idx]) || 0;
                        });
                    }
                }
            }

            totalRow24 += e24;
            totalRow25 += e25;
            totalRow26 += e26;

            const yoy26_25 = renderYoYCell(e26, e25);
            const yoy26_24 = renderYoYCell(e26, e24);
            const yoy25_24 = renderYoYCell(e25, e24);

            const tr = document.createElement('tr');
            tr.className = 'hover:bg-slate-50 transition-colors';
            tr.innerHTML = `
                <td class="px-3 py-2 font-mono font-bold text-slate-600">${ent.code}</td>
                <td class="px-3 py-2 font-medium text-slate-800">${ent.cleanName || ent.name}</td>
                <td class="px-3 py-2 text-right font-mono text-[#00529C] font-bold">${Math.round(e26).toLocaleString('vi-VN')}</td>
                <td class="px-3 py-2 text-right font-mono text-sky-600">${Math.round(e25).toLocaleString('vi-VN')}</td>
                <td class="px-3 py-2 text-right font-mono text-purple-700">${Math.round(e24).toLocaleString('vi-VN')}</td>
                <td class="px-3 py-2 text-right font-mono">${yoy26_25}</td>
                <td class="px-3 py-2 text-right font-mono">${yoy26_24}</td>
                <td class="px-3 py-2 text-right font-mono">${yoy25_24}</td>
            `;
            tbody.appendChild(tr);
        });

        // Total Row
        const totTr = document.createElement('tr');
        totTr.className = 'bg-slate-100 font-bold border-t-2 border-slate-300';
        totTr.innerHTML = `
            <td class="px-3 py-2" colspan="2">TỔNG CỘNG KỲ CHỌN</td>
            <td class="px-3 py-2 text-right font-mono text-[#00529C] font-bold">${Math.round(totalRow26).toLocaleString('vi-VN')}</td>
            <td class="px-3 py-2 text-right font-mono text-sky-600">${Math.round(totalRow25).toLocaleString('vi-VN')}</td>
            <td class="px-3 py-2 text-right font-mono text-purple-700">${Math.round(totalRow24).toLocaleString('vi-VN')}</td>
            <td class="px-3 py-2 text-right font-mono">${renderYoYCell(totalRow26, totalRow25)}</td>
            <td class="px-3 py-2 text-right font-mono">${renderYoYCell(totalRow26, totalRow24)}</td>
            <td class="px-3 py-2 text-right font-mono">${renderYoYCell(totalRow25, totalRow24)}</td>
        `;
        tbody.appendChild(totTr);

        modal.classList.remove('hidden');
    }

    /**
     * RENDER SUPPORTING 360° CHARTS (Cards 1-4)
     */
    function renderSupportingCharts() {
        if (!window.Chart || !window.THACO_APP) return;
        const app = window.THACO_APP;
        const state = app.state;
        const calcedRows = app.calculateReportData();

        // 1. CHART: CƠ CẤU 4 KHỐI QUẢN TRỊ (Doughnut)
        const ctxBlock = document.getElementById('chart-block-pie');
        if (ctxBlock) {
            const blocks = [
                { id: 'KHOI_VPDH', label: 'VP Điều Hành' },
                { id: 'KHOI_PP', label: 'PP THACO AUTO' },
                { id: 'KHOI_MB', label: 'Miền Bắc' },
                { id: 'KHOI_NHAMAY', label: 'Chu Lai (SX)' }
            ];

            const bVals = blocks.map(b => {
                const bRows = app.calculateReportData({ khoi: b.id });
                return Math.round(bRows.reduce((sum, r) => sum + (r.fullYear2026 || 0), 0));
            });

            if (dashState.activeCharts.blockPie) dashState.activeCharts.blockPie.destroy();
            dashState.activeCharts.blockPie = new Chart(ctxBlock, {
                type: 'doughnut',
                data: {
                    labels: blocks.map(b => b.label),
                    datasets: [{
                        data: bVals,
                        backgroundColor: ['#00529C', '#0EA5E9', '#059669', '#D97706'],
                        borderWidth: 2,
                        borderColor: '#ffffff'
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { position: 'bottom', labels: { font: { size: 10, weight: 'bold' } } },
                        tooltip: {
                            enabled: false,
                            external: renderChartExternalTooltip,
                            callbacks: {
                                label: (c) => `  ${c.label}: ${c.raw.toLocaleString('vi-VN')} Tr.đ`
                            }
                        }
                    }
                }
            });
        }

        // 2. CHART: DIỄN BIẾN 12 THÁNG 2026 (Line: Thực tế vs AI & Dải Cận Tự Tin CI)
        const backtestRes = calculateRollingBacktest();
        const ctxTrend = document.getElementById('chart-monthly-trend');
        if (ctxTrend) {
            const m25 = Array(12).fill(0);
            const m26 = Array(12).fill(0);
            calcedRows.forEach(r => {
                for (let i = 0; i < 12; i++) {
                    m25[i] += (r.monthly2025 && r.monthly2025[i]) || 0;
                    m26[i] += (r.monthly2026 && r.monthly2026[i]) || 0;
                }
            });

            const datasets = [
                {
                    label: 'Năm 2026 (Thực tế + AI)',
                    data: m26.map(v => Math.round(v)),
                    borderColor: '#00529C',
                    backgroundColor: 'rgba(0, 82, 156, 0.15)',
                    borderWidth: 3,
                    fill: true,
                    tension: 0.3
                },
                {
                    label: 'Năm 2025 (Thực tế)',
                    data: m25.map(v => Math.round(v)),
                    borderColor: '#58a1e0',
                    backgroundColor: 'rgba(88, 161, 224, 0.1)',
                    borderWidth: 2,
                    fill: false,
                    tension: 0.3
                }
            ];

            // Thêm dải biến động cận trên và cận dưới (Seasonal Variance CI) nếu có
            if (backtestRes && backtestRes.bounds) {
                const maxCI = Array(12).fill(null);
                const minCI = Array(12).fill(null);
                Object.keys(backtestRes.bounds).forEach(mStr => {
                    const m = parseInt(mStr, 10);
                    const b = backtestRes.bounds[m];
                    if (b) {
                        maxCI[m - 1] = Math.round(b.max);
                        minCI[m - 1] = Math.round(b.min);
                    }
                });

                datasets.push({
                    label: 'Dải Cận trên (Max CI)',
                    data: maxCI,
                    borderColor: '#0284c7',
                    borderDash: [5, 4],
                    borderWidth: 1.5,
                    pointRadius: 2.5,
                    pointBackgroundColor: '#0284c7',
                    fill: false,
                    tension: 0.3
                });

                datasets.push({
                    label: 'Dải Cận dưới (Min CI)',
                    data: minCI,
                    borderColor: '#6366f1',
                    borderDash: [5, 4],
                    borderWidth: 1.5,
                    pointRadius: 2.5,
                    pointBackgroundColor: '#6366f1',
                    fill: false,
                    tension: 0.3
                });
            }

            if (dashState.activeCharts.monthlyTrend) dashState.activeCharts.monthlyTrend.destroy();
            dashState.activeCharts.monthlyTrend = new Chart(ctxTrend, {
                type: 'line',
                data: {
                    labels: ['T01', 'T02', 'T03', 'T04', 'T05', 'T06', 'T07', 'T08', 'T09', 'T10', 'T11', 'T12'],
                    datasets: datasets
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { position: 'top', labels: { font: { size: 9.5, weight: 'bold' } } },
                        tooltip: {
                            enabled: false,
                            external: renderChartExternalTooltip,
                            callbacks: {
                                label: (c) => `  ${c.dataset.label}: ${c.raw !== null ? c.raw.toLocaleString('vi-VN') + ' Tr.đ' : '-'}`
                            }
                        }
                    }
                }
            });
        }

        // 3. CHART: PHÂN BỔ KHỐI PHÒNG BAN (Doughnut)
        const ctxDeptBlocks = document.getElementById('chart-dept-blocks');
        if (ctxDeptBlocks) {
            const blockSums = {
                'VP Điều Hành (VPĐH)': 0,
                'Phân Phối THACO AUTO': 0,
                'Miền Bắc (MB)': 0,
                'Miền Nam (MN)': 0,
                'Chu Lai (KSX)': 0,
                'Dùng chung & Khác': 0
            };
            const entities = state.entities || [];
            entities.forEach(ent => {
                if (state.deptData && state.deptData[ent.code]) {
                    const dRows = state.deptData[ent.code]['2025'] || [];
                    dRows.forEach(r => {
                        const bp = r.bp || '';
                        const tenBp = r.tenBp || '';
                        if (ent.code === 'C2305' || ent.code === 'C1102') blockSums['Phân Phối THACO AUTO'] += (r.total || 0);
                        else if (bp.startsWith('B70-A') || tenBp.startsWith('VPĐH')) blockSums['VP Điều Hành (VPĐH)'] += (r.total || 0);
                        else if (bp.startsWith('B70-C') || tenBp.startsWith('Miền Bắc')) blockSums['Miền Bắc (MB)'] += (r.total || 0);
                        else if (bp.startsWith('B70-B') || tenBp.startsWith('Miền Nam')) blockSums['Miền Nam (MN)'] += (r.total || 0);
                        else if (bp.startsWith('B70-D') || tenBp.includes('Chu Lai')) blockSums['Chu Lai (KSX)'] += (r.total || 0);
                        else blockSums['Dùng chung & Khác'] += (r.total || 0);
                    });
                }
            });

            const labels = Object.keys(blockSums);
            const vals = labels.map(k => Math.round(blockSums[k] / 1e6));

            if (dashState.activeCharts.deptBlocks) dashState.activeCharts.deptBlocks.destroy();
            dashState.activeCharts.deptBlocks = new Chart(ctxDeptBlocks, {
                type: 'doughnut',
                data: {
                    labels: labels,
                    datasets: [{
                        data: vals,
                        backgroundColor: ['#00529C', '#0EA5E9', '#0284C7', '#059669', '#D97706', '#64748B']
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { position: 'bottom', labels: { font: { size: 9, weight: 'bold' } } },
                        tooltip: {
                            enabled: false,
                            external: renderChartExternalTooltip,
                            callbacks: {
                                label: (c) => `  ${c.label}: ${c.raw.toLocaleString('vi-VN')} Tr.đ`
                            }
                        }
                    }
                }
            });
        }

        // 4. CHART: TOP 10 BỘ PHẬN CHI PHÍ LỚN NHẤT (Horizontal Bar)
        const ctxTopDepts = document.getElementById('chart-top-departments');
        if (ctxTopDepts) {
            const deptTotals = new Map();
            const entities = state.entities || [];
            entities.forEach(ent => {
                if (state.deptData && state.deptData[ent.code]) {
                    const dRows = state.deptData[ent.code]['2025'] || [];
                    dRows.forEach(r => {
                        const key = (r.bp || '') + ' - ' + (r.tenBp || '');
                        deptTotals.set(key, (deptTotals.get(key) || 0) + (r.total || 0));
                    });
                }
            });

            const topDepts = Array.from(deptTotals.entries())
                .sort((a, b) => b[1] - a[1])
                .slice(0, 10);

            const deptLabels = topDepts.map(d => d[0].length > 28 ? d[0].substring(0, 26) + '...' : d[0]);
            const deptVals = topDepts.map(d => Math.round(d[1] / 1e6));

            if (dashState.activeCharts.topDepts) dashState.activeCharts.topDepts.destroy();
            dashState.activeCharts.topDepts = new Chart(ctxTopDepts, {
                type: 'bar',
                data: {
                    labels: deptLabels,
                    datasets: [{
                        label: 'Lũy kế chi phí (Tr.đ)',
                        data: deptVals,
                        backgroundColor: '#00529C',
                        borderRadius: 4
                    }]
                },
                options: {
                    indexAxis: 'y',
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            enabled: false,
                            external: renderChartExternalTooltip,
                            callbacks: {
                                label: (c) => `  ${c.dataset.label}: ${c.raw.toLocaleString('vi-VN')} Tr.đ`
                            }
                        }
                    },
                    scales: {
                        x: { ticks: { font: { size: 9 } } },
                        y: { ticks: { font: { size: 9 } } }
                    }
                }
            });
        }

        // Cập nhật Bảng Đánh giá Rolling Backtest & Độ tin cậy AI
        renderBacktestPanel(backtestRes);
    }

    /**
     * TÍNH TOÁN KIỂM ĐỊNH ROLLING BACKTEST & DẢI CẬN PHƯƠNG SAI MÙA VỤ
     */
    function calculateRollingBacktest() {
        const app = window.THACO_APP;
        if (!app || !app.calculateReportData) return null;

        const calcedRows = app.calculateReportData();
        const actualMonths = (app.state && app.state.actualMonths) || [1, 2, 3, 4, 5, 6];

        if (!actualMonths || actualMonths.length < 3) {
            return null;
        }

        // Chia tập Train / Test: Dùng các tháng đầu làm Train, 2 tháng thực tế gần nhất làm Test
        const splitIdx = Math.max(1, actualMonths.length - 2);
        const trainMonths = actualMonths.slice(0, splitIdx);
        const testMonths = actualMonths.slice(splitIdx);

        const sum26 = Array(12).fill(0);
        const sum25 = Array(12).fill(0);
        const sum24 = Array(12).fill(0);

        calcedRows.forEach(r => {
            for (let i = 0; i < 12; i++) {
                sum26[i] += (r.monthly2026 && r.monthly2026[i]) || 0;
                sum25[i] += (r.monthly2025 && r.monthly2025[i]) || 0;
                sum24[i] += (r.monthly2024 && r.monthly2024[i]) || 0;
            }
        });

        // Tính hệ số run-rate chỉ trên tập huấn luyện (trainMonths)
        const trainSum26 = trainMonths.reduce((s, m) => s + sum26[m - 1], 0);
        const trainSum25 = trainMonths.reduce((s, m) => s + sum25[m - 1], 0);
        const backtestMultiplier = trainSum25 > 0 ? (trainSum26 / trainSum25) : 1.0;

        const backtestDetails = [];
        let sumApe = 0;

        testMonths.forEach(m => {
            const actualVal = sum26[m - 1] || 0;
            const base25 = sum25[m - 1] || 0;
            const predictedVal = base25 > 0 ? (base25 * backtestMultiplier) : (trainSum26 / trainMonths.length);
            const errorAbs = Math.abs(actualVal - predictedVal);
            const ape = actualVal > 0 ? (errorAbs / actualVal * 100) : 0;
            sumApe += ape;

            let accuracyRating = 'Xuất sắc';
            let badgeClass = 'bg-emerald-100 text-emerald-800 border-emerald-300';
            if (ape > 20) {
                accuracyRating = 'Biến động cao';
                badgeClass = 'bg-rose-100 text-rose-800 border-rose-300';
            } else if (ape > 10) {
                accuracyRating = 'Khá';
                badgeClass = 'bg-amber-100 text-amber-800 border-amber-300';
            }

            backtestDetails.push({
                month: m,
                monthLabel: `Tháng ${m < 10 ? '0' + m : m}/2026`,
                actual: actualVal,
                predicted: predictedVal,
                errorAbs: errorAbs,
                ape: ape,
                rating: accuracyRating,
                badgeClass: badgeClass
            });
        });

        const mape = testMonths.length > 0 ? (sumApe / testMonths.length) : 0;
        const confidenceScore = Math.max(0, Math.min(100, Math.round(100 - mape)));

        // Tính dải phương sai mùa vụ (bounds) cho các tháng còn lại trong năm
        const remainingMonths = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].filter(m => !actualMonths.includes(m));
        const actualSum26 = actualMonths.reduce((s, m) => s + sum26[m - 1], 0);
        const actualSum25 = actualMonths.reduce((s, m) => s + sum25[m - 1], 0);
        const fullMultiplier = actualSum25 > 0 ? (actualSum26 / actualSum25) : 1.0;

        const bounds = {};
        remainingMonths.forEach(m => {
            const base25 = sum25[m - 1] || 0;
            const base24 = sum24[m - 1] || 0;
            const predicted = base25 > 0 ? (base25 * fullMultiplier) : (actualSum26 / actualMonths.length);
            const histSpread = base24 > 0 ? Math.abs((base25 - base24) / base24) : 0.12;
            const spread = Math.max(0.06, Math.min(0.20, histSpread * 0.5));
            bounds[m] = {
                predicted: predicted,
                min: Math.max(0, predicted * (1 - spread)),
                max: predicted * (1 + spread),
                spreadPct: (spread * 100).toFixed(1)
            };
        });

        return {
            trainPeriod: `T${trainMonths[0]} - T${trainMonths[trainMonths.length - 1]}`,
            testPeriod: `T${testMonths[0]} - T${testMonths[testMonths.length - 1]}`,
            backtestMultiplier: backtestMultiplier,
            fullMultiplier: fullMultiplier,
            details: backtestDetails,
            mape: mape,
            confidenceScore: confidenceScore,
            bounds: bounds
        };
    }

    /**
     * RENDER GIAO DIỆN BẢNG BACKTEST & KPI ĐỘ TIN CẬY
     */
    function renderBacktestPanel(backtestRes) {
        const elMape = document.getElementById('kpi-backtest-mape');
        const elTrain = document.getElementById('kpi-backtest-train');
        const elTest = document.getElementById('kpi-backtest-test');
        const elBadge = document.getElementById('backtest-confidence-badge');
        const tbody = document.getElementById('backtest-table-body');

        if (!backtestRes) {
            if (elBadge) {
                elBadge.textContent = 'Chưa đủ kỳ dữ liệu (Cần ≥ 3 tháng)';
                elBadge.className = 'px-2.5 py-1 rounded-full text-xs font-black bg-slate-100 text-slate-700 border border-slate-300';
            }
            if (tbody) {
                tbody.innerHTML = '<tr><td colspan="6" class="p-4 text-center text-slate-400">Cần tối thiểu 3 tháng thực tế để thực hiện Rolling Backtest.</td></tr>';
            }
            return;
        }

        if (elMape) {
            elMape.textContent = `${backtestRes.mape.toFixed(1)}%`;
            elMape.className = `text-base font-black font-mono mt-0.5 ${backtestRes.mape <= 10 ? 'text-emerald-700' : (backtestRes.mape <= 20 ? 'text-amber-700' : 'text-rose-700')}`;
        }
        if (elTrain) elTrain.textContent = backtestRes.trainPeriod;
        if (elTest) elTest.textContent = backtestRes.testPeriod;

        if (elBadge) {
            const conf = backtestRes.confidenceScore;
            let confLabel = 'Rất cao';
            let badgeClass = 'bg-emerald-100 text-emerald-800 border-emerald-300';
            if (conf < 80) {
                confLabel = 'Khá';
                badgeClass = 'bg-amber-100 text-amber-800 border-amber-300';
            }
            if (conf < 70) {
                confLabel = 'Cần lưu ý';
                badgeClass = 'bg-rose-100 text-rose-800 border-rose-300';
            }
            elBadge.textContent = `Độ tin cậy: ${conf}% (${confLabel})`;
            elBadge.className = `px-2.5 py-1 rounded-full text-xs font-black border ${badgeClass}`;
        }

        if (tbody) {
            tbody.innerHTML = '';
            backtestRes.details.forEach(item => {
                const tr = document.createElement('tr');
                tr.className = 'hover:bg-slate-50 transition-colors';
                tr.innerHTML = `
                    <td class="px-3 py-2 font-bold text-slate-800">${item.monthLabel}</td>
                    <td class="px-3 py-2 text-right text-[#00529C] font-bold">${Math.round(item.actual).toLocaleString('vi-VN')}</td>
                    <td class="px-3 py-2 text-right text-indigo-700">${Math.round(item.predicted).toLocaleString('vi-VN')}</td>
                    <td class="px-3 py-2 text-right text-slate-700">${Math.round(item.errorAbs).toLocaleString('vi-VN')}</td>
                    <td class="px-3 py-2 text-right font-bold ${item.ape <= 10 ? 'text-emerald-700' : (item.ape <= 20 ? 'text-amber-700' : 'text-rose-700')}">
                        ${item.ape.toFixed(1)}%
                    </td>
                    <td class="px-3 py-2 text-center">
                        <span class="px-2 py-0.5 rounded text-[10px] font-black border ${item.badgeClass}">
                            ${item.rating}
                        </span>
                    </td>
                `;
                tbody.appendChild(tr);
            });
        }
    }

    /**
     * Export Main Chart as high-res PNG
     */
    function exportMainChartPNG() {
        const canvas = document.getElementById('chart-main-horizontal-bars');
        if (!canvas) return;

        const imageURI = canvas.toDataURL('image/png');
        const link = document.createElement('a');
        link.download = `Bieu_Do_Chi_Phi_Hanh_Chinh_THACO_AUTO_${new Date().toISOString().slice(0, 10)}.png`;
        link.href = imageURI;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    /**
     * Export currently filtered data to Excel
     */
    function exportDashboardDataExcel() {
        if (!window.XLSX) {
            alert('Thư viện SheetJS chưa sẵn sàng để xuất Excel.');
            return;
        }

        const data = getCalculatedData();
        const selYears = dashState.selectedYears || ['2026', '2025', '2024'];
        const selMonths = dashState.selectedMonths || [];

        const excelRows = [];
        data.forEach((item, idx) => {
            if (item.isGroupHeader) {
                excelRows.push({
                    'STT': '',
                    'Nhóm Chi Phí': item.name,
                    'Khoản Mục / Phân Loại': '--- TIÊU ĐỀ NHÓM ---',
                    'Loại': 'Tiêu đề nhóm',
                    'Mã B7': '',
                    'Mã B10': '',
                    'Chi Phí 2026 (Tr.đ)': '',
                    'Chi Phí 2025 (Tr.đ)': '',
                    'Chi Phí 2024 (Tr.đ)': '',
                    'YoY 2026 vs 2025 (%)': ''
                });
                return;
            }

            const row = {
                'STT': idx + 1,
                'Nhóm Chi Phí': item.group,
                'Khoản Mục / Phân Loại': item.name,
                'Loại': item.isGroupSummary ? 'Tổng Nhóm' : 'Khoản Mục',
                'Mã B7': item.b7_display || '',
                'Mã B10': item.b10_display || '',
                'Trọng Yếu': item.is_material ? '⭐' : ''
            };

            if (selYears.includes('2026')) row['Chi Phí 2026 (Tr.đ)'] = item.sum2026;
            if (selYears.includes('2025')) row['Chi Phí 2025 (Tr.đ)'] = item.sum2025;
            if (selYears.includes('2024')) row['Chi Phí 2024 (Tr.đ)'] = item.sum2024;

            if (selYears.includes('2025') && selYears.includes('2026') && item.sum2025 > 0) {
                row['YoY 2026 vs 2025 (%)'] = parseFloat((((item.sum2026 - item.sum2025) / item.sum2025) * 100).toFixed(1));
            }

            excelRows.push(row);
        });

        const ws = window.XLSX.utils.json_to_sheet(excelRows);
        const wb = window.XLSX.utils.book_new();
        window.XLSX.utils.book_append_sheet(wb, ws, 'Dashboard_Chi_Phi');

        const fileName = `THACO_AUTO_Dashboard_Chi_Phi_${selMonths.length}Thang_${new Date().toISOString().slice(0, 10)}.xlsx`;
        window.XLSX.writeFile(wb, fileName);
    }

    /**
     * Public Interface: Render or Refresh the entire Dashboard
     */
    function renderDashboard() {
        const container = document.getElementById('dashboard-section') || document.getElementById('section-dashboard');
        if (!container) return;

        if (!dashState.isInitialized) {
            setupDashboardLayout(container);
        }

        updateGroupFilterOptions();

        const timeEl = document.getElementById('dash-last-updated');
        if (timeEl) {
            const now = new Date();
            timeEl.textContent = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
        }

        updateKPIs();
        renderMainHorizontalChart();
        renderSupportingCharts();
    }

    window.THACO_DASHBOARD = {
        render: renderDashboard,
        state: dashState,
        getGroupIcon: getGroupIcon,
        exportPNG: exportMainChartPNG,
        exportExcel: exportDashboardDataExcel,
        openDrillDownModal: openDrillDownModal
    };

    window.renderDashboard = renderDashboard;
    window.renderDashboardCharts = renderDashboard;
    window.getGroupIcon = getGroupIcon;
    window.openDrillDownModal = openDrillDownModal;

})();
