import React, { useCallback, useEffect, useRef, useState } from 'react';
import { NodeProps, Node, Position } from '@xyflow/react';
import styled, { css, keyframes } from 'styled-components';
import { NodeWrapper, TopHandle, BottomHandle, RightHandle } from './BaseNode';
import { NodeRuntimeOverlay } from './NodeRuntimeOverlay';
import { useNodeDataUpdate } from '../context/PipeletFilesContext';
import vscodeApi from '../vscodeApi';

// ─── Types ────────────────────────────────────────────────────────────────────

interface EndpointParam {
  name: string;
  in: 'path' | 'query' | 'header' | 'body' | 'formData' | 'cookie';
  required?: boolean;
  type?: string;
  description?: string;
}

interface ResponseEntry { status: string; description: string; sample?: unknown }

interface NodeData {
  label: string;
  subtitle?: string;
  method?: string;
  path?: string;
  baseUrl?: string;
  summary?: string;
  params?: EndpointParam[];
  requestSample?: unknown;
  responses?: ResponseEntry[];
  /** User-edited parameter values: key → stringified value */
  paramValues?: Record<string, string>;
  /** User-edited body JSON string */
  bodyValue?: string;
  [k: string]: unknown;
}

// ─── Method color palette ─────────────────────────────────────────────────────

const METHOD_COLOR: Record<string, string> = {
  get:    '#22c55e',
  post:   '#3b82f6',
  put:    '#f59e0b',
  patch:  '#f97316',
  delete: '#ef4444',
  head:   '#8b5cf6',
  options:'#6b7280',
};

function methodColor(m: string) { return METHOD_COLOR[m.toLowerCase()] ?? '#6b7280'; }

// ─── SVG icons (matching OpenAPI Explorer ThemeIcons) ────────────────────────

function GetIcon({ color }: { color: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
      <path d="M8 2v8M4 7l4 4 4-4" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}
function PostIcon({ color }: { color: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
      <path d="M8 3v10M3 8h10" stroke={color} strokeWidth="1.8" strokeLinecap="round"/>
    </svg>
  );
}
function PutIcon({ color }: { color: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
      <path d="M3 12l2.5-2.5 3 3L13 5" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}
function PatchIcon({ color }: { color: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
      <rect x="2" y="5" width="12" height="6" rx="1.5" stroke={color} strokeWidth="1.5"/>
      <path d="M5 8h6" stroke={color} strokeWidth="1.5" strokeLinecap="round"/>
      <path d="M9 6l2 2-2 2" stroke={color} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}
function DeleteIcon({ color }: { color: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
      <path d="M4 4h8M6 4V3h4v1M5 4l.5 8h5l.5-8" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}
function DefaultIcon({ color }: { color: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="5.5" stroke={color} strokeWidth="1.5"/>
      <path d="M8 5v3l2 1.5" stroke={color} strokeWidth="1.4" strokeLinecap="round"/>
    </svg>
  );
}

function MethodIcon({ method }: { method: string }) {
  const color = methodColor(method);
  switch (method.toLowerCase()) {
    case 'get':    return <GetIcon color={color} />;
    case 'post':   return <PostIcon color={color} />;
    case 'put':    return <PutIcon color={color} />;
    case 'patch':  return <PatchIcon color={color} />;
    case 'delete': return <DeleteIcon color={color} />;
    default:       return <DefaultIcon color={color} />;
  }
}

// ─── Styled components ────────────────────────────────────────────────────────

const NodeBox = styled.div<{ $selected: boolean }>`
  position: relative;
  width: 64px;
  height: 64px;
  border-radius: 12px;
  background: #1e2435;
  border: 1.5px solid #2e3650;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  cursor: default;
  ${({ $selected }) => $selected && css`
    outline: 3px solid #ff7105;
    outline-offset: 3px;
  `}
`;

const MethodBadge = styled.div<{ $color: string }>`
  font-size: 8px;
  font-weight: 800;
  letter-spacing: 0.06em;
  padding: 1px 5px;
  border-radius: 4px;
  background: ${({ $color }) => $color}22;
  color: ${({ $color }) => $color};
  border: 1px solid ${({ $color }) => $color}55;
  line-height: 1.4;
  user-select: none;
`;

const PathBadge = styled.div`
  position: absolute;
  bottom: -26px;
  left: 50%;
  transform: translateX(-50%);
  font-size: 9px;
  color: #8899bb;
  background: #0d1117;
  border: 1px solid #2e3650;
  border-radius: 5px;
  padding: 2px 6px;
  white-space: nowrap;
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  pointer-events: none;
  user-select: none;
`;

const AuthDot = styled.div`
  position: absolute;
  top: 2px;
  right: 2px;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #22c55e;
  border: 1.5px solid #1e2435;
`;

const spin = keyframes`from { transform: rotate(0deg) } to { transform: rotate(360deg) }`;

// ─── Parameter Panel ──────────────────────────────────────────────────────────

const Panel = styled.div`
  position: absolute;
  top: 0;
  left: calc(100% + 12px);
  z-index: 9999;
  background: #0d1117;
  border: 1px solid #30363d;
  border-radius: 10px;
  min-width: 280px;
  max-width: 380px;
  box-shadow: 0 12px 40px rgba(0,0,0,0.6);
  font-family: 'Consolas', 'Menlo', monospace;
  font-size: 11px;
  color: #c9d1d9;
  overflow: hidden;
  pointer-events: all;
`;

const PanelHeader = styled.div<{ $color: string }>`
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 9px 12px;
  background: ${({ $color }) => $color}18;
  border-bottom: 1px solid #21262d;
`;

const MethodTag = styled.span<{ $color: string }>`
  font-size: 9px;
  font-weight: 800;
  letter-spacing: 0.08em;
  padding: 2px 6px;
  border-radius: 4px;
  background: ${({ $color }) => $color}25;
  color: ${({ $color }) => $color};
  border: 1px solid ${({ $color }) => $color}50;
  flex-shrink: 0;
`;

const PathText = styled.span`
  font-size: 10px;
  color: #e6edf3;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const PanelBody = styled.div`
  padding: 10px 12px;
  max-height: 400px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 10px;
  &::-webkit-scrollbar { width: 4px }
  &::-webkit-scrollbar-track { background: transparent }
  &::-webkit-scrollbar-thumb { background: #30363d; border-radius: 2px }
`;

const SectionLabel = styled.div`
  font-size: 8.5px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: #484f58;
  margin-bottom: 4px;
`;

const ParamRow = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 4px;
`;

const ParamName = styled.label`
  font-size: 10px;
  color: #8b949e;
  width: 90px;
  flex-shrink: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const RequiredStar = styled.span`
  color: #f85149;
  margin-left: 1px;
`;

const ParamInput = styled.input`
  flex: 1;
  background: #161b22;
  border: 1px solid #30363d;
  border-radius: 5px;
  color: #c9d1d9;
  font-size: 10px;
  font-family: inherit;
  padding: 3px 7px;
  outline: none;
  &:focus {
    border-color: #58a6ff;
  }
`;

const InBadge = styled.span<{ $in: string }>`
  font-size: 7.5px;
  padding: 1px 4px;
  border-radius: 3px;
  flex-shrink: 0;
  background: ${({ $in }) =>
    $in === 'path'     ? '#1a3a6e' :
    $in === 'query'    ? '#163a16' :
    $in === 'body'     ? '#4a2200' :
    $in === 'header'   ? '#2a1a4a' :
    '#1e1e3a'};
  color: ${({ $in }) =>
    $in === 'path'     ? '#7eb8ff' :
    $in === 'query'    ? '#7eff7e' :
    $in === 'body'     ? '#ff9a50' :
    $in === 'header'   ? '#d2a0ff' :
    '#a0a8ff'};
`;

const BodyTextarea = styled.textarea`
  width: 100%;
  min-height: 90px;
  background: #161b22;
  border: 1px solid #30363d;
  border-radius: 5px;
  color: #c9d1d9;
  font-size: 10px;
  font-family: 'Consolas', 'Menlo', monospace;
  padding: 6px 8px;
  resize: vertical;
  outline: none;
  box-sizing: border-box;
  &:focus { border-color: #58a6ff }
`;

const RunButton = styled.button<{ $loading?: boolean }>`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  width: 100%;
  padding: 7px;
  background: #1f6feb;
  color: #fff;
  border: none;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  font-family: inherit;
  &:hover { background: #388bfd }
  &:active { background: #1158c7 }
  ${({ $loading }) => $loading && css`
    opacity: 0.7;
    cursor: default;
  `}
`;

const Spinner = styled.div`
  width: 11px;
  height: 11px;
  border: 2px solid #ffffff55;
  border-top-color: #fff;
  border-radius: 50%;
  animation: ${spin} 0.7s linear infinite;
`;

const ResponseBox = styled.div<{ $status?: number }>`
  background: #161b22;
  border: 1px solid ${({ $status }) =>
    $status && $status < 300 ? '#2ea04326' :
    $status && $status < 500 ? '#9e6a0326' :
    '#f8514926'};
  border-radius: 5px;
  padding: 6px 8px;
`;

const ResponseStatus = styled.div<{ $status?: number }>`
  font-size: 9px;
  font-weight: 700;
  color: ${({ $status }) =>
    $status && $status < 300 ? '#3fb950' :
    $status && $status < 500 ? '#d29922' :
    '#f85149'};
  margin-bottom: 4px;
`;

const ResponseBody = styled.pre`
  font-size: 9px;
  color: #8b949e;
  margin: 0;
  white-space: pre-wrap;
  word-break: break-all;
  max-height: 120px;
  overflow-y: auto;
`;

const StoreTokenBtn = styled.button`
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  background: #22c55e22;
  color: #22c55e;
  border: 1px solid #22c55e44;
  border-radius: 5px;
  font-size: 9px;
  font-weight: 700;
  cursor: pointer;
  font-family: inherit;
  margin-top: 4px;
  &:hover { background: #22c55e33 }
`;

const AuthBanner = styled.div`
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 9px;
  color: #22c55e;
  background: #22c55e11;
  border: 1px solid #22c55e33;
  border-radius: 5px;
  padding: 4px 8px;
`;

// ─── Component ────────────────────────────────────────────────────────────────

type MethodCallData = NodeData & Record<string, unknown>;

export const MethodCallNode: React.FC<NodeProps<Node<MethodCallData>>> = ({ id, data, selected }) => {
  const nodeData = data as unknown as MethodCallData;

  const method    = (nodeData.method ?? 'get').toLowerCase();
  const path      = nodeData.path ?? nodeData.label ?? '/';
  const baseUrl   = nodeData.baseUrl ?? '';
  const params    = (nodeData.params  as EndpointParam[] | undefined) ?? [];
  const reqSample = nodeData.requestSample;
  const color     = methodColor(method);

  const [open, setOpen]         = useState(false);
  const [paramValues, setParamValues] = useState<Record<string, string>>(
    (nodeData.paramValues as Record<string, string> | undefined) ?? {}
  );
  const [bodyValue, setBodyValue] = useState<string>(
    nodeData.bodyValue as string ?? (reqSample ? JSON.stringify(reqSample, null, 2) : '')
  );
  const [running, setRunning]   = useState(false);
  const [response, setResponse] = useState<{ status: number; body: string } | null>(null);
  const [hasToken, setHasToken] = useState(false);
  const [detectedToken, setDetectedToken] = useState<string | null>(null);

  const updateNodeData = useNodeDataUpdate();
  const panelRef = useRef<HTMLDivElement>(null);
  const reqIdRef = useRef<string | null>(null);

  // Ask extension for current token on mount
  useEffect(() => {
    if (!baseUrl) return;
    const reqId = `token-check-${id}`;
    reqIdRef.current = reqId;
    vscodeApi?.postMessage({ type: 'request-api-token', baseUrl, reqId });
  }, [id, baseUrl]);

  // Listen for extension responses
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      const msg = e.data;
      if (!msg) return;

      // Token check response
      if (msg.type === 'api-token-response' && msg.reqId === reqIdRef.current) {
        setHasToken(!!msg.token);
      }

      // HTTP call response
      if (msg.type === 'http-call-response' && msg.nodeId === id) {
        setRunning(false);
        const statusCode = typeof msg.status === 'number' ? msg.status : 0;
        let bodyStr = '';
        try {
          bodyStr = typeof msg.body === 'string' ? msg.body : JSON.stringify(msg.body, null, 2);
        } catch { bodyStr = String(msg.body ?? ''); }
        setResponse({ status: statusCode, body: bodyStr });

        // Detect bearer token in response
        try {
          const parsed = typeof msg.body === 'object' ? msg.body as Record<string, unknown>
            : JSON.parse(msg.body as string) as Record<string, unknown>;
          const token = parsed.token ?? parsed.accessToken ?? parsed.access_token
            ?? parsed.bearerToken ?? parsed.bearer_token ?? parsed.jwt;
          if (typeof token === 'string' && token.length > 10) {
            setDetectedToken(`Bearer ${token}`);
          }
        } catch { /* not JSON */ }
      }

      // Token stored confirmation
      if (msg.type === 'api-token-stored' && msg.baseUrl === baseUrl) {
        setHasToken(true);
        setDetectedToken(null);
      }
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, [id, baseUrl]);

  const nonBodyParams = params.filter((p) => p.in !== 'body' && p.in !== 'formData');
  const hasBodyParam  = params.some((p)  => p.in === 'body' || p.in === 'formData');

  const handleParamChange = useCallback((name: string, value: string) => {
    setParamValues((prev) => {
      const next = { ...prev, [name]: value };
      updateNodeData(id, { ...nodeData, paramValues: next });
      return next;
    });
  }, [id, nodeData, updateNodeData]);

  const handleBodyChange = useCallback((value: string) => {
    setBodyValue(value);
    updateNodeData(id, { ...nodeData, bodyValue: value });
  }, [id, nodeData, updateNodeData]);

  const handleRun = useCallback(() => {
    if (running) return;
    setRunning(true);
    setResponse(null);
    setDetectedToken(null);

    // Build URL substituting path params
    let resolvedPath = path;
    for (const [k, v] of Object.entries(paramValues)) {
      resolvedPath = resolvedPath.replace(`{${k}}`, encodeURIComponent(v));
    }

    // Build query string
    const queryParams = nonBodyParams.filter((p) => p.in === 'query');
    const qs = queryParams
      .filter((p) => paramValues[p.name] !== undefined && paramValues[p.name] !== '')
      .map((p) => `${encodeURIComponent(p.name)}=${encodeURIComponent(paramValues[p.name] ?? '')}`)
      .join('&');
    const url = `${baseUrl}${resolvedPath}${qs ? '?' + qs : ''}`;

    // Build headers
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const headerParams = nonBodyParams.filter((p) => p.in === 'header');
    for (const p of headerParams) {
      if (paramValues[p.name]) { headers[p.name] = paramValues[p.name]; }
    }

    // Body
    let body: string | undefined;
    if (['post', 'put', 'patch'].includes(method) && bodyValue.trim()) {
      body = bodyValue.trim();
    }

    vscodeApi?.postMessage({
      type: 'http-call-execute',
      nodeId: id,
      method: method.toUpperCase(),
      url,
      headers,
      body,
      baseUrl,
    });
  }, [running, path, paramValues, nonBodyParams, baseUrl, method, bodyValue, id]);

  const handleStoreToken = useCallback(() => {
    if (!detectedToken) return;
    vscodeApi?.postMessage({ type: 'store-api-token', baseUrl, token: detectedToken });
  }, [baseUrl, detectedToken]);

  // Close panel on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as HTMLElement)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <NodeWrapper>
      <TopHandle    type="target" position={Position.Top}    id="input"  className="node-handle" />
      <BottomHandle type="source" position={Position.Bottom} id="output" className="node-handle" />
      <RightHandle  type="source" position={Position.Right}  id="error"  className="node-handle" />

      <NodeBox $selected={selected} className="node-inner-box" onClick={() => setOpen((v) => !v)}>
        {hasToken && <AuthDot title="Authenticated" />}
        <MethodIcon method={method} />
        <MethodBadge $color={color}>{method.toUpperCase()}</MethodBadge>
      </NodeBox>

      <PathBadge title={path}>{path}</PathBadge>

      {open && (
        <Panel ref={panelRef} onMouseDown={(e) => e.stopPropagation()}>
          <PanelHeader $color={color}>
            <MethodTag $color={color}>{method.toUpperCase()}</MethodTag>
            <PathText title={`${baseUrl}${path}`}>{path}</PathText>
          </PanelHeader>

          <PanelBody>
            {/* Auth banner */}
            {hasToken && (
              <AuthBanner>
                <svg width="10" height="10" viewBox="0 0 16 16" fill="none">
                  <circle cx="8" cy="8" r="6" stroke="#22c55e" strokeWidth="1.8"/>
                  <path d="M5 8l2.5 2.5L11 5.5" stroke="#22c55e" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                Authenticated — Bearer token active
              </AuthBanner>
            )}

            {/* Non-body parameters */}
            {nonBodyParams.length > 0 && (
              <div>
                <SectionLabel>Parameters</SectionLabel>
                {nonBodyParams.map((p) => (
                  <ParamRow key={p.name}>
                    <InBadge $in={p.in}>{p.in}</InBadge>
                    <ParamName title={p.description ?? p.name}>
                      {p.name}{p.required && <RequiredStar>*</RequiredStar>}
                    </ParamName>
                    <ParamInput
                      value={paramValues[p.name] ?? ''}
                      placeholder={p.type ?? 'value'}
                      onChange={(e) => handleParamChange(p.name, e.target.value)}
                    />
                  </ParamRow>
                ))}
              </div>
            )}

            {/* Body / formData */}
            {(hasBodyParam || ['post', 'put', 'patch'].includes(method)) && (
              <div>
                <SectionLabel>Request Body (JSON)</SectionLabel>
                <BodyTextarea
                  value={bodyValue}
                  placeholder='{ "key": "value" }'
                  onChange={(e) => handleBodyChange(e.target.value)}
                  spellCheck={false}
                />
              </div>
            )}

            {/* Run button */}
            <RunButton $loading={running} onClick={handleRun} disabled={running}>
              {running ? <Spinner /> : (
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                  <path d="M4 2l10 6-10 6V2z" fill="currentColor"/>
                </svg>
              )}
              {running ? 'Executing…' : 'Execute'}
            </RunButton>

            {/* Response */}
            {response && (
              <div>
                <SectionLabel>Response</SectionLabel>
                <ResponseBox $status={response.status}>
                  <ResponseStatus $status={response.status}>
                    HTTP {response.status}
                  </ResponseStatus>
                  <ResponseBody>{response.body}</ResponseBody>
                </ResponseBox>
                {detectedToken && (
                  <StoreTokenBtn onClick={handleStoreToken}>
                    <svg width="9" height="9" viewBox="0 0 16 16" fill="none">
                      <path d="M8 1C5.8 1 4 2.8 4 5c0 1.4.7 2.7 1.8 3.4L5 14h6l-.8-5.6C11.3 7.7 12 6.4 12 5c0-2.2-1.8-4-4-4z" fill="currentColor"/>
                    </svg>
                    Store Bearer Token for {new URL(baseUrl || 'http://x').hostname}
                  </StoreTokenBtn>
                )}
              </div>
            )}
          </PanelBody>
        </Panel>
      )}

      <NodeRuntimeOverlay nodeId={id} />
    </NodeWrapper>
  );
};
