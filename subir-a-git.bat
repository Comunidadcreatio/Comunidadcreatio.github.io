@echo off
title Subir cambios a Git - ComunidadCreatio
color 0A

echo ============================================
echo   Subiendo cambios a GitHub
echo   Repositorio: Comunidadcreatio.github.io
echo ============================================
echo.

cd /d "C:\Users\Edgar PC\CascadeProjects\fundacionextramuros.github.io"

echo [1/5] Actualizando cache-busting y version...
echo.
node scripts/bump-version.js
echo.
if %errorlevel% neq 0 (
    echo [ERROR] Fallo bump-version.js. Revisa que Node.js este instalado.
    pause
    exit /b 1
)
pause

echo [2/5] Verificando estado actual...
echo.
git status
echo.
pause

echo [3/5] Agregando todos los archivos modificados...
git add .
echo.
echo Archivos agregados correctamente.
echo.
pause

echo [4/5] Creando commit...
set /p mensaje="Escribe un mensaje para el commit: "
git commit -m "%mensaje%"
echo.
pause

echo [5/5] Subiendo cambios a GitHub...
git push origin main
echo.
echo ============================================
echo   Cambios subidos exitosamente!
echo ============================================
pause
