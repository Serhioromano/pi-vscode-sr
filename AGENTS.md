# Pi VS Code

Два компонента: **Pi extension** (npm) + **VS Code extension** (Pi Companion).

## Архитектура

```
Pi (terminal)                               VS Code (diff UI)
    │                                              │
    ├─ isVscodeReady()? проверяет                  │
    │  .pi/.vscode-ready (heartbeat ≤ 30s)         │
    │  └─ если да:                                  │
    │     ├─ writeFile(.pi/review-requests/...)     │
    │     │                                        ├─ fs.watch → diff editor с ✓/✗
    │     ├─ pollResultFile(...) каждые 500ms       │
    │     │                                        ├─ ✓: tmp → оригинал
    │     │                                        ├─ ✗: удалить tmp
    │     │                                        └─ writeFile(.pi/review-results/...)
    │     └─ TUI селектор (параллельно)             │
    │  └─ если нет:                                 │
    │     └─ только TUI селектор                    │
    │         (review-requests не пишутся,           │
    │          poll не запускается)                  │
    │                                              │
    └─ approved → пишем файл / rejected → isError  │
```

### Обнаружение VS Code (`isVscodeReady`)

VS Code extension при активации создаёт `.pi/.vscode-ready` с timestamp (Unix ms).
Каждые 15 секунд heartbeat-интервал обновляет timestamp — это защита от crash/SIGKILL
(без heartbeat файл остался бы после аварийного завершения). При нормальном закрытии
`deactivate()` удаляет файл.

Pi extension проверяет `isVscodeReady()` перед каждым review-запросом:
- Файл существует **и** timestamp свежий (≤ 30 секунд) → VS Code жив
- Иначе → TUI-only режим (review-requests не пишутся, poll не запускается)

## Протокол

**Запрос** (`.pi/review-requests/{uuid}.json`):
```json
{ "id": "uuid", "title": "...", "files": [{ "path": "...", "original": "...", "proposed": "..." }] }
```

**Ответ** (`.pi/review-results/{uuid}.json`):
```json
{ "id": "uuid", "status": "approved|rejected|partial", "files": [{ "path": "...", "status": "...", "final": "..." }] }
```

Pi опрашивает result-file каждые 500ms.

## Поведение при reject (v1.0.1+)

Инструменты **не кидают исключения**. `createReviewAndWait` возвращает `{ status: "rejected" }`, execute tool-a возвращает `{ isError: true }`. Агент видит явную ошибку, файл не модифицирован.

**TUI + VS Code в гонке:** TUI селектор показывается **моментально** и параллельно опрашивает result-файл (каждые 500ms). Используется `AbortController`: если poll выигрывает гонку (VS Code ответил первым), `tuiController.abort()` принудительно закрывает TUI селектор. При пустом result-файле (ещё записывается) используется стандартный интервал (500ms) вместо отдельной задержки. `pollResultFile` обёрнут в try-catch на случай частично записанного/повреждённого файла.

**Approve All** работает только в рамках одного промпта (`message_start`/`message_end` сбрасывают).

**Abort** (`🚪`) в TUI селекторе вызывает `ctx.abort()` — немедленно останавливает сессию агента. Перед этим записывает rejected result-файл, чтобы VS Code убрал diff editor.

**Rethink** (`💭`) в TUI селекторе открывает диалог ввода текста. Пользователь вводит промпт-фидбек (например, «используй async/await вместо цепочек промисов»). Изменения не применяются, в VS Code diff закрывается (rejected result), а инструмент возвращает `isError: true` с текстом фидбека. Агент видит сообщение `🔄 file.ts — rethinking requested: "..."` и может учесть замечания при следующей попытке.

## Структура

```
pi-vscode-sr/
├── src/index.ts           # Pi extension (npm пакет pi-vscode-sr)
├── dist/                   # скомпилированный JS
├── vscode-ext/src/         # VS Code extension (Pi Companion)
│   ├── extension.ts        # activate, watch, команды, checkReviewComplete
│   ├── types.ts            # ReviewRequest, ReviewResult, DiffSession
│   └── .vscodeignore       # исключает src/, node_modules/ из VSIX
├── .vscode/                # F5 debug (launch.json + tasks.json)
├── AGENTS.md / README.md / CHANGELOG.md
└── Makefile                # make publish v=patch|minor|major
```

## VS Code Extension: ключевые моменты

- Сессии **не удаляются** до формирования result-файла — `checkReviewComplete` использует `session.status` (`"pending"|"approved"|"rejected"`)
- `getCurrentSession` ищет по **всем** `visibleTextEditors` (обе стороны диффа), а не только `activeTextEditor`
- Команды: `pi-sr.approveCurrent|rejectCurrent`
- Контекстный ключ: `piSr.isActive`
- **Закрытие diff-вкладок:** `resultsWatcher` следит за `review-results/` — когда Pi пишет result-файл из терминала (Approve/Reject/Rethink/Abort), VS Code автоматически закрывает все diff-вкладки для этого ревью. `closeReviewTabs()` ищет вкладки по `modifiedUri.fsPath` через `vscode.window.tabGroups`.
