import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  VSCodeButton,
  VSCodeDivider,
  VSCodeDropdown,
  VSCodeOption,
  VSCodeTextArea,
  VSCodeTextField,
} from '@vscode/webview-ui-toolkit/react';

declare function acquireVsCodeApi(): {
  postMessage(msg: unknown): void;
};
const vscode = typeof acquireVsCodeApi !== 'undefined' ? acquireVsCodeApi() : undefined;

interface WebformFileEntry { name: string; uri: string; }

interface PipeletFileEntry {
  name: string;
  uri: string;
  content: string;
  handler?: string;
  handlerUri?: string;
  inputs: Record<string, string>;
  outputs: Record<string, string>;
  ai?: Record<string, unknown>;
}

interface FlowNodeEntry { id: string; label: string; nodeType: string; }
interface FlowEntry { name: string; startNodes: Array<{ id: string; label: string }>; }

interface NodeDetailContext {
  pipeletFiles?: PipeletFileEntry[];
  webformFiles?: WebformFileEntry[];
  flowNodes?: FlowNodeEntry[];
  flows?: FlowEntry[];
}

interface NodePayload {
  id: string;
  nodeType: string;
  data: Record<string, unknown>;
  context?: NodeDetailContext;
}

interface GenericFields {
  label: string;
  subtitle: string;
  status: string;
  script: string;
  condition: string;
  expression: string;
}

interface ProcessFields {
  label: string;
  subtitle: string;
  status: string;
  pipeletFile: string;
  pipeletHandler: string;
  pipeletSkill: string;
  inputMapping: Record<string, string>;
  outputMapping: Record<string, string>;
}

interface ApprovalFields {
  label: string;
  assigneeType: 'user' | 'group';
  assigneeName: string;
  webFormFile: string;
}

const APPROVAL_OUTCOMES = [
  { id: 'approved',               label: 'Approved',             color: '#4ade80', desc: 'Request accepted'             },
  { id: 'rejected',               label: 'Rejected',             color: '#f87171', desc: 'Flat rejection'               },
  { id: 'rejected_with_feedback', label: 'Rejected w/ Feedback', color: '#fb923c', desc: 'Rejected, corrections needed' },
  { id: 'info_requested',         label: 'Info Requested',       color: '#60a5fa', desc: 'Returned for more information' },
  { id: 'escalated',              label: 'Escalated',            color: '#fbbf24', desc: 'Forwarded to higher authority' },
];

const DEFAULT_SCRIPTS: Record<string, string> = {
  fn:       '// Function node\nfunction run(input) {\n  return input;\n}',
  script:   '// Script node\nconst result = input.data;\nreturn result;',
  decision: '// Decision node\nif (input.value > 0) {\n  return "yes";\n}\nreturn "no";',
  loop:     '// Loop node\nfor (const item of input.items) {\n  process(item);\n}',
};

const TYPE_LABELS: Record<string, string> = {
  custom: 'Custom', fn: 'Function', decision: 'Decision', script: 'Script',
  stop: 'Stop', end: 'End', view: 'View', loop: 'Loop',
  call: 'Call', join: 'Join', start: 'Start',
  input: 'Input', process: 'Process', output: 'Output',
  approval: 'Approval', jump: 'Jump',
  methodCall: 'HTTP Call', httpCall: 'HTTP Call',
};

const TYPE_COLORS: Record<string, string> = {
  start: '#43a047', fn: '#1565c0', decision: '#e65100', script: '#6a1b9a',
  stop: '#c62828', end: '#4a148c', view: '#00695c', loop: '#283593',
  call: '#006064', join: '#37474f', input: '#2e7d32', process: '#1565c0',
  output: '#ef6c00', custom: '#555', approval: '#7c3aed', jump: '#e6a020',
  methodCall: '#3b82f6', httpCall: '#3b82f6',
};

const STATUSES = ['idle', 'running', 'success', 'error', 'disabled'];

function toStr(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

function toRecord(v: unknown): Record<string, string> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) { return {}; }
  return Object.fromEntries(
    Object.entries(v as Record<string, unknown>).map(([key, value]) => [key, toStr(value)]),
  );
}

function Header({ payload, subtitle }: { payload: NodePayload; subtitle?: string }) {
  const color = TYPE_COLORS[payload.nodeType] ?? '#555';
  const typeLabel = TYPE_LABELS[payload.nodeType] ?? payload.nodeType;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
      <span style={{
        fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 999,
        background: 'var(--vscode-badge-background)', color: 'var(--vscode-badge-foreground)',
      }}>
        {payload.id}
      </span>
      <span style={{ fontSize: 13, fontWeight: 700, color }}>{typeLabel}</span>
      {subtitle ? <span style={{ fontSize: 11, color: 'var(--vscode-descriptionForeground)' }}>{subtitle}</span> : null}
    </div>
  );
}

function fieldValue(e: Event | React.ChangeEvent): string {
  return (e as React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>).target.value;
}

// ── Approval Node Form ─────────────────────────────────────────────────────────
function ApprovalForm({ payload }: { payload: NodePayload }) {
  const { data } = payload;
  const webformFiles = payload.context?.webformFiles ?? [];

  const [fields, setFields] = useState<ApprovalFields>({
    label:        toStr(data.label),
    assigneeType: (data.assigneeType === 'group' ? 'group' : 'user'),
    assigneeName: toStr(data.assigneeName),
    webFormFile:  toStr(data.webFormFile),
  });

  // Re-sync when a different node is shown
  useEffect(() => {
    setFields({
      label:        toStr(data.label),
      assigneeType: (data.assigneeType === 'group' ? 'group' : 'user'),
      assigneeName: toStr(data.assigneeName),
      webFormFile:  toStr(data.webFormFile),
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payload.id]);

  const handleSave = () => {
    vscode?.postMessage({ type: 'save-node', id: payload.id, fields });
  };

  return (
    <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <span style={{
          fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 999,
          background: 'var(--vscode-badge-background)', color: 'var(--vscode-badge-foreground)',
        }}>
          {payload.id}
        </span>
        <span style={{ fontSize: 13, fontWeight: 700, color: '#7c3aed' }}>Approval</span>
        <span style={{ fontSize: 11, color: 'var(--vscode-descriptionForeground)' }}>Human Review</span>
      </div>

      <VSCodeDivider />

      {/* Label */}
      <label style={labelStyle}>Label</label>
      <VSCodeTextField
        value={fields.label}
        onInput={(e) => {
          const v = (e as React.ChangeEvent<HTMLInputElement>).target.value;
          setFields(prev => ({ ...prev, label: v }));
        }}
        placeholder="e.g. Manager Approval"
      />

      <VSCodeDivider />

      {/* Assignee type */}
      <label style={labelStyle}>Assignee Type</label>
      <div style={{ display: 'flex', gap: 6 }}>
        {(['user', 'group'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setFields(prev => ({ ...prev, assigneeType: t }))}
            style={{
              flex: 1, padding: '5px 0', fontSize: 12, cursor: 'pointer', borderRadius: 4,
              fontWeight: fields.assigneeType === t ? 700 : 400,
              color: fields.assigneeType === t ? '#fff' : 'var(--vscode-foreground)',
              background: fields.assigneeType === t ? '#6d28d9' : 'transparent',
              border: `1px solid ${fields.assigneeType === t ? '#7c3aed' : 'var(--vscode-input-border, #444)'}`,
            }}
          >
            {t === 'user' ? '👤 User' : '👥 Group'}
          </button>
        ))}
      </div>

      {/* Assignee name */}
      <label style={labelStyle}>{fields.assigneeType === 'user' ? 'User ID / Name' : 'Group ID / Name'}</label>
      <VSCodeTextField
        value={fields.assigneeName}
        onInput={(e) => {
          const v = (e as React.ChangeEvent<HTMLInputElement>).target.value;
          setFields(prev => ({ ...prev, assigneeName: v }));
        }}
        placeholder={fields.assigneeType === 'user' ? 'e.g. john.doe' : 'e.g. finance-team'}
      />

      <VSCodeDivider />

      {/* WebForm file */}
      <label style={labelStyle}>Approval Form (.webform)</label>
      {webformFiles.length === 0 ? (
        <div style={{ fontSize: 11, color: 'var(--vscode-descriptionForeground)', fontStyle: 'italic', padding: '4px 0' }}>
          No .webform files found in workspace
        </div>
      ) : (
        <VSCodeDropdown
          value={fields.webFormFile}
          onChange={(e) => {
            const v = (e as React.ChangeEvent<HTMLSelectElement>).target.value;
            setFields(prev => ({ ...prev, webFormFile: v }));
          }}
          style={{ width: '100%' }}
        >
          <VSCodeOption value="">— None —</VSCodeOption>
          {webformFiles.map((f) => (
            <VSCodeOption key={f.name} value={f.name}>{f.name}</VSCodeOption>
          ))}
        </VSCodeDropdown>
      )}

      <VSCodeDivider />

      {/* Outcomes */}
      <label style={labelStyle}>Outcome Handles</label>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        {APPROVAL_OUTCOMES.map((o) => (
          <div key={o.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
            <span style={{
              flexShrink: 0, width: 10, height: 10, borderRadius: '50%',
              background: o.color, display: 'inline-block',
            }} />
            <span style={{ color: 'var(--vscode-foreground)', fontWeight: 600, minWidth: 140 }}>{o.label}</span>
            <span style={{ color: 'var(--vscode-descriptionForeground)', fontSize: 11 }}>{o.desc}</span>
          </div>
        ))}
      </div>

      <VSCodeDivider />

      <VSCodeButton appearance="primary" onClick={handleSave}>Save Changes</VSCodeButton>
    </div>
  );
}

// ── Process Node Form ─────────────────────────────────────────────────────────
function ProcessForm({ payload }: { payload: NodePayload }) {
  const { data } = payload;
  const pipeletFiles = payload.context?.pipeletFiles ?? [];
  const initialPipelet = toStr(data.pipeletFile);
  const [fields, setFields] = useState<ProcessFields>({
    label: toStr(data.label),
    subtitle: toStr(data.subtitle),
    status: toStr(data.status) || 'idle',
    pipeletFile: initialPipelet,
    pipeletHandler: toStr(data.pipeletHandler),
    pipeletSkill: toStr(data.pipeletSkill),
    inputMapping: toRecord(data.inputMapping),
    outputMapping: toRecord(data.outputMapping),
  });

  useEffect(() => {
    setFields({
      label: toStr(data.label),
      subtitle: toStr(data.subtitle),
      status: toStr(data.status) || 'idle',
      pipeletFile: toStr(data.pipeletFile),
      pipeletHandler: toStr(data.pipeletHandler),
      pipeletSkill: toStr(data.pipeletSkill),
      inputMapping: toRecord(data.inputMapping),
      outputMapping: toRecord(data.outputMapping),
    });
  }, [payload.id, data]);

  const selectedPipelet = pipeletFiles.find((p) => p.name === fields.pipeletFile);

  const setField = (key: keyof ProcessFields) => (e: Event | React.ChangeEvent) => {
    setFields((prev) => ({ ...prev, [key]: fieldValue(e) }));
  };

  const selectPipelet = (e: Event | React.ChangeEvent) => {
    const nextName = fieldValue(e);
    const nextPipelet = pipeletFiles.find((p) => p.name === nextName);
    setFields((prev) => ({
      ...prev,
      pipeletFile: nextName,
      pipeletHandler: nextPipelet?.handler ?? '',
      pipeletSkill: typeof nextPipelet?.ai?.skill === 'string' ? nextPipelet.ai.skill : '',
      inputMapping: Object.fromEntries(Object.keys(nextPipelet?.inputs ?? {}).map((name) => [name, prev.inputMapping[name] ?? name])),
      outputMapping: Object.fromEntries(Object.keys(nextPipelet?.outputs ?? {}).map((name) => [name, prev.outputMapping[name] ?? name])),
    }));
  };

  const setMapping = (kind: 'inputMapping' | 'outputMapping', name: string) => (e: Event | React.ChangeEvent) => {
    const value = fieldValue(e);
    setFields((prev) => ({
      ...prev,
      [kind]: { ...prev[kind], [name]: value },
    }));
  };

  const handleSave = () => {
    vscode?.postMessage({
      type: 'save-node',
      id: payload.id,
      fields: {
        ...fields,
        subtitle: selectedPipelet?.handler ? selectedPipelet.handler : fields.subtitle,
        pipeletHandler: selectedPipelet?.handler ?? fields.pipeletHandler,
        pipeletSkill: typeof selectedPipelet?.ai?.skill === 'string' ? selectedPipelet.ai.skill : fields.pipeletSkill,
        pipeletAi: selectedPipelet?.ai,
        pipeletInputs: selectedPipelet?.inputs ?? {},
        pipeletOutputs: selectedPipelet?.outputs ?? {},
      },
    });
  };

  return (
    <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <Header payload={payload} subtitle="Pipelet Process" />
      <VSCodeDivider />

      <label style={labelStyle}>Label</label>
      <VSCodeTextField value={fields.label} onInput={setField('label') as never} placeholder="Process label" />

      <label style={labelStyle}>Pipelet Definition</label>
      <VSCodeDropdown value={fields.pipeletFile} onChange={selectPipelet as never} style={{ width: '100%' }}>
        <VSCodeOption value="">Select a .pipelet file</VSCodeOption>
        {pipeletFiles.map((p) => <VSCodeOption key={p.uri} value={p.name}>{p.name}</VSCodeOption>)}
      </VSCodeDropdown>

      {selectedPipelet ? (
        <div style={{ border: '1px solid var(--vscode-panel-border)', borderRadius: 6, padding: 8, display: 'grid', gap: 5 }}>
          <div style={metaLineStyle}><b>Handler</b><span>{selectedPipelet.handler || 'Not defined'}</span></div>
          <div style={metaLineStyle}><b>AI Skill</b><span>{typeof selectedPipelet.ai?.skill === 'string' ? selectedPipelet.ai.skill : 'Not defined'}</span></div>
          <div style={metaLineStyle}><b>Inputs</b><span>{Object.keys(selectedPipelet.inputs).join(', ') || 'None'}</span></div>
          <div style={metaLineStyle}><b>Outputs</b><span>{Object.keys(selectedPipelet.outputs).join(', ') || 'None'}</span></div>
          {Array.isArray(selectedPipelet.ai?.capabilities) ? (
            <div style={metaLineStyle}><b>Agent Caps</b><span>{selectedPipelet.ai.capabilities.join(', ')}</span></div>
          ) : null}
        </div>
      ) : (
        <div style={emptyStyle}>Select a pipelet to edit its function input/output configuration.</div>
      )}

      <VSCodeDivider />

      <label style={labelStyle}>Input Mapping</label>
      {selectedPipelet && Object.keys(selectedPipelet.inputs).length > 0 ? (
        <div style={{ display: 'grid', gap: 8 }}>
          {Object.entries(selectedPipelet.inputs).map(([name, type]) => (
            <div key={name} style={{ display: 'grid', gridTemplateColumns: '88px 1fr', gap: 8, alignItems: 'center' }}>
              <span style={fieldNameStyle}>{name}<small>{type}</small></span>
              <VSCodeTextField value={fields.inputMapping[name] ?? ''} onInput={setMapping('inputMapping', name) as never} placeholder={`flow value for ${name}`} />
            </div>
          ))}
        </div>
      ) : <div style={emptyStyle}>No inputs defined.</div>}

      <label style={labelStyle}>Output Mapping</label>
      {selectedPipelet && Object.keys(selectedPipelet.outputs).length > 0 ? (
        <div style={{ display: 'grid', gap: 8 }}>
          {Object.entries(selectedPipelet.outputs).map(([name, type]) => (
            <div key={name} style={{ display: 'grid', gridTemplateColumns: '88px 1fr', gap: 8, alignItems: 'center' }}>
              <span style={fieldNameStyle}>{name}<small>{type}</small></span>
              <VSCodeTextField value={fields.outputMapping[name] ?? ''} onInput={setMapping('outputMapping', name) as never} placeholder={`flow field for ${name}`} />
            </div>
          ))}
        </div>
      ) : <div style={emptyStyle}>No outputs defined.</div>}

      <VSCodeDivider />

      <label style={labelStyle}>Status</label>
      <VSCodeDropdown value={fields.status} onChange={setField('status') as never} style={{ width: '100%' }}>
        {STATUSES.map(s => <VSCodeOption key={s} value={s}>{s}</VSCodeOption>)}
      </VSCodeDropdown>

      <VSCodeButton appearance="primary" onClick={handleSave}>Save Process Config</VSCodeButton>
    </div>
  );
}

// -- Call Node Form -----------------------------------------------------------
interface CallFields { label: string; flow: string; nodeId: string; }

function CallForm({ payload }: { payload: NodePayload }) {
  const { data } = payload;
  const flows = payload.context?.flows ?? [];
  const target = (data.callTarget ?? {}) as { flow?: string; nodeId?: string; label?: string };

  const [fields, setFields] = useState<CallFields>({
    label:  toStr(data.label),
    flow:   toStr(target.flow),
    nodeId: toStr(target.nodeId),
  });

  useEffect(() => {
    const t = (payload.data.callTarget ?? {}) as { flow?: string; nodeId?: string };
    setFields({
      label:  toStr(payload.data.label),
      flow:   toStr(t.flow),
      nodeId: toStr(t.nodeId),
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payload.id]);

  // Flow adlari bosluk/ayirici karakter icerebildigi icin dropdown degeri
  // olarak duzlestirilmis listenin indeksi kullanilir - string kodlama yok.
  const options = flows.flatMap((flow) =>
    flow.startNodes.map((n) => ({ flow: flow.name, id: n.id, label: n.label })),
  );

  const selectedIndex = options.findIndex(
    (o) => o.flow === fields.flow && o.id === fields.nodeId,
  );
  const selectedNode = selectedIndex >= 0 ? options[selectedIndex] : undefined;

  const handleSelect = (e: Event | React.ChangeEvent) => {
    const idx = Number(fieldValue(e));
    const picked = Number.isInteger(idx) && idx >= 0 ? options[idx] : undefined;
    setFields((prev) => ({
      ...prev,
      flow:   picked?.flow ?? '',
      nodeId: picked?.id   ?? '',
    }));
  };

  const handleSave = () => {
    vscode?.postMessage({
      type: 'save-node',
      id: payload.id,
      fields: {
        label: fields.label,
        // `undefined` bir JSON postMessage'da tamamen dusuyor; canvas
        // {...eskiData, ...yeniData} ile birlestirdigi icin hedef temizlenemiyordu.
        // JumpForm'un jumpTargetId: '' desenini yansitip acik bos deger yaziyoruz.
        callTarget: selectedNode
          ? { flow: selectedNode.flow, nodeId: selectedNode.id, label: selectedNode.label }
          : { flow: '', nodeId: '', label: '' },
        subtitle: selectedNode ? `${selectedNode.flow} > ${selectedNode.label}` : '',
      },
    });
  };

  return (
    <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <Header payload={payload} subtitle="Pipeline Call" />
      <VSCodeDivider />

      <label style={labelStyle}>Label</label>
      <VSCodeTextField
        value={fields.label}
        onInput={((e: Event) => setFields((prev) => ({ ...prev, label: fieldValue(e) }))) as never}
        placeholder="Call label"
      />

      <label style={labelStyle}>Call Pipeline / Start Node</label>
      {flows.length === 0 ? (
        <div style={emptyStyle}>No pipelines found.</div>
      ) : (
        <VSCodeDropdown value={String(selectedIndex)} onChange={handleSelect as never} style={{ width: '100%' }}>
          <VSCodeOption value="-1">-- None --</VSCodeOption>
          {options.map((o, i) => (
            <VSCodeOption key={`${o.flow}/${o.id}`} value={String(i)}>
              {o.flow} / {o.label}
            </VSCodeOption>
          ))}
        </VSCodeDropdown>
      )}

      {selectedNode ? (
        <div style={{ border: '1px solid var(--vscode-panel-border)', borderRadius: 6, padding: 8, display: 'grid', gap: 5 }}>
          <div style={metaLineStyle}><b>Flow</b><span>{selectedNode.flow}</span></div>
          <div style={metaLineStyle}><b>Node</b><span>{selectedNode.label}</span></div>
          <div style={metaLineStyle}><b>Node ID</b><span>{selectedNode.id}</span></div>
        </div>
      ) : (
        <div style={emptyStyle}>Select a target start node. Ctrl+Click the node on the canvas to jump there.</div>
      )}

      <VSCodeDivider />
      <VSCodeButton appearance="primary" onClick={handleSave}>Save Call Target</VSCodeButton>
    </div>
  );
}

// -- Jump Node Form -----------------------------------------------------------
function JumpForm({ payload }: { payload: NodePayload }) {
  const { data } = payload;
  // JumpNode yalnizca ayni flow icindeki start node'lara atlar
  const startNodes = (payload.context?.flowNodes ?? []).filter((n) => n.nodeType === 'start');

  const [label, setLabel]   = useState(toStr(data.label));
  const [target, setTarget] = useState(toStr(data.jumpTargetId));

  useEffect(() => {
    setLabel(toStr(payload.data.label));
    setTarget(toStr(payload.data.jumpTargetId));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payload.id]);

  const selected = startNodes.find((n) => n.id === target);

  const handleSave = () => {
    vscode?.postMessage({
      type: 'save-node',
      id: payload.id,
      fields: {
        label,
        jumpTargetId: target,
        subtitle: selected?.label ?? '',
      },
    });
  };

  return (
    <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <Header payload={payload} subtitle="Jump Target" />
      <VSCodeDivider />

      <label style={labelStyle}>Label</label>
      <VSCodeTextField
        value={label}
        onInput={((e: Event) => setLabel(fieldValue(e))) as never}
        placeholder="Jump label"
      />

      <label style={labelStyle}>Jump to Start Node</label>
      {startNodes.length === 0 ? (
        <div style={emptyStyle}>No start nodes in this flow.</div>
      ) : (
        <VSCodeDropdown value={target} onChange={((e: Event) => setTarget(fieldValue(e))) as never} style={{ width: '100%' }}>
          <VSCodeOption value="">-- None --</VSCodeOption>
          {startNodes.map((n) => (
            <VSCodeOption key={n.id} value={n.id}>{n.label} ({n.id})</VSCodeOption>
          ))}
        </VSCodeDropdown>
      )}

      {selected ? null : <div style={emptyStyle}>Select a target. Ctrl+Click the node on the canvas to jump there.</div>}

      <VSCodeDivider />
      <VSCodeButton appearance="primary" onClick={handleSave}>Save Jump Target</VSCodeButton>
    </div>
  );
}

// -- Method Call Node Form ----------------------------------------------------
interface EndpointParam {
  name: string;
  in: 'path' | 'query' | 'header' | 'body' | 'formData' | 'cookie';
  required?: boolean;
  type?: string;
  description?: string;
}

const METHOD_COLOR: Record<string, string> = {
  get: '#22c55e', post: '#3b82f6', put: '#f59e0b', patch: '#f97316',
  delete: '#ef4444', head: '#8b5cf6', options: '#6b7280',
};

function methodColor(m: string): string {
  return METHOD_COLOR[m.toLowerCase()] ?? '#6b7280';
}

function MethodCallForm({ payload }: { payload: NodePayload }) {
  const { data } = payload;

  const method  = toStr(data.method || 'get').toLowerCase();
  const path    = toStr(data.path) || toStr(data.label) || '/';
  const baseUrl = toStr(data.baseUrl);
  const params  = (Array.isArray(data.params) ? data.params : []) as EndpointParam[];
  const color   = methodColor(method);

  const [paramValues, setParamValues] = useState<Record<string, string>>(toRecord(data.paramValues));
  const [bodyValue, setBodyValue]     = useState<string>(
    toStr(data.bodyValue) || (data.requestSample ? JSON.stringify(data.requestSample, null, 2) : ''),
  );
  const [running, setRunning]   = useState(false);
  const [response, setResponse] = useState<{ status: number; body: string } | null>(null);
  const [hasToken, setHasToken] = useState(false);
  const [detectedToken, setDetectedToken] = useState<string | null>(null);

  const reqIdRef = useRef<string | null>(null);

  // Farkli bir node gosterildiginde alanlari sifirla
  useEffect(() => {
    setParamValues(toRecord(payload.data.paramValues));
    setBodyValue(
      toStr(payload.data.bodyValue)
        || (payload.data.requestSample ? JSON.stringify(payload.data.requestSample, null, 2) : ''),
    );
    setResponse(null);
    setDetectedToken(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payload.id]);

  // Token durumunu sor
  useEffect(() => {
    if (!baseUrl) { setHasToken(false); return; }
    const reqId = `token-check-${payload.id}`;
    reqIdRef.current = reqId;
    vscode?.postMessage({ type: 'request-api-token', baseUrl, reqId });
  }, [payload.id, baseUrl]);

  // Eklenti host yanitlarini dinle
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      const msg = e.data;
      if (!msg) { return; }

      if (msg.type === 'api-token-response' && msg.reqId === reqIdRef.current) {
        setHasToken(!!msg.token);
      }

      if (msg.type === 'http-call-response' && msg.nodeId === payload.id) {
        setRunning(false);
        const statusCode = typeof msg.status === 'number' ? msg.status : 0;
        let bodyStr = '';
        try {
          bodyStr = typeof msg.body === 'string' ? msg.body : JSON.stringify(msg.body, null, 2);
        } catch { bodyStr = String(msg.body ?? ''); }
        setResponse({ status: statusCode, body: bodyStr });

        // Yanitta bearer token ara
        try {
          const parsed = typeof msg.body === 'object'
            ? msg.body as Record<string, unknown>
            : JSON.parse(msg.body as string) as Record<string, unknown>;
          const token = parsed.token ?? parsed.accessToken ?? parsed.access_token
            ?? parsed.bearerToken ?? parsed.bearer_token ?? parsed.jwt;
          if (typeof token === 'string' && token.length > 10) {
            setDetectedToken(`Bearer ${token}`);
          }
        } catch { /* JSON degil */ }
      }

      if (msg.type === 'api-token-stored' && msg.baseUrl === baseUrl) {
        setHasToken(true);
        setDetectedToken(null);
      }
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, [payload.id, baseUrl]);

  const nonBodyParams = params.filter((p) => p.in !== 'body' && p.in !== 'formData');
  const hasBodyParam  = params.some((p)  => p.in === 'body' || p.in === 'formData');

  const handleRun = () => {
    if (running) { return; }
    setRunning(true);
    setResponse(null);
    setDetectedToken(null);

    let resolvedPath = path;
    for (const [k, v] of Object.entries(paramValues)) {
      resolvedPath = resolvedPath.replace(`{${k}}`, encodeURIComponent(v));
    }

    const qs = nonBodyParams
      .filter((p) => p.in === 'query')
      .filter((p) => paramValues[p.name] !== undefined && paramValues[p.name] !== '')
      .map((p) => `${encodeURIComponent(p.name)}=${encodeURIComponent(paramValues[p.name] ?? '')}`)
      .join('&');
    const url = `${baseUrl}${resolvedPath}${qs ? '?' + qs : ''}`;

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    for (const p of nonBodyParams.filter((x) => x.in === 'header')) {
      if (paramValues[p.name]) { headers[p.name] = paramValues[p.name]; }
    }

    const body = ['post', 'put', 'patch'].includes(method) && bodyValue.trim()
      ? bodyValue.trim()
      : undefined;

    vscode?.postMessage({
      type: 'http-call-execute',
      nodeId: payload.id,
      method: method.toUpperCase(),
      url,
      headers,
      body,
      baseUrl,
    });
  };

  const handleSave = () => {
    vscode?.postMessage({
      type: 'save-node',
      id: payload.id,
      fields: { label: toStr(data.label), paramValues, bodyValue },
    });
  };

  const statusColor = response
    ? (response.status >= 200 && response.status < 300 ? '#22c55e'
      : response.status === 0 ? '#ef4444' : '#f59e0b')
    : '#6b7280';

  return (
    <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <span style={{
          fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 4,
          background: `${color}22`, border: `1px solid ${color}55`, color,
        }}>
          {method.toUpperCase()}
        </span>
        <span
          style={{
            fontSize: 12, fontFamily: 'var(--vscode-editor-font-family, monospace)',
            color: 'var(--vscode-foreground)', overflow: 'hidden', textOverflow: 'ellipsis',
          }}
          title={`${baseUrl}${path}`}
        >
          {path}
        </span>
      </div>

      {hasToken && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#22c55e',
          background: '#22c55e11', border: '1px solid #22c55e33', borderRadius: 5, padding: '4px 8px',
        }}>
          Authenticated - Bearer token active
        </div>
      )}

      <VSCodeDivider />

      {nonBodyParams.length > 0 ? (
        <>
          <label style={labelStyle}>Parameters</label>
          <div style={{ display: 'grid', gap: 8 }}>
            {nonBodyParams.map((p) => (
              <div key={p.name} style={{ display: 'grid', gridTemplateColumns: '96px 1fr', gap: 8, alignItems: 'center' }}>
                <span style={fieldNameStyle} title={p.description ?? p.name}>
                  {p.name}{p.required ? ' *' : ''}<small>{p.in}</small>
                </span>
                <VSCodeTextField
                  value={paramValues[p.name] ?? ''}
                  placeholder={p.type ?? 'value'}
                  onInput={((e: Event) => {
                    const v = fieldValue(e);
                    setParamValues((prev) => ({ ...prev, [p.name]: v }));
                  }) as never}
                />
              </div>
            ))}
          </div>
        </>
      ) : <div style={emptyStyle}>No parameters defined.</div>}

      {(hasBodyParam || ['post', 'put', 'patch'].includes(method)) && (
        <>
          <label style={labelStyle}>Request Body (JSON)</label>
          <VSCodeTextArea
            value={bodyValue}
            rows={8}
            resize="vertical"
            style={codeAreaStyle}
            placeholder='{ "key": "value" }'
            onInput={((e: Event) => setBodyValue(fieldValue(e))) as never}
          />
        </>
      )}

      <VSCodeDivider />

      <div style={{ display: 'flex', gap: 6 }}>
        <VSCodeButton appearance="primary" onClick={handleRun} disabled={running} style={{ flex: 1 }}>
          {running ? 'Executing...' : 'Execute'}
        </VSCodeButton>
        <VSCodeButton appearance="secondary" onClick={handleSave}>Save</VSCodeButton>
      </div>

      {response && (
        <>
          <label style={labelStyle}>Response</label>
          <div style={{ border: `1px solid ${statusColor}55`, borderRadius: 6, overflow: 'hidden' }}>
            <div style={{
              padding: '4px 8px', fontSize: 11, fontWeight: 700,
              color: statusColor, background: `${statusColor}18`,
            }}>
              HTTP {response.status}
            </div>
            <pre style={{
              margin: 0, padding: 8, maxHeight: 260, overflow: 'auto',
              fontFamily: 'var(--vscode-editor-font-family, monospace)',
              fontSize: 11, whiteSpace: 'pre-wrap', wordBreak: 'break-all',
              color: 'var(--vscode-foreground)',
            }}>
              {response.body}
            </pre>
          </div>
          {detectedToken && (
            <VSCodeButton
              appearance="secondary"
              onClick={() => vscode?.postMessage({ type: 'store-api-token', baseUrl, token: detectedToken })}
            >
              Store Bearer Token
            </VSCodeButton>
          )}
        </>
      )}
    </div>
  );
}

// ── Node-Type-Aware Generic Form ──────────────────────────────────────────────
const NODE_FIELD_CONFIG: Record<string, { subtitle: string; fields: Array<keyof GenericFields>; scriptLabel?: string }> = {
  start:    { subtitle: 'Flow Entry', fields: ['label', 'subtitle', 'status'] },
  end:      { subtitle: 'Flow Completion', fields: ['label', 'subtitle', 'status'] },
  stop:     { subtitle: 'Execution Stop', fields: ['label', 'subtitle', 'status'] },
  join:     { subtitle: 'Merge Branches', fields: ['label', 'subtitle', 'status'] },
  view:     { subtitle: 'View Render', fields: ['label', 'subtitle', 'expression', 'status'] },
  decision: { subtitle: 'Branch Logic', fields: ['label', 'subtitle', 'condition', 'status'], scriptLabel: 'Condition Script' },
  loop:     { subtitle: 'Iteration', fields: ['label', 'subtitle', 'expression', 'status', 'script'], scriptLabel: 'Loop Script' },
  script:   { subtitle: 'Script Execution', fields: ['label', 'subtitle', 'status', 'script'], scriptLabel: 'Script' },
  fn:       { subtitle: 'Function Logic', fields: ['label', 'subtitle', 'status', 'script'], scriptLabel: 'Function Body' },
  custom:   { subtitle: 'Custom Node', fields: ['label', 'subtitle', 'status'] },
};

function GenericNodeForm({ payload }: { payload: NodePayload }) {
  const { data, nodeType } = payload;
  const config = NODE_FIELD_CONFIG[nodeType] ?? NODE_FIELD_CONFIG.custom;
  const [fields, setFields] = useState<GenericFields>({
    label: toStr(data.label),
    subtitle: toStr(data.subtitle),
    status: toStr(data.status) || 'idle',
    script: toStr(data.script) || DEFAULT_SCRIPTS[nodeType] || `// ${nodeType} node\n`,
    condition: toStr(data.condition),
    expression: toStr(data.expression),
  });

  useEffect(() => {
    setFields({
      label: toStr(data.label),
      subtitle: toStr(data.subtitle),
      status: toStr(data.status) || 'idle',
      script: toStr(data.script) || DEFAULT_SCRIPTS[nodeType] || `// ${nodeType} node\n`,
      condition: toStr(data.condition),
      expression: toStr(data.expression),
      });
  }, [payload.id, data, nodeType]);

  const set = useCallback((key: keyof GenericFields) => (e: Event | React.ChangeEvent) => {
    setFields(prev => ({ ...prev, [key]: fieldValue(e) }));
  }, []);

  const handleSave = useCallback(() => {
    const nextFields: Record<string, unknown> = { label: fields.label, subtitle: fields.subtitle, status: fields.status };
    for (const key of config.fields) {
      if (key === 'label' || key === 'subtitle' || key === 'status') { continue; }
      nextFields[key] = fields[key];
    }
    vscode?.postMessage({ type: 'save-node', id: payload.id, fields: nextFields });
  }, [config.fields, fields, payload.id]);

  const renderField = (key: keyof GenericFields) => {
    if (key === 'label') {
      return <React.Fragment key={key}><label style={labelStyle}>Label</label><VSCodeTextField value={fields.label} onInput={set('label') as never} placeholder="Node label" /></React.Fragment>;
    }
    if (key === 'subtitle') {
      return <React.Fragment key={key}><label style={labelStyle}>Subtitle</label><VSCodeTextField value={fields.subtitle} onInput={set('subtitle') as never} placeholder="Short description" /></React.Fragment>;
    }
    if (key === 'status') {
      return <React.Fragment key={key}><label style={labelStyle}>Status</label><VSCodeDropdown value={fields.status} onChange={set('status') as never} style={{ width: '100%' }}>{STATUSES.map(s => <VSCodeOption key={s} value={s}>{s}</VSCodeOption>)}</VSCodeDropdown></React.Fragment>;
    }
    if (key === 'script') {
      return <React.Fragment key={key}><label style={labelStyle}>{config.scriptLabel ?? 'Script'}</label><VSCodeTextArea value={fields.script} onInput={set('script') as never} rows={8} resize="vertical" style={codeAreaStyle} /></React.Fragment>;
    }
    const labels: Record<string, string> = { condition: 'Condition', expression: 'Expression' };
    return <React.Fragment key={key}><label style={labelStyle}>{labels[key]}</label><VSCodeTextField value={fields[key]} onInput={set(key) as never} placeholder={labels[key]} /></React.Fragment>;
  };

  return (
    <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <Header payload={payload} subtitle={config.subtitle} />
      <VSCodeDivider />
      {config.fields.map(renderField)}
      <VSCodeButton appearance="primary" onClick={handleSave}>Save Changes</VSCodeButton>
    </div>
  );
}

export function NodeDetailApp() {
  const [payload, setPayload] = useState<NodePayload | null>(null);

  useEffect(() => {
    const handler = (e: MessageEvent) => {
      const msg = e.data as { type: string; payload?: NodePayload };
      if (msg.type === 'show-node' && msg.payload) {
        setPayload(msg.payload);
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  if (!payload) {
    return (
      <div style={{ padding: 16, color: 'var(--vscode-descriptionForeground)', fontSize: 12, textAlign: 'center' }}>
        Click a node in the flow editor to view its details.
      </div>
    );
  }

  if (payload.nodeType === 'approval') { return <ApprovalForm payload={payload} />; }
  if (payload.nodeType === 'process')  { return <ProcessForm  payload={payload} />; }
  if (payload.nodeType === 'call')     { return <CallForm     payload={payload} />; }
  if (payload.nodeType === 'jump')     { return <JumpForm     payload={payload} />; }
  if (payload.nodeType === 'methodCall'
   || payload.nodeType === 'httpCall')   { return <MethodCallForm payload={payload} />; }
  return <GenericNodeForm payload={payload} />;
}

const labelStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  color: 'var(--vscode-descriptionForeground)',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  marginBottom: 2,
};

const metaLineStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '72px 1fr',
  gap: 8,
  alignItems: 'start',
  fontSize: 11,
  color: 'var(--vscode-descriptionForeground)',
};

const emptyStyle: React.CSSProperties = {
  fontSize: 11,
  color: 'var(--vscode-descriptionForeground)',
  fontStyle: 'italic',
};

const fieldNameStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 1,
  fontSize: 11,
  fontWeight: 700,
  color: 'var(--vscode-foreground)',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
};

const codeAreaStyle: React.CSSProperties = {
  fontFamily: 'var(--vscode-editor-font-family, monospace)',
  fontSize: 'var(--vscode-editor-font-size, 12px)',
  width: '100%',
};



