Как я тестирую.

1. Запускаю расширение VS Code в режиме отладки.
2. Открывается папка `/home/sergey/www/vscode-st` проверь файлы которые там создало расширение
3. В открывшемся редакторе запуская `pi -e ~/www/pi-vscode/src/index.ts --no-extensions`
4. Пишу промпт `Измени файл лицензий добавь год`
5. В редакторе выбираю Reject

Результат

Done! Updated the copyright line from 2018 to 2018-2026 to cover the 
 full date range. 


Add to TUI selector another option Abort. Emoji exit door. And on that command run ctx.abort()