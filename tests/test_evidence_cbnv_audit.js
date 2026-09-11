const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

console.log('========================================================================');
console.log('KIỂM THỬ AUDIT BOX CB-NV: ĐỐI SOÁT NHÂN SỰ & CẢNH BÁO DÒNG TỔNG CỘNG');
console.log('========================================================================\n');

// Hàm mô phỏng logic cốt lõi trong handleCbnvFileSelected (app.js)
function auditCbnvRows(rows, fileName) {
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
            continue;
        }

        if (!rawMa && !rawTen) continue;

        parsedRows.push({
            maPn: rawMa,
            tenPn: rawTen,
            dinhBien: dB,
            thucTe: tT
        });
    }

    const sumDb = parsedRows.reduce((a, b) => a + b.dinhBien, 0);
    const sumTt = parsedRows.reduce((a, b) => a + b.thucTe, 0);

    let auditStatus = 'NO_CONTROL_ROW';
    let diff = null;
    let diffDb = 0;
    let auditBadge = '';
    let auditTheme = '';

    if (hasControlRow) {
        diff = Math.abs(sumTt - (fileControlTotalTt || 0));
        diffDb = Math.abs(sumDb - (fileControlTotalDb || 0));
        if (diff === 0 && diffDb === 0) {
            auditStatus = 'MATCH';
            auditBadge = 'Chênh lệch: 0 người (Khớp 100%)';
            auditTheme = 'EMERALD / XANH LÁ';
        } else {
            auditStatus = 'MISMATCH';
            auditBadge = `Lệch: ${diff} người`;
            auditTheme = 'ROSE / ĐỎ';
        }
    } else {
        auditStatus = 'NO_CONTROL_ROW';
        auditBadge = '⚠️ Cảnh báo: Không tìm thấy dòng tổng cộng (CỘNG)';
        auditTheme = 'AMBER / CẢNH BÁO VÀNG';
    }

    return {
        fileName,
        rowCount: parsedRows.length,
        hasControlRow,
        fileControlTotalTt,
        fileControlTotalDb,
        sumTt,
        sumDb,
        diff,
        auditStatus,
        auditBadge,
        auditTheme
    };
}

// -------------------------------------------------------------
// KỊCH BẢN 1: File có dòng CỘNG và số liệu KHỚP 100%
// -------------------------------------------------------------
const file1Data = [
    ['Mã ĐVCS', 'Tên Showroom / Pháp nhân', 'Định Biên (Người)', 'Thực Tế (Người)'],
    ['C1101', 'THACO AUTO (Văn phòng)', 60, 56],
    ['C2305', 'PP THACO AUTO', 50, 48],
    ['MB01', 'Showroom Hà Nội', 45, 42],
    ['MN01', 'Showroom Bình Triệu', 50, 47],
    ['CL01', 'Showroom Chu Lai', 50, 47],
    ['', 'CỘNG TOÀN HỆ THỐNG', 255, 240] // Control total: DB=255, TT=240
];

const res1 = auditCbnvRows(file1Data, 'Mau_Nhan_Su_Chuan_Khop.xlsx');
console.log('▶ [KỊCH BẢN 1] Nạp file Excel có dòng "CỘNG" và số liệu khớp chuẩn:');
console.log(`   • File: ${res1.fileName} (${res1.rowCount} đơn vị chi tiết)`);
console.log(`   • Dòng CỘNG của file: Thực tế = ${res1.fileControlTotalTt} người | Định biên = ${res1.fileControlTotalDb} người`);
console.log(`   • Tổng chi tiết cộng: Thực tế = ${res1.sumTt} người | Định biên = ${res1.sumDb} người`);
console.log(`   • Chênh lệch kiểm toán: ${res1.diff} người`);
console.log(`   • Audit Box hiển thị: "${res1.auditBadge}"`);
console.log(`   • Màu sắc giao diện: ${res1.auditTheme}`);
const pass1 = res1.auditStatus === 'MATCH' && res1.diff === 0 && res1.auditBadge.includes('0 người');
console.log(`   👉 Đánh giá: ${pass1 ? '✅ ĐẠT (Báo đúng "Chênh lệch: 0 người", màu xanh)' : '❌ THẤT BẠI'}\n`);

// -------------------------------------------------------------
// KỊCH BẢN 2: File KHÔNG có dòng CỘNG (Missing Summary Row)
// -------------------------------------------------------------
const file2Data = [
    ['Mã ĐVCS', 'Tên Showroom / Pháp nhân', 'Định Biên (Người)', 'Thực Tế (Người)'],
    ['C1101', 'THACO AUTO (Văn phòng)', 60, 56],
    ['C2305', 'PP THACO AUTO', 50, 48],
    ['MB01', 'Showroom Hà Nội', 45, 42],
    ['MN01', 'Showroom Bình Triệu', 50, 47]
    // CỐ TÌNH KHÔNG CÓ DÒNG CỘNG
];

const res2 = auditCbnvRows(file2Data, 'Mau_Nhan_Su_Khong_Co_Dong_Cong.xlsx');
console.log('▶ [KỊCH BẢN 2] Nạp file Excel KHÔNG có dòng tổng cộng (CỘNG):');
console.log(`   • File: ${res2.fileName} (${res2.rowCount} đơn vị chi tiết)`);
console.log(`   • Có dòng kiểm toán CỘNG không: ${res2.hasControlRow ? 'CÓ' : 'KHÔNG ❌'}`);
console.log(`   • Tổng chi tiết cộng: Thực tế = ${res2.sumTt} người | Định biên = ${res2.sumDb} người`);
console.log(`   • Audit Box hiển thị: "${res2.auditBadge}"`);
console.log(`   • Màu sắc giao diện: ${res2.auditTheme}`);
const pass2 = res2.auditStatus === 'NO_CONTROL_ROW' && !res2.hasControlRow && res2.auditTheme.includes('VÀNG');
console.log(`   👉 Đánh giá: ${pass2 ? '✅ ĐẠT (Báo cảnh báo VÀNG, KHÔNG mặc định báo khớp)' : '❌ THẤT BẠI'}\n`);

// -------------------------------------------------------------
// KỊCH BẢN 3: File có dòng CỘNG nhưng số liệu LỆCH (Mismatch)
// -------------------------------------------------------------
const file3Data = [
    ['Mã ĐVCS', 'Tên Showroom / Pháp nhân', 'Định Biên (Người)', 'Thực Tế (Người)'],
    ['C1101', 'THACO AUTO (Văn phòng)', 60, 56],
    ['C2305', 'PP THACO AUTO', 50, 48],
    ['MB01', 'Showroom Hà Nội', 45, 42],
    ['MN01', 'Showroom Bình Triệu', 50, 47],
    ['', 'TỔNG CỘNG', 260, 203] // Cố tình khai dòng tổng 203 trong khi chi tiết là 193
];

const res3 = auditCbnvRows(file3Data, 'Mau_Nhan_Su_Lech_So.xlsx');
console.log('▶ [KỊCH BẢN 3] Nạp file Excel có dòng CỘNG bị lệch số liệu:');
console.log(`   • File: ${res3.fileName} (${res3.rowCount} đơn vị chi tiết)`);
console.log(`   • Dòng CỘNG của file: Thực tế = ${res3.fileControlTotalTt} người`);
console.log(`   • Tổng chi tiết cộng: Thực tế = ${res3.sumTt} người`);
console.log(`   • Chênh lệch kiểm toán: Lệch ${res3.diff} người`);
console.log(`   • Audit Box hiển thị: "${res3.auditBadge}"`);
console.log(`   • Màu sắc giao diện: ${res3.auditTheme}`);
const pass3 = res3.auditStatus === 'MISMATCH' && res3.diff === 10;
console.log(`   👉 Đánh giá: ${pass3 ? '✅ ĐẠT (Phát hiện lệch chính xác 10 người, màu đỏ)' : '❌ THẤT BẠI'}\n`);

// Bảng kết quả tổng hợp
console.log('--- BẢNG TỔNG HỢP KIỂM THỬ AUDIT BOX CB-NV ---');
console.table([
    {
        'Kịch bản': '1. File có dòng CỘNG khớp',
        'Có dòng CỘNG': res1.hasControlRow ? 'Có' : 'Không',
        'Tổng chi tiết': `${res1.sumTt} người`,
        'Dòng CỘNG file': `${res1.fileControlTotalTt} người`,
        'Trạng thái Audit Box': res1.auditBadge,
        'Màu cảnh báo': res1.auditTheme,
        'Kết quả': pass1 ? 'PASS ✅' : 'FAIL ❌'
    },
    {
        'Kịch bản': '2. File KHÔNG có dòng CỘNG',
        'Có dòng CỘNG': res2.hasControlRow ? 'Có' : 'Không',
        'Tổng chi tiết': `${res2.sumTt} người`,
        'Dòng CỘNG file': 'Không có',
        'Trạng thái Audit Box': res2.auditBadge,
        'Màu cảnh báo': res2.auditTheme,
        'Kết quả': pass2 ? 'PASS ✅ (Không mặc định khớp)' : 'FAIL ❌'
    },
    {
        'Kịch bản': '3. File dòng CỘNG bị lệch',
        'Có dòng CỘNG': res3.hasControlRow ? 'Có' : 'Không',
        'Tổng chi tiết': `${res3.sumTt} người`,
        'Dòng CỘNG file': `${res3.fileControlTotalTt} người`,
        'Trạng thái Audit Box': res3.auditBadge,
        'Màu cảnh báo': res3.auditTheme,
        'Kết quả': pass3 ? 'PASS ✅' : 'FAIL ❌'
    }
]);
