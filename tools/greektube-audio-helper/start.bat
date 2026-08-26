@echo off
chcp 65001 >nul
cd /d "%~dp0"
title GreekTube Audio Helper
where python >nul 2>nul
if errorlevel 1 (
  echo Δεν βρεθηκε Python. Τρεξε πρωτα setup.bat.
  pause
  exit /b 1
)
python -c "import sys; raise SystemExit(0 if sys.version_info >= (3,10) else 1)" >nul 2>nul
if errorlevel 1 (
  echo Χρειαζεται Python 3.10 ή νεοτερο.
  pause
  exit /b 1
)
echo Εκκινηση GreekTube Audio Helper...
echo Θα ανοιξει στον browser: http://127.0.0.1:8756/
echo Κλεισε αυτο το παραθυρο για τερματισμο.
python app.py
pause
