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

**Двухфазный подход:** Фаза 1 (1.5s) — опрос VS Code без TUI. Если VS Code ответил — TUI не показывается. Фаза 2 — TUI + параллельный опрос.

**Approve All** работает только в рамках одного промпта (`message_start`/`message_end` сбрасывают).

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
- Команды: `pi-companion.approveCurrent|rejectCurrent|approveAll|rejectAll`
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
