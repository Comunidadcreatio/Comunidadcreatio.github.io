@echo off
title Subir cambios a Git - ComunidadCreatio
color 0A

echo ============================================
echo   Subiendo cambios a GitHub
echo   Repositorio: Comunidadcreatio.github.io
echo ============================================
echo.

cd /d "C:\Users\Edgar PC\CascadeProjects\fundacionextramuros.github.io"

echo [1/4] Verificando estado actual...
echo.
git status
echo.
pause

echo [2/4] Agregando todos los archivos modificados...
git add .
echo.
echo Archivos agregados correctamente.
echo.
pause

echo [3/4] Creando commit...
set /p mensaje="Escribe un mensaje para el commit: "
git commit -m "%mensaje%"
echo.
pause

echo [4/4] Subiendo cambios a GitHub...
git push origin main
echo.
echo ============================================
echo   ¡Cambios subidos exitosamente!
echo ============================================
pause
