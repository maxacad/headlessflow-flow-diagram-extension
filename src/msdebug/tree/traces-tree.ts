import * as vscode from 'vscode';
import { DebugEvent } from '../debug-event-bridge';

export class TracesTreeProvider implements vscode.TreeDataProvider<TraceItem> {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<TraceItem | undefined | null>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
  private readonly events: DebugEvent[] = [];

  constructor(
    private readonly getService: () => string,
    private readonly getWorkspaceId: () => string,
  ) {}

  addEvent(event: DebugEvent): void {
    if (!this.shouldShowEvent(event)) return;
    this.events.unshift(event);
    if (this.events.length > 500) {
      this.events.length = 500;
    }
    this.refresh();
  }

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: TraceItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: TraceItem): TraceItem[] {
    if (element) return element.children;
    if (!this.events.length) {
      return [TraceItem.empty()];
    }
    return this.events.map((event) => TraceItem.fromEvent(event));
  }

  private shouldShowEvent(event: DebugEvent): boolean {
    const targetWorkspaceId = this.getWorkspaceId();
    const eventWorkspaceId = event.workspaceId ?? getRecordString(event.data, 'workspaceId');
    if (targetWorkspaceId && eventWorkspaceId && eventWorkspaceId !== targetWorkspaceId) return false;

    const targetService = this.getService();
    const eventService = event.service ?? getRecordString(event.data, 'service');
    if (targetService && eventService && eventService !== targetService) return false;

    return true;
  }
}

class TraceItem extends vscode.TreeItem {
  private constructor(
    label: string,
    collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly children: TraceItem[] = [],
  ) {
    super(label, collapsibleState);
  }

  static empty(): TraceItem {
    const item = new TraceItem('Waiting for debug events', vscode.TreeItemCollapsibleState.None);
    item.description = 'Socket.IO event log';
    item.iconPath = new vscode.ThemeIcon('radio-tower');
    return item;
  }

  static fromEvent(event: DebugEvent): TraceItem {
    const data = isRecord(event.data) ? event.data : {};
    const type = event.type || 'unknown';
    const service = event.service ?? getRecordString(data, 'service') ?? '';
    const sessionId = event.sessionId ?? getRecordString(data, 'sessionId') ?? '';
    const flowId = getRecordString(data, 'flowId') ?? '';
    const nodeId = getRecordString(data, 'nodeId') ?? getRecordString(data, 'currentNodeId') ?? '';
    const location = formatLocation(data);
    const time = formatTime(event.timestamp);
    const label = `${eventLabel(type)}${service ? `  ${service}` : ''}`;
    const visual = eventVisual(type);
    const details = [
      TraceItem.detail('type', type),
      service ? TraceItem.detail('service', service) : undefined,
      sessionId ? TraceItem.detail('session', sessionId) : undefined,
      flowId ? TraceItem.detail('flow', flowId) : undefined,
      nodeId ? TraceItem.detail('node', nodeId) : undefined,
      event.traceId ? TraceItem.detail('trace', event.traceId) : undefined,
      location ? TraceItem.detail('location', location) : undefined,
      event.workspaceId ? TraceItem.detail('workspace', event.workspaceId) : undefined,
      TraceItem.detail('payload', safeJson(event.data)),
    ].filter((item): item is TraceItem => Boolean(item));

    const item = new TraceItem(label, details.length ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None, details);
    item.description = [location, sessionId ? `#${sessionId.slice(0, 8)}` : '', time].filter(Boolean).join('  ');
    item.tooltip = [
      `Type: ${type}`,
      service ? `Service: ${service}` : '',
      sessionId ? `Session: ${sessionId}` : '',
      flowId ? `Flow: ${flowId}` : '',
      nodeId ? `Node: ${nodeId}` : '',
      event.traceId ? `Trace: ${event.traceId}` : '',
      `Time: ${new Date(event.timestamp || Date.now()).toISOString()}`,
      `Payload: ${safeJson(event.data)}`,
    ].filter(Boolean).join('\n');

    item.iconPath = new vscode.ThemeIcon(visual.icon, new vscode.ThemeColor(visual.color));
    item.contextValue = 'debugEvent';
    return item;
  }

  static detail(key: string, value: string): TraceItem {
    const item = new TraceItem(`${key}: ${value}`, vscode.TreeItemCollapsibleState.None);
    item.iconPath = new vscode.ThemeIcon('symbol-field');
    return item;
  }
}

function eventVisual(type: string): { icon: string; color: string } {
  switch (type) {
    case 'agent.registered': return { icon: 'plug', color: 'charts.green' };
    case 'agent.heartbeat': return { icon: 'pulse', color: 'descriptionForeground' };
    case 'agent.unregistered': return { icon: 'debug-disconnect', color: 'descriptionForeground' };
    case 'agent.attached': return { icon: 'link', color: 'charts.green' };
    case 'agent.detached': return { icon: 'debug-disconnect', color: 'descriptionForeground' };
    case 'agent.error': return { icon: 'error', color: 'charts.red' };
    case 'agent.breakpoint.registered': return { icon: 'debug-breakpoint', color: 'charts.blue' };
    case 'agent.breakpoint.removed': return { icon: 'debug-breakpoint-unverified', color: 'descriptionForeground' };
    case 'debug.breakpoint.hit': return { icon: 'debug-breakpoint', color: 'charts.red' };
    case 'debug.execution.paused': return { icon: 'debug-pause', color: 'charts.orange' };
    case 'debug.execution.resumed': return { icon: 'debug-continue', color: 'charts.green' };
    case 'debug.execution.stepped': return { icon: 'debug-step-over', color: 'charts.blue' };
    case 'debug.execution.terminated': return { icon: 'debug-stop', color: 'descriptionForeground' };
    case 'debug.session.started': return { icon: 'debug-alt', color: 'charts.yellow' };
    case 'debug.session.stopped': return { icon: 'circle-slash', color: 'descriptionForeground' };
    case 'debug.exception.thrown': return { icon: 'error', color: 'charts.red' };
    default: {
      const normalized = type.toLowerCase();
      if (normalized.includes('error') || normalized.includes('exception') || normalized.includes('failed')) return { icon: 'error', color: 'charts.red' };
      if (normalized.includes('breakpoint')) return { icon: 'debug-breakpoint', color: 'charts.red' };
      if (normalized.includes('paused')) return { icon: 'debug-pause', color: 'charts.orange' };
      if (normalized.includes('resumed')) return { icon: 'debug-continue', color: 'charts.green' };
      if (normalized.includes('stepped')) return { icon: 'debug-step-over', color: 'charts.blue' };
      if (normalized.includes('started')) return { icon: 'debug-alt', color: 'charts.yellow' };
      if (normalized.includes('stopped') || normalized.includes('unregistered')) return { icon: 'circle-slash', color: 'descriptionForeground' };
      if (normalized.startsWith('agent.')) return { icon: 'plug', color: 'charts.purple' };
      return { icon: 'list-unordered', color: 'descriptionForeground' };
    }
  }
}

function eventLabel(type: string): string {
  switch (type) {
    case 'agent.registered': return 'AGENT REGISTERED';
    case 'agent.heartbeat': return 'HEARTBEAT';
    case 'agent.unregistered': return 'AGENT UNREGISTERED';
    case 'agent.breakpoint.registered': return 'BP REGISTERED';
    case 'agent.breakpoint.removed': return 'BP REMOVED';
    case 'debug.breakpoint.hit': return 'BREAKPOINT HIT';
    case 'debug.execution.paused': return 'PAUSED';
    case 'debug.execution.resumed': return 'RESUMED';
    case 'debug.execution.stepped': return 'STEPPED';
    case 'debug.execution.terminated': return 'TERMINATED';
    case 'debug.session.started': return 'SESSION STARTED';
    case 'debug.session.stopped': return 'SESSION STOPPED';
    case 'debug.exception.thrown': return 'EXCEPTION';
    default: return type.toUpperCase();
  }
}

function formatTime(timestamp: number | undefined): string {
  const date = new Date(timestamp || Date.now());
  return date.toLocaleTimeString('tr-TR', { hour12: false });
}

function formatLocation(data: Record<string, unknown>): string {
  const file = getRecordString(data, 'file');
  const line = getRecordNumber(data, 'line');
  if (!file && !line) return '';
  const filename = file?.split('/').pop() ?? '?';
  return line ? `${filename}:${line}` : filename;
}

function safeJson(value: unknown): string {
  try {
    const json = JSON.stringify(value ?? {});
    return json.length > 240 ? `${json.slice(0, 237)}...` : json;
  } catch {
    return String(value);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function getRecordString(value: unknown, key: string): string | undefined {
  if (!isRecord(value)) return undefined;
  const direct = value[key];
  return typeof direct === 'string' && direct.trim() ? direct.trim() : undefined;
}

function getRecordNumber(value: unknown, key: string): number | undefined {
  if (!isRecord(value)) return undefined;
  const direct = value[key];
  return typeof direct === 'number' && Number.isFinite(direct) ? direct : undefined;
}
