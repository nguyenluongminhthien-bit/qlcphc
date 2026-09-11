@echo off
chcp 65001 >nul
title THACO AUTO - Quản Trị Chi Phí
echo =======================================================
echo 🚀 ĐANG KHỞI ĐỘNG HỆ THỐNG QUẢN TRỊ CHI PHÍ THACO AUTO...
echo =======================================================
cd /d "%~dp0"
node dev-server.js
pause
