import * as vscode from 'vscode';
import { FlowEditorProvider } from './FlowEditorProvider';
import { NodeLibraryViewProvider } from './NodeLibraryViewProvider';
import { NodeDetailViewProvider } from './NodeDetailViewProvider';
import { PipeletTreeViewProvider } from './PipeletTreeViewProvider';
import { CartridgeExplorerProvider } from './CartridgeExplorerProvider';
import { OpenApiExplorerProvider, EndpointItem } from './OpenApiExplorerProvider';
import { FlowSyncViewProvider, FlowVersionItem, FlowFileItem } from './FlowSyncViewProvider';
import { WebFormEditorProvider } from './WebFormEditorProvider';
import {
  emitPipeletDragStart,
  emitPipeletInsertRequest,
  emitEndpointInsertRequest,
  type PipeletDragPayload,
  type EndpointDragPayload,
} from './DragBridge';

export function activate(context: vscode.ExtensionContext) {
  const nodeDetailProvider = new NodeDetailViewProvider(context);

  context.subscriptions.push(FlowEditorProvider.register(context, nodeDetailProvider));

  // ── Web Form Editor ────────────────────────────────────────────────────────
  const webFormProvider = new WebFormEditorProvider(context);
  context.subscriptions.push(
    vscode.window.registerCustomEditorProvider(
      WebFormEditorProvider.viewType,
      webFormProvider,
      { webviewOptions: { retainContextWhenHidden: true }, supportsMultipleEditorsPerDocument: false }
    )
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('reactdnd.webFormSplit',   () => webFormProvider.sendModeToVisible('split'))
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('reactdnd.webFormJson',    () => webFormProvider.sendModeToVisible('json'))
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('reactdnd.webFormPreview', () => webFormProvider.sendModeToVisible('preview'))
  );

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      NodeLibraryViewProvider.viewType,
      new NodeLibraryViewProvider(context)
    )
  );
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      NodeDetailViewProvider.viewType,
      nodeDetailProvider
    )
  );
  const pipeletTreeProvider = new PipeletTreeViewProvider(context);
  context.subscriptions.push(pipeletTreeProvider);
  context.subscriptions.push(
    vscode.window.createTreeView(PipeletTreeViewProvider.viewId, {
      treeDataProvider: pipeletTreeProvider,
      dragAndDropController: pipeletTreeProvider,
      showCollapseAll: false,
      canSelectMany: false,
    })
  );

  // ── Cartridge Explorer ─────────────────────────────────────────────────────
  const cartridgeProvider = new CartridgeExplorerProvider(context);
  context.subscriptions.push(cartridgeProvider);
  context.subscriptions.push(
    vscode.window.createTreeView(CartridgeExplorerProvider.viewId, {
      treeDataProvider: cartridgeProvider,
      dragAndDropController: cartridgeProvider,
      showCollapseAll: true,
      canSelectMany: false,
    })
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('reactdnd.cartridgeExplorerRefresh', () => {
      cartridgeProvider.refresh();
    })
  );

  // ── OpenAPI Explorer ───────────────────────────────────────────────────────
  const openApiProvider = new OpenApiExplorerProvider(context);
  context.subscriptions.push(openApiProvider);
  context.subscriptions.push(
    vscode.window.createTreeView(OpenApiExplorerProvider.viewId, {
      treeDataProvider: openApiProvider,
      dragAndDropController: openApiProvider,
      showCollapseAll: true,
    })
  );

  // ── .flow Sync View ─────────────────────────────────────────────────────────
  const flowSyncProvider = new FlowSyncViewProvider(context);
  context.subscriptions.push(flowSyncProvider);
  context.subscriptions.push(
    vscode.window.createTreeView(FlowSyncViewProvider.viewId, {
      treeDataProvider: flowSyncProvider,
      showCollapseAll: true,
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('reactdnd.openApiRefresh', () => {
      openApiProvider.refresh();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('reactdnd.openApiEditConfig', () => {
      openApiProvider.openConfig();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('reactdnd.flowSyncRefresh', () => {
      flowSyncProvider.refresh();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('reactdnd.flowSyncEditConfig', () => {
      flowSyncProvider.openConfig();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('reactdnd.flowSyncActive', async () => {
      await flowSyncProvider.syncActiveFlow();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'reactdnd.flowSyncFile',
      async (item?: FlowFileItem) => {
        await flowSyncProvider.syncFile(item);
      }
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('reactdnd.flowSyncAll', async () => {
      await flowSyncProvider.syncAllFlows();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'reactdnd.flowSyncRollbackVersion',
      async (item: FlowVersionItem) => {
        if (!item) { return; }
        await flowSyncProvider.rollbackVersion(item);
      }
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'reactdnd.flowSyncPullLatest',
      async (item?: FlowFileItem) => {
        await flowSyncProvider.pullLatestToLocal(item);
      }
    )
  );

  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument((doc) => {
      if (doc.uri.fsPath.endsWith('.flow')) {
        flowSyncProvider.refresh();
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'reactdnd.openApiEndpointAction',
      async (item: EndpointItem) => {
        const picked = await vscode.window.showQuickPick(
          [
            { label: '$(copy) Copy path',     detail: item.endpointPath },
            { label: '$(copy) Copy full URL', detail: item.fullUrl },
            { label: '$(globe) Open in browser', detail: item.fullUrl },
          ],
          { title: `${item.method.toUpperCase()}  ${item.endpointPath}` },
        );
        if (!picked) { return; }
        if (picked.label.includes('browser')) {
          vscode.env.openExternal(vscode.Uri.parse(item.fullUrl));
        } else {
          await vscode.env.clipboard.writeText(picked.detail ?? '');
          vscode.window.showInformationMessage(`Copied: ${picked.detail}`);
        }
      }
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'reactdnd.armPipeletPlacement',
      async (payload: PipeletDragPayload) => {
        emitPipeletDragStart(await enrichPipeletPayload(payload));
      }
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'reactdnd.insertPipeletToFlow',
      async (payload: PipeletDragPayload) => {
        emitPipeletInsertRequest(await enrichPipeletPayload(payload));
      }
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'reactdnd.insertEndpointToFlow',
      (payload: EndpointDragPayload) => {
        emitEndpointInsertRequest(payload);
      }
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('reactdnd.newFlow', async () => {
      const uri = await vscode.window.showSaveDialog({
        filters: { 'Flow Files': ['flow'] },
        defaultUri: vscode.Uri.joinPath(
          vscode.workspace.workspaceFolders?.[0]?.uri ?? vscode.Uri.file('/'),
          'untitled.flow'
        ),
      });

      if (uri) {
        const defaultFlow = {
          nodes: [
            { id: 'node-1', type: 'custom', position: { x: 0, y: 0 }, data: { label: 'Input' } },
            { id: 'node-2', type: 'custom', position: { x: 0, y: 200 }, data: { label: 'Process' } },
            { id: 'node-3', type: 'custom', position: { x: 0, y: 400 }, data: { label: 'Output' } },
          ],
          edges: [
            { id: 'edge-1-2', source: 'node-1', target: 'node-2', sourceHandle: 'output', targetHandle: 'input' },
            { id: 'edge-2-3', source: 'node-2', target: 'node-3', sourceHandle: 'output', targetHandle: 'input' },
          ],
        };
        await vscode.workspace.fs.writeFile(uri, Buffer.from(JSON.stringify(defaultFlow, null, 2)));
        await vscode.commands.executeCommand(
          'vscode.openWith',
          uri,
          FlowEditorProvider.viewType
        );
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('reactdnd.newWebForm', async () => {
      const webformsDir = vscode.workspace.workspaceFolders?.[0]
        ? vscode.Uri.joinPath(vscode.workspace.workspaceFolders[0].uri, 'webforms')
        : undefined;

      const uri = await vscode.window.showSaveDialog({
        filters: { 'Web Form Files': ['webform'] },
        defaultUri: vscode.Uri.joinPath(
          webformsDir ?? vscode.Uri.file('/'),
          'untitled.webform'
        ),
      });

      if (uri) {
        const defaultSchema = {
          title: 'New Form',
          type: 'object',
          displayType: 'row',
          labelWidth: 120,
          properties: {
            field1: {
              title: 'Field 1',
              type: 'string',
              required: true,
              placeholder: 'Enter value',
            },
          },
        };
        await vscode.workspace.fs.writeFile(
          uri,
          Buffer.from(JSON.stringify(defaultSchema, null, 2))
        );
        await vscode.commands.executeCommand(
          'vscode.openWith',
          uri,
          WebFormEditorProvider.viewType
        );
      }
    })
  );
}

async function enrichPipeletPayload(payload: PipeletDragPayload): Promise<PipeletDragPayload> {
  if (payload.content) { return payload; }
  try {
    const bytes = await vscode.workspace.fs.readFile(vscode.Uri.parse(payload.uri));
    return { ...payload, content: Buffer.from(bytes).toString('utf-8') };
  } catch {
    return payload;
  }
}
