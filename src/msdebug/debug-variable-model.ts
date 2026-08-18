export interface RawDebugVariable {
  name: string;
  value: string;
  type: string;
  variablesReference?: number;
  namedVariables?: number;
  indexedVariables?: number;
}

export interface DebugVariableNode {
  name: string;
  value: string;
  type: string;
  children: DebugVariableNode[];
  variablesReference?: number;
  namedVariables?: number;
  indexedVariables?: number;
  objectId?: string;
  lazy?: boolean;
}

export function buildVariableNodes(variables: RawDebugVariable[]): DebugVariableNode[] {
  return variables.map((variable) => {
    const isExpandable = variable.variablesReference && variable.variablesReference > 0;
    
    // For expandable objects, create lazy node immediately.
    // This applies to BOTH top-level variables from breakpoint hits AND
    // lazy-loaded children from getVariables responses — the server returns
    // raw { name, value, type, variablesReference } objects without lazy/children,
    // so we must always set lazy: true here for proper tree expansion.
    if (isExpandable) {
      return {
        name: variable.name,
        value: variable.value,
        type: variable.type,
        children: [],
        variablesReference: variable.variablesReference,
        namedVariables: variable.namedVariables,
        indexedVariables: variable.indexedVariables,
        lazy: true,
      };
    }
    
    const parsed = parseVariableValue(variable.value);
    return toVariableNode(variable.name, parsed, variable.type, variable.value);
  });
}

function toVariableNode(name: string, parsed: unknown, declaredType = '', originalValue?: string): DebugVariableNode {
  if (Array.isArray(parsed)) {
    return {
      name,
      value: `Array(${parsed.length})`,
      type: declaredType || 'array',
      children: parsed.map((item, index) => toVariableNode(String(index), parseVariableValue(item), inferType(item), stringifyPrimitive(item))),
    };
  }

  if (isPlainObject(parsed)) {
    const entries = Object.entries(parsed);
    return {
      name,
      value: `Object(${entries.length})`,
      type: declaredType || 'object',
      children: entries.map(([key, value]) => toVariableNode(key, parseVariableValue(value), inferType(value), stringifyPrimitive(value))),
    };
  }

  return {
    name,
    value: originalValue ?? stringifyPrimitive(parsed),
    type: declaredType || inferType(parsed),
    children: [],
  };
}

function parseVariableValue(value: unknown): unknown {
  if (typeof value !== 'string') return value;

  const trimmed = value.trim();
  if (!trimmed) return value;

  const first = trimmed[0];
  if (first !== '{' && first !== '[') return value;

  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
  }
}

function inferType(value: unknown): string {
  if (Array.isArray(value)) return 'array';
  if (value === null) return 'null';
  return typeof value;
}

function stringifyPrimitive(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value === undefined) return 'undefined';
  if (value === null) return 'null';
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') return String(value);
  return '';
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
