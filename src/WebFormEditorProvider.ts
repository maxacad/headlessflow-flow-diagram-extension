import * as vscode from 'vscode';

export class WebFormEditorProvider implements vscode.CustomTextEditorProvider {
  public static readonly viewType = 'reactdnd.webFormEditor';

  /** All panels currently open (not yet disposed). */
  private readonly panels = new Set<vscode.WebviewPanel>();

  constructor(private readonly context: vscode.ExtensionContext) {}

  /** Send a set-mode message to whichever panel is currently active/visible. */
  public sendModeToVisible(mode: 'split' | 'json' | 'preview'): void {
    // Prefer the panel that currently has focus
    for (const panel of this.panels) {
      if (panel.active) {
        panel.webview.postMessage({ type: 'set-mode', mode });
        return;
      }
    }
    // Fallback: first visible panel
    for (const panel of this.panels) {
      if (panel.visible) {
        panel.webview.postMessage({ type: 'set-mode', mode });
        return;
      }
    }
  }

  async resolveCustomTextEditor(
    document: vscode.TextDocument,
    webviewPanel: vscode.WebviewPanel,
    _token: vscode.CancellationToken
  ): Promise<void> {
    webviewPanel.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this.context.extensionUri, 'dist'),
      ],
    };

    webviewPanel.webview.html = this.getHtmlForWebview(webviewPanel.webview);

    this.panels.add(webviewPanel);

    const sendUpdate = () => {
      webviewPanel.webview.postMessage({
        type: 'update',
        content: document.getText(),
      });
    };

    let lastAppliedContent: string | null = null;

    const changeSubscription = vscode.workspace.onDidChangeTextDocument((e) => {
      if (e.document.uri.toString() !== document.uri.toString()) { return; }
      const current = document.getText();
      if (lastAppliedContent !== null && current === lastAppliedContent) {
        lastAppliedContent = null;
        return;
      }
      lastAppliedContent = null;
      sendUpdate();
    });

    webviewPanel.onDidDispose(() => {
      this.panels.delete(webviewPanel);
      changeSubscription.dispose();
    });

    webviewPanel.webview.onDidReceiveMessage(async (message) => {
      switch (message.type) {
        case 'ready':
          sendUpdate();
          break;

        case 'content-changed': {
          if (typeof message.content !== 'string') { break; }
          lastAppliedContent = message.content;
          const edit = new vscode.WorkspaceEdit();
          edit.replace(
            document.uri,
            new vscode.Range(0, 0, document.lineCount, 0),
            message.content,
          );
          await vscode.workspace.applyEdit(edit);
          break;
        }

        case 'save':
          await document.save();
          break;
      }
    });
  }

  private getHtmlForWebview(webview: vscode.Webview): string {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webform.js')
    );
    const nonce = getNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none';
             style-src 'unsafe-inline';
             script-src 'nonce-${nonce}';
             img-src data: vscode-resource:;" />
  <title>Web Form Editor</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body, #root { width: 100%; height: 100%; overflow: hidden; }
  </style>
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}

function getNonce(): string {
  let text = '';
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return text;
}
