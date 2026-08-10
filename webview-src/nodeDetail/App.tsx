import React, { useCallback, useEffect, useState } from 'react';
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

interface NodePayload {
  id: string;
  nodeType: string;
  data: Record<string, unknown>;
  webformFiles?: WebformFileEntry[];
  pipeletFiles?: PipeletFileEntry[];
}

interface GenericFields {
  label: string;
  subtitle: string;
  status: string;
  script: string;
  condition: string;
  expression: string;
  target: string;
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
  call:     '// Call node\nreturn await invoke("service", input);',
};

const TYPE_LABELS: Record<string, string> = {
  custom: 'Custom', fn: 'Function', decision: 'Decision', script: 'Script',
  stop: 'Stop', end: 'End', view: 'View', loop: 'Loop',
  call: 'Call', join: 'Join', start: 'Start',
  input: 'Input', process: 'Process', output: 'Output',
  approval: 'Approval',
};

const TYPE_COLORS: Record<string, string> = {
  start: '#43a047', fn: '#1565c0', decision: '#e65100', script: '#6a1b9a',
  stop: '#c62828', end: '#4a148c', view: '#00695c', loop: '#283593',
  call: '#006064', join: '#37474f', input: '#2e7d32', process: '#1565c0',
  output: '#ef6c00', custom: '#555', approval: '#7c3aed',
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
  const { data, webformFiles = [] } = payload;

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
  const { data, pipeletFiles = [] } = payload;
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

// ── Node-Type-Aware Generic Form ──────────────────────────────────────────────
const NODE_FIELD_CONFIG: Record<string, { subtitle: string; fields: Array<keyof GenericFields>; scriptLabel?: string }> = {
  start:    { subtitle: 'Flow Entry', fields: ['label', 'subtitle', 'status'] },
  end:      { subtitle: 'Flow Completion', fields: ['label', 'subtitle', 'status'] },
  stop:     { subtitle: 'Execution Stop', fields: ['label', 'subtitle', 'status'] },
  join:     { subtitle: 'Merge Branches', fields: ['label', 'subtitle', 'status'] },
  jump:     { subtitle: 'Jump Target', fields: ['label', 'subtitle', 'target', 'status'] },
  view:     { subtitle: 'View Render', fields: ['label', 'subtitle', 'expression', 'status'] },
  call:     { subtitle: 'Pipeline Call', fields: ['label', 'subtitle', 'target', 'expression', 'status'] },
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
    target: toStr(data.target) || toStr(data.jumpTargetId),
  });

  useEffect(() => {
    setFields({
      label: toStr(data.label),
      subtitle: toStr(data.subtitle),
      status: toStr(data.status) || 'idle',
      script: toStr(data.script) || DEFAULT_SCRIPTS[nodeType] || `// ${nodeType} node\n`,
      condition: toStr(data.condition),
      expression: toStr(data.expression),
      target: toStr(data.target) || toStr(data.jumpTargetId),
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
    const labels: Record<string, string> = { condition: 'Condition', expression: 'Expression', target: 'Target' };
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
  if (payload.nodeType === 'process') { return <ProcessForm payload={payload} />; }
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



