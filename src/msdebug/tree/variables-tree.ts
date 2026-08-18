import * as vscode from 'vscode';
import { buildVariableNodes, DebugVariableNode } from '../debug-variable-model';
import { OrchestratorClient } from '../orchestrator-client';

export interface VariableItem {
  name: string;
  value: string;
  type: string;
  variablesReference?: number;
}

export class VariablesTreeProvider implements vscode.TreeDataProvider<VariableTreeItem> {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<VariableTreeItem | undefined | null>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private variables: DebugVariableNode[] = [];
  private previousVariables = new Map<string, string>();
  private changedVariables = new Set<string>();
  private location = '';
  private client: OrchestratorClient | null = null;
  private sessionId: string | null = null;
  private service: string | null = null;
  private traceId = '';

  setClient(client: OrchestratorClient): void {
    this.client = client;
  }

  setSession(sessionId: string, service: string, traceId = ''): void {
    this.sessionId = sessionId;
    this.service = service;
    this.traceId = traceId;
  }

  setVariables(vars: VariableItem[], location: string): void {
    // Detect changed variables
    this.changedVariables.clear();
    const currentVars = new Map<string, string>();
    
    // Build current variables map with full path tracking
    const buildMap = (nodes: DebugVariableNode[], parentPath = '') => {
      for (const node of nodes) {
        const currentPath = parentPath ? `${parentPath}.${node.name}` : node.name;
        currentVars.set(currentPath, node.value);
        
        // Check if this specific property value changed
        const prevValue = this.previousVariables.get(currentPath);
        if (prevValue !== undefined && prevValue !== node.value) {
          this.changedVariables.add(currentPath);
        }
        
        // Recurse for children (nested objects/arrays).
        // Guard: lazy-loaded children from server may not have .children property
        // (they are raw { name, value, type, variablesReference } objects).
        if (node.children && node.children.length > 0) {
          buildMap(node.children, currentPath);
        }
      }
    };
    
    this.variables = buildVariableNodes(vars);
    buildMap(this.variables);
    
    // Merge current vars into previousVariables (don't replace!)
    // This preserves lazy-loaded nested children from previous breakpoint
    for (const [key, value] of currentVars) {
      this.previousVariables.set(key, value);
    }
    
    // Remove stale entries: if a top-level variable no longer exists, remove it and its children
    const topLevelNames = new Set(this.variables.map(v => v.name));
    for (const key of this.previousVariables.keys()) {
      const topLevel = key.split('.')[0];
      if (!topLevelNames.has(topLevel)) {
        this.previousVariables.delete(key);
      }
    }
    
    this.location = location;
    this._onDidChangeTreeData.fire(undefined);
  }

  clear(): void {
    this.variables = [];
    this.previousVariables.clear();
    this.changedVariables.clear();
    this.location = '';
    this._onDidChangeTreeData.fire(undefined);
  }

  getVariablesAsJson(): string {
    const serializeNode = (node: DebugVariableNode): Record<string, unknown> => {
      const result: Record<string, unknown> = {
        name: node.name,
        value: node.value,
        type: node.type,
      };
      if (node.children && node.children.length > 0) {
        result.children = node.children.map(serializeNode);
      }
      return result;
    };
    return JSON.stringify(this.variables.map(serializeNode), null, 2);
  }

  getTreeItem(element: VariableTreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: VariableTreeItem): Promise<VariableTreeItem[]> {
    if (element) {
      // Lazy load children if needed
      if (element.variable.lazy && element.variable.variablesReference && this.client && this.sessionId && this.service) {
        try {
          const childVars = await this.client.getVariables(
            this.sessionId,
            this.service,
            this.traceId,
            String(element.variable.variablesReference),
          );
          
          // Update the node with loaded children
          element.variable.children = buildVariableNodes(childVars);
          element.variable.lazy = false;
          // Keep parent expanded — setting to Collapsed here would collapse it
          // after the user just clicked to expand. The tree view handles the
          // transition from Collapsed → Expanded automatically when getChildren
          // returns non-empty results.
          element.collapsibleState = element.variable.children.length 
            ? vscode.TreeItemCollapsibleState.Expanded 
            : vscode.TreeItemCollapsibleState.None;
          
          // Track lazy-loaded children for change detection
          const parentPath = element.fullPath;
          for (const child of element.variable.children) {
            const childKey = parentPath ? `${parentPath}.${child.name}` : child.name;
            const currentValue = child.value;
            const prevValue = this.previousVariables.get(childKey);
            
            // If this is first time seeing this child, store it
            if (prevValue === undefined) {
              this.previousVariables.set(childKey, currentValue);
            } else if (prevValue !== currentValue) {
              // Value changed!
              this.changedVariables.add(childKey);
            }
          }
          
          this._onDidChangeTreeData.fire(element);
          
          // If parent changed, mark all children as changed too
          const parentChanged = this.changedVariables.has(element.fullPath);
          
          return element.variable.children.map((child) => {
            const childKey = parentPath ? `${parentPath}.${child.name}` : child.name;
            const isChanged = parentChanged || this.changedVariables.has(childKey);
            return new VariableTreeItem(child, isChanged, childKey);
          });
        } catch (error) {
          console.error('Failed to load variable children:', error);
          return [];
        }
      }
      
      // If parent changed, mark all children as changed too
      const parentChanged = this.changedVariables.has(element.fullPath);
      
      return element.variable.children.map((child) => {
        const childKey = element.fullPath ? `${element.fullPath}.${child.name}` : child.name;
        const isChanged = parentChanged || this.changedVariables.has(childKey);
        return new VariableTreeItem(child, isChanged, childKey);
      });
    }
    
    if (!this.variables.length) {
      const empty = new VariableTreeItem({ name: '(no variables)', value: '', type: '', children: [] }, false, '');
      empty.description = this.location ? `Waiting for breakpoint…` : '';
      return [empty];
    }
    return this.variables.map((variable) => {
      const isChanged = this.changedVariables.has(variable.name);
      return new VariableTreeItem(variable, isChanged, variable.name);
    });
  }
}

class VariableTreeItem extends vscode.TreeItem {
  constructor(
    public readonly variable: DebugVariableNode,
    isChanged = false,
    public readonly fullPath = '',
  ) {
    // Guard: variable.children may be undefined for raw server responses
    // that haven't been processed by buildVariableNodes yet.
    const isExpandable = variable.lazy || (variable.children && variable.children.length > 0);
    super(
      variable.name,
      isExpandable ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None,
    );

    if (variable.value !== '') {
      // Highlight changed variables - value text in yellow
      if (isChanged) {
        const fullLabel = `${variable.name}: ${variable.value}`;
        const valueStart = variable.name.length + 2;
        this.label = {
          label: fullLabel,
          highlights: [[valueStart, fullLabel.length]]
        };
        this.description = '';
        this.iconPath = new vscode.ThemeIcon(isExpandable ? 'symbol-object' : 'symbol-variable');
        this.tooltip = variable.type
          ? `⚡ CHANGED: ${variable.type} ${variable.name} = ${variable.value}`
          : `⚡ CHANGED: ${variable.name} = ${variable.value}`;
      } else {
        this.description = variable.value;
        this.iconPath = new vscode.ThemeIcon(isExpandable ? 'symbol-object' : 'symbol-variable');
        this.tooltip = variable.type
          ? `${variable.type} ${variable.name} = ${variable.value}`
          : `${variable.name} = ${variable.value}`;
      }
    } else {
      this.iconPath = new vscode.ThemeIcon(isExpandable ? 'symbol-object' : 'symbol-variable');
    }
  }
}
