import * as vscode from 'vscode';

type PipeletItem = {
  id: string;
  name: string;
  content: string;
};

export class PipeletExplorerViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'reactdnd.pipeletExplorerView';

  constructor(private readonly context: vscode.ExtensionContext) {}

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    webviewView.webview.options = {
      enableScripts: true,
    };

    webviewView.webview.html = this.getHtmlForWebview(webviewView.webview);

    const postItems = async () => {
      const items = await this.readPipeletItems();
      webviewView.webview.postMessage({ type: 'set-items', items });
    };

    const watcher = vscode.workspace.createFileSystemWatcher('**/*.pipelet');
    const triggerRefresh = () => {
      void postItems();
    };

    watcher.onDidCreate(triggerRefresh);
    watcher.onDidChange(triggerRefresh);
    watcher.onDidDelete(triggerRefresh);

    webviewView.onDidDispose(() => {
      watcher.dispose();
    });

    void postItems();

    webviewView.webview.onDidReceiveMessage(async (message) => {
      if (message?.type === 'copy-pipelet-name' && typeof message.value === 'string') {
        await vscode.env.clipboard.writeText(message.value);
        vscode.window.showInformationMessage(`Copied pipelet: ${message.value}`);
      }
    });
  }

  private async readPipeletItems(): Promise<PipeletItem[]> {
    const uris = await vscode.workspace.findFiles('**/*.pipelet');

    const items: PipeletItem[] = [];
    for (const uri of uris) {
      try {
        const contentBytes = await vscode.workspace.fs.readFile(uri);
        const content = Buffer.from(contentBytes).toString('utf8');
        items.push({
          id: uri.toString(),
          name: uri.path.split('/').pop() || 'unknown.pipelet',
          content,
        });
      } catch {
        items.push({
          id: uri.toString(),
          name: uri.path.split('/').pop() || 'unknown.pipelet',
          content: '',
        });
      }
    }

    return items.sort((a, b) => a.name.localeCompare(b.name));
  }

  private getHtmlForWebview(webview: vscode.Webview): string {
    const nonce = getNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';" />
  <title>Pipelet Explorer</title>
  <style>
    :root {
      --fg: var(--vscode-foreground);
      --muted: var(--vscode-descriptionForeground);
      --bg: var(--vscode-sideBar-background);
      --card: var(--vscode-editor-background);
      --border: var(--vscode-sideBarSectionHeader-border);
      --hover: var(--vscode-list-hoverBackground);
      --accent: var(--vscode-focusBorder);
      --drop-bg: color-mix(in srgb, var(--accent) 10%, transparent);
    }

    * { box-sizing: border-box; }

    body {
      margin: 0;
      padding: 10px;
      color: var(--fg);
      background: var(--bg);
      font-family: var(--vscode-font-family);
    }

    .title {
      font-size: 12px;
      font-weight: 700;
      margin-bottom: 3px;
    }

    .subtitle {
      font-size: 11px;
      color: var(--muted);
      margin-bottom: 10px;
      line-height: 1.35;
    }

    .drop-zone {
      border: 1px dashed var(--border);
      border-radius: 10px;
      padding: 10px;
      font-size: 11px;
      color: var(--muted);
      text-align: center;
      margin-bottom: 10px;
      transition: border-color 120ms ease, background 120ms ease;
    }

    .drop-zone.active {
      border-color: var(--accent);
      background: var(--drop-bg);
    }

    .list {
      display: grid;
      gap: 8px;
      max-height: 60vh;
      overflow: auto;
      padding-right: 2px;
    }

    .empty {
      font-size: 11px;
      color: var(--muted);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 8px;
    }

    .item {
      border: 1px solid var(--border);
      border-radius: 8px;
      background: var(--card);
      padding: 8px;
      cursor: grab;
      user-select: none;
    }

    .item:hover {
      background: var(--hover);
      border-color: var(--accent);
    }

    .item:active { cursor: grabbing; }

    .item-title {
      font-size: 12px;
      font-weight: 700;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .item-sub {
      margin-top: 2px;
      font-size: 10px;
      color: var(--muted);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  </style>
</head>
<body>
  <div class="title">Pipelet File Explorer</div>
  <div class="subtitle">All workspace .pipelet files are listed below. Drag items to Flow Editor canvas; they stay listed after drop.</div>

  <div id="list" class="list"></div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const list = document.getElementById('list');

    /** @type {{id:string,name:string,content:string}[]} */
    let items = [];

    function render() {
      if (!items.length) {
        list.innerHTML = '<div class="empty">No .pipelet files yet.</div>';
        return;
      }

      list.innerHTML = items.map((item) => {
        const escapedName = escapeHtml(item.name);
        const escapedPreview = escapeHtml((item.content || '').slice(0, 60));
        return '<div class="item" draggable="true" data-id="' + item.id + '">' +
          '<div class="item-title">' + escapedName + '</div>' +
          '<div class="item-sub">' + escapedPreview + '</div>' +
          '</div>';
      }).join('');

      list.querySelectorAll('.item').forEach((el) => {
        el.addEventListener('dragstart', (event) => {
          const id = el.getAttribute('data-id');
          const item = items.find((x) => x.id === id);
          if (!item || !event.dataTransfer) return;
          const payload = JSON.stringify({ name: item.name, content: item.content });
          event.dataTransfer.setData('application/reactdnd.pipelet', payload);
          event.dataTransfer.setData('text/plain', item.name);
          event.dataTransfer.effectAllowed = 'copyMove';
        });

        el.addEventListener('click', () => {
          const id = el.getAttribute('data-id');
          const item = items.find((x) => x.id === id);
          if (!item) return;
          vscode.postMessage({ type: 'copy-pipelet-name', value: item.name });
        });
      });
    }

    function escapeHtml(value) {
      return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }

    window.addEventListener('message', (event) => {
      const message = event.data;
      if (message?.type === 'set-items' && Array.isArray(message.items)) {
        items = message.items;
        render();
      }
    });

    render();
  </script>
</body>
</html>`;
  }
}

function getNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < 32; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}
