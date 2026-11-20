@echo off
rem =====================================================
rem  BUILD MY HABIT.EXE (versi lokal untuk dibagikan)
rem  hasil: dist\My Habit.exe
rem =====================================================
cd /d "%~dp0"

echo [1/2] Memasang alat build...
python -m pip install --upgrade pyinstaller pywebview
if errorlevel 1 goto gagal

echo.
echo [2/2] Membuat My Habit.exe (1-3 menit)...
python -m PyInstaller --noconfirm --clean --onefile --windowed ^
    --name "My Habit" ^
    --icon "docs\static\icons\icon-512.png" ^
    --add-data "docs;docs" ^
    desktop.py
if errorlevel 1 goto gagal

echo.
echo Selesai! File ada di: %~dp0dist\My Habit.exe
pause
exit /b

:gagal
echo.
echo Build gagal. Lihat pesan error di atas.
pause
