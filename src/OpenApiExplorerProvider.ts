import * as fs from 'fs';
import * as http from 'http';
import * as https from 'https';
import * as path from 'path';
import * as vscode from 'vscode';
import { emitEndpointDragStart, emitEndpointInsertRequest, type EndpointDragPayload, type EndpointParam } from './DragBridge';

// ─── Config ───────────────────────────────────────────────────────────────────

export const CONFIG_FILENAME = '.openapi-sources.json';

const DEFAULT_CONFIG: OpenApiSourcesConfig = {
  sources: ['http://localhost:8080/openapi.json'],
};

interface OpenApiSourcesConfig {
  sources: string[];
}

// ─── OpenAPI spec types ───────────────────────────────────────────────────────

const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete', 'options', 'head'] as const;
type HttpMethod = (typeof HTTP_METHODS)[number];

interface SchemaObject {
  $ref?: string;
  type?: string;
  format?: string;
  enum?: unknown[];
  default?: unknown;
  example?: unknown;
  minimum?: number;
  maximum?: number;
  properties?: Record<string, SchemaObject>;
  items?: SchemaObject;
  allOf?: SchemaObject[];
  additionalProperties?: SchemaObject | boolean;
  required?: string[];
  xml?: unknown;
}

interface ParameterObject {
  name: string;
  in: 'path' | 'query' | 'header' | 'body' | 'formData' | 'cookie';
  required?: boolean;
  type?: string;
  schema?: SchemaObject;
  description?: string;
}

interface ResponseObject {
  description: string;
  schema?: SchemaObject;          // Swagger 2.0
  content?: Record<string, { schema?: SchemaObject }>;  // OpenAPI 3.x
}

interface OperationObject {
  tags?: string[];
  summary?: string;
  description?: string;
  operationId?: string;
  parameters?: ParameterObject[];
  requestBody?: {
    content?: Record<string, { schema?: SchemaObject }>;
    required?: boolean;
  };
  responses?: Record<string, ResponseObject>;
}

interface OpenApiSpec {
  info?: { title?: string; version?: string };
  servers?: Array<{ url: string }>;
  // Swagger 2.0 fields
  host?: string;
  basePath?: string;
  schemes?: string[];
  paths?: Record<string, Partial<Record<HttpMethod, OperationObject>>>;
  definitions?: Record<string, SchemaObject>;          // Swagger 2.0
  components?: { schemas?: Record<string, SchemaObject> };  // OpenAPI 3.x
}

interface EndpointDef {
  method: HttpMethod;
  path: string;
  tags: string[];
  summary?: string;
  operation: OperationObject;
}

// ─── Sample generation ────────────────────────────────────────────────────────

/** Recursively build a sample value from a schema, resolving $ref against definitions. */
function sampleFromSchema(
  schema: SchemaObject | undefined,
  defs: Record<string, SchemaObject>,
  depth = 0,
): unknown {
  if (!schema || depth > 5) { return null; }

  if (schema.$ref) {
    const refName = schema.$ref.split('/').pop() ?? '';
    const resolved = defs[refName];
    if (resolved) { return sampleFromSchema(resolved, defs, depth + 1); }
    return null;
  }

  if (schema.example !== undefined) { return schema.example; }
  if (schema.default !== undefined) { return schema.default; }
  if (schema.enum && schema.enum.length > 0) { return schema.enum[0]; }

  switch (schema.type) {
    case 'integer':
    case 'number':
      return schema.minimum ?? 1;
    case 'boolean':
      return true;
    case 'string':
      if (schema.format === 'date-time') { return '2025-01-01T00:00:00Z'; }
      if (schema.format === 'date')      { return '2025-01-01'; }
      if (schema.format === 'email')     { return 'user@example.com'; }
      if (schema.format === 'uri')       { return 'https://example.com'; }
      if (schema.format === 'uuid')      { return '00000000-0000-0000-0000-000000000000'; }
      if (schema.format === 'byte')      { return 'dGVzdA=='; }
      if (schema.format === 'binary')    { return '(binary)'; }
      return 'string';
    case 'array':
      return schema.items ? [sampleFromSchema(schema.items, defs, depth + 1)] : [];
    case 'object':
    default: {
      const result: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(schema.properties ?? {})) {
        result[k] = sampleFromSchema(v, defs, depth + 1);
      }
      if (Array.isArray(schema.allOf)) {
        for (const sub of schema.allOf) {
          const part = sampleFromSchema(sub, defs, depth + 1);
          if (part && typeof part === 'object' && !Array.isArray(part)) {
            Object.assign(result, part);
          }
        }
      }
      return Object.keys(result).length > 0 ? result : null;
    }
  }
}

// ─── Tree item classes ────────────────────────────────────────────────────────

export class ApiRootItem extends vscode.TreeItem {
  readonly kind = 'api' as const;

  constructor(
    public readonly apiTitle: string,
    public readonly sourceUrl: string,
    public readonly spec: OpenApiSpec,
    authenticated = false,
  ) {
    super(apiTitle, vscode.TreeItemCollapsibleState.Expanded);
    this.description = sourceUrl;
    this.tooltip    = new vscode.MarkdownString(`**${apiTitle}**\n\n${sourceUrl}`);
    this.contextValue = authenticated ? 'openApiRootAuthenticated' : 'openApiRoot';
    if (authenticated) {
      this.iconPath = new vscode.ThemeIcon('lock', new vscode.ThemeColor('charts.green'));
    } else {
      this.iconPath = new vscode.ThemeIcon('globe', new vscode.ThemeColor('charts.blue'));
    }
  }
}

export class TagGroupItem extends vscode.TreeItem {
  readonly kind = 'tag' as const;

  constructor(
    public readonly tag: string,
    public readonly endpoints: EndpointDef[],
    public readonly parent: ApiRootItem,
  ) {
    super(tag, vscode.TreeItemCollapsibleState.Collapsed);
    this.description  = `${endpoints.length}`;
    this.tooltip      = `${tag} — ${endpoints.length} endpoint(s)`;
    this.contextValue = 'openApiTag';
    this.iconPath = new vscode.ThemeIcon('symbol-namespace', new vscode.ThemeColor('charts.yellow'));
  }
}

export class EndpointItem extends vscode.TreeItem {
  readonly kind = 'endpoint' as const;

  /** Resolved at construction from the extension context. */
  static iconUri: vscode.Uri | undefined;

  constructor(
    public readonly method: HttpMethod,
    public readonly endpointPath: string,
    public readonly baseUrl: string,
    summary?: string,
    public readonly operation?: OperationObject,
    public readonly definitions?: Record<string, SchemaObject>,
  ) {
    // Fixed-width method label so paths align
    const methodLabel = method.toUpperCase().padEnd(7);
    super(`${methodLabel} ${endpointPath}`, vscode.TreeItemCollapsibleState.None);

    this.description  = summary ?? '';
    this.tooltip      = summary ?? `${method.toUpperCase()} ${endpointPath}`;
    this.contextValue = 'openApiEndpoint';

    // Blue process-node icon if available, otherwise themed fallback
    this.iconPath = EndpointItem.iconUri ?? EndpointItem.themeIconForMethod(method);

    this.command = {
      command: 'reactdnd.insertEndpointToFlow',
      title: 'Insert Endpoint To Flow',
      arguments: [this.toDragPayload()],
    };
  }

  get fullUrl(): string {
    return `${this.baseUrl}${this.endpointPath}`;
  }

  toDragPayload(): EndpointDragPayload {
    const defs = this.definitions ?? {};
    const op   = this.operation  ?? {};

    // Parameters (excluding body — body becomes requestSample)
    const params: EndpointDragPayload['params'] = (op.parameters ?? []).map(p => ({
      name:        p.name,
      in:          p.in as EndpointParam['in'],
      required:    p.required,
      type:        p.type ?? p.schema?.type,
      description: p.description,
    }));

    // Request body sample
    let requestSample: unknown;
    const bodyParam = op.parameters?.find(p => p.in === 'body');
    if (bodyParam?.schema) {
      requestSample = sampleFromSchema(bodyParam.schema, defs);
    }
    if (requestSample === undefined && op.requestBody?.content) {
      const jsonContent = op.requestBody.content['application/json'];
      if (jsonContent?.schema) {
        requestSample = sampleFromSchema(jsonContent.schema, defs);
      }
    }

    // Responses
    const responses: EndpointDragPayload['responses'] = Object.entries(op.responses ?? {}).map(
      ([status, resp]) => {
        let sample: unknown;
        if (resp.schema) {
          sample = sampleFromSchema(resp.schema, defs);
        } else if (resp.content?.['application/json']?.schema) {
          sample = sampleFromSchema(resp.content['application/json'].schema!, defs);
        }
        return { status, description: resp.description, sample };
      },
    );

    return {
      method: this.method,
      path:   this.endpointPath,
      label:  `${this.method.toUpperCase()} ${this.endpointPath}`,
      baseUrl: this.baseUrl,
      summary: this.description as string | undefined,
      params,
      requestSample,
      responses,
    };
  }

  static themeIconForMethod(method: HttpMethod): vscode.ThemeIcon {
    switch (method) {
      case 'get':     return new vscode.ThemeIcon('arrow-down',      new vscode.ThemeColor('charts.green'));
      case 'post':    return new vscode.ThemeIcon('add',              new vscode.ThemeColor('charts.blue'));
      case 'put':     return new vscode.ThemeIcon('edit',             new vscode.ThemeColor('charts.yellow'));
      case 'patch':   return new vscode.ThemeIcon('diff-modified',    new vscode.ThemeColor('charts.orange'));
      case 'delete':  return new vscode.ThemeIcon('trash',            new vscode.ThemeColor('charts.red'));
      default:        return new vscode.ThemeIcon('circle-outline');
    }
  }
}

export class LoadingItem extends vscode.TreeItem {
  readonly kind = 'loading' as const;
  constructor(url: string) {
    super(`Loading ${url}…`, vscode.TreeItemCollapsibleState.None);
    this.iconPath = new vscode.ThemeIcon('loading~spin');
  }
}

export class ErrorItem extends vscode.TreeItem {
  readonly kind = 'error' as const;
  constructor(message: string) {
    super(message, vscode.TreeItemCollapsibleState.None);
    this.iconPath     = new vscode.ThemeIcon('error', new vscode.ThemeColor('errorForeground'));
    this.tooltip      = message;
    this.contextValue = 'openApiError';
  }
}

type OpenApiTreeItem = ApiRootItem | TagGroupItem | EndpointItem | LoadingItem | ErrorItem;

// ─── Provider ────────────────────────────────────────────────────────────────

export class OpenApiExplorerProvider
  implements
    vscode.TreeDataProvider<OpenApiTreeItem>,
    vscode.TreeDragAndDropController<OpenApiTreeItem>
{
  static readonly viewId = 'reactdnd.openApiExplorerView';

  readonly dragMimeTypes = ['application/reactdnd.endpoint'];
  readonly dropMimeTypes = [];

  private readonly _onDidChangeTreeData =
    new vscode.EventEmitter<OpenApiTreeItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  /** Per-URL spec cache. `null` = fetch failed. */
  private readonly specCache = new Map<string, OpenApiSpec | null>();
  private configWatcher: vscode.FileSystemWatcher | undefined;
  private authWatcher: vscode.FileSystemWatcher | undefined;

  constructor(private readonly context: vscode.ExtensionContext) {
    // Resolve icon URI once so all EndpointItems can use it
    EndpointItem.iconUri = vscode.Uri.joinPath(
      context.extensionUri, 'resources', 'endpoint-node-icon.svg'
    );
    this.watchConfig();
  }

  // ── Drag & Drop ─────────────────────────────────────────────────────────────

  async handleDrag(
    source: readonly OpenApiTreeItem[],
    dataTransfer: vscode.DataTransfer,
    _token: vscode.CancellationToken,
  ): Promise<void> {
    const first = source.find((i): i is EndpointItem => i.kind === 'endpoint');
    if (!first) { return; }
    const payload = first.toDragPayload();
    emitEndpointDragStart(payload);
    dataTransfer.set(
      'application/reactdnd.endpoint',
      new vscode.DataTransferItem(JSON.stringify(payload)),
    );
  }

  async handleDrop(
    _target: OpenApiTreeItem | undefined,
    _sources: vscode.DataTransfer,
    _token: vscode.CancellationToken,
  ): Promise<void> {
    // Tree is source-only.
  }

  // ── Config file ─────────────────────────────────────────────────────────────

  private configRoot(): string | undefined {
    return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  }

  private configPath(): string | undefined {
    const root = this.configRoot();
    return root ? path.join(root, CONFIG_FILENAME) : undefined;
  }

  readConfig(): string[] {
    const cfgPath = this.configPath();
    if (!cfgPath) { return DEFAULT_CONFIG.sources; }

    try {
      const raw  = fs.readFileSync(cfgPath, 'utf8');
      const json = JSON.parse(raw) as Partial<OpenApiSourcesConfig>;
      if (Array.isArray(json.sources)) {
        return json.sources.filter((s): s is string => typeof s === 'string');
      }
    } catch {
      // File does not exist — create it with defaults
      try {
        fs.writeFileSync(cfgPath, JSON.stringify(DEFAULT_CONFIG, null, 2), 'utf8');
      } catch { /* workspace may be read-only */ }
      return DEFAULT_CONFIG.sources;
    }
    return [];
  }

  openConfig(): void {
    const cfgPath = this.configPath();
    if (!cfgPath) {
      vscode.window.showWarningMessage('No workspace folder open.');
      return;
    }
    // Ensure file exists before opening
    if (!fs.existsSync(cfgPath)) {
      fs.writeFileSync(cfgPath, JSON.stringify(DEFAULT_CONFIG, null, 2), 'utf8');
    }
    vscode.commands.executeCommand('vscode.open', vscode.Uri.file(cfgPath));
  }

  private watchConfig(): void {
    this.configWatcher?.dispose();
    this.authWatcher?.dispose();
    const root = this.configRoot();
    if (!root) { return; }

    const pattern = new vscode.RelativePattern(root, CONFIG_FILENAME);
    this.configWatcher = vscode.workspace.createFileSystemWatcher(pattern);
    const onConfigChange = () => this.refresh();
    this.configWatcher.onDidCreate(onConfigChange);
    this.configWatcher.onDidChange(onConfigChange);
    this.configWatcher.onDidDelete(onConfigChange);
    this.context.subscriptions.push(this.configWatcher);

    // Also watch the auth token file
    const authPattern = new vscode.RelativePattern(root, '.openapi-auth.json');
    this.authWatcher = vscode.workspace.createFileSystemWatcher(authPattern);
    this.authWatcher.onDidCreate(onConfigChange);
    this.authWatcher.onDidChange(onConfigChange);
    this.authWatcher.onDidDelete(onConfigChange);
    this.context.subscriptions.push(this.authWatcher);
  }

  /** Read stored auth tokens keyed by normalized origin. */
  private readAuthTokens(): Record<string, { token: string }> {
    const root = this.configRoot();
    if (!root) { return {}; }
    const cfgPath = path.join(root, '.openapi-auth.json');
    try {
      const raw = fs.readFileSync(cfgPath, 'utf8');
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      return (typeof parsed.tokens === 'object' && parsed.tokens !== null)
        ? parsed.tokens as Record<string, { token: string }>
        : {};
    } catch { return {}; }
  }

  private isAuthenticated(sourceUrl: string): boolean {
    const tokens = this.readAuthTokens();
    try {
      const u = new URL(sourceUrl);
      const key = `${u.protocol}//${u.host}`;
      return !!tokens[key]?.token;
    } catch { return false; }
  }

  refresh(): void {
    this.specCache.clear();
    this._onDidChangeTreeData.fire(undefined);
  }

  // ── TreeDataProvider ────────────────────────────────────────────────────────

  getTreeItem(element: OpenApiTreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: OpenApiTreeItem): Promise<OpenApiTreeItem[]> {
    // Root: one ApiRootItem per source URL
    if (!element) {
      const sources = this.readConfig();
      if (sources.length === 0) {
        return [new ErrorItem('No sources configured. Click ⚙ to edit config.')];
      }
      const items: OpenApiTreeItem[] = [];
      for (const url of sources) {
        const spec = await this.fetchSpec(url);
        if (!spec) {
          items.push(new ErrorItem(`Cannot fetch: ${url}`));
        } else {
          const title = spec.info?.title ?? url;
          const authenticated = this.isAuthenticated(url);
          items.push(new ApiRootItem(title, url, spec, authenticated));
        }
      }
      return items;
    }

    // API root → tag groups
    if (element.kind === 'api') {
      const endpoints = extractEndpoints(element.spec);
      if (endpoints.length === 0) {
        return [new ErrorItem('No paths found in spec.')];
      }
      return groupByTag(endpoints).map(
        ([tag, eps]) => new TagGroupItem(tag, eps, element),
      );
    }

    // Tag group → endpoint leaves
    if (element.kind === 'tag') {
      const baseUrl = resolveBaseUrl(element.parent.spec, element.parent.sourceUrl);
      const defs = element.parent.spec.definitions
        ?? element.parent.spec.components?.schemas
        ?? {};
      return element.endpoints.map(
        ep => new EndpointItem(ep.method, ep.path, baseUrl, ep.summary, ep.operation, defs),
      );
    }

    return [];
  }

  // ── HTTP fetch ──────────────────────────────────────────────────────────────

  private fetchSpec(url: string): Promise<OpenApiSpec | null> {
    const cached = this.specCache.get(url);
    if (cached !== undefined) { return Promise.resolve(cached); }

    return new Promise(resolve => {
      const mod = url.startsWith('https://') ? https : http;
      let body = '';

      const req = mod.get(url, { timeout: 8000 }, res => {
        res.setEncoding('utf8');
        res.on('data', (chunk: string) => { body += chunk; });
        res.on('end', () => {
          try {
            const spec = JSON.parse(body) as OpenApiSpec;
            this.specCache.set(url, spec);
            resolve(spec);
          } catch {
            this.specCache.set(url, null);
            resolve(null);
          }
        });
      });

      req.on('error',   () => { this.specCache.set(url, null); resolve(null); });
      req.on('timeout', () => { req.destroy(); this.specCache.set(url, null); resolve(null); });
    });
  }

  dispose(): void {
    this.configWatcher?.dispose();
    this.authWatcher?.dispose();
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function extractEndpoints(spec: OpenApiSpec): EndpointDef[] {
  const result: EndpointDef[] = [];
  for (const [p, methods] of Object.entries(spec.paths ?? {})) {
    for (const method of HTTP_METHODS) {
      const op = methods[method];
      if (!op) { continue; }
      result.push({ method, path: p, tags: op.tags ?? [], summary: op.summary, operation: op });
    }
  }
  return result;
}

function groupByTag(endpoints: EndpointDef[]): [string, EndpointDef[]][] {
  const map = new Map<string, EndpointDef[]>();
  for (const ep of endpoints) {
    const tag = ep.tags[0] ?? 'default';
    const group = map.get(tag) ?? [];
    group.push(ep);
    map.set(tag, group);
  }
  return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
}

/**
 * Resolve the API base URL for building full endpoint URLs.
 * Prefers `servers[0].url` from the spec; falls back to the root of the config URL.
 */
function resolveBaseUrl(spec: OpenApiSpec, configUrl: string): string {
  // OpenAPI 3.x: servers array
  const serverUrl = spec.servers?.[0]?.url;
  if (serverUrl && serverUrl.startsWith('http')) { return serverUrl.replace(/\/$/, ''); }

  // Swagger 2.0: host + basePath
  if (spec.host) {
    const scheme = spec.schemes?.[0] ?? 'https';
    return `${scheme}://${spec.host}${spec.basePath ?? ''}`.replace(/\/$/, '');
  }

  // Fallback: derive from the config URL root
  try {
    const parsed = new URL(configUrl);
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return configUrl.replace(/\/[^/]*\.json.*$/, '');
  }
}
