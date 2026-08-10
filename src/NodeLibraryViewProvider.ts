import * as vscode from 'vscode';

export class NodeLibraryViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'reactdnd.nodeLibraryView';

  constructor(private readonly context: vscode.ExtensionContext) {}

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    webviewView.webview.options = {
      enableScripts: true,
    };

    webviewView.webview.html = this.getHtmlForWebview(webviewView.webview);

    webviewView.webview.onDidReceiveMessage((message) => {
      if (message?.type === 'copy-node-type' && typeof message.value === 'string') {
        vscode.env.clipboard.writeText(message.value);
        vscode.window.showInformationMessage(`Copied node type: ${message.value}`);
      }
    });
  }

  private getHtmlForWebview(webview: vscode.Webview): string {
    const nonce = getNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';" />
  <title>Flow Node Library</title>
  <style>
    :root {
      color-scheme: light dark;
      --fg:        var(--vscode-foreground);
      --muted:     var(--vscode-descriptionForeground);
      --bg:        var(--vscode-sideBar-background);
      --hover:     var(--vscode-list-hoverBackground);
      --active:    var(--vscode-list-activeSelectionBackground);
      --active-fg: var(--vscode-list-activeSelectionForeground);
      --accent:    var(--vscode-focusBorder);
      --section-fg:var(--vscode-sideBarSectionHeader-foreground, var(--vscode-foreground));
      --section-bg:var(--vscode-sideBarSectionHeader-background, transparent);
      --section-bd:var(--vscode-sideBarSectionHeader-border, transparent);
      --row-h: 22px;
      --icon: 16px;
      --indent: 8px;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size, 13px);
      line-height: 1;
      color: var(--fg);
      background: var(--bg);
      overflow-x: hidden;
    }

    /* ── Section header (like Explorer's "OPEN EDITORS" bar) ──────────────── */
    .section-header {
      display: flex;
      align-items: center;
      gap: 4px;
      height: 24px;
      padding: 0 var(--indent);
      background: var(--section-bg);
      border-bottom: 1px solid var(--section-bd);
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: var(--section-fg);
      user-select: none;
      cursor: default;
    }
    .section-header svg { opacity: 0.7; flex-shrink: 0; }

    /* ── Group label row (like a folder in explorer) ──────────────────────── */
    .group-label {
      display: flex;
      align-items: center;
      height: var(--row-h);
      padding: 0 var(--indent);
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.04em;
      color: var(--muted);
      user-select: none;
      cursor: default;
      margin-top: 2px;
    }
    .group-label::before {
      content: '';
      display: inline-block;
      width: 0; height: 0;
      border-top: 4px solid transparent;
      border-bottom: 4px solid transparent;
      border-left: 6px solid var(--muted);
      margin-right: 5px;
      opacity: 0.6;
    }

    /* ── List ─────────────────────────────────────────────────────────────── */
    .list { display: flex; flex-direction: column; }

    /* ── Single row (like a file row in explorer) ─────────────────────────── */
    .item {
      display: flex;
      align-items: center;
      height: var(--row-h);
      padding: 0 var(--indent) 0 20px;
      gap: 5px;
      cursor: grab;
      user-select: none;
      white-space: nowrap;
      overflow: hidden;
    }
    .item:hover  { background: var(--hover); }
    .item:active { cursor: grabbing; background: var(--active); color: var(--active-fg); }
    .item:active .item-detail,
    .item:active .item-name { color: inherit; }

    /* icon cell */
    .item-icon {
      flex-shrink: 0;
      width: var(--icon);
      height: var(--icon);
      display: flex;
      align-items: center;
      justify-content: center;
    }

    /* node name */
    .item-name {
      flex: 1 1 auto;
      font-size: 13px;
      overflow: hidden;
      text-overflow: ellipsis;
      color: var(--fg);
    }

    /* right-side detail label */
    .item-detail {
      flex-shrink: 0;
      font-size: 11px;
      color: var(--muted);
      padding-right: 6px;
    }

    /* hint at the bottom */
    .hint {
      padding: 8px 10px 10px;
      font-size: 11px;
      color: var(--muted);
      line-height: 1.45;
      border-top: 1px solid var(--section-bd);
      margin-top: 4px;
    }
  </style>
</head>
<body>

  <!-- Section header -->
  <div class="section-header">
    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
      <rect x="1" y="4" width="14" height="9" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.5"/>
      <circle cx="5" cy="8.5" r="1.5"/>
      <line x1="8.5" y1="8.5" x2="13" y2="8.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
      <line x1="1" y1="6.5" x2="15" y2="6.5" stroke="currentColor" stroke-width="1"/>
    </svg>
    Node Library
  </div>

  <div class="list">

    <!-- ── Flow Control ──────────────────────────────────────────────────── -->
    <div class="group-label">Flow Control</div>

    <div class="item" draggable="true" data-type="start" data-label="Start">
      <div class="item-icon">
        <!-- green play circle -->
        <svg width="16" height="16" viewBox="0 0 16 16">
          <circle cx="8" cy="8" r="7" fill="#3fb950" opacity="0.18"/>
          <circle cx="8" cy="8" r="7" fill="none" stroke="#3fb950" stroke-width="1.4"/>
          <polygon points="6,5 12,8 6,11" fill="#3fb950"/>
        </svg>
      </div>
      <span class="item-name">Start</span>
      <span class="item-detail">Begin flow</span>
    </div>

    <div class="item" draggable="true" data-type="end" data-label="End">
      <div class="item-icon">
        <!-- blue stop circle -->
        <svg width="16" height="16" viewBox="0 0 16 16">
          <circle cx="8" cy="8" r="7" fill="#58a6ff" opacity="0.15"/>
          <circle cx="8" cy="8" r="7" fill="none" stroke="#58a6ff" stroke-width="1.4"/>
          <rect x="5" y="5" width="6" height="6" rx="1" fill="#58a6ff"/>
        </svg>
      </div>
      <span class="item-name">End</span>
      <span class="item-detail">Complete flow</span>
    </div>

    <div class="item" draggable="true" data-type="stop" data-label="Stop">
      <div class="item-icon">
        <!-- red octagon stop -->
        <svg width="16" height="16" viewBox="0 0 16 16">
          <polygon points="5,1 11,1 15,5 15,11 11,15 5,15 1,11 1,5" fill="#f85149" opacity="0.18"/>
          <polygon points="5,1 11,1 15,5 15,11 11,15 5,15 1,11 1,5" fill="none" stroke="#f85149" stroke-width="1.4"/>
          <line x1="5" y1="8" x2="11" y2="8" stroke="#f85149" stroke-width="2" stroke-linecap="round"/>
        </svg>
      </div>
      <span class="item-name">Stop</span>
      <span class="item-detail">Halt execution</span>
    </div>

    <div class="item" draggable="true" data-type="decision" data-label="Decision">
      <div class="item-icon">
        <!-- yellow diamond -->
        <svg width="16" height="16" viewBox="0 0 16 16">
          <polygon points="8,1 15,8 8,15 1,8" fill="#e3b341" opacity="0.18"/>
          <polygon points="8,1 15,8 8,15 1,8" fill="none" stroke="#e3b341" stroke-width="1.4"/>
          <line x1="8" y1="4.5" x2="8" y2="11.5" stroke="#e3b341" stroke-width="1.3" stroke-linecap="round"/>
          <line x1="4.5" y1="8" x2="11.5" y2="8" stroke="#e3b341" stroke-width="1.3" stroke-linecap="round"/>
        </svg>
      </div>
      <span class="item-name">Decision</span>
      <span class="item-detail">Branch flow</span>
    </div>

    <div class="item" draggable="true" data-type="join" data-label="Join">
      <div class="item-icon">
        <!-- merge arrows -->
        <svg width="16" height="16" viewBox="0 0 16 16">
          <circle cx="8" cy="8" r="7" fill="none" stroke="#a371f7" stroke-width="1.4"/>
          <path d="M4,4 L8,8 L12,4" fill="none" stroke="#a371f7" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
          <line x1="8" y1="8" x2="8" y2="13" stroke="#a371f7" stroke-width="1.4" stroke-linecap="round"/>
        </svg>
      </div>
      <span class="item-name">Join</span>
      <span class="item-detail">Merge flows</span>
    </div>

    <div class="item" draggable="true" data-type="loop" data-label="Loop">
      <div class="item-icon">
        <!-- loop arrows -->
        <svg width="16" height="16" viewBox="0 0 16 16">
          <path d="M13,8 A5,5 0 1,1 8,3" fill="none" stroke="#f0883e" stroke-width="1.5" stroke-linecap="round"/>
          <polygon points="8,1 11,4 8,5" fill="#f0883e"/>
        </svg>
      </div>
      <span class="item-name">Loop</span>
      <span class="item-detail">Iterate items</span>
    </div>

    <!-- ── Execution ──────────────────────────────────────────────────────── -->
    <div class="group-label">Execution</div>

    <div class="item" draggable="true" data-type="fn" data-label="Function">
      <div class="item-icon">
        <!-- lambda / function -->
        <svg width="16" height="16" viewBox="0 0 16 16">
          <rect x="1" y="1" width="14" height="14" rx="3" fill="#79c0ff" opacity="0.15"/>
          <rect x="1" y="1" width="14" height="14" rx="3" fill="none" stroke="#79c0ff" stroke-width="1.4"/>
          <text x="4" y="12" font-size="9" font-family="monospace" font-weight="bold" fill="#79c0ff">fn</text>
        </svg>
      </div>
      <span class="item-name">Function</span>
      <span class="item-detail">Execute logic</span>
    </div>

    <div class="item" draggable="true" data-type="process" data-label="Process">
      <div class="item-icon">
        <!-- gear / process -->
        <svg width="16" height="16" viewBox="0 0 16 16">
          <circle cx="8" cy="8" r="2.5" fill="none" stroke="#56d364" stroke-width="1.4"/>
          <path d="M8,1 L8,3 M8,13 L8,15 M1,8 L3,8 M13,8 L15,8
                   M3.05,3.05 L4.46,4.46 M11.54,11.54 L12.95,12.95
                   M12.95,3.05 L11.54,4.46 M4.46,11.54 L3.05,12.95"
                stroke="#56d364" stroke-width="1.3" stroke-linecap="round"/>
        </svg>
      </div>
      <span class="item-name">Process</span>
      <span class="item-detail">Transform data</span>
    </div>

    <div class="item" draggable="true" data-type="script" data-label="Script">
      <div class="item-icon">
        <!-- code brackets -->
        <svg width="16" height="16" viewBox="0 0 16 16">
          <path d="M5,3 L2,8 L5,13" fill="none" stroke="#d2a8ff" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M11,3 L14,8 L11,13" fill="none" stroke="#d2a8ff" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          <line x1="9" y1="2" x2="7" y2="14" stroke="#d2a8ff" stroke-width="1.3" stroke-linecap="round"/>
        </svg>
      </div>
      <span class="item-name">Script</span>
      <span class="item-detail">Run code</span>
    </div>

    <div class="item" draggable="true" data-type="call" data-label="Call">
      <div class="item-icon">
        <!-- call / invoke -->
        <svg width="16" height="16" viewBox="0 0 16 16">
          <circle cx="8" cy="8" r="7" fill="none" stroke="#ffa657" stroke-width="1.4"/>
          <path d="M5,8 L11,8 M9,5.5 L11.5,8 L9,10.5" fill="none" stroke="#ffa657" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </div>
      <span class="item-name">Call</span>
      <span class="item-detail">Invoke pipeline</span>
    </div>

    <div class="item" draggable="true" data-type="methodCall" data-label="MethodCall">
      <div class="item-icon">
        <!-- dot method call -->
        <svg width="16" height="16" viewBox="0 0 16 16">
          <rect x="1" y="4" width="6" height="8" rx="1.5" fill="none" stroke="#79c0ff" stroke-width="1.3"/>
          <circle cx="12" cy="8" r="3" fill="none" stroke="#79c0ff" stroke-width="1.3"/>
          <line x1="7" y1="8" x2="9" y2="8" stroke="#79c0ff" stroke-width="1.3" stroke-linecap="round"/>
        </svg>
      </div>
      <span class="item-name">MethodCall</span>
      <span class="item-detail">Object method</span>
    </div>

    <!-- ── I/O ─────────────────────────────────────────────────────────────── -->
    <div class="group-label">I / O</div>

    <div class="item" draggable="true" data-type="input" data-label="Input">
      <div class="item-icon">
        <!-- arrow into box -->
        <svg width="16" height="16" viewBox="0 0 16 16">
          <rect x="7" y="2" width="7" height="12" rx="1.5" fill="none" stroke="#56d364" stroke-width="1.3"/>
          <path d="M1,8 L7,8 M4,5.5 L1.5,8 L4,10.5" fill="none" stroke="#56d364" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </div>
      <span class="item-name">Input</span>
      <span class="item-detail">Entry event</span>
    </div>

    <div class="item" draggable="true" data-type="view" data-label="View">
      <div class="item-icon">
        <!-- eye / view -->
        <svg width="16" height="16" viewBox="0 0 16 16">
          <path d="M1,8 C3,4 13,4 15,8 C13,12 3,12 1,8 Z" fill="none" stroke="#79c0ff" stroke-width="1.3"/>
          <circle cx="8" cy="8" r="2.2" fill="none" stroke="#79c0ff" stroke-width="1.3"/>
        </svg>
      </div>
      <span class="item-name">View</span>
      <span class="item-detail">Render output</span>
    </div>

    <!-- ── Human Review ──────────────────────────────────────────────────── -->
    <div class="group-label">Human Review</div>

    <div class="item" draggable="true" data-type="approval" data-label="Approval">
      <div class="item-icon">
        <!-- violet person with checkmark badge -->
        <svg width="16" height="16" viewBox="0 0 16 16">
          <rect x="0.5" y="0.5" width="15" height="15" rx="3.5" fill="#7c3aed" opacity="0.18"/>
          <rect x="0.5" y="0.5" width="15" height="15" rx="3.5" fill="none" stroke="#7c3aed" stroke-width="1.3"/>
          <!-- person silhouette -->
          <circle cx="8" cy="5.5" r="2.3" fill="#7c3aed"/>
          <path d="M3.5,13 C3.5,10 12.5,10 12.5,13" fill="#7c3aed"/>
          <!-- green checkmark badge (bottom-right) -->
          <circle cx="12" cy="12" r="2.8" fill="#4ade80"/>
          <path d="M10.5,12 L11.5,13 L13.5,11" fill="none" stroke="#fff" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </div>
      <span class="item-name">Approval</span>
      <span class="item-detail">Human review</span>
    </div>

    <!-- ── Custom ─────────────────────────────────────────────────────────── -->
    <div class="group-label">Custom</div>

    <div class="item" draggable="true" data-type="custom" data-label="CustomNode">
      <div class="item-icon">
        <!-- puzzle / custom -->
        <svg width="16" height="16" viewBox="0 0 16 16">
          <rect x="1.5" y="1.5" width="5.5" height="5.5" rx="1" fill="none" stroke="#e3b341" stroke-width="1.3"/>
          <rect x="9" y="1.5" width="5.5" height="5.5" rx="1" fill="none" stroke="#e3b341" stroke-width="1.3"/>
          <rect x="1.5" y="9" width="5.5" height="5.5" rx="1" fill="none" stroke="#e3b341" stroke-width="1.3"/>
          <rect x="9" y="9" width="5.5" height="5.5" rx="1" fill="none" stroke="#e3b341" stroke-width="1.3"/>
          <line x1="7" y1="4.25" x2="9" y2="4.25" stroke="#e3b341" stroke-width="1.1"/>
          <line x1="4.25" y1="7" x2="4.25" y2="9" stroke="#e3b341" stroke-width="1.1"/>
          <line x1="11.75" y1="7" x2="11.75" y2="9" stroke="#e3b341" stroke-width="1.1"/>
          <line x1="7" y1="11.75" x2="9" y2="11.75" stroke="#e3b341" stroke-width="1.1"/>
        </svg>
      </div>
      <span class="item-name">CustomNode</span>
      <span class="item-detail">Connectable</span>
    </div>

    <div class="item" draggable="true" data-type="jump" data-label="Jump">
      <div class="item-icon">
        <!-- jump / double chevron down -->
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M3 2H13L8 7L3 2Z" fill="#F3D59A" stroke="#524D43" stroke-width="1.2" stroke-linejoin="round"/>
          <path d="M3 9H13L8 14L3 9Z" fill="#F3D59A" stroke="#524D43" stroke-width="1.2" stroke-linejoin="round"/>
        </svg>
      </div>
      <span class="item-name">Jump</span>
      <span class="item-detail">Jump to pipeline</span>
    </div>

  </div>

  <div class="hint">
    Drag into the canvas or click to copy the node type to clipboard.
  </div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();

    document.querySelectorAll('.item').forEach((el) => {
      el.addEventListener('dragstart', (event) => {
        const type = el.getAttribute('data-type');
        if (!type || !event.dataTransfer) return;
        event.dataTransfer.setData('application/reactflow', type);
        event.dataTransfer.setData('text/plain', type);
        event.dataTransfer.effectAllowed = 'copyMove';
      });

      el.addEventListener('click', () => {
        const type = el.getAttribute('data-type');
        if (!type) return;
        vscode.postMessage({ type: 'copy-node-type', value: type });
      });
    });
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
