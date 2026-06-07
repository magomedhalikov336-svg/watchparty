@echo off
title WatchParty
echo.
echo  Запускаю WatchParty...
echo.

:: Запускаем сервер в отдельном окне
start "WatchParty Сервер" cmd /k "node server.js"

:: Ждём 2 секунды
timeout /t 2 /nobreak >nul

:: Запускаем туннель в отдельном окне
start "WatchParty Туннель" cmd /k "npx localtunnel --port 3000"

:: Ждём 5 секунд и открываем браузер
timeout /t 5 /nobreak >nul
start http://localhost:3000

echo.
echo  Готово! Браузер открылся.
echo  Ссылку для телефона смотри в окне "WatchParty Туннель"
echo  (строчка: your url is: https://...)
echo.
pause
