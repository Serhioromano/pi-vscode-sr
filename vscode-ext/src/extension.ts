import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { ReviewRequest, ReviewResult, ReviewResultFile, DiffSession } from './types';

// Глобальное состояние
let workspaceRoot: string;
let requestsDir: string;
let resultsDir: string;
let watcher: fs.FSWatcher | null = null;

// key = tmpFsPath (URI.fsPath активного редактора)
const sessions = new Map<string, DiffSession>();
// key = reviewId, value = массив filePath-ей этого ревью
const reviewFiles = new Map<string, Set<string>>();

export function activate(context: vscode.ExtensionContext) {
  console.log('[Pi Companion] activated');

  const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!root) {
    vscode.window.showWarningMessage('Pi Companion: открой workspace');
    return;
  }
  workspaceRoot = root;
  requestsDir = path.join(workspaceRoot, '.pi', 'review-requests');
  resultsDir = path.join(workspaceRoot, '.pi', 'review-results');

  // Создать директории
  fs.mkdirSync(requestsDir, { recursive: true });
  fs.mkdirSync(resultsDir, { recursive: true });

  // Следить за новыми запросами
  watcher = fs.watch(requestsDir, (_, filename) => {
    if (!filename?.endsWith('.json')) return;
    const fp = path.join(requestsDir, filename);
    if (fs.existsSync(fp)) handleRequest(fp);
  });

  // Восстановить незавершённые ревью
  for (const f of fs.readdirSync(requestsDir)) {
    if (f.endsWith('.json')) handleRequest(path.join(requestsDir, f));
  }

  // Команды для кнопок в editor/title
  context.subscriptions.push(
    vscode.commands.registerCommand('pi-companion.approveCurrent', () => approveCurrent()),
    vscode.commands.registerCommand('pi-companion.rejectCurrent', () => rejectCurrent()),
    vscode.commands.registerCommand('pi-companion.approveAll', () => approveAll()),
    vscode.commands.registerCommand('pi-companion.rejectAll', () => rejectAll()),
  );
}

export function deactivate() {
  watcher?.close();
}

// ─── Обработка нового запроса ────────────────────────────────────────

function handleRequest(requestPath: string) {
  let req: ReviewRequest;
  try {
    req = JSON.parse(fs.readFileSync(requestPath, 'utf-8'));
  } catch {
    vscode.window.showErrorMessage(`Pi Review: битый JSON в ${requestPath}`);
    return;
  }

  if (!req.id || !req.files?.length) return;

  // Если ревью с таким id уже обрабатывается — пропустить
  if (reviewFiles.has(req.id)) return;

  const fileSet = new Set<string>();
  reviewFiles.set(req.id, fileSet);

  // Для каждого файла: создать tmp, открыть diff
  req.files.forEach(file => {
    fileSet.add(file.path);

    const tmpDir = path.join(workspaceRoot, '.pi', 'tmp', req.id);
    fs.mkdirSync(tmpDir, { recursive: true });

    const tmpPath = path.join(tmpDir, path.basename(file.path));
    fs.writeFileSync(tmpPath, file.proposed, 'utf-8');

    // Если оригинального файла нет — создать пустой
    const origPath = path.join(workspaceRoot, file.path);
    if (!fs.existsSync(origPath)) {
      fs.mkdirSync(path.dirname(origPath), { recursive: true });
      fs.writeFileSync(origPath, file.original || '', 'utf-8');
    }

    const session: DiffSession = {
      reviewId: req.id,
      filePath: file.path,
      originalFsPath: origPath,
      tmpFsPath: tmpPath,
      status: 'pending',
    };
    sessions.set(tmpPath, session);

    // Открыть diff
    vscode.commands.executeCommand(
      'vscode.diff',
      vscode.Uri.file(origPath),
      vscode.Uri.file(tmpPath),
      `Pi: ${file.path}`
    ).then(() => {
      vscode.commands.executeCommand('setContext', 'piCompanion.isActive', true);
    });
  });
}

// ─── Approve / Reject ─────────────────────────────────────────────────

function getCurrentSession(): DiffSession | undefined {
  const editor = vscode.window.activeTextEditor;
  if (!editor) return undefined;
  return sessions.get(editor.document.uri.fsPath);
}

async function approveCurrent() {
  const s = getCurrentSession();
  if (!s) return;

  // Прочитать отредактированное содержимое tmp-файла
  const edited = fs.readFileSync(s.tmpFsPath, 'utf-8');

  // Записать в оригинал
  fs.writeFileSync(s.originalFsPath, edited, 'utf-8');

  // Удалить tmp
  try { fs.unlinkSync(s.tmpFsPath); } catch {}

  s.status = 'approved';

  // Закрыть diff-вкладку
  await vscode.commands.executeCommand('workbench.action.closeActiveEditor');

  checkReviewComplete(s.reviewId);
}

async function rejectCurrent() {
  const s = getCurrentSession();
  if (!s) return;

  // Удалить tmp
  try { fs.unlinkSync(s.tmpFsPath); } catch {}

  s.status = 'rejected';

  // Закрыть diff-вкладку
  await vscode.commands.executeCommand('workbench.action.closeActiveEditor');

  checkReviewComplete(s.reviewId);
}

async function approveAll() {
  // Собрать все pending-сессии
  const pending = [...sessions.values()].filter(s => s.status === 'pending');
  for (const s of pending) {
    const edited = fs.readFileSync(s.tmpFsPath, 'utf-8');
    fs.writeFileSync(s.originalFsPath, edited, 'utf-8');
    try { fs.unlinkSync(s.tmpFsPath); } catch {}
    s.status = 'approved';
  }
  // Закрыть все diff-вкладки
  await vscode.commands.executeCommand('workbench.action.closeAllEditors');
  // Найти reviewId по любой из сессий
  const reviewId = pending[0]?.reviewId;
  if (reviewId) checkReviewComplete(reviewId);
}

async function rejectAll() {
  const pending = [...sessions.values()].filter(s => s.status === 'pending');
  for (const s of pending) {
    try { fs.unlinkSync(s.tmpFsPath); } catch {}
    s.status = 'rejected';
  }
  await vscode.commands.executeCommand('workbench.action.closeAllEditors');
  const reviewId = pending[0]?.reviewId;
  if (reviewId) checkReviewComplete(reviewId);
}

// ─── Завершение ревью ─────────────────────────────────────────────────

function checkReviewComplete(reviewId: string) {
  // Есть ли ещё незавершённые сессии этого ревью?
  for (const s of sessions.values()) {
    if (s.reviewId === reviewId && s.status === 'pending') return; // ещё не всё
  }

  // Все файлы обработаны — формируем результат
  const files: ReviewResultFile[] = [];
  const fileSet = reviewFiles.get(reviewId);
  if (!fileSet) return;

  let allApproved = true;
  let allRejected = true;

  for (const fp of fileSet) {
    const session = [...sessions.values()].find(s => s.filePath === fp);

    // Pending — не должно случаться (уже проверили выше), но на всякий случай
    if (session?.status === 'pending') continue;

    let status: 'approved' | 'rejected';
    let final = '';

    if (session?.status === 'rejected') {
      status = 'rejected';
    } else if (session?.status === 'approved') {
      status = 'approved';
      final = fs.readFileSync(path.join(workspaceRoot, fp), 'utf-8');
    } else {
      // Сессия пропала — fallback (не должно случаться при нормальной работе)
      try {
        final = fs.readFileSync(path.join(workspaceRoot, fp), 'utf-8');
        status = 'approved';
      } catch {
        status = 'rejected';
      }
    }

    files.push({ path: fp, status, final });

    if (status === 'approved') allRejected = false;
    else allApproved = false;
  }

  // Очистить сессии этого ревью
  for (const [key, s] of sessions) {
    if (s.reviewId === reviewId) sessions.delete(key);
  }

  const result: ReviewResult = {
    id: reviewId,
    status: allApproved ? 'approved' : allRejected ? 'rejected' : 'partial',
    files,
  };

  // Записать результат
  const resultPath = path.join(resultsDir, `${reviewId}.json`);
  fs.writeFileSync(resultPath, JSON.stringify(result, null, 2), 'utf-8');

  // Удалить request-файл
  const requestPath = path.join(requestsDir, `${reviewId}.json`);
  try { fs.unlinkSync(requestPath); } catch {}

  // Очистить tmp-директорию
  const tmpDir = path.join(workspaceRoot, '.pi', 'tmp', reviewId);
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}

  // Сбросить контекст
  vscode.commands.executeCommand('setContext', 'piCompanion.isActive', false);

  reviewFiles.delete(reviewId);

  vscode.window.showInformationMessage(
    `Pi Companion: ${result.status === 'approved' ? 'все изменения приняты' :
      result.status === 'rejected' ? 'все изменения отклонены' :
      'частично принято'} (${files.filter(f => f.status === 'approved').length}/${files.length})`
  );
}
