import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { emitPipeletDragStart, type PipeletDragPayload } from './DragBridge';

// ─── Constants ────────────────────────────────────────────────────────────────

/**
 * All recognised sub-folders of a cartridge, in display order.
 * Each folder carries a unique icon key and an optional file glob for its contents.
 */
export const CARTRIDGE_FOLDERS = [
  { key: 'model',         label: 'model',         icon: 'cartridge-model-icon.svg',         glob: '**/*'       },
  { key: 'components',    label: 'components',     icon: 'cartridge-components-icon.svg',    glob: '**/*'       },
  { key: 'config',        label: 'config',         icon: 'cartridge-config-icon.svg',        glob: '**/*'       },
  { key: 'docs',          label: 'docs',           icon: 'cartridge-docs-icon.svg',          glob: '**/*'       },
  { key: 'extensions',    label: 'extensions',     icon: 'cartridge-extensions-icon.svg',    glob: '**/*'       },
  { key: 'localizations', label: 'localizations',  icon: 'cartridge-localizations-icon.svg', glob: '**/*'       },
  { key: 'pipelets',      label: 'pipelets',       icon: 'cartridge-pipelets-icon.svg',      glob: '**/*'       },
  { key: 'pipelines',     label: 'pipelines',      icon: 'cartridge-pipelines-icon.svg',     glob: '**/*.flow'  },
  { key: 'queries',       label: 'queries',        icon: 'cartridge-queries-icon.svg',       glob: '**/*'       },
  { key: 'static',        label: 'static',         icon: 'cartridge-static-icon.svg',        glob: '**/*'       },
  { key: 'federation',    label: 'federation',     icon: 'cartridge-federation-icon.svg',    glob: '**/*'       },
  { key: 'urlrewrite',    label: 'urlrewrite',     icon: 'cartridge-urlrewrite-icon.svg',    glob: '**/*'       },
  { key: 'webforms',      label: 'webforms',       icon: 'cartridge-webforms-icon.svg',      glob: '**/*'       },
  { key: 'endpoints',     label: 'endpoints',      icon: 'cartridge-endpoints-icon.svg',     glob: '**/*'       },
  { key: 'ai',            label: 'ai',             icon: 'cartridge-ai-icon.svg',            glob: '**/*'       },
] as const;

type FolderKey = (typeof CARTRIDGE_FOLDERS)[number]['key'];

// ─── Tree item types ──────────────────────────────────────────────────────────

/** Root-level cartridge item (a workspace sub-folder that looks like a cartridge). */
export class CartridgeItem extends vscode.TreeItem {
  readonly kind = 'cartridge' as const;

  constructor(
    public readonly cartridgePath: string,
    public readonly cartridgeName: string,
    iconUri: vscode.Uri,
  ) {
    super(cartridgeName, vscode.TreeItemCollapsibleState.Collapsed);
    this.description  = cartridgePath;
    this.tooltip      = cartridgePath;
    this.contextValue = 'cartridge';
    this.iconPath     = iconUri;
  }
}

/** One of the standard sub-folder nodes (model, components, pipelines, …). */
export class CartridgeFolderItem extends vscode.TreeItem {
  readonly kind = 'folder' as const;

  constructor(
    public readonly folderKey: FolderKey,
    public readonly folderPath: string,
    public readonly cartridge: CartridgeItem,
    label: string,
    iconUri: vscode.Uri,
    hasChildren: boolean,
  ) {
    super(
      label,
      hasChildren
        ? vscode.TreeItemCollapsibleState.Collapsed
        : vscode.TreeItemCollapsibleState.None,
    );
    this.description  = folderKey === 'pipelines' ? `${label}` : undefined;
    this.tooltip      = folderPath;
    this.contextValue = `cartridgeFolder_${folderKey}`;
    this.iconPath     = iconUri;
  }
}

/** A file inside a cartridge folder. */
export class CartridgeFileItem extends vscode.TreeItem {
  readonly kind = 'file' as const;

  constructor(
    public readonly uri: vscode.Uri,
    public readonly folderKey: FolderKey,
    iconUri: vscode.Uri,
  ) {
    super(path.basename(uri.fsPath), vscode.TreeItemCollapsibleState.None);
    this.tooltip      = uri.fsPath;
    this.description  = path.relative(path.join(uri.fsPath, '..', '..'), uri.fsPath);
    this.contextValue = `cartridgeFile_${folderKey}`;
    this.iconPath     = iconUri;
    this.resourceUri  = uri;

    // For .flow files open in the custom editor; for everything else open as text
    this.command = {
      command: 'vscode.open',
      title: 'Open',
      arguments: [uri],
    };
  }
}

/** A pipelet definition with an optional adjacent function handler child. */
export class PipeletFileItem extends vscode.TreeItem {
  readonly kind = 'pipelet' as const;

  constructor(
    public readonly uri: vscode.Uri,
    public readonly handlerUri: vscode.Uri | undefined,
    iconUri: vscode.Uri,
  ) {
    super(
      path.basename(uri.fsPath),
      handlerUri
        ? vscode.TreeItemCollapsibleState.Collapsed
        : vscode.TreeItemCollapsibleState.None,
    );
    this.tooltip      = handlerUri ? `${uri.fsPath}\nhandler: ${handlerUri.fsPath}` : uri.fsPath;
    this.description  = handlerUri ? path.basename(handlerUri.fsPath) : undefined;
    this.contextValue = 'cartridgePipeletFile';
    this.iconPath     = iconUri;
    this.resourceUri  = uri;
    this.command = {
      command: 'vscode.open',
      title: 'Open Pipelet Definition',
      arguments: [uri],
    };
  }
}

/** Function handler file nested under its owning pipelet definition. */
export class PipeletHandlerFileItem extends vscode.TreeItem {
  readonly kind = 'pipeletHandler' as const;

  constructor(
    public readonly uri: vscode.Uri,
    public readonly pipeletUri: vscode.Uri,
    iconUri: vscode.Uri,
  ) {
    super(path.basename(uri.fsPath), vscode.TreeItemCollapsibleState.None);
    this.tooltip      = uri.fsPath;
    this.description  = 'function';
    this.contextValue = 'cartridgePipeletHandlerFile';
    this.iconPath     = iconUri;
    this.resourceUri  = uri;
    this.command = {
      command: 'vscode.open',
      title: 'Open Pipelet Function',
      arguments: [uri],
    };
  }
}

/** A start-node entry under a pipeline (.flow) file. */
export class PipelineStartNodeItem extends vscode.TreeItem {
  readonly kind = 'startNode' as const;

  constructor(
    public readonly nodeId: string,
    public readonly nodeLabel: string,
    public readonly pipelineUri: vscode.Uri,
    iconUri: vscode.Uri,
  ) {
    super(nodeLabel, vscode.TreeItemCollapsibleState.None);
    this.tooltip      = `Start node: ${nodeId}`;
    this.description  = nodeId;
    this.contextValue = 'pipelineStartNode';
    this.iconPath     = iconUri;
  }
}

/** A pipeline (.flow) file that can be expanded to show its start nodes. */
export class PipelineFileItem extends vscode.TreeItem {
  readonly kind = 'pipeline' as const;

  constructor(
    public readonly uri: vscode.Uri,
    pipelineIconUri: vscode.Uri,
    hasStartNodes: boolean,
  ) {
    super(
      path.basename(uri.fsPath),
      hasStartNodes
        ? vscode.TreeItemCollapsibleState.Collapsed
        : vscode.TreeItemCollapsibleState.None,
    );
    this.tooltip      = uri.fsPath;
    this.contextValue = 'pipelineFile';
    this.iconPath     = pipelineIconUri;
    this.command      = undefined; // expand to see start nodes; double-click via arrow
  }
}

export type CartridgeTreeItem =
  | CartridgeItem
  | CartridgeFolderItem
  | CartridgeFileItem
  | PipeletFileItem
  | PipeletHandlerFileItem
  | PipelineFileItem
  | PipelineStartNodeItem;

// ─── Provider ────────────────────────────────────────────────────────────────

export class CartridgeExplorerProvider
  implements
    vscode.TreeDataProvider<CartridgeTreeItem>,
    vscode.TreeDragAndDropController<CartridgeTreeItem>
{
  public static readonly viewId = 'reactdnd.cartridgeExplorerView';

  readonly dragMimeTypes = ['application/reactdnd.pipelet'];
  readonly dropMimeTypes = [];

  private readonly _onDidChangeTreeData =
    new vscode.EventEmitter<CartridgeTreeItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  /** Icon URI map, built once in constructor. */
  private readonly icons: Map<string, vscode.Uri> = new Map();

  private watcher: vscode.FileSystemWatcher | undefined;

  constructor(private readonly context: vscode.ExtensionContext) {
    this.buildIconMap();
    this.watchWorkspace();
  }

  private buildIconMap(): void {
    const res = (name: string) =>
      vscode.Uri.joinPath(this.context.extensionUri, 'resources', name);

    this.icons.set('cartridge',    res('cartridge-icon.svg'));
    this.icons.set('pipeline-file',res('cartridge-pipeline-file-icon.svg'));
    this.icons.set('startnode',    res('cartridge-startnode-icon.svg'));

    for (const f of CARTRIDGE_FOLDERS) {
      this.icons.set(f.key, res(f.icon));
    }
  }

  private icon(key: string): vscode.Uri {
    return this.icons.get(key) ?? vscode.Uri.joinPath(this.context.extensionUri, 'resources', 'pipelet-file-icon.svg');
  }

  private watchWorkspace(): void {
    this.watcher?.dispose();
    this.watcher = vscode.workspace.createFileSystemWatcher('**');
    const refresh = () => this.refresh();
    this.watcher.onDidCreate(refresh);
    this.watcher.onDidChange(refresh);
    this.watcher.onDidDelete(refresh);
    this.context.subscriptions.push(this.watcher);
  }

  dispose(): void {
    this.watcher?.dispose();
    this._onDidChangeTreeData.dispose();
  }

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: CartridgeTreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: CartridgeTreeItem): Promise<CartridgeTreeItem[]> {
    // ── Root: list cartridges ──────────────────────────────────────────────
    if (!element) {
      return this.getCartridges();
    }

    // ── Cartridge → sub-folders ───────────────────────────────────────────
    if (element.kind === 'cartridge') {
      return this.getCartridgeFolders(element);
    }

    // ── Folder → files (pipelines special-cased) ─────────────────────────
    if (element.kind === 'folder') {
      if (element.folderKey === 'pipelines') {
        return this.getPipelineFiles(element);
      }
      if (element.folderKey === 'pipelets') {
        return this.getPipeletFiles(element);
      }
      return this.getFolderFiles(element);
    }

    // ── Pipelet definition → function handler ────────────────────────────
    if (element.kind === 'pipelet') {
      return this.getPipeletHandlerFiles(element);
    }

    // ── Pipeline file → start nodes ───────────────────────────────────────
    if (element.kind === 'pipeline') {
      return this.getStartNodes(element);
    }

    return [];
  }

  // ── Cartridge discovery ──────────────────────────────────────────────────

  /**
   * A cartridge is any direct sub-folder of a workspace root that contains
   * at least one of the known cartridge sub-folder names.
   * Also accepts any direct child named exactly like a cartridge folder key
   * to support flat workspace layouts (e.g. a single cartridge at root).
   */
  private async getCartridges(): Promise<CartridgeItem[]> {
    const roots = vscode.workspace.workspaceFolders;
    if (!roots || roots.length === 0) { return []; }

    const cartridges: CartridgeItem[] = [];
    const folderKeys = new Set(CARTRIDGE_FOLDERS.map((f) => f.key));

    for (const root of roots) {
      // Check if the workspace root itself is a cartridge
      if (this.isCartridge(root.uri.fsPath, folderKeys)) {
        cartridges.push(new CartridgeItem(
          root.uri.fsPath,
          root.name,
          this.icon('cartridge'),
        ));
        continue;
      }

      // Otherwise look for child directories that are cartridges
      let entries: [string, vscode.FileType][] = [];
      try {
        entries = await vscode.workspace.fs.readDirectory(root.uri);
      } catch { continue; }

      for (const [name, type] of entries) {
        if (type !== vscode.FileType.Directory) { continue; }
        const childPath = path.join(root.uri.fsPath, name);
        if (this.isCartridge(childPath, folderKeys)) {
          cartridges.push(new CartridgeItem(childPath, name, this.icon('cartridge')));
        }
      }
    }

    return cartridges.sort((a, b) => a.cartridgeName.localeCompare(b.cartridgeName));
  }

  private isCartridge(dirPath: string, folderKeys: Set<string>): boolean {
    try {
      const children = fs.readdirSync(dirPath, { withFileTypes: true });
      return children.some(
        (d) => d.isDirectory() && folderKeys.has(d.name),
      );
    } catch {
      return false;
    }
  }

  // ── Sub-folders ──────────────────────────────────────────────────────────

  private async getCartridgeFolders(cartridge: CartridgeItem): Promise<CartridgeFolderItem[]> {
    const result: CartridgeFolderItem[] = [];

    for (const folder of CARTRIDGE_FOLDERS) {
      const folderPath = path.join(cartridge.cartridgePath, folder.key);
      if (!fs.existsSync(folderPath)) { continue; }

      const hasChildren = this.hasAnyChild(folderPath);
      result.push(new CartridgeFolderItem(
        folder.key,
        folderPath,
        cartridge,
        folder.label,
        this.icon(folder.key),
        hasChildren,
      ));
    }

    return result;
  }

  private hasAnyChild(dirPath: string): boolean {
    try {
      return fs.readdirSync(dirPath).length > 0;
    } catch { return false; }
  }

  // ── Generic file listing ─────────────────────────────────────────────────

  private async getFolderFiles(folder: CartridgeFolderItem): Promise<CartridgeFileItem[]> {
    const files: CartridgeFileItem[] = [];
    try {
      this.collectFiles(folder.folderPath, folder.folderKey, files);
    } catch { /* empty */ }
    return files.sort((a, b) =>
      path.basename(a.uri.fsPath).localeCompare(path.basename(b.uri.fsPath))
    );
  }

  private collectFiles(
    dir: string,
    folderKey: FolderKey,
    out: CartridgeFileItem[],
    depth = 0,
  ): void {
    if (depth > 5) { return; }
    let entries: fs.Dirent[];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
    catch { return; }

    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        this.collectFiles(full, folderKey, out, depth + 1);
      } else if (entry.isFile()) {
        out.push(new CartridgeFileItem(
          vscode.Uri.file(full),
          folderKey,
          this.fileIcon(entry.name, folderKey),
        ));
      }
    }
  }

  /** Pick the best icon for a file based on its extension / folder type. */
  private fileIcon(name: string, folderKey: FolderKey): vscode.Uri {
    if (name.endsWith('.flow'))    { return this.icon('pipeline-file'); }
    if (name.endsWith('.pipelet')) { return vscode.Uri.joinPath(this.context.extensionUri, 'resources', 'pipelet-file-icon.svg'); }
    return this.icon(folderKey);
  }

  // ── Pipelets folder ─────────────────────────────────────────────────────

  private async getPipeletFiles(folder: CartridgeFolderItem): Promise<PipeletFileItem[]> {
    const pipelets: PipeletFileItem[] = [];
    try {
      this.collectPipeletFiles(folder.folderPath, pipelets);
    } catch { /* empty */ }
    return pipelets.sort((a, b) =>
      path.basename(a.uri.fsPath).localeCompare(path.basename(b.uri.fsPath))
    );
  }

  private collectPipeletFiles(dir: string, out: PipeletFileItem[], depth = 0): void {
    if (depth > 5) { return; }
    let entries: fs.Dirent[];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
    catch { return; }

    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        this.collectPipeletFiles(full, out, depth + 1);
        continue;
      }
      if (!entry.isFile() || !entry.name.endsWith('.pipelet')) { continue; }

      const pipeletUri = vscode.Uri.file(full);
      out.push(new PipeletFileItem(
        pipeletUri,
        this.resolvePipeletHandlerUri(full),
        vscode.Uri.joinPath(this.context.extensionUri, 'resources', 'pipelet-file-icon.svg'),
      ));
    }
  }

  private async getPipeletHandlerFiles(pipelet: PipeletFileItem): Promise<PipeletHandlerFileItem[]> {
    if (!pipelet.handlerUri) { return []; }
    return [new PipeletHandlerFileItem(pipelet.handlerUri, pipelet.uri, this.icon('pipelets'))];
  }

  private resolvePipeletHandlerUri(pipeletPath: string): vscode.Uri | undefined {
    const handlerPath = this.readPipeletHandlerPath(pipeletPath);
    if (handlerPath) {
      const resolved = path.resolve(path.dirname(pipeletPath), handlerPath);
      if (fs.existsSync(resolved) && fs.statSync(resolved).isFile()) {
        return vscode.Uri.file(resolved);
      }
    }

    const base = pipeletPath.replace(/\.pipelet$/i, '');
    for (const ext of ['.ts', '.js', '.mjs', '.cjs']) {
      const candidate = `${base}${ext}`;
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
        return vscode.Uri.file(candidate);
      }
    }
    return undefined;
  }

  private readPipeletHandlerPath(pipeletPath: string): string | undefined {
    try {
      const raw = fs.readFileSync(pipeletPath, 'utf8');
      const match = raw.match(/^\s*(?:handler|function|functionHandler)\s*:\s*["']?([^"'\r\n#]+)["']?\s*(?:#.*)?$/im);
      return match?.[1]?.trim() || undefined;
    } catch {
      return undefined;
    }
  }

  // ── Pipelines folder ─────────────────────────────────────────────────────

  private async getPipelineFiles(folder: CartridgeFolderItem): Promise<PipelineFileItem[]> {
    const files: PipelineFileItem[] = [];
    try {
      const entries = fs.readdirSync(folder.folderPath, { withFileTypes: true });
      for (const e of entries) {
        if (!e.isFile() || !e.name.endsWith('.flow')) { continue; }
        const uri = vscode.Uri.file(path.join(folder.folderPath, e.name));
        const startNodes = this.parseStartNodes(uri.fsPath);
        files.push(new PipelineFileItem(uri, this.icon('pipeline-file'), startNodes.length > 0));
      }
    } catch { /* empty */ }
    return files.sort((a, b) =>
      path.basename(a.uri.fsPath).localeCompare(path.basename(b.uri.fsPath))
    );
  }

  // ── Start nodes ──────────────────────────────────────────────────────────

  private async getStartNodes(pipeline: PipelineFileItem): Promise<PipelineStartNodeItem[]> {
    const nodes = this.parseStartNodes(pipeline.uri.fsPath);
    return nodes.map(
      (n) => new PipelineStartNodeItem(n.id, n.label, pipeline.uri, this.icon('startnode')),
    );
  }

  private parseStartNodes(flowPath: string): Array<{ id: string; label: string }> {
    try {
      const raw  = fs.readFileSync(flowPath, 'utf8');
      const flow = JSON.parse(raw) as {
        nodes?: Array<{ id: string; type?: string; data?: { label?: string } }>;
      };
      if (!Array.isArray(flow.nodes)) { return []; }
      return flow.nodes
        .filter((n) => n.type === 'start')
        .map((n) => ({
          id:    String(n.id),
          label: n.data?.label ?? n.id ?? 'Start',
        }));
    } catch {
      return [];
    }
  }

  // ── Drag & Drop ──────────────────────────────────────────────────────────

  async handleDrag(
    source: readonly CartridgeTreeItem[],
    dataTransfer: vscode.DataTransfer,
    _token: vscode.CancellationToken,
  ): Promise<void> {
    const pipelet = source.find(
      (i): i is CartridgeFileItem | PipeletFileItem =>
        (i.kind === 'pipelet') ||
        (i.kind === 'file' && i.uri.fsPath.endsWith('.pipelet')),
    );
    if (!pipelet) { return; }

    const payload: PipeletDragPayload = {
      name: path.basename(pipelet.uri.fsPath),
      uri:  pipelet.uri.toString(),
      content: fs.readFileSync(pipelet.uri.fsPath, 'utf8'),
    };
    emitPipeletDragStart(payload);
    dataTransfer.set(
      'application/reactdnd.pipelet',
      new vscode.DataTransferItem(JSON.stringify(payload)),
    );
  }

  async handleDrop(
    _target: CartridgeTreeItem | undefined,
    _sources: vscode.DataTransfer,
    _token: vscode.CancellationToken,
  ): Promise<void> {
    // Source-only tree.
  }
}
