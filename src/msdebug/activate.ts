import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { BreakpointDto, OrchestratorClient } from './orchestrator-client';
import { SessionItem, SessionsTreeProvider } from './tree/sessions-tree';
import { BreakpointsTreeProvider } from './tree/breakpoints-tree';
import { TracesTreeProvider } from './tree/traces-tree';
import { VariablesTreeProvider } from './tree/variables-tree';
import { DebugEventBridge } from './debug-event-bridge';
import { MsDebugAdapter, MsDebugSessionController, MsDebugInlineValuesProvider } from './msdebug-debug-adapter';

let client: OrchestratorClient;
let eventBridge: DebugEventBridge;
const distributedBreakpointByEditorKey = new Map<string, string>();
const recentBreakpointEvents = new Map<string, number>();
const BREAKPOINT_DEDUPE_WINDOW_MS = 1200;
const BREAKPOINT_SYNC_RETRY_DELAY_MS = 1200;
const BREAKPOINT_SYNC_MAX_RETRIES = 8;
type SupportedRuntime = 'java' | 'nodejs';
type AgentDebugState = 'idle' | 'active' | 'debugging';
const agentStateCache = new Map<string, AgentDebugState>();
const sessionToServiceMap = new Map<string, string>();

interface DistributedEditorBreakpoint {
  editorBreakpoint: vscode.SourceBreakpoint;
  file: string;
  line: number;
}

export function activateMsDebug(context: vscode.ExtensionContext): void {
  const workspaceId = getWorkspaceId();
  const config = vscode.workspace.getConfiguration('msdebug');
  const orchestratorUrl = config.get<string>('orchestratorUrl', 'http://localhost:4000/api/v1');
  const wsUrl = config.get<string>('orchestratorWsUrl', 'http://localhost:4000');
  const configuredService = (config.get<string>('defaultService', 'auto') ?? '').trim();
  const hasPinnedService = configuredService.length > 0 && configuredService.toLowerCase() !== 'auto';
  const workspaceServiceHints = getWorkspaceServiceHints();
  const workspaceRuntimeHint = getWorkspaceRuntimeHint();
  const hasWorkspaceServiceLock = workspaceServiceHints.length > 0;
  let discoveredService: string | undefined;
  const shouldAcceptAutoService = (service: string): boolean => {
    if (hasPinnedService) return false;
    if (!hasWorkspaceServiceLock) return true;
    return workspaceServiceHints.includes(service.toLowerCase());
  };
  const getTargetService = (): string => {
    if (hasPinnedService) return configuredService;
    return discoveredService ?? '';
  };
  let bootstrapSessionInFlight = false;
  let bootstrapSessionDone = false;
  let breakpointSyncRetriesLeft = 0;
  let breakpointSyncTimer: NodeJS.Timeout | undefined;
  let breakpointSyncInFlight = false;
  let pendingInitialEditorBreakpoints = false;
  let lastSyncedSessionId: string | undefined;
  const ownedSessionIds = new Set<string>();
  let sessionWatchInFlight = false;
  let nextSyncForceRepropagation = false;
  let activationSessionRebindInFlight = false;

  client = new OrchestratorClient(orchestratorUrl);
  eventBridge = new DebugEventBridge(wsUrl);

  // ── Tree Views ──────────────────────────────────────────────────────────
  const sessionsProvider = new SessionsTreeProvider(client, getTargetService, () => workspaceId, () => agentStateCache);
  const breakpointsProvider = new BreakpointsTreeProvider(client, getTargetService, () => workspaceId);
  const tracesProvider = new TracesTreeProvider(getTargetService, () => workspaceId);
  const variablesProvider = new VariablesTreeProvider();

  context.subscriptions.push(
    vscode.window.registerTreeDataProvider('msDebugSessions', sessionsProvider),
    vscode.window.registerTreeDataProvider('msDebugBreakpoints', breakpointsProvider),
    vscode.window.registerTreeDataProvider('msDebugTraces', tracesProvider),
    vscode.window.registerTreeDataProvider('msDebugVariables', variablesProvider),
  );

  // ── Event Bridge Updates ────────────────────────────────────────────────
  const output = vscode.window.createOutputChannel('MS Distributed Debugger');
  context.subscriptions.push(output);
  const debugSessionController = new MsDebugSessionController(client, output);

  // Register inline values provider for modern VS Code versions
  // Use '*' selector to cover all languages including plaintext fallback
  const inlineValuesProvider = new MsDebugInlineValuesProvider(debugSessionController, output);
  context.subscriptions.push(
    vscode.languages.registerInlineValuesProvider('*', inlineValuesProvider),
  );

  // Manual inline values using decorations (fallback for when provider doesn't work)
  const inlineDecorationType = vscode.window.createTextEditorDecorationType({
    after: {
      color: new vscode.ThemeColor('editorCodeLens.foreground'),
      fontStyle: 'italic',
      margin: '0 0 0 1em',
    },
  });

  // Store last inline values to persist after continue
  let lastInlineValues: { line: number; file: string; variables: Array<{ name: string; value: string }> } | undefined;

  const updateInlineDecorations = (): void => {
    const stop = debugSessionController.getActiveStop();
    
    // Update stored values if we have a new stop
    if (stop && stop.variables && stop.variables.length > 0) {
      lastInlineValues = {
        line: stop.line,
        file: stop.file,
        variables: stop.variables.map(v => ({ name: v.name, value: v.value })),
      };
    }
    
    // Use stored values if no active stop (after continue)
    const valuesToShow = lastInlineValues;
    
    if (!valuesToShow) {
      // Clear all editors
      for (const editor of vscode.window.visibleTextEditors) {
        editor.setDecorations(inlineDecorationType, []);
      }
      return;
    }

    // Find the editor for the stopped file
    const stoppedLine = valuesToShow.line - 1;
    const decorations: vscode.DecorationOptions[] = [];

    for (const variable of valuesToShow.variables) {
      const range = new vscode.Range(stoppedLine, 1000, stoppedLine, 1000);
      decorations.push({
        range,
        renderOptions: {
          after: {
            contentText: `  ${variable.name} = ${variable.value}`,
          },
        },
      });
    }

    // Match editor to stopped file using multiple strategies
    const stopFile = valuesToShow.file;
    const stopFileBaseName = (stopFile.split('/').pop() || stopFile).replace(/\.[^/.]+$/, '');
    // Also handle Java FQCN: com.example.UserController -> UserController
    const stopFileClassName = stopFile.includes('.') && !stopFile.includes('/') 
      ? stopFile.split('.').pop() || stopFile 
      : stopFileBaseName;
    
    // Apply to all visible editors that match the file
    let applied = false;
    for (const editor of vscode.window.visibleTextEditors) {
      const editorPath = editor.document.uri.fsPath;
      const editorFileName = editorPath.split('/').pop() || '';
      const editorBaseName = editorFileName.replace(/\.[^/.]+$/, ''); // Remove extension
      
      // Match strategies:
      // 1. Exact path match (stopFile is a full path)
      // 2. Base name match (UserController === UserController)
      // 3. Path contains match
      const isMatch = 
        editorPath === stopFile ||
        editorBaseName === stopFileBaseName ||
        editorBaseName === stopFileClassName ||
        editorPath.includes(stopFile) ||
        (stopFile.length > 5 && stopFile.includes(editorBaseName));
      
      if (isMatch) {
        editor.setDecorations(inlineDecorationType, decorations);
        output.appendLine(`[msdebug:inline] Updated ${decorations.length} inline decorations at line ${stoppedLine} in ${editorPath} (matched: ${editorBaseName} ~ ${stopFileBaseName})`);
        applied = true;
      }
    }
    
    // Fallback to active editor if no match found
    if (!applied && vscode.window.activeTextEditor) {
      vscode.window.activeTextEditor.setDecorations(inlineDecorationType, decorations);
      output.appendLine(`[msdebug:inline] Updated ${decorations.length} inline decorations at line ${stoppedLine} in active editor (fallback)`);
    }
  };

  const clearInlineDecorations = (): void => {
    lastInlineValues = undefined;
    // Clear decorations from all visible editors
    for (const editor of vscode.window.visibleTextEditors) {
      editor.setDecorations(inlineDecorationType, []);
    }
    output.appendLine(`[msdebug:inline] Cleared inline decorations`);
  };

  // Clear all debug state (queue, inline values, status bar)
  const clearAllDebugState = (): void => {
    clearInlineDecorations();
    activeSessionBar.hide();
    output.appendLine(`[msdebug] Cleared all debug state`);
  };

  // Update decorations when debug state changes
  const originalShowStop = debugSessionController.showStop.bind(debugSessionController);
  debugSessionController.showStop = async (stop) => {
    await originalShowStop(stop);
    inlineValuesProvider.notifyChange();
    setTimeout(updateInlineDecorations, 100);
  };

  // Keep inline decorations after continue/step (they should persist until next breakpoint or session end)
  const originalResume = debugSessionController.resume.bind(debugSessionController);
  debugSessionController.resume = async (command) => {
    await originalResume(command);
    // Clear inline values after continue/step - they should only show on breakpoint hits
    lastInlineValues = undefined;
    clearInlineDecorations();
  };

  // Also update when active editor changes
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(() => {
      setTimeout(updateInlineDecorations, 50);
    }),
  );

  context.subscriptions.push(
    vscode.debug.registerDebugAdapterDescriptorFactory('msdebug', {
      createDebugAdapterDescriptor: () => {
        const adapter = new MsDebugAdapter(debugSessionController);
        debugSessionController.attachAdapter(adapter);
        return new vscode.DebugAdapterInlineImplementation(adapter);
      },
    }),
    vscode.debug.onDidTerminateDebugSession((session) => {
      if (session.type === 'msdebug') {
        output.appendLine('[msdebug] Debug Toolbar session terminated');
        debugSessionController.clearQueuedStops();
        clearAllDebugState();
      }
    }),
    // Auto-enable inline values when debug session starts
    vscode.debug.onDidStartDebugSession((session) => {
      if (session.type === 'msdebug') {
        output.appendLine('[msdebug] Debug session started - enabling inline values');
        // Enable inline values automatically
        vscode.workspace.getConfiguration('debug').update('inlineValues', 'on', vscode.ConfigurationTarget.Global);
      }
    }),
  );

  // Event-driven session updates via WebSocket (no polling needed)
  // Initial session sync happens on activation, then updates come from events
  const watchActiveSessionAndSync = async (): Promise<void> => {
    if (sessionWatchInFlight) return;
    sessionWatchInFlight = true;
    try {
      const active = await client.getActiveSession(getTargetService(), workspaceId);
      if (!active) return;
      ownedSessionIds.add(active.id);
      if (active.id !== lastSyncedSessionId) {
        lastSyncedSessionId = active.id;
        pendingInitialEditorBreakpoints = vscode.debug.breakpoints.length > 0;
        requestEditorBreakpointResync('session-activated');
      }
    } catch {
      // Ignore transient connectivity issues; next event will retry.
    } finally {
      sessionWatchInFlight = false;
    }
  };

  // Initial sync on activation
  void watchActiveSessionAndSync();

  const requestEditorBreakpointResync = (reason: string, resetRetries = true): void => {
    if (resetRetries) {
      breakpointSyncRetriesLeft = BREAKPOINT_SYNC_MAX_RETRIES;
    }
    if (breakpointSyncTimer || breakpointSyncInFlight) return;

    breakpointSyncTimer = setTimeout(() => {
      void (async () => {
        breakpointSyncTimer = undefined;
        if (breakpointSyncInFlight) return;

        breakpointSyncInFlight = true;
        try {
          const applied = await syncEditorBreakpoints({
            added: vscode.debug.breakpoints,
            removed: [],
            changed: [],
          });

          if (!applied && breakpointSyncRetriesLeft > 0) {
            breakpointSyncRetriesLeft -= 1;
            requestEditorBreakpointResync(reason, false);
          } else if (!applied && pendingInitialEditorBreakpoints) {
            // Keep the pending flag so the next session/register/editor event can retry.
            output.appendLine('[msdebug] Deferred breakpoint sync pending JDWP/session readiness');
          }
        } finally {
          breakpointSyncInFlight = false;
        }
      })();
    }, BREAKPOINT_SYNC_RETRY_DELAY_MS);
  };

  const ensureFreshSessionForRegisteredAgent = async (): Promise<void> => {
    let targetService = getTargetService();
    if (!targetService && !hasPinnedService) {
      const discovered = await client.getPreferredService(workspaceServiceHints, workspaceRuntimeHint, workspaceId);
      if (discovered) {
        discoveredService = discovered;
        targetService = discovered;
        output.appendLine(`[msdebug] Auto-selected service ${discovered}${workspaceRuntimeHint ? ` for ${workspaceRuntimeHint} workspace` : ''}`);
      }
    }
    if (!targetService) {
      output.appendLine('[msdebug] Waiting for agent registration before session bootstrap');
      return;
    }

    if (bootstrapSessionInFlight) return;

    bootstrapSessionInFlight = true;
    try {
      const sessions = await client.listSessions();
      const activeForService = sessions
        .filter((s) => ['running', 'active', 'initializing', 'paused', 'stepping', 'replaying', 'stopping'].includes(s.status))
        .filter((s) => s.services.includes(targetService))
        .filter((s) => s.workspaceId === workspaceId)
        .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));

      if (activeForService.length > 0) {
        const primary = activeForService[0];
        for (const stale of activeForService.slice(1)) {
          try {
            await client.stopSession(stale.id);
          } catch (err) {
            output.appendLine(`[msdebug] Failed to stop old session ${stale.id.slice(0, 8)}: ${String(err)}`);
          }
        }

        if (!bootstrapSessionDone) {
          lastSyncedSessionId = primary.id;
          ownedSessionIds.add(primary.id);
          sessionsProvider.refresh();
          breakpointsProvider.refresh();
          // Session already has DB breakpoints but JVM may have restarted → force re-propagation
          nextSyncForceRepropagation = true;
          requestEditorBreakpointResync('session-bootstrap');
          output.appendLine(`[msdebug] Reusing active session ${primary.id.slice(0, 8)} for ${targetService}`);
          bootstrapSessionDone = true;
        }
        return;
      }

      // No active session — wait for user to manually create one
      output.appendLine(`[msdebug] No active session for ${targetService} — use "Select Agent" or "Start Session" to create one`);
    } catch (err) {
      output.appendLine(`[msdebug] Auto-session bootstrap skipped: ${String(err)}`);
    } finally {
      bootstrapSessionInFlight = false;
    }
  };

  const rebindSessionsForActiveAgents = async (reason: string): Promise<void> => {
    if (activationSessionRebindInFlight) return;
    activationSessionRebindInFlight = true;
    try {
      const agents = await client.listAgents(workspaceId);
      if (!agents.length) {
        output.appendLine(`[msdebug] No active agents for session rebind (${reason})`);
        return;
      }

      const services = Array.from(new Set(agents.map((agent) => agent.service).filter(Boolean)));
      const sessions = await client.listSessions();
      const activeStatuses = new Set(['running', 'active', 'initializing', 'paused', 'stepping', 'replaying', 'stopping']);

      for (const service of services) {
        const existing = sessions
          .filter((session) => session.workspaceId === workspaceId)
          .filter((session) => session.services.includes(service))
          .filter((session) => activeStatuses.has(session.status))
          .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));

        for (const stale of existing) {
          try {
            await client.stopSession(stale.id);
            ownedSessionIds.delete(stale.id);
            output.appendLine(`[msdebug] Stopped stale session ${stale.id.slice(0, 8)} for ${service} (${reason})`);
          } catch (err) {
            output.appendLine(`[msdebug] Failed to stop stale session ${stale.id.slice(0, 8)} for ${service}: ${String(err)}`);
          }
        }

        try {
          const session = await client.startSession({
            name: service,
            services: [service],
            workspaceId,
          });
          ownedSessionIds.add(session.id);
          lastSyncedSessionId = session.id;
          output.appendLine(`[msdebug] Created fresh session ${session.id.slice(0, 8)} for ${service} (${reason})`);
        } catch (err) {
          output.appendLine(`[msdebug] Failed to create fresh session for ${service}: ${String(err)}`);
        }
      }

      nextSyncForceRepropagation = true;
      pendingInitialEditorBreakpoints = vscode.debug.breakpoints.length > 0;
      requestEditorBreakpointResync(`session-rebind:${reason}`);
      sessionsProvider.refresh();
      breakpointsProvider.refresh();
      tracesProvider.refresh();
    } finally {
      activationSessionRebindInFlight = false;
    }
  };

  void rebindSessionsForActiveAgents('activation');

  // Log every event to the output channel
  eventBridge.onStatus((message) => {
    output.appendLine(`[msdebug:ws] ${message}`);
  });

  eventBridge.onAnyEvent((evt) => {
    // Agent state changes via WebSocket events - handle BEFORE workspace filter
    // so state updates are not blocked by workspace/session filtering
    
    // Track sessionId → service mapping from session.started events
    if (evt.type === 'debug.session.started') {
      const data = evt.data as any;
      const services = data?.services ?? [];
      const sessionId = evt.sessionId;
      if (sessionId && services.length > 0) {
        const service = services[0];
        sessionToServiceMap.set(sessionId, service);
        output.appendLine(`[msdebug:state] Mapped session ${sessionId.slice(0, 8)} → service ${service}`);
      }
    }
    
    if (evt.type === 'debug.breakpoint.hit' || evt.type === 'debug.execution.paused') {
      const service = (evt.data as any)?.service ?? evt.service;
      if (service) {
        agentStateCache.set(service, 'debugging');
        output.appendLine(`[msdebug:state] ${service}: → debugging`);
        sessionsProvider.refresh();
      }
    }
    if (evt.type === 'debug.execution.resumed' || evt.type === 'debug.execution.stepped') {
      const service = (evt.data as any)?.service ?? evt.service;
      if (service) {
        agentStateCache.set(service, 'active');
        output.appendLine(`[msdebug:state] ${service}: → active`);
        sessionsProvider.refresh();
      }
    }
    if (evt.type === 'debug.session.started') {
      const data = evt.data as any;
      const services = data?.services ?? [];
      if (services.length > 0) {
        const service = services[0];
        agentStateCache.set(service, 'active');
        output.appendLine(`[msdebug:state] ${service}: → active (session started)`);
        sessionsProvider.refresh();
      }
    }
    if (evt.type === 'flow.agent.status') {
      const data = evt.data as any;
      const service: string | undefined = data?.service ?? evt.service;
      const status: string | undefined = data?.status;
      if (service && (status === 'WARM_IDLE' || status === 'COLD_IDLE')) {
        agentStateCache.set(service, 'idle');
        output.appendLine(`[msdebug:state] ${service}: → idle (FaaS ${status})`);
        sessionsProvider.refresh();
      }
    }
    if (evt.type === 'debug.execution.terminated' || evt.type === 'debug.session.stopped') {
      // Try to get service from event data first, then from sessionId mapping
      let service = (evt.data as any)?.service ?? evt.service;
      if (!service && evt.sessionId) {
        service = sessionToServiceMap.get(evt.sessionId);
        output.appendLine(`[msdebug:state] Resolved service ${service} from sessionId ${evt.sessionId.slice(0, 8)}`);
      }
      if (service) {
        agentStateCache.set(service, 'idle');
        output.appendLine(`[msdebug:state] ${service}: → idle`);
        sessionsProvider.refresh();
        // Clean up mapping
        if (evt.sessionId) {
          sessionToServiceMap.delete(evt.sessionId);
        }
      } else {
        output.appendLine(`[msdebug:state] WARNING: Cannot resolve service for ${evt.type} (sessionId: ${evt.sessionId?.slice(0, 8) ?? 'none'})`);
      }
    }

    if (!isEventForWorkspace(evt, workspaceId, ownedSessionIds)) return;

    tracesProvider.addEvent(evt);

    const ts = new Date(evt.timestamp).toISOString();
    const trace = evt.traceId ? ` trace=${evt.traceId.slice(0, 8)}` : '';
    const session = evt.sessionId ? ` session=${evt.sessionId.slice(0, 8)}` : '';
    output.appendLine(`[${ts}] ${evt.type}${trace}${session}`);
    try {
      output.appendLine('  ' + JSON.stringify(evt.data));
    } catch {
      /* ignore */
    }

    if (evt.type === 'debug.session.started') {
      const started = (evt.data ?? {}) as { sessionId?: string; services?: string[]; workspaceId?: string };
      if (started.workspaceId !== workspaceId) return;
      const service = started.services?.[0];
      if (service && !hasPinnedService && !shouldAcceptAutoService(service)) {
        output.appendLine(`[msdebug] Ignoring session for ${service}; workspace target hint is ${workspaceServiceHints.join(', ')}`);
        return;
      }
      if (service && shouldAcceptAutoService(service)) {
        discoveredService = service;
      }
      if (started.sessionId) {
        ownedSessionIds.add(started.sessionId);
        lastSyncedSessionId = started.sessionId;
        bootstrapSessionDone = true;
        pendingInitialEditorBreakpoints = vscode.debug.breakpoints.length > 0;
        sessionsProvider.refresh();
      }
    }

    if (evt.type === 'debug.session.stopped' && evt.sessionId) {
      ownedSessionIds.delete(evt.sessionId);
      if (lastSyncedSessionId === evt.sessionId) {
        lastSyncedSessionId = undefined;
      }
    }

    if (evt.type === 'agent.registered') {
      const registered = (evt.data ?? {}) as { service?: string };
      if (registered.service && !hasPinnedService && !shouldAcceptAutoService(registered.service)) {
        output.appendLine(`[msdebug] Ignoring agent ${registered.service}; workspace target hint is ${workspaceServiceHints.join(', ')}`);
        return;
      }
      if (registered.service && shouldAcceptAutoService(registered.service)) {
        discoveredService = registered.service;
        output.appendLine(`[msdebug] Agent registered: ${registered.service} (rebinding sessions)`);
      }
      void rebindSessionsForActiveAgents('agent-registered');
    }

    if (evt.type === 'agent.unregistered') {
      const service = (evt.data as any)?.service ?? evt.service;
      if (service) agentStateCache.delete(service);
      breakpointsProvider.refresh();
      sessionsProvider.refresh();
    }

    if (evt.type === 'agent.breakpoint.registered' || evt.type === 'agent.breakpoint.removed') {
      breakpointsProvider.refresh();
      sessionsProvider.refresh();
    }
  });

  eventBridge.onBreakpointHit(async (evt) => {
    const d = (evt.data ?? {}) as {
      file?: string;
      line?: number;
      threadName?: string;
      service?: string;
      stackFrames?: Array<{ name: string; line: number; source?: { path?: string } }>;
      variables?: Array<{ name: string; value: string; type?: string }>;
    };
    const service = d.service ?? evt.service ?? getTargetService();
    const firstFrame = d.stackFrames?.[0];
    const file = d.file ?? firstFrame?.source?.path ?? '';
    const line = (d.line && d.line > 0) ? d.line : ((firstFrame?.line ?? 0) > 0 ? firstFrame!.line : 0);
    const where = file ? `${file.split('/').pop()}:${line}` : 'unknown location';

    const sessionId = await resolveOwnedBreakpointSessionId(evt, workspaceId, ownedSessionIds, client);
    if (!sessionId) {
      output.appendLine(`[msdebug] ⚠️ Breakpoint hit but no session found for ${service} in workspace ${workspaceId}`);
      return;
    }

    sessionsProvider.refresh();
    breakpointsProvider.refresh();
    tracesProvider.refresh();

    const traceId = evt.traceId && evt.traceId.length >= 8 ? evt.traceId : '';

    // The backend may emit both debug.breakpoint.hit and debug.execution.paused
    // for the same stop event. Coalesce them into one user-facing notification.
    // Use location as part of the key so consecutive breakpoints on the same thread
    // still produce separate user prompts.
    const eventTs = Number(evt.timestamp) || Date.now();
    const dedupeKey = `${sessionId}|${service}|${d.threadName ?? ''}|${file}|${line}`;
    const lastTs = recentBreakpointEvents.get(dedupeKey);
    if (lastTs && Math.abs(eventTs - lastTs) <= BREAKPOINT_DEDUPE_WINDOW_MS) {
      return;
    }
    recentBreakpointEvents.set(dedupeKey, eventTs);
    if (recentBreakpointEvents.size > 200) {
      for (const [key, ts] of recentBreakpointEvents) {
        if (eventTs - ts > BREAKPOINT_DEDUPE_WINDOW_MS * 20) {
          recentBreakpointEvents.delete(key);
        }
      }
    }

    // Show notification AFTER dedupe check to avoid duplicate notifications
    void vscode.window.showInformationMessage(
      `🔴 Breakpoint hit: ${service} at ${where}`,
      'Open File',
      'Continue'
    ).then(async (action) => {
      if (action === 'Open File' && file && line) {
        await openFileAtLine(file, line);
      } else if (action === 'Continue') {
        try {
          await debugSessionController.resume('continue');
          output.appendLine(`[msdebug] ▶️ Continue sent for session=${sessionId}, service=${service}`);
        } catch (err) {
          output.appendLine(`[msdebug] ❌ Continue failed: ${String(err)}`);
          void vscode.window.showErrorMessage(`Continue failed: ${String(err)}`);
        }
      }
    });

    // 1. Open the file in the editor at the breakpoint line
    let resolvedFilePath = file;
    if (file && line) {
      await openFileAtLine(file, line);
      // Get the actual file path from the opened editor
      const activeEditor = vscode.window.activeTextEditor;
      if (activeEditor) {
        resolvedFilePath = activeEditor.document.uri.fsPath;
        output.appendLine(`[msdebug] Resolved file path: ${resolvedFilePath}`);
      }
    }

    // 2. Fetch variables and log everything to the output channel
    const ts = new Date(evt.timestamp).toISOString();
    output.appendLine(`\n[${ts}] 🔴 BREAKPOINT HIT — ${service} at ${where} [thread: ${d.threadName ?? '?'}]`);

    if (d.stackFrames?.length) {
      output.appendLine('  Stack:');
      d.stackFrames.slice(0, 5).forEach((f, i) => {
        output.appendLine(`    ${i}. ${f.name} @ ${f.source?.path ?? '?'}:${f.line}`);
      });
    }

    // Use variables from event if available, otherwise fetch from orchestrator
    const vars = d.variables?.length 
      ? d.variables.map(v => ({ 
          name: v.name, 
          value: v.value, 
          type: v.type ?? '', 
          variablesReference: (v as any).variablesReference 
        }))
      : await client.getVariables(sessionId, service, traceId);
    
    if (vars.length > 0) {
      output.appendLine('  Variables:');
      vars.forEach((v) => output.appendLine(`    ${v.type} ${v.name} = ${v.value}`));
    } else {
      output.appendLine('  Variables: (none available)');
    }
    // Populate the Variables panel
    variablesProvider.setClient(client);
    variablesProvider.setSession(sessionId, service, traceId);
    variablesProvider.setVariables(vars, where);

    try {
      await debugSessionController.showStop({
        sessionId,
        workspaceId,
        service,
        traceId,
        file: resolvedFilePath,
        line,
        threadName: d.threadName,
        stackFrames: d.stackFrames,
        variables: vars,
      });
      output.appendLine(`  Debug Toolbar paused [session=${sessionId}, service=${service}]`);
      updateActiveSessionBar();
      
      // Update inline decorations directly here (more reliable than wrapper)
      setTimeout(() => {
        updateInlineDecorations();
      }, 100);
    } catch (err) {
      output.appendLine(`  Debug Toolbar error: ${String(err)}`);
      void vscode.window.showErrorMessage(`MS Debugger: Failed to show Debug Toolbar stop - ${String(err)}`);
    }
  });

  eventBridge.onSpanEnded(() => {
    tracesProvider.refresh();
  });

  // ── Active Session Status Bar ────────────────────────────────────────────
  const activeSessionBar = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    90,
  );
  activeSessionBar.command = 'msdebug.selectActiveSession';
  activeSessionBar.tooltip = 'Select active debug session for Debug Toolbar';
  context.subscriptions.push(activeSessionBar);

  const updateActiveSessionBar = (): void => {
    const active = debugSessionController.getActiveStop();
    const queued = debugSessionController.getQueuedStops();
    if (!active) {
      activeSessionBar.hide();
      return;
    }
    const queuedLabel = queued.length > 0 ? ` (+${queued.length} queued)` : '';
    activeSessionBar.text = `$(debug-pause) ${active.service} @ ${active.file.split('/').pop()}:${active.line}${queuedLabel}`;
    activeSessionBar.backgroundColor = queued.length > 0
      ? new vscode.ThemeColor('statusBarItem.warningBackground')
      : undefined;
    activeSessionBar.show();
  };

  // ── Commands ─────────────────────────────────────────────────────────────
  context.subscriptions.push(
    vscode.commands.registerCommand('msdebug.selectActiveSession', async () => {
      const active = debugSessionController.getActiveStop();
      const queued = debugSessionController.getQueuedStops();
      if (!active && queued.length === 0) {
        void vscode.window.showInformationMessage('No paused debug sessions.');
        return;
      }
      type SessionPickItem = vscode.QuickPickItem & { sessionId: string; service: string };
      const items: SessionPickItem[] = [];
      if (active) {
        items.push({
          label: `$(debug-pause) ${active.service}`,
          description: `${active.file.split('/').pop()}:${active.line}`,
          detail: `session: ${active.sessionId.slice(0, 8)} — ACTIVE (Debug Toolbar)`,
          sessionId: active.sessionId,
          service: active.service,
        });
      }
      for (const stop of queued) {
        items.push({
          label: `$(circle-outline) ${stop.service}`,
          description: `${stop.file.split('/').pop()}:${stop.line}`,
          detail: `session: ${stop.sessionId.slice(0, 8)} — queued`,
          sessionId: stop.sessionId,
          service: stop.service,
        });
      }
      const picked = await vscode.window.showQuickPick(items, {
        placeHolder: 'Select which session to control with the Debug Toolbar',
        title: 'Active Debug Session',
      }) as SessionPickItem | undefined;
      if (!picked || picked.sessionId === active?.sessionId) return;
      const promoted = await debugSessionController.promoteStop(picked.sessionId, picked.service);
      if (promoted) {
        updateActiveSessionBar();
        output.appendLine(`[msdebug] Active session switched to ${picked.service} [${picked.sessionId.slice(0, 8)}]`);
      }
    }),

    vscode.commands.registerCommand('msdebug.selectAgent', async () => {
      await selectAgentCommand(client, output, workspaceId, (service) => {
        discoveredService = service;
        sessionsProvider.refresh();
        breakpointsProvider.refresh();
        void rebindSessionsForActiveAgents('agent-selected');
      });
    }),

    vscode.commands.registerCommand('msdebug.startSession', async () => {
      await startSessionCommand(client, sessionsProvider, workspaceId, ownedSessionIds);
    }),

    vscode.commands.registerCommand('msdebug.stopSession', async (item?: SessionItem | { session?: { id?: string } }) => {
      await stopSessionCommand(client, sessionsProvider, workspaceId, ownedSessionIds, item);
    }),

    vscode.commands.registerCommand('msdebug.refreshSessions', () => sessionsProvider.refresh()),
    vscode.commands.registerCommand('msdebug.refreshBreakpoints', () => breakpointsProvider.refresh()),
    vscode.commands.registerCommand('msdebug.refreshVariables', () => variablesProvider.clear()),
    vscode.commands.registerCommand('msdebug.refreshTraces', () => tracesProvider.refresh()),
    vscode.commands.registerCommand('msdebug.copyVariablesJson', async () => {
      const json = variablesProvider.getVariablesAsJson();
      await vscode.env.clipboard.writeText(json);
      vscode.window.showInformationMessage('Variables copied to clipboard as JSON');
    }),
  );

  // ── Editor Breakpoint Sync ───────────────────────────────────────────────
  const syncEditorBreakpoints = async (
    _changes: vscode.BreakpointsChangeEvent,
  ): Promise<boolean> => {
    const sessions = (await client.listSessions())
      .filter((session) => ['running', 'active', 'initializing', 'paused', 'stepping', 'replaying', 'stopping'].includes(session.status))
      .filter((session) => session.workspaceId === workspaceId);

    if (!sessions.length) {
      if (vscode.debug.breakpoints.length > 0) pendingInitialEditorBreakpoints = true;
      output.appendLine('[msdebug] No active session; skipped breakpoint sync');
      return false;
    }

    let hadErrors = false;

    const enabledSourceBreakpoints = vscode.debug.breakpoints.filter(
      (bp): bp is vscode.SourceBreakpoint => bp instanceof vscode.SourceBreakpoint && bp.enabled,
    );

    const visibleEditors = new Set(
      vscode.window.visibleTextEditors.map((editor) => editor.document.uri.toString()),
    );

    for (const session of sessions) {
      ownedSessionIds.add(session.id);

      for (const service of session.services) {
        const runtime = normalizeRuntime(await client.getServiceRuntime(service, workspaceId));
        const mappedEditorBreakpoints = enabledSourceBreakpoints
          .map((bp) => toDistributedBreakpoint(bp, runtime))
          .filter((mapped): mapped is DistributedEditorBreakpoint => mapped !== null);

        const visibleMappedBreakpoints = mappedEditorBreakpoints.filter((bp) =>
          visibleEditors.has(bp.editorBreakpoint.location.uri.toString()),
        );

        const desiredEditorBreakpoints = visibleMappedBreakpoints.length > 0
          ? visibleMappedBreakpoints
          : mappedEditorBreakpoints;

        const desiredByLocation = new Map<string, DistributedEditorBreakpoint>();
        for (const bp of desiredEditorBreakpoints) {
          desiredByLocation.set(`${bp.file}:${bp.line}`, bp);
        }

        if (enabledSourceBreakpoints.length > 0 && mappedEditorBreakpoints.length === 0) {
          output.appendLine(`[msdebug] No ${runtime} editor breakpoints to sync for ${service}`);
          continue;
        }

        const existing = await client.listBreakpoints(session.id, service, workspaceId);
        const existingForService = existing.filter((bp) => bp.service === service);
        const existingByLocation = new Map<string, BreakpointDto>();
        for (const bp of existingForService) {
          const key = breakpointLocationKey(bp.file, bp.line, runtime);
          if (!existingByLocation.has(key)) {
            existingByLocation.set(key, bp);
          }
        }

        for (const [location, distributed] of existingByLocation.entries()) {
          if (!desiredByLocation.has(location)) {
            try {
              await client.removeBreakpoint(distributed.id, session.id, service, workspaceId);
            } catch (err) {
              hadErrors = true;
              output.appendLine(`[msdebug] Failed to remove distributed breakpoint for ${service}: ${String(err)}`);
            }
          }
        }

        for (const [location, editorBp] of desiredByLocation.entries()) {
          const found = existingByLocation.get(location);
          if (found && !nextSyncForceRepropagation) {
            distributedBreakpointByEditorKey.set(editorBreakpointKey(editorBp.editorBreakpoint), found.id);
            continue;
          }

          try {
            const result = await client.setBreakpoint({
              sessionId: session.id,
              service,
              runtime,
              file: editorBp.file,
              line: editorBp.line,
              condition: editorBp.editorBreakpoint.condition,
            });
            distributedBreakpointByEditorKey.set(editorBreakpointKey(editorBp.editorBreakpoint), result.id);
          } catch (err) {
            hadErrors = true;
            output.appendLine(`[msdebug] Failed to set distributed breakpoint for ${service}: ${String(err)}`);
          }
        }

        try {
          const postSync = await client.listBreakpoints(session.id, service, workspaceId);
          const postSyncKeys = new Set(
            postSync
              .filter((bp) => bp.service === service)
              .map((bp) => breakpointLocationKey(bp.file, bp.line, runtime)),
          );

          for (const location of desiredByLocation.keys()) {
            if (!postSyncKeys.has(location)) {
              hadErrors = true;
              output.appendLine(`[msdebug] Breakpoint still missing after sync for ${service}: ${location}`);
            }
          }
        } catch (err) {
          hadErrors = true;
          output.appendLine(`[msdebug] Failed to verify breakpoint sync for ${service}: ${String(err)}`);
        }
      }
    }

    nextSyncForceRepropagation = false;

    breakpointsProvider.refresh();
    sessionsProvider.refresh();
    if (!hadErrors) {
      pendingInitialEditorBreakpoints = false;
      return true;
    }
    return false;
  };



  context.subscriptions.push(
    vscode.debug.onDidChangeBreakpoints((changes) => {
      void changes;
      pendingInitialEditorBreakpoints = true;
      requestEditorBreakpointResync('editor-change');
    }),
  );

  // Seed mapping for existing editor breakpoints on activation.
  pendingInitialEditorBreakpoints = vscode.debug.breakpoints.length > 0;
  requestEditorBreakpointResync('activation-seed');

  // ── Connect event bridge ──────────────────────────────────────────────────
  void eventBridge.connect().catch((err) => {
    output.appendLine(`[msdebug] Event bridge connect error: ${toErrorMessage(err)}`);
  });

  context.subscriptions.push(
    new vscode.Disposable(() => eventBridge.dispose()),
  );

  void vscode.window.showInformationMessage('MS Distributed Debugger activated');
}

export function deactivateMsDebug(): void {
  eventBridge?.dispose();
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function startSessionCommand(
  client: OrchestratorClient,
  provider: SessionsTreeProvider,
  workspaceId: string,
  ownedSessionIds: Set<string>,
): Promise<void> {
  // Fetch available agents
  const agents = await client.listAgents(workspaceId);
  
  if (!agents.length) {
    void vscode.window.showErrorMessage('No agents registered. Start your runtime agent first.');
    return;
  }

  // Let user select which agents to debug
  const picks = await vscode.window.showQuickPick(
    agents.map((a) => ({
      label: a.service,
      description: `${a.runtime}${a.agentId ? ` · ${a.agentId}` : ''}${a.healthy === false ? ' (unhealthy)' : ''}`,
      agent: a,
    })),
    {
      placeHolder: 'Select services to debug',
      canPickMany: true,
    },
  );

  if (!picks || picks.length === 0) return;

  const selectedServices = picks.map((p) => p.label);
  const startedSessionNames: string[] = [];
  const failedServices: string[] = [];

  for (const service of selectedServices) {
    try {
      const session = await client.startSession({
        name: service,
        services: [service],
        workspaceId,
      });
      ownedSessionIds.add(session.id);
      startedSessionNames.push(session.name);
    } catch {
      failedServices.push(service);
    }
  }

  provider.refresh();

  if (startedSessionNames.length > 0) {
    void vscode.window.showInformationMessage(`Debug sessions started: ${startedSessionNames.join(', ')}`);
  }

  if (failedServices.length > 0) {
    void vscode.window.showErrorMessage(`Failed to start session(s): ${failedServices.join(', ')}`);
  }
}

async function stopSessionCommand(
  client: OrchestratorClient,
  provider: SessionsTreeProvider,
  workspaceId: string,
  ownedSessionIds: Set<string>,
  selected?: SessionItem | { session?: { id?: string } },
): Promise<void> {
  const selectedSessionId = selected?.session?.id;
  if (selectedSessionId) {
    try {
      await client.stopSession(selectedSessionId);
      ownedSessionIds.delete(selectedSessionId);
      provider.refresh();
      return;
    } catch (err) {
      void vscode.window.showErrorMessage(`Failed to stop session: ${toErrorMessage(err)}`);
      return;
    }
  }

  const sessions = (await client.listSessions()).filter((session) => session.workspaceId === workspaceId);
  if (!sessions.length) {
    void vscode.window.showInformationMessage('No active sessions');
    return;
  }

  const pick = await vscode.window.showQuickPick(
    sessions.map((s) => ({ label: s.name, description: s.id, id: s.id })),
    { placeHolder: 'Select session to stop' },
  );

  if (!pick) return;

  try {
    await client.stopSession(pick.id);
    ownedSessionIds.delete(pick.id);
    provider.refresh();
    void vscode.window.showInformationMessage('Session stopped');
  } catch (err) {
    void vscode.window.showErrorMessage(`Failed to stop session: ${toErrorMessage(err)}`);
  }
}

async function selectAgentCommand(
  client: OrchestratorClient,
  output: vscode.OutputChannel,
  workspaceId: string,
  onAgentSelected: (service: string) => void,
): Promise<void> {
  const agents = await client.listAgents(workspaceId);
  
  if (!agents.length) {
    void vscode.window.showErrorMessage('No agents registered. Start your runtime agent first.');
    return;
  }

  const picks = await vscode.window.showQuickPick(
    agents.map((a) => ({
      label: a.service,
      description: `${a.runtime}${a.agentId ? ` · ${a.agentId}` : ''}${a.healthy === false ? ' (unhealthy)' : ''}`,
      agent: a,
    })),
    {
      placeHolder: 'Select agent to connect',
      canPickMany: false,
    },
  );

  if (!picks) return;

  const selectedService = picks.label;
  output.appendLine(`[msdebug] Selected agent: ${selectedService}`);
  onAgentSelected(selectedService);
  void vscode.window.showInformationMessage(`Connected to agent: ${selectedService}`);
}

// Opens a Java source file at the given 1-based line number.
// `file` is a relative path like "com/example/HelloController.java".
async function openFileAtLine(file: string, line: number): Promise<void> {
  try {
    const resolved = await resolveSourceFileUri(file);
    const doc = resolved
      ? await vscode.workspace.openTextDocument(resolved)
      : await vscode.workspace.openTextDocument({ content: `Source not found for: ${file}\nLine: ${line}\n`, language: 'plaintext' });
    const editor = await vscode.window.showTextDocument(doc, vscode.ViewColumn.One, false);
    const pos = new vscode.Position(Math.max(0, line - 1), 0);
    editor.selection = new vscode.Selection(pos, pos);
    editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenter);
  } catch {
    // Non-fatal: file may not be in the current workspace
  }
}

async function resolveSourceFileUri(file: string): Promise<vscode.Uri | undefined> {
  const candidate = file.trim();
  if (!candidate) return undefined;

  let normalized = candidate.replace(/\\/g, '/');

  // file:// URI (common for Node sidecar, often points to container path)
  if (candidate.startsWith('file://')) {
    try {
      const uri = vscode.Uri.parse(candidate);
      await vscode.workspace.fs.stat(uri);
      return uri;
    } catch {
      // Fall through to workspace search with parsed fsPath/path.
      try {
        const parsed = vscode.Uri.parse(candidate);
        normalized = (parsed.fsPath || parsed.path || candidate).replace(/\\/g, '/');
      } catch {
        // keep original normalized
      }
    }
  }

  // Absolute path
  if (normalized.startsWith('/')) {
    const uri = vscode.Uri.file(normalized);
    try {
      await vscode.workspace.fs.stat(uri);
      return uri;
    } catch {
      // continue with workspace glob fallbacks
    }
  }

  const segments = normalized.split('/').filter(Boolean);
  const fileName = segments[segments.length - 1] ?? normalized;
  const dot = fileName.lastIndexOf('.');
  const extCandidate = dot > 0 ? fileName.slice(dot + 1).toLowerCase() : '';
  const knownExts = new Set(['js', 'jsx', 'ts', 'tsx', 'mjs', 'cjs', 'java', 'kt', 'groovy']);
  const hasExt = knownExts.has(extCandidate);
  const baseName = hasExt && dot > 0 ? fileName.slice(0, dot) : fileName;
  const className = baseName.split('.').filter(Boolean).pop() ?? baseName;

  const searchPatterns = new Set<string>();

  // Relative path with extension (js/ts/java/...)
  if (normalized.includes('/') && hasExt) {
    searchPatterns.add(`**/${normalized.replace(/^\/+/, '')}`);
  }

  // Tail path fallback for container paths like /app/src/index.js
  if (segments.length >= 2 && hasExt) {
    searchPatterns.add(`**/${segments.slice(-2).join('/')}`);
  }
  if (segments.length >= 3 && hasExt) {
    searchPatterns.add(`**/${segments.slice(-3).join('/')}`);
  }

  // Generic file fallback for any extension
  if (hasExt) {
    searchPatterns.add(`**/${fileName}`);
  }

  // Java FQCN fallback: com.example.FooController -> com/example/FooController.java
  if (!normalized.includes('/') && normalized.includes('.') && !hasExt) {
    const fqcnPath = normalized.replace(/\./g, '/');
    searchPatterns.add(`**/${fqcnPath}.java`);
    searchPatterns.add(`**/src/main/java/${fqcnPath}.java`);
    searchPatterns.add(`**/src/test/java/${fqcnPath}.java`);
    if (className) {
      searchPatterns.add(`**/${className}.java`);
    }
  }

  // Base-name fallback for Node/TS sources when extension is missing
  if (!hasExt && baseName) {
    searchPatterns.add(`**/${baseName}.ts`);
    searchPatterns.add(`**/${baseName}.tsx`);
    searchPatterns.add(`**/${baseName}.js`);
    searchPatterns.add(`**/${baseName}.jsx`);
    searchPatterns.add(`**/${baseName}.mjs`);
    searchPatterns.add(`**/${baseName}.cjs`);
    searchPatterns.add(`**/${baseName}.java`);
  }

  for (const pattern of searchPatterns) {
    const matches = await vscode.workspace.findFiles(
      pattern,
      '**/{node_modules,target,dist,out,build}/**',
      1,
    );
    if (matches.length) return matches[0];
  }

  return undefined;
}

function editorBreakpointKey(bp: vscode.SourceBreakpoint): string {
  return `${bp.location.uri.toString()}#${bp.location.range.start.line + 1}`;
}

function getWorkspaceId(): string {
  const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? 'untitled';
  // sessionId is unique per VS Code process instance — two windows on the same machine
  // and same workspace will get different workspaceIds, preventing BP hit leakage.
  return `${vscode.env.sessionId.slice(0, 12)}:${workspacePath}`;
}

function isEventForWorkspace(
  evt: { sessionId?: string; workspaceId?: string; data: unknown },
  workspaceId: string,
  ownedSessionIds: Set<string>,
): boolean {
  const eventWorkspaceId = evt.workspaceId ?? getEventWorkspaceId(evt.data);
  if (eventWorkspaceId) return eventWorkspaceId === workspaceId;
  if (evt.sessionId) return ownedSessionIds.has(evt.sessionId);
  // If we have a workspaceId but event has no workspace context and no session,
  // reject it — prevents BP hits from other IDEs bleeding through on shared infra.
  return !workspaceId;
}

function getEventWorkspaceId(data: unknown): string | undefined {
  if (!data || typeof data !== 'object') return undefined;
  const record = data as Record<string, unknown>;
  const direct = record['workspaceId'];
  if (typeof direct === 'string' && direct.trim()) return direct.trim();
  const metadata = record['metadata'];
  if (metadata && typeof metadata === 'object') {
    const value = (metadata as Record<string, unknown>)['workspaceId'];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return undefined;
}

async function resolveOwnedBreakpointSessionId(
  evt: { sessionId?: string; workspaceId?: string; service?: string; data: unknown },
  workspaceId: string,
  ownedSessionIds: Set<string>,
  client: OrchestratorClient,
): Promise<string | undefined> {
  const activeStatuses = new Set([
    'running',
    'active',
    'initializing',
    'paused',
    'stepping',
    'replaying',
    'stopping',
  ]);

  const eventWorkspaceId = evt.workspaceId ?? getEventWorkspaceId(evt.data);
  if (eventWorkspaceId && eventWorkspaceId !== workspaceId) return undefined;
  
  // If event has a sessionId that we own, use it directly
  if (evt.sessionId && ownedSessionIds.has(evt.sessionId)) {
    return evt.sessionId;
  }

  // Prefer event sessionId if it exists in orchestrator and matches workspace/service.
  // Sidecars may emit their own session IDs, so this can legitimately miss.
  if (evt.sessionId) {
    try {
      const session = await client.getSession(evt.sessionId);
      const workspaceMatches = !workspaceId || session.workspaceId === workspaceId;
      const serviceMatches = !evt.service || session.services.includes(evt.service);
      if (workspaceMatches && serviceMatches && activeStatuses.has(session.status)) {
        ownedSessionIds.add(evt.sessionId);
        return evt.sessionId;
      }
    } catch {
      // Ignore transient lookup failures and fall back to service-based resolution.
    }
  }

  // Sidecar IDs may differ from orchestrator session IDs.
  // Resolve by service/workspace but only from active sessions.
  try {
    const allSessions = await client.listSessions();
    const matching = allSessions
      .filter((s) => !workspaceId || s.workspaceId === workspaceId)
      .filter((s) => !evt.service || s.services.includes(evt.service))
      .filter((s) => activeStatuses.has(s.status))
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));

    if (matching.length > 0) {
      // Prefer paused/stepping first, then already-owned active sessions.
      const paused = matching.find((s) => s.status === 'paused' || s.status === 'stepping');
      const owned = matching.find((s) => ownedSessionIds.has(s.id));
      const selected = paused ?? owned ?? matching[0];
      if (selected) {
        ownedSessionIds.add(selected.id);
        return selected.id;
      }
    }
  } catch {
    // Ignore transient lookup failures
  }

  return undefined;
}

function getWorkspaceServiceHints(): string[] {
  const hints = new Set<string>();
  for (const folder of vscode.workspace.workspaceFolders ?? []) {
    if (folder.uri.scheme !== 'file') continue;
    const packageName = readPackageName(folder.uri.fsPath);
    if (packageName) hints.add(packageName);
  }
  return Array.from(hints);
}

function getWorkspaceRuntimeHint(): SupportedRuntime | undefined {
  for (const folder of vscode.workspace.workspaceFolders ?? []) {
    if (folder.uri.scheme !== 'file') continue;
    const folderPath = folder.uri.fsPath;
    if (fs.existsSync(path.join(folderPath, 'package.json'))) return 'nodejs';
    if (fs.existsSync(path.join(folderPath, 'pom.xml'))) return 'java';
    if (fs.existsSync(path.join(folderPath, 'build.gradle')) || fs.existsSync(path.join(folderPath, 'build.gradle.kts'))) return 'java';
    if (fs.existsSync(path.join(folderPath, 'src', 'main', 'java'))) return 'java';
  }
  return undefined;
}

function readPackageName(folderPath: string): string | null {
  try {
    const packageJsonPath = path.join(folderPath, 'package.json');
    if (!fs.existsSync(packageJsonPath)) return null;
    const raw = fs.readFileSync(packageJsonPath, 'utf8');
    const parsed = JSON.parse(raw) as { name?: unknown };
    return typeof parsed.name === 'string' && parsed.name.trim()
      ? parsed.name.trim().toLowerCase()
      : null;
  } catch {
    return null;
  }
}

function normalizeRuntime(runtime: string | undefined): SupportedRuntime {
  const value = (runtime ?? '').toLowerCase();
  if (value === 'node' || value === 'nodejs' || value === 'javascript') return 'nodejs';
  return 'java';
}

function toDistributedBreakpoint(
  bp: vscode.SourceBreakpoint,
  runtime: SupportedRuntime,
): DistributedEditorBreakpoint | null {
  const line = bp.location.range.start.line + 1;
  if (runtime === 'nodejs') {
    const file = toNodeSourcePath(bp.location.uri);
    return file ? { editorBreakpoint: bp, file, line } : null;
  }

  const className = toJavaClassName(bp.location.uri);
  return className ? { editorBreakpoint: bp, file: className, line } : null;
}

function toNodeSourcePath(uri: vscode.Uri): string | null {
  if (uri.scheme !== 'file') return null;
  const path = uri.fsPath.replace(/\\/g, '/');
  if (!/\.(cjs|mjs|js|jsx|ts|tsx)$/i.test(path)) return null;
  if (/\.(d\.ts)$/i.test(path)) return null;
  if (path.includes('/node_modules/')) return null;
  return path;
}

function breakpointLocationKey(file: string, line: number, runtime: SupportedRuntime): string {
  const normalized = runtime === 'nodejs'
    ? normalizeSourcePath(file)
    : normalizeClassName(file);
  return `${normalized}:${line}`;
}

function normalizeSourcePath(file: string): string {
  return file.trim().replace(/\\/g, '/').toLowerCase();
}

function toJavaClassName(uri: vscode.Uri): string | null {
  const normalized = uri.path.replace(/\\/g, '/');
  const javaRoots = ['/src/main/java/', '/src/test/java/'];
  for (const root of javaRoots) {
    const idx = normalized.indexOf(root);
    if (idx >= 0) {
      const rel = normalized.slice(idx + root.length);
      if (!rel.endsWith('.java')) return null;
      return rel.slice(0, -5).replace(/\//g, '.');
    }
  }
  if (normalized.endsWith('.java')) {
    const rel = normalized.slice(normalized.lastIndexOf('/') + 1, -5);
    return rel || null;
  }
  return null;
}

function normalizeClassName(fileOrClass: string): string {
  let value = fileOrClass.trim();
  if (value.endsWith('.java')) value = value.slice(0, -5);
  return value.replace(/\\/g, '.').replace(/\//g, '.');
}

function toErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
