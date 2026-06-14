# Pitfalls Research

**Domain:** VS Code AI agent extension integration (Chat API, InlineCompletionProvider, external process bridging)
**Researched:** 2026-06-14
**Confidence:** HIGH

## Critical Pitfalls

### Pitfall 1: Transactional Chat API Prevents Proactive Messaging

**What goes wrong:**
The VS Code Chat API is fundamentally request-response only. The `ChatRequestHandler` operates on a strict "speak when spoken to" model. Extensions cannot push unsolicited updates (e.g., "a review completed," "a tool finished," "CI build passed") into the chat panel. Any attempt to hold a reference to `ChatResponseStream` after the handler's Promise resolves silently fails — the stream is owned by the request lifecycle, not the extension.

**Why it happens:**
VS Code's Chat API design intentionally limits participants to a transactional model. The handler receives `(request, context, stream, token)` and returns a `ChatResult`. Once the Promise resolves, the stream is invalidated. Trying to keep the stream alive by returning a never-resolving Promise disables the Send button, making the chat panel unusable.

**How to avoid:**
- Treat the `ChatResponseStream` as scoped to a single request-response cycle. Do not retain references to it.
- For unsolicited notifications, use VS Code's standard notification system (`window.showInformationMessage`, status bar items) instead of the chat panel.
- If you must surface async events in chat, poll for them at the start of the next user-initiated request and include them in the response.

**Warning signs:**
- The Send button stays disabled after an initial message
- Chat responses arrive without user input (impossible by design — means you've found a buggy workaround)
- An unhandled Promise rejection related to stream writes outside the handler

**Phase to address:**
Phase 1 (Chat Participant Integration) — Establish the request-response contract from day one. Do not design for push notifications through chat.

---

### Pitfall 2: InlineCompletionProvider Fires on Every Keystroke With No Built-in Debounce

**What goes wrong:**
`provideInlineCompletionItems` is called on every keystroke with no built-in debounce mechanism. Without explicit throttling, every character typed triggers a completion request — including requests that will immediately be cancelled by the next keystroke. This creates a storm of cancelled requests, wasted latency calls to the Pi agent, and CPU churn in the extension host.

**Why it happens:**
VS Code's `InlineCompletionItemProvider` API deliberately takes a firehose approach — it fires on every `document` change and expects the provider to decide whether and when to respond. There is no `delay` or `debounce` option in the registration API.

**How to avoid:**
- Implement a class-level or module-level debounce timer (300-500ms default). Clear on each new keystroke.
- The debounce mechanism must NOT be inside the `provideInlineCompletionItems` function closure that depends on React state or other framework reactivity — use module-level variables.
- Expose a configurable completion delay setting for users who find completions too aggressive.
- Pattern:
```typescript
private debounceTimer: ReturnType<typeof setTimeout> | null = null;

provideInlineCompletionItems(model, position, context, token) {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    return new Promise(resolve => {
        this.debounceTimer = setTimeout(async () => {
            if (token.isCancellationRequested) { resolve([]); return; }
            const items = await this.fetchFromPi(model, position, token);
            resolve(items);
        }, 300);
    });
}
```

**Warning signs:**
- The Pi agent process receives completion requests on every keystroke
- Users report VS Code feeling slow while typing
- High CPU usage in the extension host process correlated with typing

**Phase to address:**
Phase 2 (Inline Completion Integration) — The debounce mechanism must be part of the initial implementation, not added later.

---

### Pitfall 3: CancellationToken Ignored or Checked Only Once

**What goes wrong:**
Async operations continue running long after the user has moved to a different file or finished typing. The `provideInlineCompletionItems` cancellation token is checked only at function entry, then the entire AI completion pipeline (tokenization, context assembly, network request to Pi agent) runs to completion. This wastes Pi agent capacity, consumes extension host CPU, and can produce stale completions that arrive after the user has already accepted a different suggestion.

**Why it happens:**
The cancellation token pattern (`CancellationToken.isCancellationRequested`) is straightforward for synchronous code but easy to misuse with async chains. Developers check once at the top and forget that every `await` is a potential cancellation point.

**How to avoid:**
- Check `token.isCancellationRequested` after EVERY `await` in the pipeline.
- Propagate the cancellation token to all sub-operations:
  - Pass `token.signal` (as an `AbortSignal`) to `fetch()` calls
  - Pass the token through to the Pi SDK's chat/completion methods if they support it
  - In file read operations, check before and after each read
- Implement a `CancellationError` class and throw it to short-circuit the whole chain.
- For the Pi agent bridge (external process), forward cancellation as a "cancel the pending request" message so the agent can abort its own processing.

**Warning signs:**
- The Pi agent receives completion requests for locations the user left seconds ago
- Completion results arrive after the cursor has moved to a completely different context
- Users report completions that make no sense in the current context ("stale completions")

**Phase to address:**
Phase 2 (Inline Completion Integration) but also Phase 3 (External Process Bridging) — The external process bridge protocol must support cancellation relay.

---

### Pitfall 4: Extension Host Main Thread Blocked by Synchronous I/O

**What goes wrong:**
Synchronous file I/O (`readFileSync`, `writeFileSync`, `mkdirSync`) blocks the extension host main thread. When the Pi agent bridge reads `.pi/` review request files, assembles context, or writes results synchronously, the entire VS Code extension grinds to a halt. Users experience typing lag, unresponsive UI, and VS Code's "extension is slow" warnings.

**Why it happens:**
The existing codebase (CONCERNS.md confirms) uses synchronous Node.js file APIs exclusively. In the VS Code extension host, there is no separate thread pool for file I/O — synchronous calls block the sole JavaScript thread that handles all extension logic.

**How to avoid:**
- Use `fs.promises` API exclusively in the VS Code extension (async/await for all file operations).
- For the file-watching IPC protocol (`.pi/` directory), use `fs.promises.readFile` with proper error handling, never `readFileSync`.
- Cache frequently-read files (configuration, recent review requests) in memory.
- Profile with Chrome DevTools connected to the extension host (`--inspect-extensions=9229`). Look for "Long Tasks" exceeding 50ms.

**Warning signs:**
- VS Code reports "Extension 'pi-vscode-sr' is slow" in the status bar
- Typing feels laggy during review operations
- Flame graphs from the Extension Host profiler show long `readFileSync` or `writeFileSync` frames

**Phase to address:**
Phase 0 (Foundation) — Convert all synchronous I/O to async before adding new features. Every new feature built on sync I/O will inherit the same performance problem.

---

### Pitfall 5: File-Based IPC Without Atomicity Causes Corruption

**What goes wrong:**
The `.pi/` directory IPC protocol writes review requests and results as JSON files without atomicity, locking, or corruption recovery. A partial write (process crash mid-write, filesystem buffering delay, concurrent writes from Pi agent and VS Code) leaves a file that the other process reads as malformed JSON. This silently breaks the review protocol — the Pi agent thinks it's waiting for VS Code, VS Code thinks it's waiting for Pi.

**Why it happens:**
File-based IPC is deceptively simple. It works fine in testing on local SSDs with low concurrency. It breaks in production on WSL (slow filesystem), network drives, or under load. The existing codebase has zero atomicity guarantees (CONCERNS.md confirms no locking, no transactions, no corruption recovery).

**How to avoid:**
- Write to a `.tmp` file first, then atomically rename (`fs.rename`) to the target name. On most filesystems, rename is atomic.
- Add a write-complete sentinel: write the file content, then write a companion `.done` file. The reader checks for `.done` before reading.
- Add corruption recovery: on JSON parse failure, log the error, move the corrupt file to a `corrupt/` subdirectory, and break the deadlock by sending an error status to the other process.
- Consider replacing file-based IPC with a proper IPC mechanism (stdin/stdout JSON-RPC, Unix socket) for the new chat and completion flows. Retain file-based IPC only for backward compatibility with terminal-only users.

**Warning signs:**
- Review requests that are "stuck" — Pi waiting for VS Code response but VS Code sees no request
- JSON parse errors in logs (currently swallowed by empty catch blocks)
- `.pi/` directory contains files that are partially written (check size: smaller than expected)

**Phase to address:**
Phase 3 (External Process Bridging) — The new chat and completion flows should use a proper IPC mechanism. The existing file-based IPC should be hardened with atomic writes as a parallel effort.

---

### Pitfall 6: Activation Timeout From Long-Running Startup Tasks

**What goes wrong:**
VS Code imposes a ~5 second activation timeout for `on*` activation events. If `activate()` takes longer (e.g., spawning the Pi agent process, loading workspace config, reading `.pi/` files), VS Code logs a warning and may not fully activate the extension. The extension appears installed but doesn't work — chat commands fail silently, completion providers don't register.

**Why it happens:**
VS Code activates extensions on user-triggered events (opening a file, typing in chat). Users expect near-instant responsiveness. The extension's `activate()` function tries to do everything at startup — establish the Pi agent bridge, load configs, register all providers — and crosses the timeout threshold.

**How to avoid:**
- Phase `activate()` as follows:
  1. **Sync (must be <1ms):** Register providers, register commands, push disposables. No `await`.
  2. **Fire-and-forget:** Initialize the Pi agent bridge, load configs, warm caches. Return from `activate()` while these run in the background.
  3. **Lazy:** Defer anything not needed immediately (e.g., slash command registry, workspace searches) until the feature is first used.
- Use `onStartupFinished` activation event for non-critical initialization instead of `*` or `onLanguage`.
- Cache the Pi agent process state in `workspaceState` so subsequent activations are faster.

**Warning signs:**
- `activate()` function has multiple `await` calls before registering providers
- Extension works on first VS Code window but not on subsequent reloads
- Console shows "Not activating extension: Timed out"

**Phase to address:**
Phase 0 (Foundation) — Establish the phased activation pattern before adding any features.

---

### Pitfall 7: Ignoring the Implicit 120ms Deadline for Inline Completions

**What goes wrong:**
VS Code's inline completion system has an informal ~120ms deadline for `provideInlineCompletionItems`. If the provider takes longer, the editor may drop the suggestion entirely, show stale suggestions from a previous invocation, or cause visible typing lag. The Pi agent's latency (model inference, context assembly, network) almost always exceeds 120ms, meaning naive implementations will produce no visible completions at all.

**Why it happens:**
The deadline is not documented as a hard limit but emerges from the editor's rendering pipeline. VS Code tries to display completions while the user is still typing — if the provider hasn't responded within the typing "gap," the response is discarded. This is especially acute with remote/agent-based providers where round-trip time dominates.

**How to avoid:**
- **Cache aggressively:** If the user types in the same context (same file, same function), serve a cached or heuristic completion immediately while the real request to Pi is in flight.
- **Two-phase return:** Return a quick, low-quality heuristic completion immediately, then update it via `editor.action.inlineSuggest.commit` when the full completion arrives.
- **Stream tokens incrementally:** If the Pi agent supports streaming, deliver completion tokens as they arrive rather than waiting for the full response.
- **Be honest about latency:** If Pi agent latency is >500ms, consider a loading indicator in the inline completion insertion point rather than showing stale completions.

**Warning signs:**
- `provideInlineCompletionItems` is called but no ghost text appears
- Completions appear only after the user stops typing for multiple seconds
- Rival extensions (Copilot, Cody) show completions but Pi does not

**Phase to address:**
Phase 2 (Inline Completion Integration) — The two-phase / caching strategy must be designed alongside the completion provider, not retrofitted.

---

### Pitfall 8: sendRequest Consent Dialog Blocks Non-User-Initiated Flows

**What goes wrong:**
`vscode.lm.sendRequest()` (the Language Model API) requires user consent — it shows a dialog on first use and throws `LanguageModelError.NoPermissions` if consent is not given. If the extension calls `sendRequest()` during activation or in response to a file change (not a direct user action), the consent dialog appears unexpectedly and the request fails.

**Why it happens:**
VS Code treats LM access as a privileged operation. The API is designed for chat participants where the user has explicitly invoked a chat request. Calling it outside of a user-initiated context (e.g., during inline completion provision, during startup, in a file watcher) bypasses this expectation and either shows strange dialogs or fails silently.

**How to avoid:**
- Always check `LanguageModelAccessInformation.canSendRequest` before calling `sendRequest()`.
- For inline completions, route the request through the Pi agent process directly — not through the VS Code LM API. The Pi agent manages its own model access.
- For chat participant flows, `sendRequest()` is appropriate because the user explicitly typed `@pi`.
- Handle `LanguageModelError.NoPermissions` gracefully: show a status bar message with a "grant permission" button rather than crashing.

**Warning signs:**
- User sees a "consent" dialog during normal typing (inline completions)
- Chat responses show "permission denied" errors
- `sendRequest()` throws in background contexts

**Phase to address:**
Phase 1 (Chat Participant Integration) and Phase 2 (Inline Completion Integration) — Chat participant uses LM API correctly (user-initiated), inline completions bypass it.

---

### Pitfall 9: Token Counting Bug With LanguageModelChatMessage Objects

**What goes wrong:**
`model.countTokens()` behaves differently for strings vs. `LanguageModelChatMessage` objects. When passed a message object, it may return only ~4 tokens (the `toString()` of `[object Object]`) instead of the actual count. This silently corrupts context window management — the extension thinks it has plenty of room, continues adding messages, and eventually gets an error or truncated response.

**Why it happens:**
The VS Code LM API has a known bug where `countTokens()` does not correctly serialize `LanguageModelChatMessage` objects before counting. The method falls back to `toString()` on the object rather than extracting the `.content` property.

**How to avoid:**
- Always pass the raw string content to `countTokens()`, never the message object:
  ```typescript
  // CORRECT
  const count = await model.countTokens(message.content);
  // WRONG
  const count = await model.countTokens(message);
  ```
- Monitor for token count anomalies: if `countTokens()` returns <10 for a message that should have hundreds of tokens, you've hit the bug.
- If using the Pi agent's own token counting (not VS Code's LM API), this bug does not apply.

**Warning signs:**
- Chat context window fills up faster than expected
- Token counting returns implausibly small numbers for large messages
- Conversations get truncated mid-way with no warning

**Phase to address:**
Phase 1 (Chat Participant Integration) — Establish correct token counting patterns from the start.

---

### Pitfall 10: ChatResponseStream Error Handling for Truncated Responses

**What goes wrong:**
The `response.text` async iterable from `sendRequest()` can terminate early or error mid-stream even when `finish_reason` is `"stop"`. Without a `try/catch` around the `for await` loop, truncated responses produce no visible error — the chat just stops mid-sentence. The user sees an incomplete response with no indication that something went wrong.

**Why it happens:**
Network interruptions, quota limits, and server-side errors can terminate streams at any point. The `sendRequest()` call succeeds (the model was found, the request was dispatched) but the response stream encounters an error partway through. The error manifests inside the async iterator, not in the initial call.

**How to avoid:**
- Always wrap the `for await (const fragment of response.text)` loop in a `try/catch`.
- On stream error, call `stream.markdown("\n\n*Response was interrupted. Check the connection and try again.*")` to inform the user.
- Handle `LanguageModelError.Blocked` (quota exceeded) as a special case with a "quota exceeded" message.

**Warning signs:**
- Chat responses end mid-sentence without error indicator
- `catch {}` blocks (pattern in existing codebase) that swallow stream errors
- Users report "Pi just stops talking"

**Phase to address:**
Phase 1 (Chat Participant Integration) — The chat response handler must include stream error handling from the first implementation.

---

## Technical Debt Patterns

Shortcuts that seem reasonable but create long-term problems.

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Reusing Pi agent's terminal process for IPC | No new process to manage, simple startup | Terminal-specific output mixed with IPC protocol; process resurrection complexity; hard to separate stdout/stderr from IPC messages | Only for MVP Phase 1. Replace with dedicated bridge process by Phase 3. |
| Synchronous file I/O in extension host | Simpler code, no async handling | Blocks main thread, triggers VS Code "slow extension" warnings, degrades typing performance | Never. Use `fs.promises` from the start. |
| Empty catch blocks during development | Short-term debugging convenience | Silent failures that surface as user-facing bugs in production. CONCERNS.md documents 10+ empty catches already. | Never. Every catch must log or recover. |
| File-based IPC for new chat/completion flows | Reuses existing protocol, no new transport | Inherits all corruption/atomicity problems; no streaming; no cancellation; high latency for chat | Not acceptable for Phase 1+. New flows need a proper IPC mechanism. |
| Module-level mutable state (Set, Map globals) | Easy access from any function | Prevents unit testing (state leaks between tests); fragile under hot reload; hard to reason about concurrency | Only during Phase 0 refactor. Extract into injectable service classes. |

---

## Integration Gotchas

Common mistakes when connecting to external services.

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| **VS Code LM API (`sendRequest`)** | Calling outside user-initiated context (inline completion, activation) | User consent dialog thrown unexpectedly. Use only in chat participant handlers. For inline completions, route through Pi agent directly. |
| **Pi SDK `^0.74.0`** | Assuming semver stability with pre-1.0 version | Pin exact version, not caret range (`^0.74.0`). Any minor bump can break API calls. |
| **VS Code Chat API `stream.markdown()`** | Not setting `isTrusted` on command links | Command links silently don't render. Must use `MarkdownString` with explicit `isTrusted` command list. |
| **`child_process.spawn` for Pi agent** | Using `exec()` or not handling `maxBuffer` | Use `spawn()` (streaming) not `exec()` (buffered). `exec()` default 200KB buffer is exceeded by agent output. Pass AbortSignal for cancellation. |
| **`child_process.fork()`** | Expecting `vscode` module to be available in forked process | `vscode` module is NOT available in child processes (GitHub Issue #213521). Use JSON-RPC over stdio or socket. |
| **File watcher on `.pi/` directory** | Not accounting for partial writes | OS may fire `change` event on incomplete write. Always read with size validation + `.done` sentinel check. |
| **WSL filesystem for IPC** | Assuming Linux-native file performance | WSL filesystem (DrvFs) has 10-100x latency for interop file operations. File-based IPC will be slow. Consider socket-based IPC on WSL. |
| **VS Code `fs.watch`** | Expecting events for every write | OS may drop events. fsevents (macOS) does not guarantee delivery. Use polling as fallback or `chokidar` with `awaitWriteFinish` enabled. |

---

## Performance Traps

Patterns that work at small scale but fail as usage grows.

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Sending full conversation history on every chat response state update | Chat becomes sluggish after ~20 messages; UI freeze after ~50 | Implement incremental/delta updates. Only send new tokens, not the entire conversation. | ~20-50 messages (RooCode Incident: O(n^2) data transfer caused UI grey screen at ~1000 messages) |
| Synchronous JSON.parse on large IPC payloads | Typing lag during review operations | Parse asynchronously or chunk large payloads. Offload to worker thread if >1MB. | ~10MB payloads cause 200ms+ blocking (CSDN profiling data) |
| Polling `.pi/` directory instead of using `fs.watch` | 100% CPU core when Pi agent is idle, battery drain on laptops | Use `fs.watch` with `awaitWriteFinish` from chokidar. Fall back to polling only when watcher fails. | Immediately (always wasteful vs. event-driven) |
| Spawning Pi agent process on every completion request | High latency, process creation overhead (~500ms), extension host thrashing | Keep a warm agent process pool. Reuse processes for multiple requests. Cancel in-flight requests rather than killing and re-spawning. | More than ~5 completion requests per minute |
| Accumulating `.pi/sessions/` files | VS Code Extension Host freeze on startup | Implement session file pruning (delete old sessions), use lazy loading, max file count limit | ~200 sessions / 287MB (Claude Code incident: 241 files, 5-second freeze) |
| Long completion requests blocking new requests (no queuing) | User types but no completions appear; completion system appears dead | Implement request deduplication (same context = reuse), queue with timeout, cancel stale requests | Under rapid typing (burst of keystrokes) |

---

## Security Mistakes

Domain-specific security issues beyond general web security.

| Mistake | Risk | Prevention |
|---------|------|------------|
| No schema validation on IPC messages from `.pi/` directory | Malformed JSON causes parse crash; malicious payload triggers unexpected tool calls | Use runtime type validation (Zod, TypeBox) on all IPC message formats. Reject malformed messages with error log. |
| `resolveSafe()` path sanitizer does not validate workspace containment | Path traversal — Pi agent could write review files outside workspace | Add workspace root boundary check. Reject paths that escape workspace via `../`. |
| Command links in chat responses without `isTrusted` explicitly scoped | Command injection via chat response — untrusted markdown could invoke arbitrary VS Code commands | Always set `isTrusted` to an explicit allowlist of command IDs. Never use `isTrusted: true` (allows all commands). |
| Storing Pi agent tokens/API keys in extension state (unencrypted) | Token leakage via workspace state sync, backups, or extension crash dumps | Use `vscode.SecretStorage` (encrypted at rest) for all credentials. Never store tokens in `workspaceState` or `globalState`. |
| No input validation on chat participant text | User could inject prompt manipulation into chat context | Treat all user input as untrusted. Use Pi agent's own prompt injection detection if available. Log excessive message sizes. |

---

## UX Pitfalls

Common user experience mistakes.

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| No feedback during long chat responses | User thinks extension is broken; closes VS Code or retypes the message | Use `stream.progress()` to show intermediate progress. Display a spinner or "thinking..." indicator. |
| Inline completions that keep appearing while user actively deletes/retypes | Completions feel like they're "fighting" the user — aggressive UX | Implement 300-500ms debounce default. Make delay configurable. Detect backspace/delete patterns and extend debounce. |
| Chat responses without visual approve/reject controls for file changes | User must switch to terminal TUI, defeating the purpose of VS Code integration | Use `stream.button()` to render approve/reject/rethink buttons inline in chat responses. |
| No indication of which model/provider is active | User sees different behavior but has no debugging path | Include model name + provider in chat response header or metadata. Respect Pi's `/model` command output. |
| Chat session not persisted on VS Code reload | User loses conversation history | Persist chat session to `workspaceState` or `.pi/sessions/`. Restore on activation. |
| Inline completions shown for binary/config/non-code files | Irrelevant or broken completions on non-code content | Check document language ID before offering completions. Skip files where Pi has no relevant context. |
| Terminal TUI vs VS Code UI confusion (two competing feedback channels) | User approves in one channel, change re-applied in other | Show review in VS Code first for VS Code users. Retain TUI only as fallback when VS Code unavailable. Never show both simultaneously. |

---

## "Looks Done But Isn't" Checklist

Things that appear complete but are missing critical pieces.

- [ ] **Chat participant registered:** Only checks `@pi` detection works. Missing: slash command routing, error response for unknown commands, `/` command detection for Pi's built-in commands (`/model`, `/tavily`, etc.).
- [ ] **Inline completions appear:** First ghost text shows up. Missing: cancellation on cursor move, debounce timing tuned, stale completion cleanup, partial accept handling (accept-next-word vs accept-line).
- [ ] **Pi agent bridge established:** Extension spawns Pi process and sends first message. Missing: process health checks, reconnection on crash, graceful shutdown on deactivation, cancellation relay.
- [ ] **Visual approve/reject rendered:** `stream.button()` shows buttons in chat. Missing: command handlers registered for button actions, actual diff application/rejection logic piped through, confirmation with undo capability.
- [ ] **Error handling added:** `try/catch` wraps all file I/O. Missing: user-visible error messages, recovery paths, error logging to output channel, metrics tracking.
- [ ] **Extension published:** Listed on Marketplace. Missing: activation event optimization (using `onChatParticipant:` not `*`), telemetry, CI/CD pipeline, automated testing.
- [ ] **Pi config respected:** Reads `.pi/config.yaml`. Missing: re-read on config change (file watcher), validation of config values, reporting config errors back to user.

---

## Recovery Strategies

When pitfalls occur despite prevention, how to recover.

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| File-based IPC corruption | MEDIUM | 1) Detect corrupt file (JSON parse failure). 2) Move to `.pi/corrupt/` with timestamp. 3) Write error status back to originating process. 4) Notify user via status bar. 5) Retry operation. |
| Extension host OOM from chat session accumulation | MEDIUM | 1) Detect high memory usage (>200MB). 2) Prune oldest session files. 3) Show notification with count of pruned sessions. 4) Add session file size cap (e.g., 10MB per session). |
| Pi agent process crash | LOW | 1) Detect via heartbeat timeout. 2) Auto-restart with exponential backoff (1s, 2s, 4s, max 30s). 3) Restore in-flight state from workspaceState. 4) Show status bar "restarting Pi agent..." indicator. |
| Extension activation timeout | MEDIUM | 1) Log which phase of activation blocked. 2) On next activation, skip that phase to fast path. 3) Show notification suggesting workspace reload. 4) File issue telemetry for analysis. |
| Consent dialog blocks inline completions | LOW | 1) Detect `LanguageModelError.NoPermissions`. 2) Show "grant access" action in status bar. 3) Route inline completions through Pi agent directly (not VS Code LM API). 4) Retry with LM API on next user chat. |

---

## Pitfall-to-Phase Mapping

How roadmap phases should address these pitfalls.

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Transactional Chat API limits (P1) | Phase 1: Chat Participant | Test: ensure no references to `stream` persist after handler returns |
| InlineCompletionProvider no debounce (P2) | Phase 2: Inline Completion | Test: verify only 1 request per 300ms typing burst, not 1 per keystroke |
| CancellationToken misuse (P3) | Phase 2 + Phase 3 | Test: abort mid-stream and verify no agent request completes |
| Sync I/O blocking main thread (P4) | Phase 0: Foundation | Test: profile extension host for zero sync I/O during operation |
| File-based IPC corruption (P5) | Phase 0 + Phase 3 | Test: write partial file, verify reader detects and recovers |
| Activation timeout (P6) | Phase 0: Foundation | Test: measure `activate()` execution time under 100ms |
| 120ms completion deadline (P7) | Phase 2: Inline Completion | Test: ghost text appears within 150ms of stopping typing |
| sendRequest consent dialog (P8) | Phase 1 + Phase 2 | Test: inline completions work without showing consent dialog |
| Token counting bug (P9) | Phase 1: Chat Participant | Test: verify token counts match actual content length |
| Stream error handling (P10) | Phase 1: Chat Participant | Test: simulate network interrupt, verify user-visible error |

---

## Sources

- **VS Code Chat Extension API Guide**: https://code.visualstudio.com/api/extension-guides/chat — Official documentation on ChatParticipant, response streaming, slash commands, followups, and gotchas (trusted domain list, reserved names, participant detection conflicts)
- **@vscode/chat-extension-utils**: https://github.com/microsoft/vscode-chat-extension-utils — Official helper library for chat participant development (prompt-tsx, tool calling loop, automatic streaming)
- **Transactional Chat API limitation**: https://github.com/microsoft/vscode/issues/219245 — Confirms ChatRequestHandler is strictly request-response; no proactive messaging possible
- **VS Code InlineCompletion debounce request**: https://github.com/microsoft/vscode-extension-samples/issues/819 — Confirms no built-in debounce; must implement manually
- **InlineCompletion partial accept race fix**: https://github.com/microsoft/vscode/pull/197633 — Race condition between freeInlineCompletions and partialAccept
- **Cody VS Code architecture (DeepWiki)**: https://deepwiki.com/sourcegraph/cody/2.1-vs-code-extension-architecture — Complex initialization, multi-session state, observable patterns, disposal requirements
- **VS Code child_process + vscode module restriction**: https://github.com/microsoft/vscode/issues/213521 — vscode module unavailable in forked processes
- **Extension host crash from execSync**: https://github.com/microsoft/vscode/issues/138036 — Crash even inside try/catch with invalid cwd
- **sendRequest truncated response bug**: https://github.com/microsoft/vscode-copilot-release/issues/1358 — Responses cut off mid-stream even with finish_reason "stop"
- **clines/cline token counting bug**: https://github.com/cline/cline/issues/4584 — countTokens under-reports with LanguageModelChatMessage objects
- **VS Code Chat freeze from session accumulation**: https://github.com/anthropics/claude-code/issues/23025 — 241 session files caused 5-second startup freeze
- **Extension Host OOM from chat participant**: https://github.com/anthropics/claude-code/issues/11178 — chatParticipant crash + OOM on VS Code 1.105.1
- **MCP OAuth DCR issues**: https://github.com/microsoft/vscode/issues/279955 — Dynamic Client Registration regressions in VS Code 1.106+
- **File watcher documentation**: https://github.com/microsoft/vscode/wiki/File-Watcher-Issues — OS may drop file events; no 100% guarantee
- **Extension Host main thread blocking (CSDN profiling)**: https://blog.csdn.net/InitPulse/article/details/158759787 — Sync I/O causes 842ms latency vs 51ms after fix
- **VS Code activation timeout guidance**: Community best practices from flox-vscode, vscode-python, vscode-jupyter issue trackers
- **RooCode state update performance issue**: https://github.com/RooCodeInc/Roo-Code/issues/6513 — O(n^2) full conversation sending causes grey screen
- **VS Code LM API consent requirement**: From VS Code API reference — sendRequest requires user action, throws NoPermissions otherwise

---
*Pitfalls research for: pi-vscode-sr (VS Code AI agent integration)*
*Researched: 2026-06-14*
