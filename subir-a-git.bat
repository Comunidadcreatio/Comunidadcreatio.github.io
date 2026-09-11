@echo off
title Subir cambios a Git - ComunidadCreatio
color 0A

echo ============================================
echo   Subiendo cambios a GitHub
echo   Repositorio: Comunidadcreatio.github.io
echo ============================================
echo.

rem %~dp0 = carpeta donde vive este .bat.
rem Asi el MISMO archivo funciona en la laptop y en el PC de escritorio,
rem sin rutas fijas que haya que mantener en cada maquina.
cd /d "%~dp0"

echo [1/6] Trayendo los ultimos cambios de GitHub...
echo.
git pull --rebase origin main
if %errorlevel% neq 0 (
    echo.
    echo [ERROR] No se pudieron traer los cambios. NADA se ha subido.
    echo   - Si dice "unstaged changes": tienes cambios sin commitear.
    echo   - Si hay conflictos: resolvelos, corre "git rebase --continue"
    echo     y vuelve a ejecutar este script.
    echo   - NUNCA uses "git push --force".
    pause
    exit /b 1
)
echo.

echo [2/6] Actualizando cache-busting y version...
echo.
node scripts/bump-version.js
echo.
if %errorlevel% neq 0 (
    echo [ERROR] Fallo bump-version.js. Revisa que Node.js este instalado.
    pause
    exit /b 1
)
pause

echo [3/6] Verificando estado actual...
echo.
git status
echo.
pause

echo [4/6] Agregando todos los archivos modificados...
git add .
echo.
echo Archivos agregados correctamente.
echo.
pause

echo [5/6] Creando commit...
set /p mensaje="Escribe un mensaje para el commit: "
git commit -m "%mensaje%"
echo.
pause

echo [6/6] Subiendo cambios a GitHub...
git push origin main
if %errorlevel% neq 0 (
    echo.
    echo [ERROR] El push fallo. NADA se subio.
    echo   - Si dice "non-fast-forward" o "rejected": alguien subio cambios
    echo     antes que tu. Vuelve a ejecutar este script para traerlos primero.
    echo   - NUNCA uses "git push --force": borraria trabajo de la otra maquina.
    pause
    exit /b 1
)
echo.
echo ============================================
echo   Cambios subidos exitosamente!
echo ============================================
pause
