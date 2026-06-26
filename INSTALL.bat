@echo off
title Portfolio Tracker - GitHub Setup
color 0A
echo.
echo  ============================================
echo   Portfolio Tracker - GitHub Deploy Setup
echo  ============================================
echo.

:: Check if git is installed
git --version >nul 2>&1
if %errorlevel% neq 0 (
    echo  [!] Git is not installed.
    echo.
    echo  Please install Git first:
    echo  1. Go to: https://git-scm.com/download/win
    echo  2. Download and run the installer
    echo  3. Accept all defaults
    echo  4. Run this script again
    echo.
    pause
    exit /b 1
)

echo  [OK] Git is installed
echo.

:: Get GitHub username
echo  Enter your GitHub username:
set /p USERNAME=  Username: 

if "%USERNAME%"=="" (
    echo  [!] Username cannot be empty
    pause
    exit /b 1
)

echo.
echo  Enter your GitHub Personal Access Token:
echo  (Get one at: github.com/settings/tokens - check the "repo" box)
set /p TOKEN=  Token: 

if "%TOKEN%"=="" (
    echo  [!] Token cannot be empty
    pause
    exit /b 1
)

echo.
echo  [1/5] Initializing Git repository...
git init >nul 2>&1

echo  [2/5] Adding all files...
git add . >nul 2>&1

echo  [3/5] Creating first commit...
git commit -m "Portfolio tracker initial deploy" >nul 2>&1

echo  [4/5] Setting up main branch...
git branch -M main >nul 2>&1

echo  [5/5] Pushing to GitHub...
git remote remove origin >nul 2>&1
git remote add origin https://%USERNAME%:%TOKEN%@github.com/%USERNAME%/portfolio-tracker.git
git push -u origin main

if %errorlevel% neq 0 (
    echo.
    echo  [!] Push failed. Common reasons:
    echo.
    echo  - Repository does not exist yet.
    echo    Go to github.com, click +, New repository,
    echo    name it exactly: portfolio-tracker
    echo    set it to Public, click Create repository.
    echo    Then run this script again.
    echo.
    echo  - Token is wrong or expired.
    echo    Get a new one at github.com/settings/tokens
    echo.
    pause
    exit /b 1
)

echo.
echo  ============================================
echo   SUCCESS! Your app is deploying now.
echo  ============================================
echo.
echo  1. Go to: github.com/%USERNAME%/portfolio-tracker
echo  2. Click "Settings" then "Pages"
echo  3. Under Source, select "GitHub Actions"
echo  4. Wait 2-3 minutes
echo.
echo  Your app will be live at:
echo  https://%USERNAME%.github.io/portfolio-tracker/
echo.
echo  Every time you get a new version:
echo    - Extract the zip into this folder
echo    - Double-click INSTALL.bat again
echo.
pause
