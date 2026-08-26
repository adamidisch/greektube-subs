@echo off
chcp 65001 >nul
cd /d "%~dp0"
title GreekTube Audio Helper - Setup
echo ============================================
echo   GreekTube Audio Helper - ΕΓΚΑΤΑΣΤΑΣΗ
echo ============================================
echo.

where python >nul 2>nul
if errorlevel 1 goto :python_missing
python -c "import sys; raise SystemExit(0 if sys.version_info >= (3,10) else 1)" >nul 2>nul
if errorlevel 1 goto :python_old
echo [ok] Python 3.10+ βρεθηκε.

if not exist bin mkdir bin
echo.
echo [..] Ληψη και επαληθευση yt-dlp.exe ...
powershell -NoProfile -Command "$ErrorActionPreference='Stop'; $base='https://github.com/yt-dlp/yt-dlp/releases/latest/download'; $tmp='bin\yt-dlp.exe.download'; $sums='bin\SHA2-256SUMS'; Invoke-WebRequest -Uri ($base + '/yt-dlp.exe') -OutFile $tmp; Invoke-WebRequest -Uri ($base + '/SHA2-256SUMS') -OutFile $sums; $line=Get-Content $sums | Where-Object { $_ -match '\syt-dlp\.exe$' } | Select-Object -First 1; if(-not $line){throw 'Checksum not found'}; $expected=($line -split '\s+')[0].ToLowerInvariant(); $actual=(Get-FileHash $tmp -Algorithm SHA256).Hash.ToLowerInvariant(); if($actual -ne $expected){throw 'Checksum mismatch'}; Move-Item -Force $tmp 'bin\yt-dlp.exe'; Remove-Item -Force $sums"
if errorlevel 1 (
  del /q bin\yt-dlp.exe.download bin\SHA2-256SUMS >nul 2>nul
  echo [!] Αποτυχια ασφαλους ληψης του yt-dlp.
  pause
  exit /b 1
)
bin\yt-dlp.exe --version >nul 2>nul
if errorlevel 1 (
  echo [!] Το yt-dlp δεν εκτελειται σωστα.
  pause
  exit /b 1
)
echo [ok] yt-dlp.exe ετοιμο και επαληθευμενο.

echo.
echo [..] Ελεγχος FFmpeg ...
if exist bin\ffmpeg.exe (
  echo [ok] FFmpeg βρεθηκε στον φακελο bin.
  goto :ready
)
where ffmpeg >nul 2>nul
if errorlevel 1 (
  echo [!] Το FFmpeg δεν βρεθηκε.
  echo     Βαλε το ffmpeg.exe στον φακελο bin και ξανατρεξε setup.bat.
  pause
  exit /b 1
)
echo [ok] FFmpeg βρεθηκε στο PATH.

:ready
echo.
echo Ετοιμο. Τρεξε start.bat για καθημερινη χρηση.
pause
exit /b 0

:python_missing
echo [!] Δεν βρεθηκε Python. Κατεβασε το απο https://www.python.org/downloads/
echo     Στην εγκατασταση τσεκαρε "Add Python to PATH".
pause
exit /b 1

:python_old
echo [!] Χρειαζεται Python 3.10 ή νεοτερο.
pause
exit /b 1
