# Pi VS Code

Два компонента: **Pi extension** (npm) + **VS Code extension** (Pi Companion).

## Архитектура

```
Pi (terminal)                               VS Code (diff UI)
    │                                              │
    ├─ writeFile(.pi/review-requests/{uuid}.json)  │
    │                                              ├─ fs.watch → diff editor с ✓/✗
    │         ...пользователь ревьюит...           │
    │                                              ├─ ✓: tmp → оригинал
    │                                              ├─ ✗: удалить tmp
    │                                              └─ writeFile(.pi/review-results/{uuid}.json)
    ├─ readFile(.pi/review-results/{uuid}.json)    │
    │                                              │
    └─ approved → пишем файл / rejected → isError  │
```

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

**Двухфазный подход:** Фаза 1 (2s, опрос каждые 100ms) — опрос VS Code без TUI. 20 проверок за 2 секунды. Если VS Code ответил — TUI не показывается. Между фазами — синхронный `existsSync` на result-файл (ловим гонку между интервалами опроса). Фаза 2 — TUI + параллельный опрос (каждые 500ms). `pollResultFile` обёрнут в try-catch на случай частично записанного/пустого файла. Параметр `interval` настраивает частоту опроса.

**Approve All** работает только в рамках одного промпта (`message_start`/`message_end` сбрасывают).

**Abort** (`🚪`) в TUI селекторе вызывает `ctx.abort()` — немедленно останавливает сессию агента. Перед этим записывает rejected result-файл, чтобы VS Code убрал diff editor.

## Структура

```
pi-vscode/
├── src/index.ts           # Pi extension (npm пакет pi-vscode)
├── dist/                   # скомпилированный JS
├── vscode-ext/src/         # VS Code extension (Pi Companion)
│   ├── extension.ts        # activate, watch, команды, checkReviewComplete
│   └── types.ts            # ReviewRequest, ReviewResult, DiffSession
├── .vscode/                # F5 debug (launch.json + tasks.json)
├── AGENTS.md / README.md / CHANGELOG.md
└── Makefile                # make publish v=patch|minor|major
```

## VS Code Extension: ключевые моменты

- Сессии **не удаляются** до формирования result-файла — `checkReviewComplete` использует `session.status` (`"pending"|"approved"|"rejected"`)
- `getCurrentSession` ищет по **всем** `visibleTextEditors` (обе стороны диффа), а не только `activeTextEditor`
- Команды: `pi-sr.approveCurrent|rejectCurrent`
- Контекстный ключ: `piCompanion.isActive`

## Разработка

```bash
# Компиляция Pi extension (корень)
npx tsc -p tsconfig.json

# Компиляция VS Code extension
cd vscode-ext && npx tsc -p tsconfig.json

# Отладка VS Code extension: F5 в корне проекта

# Публикация npm пакета
make publish v=patch

# Публикация .vsix
cd vscode-ext && npx @vscode/vsce package
```
