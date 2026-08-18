import * as vscode from 'vscode';
import { OrchestratorClient } from './orchestrator-client';
import { buildVariableNodes, DebugVariableNode } from './debug-variable-model';

type StepType = 'over' | 'into' | 'out';

type DebugProtocolMessage = {
  seq: number;
  type: string;
  command?: string;
  event?: string;
  arguments?: Record<string, unknown>;
};

type DebugRequest = DebugProtocolMessage & {
  command: string;
};

export type MsDebugVariable = {
  name: string;
  value: string;
  type: string;
  variablesReference?: number;
  namedVariables?: number;
  indexedVariables?: number;
};

export type MsDebugStackFrame = {
  name: string;
  line: number;
  source?: { path?: string; name?: string };
};

export type MsDebugStop = {
  sessionId: string;
  workspaceId: string;
  service: string;
  traceId: string;
  file: string;
  line: number;
  threadName?: string;
  stackFrames?: MsDebugStackFrame[];
  variables: MsDebugVariable[];
};

export class MsDebugSessionController {
  private adapter: MsDebugAdapter | undefined;
  private pendingStop: MsDebugStop | undefined;
  private readonly queuedStops: MsDebugStop[] = [];
  private starting = false;
  private promoting = false;

  constructor(
    public readonly client: OrchestratorClient,
    private readonly output: vscode.OutputChannel,
  ) {}

  attachAdapter(adapter: MsDebugAdapter): void {
    this.adapter = adapter;
    const pending = this.pendingStop;
    this.pendingStop = undefined;
    if (pending) {
      adapter.acceptStop(pending);
    }
  }

  detachAdapter(adapter: MsDebugAdapter): void {
    if (this.adapter === adapter) {
      this.adapter = undefined;
    }
  }

  async showStop(stop: MsDebugStop): Promise<void> {
    const resolvedStop = await this.resolveStopSources(stop);

    // Keep breakpoint stops FIFO across sidecars/services.
    if (this.hasActiveStop()) {
      this.queuedStops.push(resolvedStop);
      this.output.appendLine(
        `  Queued stop [session=${resolvedStop.sessionId}, service=${resolvedStop.service}] (queue=${this.queuedStops.length})`,
      );
      return;
    }

    await this.ensureStarted(resolvedStop.service, resolvedStop.workspaceId);
    this.acceptStop(resolvedStop);
  }

  async resume(command: 'continue' | StepType): Promise<void> {
    const stop = this.adapter?.currentStop ?? this.pendingStop;
    if (!stop?.sessionId) {
      throw new Error('No active distributed debug stop');
    }

    if (command === 'continue') {
      await this.client.continueExecution(stop.sessionId, stop.service, stop.traceId);
      this.output.appendLine(`  Continue sent from Debug Toolbar [session=${stop.sessionId}, service=${stop.service}]`);
      this.markCurrentStopResumed();
      await this.promoteNextStop();
      return;
    }

    await this.client.step(stop.sessionId, command, stop.service, stop.traceId);
    this.output.appendLine(`  Step ${command} sent from Debug Toolbar [session=${stop.sessionId}, service=${stop.service}]`);
    this.markCurrentStopResumed();
    await this.promoteNextStop();
  }

  async pause(): Promise<void> {
    const stop = this.adapter?.currentStop ?? this.pendingStop;
    if (!stop?.sessionId) return;
    await this.client.pauseExecution(stop.sessionId, stop.service);
  }

  getActiveStop(): MsDebugStop | undefined {
    return this.adapter?.currentStop ?? this.pendingStop;
  }

  getQueuedStops(): readonly MsDebugStop[] {
    return this.queuedStops;
  }

  clearQueuedStops(): void {
    this.queuedStops.length = 0;
    this.output.appendLine(`[msdebug] Cleared queued stops`);
  }

  async promoteStop(sessionId: string, service: string): Promise<boolean> {
    const idx = this.queuedStops.findIndex(
      (s) => s.sessionId === sessionId && s.service === service,
    );
    if (idx === -1) return false;

    const target = this.queuedStops.splice(idx, 1)[0];

    // Push the currently displayed stop back to the front of the queue
    const current = this.adapter?.currentStop ?? this.pendingStop;
    if (current) {
      this.queuedStops.unshift(current);
      this.markCurrentStopResumed();
    }

    await this.ensureStarted(target.service, target.workspaceId);
    this.acceptStop(target);
    this.output.appendLine(
      `  Promoted stop [session=${target.sessionId}, service=${target.service}] to active (queue=${this.queuedStops.length})`,
    );
    return true;
  }

  private async ensureStarted(service: string, workspaceId: string): Promise<void> {
    const active = vscode.debug.activeDebugSession;
    if (active?.type === 'msdebug') {
      const activeWorkspaceId = typeof active.configuration.workspaceId === 'string'
        ? active.configuration.workspaceId
        : undefined;
      if (activeWorkspaceId === workspaceId) return;
    }
    if (this.starting) return;

    this.starting = true;
    try {
      await vscode.debug.startDebugging(workspaceFolderForId(workspaceId), {
        type: 'msdebug',
        request: 'launch',
        name: service ? `MS Debug: ${service}` : 'MS Distributed Debugger',
        workspaceId,
        internalConsoleOptions: 'neverOpen',
      });
    } finally {
      this.starting = false;
    }
  }

  private hasActiveStop(): boolean {
    return Boolean(this.adapter?.currentStop || this.pendingStop);
  }

  private acceptStop(stop: MsDebugStop): void {
    if (this.adapter) {
      this.adapter.acceptStop(stop);
      return;
    }
    this.pendingStop = stop;
  }

  private markCurrentStopResumed(): void {
    this.pendingStop = undefined;
    // Clear currentStop so debug toolbar exits paused state
    // Inline values persist via lastInlineValues in extension.ts
    if (this.adapter) {
      this.adapter.clearCurrentStop();
    }
  }

  private async promoteNextStop(): Promise<void> {
    if (this.promoting || this.hasActiveStop()) return;
    const next = this.queuedStops.shift();
    if (!next) return;

    this.promoting = true;
    try {
      await this.ensureStarted(next.service, next.workspaceId);
      this.acceptStop(next);
      this.output.appendLine(
        `  Dequeued stop [session=${next.sessionId}, service=${next.service}] (queue=${this.queuedStops.length})`,
      );
    } finally {
      this.promoting = false;
    }
  }

  private async resolveStopSources(stop: MsDebugStop): Promise<MsDebugStop> {
    // .flow dosyalarinin kendi custom editoru (DAG diyagram) var. DAP'a bir
    // source.path verirsek VS Code onu METIN editorunde acar ve diyagramin
    // yaninda ikinci bir sekme belirir. Bu yuzden .flow icin path cozmuyoruz;
    // yalnizca goruntulenecek ad kaliyor. Node'a gitmek Distributed Breakpoints
    // panelindeki 'reactdnd.openFlowNode' komutuyla yapiliyor.
    const fallbackPath = isFlowSource(stop.file) ? undefined : await resolveSourcePath(stop.file);
    const resolvedFrames = await Promise.all((stop.stackFrames ?? []).map(async (frame) => {
      // Try resolving the frame's own source path first, then fall back to the main file path
      const ownPath = isFlowSource(frame.source?.path) ? undefined : await resolveSourcePath(frame.source?.path);
      const sourcePath = ownPath ?? fallbackPath;
      return {
        ...frame,
        source: sourcePath
          ? { ...frame.source, path: sourcePath, name: sourceName(sourcePath) }
          : { name: sourceName(frame.source?.path ?? frame.name) },
      };
    }));

    return {
      ...stop,
      file: fallbackPath ?? stop.file,
      stackFrames: resolvedFrames.length
        ? resolvedFrames
        : [{ name: 'Breakpoint', line: stop.line, source: fallbackPath ? { path: fallbackPath, name: sourceName(fallbackPath) } : { name: sourceName(stop.file) } }],
    };
  }
}

export class MsDebugAdapter implements vscode.DebugAdapter {
  private readonly sendMessageEmitter = new vscode.EventEmitter<DebugProtocolMessage>();
  readonly onDidSendMessage = this.sendMessageEmitter.event;
  private nextSeq = 1;
  private nextVariableReference = 2;
  private readonly variableReferences = new Map<number, DebugVariableNode[]>();
  currentStop: MsDebugStop | undefined;

  constructor(private readonly controller: MsDebugSessionController) {}

  dispose(): void {
    this.controller.detachAdapter(this);
    this.sendMessageEmitter.dispose();
  }

  handleMessage(message: DebugProtocolMessage): void {
    if (message.type !== 'request' || !message.command) return;
    void this.handleRequest(message as DebugRequest);
  }

  acceptStop(stop: MsDebugStop): void {
    this.currentStop = stop;
    this.rebuildVariableReferences(stop.variables);
    this.sendEvent('stopped', {
      reason: 'breakpoint',
      description: `${stop.service} ${stop.file}:${stop.line}`,
      threadId: 1,
      allThreadsStopped: true,
    });
  }

  clearCurrentStop(): void {
    this.currentStop = undefined;
  }

  private async handleRequest(request: DebugRequest): Promise<void> {
    try {
      switch (request.command) {
        case 'initialize':
          this.sendResponse(request, {
            supportsConfigurationDoneRequest: true,
            supportsStepBack: false,
            supportsEvaluateForHovers: true,
            supportsTerminateRequest: true,
            supportsSetVariable: false,
            supportsRestartFrame: false,
            supportsInlineValues: true,
          });
          this.sendEvent('initialized');
          break;

        case 'launch':
        case 'attach':
        case 'configurationDone':
        case 'setExceptionBreakpoints':
          this.sendResponse(request);
          break;

        case 'setBreakpoints':
          this.sendResponse(request, { breakpoints: [] });
          break;

        case 'threads':
          this.sendResponse(request, {
            threads: [{ id: 1, name: this.currentStop?.threadName ?? this.currentStop?.service ?? 'MS Debug Thread' }],
          });
          break;

        case 'stackTrace':
          const stackFrames = await this.toDapStackFrames();
          this.sendResponse(request, { stackFrames, totalFrames: stackFrames.length });
          break;

        case 'scopes':
          // Return the variablesReference that maps to the current stop's variables
          // The root variables are stored under reference 1 (set in rebuildVariableReferences)
          const scopesVariablesReference = this.currentStop ? 1 : 0;
          this.sendResponse(request, {
            scopes: [{ name: 'Variables', variablesReference: scopesVariablesReference, expensive: false }],
          });
          break;

        case 'variables':
          const reference = Number(request.arguments?.variablesReference ?? 1);
          
          // Lazy loading: if reference not in map, fetch from orchestrator
          if (!this.variableReferences.has(reference) && this.currentStop) {
            try {
              const childVariables = await this.controller.client.getVariables(
                this.currentStop.sessionId,
                this.currentStop.service,
                this.currentStop.traceId,
                String(reference),
              );
              
              // Build nodes and add to map
              const nodes = buildVariableNodes(childVariables);
              this.variableReferences.set(reference, nodes);
            } catch (err) {
              console.error(`[MsDebug] Failed to lazy load variables for reference ${reference}:`, err);
            }
          }
          
          this.sendResponse(request, {
            variables: this.toDapVariables(reference),
          });
          break;

        case 'continue':
          await this.controller.resume('continue');
          this.sendResponse(request, { allThreadsContinued: true });
          this.sendEvent('continued', { threadId: 1, allThreadsContinued: true });
          break;

        case 'next':
          await this.controller.resume('over');
          this.sendResponse(request);
          this.sendEvent('continued', { threadId: 1, allThreadsContinued: true });
          break;

        case 'stepIn':
          await this.controller.resume('into');
          this.sendResponse(request);
          this.sendEvent('continued', { threadId: 1, allThreadsContinued: true });
          break;

        case 'stepOut':
          await this.controller.resume('out');
          this.sendResponse(request);
          this.sendEvent('continued', { threadId: 1, allThreadsContinued: true });
          break;

        case 'pause':
          await this.controller.pause();
          this.sendResponse(request);
          break;

        case 'evaluate':
          const expression = String(request.arguments?.expression ?? '');
          const context = String(request.arguments?.context ?? 'hover');
          
          try {
            const result = await this.controller.client.evaluate(
              this.currentStop?.sessionId ?? '',
              expression,
              this.currentStop?.service,
            );
            this.sendResponse(request, {
              result: result.result,
              type: result.type,
              variablesReference: 0,
            });
          } catch (err) {
            this.sendResponse(request, {
              result: `<error: ${err instanceof Error ? err.message : String(err)}>`,
              variablesReference: 0,
            });
          }
          break;

        case 'inlineValues':
          // DAP spec: InlineValue is { type: "text"|"variable"|"evaluatableExpression", range: { start: {line, column}, end: {line, column} }, ... }
          if (this.currentStop && this.currentStop.variables) {
            const stopLine = this.currentStop.line;
            const inlineValues = this.currentStop.variables.map((variable) => ({
              type: 'text',
              range: {
                start: { line: stopLine, column: 1 },
                end: { line: stopLine, column: 1000 },
              },
              text: `${variable.name} = ${variable.value}`,
            }));
            this.sendResponse(request, { inlineValues });
          } else {
            this.sendResponse(request, { inlineValues: [] });
          }
          break;

        case 'disconnect':
        case 'terminate':
          this.sendResponse(request);
          this.sendEvent('terminated');
          break;

        default:
          this.sendResponse(request);
          break;
      }
    } catch (err) {
      this.sendErrorResponse(request, err instanceof Error ? err.message : String(err));
    }
  }

  private async toDapStackFrames(): Promise<Array<Record<string, unknown>>> {
    const stop = this.currentStop;
    if (!stop) return [];

    // Resolve source path for the main file (handles Java class names like com.example.UserController)
    const resolvedFilePath = await resolveSourcePath(stop.file);

    const frames = stop.stackFrames?.length
      ? stop.stackFrames
      : [{ name: 'Breakpoint', line: stop.line, source: resolvedFilePath ? { path: resolvedFilePath, name: sourceName(resolvedFilePath) } : { name: sourceName(stop.file) } }];

    return frames.map((frame, index) => {
      // Use frame's own resolved path, or fall back to the main file's resolved path
      const framePath = isUsableFilePath(frame.source?.path) ? frame.source?.path : resolvedFilePath;
      return {
        id: index + 1,
        name: frame.name || 'Breakpoint',
        source: framePath
          ? { name: frame.source?.name ?? sourceName(framePath), path: framePath }
          : { name: frame.source?.name ?? sourceName(frame.source?.path ?? stop.file), presentationHint: 'deemphasize' },
        line: frame.line || stop.line || 1,
        column: 1,
      };
    });
  }

  private rebuildVariableReferences(variables: MsDebugVariable[]): void {
    this.variableReferences.clear();
    this.nextVariableReference = 2;
    this.variableReferences.set(1, buildVariableNodes(variables));
  }

  private toDapVariables(reference: number): Array<Record<string, unknown>> {
    const variables = this.variableReferences.get(reference) ?? [];
    return variables.map((variable) => {
      // Use server-provided variablesReference if available (for expandable objects)
      // Otherwise, use children-based reference
      let childReference: number;
      if (variable.variablesReference && variable.variablesReference > 0) {
        // Server already assigned a reference - use it and ensure it's in the map
        childReference = variable.variablesReference;
        // If variable has children but no entry in map yet, add it
        if (variable.children.length > 0 && !this.variableReferences.has(childReference)) {
          this.variableReferences.set(childReference, variable.children);
        }
      } else if (variable.children.length > 0) {
        childReference = this.allocateVariableReference(variable.children);
      } else {
        childReference = 0;
      }
      
      return {
        name: variable.name,
        value: variable.value,
        type: variable.type,
        variablesReference: childReference,
        namedVariables: variable.namedVariables,
        indexedVariables: variable.indexedVariables,
      };
    });
  }

  private allocateVariableReference(children: DebugVariableNode[]): number {
    const reference = this.nextVariableReference++;
    this.variableReferences.set(reference, children);
    return reference;
  }

  private sendResponse(request: DebugRequest, body: Record<string, unknown> = {}): void {
    this.send({
      type: 'response',
      request_seq: request.seq,
      success: true,
      command: request.command,
      body,
    });
  }

  private sendErrorResponse(request: DebugRequest, message: string): void {
    this.send({
      type: 'response',
      request_seq: request.seq,
      success: false,
      command: request.command,
      message,
    });
  }

  private sendEvent(event: string, body: Record<string, unknown> = {}): void {
    this.send({ type: 'event', event, body });
  }

  private send(message: Record<string, unknown>): void {
    this.sendMessageEmitter.fire({ seq: this.nextSeq++, ...message } as DebugProtocolMessage);
  }
}

function workspaceFolderForId(workspaceId: string): vscode.WorkspaceFolder | undefined {
  return vscode.workspace.workspaceFolders?.find((folder) => folder.uri.fsPath === workspaceId)
    ?? vscode.workspace.workspaceFolders?.[0];
}

function sourceName(path: string): string {
  return path.split(/[/.\\]/).filter(Boolean).pop() ?? path;
}

export class MsDebugInlineValuesProvider implements vscode.InlineValuesProvider {
  private readonly _onDidChangeInlineValues = new vscode.EventEmitter<void>();
  readonly onDidChangeInlineValues = this._onDidChangeInlineValues.event;

  constructor(
    private readonly controller: MsDebugSessionController,
    private readonly output: vscode.OutputChannel,
  ) {}

  notifyChange(): void {
    this.output.appendLine('[msdebug:inline] notifyChange called');
    this._onDidChangeInlineValues.fire();
  }

  provideInlineValues(
    document: vscode.TextDocument,
    viewPort: vscode.Range,
    context: vscode.InlineValueContext,
    token: vscode.CancellationToken,
  ): vscode.ProviderResult<vscode.InlineValue[]> {
    const stop = this.controller.getActiveStop();
    this.output.appendLine(`[msdebug:inline] provideInlineValues called, hasStop=${!!stop}, vars=${stop?.variables?.length ?? 0}`);
    
    if (!stop || !stop.variables || stop.variables.length === 0) {
      return [];
    }

    const allValues: vscode.InlineValue[] = [];
    const stoppedLine = stop.line - 1; // Convert to 0-based

    this.output.appendLine(`[msdebug:inline] stoppedLine=${stoppedLine}, viewport=${viewPort.start.line}-${viewPort.end.line}`);

    // Show inline values on the stopped line
    for (const variable of stop.variables) {
      const range = new vscode.Range(stoppedLine, 0, stoppedLine, 1000);
      const text = `${variable.name} = ${variable.value}`;
      this.output.appendLine(`[msdebug:inline] Adding: ${text}`);
      allValues.push(new vscode.InlineValueText(range, text));
    }

    this.output.appendLine(`[msdebug:inline] Returning ${allValues.length} inline values`);
    return allValues;
  }
}

async function resolveSourcePath(candidate: string | undefined): Promise<string | undefined> {
  if (!candidate) return undefined;

  const normalized = candidate.replace(/\\/g, '/');

  // ── Path mappings (e.g. container /app/* → local workspaceFolder/*) ────
  const config = vscode.workspace.getConfiguration('msdebug');
  const pathMappings: Array<{ remote: string; local: string }> =
    config.get<Array<{ remote: string; local: string }>>('pathMappings', []);

  // Add automatic fallback: /app → workspaceFolder (handles file:///app/...)
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  const effectiveMappings = [...pathMappings];
  if (workspaceFolder && !effectiveMappings.some((m) => m.remote === '/app')) {
    effectiveMappings.push({ remote: '/app', local: workspaceFolder });
  }

  const tryMapped = async (rawPath: string): Promise<string | undefined> => {
    for (const mapping of effectiveMappings) {
      const remoteNorm = mapping.remote.replace(/\\/g, '/').replace(/\/$/, '');
      const localNorm = mapping.local
        .replace('${workspaceFolder}', workspaceFolder ?? '')
        .replace(/\\/g, '/')
        .replace(/\/$/, '');
      if (rawPath.startsWith(remoteNorm + '/') || rawPath === remoteNorm) {
        const rel = rawPath.slice(remoteNorm.length);
        const mapped = localNorm + rel;
        const resolved = await existingPath(vscode.Uri.file(mapped));
        if (resolved) return resolved;
      }
    }
    return undefined;
  };

  if (normalized.startsWith('file://')) {
    const filePath = normalized.replace(/^file:\/\//, '');
    // Try path mappings first
    const mapped = await tryMapped(filePath);
    if (mapped) return mapped;
    try {
      return await existingPath(vscode.Uri.parse(candidate));
    } catch {
      return undefined;
    }
  }

  if (normalized.startsWith('/')) {
    const mapped = await tryMapped(normalized);
    if (mapped) return mapped;
    return existingPath(vscode.Uri.file(candidate));
  }

  // Java class name to file path mapping (e.g., com.example.UserController → UserController.java)
  const fileName = toSourceFileName(candidate);
  if (!fileName) return undefined;

  // First try workspace search
  const matches = await vscode.workspace.findFiles(`**/${fileName}`, '**/{node_modules,target,dist,out,build}/**', 1);
  if (matches[0]) return matches[0].fsPath;

  // Fallback: search in configured Java source root
  const javaSourceRoot = config.get<string>('javaSourceRoot');
  if (javaSourceRoot) {
    const classPath = candidate.replace(/\./g, '/');
    const javaPath = `${javaSourceRoot}/${classPath}.java`;
    const resolved = await existingPath(vscode.Uri.file(javaPath));
    if (resolved) return resolved;
  }

  return undefined;
}

async function existingPath(uri: vscode.Uri): Promise<string | undefined> {
  try {
    await vscode.workspace.fs.stat(uri);
    return uri.fsPath;
  } catch {
    return undefined;
  }
}

function toSourceFileName(candidate: string): string | undefined {
  const normalized = candidate.replace(/\\/g, '/').trim();
  if (!normalized) return undefined;
  const lastSegment = normalized.split('/').filter(Boolean).pop() ?? normalized;
  if (/\.[a-z0-9]+$/i.test(lastSegment)) return lastSegment;
  const className = lastSegment.split('.').filter(Boolean).pop();
  return className ? `${className}.java` : undefined;
}

function isUsableFilePath(path: string | undefined): path is string {
  return !!path && path.startsWith('/');
}

/**
 * Kaynak bir .flow dosyasi mi? Bu dosyalar DAG diyagram editorunde acilir,
 * metin editorunde degil.
 */
function isFlowSource(candidate?: string): boolean {
  return typeof candidate === 'string' && candidate.toLowerCase().endsWith('.flow');
}
