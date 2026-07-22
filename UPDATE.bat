@echo off
title Portfolio Tracker - Push Update
color 0A
echo.
echo  ============================================
echo   Portfolio Tracker - Push Update to GitHub
echo  ============================================
echo.

git config gc.auto 0
git config gc.autopacklimit 0
git add .
git commit -m "Update portfolio tracker"
git push

if %errorlevel% neq 0 (
    echo.
    echo  [!] Push failed - try: git push --force
    pause
    exit /b 1
)

echo.
echo  [OK] Update pushed! Your site will refresh in ~2 minutes.
echo.
pause
