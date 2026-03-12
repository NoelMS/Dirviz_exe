@echo off
"%~dp0dirviz.exe" %*
if %ERRORLEVEL% neq 0 (
  echo.
  echo dirviz exited with error code %ERRORLEVEL%
  pause
)
