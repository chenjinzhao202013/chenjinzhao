@echo off
REM ============================================================
REM  git-init.bat -- initialize this project as a Git repository
REM
REM  NOTE: this file is intentionally ASCII-only, because cmd.exe
REM  reads .bat files using the console code page (936 on this
REM  machine) and UTF-8 Chinese text would be garbled.
REM
REM  Usage: double-click after Git for Windows is installed.
REM  Identity is pre-filled below; edit these two lines if needed.
REM ============================================================
setlocal
cd /d "%~dp0"

set GIT_NAME=chenjinzhao202013
set GIT_EMAIL=3184568097@qq.com

echo.
echo ==== [1/5] Checking git ====
git --version >nul 2>&1
if errorlevel 1 (
  echo.
  echo [ERROR] git was not found in PATH.
  echo.
  echo   Install Git for Windows: https://git-scm.com/download/win
  echo   During setup, on the PATH page choose:
  echo     "Git from the command line and also from 3rd-party software"
  echo   Then CLOSE this window, open a NEW one, and run this file again.
  echo.
  pause
  exit /b 1
)
git --version

echo.
echo ==== [2/5] Setting commit identity ====
git config --global user.name "%GIT_NAME%"
git config --global user.email "%GIT_EMAIL%"
git config --global init.defaultBranch main
git config --global core.quotepath false
git config --global core.autocrlf true
echo Done: %GIT_NAME% / %GIT_EMAIL%

echo.
echo ==== [3/5] Init repository ====
if exist ".git" (
  echo .git already exists, skipping init.
) else (
  git init
)

echo.
echo ==== [4/5] Stage files (see .gitignore) ====
git add -A
git status --short

echo.
echo ==== [5/5] First commit ====
git commit -m "student exam flow: exam list with status, full/single question view, countdown and auto submit, score and answer review"
if errorlevel 1 (
  echo.
  echo [NOTE] Commit failed. If it says "nothing to commit", there were no changes.
)

echo.
echo ==== Done. Latest commit: ====
git log --oneline -1
echo.
echo Repo: %CD%
echo Common commands:
echo   git status
echo   git add -A
echo   git commit -m "message"
echo   git log --oneline
echo.
pause
