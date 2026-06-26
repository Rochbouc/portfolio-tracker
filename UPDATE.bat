@echo off
title Portfolio Tracker - Push Update
color 0A
echo.
echo  ============================================
echo   Portfolio Tracker - Push Update to GitHub
echo  ============================================
echo.

git add . >nul 2>&1
git commit -m "Update portfolio tracker" >nul 2>&1
git push

if %errorlevel% neq 0 (
    echo.
    echo  [!] Push failed - run INSTALL.bat first if this is a new machine.
    pause
    exit /b 1
)

echo.
echo  [OK] Update pushed! Your site will refresh in ~2 minutes.
echo.
pause
