# Node Capability Schema

This project can describe AI behavior for React Flow nodes with a central YAML registry.

## Top Level

- `version`: Registry format version. Start with `1`.
- `registry`: Human-readable registry ID.
- `scope`: Paths that tell the agent where node code lives.
- `defaults`: Shared layout and rotation assumptions.
- `nodes`: List of node capability records.

## Node Record

Required fields:

- `nodeType`: React Flow type key from `nodeTypes` in `webview-src/App.tsx`.
- `component`: Component export from `webview-src/nodes/index.ts`.
- `file`: Component source path.
- `category`: One of `control-flow`, `integration`, `transform`, `ui`, `debug`, or a project-specific category.
- `purpose`: One sentence describing the node.
- `handles`: Connection contract.
- `capabilities`: AI actions available for this node.

Optional fields:

- `aliases`: Additional React Flow type keys mapped to the same component.
- `label`: Default UI label.
- `runtime`: Runtime/debug behavior hints.

## Handles

Each handle should include:

- `id`: React Flow handle ID.
- `position`: `top`, `right`, `bottom`, or `left`.
- `semantic`: Meaning such as `in`, `next`, `yes`, `no`, `error`, `success`, `loop`, or `centerInput`.
- `rotatesWithConnection`: Whether connection direction can rotate this handle.

## Capabilities

Each capability should include:

- `id`: Stable kebab-case ID.
- `kind`: `generate`, `suggest`, `transform`, `validate`, `explain`, or `debug`.
- `title`: Short UI label.
- `prompt`: Short instruction the AI can execute.
- `inputs`: Context keys the capability expects.
- `outputs`: Structured fields the capability returns.

## Suggested Runtime Path

1. Keep YAML in `.github/skills/node-ai-capability-register/assets/node-capabilities.example.yml` while designing.
2. When ready for app runtime, copy or move the registry to a runtime-safe path such as `resources/node-capabilities.yml` or `webview-src/nodeCapabilities/node-capabilities.yml`.
3. Add a typed loader that validates `version`, `nodes[].nodeType`, and `capabilities[].id` before exposing capabilities in the webview.
4. Keep the skill folder as the AI-authoring guide even after runtime loading exists.
