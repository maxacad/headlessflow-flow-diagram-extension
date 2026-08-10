---
name: node-ai-capability-register
description: 'Register and maintain AI skill capabilities for React Flow nodes in webview-src/nodes. Use when adding node capabilities, creating node metadata YAML, mapping node types to AI actions, or wiring AI-assisted node generation and execution behavior.'
argument-hint: '<node type or capability goal>'
user-invocable: true
---

# Node AI Capability Register

Use this skill to add, review, or update AI capability metadata for nodes under `webview-src/nodes`.

The project keeps capability metadata separate from React components. Prefer a central YAML registry first, then generate or update runtime code from that registry when the application needs it.

## When To Use

Use this skill when the task includes phrases like:
- node AI capability
- capability register
- node metadata YAML
- register node skill
- map node type to AI action
- add AI behavior to StartNode, CallNode, DecisionNode, FunctionNode, or other React Flow nodes

## Recommended Files

- Registry: [node capabilities example](./assets/node-capabilities.example.yml)
- New node template: [node capability template](./assets/node-capability.template.yml)
- Schema notes: [node capability schema](./references/node-capability-schema.md)

## Procedure

1. Identify the React Flow node type from `webview-src/App.tsx` `nodeTypes`.
2. Identify the component file from `webview-src/nodes/index.ts`.
3. Add or update the node entry in the capability registry YAML.
4. Keep the `nodeType` value equal to the React Flow node type, for example `start`, `decision`, `call`, or `methodCall`.
5. Describe AI capabilities as stable IDs, not UI text. Use kebab-case IDs such as `generate-start-contract` or `suggest-error-branch`.
6. Include connection semantics: inputs, outputs, error handles, rotation behavior, and whether the node can start a flow.
7. If runtime code is required, add a typed loader later. Do not hard-code capability metadata into each node component unless the user asks for component-local metadata.

## Registry Rules

- Keep YAML hand-editable.
- Use one central registry unless there is a strong reason to split per node.
- Keep the registry aligned with exported node components in `webview-src/nodes/index.ts`.
- Treat `nodeType` and `component` as required.
- Treat `capabilities[].id`, `capabilities[].kind`, and `capabilities[].prompt` as required.
- Keep prompts short and action-oriented.
- Do not store secrets, tokens, or environment-specific paths in capability YAML.

## Output Contract

When updating capabilities, report:
- Which node types changed.
- Which capability IDs were added or changed.
- Whether runtime code still needs to consume the registry.
