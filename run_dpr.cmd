@echo off
set PYTHONUTF8=1
set LOGFILE=%~dp0logs\dpr.log
if not exist "%~dp0logs" mkdir "%~dp0logs"
echo. >> "%LOGFILE%"
echo ===== %DATE% %TIME% ===== >> "%LOGFILE%"
"C:\Users\mooho\AppData\Local\Programs\Python\Python314\python.exe" -u "%~dp0dpr_ximss.py" >> "%LOGFILE%" 2>&1
echo Exit code: %ERRORLEVEL% >> "%LOGFILE%"
