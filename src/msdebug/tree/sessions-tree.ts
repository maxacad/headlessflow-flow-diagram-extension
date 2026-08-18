import * as vscode from 'vscode';
import { OrchestratorClient, SessionDto } from '../orchestrator-client';

type AgentDebugState = 'idle' | 'active' | 'debugging';

export class SessionsTreeProvider implements vscode.TreeDataProvider<SessionItem> {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<SessionItem | undefined | null>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(
    private readonly client: OrchestratorClient,
    private readonly getService: () => string,
    private readonly getWorkspaceId: () => string,
    private readonly getAgentStateCache: () => Map<string, AgentDebugState>,
  ) {}

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: SessionItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: SessionItem): Promise<SessionItem[]> {
    if (element) return [];
    try {
      const sessions = await this.client.listSessions();
      const agentStateCache = this.getAgentStateCache();
      const workspaceId = this.getWorkspaceId();
      const active = sessions
        .filter((s) => ['running', 'active', 'initializing', 'paused', 'stepping', 'replaying', 'stopping'].includes(s.status))
        .filter((s) => !workspaceId || s.workspaceId === workspaceId)
        .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));

      return active.map((s) => {
        const primaryService = s.services[0];
        const debugState = primaryService ? agentStateCache.get(primaryService) : undefined;
        return new SessionItem(s, debugState);
      });
    } catch {
      return [new SessionItem({ id: '', name: 'Error: Cannot connect to orchestrator', status: 'error', services: [], createdAt: '' })];
    }
  }
}

export class SessionItem extends vscode.TreeItem {
  constructor(
    public readonly session: SessionDto,
    private readonly debugState?: 'idle' | 'active' | 'debugging',
  ) {
    super(session.name, vscode.TreeItemCollapsibleState.None);

    const stateLabel = this.debugState ?? session.status;
    this.description = stateLabel;
    this.tooltip = `${session.name} — ${session.services.join(', ')}${this.debugState ? ` — ${this.debugState}` : ''}`;
    this.contextValue = 'debugSession';

    this.iconPath = new vscode.ThemeIcon(
      this.debugState === 'debugging' ? 'debug-pause' :
      this.debugState === 'active' ? 'debug-start' :
      this.debugState === 'idle' ? 'debug-stop' :
      session.status === 'running' || session.status === 'active' ? 'debug-start' :
      session.status === 'stopped' || session.status === 'terminated' ? 'debug-stop' :
      session.status === 'paused' || session.status === 'initializing' ? 'debug-pause' :
      session.status === 'stepping' ? 'debug-step-over' :
      'debug',
    );
  }
}
