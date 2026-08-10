import * as fs from 'fs';
import * as http from 'http';
import * as https from 'https';
import * as path from 'path';
import * as vscode from 'vscode';

const FLOW_SYNC_CONFIG = '.flow-sync.json';

type Json = Record<string, unknown>;

interface FlowPayload {
  fileName: string;
  source?: string;
  flow: Json;
}

interface FlowVersion {
  fileName: string;
  version: number;
  flow: Json;
  createdAt?: string;
  source?: string;
}

interface SyncConfig {
  baseUrl: string;
}

const DEFAULT_SYNC_CONFIG: SyncConfig = {
  baseUrl: 'http://localhost:3012',
};

export class FlowFileItem extends vscode.TreeItem {
  readonly kind = 'flow-file' as const;

  constructor(
    public readonly uri: vscode.Uri | undefined,
    public readonly relPath: string,
    public readonly inProject: boolean,
    public readonly inCloud: boolean,
    public readonly localVersion?: number,
    public readonly latestVersion?: number,
    public readonly pendingSync = false,
    public readonly latestCreatedAt?: string,
  ) {
    const projectMark = inProject ? ' [P]' : '';
    super(`${path.basename(relPath)}${projectMark}`, vscode.TreeItemCollapsibleState.Collapsed);
    const hasLocal = typeof localVersion === 'number';
    const hasRemote = typeof latestVersion === 'number';

    if (latestVersion) {
      const localLabel = typeof localVersion === 'number' ? `local v${localVersion} • ` : '';
      const remoteLabel = `remote v${latestVersion}`;
      this.description = pendingSync
        ? `${localLabel}${remoteLabel} • not synced`
        : `${localLabel}${remoteLabel} • synced`;
    } else {
      this.description = typeof localVersion === 'number'
        ? `local v${localVersion} • not synced`
        : 'not synced';
    }
    this.tooltip = relPath;
    this.contextValue = pendingSync ? 'flowSyncFilePending' : (hasRemote ? 'flowSyncFile' : 'flowSyncFileUnsynced');
    this.iconPath = inCloud
      ? new vscode.ThemeIcon('cloud', pendingSync ? new vscode.ThemeColor('charts.yellow') : new vscode.ThemeColor('charts.green'))
      : new vscode.ThemeIcon('file-code', new vscode.ThemeColor('charts.blue'));
  }
}

export class FlowVersionItem extends vscode.TreeItem {
  readonly kind = 'flow-version' as const;

  constructor(
    public readonly file: FlowFileItem,
    public readonly version: FlowVersion,
  ) {
    super(`v${version.version}`, vscode.TreeItemCollapsibleState.None);
    const when = version.createdAt ? new Date(version.createdAt).toLocaleString() : 'unknown';
    this.description = when;
    this.tooltip = `v${version.version} • ${when}${version.source ? ` • ${version.source}` : ''}`;
    this.contextValue = 'flowSyncVersion';
    this.iconPath = new vscode.ThemeIcon('history', new vscode.ThemeColor('charts.green'));
    this.command = {
      command: 'reactdnd.flowSyncRollbackVersion',
      title: 'Rollback to this version',
      arguments: [this],
    };
  }
}

type FlowSyncItem = FlowFileItem | FlowVersionItem;

export class FlowSyncViewProvider implements vscode.TreeDataProvider<FlowSyncItem> {
  static readonly viewId = 'reactdnd.flowSyncView';

  private readonly _onDidChangeTreeData = new vscode.EventEmitter<FlowSyncItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
  private versionsCache = new Map<string, FlowVersion[]>();

  constructor(private readonly context: vscode.ExtensionContext) {}

  dispose(): void {
    this._onDidChangeTreeData.dispose();
  }

  refresh(): void {
    this.versionsCache.clear();
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: FlowSyncItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: FlowSyncItem): Promise<FlowSyncItem[]> {
    if (!element) {
      const localUris = await this.findFlowFiles();
      const latestByFile = await this.getLatestByFile();
      const localByName = new Map<string, { uri: vscode.Uri; relPath: string }>();
      for (const uri of localUris) {
        const relPath = vscode.workspace.asRelativePath(uri, false);
        localByName.set(path.basename(relPath), { uri, relPath });
      }

      const remoteByName = new Map<string, FlowVersion>();
      for (const item of latestByFile.values()) {
        const name = path.basename(String(item.fileName ?? ''));
        if (!name) { continue; }
        const current = remoteByName.get(name);
        if (!current || (item.version ?? 0) > (current.version ?? 0)) {
          remoteByName.set(name, item);
        }
      }

      const allNames = new Set<string>([
        ...localByName.keys(),
        ...remoteByName.keys(),
      ]);

      const result: FlowFileItem[] = [];
      for (const name of allNames) {
        const local = localByName.get(name);
        const remote = remoteByName.get(name);
        const relPath = local?.relPath ?? name;
        const localVersion = local?.uri ? await this.getLocalVersion(local.uri) : undefined;
        const pendingSync = await this.isPendingSync(local?.uri, localVersion, remote?.version, remote?.createdAt);
        result.push(
          new FlowFileItem(
            local?.uri,
            relPath,
            Boolean(local),
            Boolean(remote),
            localVersion,
            remote?.version,
            pendingSync,
            remote?.createdAt,
          )
        );
      }
      return result.sort((a, b) => a.relPath.localeCompare(b.relPath));
    }

    if (element.kind === 'flow-file') {
      const versions = await this.getVersions(path.basename(element.relPath));
      return [...versions]
        .sort((a, b) => b.version - a.version)
        .map((v) => new FlowVersionItem(element, v));
    }

    return [];
  }

  async syncActiveFlow(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor || !editor.document.uri.fsPath.endsWith('.flow')) {
      vscode.window.showWarningMessage('Open a .flow file first.');
      return;
    }
    await this.syncUri(editor.document.uri, 'editor-manual');
    this.refresh();
  }

  async syncFile(item?: FlowFileItem): Promise<void> {
    const target = item ?? (await this.pickFlowFile());
    if (!target) { return; }
    if (!target.uri) {
      vscode.window.showWarningMessage('This flow exists only in cloud. Pull latest to create a local file first.');
      return;
    }
    await this.syncUri(target.uri, 'editor-file-sync');
    this.refresh();
  }

  async syncAllFlows(): Promise<void> {
    const uris = await this.findFlowFiles();
    if (uris.length === 0) {
      vscode.window.showInformationMessage('No .flow files found.');
      return;
    }

    const nodes: FlowPayload[] = [];
    for (const uri of uris) {
      const payload = await this.buildPayload(uri, 'editor-bulk-sync');
      if (payload) {
        nodes.push(payload);
      }
    }

    if (nodes.length === 0) {
      vscode.window.showWarningMessage('No valid .flow JSON content found to sync.');
      return;
    }

    try {
      await this.requestJson('/api/nodes/sync', 'POST', { nodes });
      vscode.window.showInformationMessage(`Synced ${nodes.length} flow file(s).`);
      this.refresh();
    } catch (err) {
      vscode.window.showErrorMessage(`Flow sync failed: ${String(err)}`);
    }
  }

  async pullLatestToLocal(item?: FlowFileItem): Promise<void> {
    const file = item ?? (await this.pickFlowFile());
    if (!file) { return; }

    try {
      const latest = await this.requestJson(`/api/flows/${encodeURIComponent(path.basename(file.relPath))}`, 'GET');
      if (!latest || typeof latest !== 'object' || !('flow' in latest)) {
        vscode.window.showWarningMessage('No latest flow found on server.');
        return;
      }
      const flow = (latest as { flow: unknown }).flow;
      const serialized = JSON.stringify(flow ?? {}, null, 2);
      if (file.uri) {
        await vscode.workspace.fs.writeFile(file.uri, Buffer.from(serialized, 'utf8'));
      } else {
        const root = vscode.workspace.workspaceFolders?.[0]?.uri;
        if (!root) {
          vscode.window.showWarningMessage('No workspace folder open to create local flow file.');
          return;
        }
        const targetUri = vscode.Uri.joinPath(root, file.relPath);
        await vscode.workspace.fs.writeFile(targetUri, Buffer.from(serialized, 'utf8'));
      }
      vscode.window.showInformationMessage(`Pulled latest version to ${file.relPath}`);
    } catch (err) {
      vscode.window.showErrorMessage(`Pull latest failed: ${String(err)}`);
    }
  }

  async rollbackVersion(item: FlowVersionItem): Promise<void> {
    const confirm = await vscode.window.showWarningMessage(
      `Rollback ${item.file.relPath} to v${item.version.version}? This creates a new version.`,
      { modal: true },
      'Rollback'
    );
    if (confirm !== 'Rollback') { return; }

    const fileName = path.basename(item.file.relPath);
    try {
      const picked = await this.requestJson(
        `/api/flows/${encodeURIComponent(fileName)}/versions/${item.version.version}`,
        'GET'
      );

      if (!picked || typeof picked !== 'object' || !('flow' in picked)) {
        vscode.window.showWarningMessage('Selected version could not be loaded.');
        return;
      }

      const req: FlowPayload = {
        fileName,
        source: `rollback:v${item.version.version}`,
        flow: (picked as { flow: Json }).flow,
      };

      await this.requestJson('/api/flows', 'POST', req);
      vscode.window.showInformationMessage(`Rollback completed: ${fileName} -> v${item.version.version}`);
      this.refresh();
    } catch (err) {
      vscode.window.showErrorMessage(`Rollback failed: ${String(err)}`);
    }
  }

  openConfig(): void {
    const cfgPath = this.configPath();
    if (!cfgPath) {
      vscode.window.showWarningMessage('No workspace folder open.');
      return;
    }
    if (!fs.existsSync(cfgPath)) {
      fs.writeFileSync(cfgPath, JSON.stringify(DEFAULT_SYNC_CONFIG, null, 2), 'utf8');
    }
    void vscode.commands.executeCommand('vscode.open', vscode.Uri.file(cfgPath));
  }

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

  private async pickFlowFile(): Promise<FlowFileItem | undefined> {
    const roots = await this.getChildren();
    const files = roots.filter((i): i is FlowFileItem => i.kind === 'flow-file');
    if (files.length === 0) {
      vscode.window.showInformationMessage('No .flow files found.');
      return undefined;
    }

    const picked = await vscode.window.showQuickPick<{ label: string; description?: string; file: FlowFileItem }>(
      files.map((f) => ({
        label: f.relPath,
        description: typeof f.description === 'string' ? f.description : undefined,
        file: f,
      })),
      { title: 'Select flow file' }
    );
    return picked?.file;
  }

  private async findFlowFiles(): Promise<vscode.Uri[]> {
    return vscode.workspace.findFiles('**/*.flow', '**/node_modules/**');
  }

  private async getVersions(fileName: string): Promise<FlowVersion[]> {
    const cached = this.versionsCache.get(fileName);
    if (cached) { return cached; }

    try {
      const data = await this.requestJson(`/api/flows/${encodeURIComponent(fileName)}/versions`, 'GET');
      const d2 = data as Record<string, unknown>;
      const arr: FlowVersion[] = Array.isArray(data)
        ? data as FlowVersion[]
        : Array.isArray(d2.items)
          ? d2.items as FlowVersion[]
          : Array.isArray(d2.versions)
            ? d2.versions as FlowVersion[]
            : [];
      this.versionsCache.set(fileName, arr);
      return arr;
    } catch {
      this.versionsCache.set(fileName, []);
      return [];
    }
  }

  private async getLatestByFile(): Promise<Map<string, FlowVersion>> {
    const map = new Map<string, FlowVersion>();

    const setLatest = (key: string, item: FlowVersion) => {
      const current = map.get(key);
      if (!current || (item.version ?? 0) > (current.version ?? 0)) {
        map.set(key, item);
      }
    };

    try {
      const data = await this.requestJson('/api/flows', 'GET');
      const d = data as Record<string, unknown>;
      const arr: FlowVersion[] = Array.isArray(data)
        ? data as FlowVersion[]
        : Array.isArray(d.items)
          ? d.items as FlowVersion[]
          : Array.isArray(d.flows)
            ? d.flows as FlowVersion[]
            : [];

      for (const item of arr) {
        const raw = String(item.fileName ?? '');
        if (!raw) { continue; }
        const normalized = raw.replace(/\\/g, '/');
        const baseName = path.basename(normalized);
        setLatest(normalized, item);
        setLatest(baseName, item);
      }
    } catch {
      // If service is unreachable, keep empty map and show local files as pending.
    }
    return map;
  }

  private async getLocalVersion(uri: vscode.Uri): Promise<number | undefined> {
    try {
      const raw = await vscode.workspace.fs.readFile(uri);
      const parsed = JSON.parse(Buffer.from(raw).toString('utf8')) as { version?: unknown };
      if (typeof parsed.version === 'number' && Number.isFinite(parsed.version)) {
        return Math.max(0, Math.floor(parsed.version));
      }
      return undefined;
    } catch {
      return undefined;
    }
  }

  private async isPendingSync(
    uri: vscode.Uri | undefined,
    localVersion?: number,
    remoteVersion?: number,
    latestCreatedAt?: string,
  ): Promise<boolean> {
    if (!uri) {
      return false;
    }
    // No remote record means this file should show sync affordance immediately.
    if (typeof remoteVersion !== 'number' && !latestCreatedAt) { return true; }

    // Prefer semantic version comparison when available.
    if (typeof localVersion === 'number' && typeof remoteVersion === 'number') {
      return localVersion > remoteVersion;
    }

    if (!latestCreatedAt) { return true; }

    try {
      const stat = await vscode.workspace.fs.stat(uri);
      const localMs = stat.mtime;
      const remoteMs = new Date(latestCreatedAt).getTime();
      if (!Number.isFinite(remoteMs)) { return true; }
      // Small clock skew tolerance.
      return localMs > remoteMs + 1000;
    } catch {
      return true;
    }
  }

  private configRoot(): string | undefined {
    return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  }

  private configPath(): string | undefined {
    const root = this.configRoot();
    return root ? path.join(root, FLOW_SYNC_CONFIG) : undefined;
  }

  private readConfig(): SyncConfig {
    const cfgPath = this.configPath();
    if (!cfgPath) { return DEFAULT_SYNC_CONFIG; }
    try {
      const raw = fs.readFileSync(cfgPath, 'utf8');
      const json = JSON.parse(raw) as Partial<SyncConfig>;
      return { baseUrl: json.baseUrl ?? DEFAULT_SYNC_CONFIG.baseUrl };
    } catch {
      try {
        fs.writeFileSync(cfgPath, JSON.stringify(DEFAULT_SYNC_CONFIG, null, 2), 'utf8');
      } catch {
        // ignore read-only workspace
      }
      return DEFAULT_SYNC_CONFIG;
    }
  }

  private requestJson(urlPath: string, method: 'GET' | 'POST', body?: unknown): Promise<unknown> {
    const baseUrl = this.readConfig().baseUrl.replace(/\/$/, '');
    const full = `${baseUrl}${urlPath}`;

    return new Promise((resolve, reject) => {
      const u = new URL(full);
      const mod = u.protocol === 'https:' ? https : http;
      const payload = body !== undefined ? JSON.stringify(body) : undefined;

      const req = mod.request(
        u,
        {
          method,
          headers: payload
            ? {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(payload),
              }
            : undefined,
          timeout: 10000,
        },
        (res) => {
          let out = '';
          res.setEncoding('utf8');
          res.on('data', (d: string) => { out += d; });
          res.on('end', () => {
            const status = res.statusCode ?? 0;
            if (status < 200 || status >= 300) {
              reject(new Error(`${method} ${urlPath} -> HTTP ${status}`));
              return;
            }
            if (!out.trim()) {
              resolve({});
              return;
            }
            try {
              resolve(JSON.parse(out));
            } catch {
              resolve({ raw: out });
            }
          });
        }
      );

      req.on('error', reject);
      req.on('timeout', () => req.destroy(new Error('Request timeout')));
      if (payload) { req.write(payload); }
      req.end();
    });
  }
}
