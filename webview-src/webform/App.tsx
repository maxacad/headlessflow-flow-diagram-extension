import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ConfigProvider, Button, Alert, theme } from 'antd';
import enUS from 'antd/locale/en_US';
import FormRender, { useForm } from 'form-render';

// ── VS Code API ─────────────────────────────────────────────────────────────
type VsCodeApi = { postMessage: (message: unknown) => void };
declare function acquireVsCodeApi(): VsCodeApi;
const vscodeApi: VsCodeApi | undefined =
  typeof acquireVsCodeApi !== 'undefined' ? acquireVsCodeApi() : undefined;

// ── Types ────────────────────────────────────────────────────────────────────
type ViewMode = 'split' | 'json' | 'preview';

// ── JSON syntax highlighting (VS Code dark+ palette) ────────────────────────
function highlightJsonText(text: string): React.ReactNode {
  const tokens: React.ReactNode[] = [];
  const re = /("(?:\\u[a-fA-F0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(?:true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?|[{}[\],:])/g;
  let last = 0;
  let i = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    if (match.index > last) { tokens.push(text.slice(last, match.index)); }
    const token = match[0];
    let color = '#d4d4d4'; // punctuation / default
    if (token.startsWith('"')) {
      color = /"\s*:$/.test(token) ? '#9cdcfe' : '#ce9178'; // key : string
    } else if (token === 'true' || token === 'false' || token === 'null') {
      color = '#569cd6';
    } else if (/^-?\d/.test(token)) {
      color = '#b5cea8';
    }
    tokens.push(<span key={i++} style={{ color }}>{token}</span>);
    last = match.index + token.length;
  }
  if (last < text.length) { tokens.push(text.slice(last)); }
  return tokens;
}

function syntaxHighlight(obj: Record<string, unknown>): React.ReactNode {
  return highlightJsonText(JSON.stringify(obj, null, 2));
}

// ── Form Preview component ───────────────────────────────────────────────────
// Keyed on a stringified schema so it remounts when schema structure changes
function FormPreview({ schema }: { schema: Record<string, unknown> }) {
  const form = useForm();
  const [submitted, setSubmitted] = useState<Record<string, unknown> | null>(null);

  return (
    <div style={{ padding: '20px 24px', height: '100%', overflowY: 'auto', background: '#fff' }}>
      <FormRender
        form={form}
        schema={schema}
        locale="en-US"
        onFinish={(vals: Record<string, unknown>) => setSubmitted(vals)}
      />
      <div style={{ marginTop: 8, marginBottom: 16 }}>
        <Button type="primary" onClick={() => form.submit()}>Submit</Button>
      </div>
      {submitted && (
        <div style={{ marginTop: 4, borderRadius: 8, overflow: 'hidden', border: '1px solid #333' }}>
          {/* title bar */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '6px 14px',
            background: '#2d2d2d',
            borderBottom: '1px solid #3e3e3e',
          }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: '#9cdcfe', letterSpacing: '0.05em', fontFamily: 'monospace' }}>
              form-output.json
            </span>
            <Button
              size="small"
              type="text"
              style={{ color: '#888', fontSize: 11, height: 20, padding: '0 6px' }}
              onClick={() => navigator.clipboard?.writeText(JSON.stringify(submitted, null, 2))}
            >
              Copy
            </Button>
          </div>
          {/* code body */}
          <pre style={{
            margin: 0,
            padding: '14px 18px',
            background: '#1e1e1e',
            color: '#d4d4d4',
            fontFamily: '"Consolas", "Menlo", "Monaco", monospace',
            fontSize: 13,
            lineHeight: '1.65',
            overflowX: 'auto',
            whiteSpace: 'pre',
          }}>
            {syntaxHighlight(submitted)}
          </pre>
        </div>
      )}
    </div>
  );
}

// ── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [content, setContent] = useState('{}');
  const [mode, setMode] = useState<ViewMode>('split');
  const [schema, setSchema] = useState<Record<string, unknown> | null>(null);
  const [schemaKey, setSchemaKey] = useState(0);
  const [jsonError, setJsonError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const highlightRef = useRef<HTMLPreElement>(null);
  const pendingCursorRef = useRef<number | null>(null);

  // Restore cursor after Tab-key content change
  useEffect(() => {
    if (pendingCursorRef.current !== null && textareaRef.current) {
      textareaRef.current.setSelectionRange(pendingCursorRef.current, pendingCursorRef.current);
      pendingCursorRef.current = null;
    }
  });

  const syncScroll = () => {
    if (highlightRef.current && textareaRef.current) {
      highlightRef.current.scrollTop  = textareaRef.current.scrollTop;
      highlightRef.current.scrollLeft = textareaRef.current.scrollLeft;
    }
  };

  const handleTabKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== 'Tab') { return; }
    e.preventDefault();
    const ta = e.currentTarget;
    const start = ta.selectionStart;
    const end   = ta.selectionEnd;
    const next  = content.slice(0, start) + '  ' + content.slice(end);
    pendingCursorRef.current = start + 2;
    handleJsonChange(next);
  };

  const parseSchema = useCallback((text: string) => {
    try {
      const parsed = JSON.parse(text) as Record<string, unknown>;
      setSchema(parsed);
      setSchemaKey((k) => k + 1);
      setJsonError(null);
    } catch (e) {
      setJsonError((e as Error).message);
    }
  }, []);

  // Listen for messages from the extension
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const msg = event.data as { type: string; content?: string; mode?: string };
      if (msg?.type === 'update' && typeof msg.content === 'string') {
        setContent(msg.content);
        parseSchema(msg.content);
      }
      if (msg?.type === 'set-mode' && typeof msg.mode === 'string') {
        setMode(msg.mode as ViewMode);
      }
    };
    window.addEventListener('message', onMessage);
    vscodeApi?.postMessage({ type: 'ready' });
    return () => window.removeEventListener('message', onMessage);
  }, [parseSchema]);

  // Ctrl+S → save
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        vscodeApi?.postMessage({ type: 'save' });
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const handleJsonChange = (value: string) => {
    setContent(value);
    if (debounceRef.current) { clearTimeout(debounceRef.current); }
    debounceRef.current = setTimeout(() => {
      parseSchema(value);
      vscodeApi?.postMessage({ type: 'content-changed', content: value });
    }, 400);
  };

  const showJson    = mode === 'json'    || mode === 'split';
  const showPreview = mode === 'preview' || mode === 'split';

  return (
    <ConfigProvider theme={{ algorithm: theme.defaultAlgorithm }} locale={enUS}>
      <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#fff', fontFamily: 'var(--vscode-font-family, sans-serif)' }}>

        {/* ── JSON parse error banner (shown in preview/split when error exists) ── */}
        {jsonError && mode !== 'json' && (
          <Alert
            message={`JSON Error — ${jsonError}`}
            type="error"
            banner
            closable
            onClose={() => setJsonError(null)}
            style={{ flexShrink: 0 }}
          />
        )}

        {/* ── Content area ── */}
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>

          {/* JSON editor panel */}
          {showJson && (
            <div style={{
              flex: mode === 'split' ? '0 0 50%' : '1 1 auto',
              display: 'flex', flexDirection: 'column',
              borderRight: mode === 'split' ? '1px solid #e0e0e0' : undefined,
              overflow: 'hidden',
            }}>
              <div style={{ padding: '4px 12px', background: '#efefef', fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', color: '#777', flexShrink: 0 }}>
                JSON SCHEMA
              </div>
              {/* Overlay editor: highlighted <pre> behind transparent <textarea> */}
              <div style={{ flex: 1, position: 'relative', overflow: 'hidden', background: '#1e1e1e' }}>
                <pre
                  ref={highlightRef}
                  aria-hidden
                  style={{
                    position: 'absolute', inset: 0, margin: 0,
                    padding: '12px 14px',
                    fontFamily: '"Consolas", "Menlo", "Monaco", monospace',
                    fontSize: 13, lineHeight: '1.65',
                    background: 'transparent', color: '#d4d4d4',
                    whiteSpace: 'pre', overflow: 'hidden',
                    pointerEvents: 'none', tabSize: 2,
                  }}
                >
                  {highlightJsonText(content)}{/* trailing \n prevents scroll gap */}
                  {'\n'}
                </pre>
                <textarea
                  ref={textareaRef}
                  value={content}
                  onChange={(e) => handleJsonChange(e.target.value)}
                  onScroll={syncScroll}
                  onKeyDown={handleTabKey}
                  spellCheck={false}
                  style={{
                    position: 'absolute', inset: 0, margin: 0,
                    padding: '12px 14px',
                    fontFamily: '"Consolas", "Menlo", "Monaco", monospace',
                    fontSize: 13, lineHeight: '1.65',
                    background: 'transparent',
                    color: 'transparent',
                    caretColor: '#aeafad',
                    border: 'none', outline: 'none', resize: 'none',
                    overflow: 'auto', whiteSpace: 'pre', tabSize: 2,
                    zIndex: 1,
                  }}
                />
              </div>
              {jsonError && (
                <div style={{ padding: '4px 12px', background: '#5c1c1c', color: '#f99', fontSize: 11, flexShrink: 0 }}>
                  ⚠ {jsonError}
                </div>
              )}
            </div>
          )}

          {/* Form preview panel */}
          {showPreview && (
            <div style={{ flex: '1 1 auto', display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
              <div style={{ padding: '4px 12px', background: '#efefef', fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', color: '#777', flexShrink: 0 }}>
                FORM PREVIEW
              </div>
              <div style={{ flex: 1, overflowY: 'auto', background: '#fff' }}>
                {schema ? (
                  <FormPreview key={schemaKey} schema={schema} />
                ) : (
                  <div style={{ padding: 24, color: '#aaa', fontSize: 13 }}>
                    Enter a valid JSON schema on the left to preview the form.
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </ConfigProvider>
  );
}
