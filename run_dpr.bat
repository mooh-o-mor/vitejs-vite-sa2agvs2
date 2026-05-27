@echo off
cd /d C:\Users\mooho\vitejs-vite-sa2agvs2
set PYTHONPATH=C:\Users\mooho\vitejs-vite-sa2agvs2

if not exist logs mkdir logs

echo ===== %date% %time% ===== >> logs\dpr_auto.log 2>&1
C:\Users\mooho\AppData\Local\Programs\Python\Python314\python.exe dpr_ximss.py >> logs\dpr_auto.log 2>&1
echo Exit code: %errorlevel% >> logs\dpr_auto.log 2>&1
