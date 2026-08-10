import * as path from 'path';
import * as vscode from 'vscode';
import { emitPipeletDragStart, type PipeletDragPayload } from './DragBridge';

class PipeletTreeItem extends vscode.TreeItem {
  constructor(public readonly uri: vscode.Uri, iconPath: vscode.Uri) {
    super(path.basename(uri.fsPath), vscode.TreeItemCollapsibleState.None);
    this.tooltip = uri.fsPath;
    this.description = path.dirname(uri.fsPath).split(path.sep).pop() || '';
    this.contextValue = 'pipeletFile';
    this.iconPath = iconPath;
    this.command = {
      command: 'reactdnd.insertPipeletToFlow',
      title: 'Insert Pipelet To Flow',
      arguments: [
        {
          name: path.basename(uri.fsPath),
          uri: uri.toString(),
          content: '',
        } satisfies PipeletDragPayload,
      ],
    };
  }
}

export class PipeletTreeViewProvider
  implements
    vscode.TreeDataProvider<PipeletTreeItem>,
    vscode.TreeDragAndDropController<PipeletTreeItem>
{
  public static readonly viewId = 'reactdnd.pipeletExplorerView';

  readonly dragMimeTypes = [
    'application/reactdnd.pipelet',
  ];

  readonly dropMimeTypes = [];

  private readonly _onDidChangeTreeData =
    new vscode.EventEmitter<PipeletTreeItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private readonly watcher: vscode.FileSystemWatcher;
  private readonly pipeletIconUri: vscode.Uri;

  constructor(private readonly context: vscode.ExtensionContext) {
    this.pipeletIconUri = vscode.Uri.joinPath(
      this.context.extensionUri,
      'resources',
      'pipelet-file-icon.svg'
    );
    this.watcher = vscode.workspace.createFileSystemWatcher('**/*.pipelet');
    const refresh = () => this.refresh();
    this.watcher.onDidCreate(refresh);
    this.watcher.onDidChange(refresh);
    this.watcher.onDidDelete(refresh);
  }

  dispose(): void {
    this.watcher.dispose();
    this._onDidChangeTreeData.dispose();
  }

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: PipeletTreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(_element?: PipeletTreeItem): Promise<PipeletTreeItem[]> {
    const uris = await vscode.workspace.findFiles('**/*.pipelet');
    const sorted = uris.sort((a, b) =>
      path.basename(a.fsPath).localeCompare(path.basename(b.fsPath))
    );
    return sorted.map((uri) => new PipeletTreeItem(uri, this.pipeletIconUri));
  }

  async handleDrag(
    source: readonly PipeletTreeItem[],
    treeDataTransfer: vscode.DataTransfer,
    _token: vscode.CancellationToken
  ): Promise<void> {
    if (!source.length) {
      return;
    }

    const contentBytes = await vscode.workspace.fs.readFile(source[0].uri);
    const first = {
      name: path.basename(source[0].uri.fsPath),
      uri: source[0].uri.toString(),
      content: Buffer.from(contentBytes).toString('utf-8'),
    } satisfies PipeletDragPayload;
    emitPipeletDragStart(first);
    treeDataTransfer.set(
      'application/reactdnd.pipelet',
      new vscode.DataTransferItem(JSON.stringify(first))
    );
  }

  async handleDrop(
    _target: PipeletTreeItem | undefined,
    _sources: vscode.DataTransfer,
    _token: vscode.CancellationToken
  ): Promise<void> {
    // Tree is source-only for this workflow.
  }
}
