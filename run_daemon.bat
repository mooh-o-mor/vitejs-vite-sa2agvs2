@echo off
cd /d C:\Users\mooho\vitejs-vite-sa2agvs2
set PYTHONUTF8=1
if not exist logs mkdir logs
echo ===== %DATE% %TIME% ===== >> logs\dpr_daemon.log
"C:\Users\mooho\AppData\Local\Programs\Python\Python314\python.exe" -u dpr_ximss.py --daemon >> logs\dpr_daemon.log 2>&1
