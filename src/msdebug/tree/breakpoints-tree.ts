import * as vscode from 'vscode';
import { OrchestratorClient, BreakpointDto, SessionDto } from '../orchestrator-client';
import { belongsToWorkspace } from '../../workspaceIdentity';

type BreakpointsTreeNode = BreakpointGroupItem | BreakpointItem;

export class BreakpointsTreeProvider implements vscode.TreeDataProvider<BreakpointsTreeNode> {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<BreakpointsTreeNode | undefined | null>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
  private refreshHandle: NodeJS.Timeout | undefined;

  constructor(
    private readonly client: OrchestratorClient,
    private readonly getService: () => string,
    private readonly getWorkspaceId: () => string,
  ) {}

  refresh(): void {
    // Coalesce bursty refresh calls (e.g. paired paused/hit events)
    if (this.refreshHandle) return;
    this.refreshHandle = setTimeout(() => {
      this.refreshHandle = undefined;
      this._onDidChangeTreeData.fire(undefined);
    }, 120);
  }

  getTreeItem(element: BreakpointsTreeNode): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: BreakpointsTreeNode): Promise<BreakpointsTreeNode[]> {
    if (element instanceof BreakpointGroupItem) {
      return element.breakpoints.map((bp) => new BreakpointItem(bp));
    }
    if (element) return [];

    try {
      const bps = await this.listWorkspaceBreakpoints();
      const byLocation = new Map<string, BreakpointDto>();

      for (const bp of bps) {
        const key = dedupeKey(bp);
        const existing = byLocation.get(key);
        if (!existing) {
          byLocation.set(key, bp);
          continue;
        }

        // Prefer rows that look more complete/authoritative.
        const preferred = choosePreferred(existing, bp);
        byLocation.set(key, preferred);
      }

      const grouped = new Map<string, BreakpointDto[]>();
      const sorted = Array.from(byLocation.values()).sort((a, b) =>
        a.service.localeCompare(b.service) || breakpointLabel(a).localeCompare(breakpointLabel(b), undefined, { numeric: true }),
      );
      for (const bp of sorted) {
        const service = bp.service || 'unknown';
        const list = grouped.get(service) ?? [];
        list.push(bp);
        grouped.set(service, list);
      }

      return Array.from(grouped.entries())
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([service, breakpoints]) => new BreakpointGroupItem(service, breakpoints));
    } catch {
      return [];
    }
  }

  private async listWorkspaceBreakpoints(): Promise<BreakpointDto[]> {
    const workspaceId = this.getWorkspaceId();
    const sessions = await this.client.listSessions();
    const activeSessions = sessions
      .filter((session) => isActiveSession(session))
      .filter((session) => belongsToWorkspace(session.workspaceId, workspaceId));

    const breakpoints = await Promise.all(
      activeSessions.map((session) => this.client.listBreakpoints(session.id, undefined, workspaceId)),
    );

    return breakpoints.flat();
  }
}

function isActiveSession(session: SessionDto): boolean {
  return ['running', 'active', 'initializing', 'paused', 'stepping', 'replaying', 'stopping'].includes(session.status);
}

/**
 * DAG runtime'inda dosya/satir bir breakpoint'i tanimlamaz: flow engine
 * `dag-<flowId>.js` adini uydurur ve satiri nodeId'den turetir. Gercek kimlik
 * nodeId'dir, o yuzden hem etikette hem tekillestirme anahtarinda onu kullaniyoruz.
 */
function breakpointLabel(bp: BreakpointDto): string {
  if (bp.nodeId) { return bp.nodeId; }
  return `${bp.file.split('/').pop()}:${bp.line}`;
}

function dedupeKey(bp: BreakpointDto): string {
  if (bp.nodeId) { return `${bp.service}|node|${bp.nodeId}`; }
  return `${bp.service}|${normalizeFileKey(bp.file)}|${bp.line}`;
}

function normalizeFileKey(file: string): string {
  return file.trim().replace(/\\/g, '/').toLowerCase();
}

function choosePreferred(a: BreakpointDto, b: BreakpointDto): BreakpointDto {
  if (a.verified !== b.verified) return a.verified ? a : b;
  if ((a.hitCount ?? 0) !== (b.hitCount ?? 0)) return (a.hitCount ?? 0) >= (b.hitCount ?? 0) ? a : b;
  return a.id >= b.id ? a : b;
}

class BreakpointGroupItem extends vscode.TreeItem {
  constructor(
    public readonly service: string,
    public readonly breakpoints: BreakpointDto[],
  ) {
    super(service, vscode.TreeItemCollapsibleState.Expanded);
    this.description = `${breakpoints.length}`;
    this.tooltip = `${service} (${breakpoints.length} breakpoint${breakpoints.length === 1 ? '' : 's'})`;
    this.iconPath = new vscode.ThemeIcon('server-process');
    this.contextValue = 'distributedBreakpointGroup';
  }
}

class BreakpointItem extends vscode.TreeItem {
  constructor(public readonly bp: BreakpointDto) {
    super(breakpointLabel(bp), vscode.TreeItemCollapsibleState.None);

    this.description = bp.hitCount > 0 ? `hits: ${bp.hitCount}` : '';
    this.tooltip = [
      `Service: ${bp.service}`,
      bp.nodeId ? `Node: ${bp.nodeId}` : '',
      `File: ${bp.file}`,
      `Line: ${bp.line}`,
      bp.condition ? `Condition: ${bp.condition}` : '',
      `Verified: ${bp.verified}`,
      `Hit count: ${bp.hitCount}`,
    ]
      .filter(Boolean)
      .join('\n');

    this.iconPath = new vscode.ThemeIcon(
      bp.verified ? 'debug-breakpoint' : 'debug-breakpoint-unverified',
    );
    this.contextValue = 'distributedBreakpoint';
  }
}
