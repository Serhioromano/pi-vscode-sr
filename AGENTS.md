# Pi VS Code — Project Specification

> **Состояние:** ✅ Реализовано и протестировано.
> Все компоненты работают, отладка через F5 настроена.
> См. раздел "Текущее состояние" для быстрого старта.

---

## Архитектура

Проект состоит из двух компонентов:

```
Pi (terminal)                          VS Code Extension (diff UI)
    │                                         │
    ├─ writeFile(.pi/review-requests/         │
    │           {uuid}.json)                  │
    │                                         ├─ fs.watch → parse JSON
    │                                         ├─ open diff editor(s)
    │                                         │  with ✓/✗ buttons
    │                                         │
    │     ...user reviews in VS Code...       │
    │                                         │
    │                                         ├─ ✓: write tmp → original
    │                                         ├─ ✗: delete tmp
    │                                         ├─ all done →
    │                                         │  writeFile(review-results/{uuid}.json)
    │                                         │
    ├─ readFile(.pi/review-results/           │
    │           {uuid}.json)                  │
    │                                         │
    └─ continue (or revert)                   │
```

### 1. Pi Extension (npm пакет)
- **Путь:** `src/index.ts`
- **Пакет:** `pi-vscode` на npm
- **Роль:** Pi-агент загружает этот код и использует его для создания review-запросов

### 2. VS Code Extension (Pi Companion)
- **Путь:** `vscode-ext/src/extension.ts`
- **Пакет:** `vscode-pi-companion`
- **Роль:** Показывает diff-редакторы с кнопками ✓/✗ в VS Code

---

## Протокол

### Review Request (Pi → Extension)
`.pi/review-requests/{uuid}.json`:

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "title": "Add input validation to login",
  "files": [
    {
      "path": "src/auth/login.ts",
      "original": "export function login(email: string, password: string) {\n  return api.post('/login', { email, password });\n}",
      "proposed": "export function login(email: string, password: string) {\n  if (!email.includes('@')) throw new Error('Invalid email');\n  if (password.length < 8) throw new Error('Password too short');\n  return api.post('/login', { email, password });\n}",
      "description": "Added email and password validation",
      "language": "typescript"
    }
  ]
}
```

| Поле | Тип | Обязательное | Описание |
|------|-----|-------------|----------|
| `id` | string (UUID) | Да | Уникальный идентификатор |
| `title` | string | Да | Заголовок ревью |
| `files` | array | Да | Список файлов (≥1) |
| `files[].path` | string | Да | Путь относительно workspace root |
| `files[].original` | string | Да | Текущее содержимое (до изменений) |
| `files[].proposed` | string | Да | Предлагаемое содержимое |
| `files[].description` | string | Нет | Описание изменения |
| `files[].language` | string | Нет | Язык для подсветки (если файл новый) |

### Review Result (Extension → Pi)
`.pi/review-results/{uuid}.json`:

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "status": "approved",
  "files": [
    {
      "path": "src/auth/login.ts",
      "status": "approved",
      "final": "export function login(email: string, password: string) {\n  if (!email.includes('@')) throw new Error('Invalid email');\n  if (password.length < 8) throw new Error('Password too short');\n  return api.post('/login', { email, password });\n}"
    }
  ]
}
```

| Поле | Тип | Описание |
|------|-----|----------|
| `id` | string | Тот же UUID |
| `status` | `"approved"` \| `"rejected"` \| `"partial"` | Общий исход |
| `files[].path` | string | Путь файла |
| `files[].status` | `"approved"` \| `"rejected"` | Исход по файлу |
| `files[].final` | string | Финальное содержимое (для approved) |

### Как Pi узнаёт о результате
Polling раз в 500 мс — проверяет наличие `.pi/review-results/{uuid}.json`.

---

## Структура проекта

```
pi-vscode/                      # корень проекта
├── src/
│   └── index.ts                 # Pi extension (npm пакет)
├── package.json                  # npm package для Pi extension
├── tsconfig.json
├── vscode-ext/                   # VS Code extension
│   ├── package.json
│   ├── tsconfig.json
│   ├── src/
│   │   ├── extension.ts          # activate, watch, команды
│   │   └── types.ts              # типы протокола
│   └── dist/                     # скомпилированный JS
├── .vscode/
│   ├── launch.json               # F5 → Extension Development Host
│   ├── tasks.json                # компиляция перед запуском
│   └── settings.json
├── .pi/
│   ├── SYSTEM.md                 # системный промпт для Pi
│   ├── APPEND_SYSTEM.md          # доп. правила для Pi
│   ├── patterns.yaml             # whitelist для strict mode
│   ├── review-requests/          # Pi пишет сюда запросы
│   │   └── test.json
│   └── review-results/           # Extension пишет сюда результаты
├── AGENTS.md
├── README.md
├── CHANGELOG.md
├── Makefile                      # публикация npm пакета
└── images/
    └── pi-vscode.png
```

---

## Текущее состояние

| Компонент | Статус |
|-----------|--------|
| VS Code extension (`vscode-pi-companion`) | ✅ Работает |
| F5 debug (launch.json + tasks.json) | ✅ Настроен |
| Команды approveCurrent / rejectCurrent | ✅ |
| Команды approveAll / rejectAll | ✅ |
| Watcher на `.pi/review-requests/` | ✅ |
| Восстановление незавершённых ревью | ✅ |
| Запись `.pi/review-results/{uuid}.json` | ✅ |
| Очистка tmp после завершения | ✅ |
| Тестовый request (`.pi/review-requests/test.json`) | ✅ |
| Pi extension (`src/index.ts`) | ✅ Перехватывает `write` и `edit`, TUI selector ✅/❌/⭐, race с VS Code, `ctx.abort()` при отказе |

---

## VS Code Extension: package.json

```json
{
  "name": "vscode-pi-companion",
  "displayName": "Pi Companion",
  "description": "Review and approve file changes proposed by Pi agent",
  "version": "0.1.0",
  "publisher": "Serhioromano",
  "repository": "github:Serhioromano/pi-vscode",
  "engines": { "vscode": "^1.82.0" },
  "activationEvents": ["onStartupFinished"],
  "main": "./dist/extension.js",
  "contributes": {
    "commands": [
      {
        "command": "pi-companion.approveCurrent",
        "title": "Pi Companion: Approve Current File",
        "icon": "$(check)"
      },
      {
        "command": "pi-companion.rejectCurrent",
        "title": "Pi Companion: Reject Current File",
        "icon": "$(close)"
      },
      {
        "command": "pi-companion.approveAll",
        "title": "Pi Companion: Approve All Files",
        "icon": "$(check-all)"
      },
      {
        "command": "pi-companion.rejectAll",
        "title": "Pi Companion: Reject All Files",
        "icon": "$(clear-all)"
      }
    ],
    "menus": {
      "editor/title": [
        {
          "command": "pi-companion.approveCurrent",
          "when": "piCompanion.isActive",
          "group": "navigation@1"
        },
        {
          "command": "pi-companion.rejectCurrent",
          "when": "piCompanion.isActive",
          "group": "navigation@2"
        }
      ]
    }
  },
  "scripts": {
    "compile": "tsc -p tsconfig.json",
    "watch": "tsc -watch -p tsconfig.json",
    "package": "npx @vscode/vsce package"
  },
  "devDependencies": {
    "@types/vscode": "^1.82.0",
    "@types/node": "^20.0.0",
    "typescript": "^5.3.0"
  }
}
```

---

## VS Code Extension: types.ts

```typescript
export interface ReviewFile { ... }
export interface ReviewRequest { ... }
export type FileStatus = 'pending' | 'approved' | 'rejected';
export interface ReviewResultFile { ... }
export interface ReviewResult { ... }
export interface DiffSession { ... }
```

(Полные определения см. в `vscode-ext/src/types.ts`)

---

## VS Code Extension: extension.ts

Основные функции:
- `activate()` — инициализация, watcher, регистрация команд
- `deactivate()` — закрытие watcher
- `handleRequest()` — парсинг JSON, создание tmp, открытие diff
- `approveCurrent()` / `rejectCurrent()` — approve/reject текущей вкладки
- `approveAll()` / `rejectAll()` — массовые операции
- `checkReviewComplete()` — запись результата при завершении

(Полный код — в `vscode-ext/src/extension.ts`, ~150 строк)

---

## Разработка

### Запуск в отладке (F5)
1. Открыть корень `pi-vscode/` в VS Code
2. Нажать **F5**
3. В новом окне проверить Console (Ctrl+Shift+I) → `[Pi Companion] activated`
4. Скопировать тестовый request: `cp .pi/review-requests/test.json .pi/review-requests/test2.json`
5. Должен открыться diff-редактор с кнопками ✓/✗

### Компиляция
```bash
cd vscode-ext && npx tsc -p tsconfig.json
```

### Watch mode
```bash
cd vscode-ext && npx tsc -watch -p tsconfig.json
```

### Публикация .vsix
```bash
cd vscode-ext && npx @vscode/vsce package
```

### Публикация npm пакета
```bash
make publish v=patch   # или minor, major, или явная версия
```

---

## Что можно добавить (TODO)

- [x] Pi extension: `src/index.ts` — перехватывает `write` и `edit`, TUI selector ✅/❌/⭐ + VS Code race, `ctx.abort()` on reject
- [ ] Избежать коллизий tmp-файлов при одинаковых basename
- [ ] Панель со списком файлов ревью
- [ ] Статус-бар с прогрессом
- [ ] Очередь ревью
- [ ] Отмена ревью
