# Extension Findings Remediation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the P0/P1/P3 findings from `docs/extension-architecture-analysis.md` that are fully implementable inside this repo — token security, sync conflict handling, git↔sync traceability, DAG debug UI wiring, local debug agent activation, and dead-code/config cleanup.

**Architecture:** No new services or processes are introduced. Every change is additive to the existing extension-host (`src/`) / webview (`webview-src/`) split: the extension host keeps owning I/O (secrets, HTTP, git), the webview keeps owning presentation and posts messages through the existing `postMessage` bridge.

**Tech Stack:** TypeScript (strict), VSCode Extension API (`vscode.ExtensionContext.secrets`, `vscode.window`), React 18 (webview), Node.js `http`/`https`/`child_process`, `ws` (already a dependency), `webpack`.

## Global Constraints

- This repo has **no automated test runner** (no jest/mocha in `package.json`). The only automated verification available is `npm run compile` (`tsc -p tsconfig.json --noEmit`) — run it after every task. Where a piece of logic is pure and easy to isolate (e.g. an error class, a URL builder), the step shows how to sanity-check it with a throwaway `node -e` one-liner instead of inventing a test framework that isn't part of this project's conventions.
- Follow the existing code style exactly: `vscode.window.show*Message` for user feedback, private helper methods at the bottom of the class, `void somePromise().catch(...)` for fire-and-forget calls inside sync message handlers, 2-space indentation, no semicolons omitted (this codebase uses semicolons).
- Do not touch anything that requires the external Flow Engine (`:3000`), Flow Sync service (`:3012`), or Debug Orchestrator (`:4000`) to change their own behavior — those repos are not part of this workspace. Every task here must work (or degrade harmlessly) against the *current, unmodified* external services.
- Out of scope for this plan (documented, not silently dropped): the Node Type Registry and `flowId+version` sub-flow reference redesign (analysis doc §5.3/§5.4) — both require a contract change in the external Flow Engine that cannot be validated from this repo alone. `syncAllFlows()`'s bulk `/api/nodes/sync` endpoint is left untouched — its batch-conflict semantics on the server are unknown and out of scope for the optimistic-locking work in Task 2/3.

---

### Task 1: Typed HTTP error for Flow Sync requests

**Files:**
- Modify: `src/FlowSyncViewProvider.ts:1-31` (imports + new class), `src/FlowSyncViewProvider.ts:479-528` (`requestJson`)

**Interfaces:**
- Produces: `export class FlowSyncHttpError extends Error { readonly status: number }` — later tasks (`Task 2`) catch this to detect HTTP 409.

- [ ] **Step 1: Add the error class**

In `src/FlowSyncViewProvider.ts`, right after the existing `const DEFAULT_SYNC_CONFIG` block (after line 31), add:

```ts
export class FlowSyncHttpError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = 'FlowSyncHttpError';
  }
}
```

- [ ] **Step 2: Throw it from `requestJson` instead of a plain `Error`**

Find this block inside `private requestJson(...)` (around line 505):

```ts
            const status = res.statusCode ?? 0;
            if (status < 200 || status >= 300) {
              reject(new Error(`${method} ${urlPath} -> HTTP ${status}`));
              return;
            }
```

Replace with:

```ts
            const status = res.statusCode ?? 0;
            if (status < 200 || status >= 300) {
              reject(new FlowSyncHttpError(status, `${method} ${urlPath} -> HTTP ${status}${out ? `: ${out}` : ''}`));
              return;
            }
```

- [ ] **Step 3: Verify it compiles**

Run: `npm run compile`
Expected: no errors.

- [ ] **Step 4: Sanity-check the error shape**

Run: `node -e "class E extends Error { constructor(s,m){super(m);this.status=s;} } const e = new E(409,'x'); console.log(e instanceof Error, e.status)"`
Expected: `true 409`

- [ ] **Step 5: Commit**

```bash
git add src/FlowSyncViewProvider.ts
git commit -m "feat(flow-sync): add typed HTTP error carrying status code"
```

---

### Task 2: Optimistic locking on `.flow` sync (baseVersion + 409 conflict UI)

**Files:**
- Modify: `src/FlowSyncViewProvider.ts` (`FlowPayload` interface, `buildPayload`, `syncUri`, new `resolveSyncConflict`/`findFileItemForUri` helpers)

**Interfaces:**
- Consumes: `FlowSyncHttpError` from Task 1.
- Produces: `FlowPayload.baseVersion?: number` — the local `version` field read from the flow JSON, sent to the server so it can detect a stale write. (Full protection requires the external Flow Sync service to actually enforce `baseVersion` and answer with HTTP 409 on mismatch — this task supplies the client-side contract and conflict UX; it degrades to today's silent-overwrite behavior if the server ignores the field, which is a strict improvement, never a regression.)

- [ ] **Step 1: Add `baseVersion` to the payload type and populate it in `buildPayload`**

Find:

```ts
interface FlowPayload {
  fileName: string;
  source?: string;
  flow: Json;
}
```

Replace with:

```ts
interface FlowPayload {
  fileName: string;
  source?: string;
  flow: Json;
  baseVersion?: number;
}
```

Find `buildPayload`:

```ts
  private async buildPayload(uri: vscode.Uri, source: string): Promise<FlowPayload | null> {
    const raw = await vscode.workspace.fs.readFile(uri);
    const text = Buffer.from(raw).toString('utf8');
    let parsed: Json;
    try {
      parsed = JSON.parse(text) as Json;
    } catch {
      return null;
    }

    return {
      fileName: path.basename(uri.fsPath),
      source,
      flow: parsed,
    };
  }
```

Replace with:

```ts
  private async buildPayload(uri: vscode.Uri, source: string): Promise<FlowPayload | null> {
    const raw = await vscode.workspace.fs.readFile(uri);
    const text = Buffer.from(raw).toString('utf8');
    let parsed: Json;
    try {
      parsed = JSON.parse(text) as Json;
    } catch {
      return null;
    }

    const baseVersion = typeof parsed.version === 'number' && Number.isFinite(parsed.version)
      ? Math.max(0, Math.floor(parsed.version))
      : undefined;

    return {
      fileName: path.basename(uri.fsPath),
      source,
      flow: parsed,
      baseVersion,
    };
  }
```

- [ ] **Step 2: Verify it compiles**

Run: `npm run compile`
Expected: no errors.

- [ ] **Step 3: Add conflict resolution to `syncUri`**

Find:

```ts
  private async syncUri(uri: vscode.Uri, source: string): Promise<void> {
    try {
      const payload = await this.buildPayload(uri, source);
      if (!payload) {
        vscode.window.showWarningMessage(`Skip sync (invalid JSON): ${vscode.workspace.asRelativePath(uri, false)}`);
        return;
      }
      await this.requestJson('/api/flows', 'POST', payload);
      vscode.window.showInformationMessage(`Synced ${payload.fileName}`);
    } catch (err) {
      vscode.window.showErrorMessage(`Flow sync failed: ${String(err)}`);
    }
  }
```

Replace with:

```ts
  private async syncUri(uri: vscode.Uri, source: string): Promise<void> {
    const payload = await this.buildPayload(uri, source);
    if (!payload) {
      vscode.window.showWarningMessage(`Skip sync (invalid JSON): ${vscode.workspace.asRelativePath(uri, false)}`);
      return;
    }
    try {
      await this.requestJson('/api/flows', 'POST', payload);
      vscode.window.showInformationMessage(`Synced ${payload.fileName}`);
    } catch (err) {
      if (err instanceof FlowSyncHttpError && err.status === 409) {
        await this.resolveSyncConflict(uri, payload);
        return;
      }
      vscode.window.showErrorMessage(`Flow sync failed: ${String(err)}`);
    }
  }

  private async resolveSyncConflict(uri: vscode.Uri, payload: FlowPayload): Promise<void> {
    const choice = await vscode.window.showWarningMessage(
      `${payload.fileName} changed on the server since your last pull` +
      (typeof payload.baseVersion === 'number' ? ` (your local copy is based on v${payload.baseVersion})` : '') +
      `. Overwriting will create a new version on top of the newer remote content.`,
      { modal: true },
      'Overwrite remote',
      'Pull latest instead',
    );

    if (choice === 'Pull latest instead') {
      const item = await this.findFileItemForUri(uri);
      await this.pullLatestToLocal(item);
      return;
    }

    if (choice === 'Overwrite remote') {
      await this.requestJson('/api/flows', 'POST', { ...payload, baseVersion: undefined });
      vscode.window.showInformationMessage(`Overwrote remote: ${payload.fileName}`);
      this.refresh();
    }
  }

  private async findFileItemForUri(uri: vscode.Uri): Promise<FlowFileItem | undefined> {
    const items = await this.getChildren();
    return items.find((i): i is FlowFileItem => i.kind === 'flow-file' && i.uri?.toString() === uri.toString());
  }
```

- [ ] **Step 4: Verify it compiles**

Run: `npm run compile`
Expected: no errors.

- [ ] **Step 5: Manual smoke test (no server changes required)**

1. `npm run dev:extension &` then press F5 in VSCode to launch the Extension Development Host.
2. Open a `.flow` file, run "Sync This .flow" from the `.flow Sync` view.
3. Confirm behavior is unchanged when the sync server returns 200 (no conflict dialog appears) — this proves the new `baseVersion` field doesn't break the existing happy path.
4. (Optional, only if you have access to a Flow Sync server you can point at a stub returning 409) confirm the conflict dialog appears with "Overwrite remote" / "Pull latest instead" and both choices behave as described.

- [ ] **Step 6: Commit**

```bash
git add src/FlowSyncViewProvider.ts
git commit -m "feat(flow-sync): send baseVersion and handle 409 conflicts with a resolution dialog"
```

---

### Task 3: Tag sync `source` with the local git commit SHA

**Files:**
- Modify: `src/FlowSyncViewProvider.ts` (imports, `buildPayload`, new `tagSourceWithGitSha`/`readGitSha` helpers)

**Interfaces:**
- Produces: sync payloads whose `source` field is `"<original-source>@<12-char-sha>"` when the workspace is a git repo with a resolvable `HEAD`, otherwise unchanged (`"<original-source>"`). This gives the external Flow Sync service's version history a traceable link back to the git commit that produced it, per analysis §5.2, without requiring any change to the sync service itself.

- [ ] **Step 1: Import `execFileSync`**

At the top of `src/FlowSyncViewProvider.ts`, next to the existing imports:

```ts
import * as fs from 'fs';
import * as http from 'http';
import * as https from 'https';
import * as path from 'path';
import * as vscode from 'vscode';
```

add:

```ts
import { execFileSync } from 'child_process';
```

- [ ] **Step 2: Add the git SHA helpers**

Add these two private methods to the `FlowSyncViewProvider` class (near `configRoot`/`configPath`):

```ts
  private readGitSha(): string | undefined {
    const root = this.configRoot();
    if (!root) { return undefined; }
    try {
      const sha = execFileSync('git', ['rev-parse', '--short=12', 'HEAD'], {
        cwd: root,
        encoding: 'utf8',
        timeout: 2000,
      }).trim();
      return sha || undefined;
    } catch {
      return undefined;
    }
  }

  private tagSourceWithGitSha(source: string): string {
    const sha = this.readGitSha();
    return sha ? `${source}@${sha}` : source;
  }
```

- [ ] **Step 3: Use it in `buildPayload`**

In the `buildPayload` method from Task 2, change:

```ts
    return {
      fileName: path.basename(uri.fsPath),
      source,
      flow: parsed,
      baseVersion,
    };
```

to:

```ts
    return {
      fileName: path.basename(uri.fsPath),
      source: this.tagSourceWithGitSha(source),
      flow: parsed,
      baseVersion,
    };
```

- [ ] **Step 4: Verify it compiles**

Run: `npm run compile`
Expected: no errors.

- [ ] **Step 5: Sanity-check `readGitSha` behavior outside a repo**

Run: `node -e "const {execFileSync}=require('child_process'); try { console.log(execFileSync('git',['rev-parse','--short=12','HEAD'],{cwd:'/tmp',encoding:'utf8'})); } catch(e) { console.log('caught as expected:', e.message.split('\n')[0]); }"`
Expected: prints `caught as expected: ...` (proves the `try/catch` path this helper relies on is real, not something that would throw uncaught).

- [ ] **Step 6: Manual smoke test**

1. In the repo root (`git rev-parse --short=12 HEAD` should print a SHA), launch the Extension Development Host (F5), sync a `.flow` file.
2. If you have access to the sync server's stored payload (e.g. via `GET /api/flows/<file>/versions`), confirm the latest version's `source` now ends with `@<sha>` matching `git rev-parse --short=12 HEAD` in this repo at commit time.

- [ ] **Step 7: Commit**

```bash
git add src/FlowSyncViewProvider.ts
git commit -m "feat(flow-sync): tag sync source with the local git commit SHA when available"
```

---

### Task 4: Move API auth tokens from plaintext file to VSCode SecretStorage

**Files:**
- Modify: `src/FlowEditorProvider.ts` (message handlers for `request-api-token`/`store-api-token`, `executeHttpCall`, and the `readAuthTokens`/`writeAuthToken` helpers)

**Interfaces:**
- Produces: `private async readAuthTokens(): Promise<Record<string, { token: string; storedAt: string }>>`, `private async writeAuthToken(baseUrl: string, token: string): Promise<void>` — both now async and backed by `this.context.secrets` instead of `.openapi-auth.json`. First read auto-migrates any existing `.openapi-auth.json` into SecretStorage and deletes the plaintext file.

- [ ] **Step 1: Replace the message handlers to work with the (soon-to-be) async token helpers**

Find:

```ts
      if (message.type === 'request-api-token' && typeof message.baseUrl === 'string') {
        const tokens = this.readAuthTokens();
        const key = this.normalizeBaseUrl(message.baseUrl);
        const token = tokens[key]?.token ?? null;
        webviewPanel.webview.postMessage({
          type: 'api-token-response',
          reqId: message.reqId,
          baseUrl: message.baseUrl,
          token,
        });
      }

      if (message.type === 'store-api-token'
          && typeof message.baseUrl === 'string'
          && typeof message.token === 'string') {
        this.writeAuthToken(message.baseUrl, message.token);
        webviewPanel.webview.postMessage({
          type: 'api-token-stored',
          baseUrl: message.baseUrl,
        });
      }
```

Replace with:

```ts
      if (message.type === 'request-api-token' && typeof message.baseUrl === 'string') {
        const baseUrl = message.baseUrl;
        const reqId = message.reqId;
        void this.readAuthTokens().then((tokens) => {
          const key = this.normalizeBaseUrl(baseUrl);
          const token = tokens[key]?.token ?? null;
          webviewPanel.webview.postMessage({
            type: 'api-token-response',
            reqId,
            baseUrl,
            token,
          });
        });
      }

      if (message.type === 'store-api-token'
          && typeof message.baseUrl === 'string'
          && typeof message.token === 'string') {
        const baseUrl = message.baseUrl;
        void this.writeAuthToken(baseUrl, message.token).then(() => {
          webviewPanel.webview.postMessage({
            type: 'api-token-stored',
            baseUrl,
          });
        });
      }
```

- [ ] **Step 2: Update `executeHttpCall` to await the token lookup**

Find (inside `executeHttpCall`, already an `async` method):

```ts
    // Attach stored bearer token if available for this API
    const headers: Record<string, string> = { ...extraHeaders };
    if (baseUrl) {
      const tokens = this.readAuthTokens();
      const key = this.normalizeBaseUrl(baseUrl);
      const stored = tokens[key];
      if (stored?.token) {
        headers['Authorization'] = stored.token;
      }
    }
```

Replace with:

```ts
    // Attach stored bearer token if available for this API
    const headers: Record<string, string> = { ...extraHeaders };
    if (baseUrl) {
      const tokens = await this.readAuthTokens();
      const key = this.normalizeBaseUrl(baseUrl);
      const stored = tokens[key];
      if (stored?.token) {
        headers['Authorization'] = stored.token;
      }
    }
```

- [ ] **Step 3: Replace the token storage implementation**

Find:

```ts
  private authConfigPath(): string | undefined {
    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    return root ? path.join(root, '.openapi-auth.json') : undefined;
  }

  private readAuthTokens(): Record<string, { token: string; storedAt: string }> {
    const cfgPath = this.authConfigPath();
    if (!cfgPath) { return {}; }
    try {
      const raw = fs.readFileSync(cfgPath, 'utf8');
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      return (typeof parsed.tokens === 'object' && parsed.tokens !== null)
        ? parsed.tokens as Record<string, { token: string; storedAt: string }>
        : {};
    } catch {
      return {};
    }
  }

  private writeAuthToken(baseUrl: string, token: string): void {
    const cfgPath = this.authConfigPath();
    if (!cfgPath) { return; }
    const existing = this.readAuthTokens();
    const key = this.normalizeBaseUrl(baseUrl);
    existing[key] = { token, storedAt: new Date().toISOString() };
    try {
      fs.writeFileSync(cfgPath, JSON.stringify({ tokens: existing }, null, 2), 'utf8');
    } catch { /* read-only workspace */ }
  }
```

Replace with:

```ts
  private static readonly AUTH_SECRET_KEY = 'reactdnd.apiTokens';

  private authConfigPath(): string | undefined {
    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    return root ? path.join(root, '.openapi-auth.json') : undefined;
  }

  private async readAuthTokens(): Promise<Record<string, { token: string; storedAt: string }>> {
    const stored = await this.context.secrets.get(FlowEditorProvider.AUTH_SECRET_KEY);
    if (stored) {
      try {
        return JSON.parse(stored) as Record<string, { token: string; storedAt: string }>;
      } catch {
        return {};
      }
    }
    return this.migrateLegacyAuthFile();
  }

  /** One-time migration: pulls tokens out of the old plaintext `.openapi-auth.json`
   *  into SecretStorage, then deletes the file so it can't leak via git/screen-share. */
  private async migrateLegacyAuthFile(): Promise<Record<string, { token: string; storedAt: string }>> {
    const cfgPath = this.authConfigPath();
    if (!cfgPath || !fs.existsSync(cfgPath)) { return {}; }
    try {
      const raw = fs.readFileSync(cfgPath, 'utf8');
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const tokens = (typeof parsed.tokens === 'object' && parsed.tokens !== null)
        ? parsed.tokens as Record<string, { token: string; storedAt: string }>
        : {};
      if (Object.keys(tokens).length > 0) {
        await this.writeAllAuthTokens(tokens);
      }
      fs.unlinkSync(cfgPath);
      return tokens;
    } catch {
      return {};
    }
  }

  private async writeAllAuthTokens(tokens: Record<string, { token: string; storedAt: string }>): Promise<void> {
    await this.context.secrets.store(FlowEditorProvider.AUTH_SECRET_KEY, JSON.stringify(tokens));
  }

  private async writeAuthToken(baseUrl: string, token: string): Promise<void> {
    const existing = await this.readAuthTokens();
    const key = this.normalizeBaseUrl(baseUrl);
    existing[key] = { token, storedAt: new Date().toISOString() };
    await this.writeAllAuthTokens(existing);
  }
```

- [ ] **Step 4: Verify it compiles**

Run: `npm run compile`
Expected: no errors. (If TypeScript complains that `context.secrets` doesn't exist, confirm `@types/vscode` is `^1.85.0` in `package.json` — `SecretStorage` has been part of the API since 1.53, so this is just a sanity check, not expected to fail.)

- [ ] **Step 5: Manual smoke test — migration path**

1. In a scratch workspace, create `.openapi-auth.json`:
   ```bash
   printf '{"tokens":{"http://localhost:4010":{"token":"Bearer test123","storedAt":"2026-01-01T00:00:00.000Z"}}}' > .openapi-auth.json
   ```
2. Launch the Extension Development Host (F5), open a `.flow` file, trigger any flow that calls `request-api-token` for `http://localhost:4010` (or open the OpenAPI Explorer and interact with an endpoint under that base URL).
3. Confirm `.openapi-auth.json` is deleted from disk after the interaction, and that the token still resolves correctly (e.g. the HTTP call node still sends `Authorization: Bearer test123`).
4. Reload the Extension Development Host window and repeat step 2 — confirm the token still resolves (i.e. it persisted in SecretStorage, not just in memory).

- [ ] **Step 6: Commit**

```bash
git add src/FlowEditorProvider.ts
git commit -m "fix(security): move API auth tokens from plaintext .openapi-auth.json to VSCode SecretStorage"
```

---

### Task 5: Expose `debugMode` and `isPaused` from `DagDebugContext`

**Files:**
- Modify: `webview-src/context/DagDebugContext.tsx`

**Interfaces:**
- Consumes: existing `dag-debug-state` (`message.debugMode: boolean`) and `dag-debug-event` (`message.event.type`) postMessage payloads — both already sent by `src/DagDebugService.ts` (`postState`/`broadcast`), no extension-host changes needed for this task.
- Produces: `useDagDebug()` now also returns `debugMode: boolean` and `isPaused: boolean`. Task 6's toolbar consumes both.

- [ ] **Step 1: Add the two fields to the context value type and default**

Find:

```ts
interface DagDebugContextValue {
  breakpointsByNode: Record<string, DagBreakpointView>;
  nodeStatuses: Record<string, DagDebugStatus>;
  executionPath: string[];
  variables: DagDebugVariableView[];
  selectedDebugNodeId?: string;
  sessionId?: string;
  workspaceId?: string;
  flowId?: string;
  flowRunId?: string;
  service?: string;
  toggleBreakpoint: (nodeId: string, nodeLabel?: string) => void;
  sendCommand: (command: string) => void;
}

const DagDebugContext = createContext<DagDebugContextValue>({
  breakpointsByNode: {},
  nodeStatuses: {},
  executionPath: [],
  variables: [],
  toggleBreakpoint: () => undefined,
  sendCommand: () => undefined,
});
```

Replace with:

```ts
interface DagDebugContextValue {
  breakpointsByNode: Record<string, DagBreakpointView>;
  nodeStatuses: Record<string, DagDebugStatus>;
  executionPath: string[];
  variables: DagDebugVariableView[];
  selectedDebugNodeId?: string;
  sessionId?: string;
  workspaceId?: string;
  flowId?: string;
  flowRunId?: string;
  service?: string;
  debugMode: boolean;
  isPaused: boolean;
  toggleBreakpoint: (nodeId: string, nodeLabel?: string) => void;
  sendCommand: (command: string) => void;
}

const DagDebugContext = createContext<DagDebugContextValue>({
  breakpointsByNode: {},
  nodeStatuses: {},
  executionPath: [],
  variables: [],
  debugMode: false,
  isPaused: false,
  toggleBreakpoint: () => undefined,
  sendCommand: () => undefined,
});
```

- [ ] **Step 2: Track `debugMode` and `isPaused` state in the provider**

Find:

```ts
  const [flowRunId, setFlowRunId] = useState<string | undefined>();
  const [service, setService] = useState<string | undefined>();
```

Replace with:

```ts
  const [flowRunId, setFlowRunId] = useState<string | undefined>();
  const [service, setService] = useState<string | undefined>();
  const [debugMode, setDebugMode] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
```

- [ ] **Step 3: Populate `debugMode` from `dag-debug-state`**

Find:

```ts
      if (message?.type === 'dag-debug-state') {
        setSessionId(typeof message.sessionId === 'string' ? message.sessionId : undefined);
        setWorkspaceId(typeof message.workspaceId === 'string' ? message.workspaceId : undefined);
        setFlowId(typeof message.flowId === 'string' ? message.flowId : undefined);
        setFlowRunId(typeof message.flowRunId === 'string' ? message.flowRunId : undefined);
        setService(typeof message.service === 'string' ? message.service : undefined);
        const breakpoints = Array.isArray(message.breakpoints) ? message.breakpoints as DagBreakpointView[] : [];
        setBreakpointsByNode(Object.fromEntries(breakpoints.filter((bp) => bp.enabled).map((bp) => [bp.nodeId, bp])));
        return;
      }
```

Replace with:

```ts
      if (message?.type === 'dag-debug-state') {
        setSessionId(typeof message.sessionId === 'string' ? message.sessionId : undefined);
        setWorkspaceId(typeof message.workspaceId === 'string' ? message.workspaceId : undefined);
        setFlowId(typeof message.flowId === 'string' ? message.flowId : undefined);
        setFlowRunId(typeof message.flowRunId === 'string' ? message.flowRunId : undefined);
        setService(typeof message.service === 'string' ? message.service : undefined);
        setDebugMode(Boolean(message.debugMode));
        const breakpoints = Array.isArray(message.breakpoints) ? message.breakpoints as DagBreakpointView[] : [];
        setBreakpointsByNode(Object.fromEntries(breakpoints.filter((bp) => bp.enabled).map((bp) => [bp.nodeId, bp])));
        return;
      }
```

- [ ] **Step 4: Derive `isPaused` from event type, not from per-node status**

The per-node `nodeStatuses` map is unreliable for "is the flow currently paused" because a `RESUMED`/`STEP` event may not carry the same `nodeId` as the `BREAKPOINT_HIT` that paused it (see `LocalDagDebugAgent.emitRuntimeEvent` in `src/LocalDagDebugAgent.ts` — command-originated events like `RESUMED`/`STEP`/`STOPPED` don't always include `nodeId`). Track it as a session-level flag instead.

Find, inside the event-handling branch of the `onMessage` handler:

```ts
      const nodeId = debugEvent.nodeId ?? (typeof debugEvent.data?.currentNodeId === 'string' ? debugEvent.data.currentNodeId : undefined);
      const status = eventStatus(debugEvent.type);
      if (nodeId && status) {
        setSelectedDebugNodeId(nodeId);
        setNodeStatuses((prev) => ({ ...prev, [nodeId]: status }));
        setExecutionPath((prev) => prev.includes(nodeId) ? prev : prev.concat(nodeId));
      }
```

Immediately after that block (still inside the same `onMessage` function, before the `nextVariables` line), add:

```ts

      if (debugEvent.type === 'BREAKPOINT_HIT' || debugEvent.type === 'PAUSED') {
        setIsPaused(true);
      } else if (['RESUMED', 'STEP', 'FLOW_COMPLETED', 'FLOW_FAILED', 'STOPPED', 'DEBUG_MODE_DISABLED'].includes(debugEvent.type)) {
        setIsPaused(false);
      }
```

- [ ] **Step 5: Return the new fields from the provider**

Find:

```ts
  const value = useMemo<DagDebugContextValue>(() => ({
    breakpointsByNode,
    nodeStatuses,
    executionPath,
    variables,
    selectedDebugNodeId,
    sessionId,
    workspaceId,
    flowId,
    flowRunId,
    service,
    toggleBreakpoint,
    sendCommand,
  }), [breakpointsByNode, executionPath, flowId, flowRunId, nodeStatuses, selectedDebugNodeId, service, sessionId, workspaceId, sendCommand, toggleBreakpoint, variables]);
```

Replace with:

```ts
  const value = useMemo<DagDebugContextValue>(() => ({
    breakpointsByNode,
    nodeStatuses,
    executionPath,
    variables,
    selectedDebugNodeId,
    sessionId,
    workspaceId,
    flowId,
    flowRunId,
    service,
    debugMode,
    isPaused,
    toggleBreakpoint,
    sendCommand,
  }), [breakpointsByNode, debugMode, executionPath, flowId, flowRunId, isPaused, nodeStatuses, selectedDebugNodeId, service, sessionId, workspaceId, sendCommand, toggleBreakpoint, variables]);
```

- [ ] **Step 6: Verify it compiles**

Run: `npm run compile`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add webview-src/context/DagDebugContext.tsx
git commit -m "feat(dag-debug): expose debugMode and isPaused from DagDebugContext"
```

---

### Task 6: DAG Debug toolbar in the webview (Continue/Pause/Step/Stop/Restart)

**Files:**
- Create: `webview-src/components/DagDebugToolbar.tsx`
- Modify: `webview-src/styles/index.css` (append toolbar styles)
- Modify: `webview-src/App.tsx` (import + mount)

**Interfaces:**
- Consumes: `useDagDebug()` from Task 5 (`debugMode`, `isPaused`, `sendCommand`).
- Produces: default-exported `DagDebugToolbar` React component with no props.

- [ ] **Step 1: Create the toolbar component**

Create `webview-src/components/DagDebugToolbar.tsx`:

```tsx
import React from 'react';
import { useDagDebug } from '../context/DagDebugContext';

interface ToolbarCommand {
  command: string;
  label: string;
  title: string;
}

const COMMANDS: ToolbarCommand[] = [
  { command: 'CONTINUE',  label: '▶', title: 'Continue' },
  { command: 'PAUSE',     label: '⏸', title: 'Pause' },
  { command: 'STEP_OVER', label: '↷', title: 'Step Over' },
  { command: 'STEP_INTO', label: '⤓', title: 'Step Into' },
  { command: 'STEP_OUT',  label: '⤒', title: 'Step Out' },
  { command: 'STOP',      label: '■', title: 'Stop' },
  { command: 'RESTART',   label: '↺', title: 'Restart' },
];

function isDisabled(command: string, isPaused: boolean): boolean {
  if (command === 'PAUSE') { return isPaused; }
  if (command === 'CONTINUE' || command.startsWith('STEP_')) { return !isPaused; }
  return false;
}

export default function DagDebugToolbar() {
  const { debugMode, isPaused, sendCommand } = useDagDebug();

  if (!debugMode) {
    return null;
  }

  return (
    <div className="dag-debug-toolbar">
      {COMMANDS.map(({ command, label, title }) => (
        <button
          key={command}
          type="button"
          className="dag-debug-toolbar-btn"
          title={title}
          aria-label={title}
          disabled={isDisabled(command, isPaused)}
          onClick={() => sendCommand(command)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Add toolbar styles**

Append to `webview-src/styles/index.css` (after the existing `.dag-debug-badge-detail` rule):

```css

.dag-debug-toolbar {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 6px;
  border-radius: 8px;
  background: rgba(0, 0, 0, 0.72);
}

.dag-debug-toolbar-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border: none;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
  font-size: 13px;
  cursor: pointer;
}

.dag-debug-toolbar-btn:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.18);
}

.dag-debug-toolbar-btn:disabled {
  opacity: 0.35;
  cursor: default;
}
```

- [ ] **Step 3: Mount the toolbar in `App.tsx`**

Find the import block:

```ts
import FlowBackground from './components/FlowBackground';
```

Add right after it:

```ts
import DagDebugToolbar from './components/DagDebugToolbar';
```

Find:

```tsx
          <Panel position="top-left">
            <div className="flow-status-badges">
              <WsStatusBadge />
              <DagDebugBadge />
            </div>
          </Panel>
```

Add immediately after this `Panel`:

```tsx

          <Panel position="top-center">
            <DagDebugToolbar />
          </Panel>
```

- [ ] **Step 4: Verify it compiles**

Run: `npm run compile`
Expected: no errors.

- [ ] **Step 5: Build the webview bundle and manually verify**

Run: `npm run build:webview`
Expected: webpack succeeds, `dist/webview.js` is regenerated.

Then launch the Extension Development Host (F5), open a `.flow` file, enable DAG Debug Mode (`reactdnd.enableDagDebugMode`). Confirm:
1. The toolbar appears top-center once debug mode is enabled, and disappears when disabled.
2. Continue/Step buttons are disabled until a `BREAKPOINT_HIT`/`PAUSED` event arrives (i.e. `isPaused` is initially `false`), Pause is enabled.
3. Clicking a button does not throw in the webview devtools console (Command Palette → "Developer: Open Webview Developer Tools").

- [ ] **Step 6: Commit**

```bash
git add webview-src/components/DagDebugToolbar.tsx webview-src/styles/index.css webview-src/App.tsx
git commit -m "feat(dag-debug): add Continue/Pause/Step/Stop/Restart toolbar to the flow canvas"
```

---

### Task 7: Instantiate `LocalDagDebugAgent` and keep its breakpoint map in sync

**Files:**
- Modify: `src/DagDebugService.ts` (constructor, `dispose`, `setBreakpoint`, `removeBreakpoint`, `applySessionToFlowBreakpoints`)

**Interfaces:**
- Consumes: `LocalDagDebugAgent` (`src/LocalDagDebugAgent.ts`, already fully implemented — `start()`, `dispose()`, `upsertBreakpoint(bp: DagBreakpoint)`, `removeBreakpoint(input)`).
- Produces: the local agent HTTP server (port from `dagDebug.localAgentUrl`, default `127.0.0.1:9240`) is now actually listening whenever the extension activates, and its in-memory breakpoint map mirrors whatever `DagDebugService.breakpoints` holds.

- [ ] **Step 1: Import and instantiate**

Find the top of `src/DagDebugService.ts`:

```ts
import { DagBreakpoint, DagCommandType, DagDebugConfig, DagDebugEventEnvelope, breakpointKey } from './dagDebugTypes';
import { OrchestratorClient } from './OrchestratorClient';
import { SocketIoDagDebugBridge } from './SocketIoDagDebugBridge';
```

Add:

```ts
import { LocalDagDebugAgent } from './LocalDagDebugAgent';
```

Find the constructor:

```ts
  private sessionId: string | undefined;
  private activeFlowId: string | undefined;
  private activeFlowRunId: string | undefined;

  constructor(private readonly context: vscode.ExtensionContext) {
    const config = this.readConfig();
    this.client = new OrchestratorClient(config.orchestratorUrl);
    this.socketBridge = new SocketIoDagDebugBridge(config, this.output, (event) => this.handleDebugEvent(event));
    this.socketBridge.setActiveWorkspace(config.workspaceId);
    this.context.subscriptions.push(this.output);
    this.socketBridge.connect();
  }
```

Replace with:

```ts
  private sessionId: string | undefined;
  private activeFlowId: string | undefined;
  private activeFlowRunId: string | undefined;
  private readonly localAgent: LocalDagDebugAgent;

  constructor(private readonly context: vscode.ExtensionContext) {
    const config = this.readConfig();
    this.client = new OrchestratorClient(config.orchestratorUrl);
    this.socketBridge = new SocketIoDagDebugBridge(config, this.output, (event) => this.handleDebugEvent(event));
    this.socketBridge.setActiveWorkspace(config.workspaceId);
    this.context.subscriptions.push(this.output);
    this.socketBridge.connect();

    this.localAgent = new LocalDagDebugAgent(config, this.client, this.output, (event) => this.handleDebugEvent(event));
    void this.localAgent.start().catch((err: Error) => {
      this.output.appendLine(`[dag-debug] local agent failed to start: ${err.message}`);
    });
  }
```

- [ ] **Step 2: Dispose it**

Find:

```ts
  dispose(): void {
    this.socketBridge.dispose();
  }
```

Replace with:

```ts
  dispose(): void {
    this.socketBridge.dispose();
    this.localAgent.dispose();
  }
```

- [ ] **Step 3: Mirror breakpoint upserts into the local agent**

Find (inside `setBreakpoint`):

```ts
    this.breakpoints.set(key, breakpoint);
    await this.syncFlowEngineBreakpoints(flowId);
    this.broadcastState();
  }
```

(the one inside `setBreakpoint`, not `removeBreakpoint` — check the surrounding `const breakpoint: DagBreakpoint = { ... }` a few lines above to confirm you're in the right method)

Replace with:

```ts
    this.breakpoints.set(key, breakpoint);
    this.localAgent.upsertBreakpoint(breakpoint);
    await this.syncFlowEngineBreakpoints(flowId);
    this.broadcastState();
  }
```

- [ ] **Step 4: Mirror breakpoint removals into the local agent**

Find `removeBreakpoint`:

```ts
  async removeBreakpoint(document: vscode.TextDocument, input: { nodeId: string }): Promise<void> {
    const flowId = this.flowIdForDocument(document);
    const key = breakpointKey(flowId, input.nodeId);
    const existing = this.breakpoints.get(key);
    this.breakpoints.delete(key);
    await this.syncFlowEngineBreakpoints(flowId);
    this.broadcastState();
  }
```

Replace with:

```ts
  async removeBreakpoint(document: vscode.TextDocument, input: { nodeId: string }): Promise<void> {
    const flowId = this.flowIdForDocument(document);
    const key = breakpointKey(flowId, input.nodeId);
    const existing = this.breakpoints.get(key);
    this.breakpoints.delete(key);
    this.localAgent.removeBreakpoint({ flowId, nodeId: input.nodeId, breakpointId: existing?.id });
    await this.syncFlowEngineBreakpoints(flowId);
    this.broadcastState();
  }
```

- [ ] **Step 5: Mirror session/verified updates into the local agent**

Find `applySessionToFlowBreakpoints`:

```ts
  private applySessionToFlowBreakpoints(flowId: string, sessionId: string, service: string, verified: boolean): void {
    for (const bp of this.breakpoints.values()) {
      if (bp.flowId !== flowId) { continue; }
      bp.sessionId = sessionId;
      bp.workspaceId = this.readConfig().workspaceId;
      bp.service = service;
      bp.verified = verified;
    }
  }
```

Replace with:

```ts
  private applySessionToFlowBreakpoints(flowId: string, sessionId: string, service: string, verified: boolean): void {
    for (const bp of this.breakpoints.values()) {
      if (bp.flowId !== flowId) { continue; }
      bp.sessionId = sessionId;
      bp.workspaceId = this.readConfig().workspaceId;
      bp.service = service;
      bp.verified = verified;
      this.localAgent.upsertBreakpoint(bp);
    }
  }
```

- [ ] **Step 6: Verify it compiles**

Run: `npm run compile`
Expected: no errors.

- [ ] **Step 7: Manual smoke test**

1. Launch the Extension Development Host (F5).
2. Open the extension's Output panel, select the "DAG Flow Debug" channel.
3. Confirm a line like `[dag-debug] local agent listening on 127.0.0.1:9240` appears on activation (previously nothing printed because the agent was never constructed).
4. `curl http://127.0.0.1:9240/api/v1/health` from a terminal — confirm it returns `{"ok":true,"service":"dag-flow-service","runtime":"dag",...}` instead of connection-refused.
5. Set a breakpoint on a node in a `.flow` file, then repeat the `curl` — confirm `breakpoints` in the health response is now `1`.

- [ ] **Step 8: Commit**

```bash
git add src/DagDebugService.ts
git commit -m "fix(dag-debug): instantiate LocalDagDebugAgent and keep its breakpoint map in sync"
```

---

### Task 8: Use `dagDebug.flowEngineUrl` instead of hardcoded `localhost:3000`

**Files:**
- Modify: `src/FlowEditorProvider.ts` (`handleStartFlow`, `fetchFlowsFromEngine`, new `flowEngineBaseUrl`/`postToFlowEngine` helpers)

**Interfaces:**
- Produces: `private flowEngineBaseUrl(): string` (reads `dagDebug.flowEngineUrl`, falls back to `http://localhost:3000` — same default as today, so behavior is unchanged unless the user has customized the setting) and `private postToFlowEngine(path: string, body: string): Promise<string>`.

- [ ] **Step 1: Add the config-aware helpers**

Add these private methods to `FlowEditorProvider` (near `fetchFlowsFromEngine`):

```ts
  private flowEngineBaseUrl(): string {
    return vscode.workspace.getConfiguration('dagDebug').get<string>('flowEngineUrl') || 'http://localhost:3000';
  }

  private postToFlowEngine(path: string, body: string): Promise<string> {
    const base = new URL(this.flowEngineBaseUrl());
    const transport = base.protocol === 'https:' ? https : http;
    return new Promise<string>((resolve, reject) => {
      const req = transport.request(
        {
          hostname: base.hostname,
          port: base.port ? Number(base.port) : (base.protocol === 'https:' ? 443 : 80),
          path,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(body),
          },
        },
        (res) => {
          let data = '';
          res.on('data', (chunk: Buffer) => { data += chunk.toString(); });
          res.on('end', () => resolve(data));
        }
      );
      req.on('error', reject);
      req.write(body);
      req.end();
    });
  }
```

- [ ] **Step 2: Use it in `handleStartFlow`**

Find (near the end of `handleStartFlow`):

```ts
    // 3. POST to http://localhost:3000/flow/run
    const body = JSON.stringify(flowData);
    const result = await new Promise<string>((resolve, reject) => {
      const req = http.request(
        {
          hostname: 'localhost',
          port: 3000,
          path: '/flow/run',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(body),
          },
        },
        (res) => {
          let data = '';
          res.on('data', (chunk: Buffer) => { data += chunk.toString(); });
          res.on('end', () => resolve(data));
        }
      );
      req.on('error', reject);
      req.write(body);
      req.end();
    }).catch((err: Error) => `Error: ${err.message}`);
```

Replace with:

```ts
    // 3. POST to the configured flow engine's /flow/run
    const body = JSON.stringify(flowData);
    const result = await this.postToFlowEngine('/flow/run', body).catch((err: Error) => `Error: ${err.message}`);
```

- [ ] **Step 3: Use it in `fetchFlowsFromEngine`**

Find:

```ts
  private fetchFlowsFromEngine(): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const req = http.request(
        {
          hostname: 'localhost',
          port: 3000,
          path: '/flows',
          method: 'GET',
          timeout: 5000,
        },
        (res) => {
          let out = '';
          res.on('data', (chunk: Buffer) => { out += chunk.toString(); });
          res.on('end', () => {
            if ((res.statusCode ?? 500) >= 400) {
              reject(new Error(`HTTP ${res.statusCode ?? 500}`));
              return;
            }
            try {
              resolve(JSON.parse(out));
            } catch {
              resolve({ success: false, flows: [] });
            }
          });
        }
      );
      req.on('timeout', () => req.destroy(new Error('Request timeout')));
      req.on('error', reject);
      req.end();
    });
  }
```

Replace with:

```ts
  private fetchFlowsFromEngine(): Promise<unknown> {
    const base = new URL(this.flowEngineBaseUrl());
    const transport = base.protocol === 'https:' ? https : http;
    return new Promise((resolve, reject) => {
      const req = transport.request(
        {
          hostname: base.hostname,
          port: base.port ? Number(base.port) : (base.protocol === 'https:' ? 443 : 80),
          path: '/flows',
          method: 'GET',
          timeout: 5000,
        },
        (res) => {
          let out = '';
          res.on('data', (chunk: Buffer) => { out += chunk.toString(); });
          res.on('end', () => {
            if ((res.statusCode ?? 500) >= 400) {
              reject(new Error(`HTTP ${res.statusCode ?? 500}`));
              return;
            }
            try {
              resolve(JSON.parse(out));
            } catch {
              resolve({ success: false, flows: [] });
            }
          });
        }
      );
      req.on('timeout', () => req.destroy(new Error('Request timeout')));
      req.on('error', reject);
      req.end();
    });
  }
```

- [ ] **Step 4: Verify it compiles**

Run: `npm run compile`
Expected: no errors.

- [ ] **Step 5: Manual smoke test**

1. Launch the Extension Development Host (F5) with default settings — confirm "Start Flow" and the CallNode's target-flow picker still work exactly as before (both still hit `localhost:3000` by default).
2. In the Extension Development Host's settings, set `dagDebug.flowEngineUrl` to `http://localhost:3999` (a port nothing listens on).
3. Trigger "Start Flow" — confirm the error notification now reflects a connection failure to `3999`, proving the setting is actually being read.
4. Revert the setting.

- [ ] **Step 6: Commit**

```bash
git add src/FlowEditorProvider.ts
git commit -m "fix(config): read dagDebug.flowEngineUrl instead of hardcoding localhost:3000"
```

---

### Task 9: Remove dead `PipeletExplorerViewProvider.ts`

**Files:**
- Delete: `src/PipeletExplorerViewProvider.ts`

**Interfaces:**
- None — verified below that nothing imports this file.

- [ ] **Step 1: Confirm it's unreferenced**

Run: `grep -rn "PipeletExplorerViewProvider" src/ webview-src/ package.json`
Expected: only self-references inside `src/PipeletExplorerViewProvider.ts` itself (its own class name/`viewType` constant). The `reactdnd.pipeletExplorerView` **view id** in `package.json` stays — it's registered against `PipeletTreeViewProvider` in `src/extension.ts`, which is the live implementation; only the unused duplicate provider class is being removed.

- [ ] **Step 2: Delete the file**

```bash
git rm src/PipeletExplorerViewProvider.ts
```

- [ ] **Step 3: Verify it compiles**

Run: `npm run compile`
Expected: no errors (confirms nothing referenced it).

- [ ] **Step 4: Commit**

```bash
git commit -m "chore: remove unused PipeletExplorerViewProvider (superseded by PipeletTreeViewProvider)"
```

---

## Post-plan: update the analysis doc and Obsidian note

After all tasks land, both `docs/extension-architecture-analysis.md` (this repo) and `~/Development/obsidian/multi-tanent-platform-k8s/React Flow Node Editor/Extension Mimari Analizi ve Yol Haritası.md` should have their §6 roadmap table and R1/R2/R3/R4/R5/R8/R10 rows annotated as resolved, with a short note that §5.3/§5.4 (Node Type Registry, `flowId+version` sub-flow refs) remain open because they require the external Flow Engine to change. This is a documentation update, not a code task — do it by hand once the above compiles and the manual smoke tests pass.
