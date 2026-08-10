---
name: intershop-pipeline-flow-generator
description: 'Generate Intershop-style DPipeline XML flows from functional requirements. Use for process/view pipeline creation, node-transition design, connector mapping, key bindings, and start/end contract generation based on existing .github/clean patterns.'
argument-hint: '<flow name> | <type: process|view> | <business goal> | optional constraints'
user-invocable: true
---

# Intershop Pipeline Flow Generator

Generate either:
- XML pipelines compatible with Intershop-style schema, or
- XML-independent FLOW DSL definitions that can later be transpiled.

Use this skill when you need to:
- Create a new flow from a business requirement.
- Recreate a flow in the style of files under `.github/clean`.
- Design transitions/connectors (`next`, `yes`, `no`, `error`, `do`) consistently.
- Build `DStartNode` / `DEndNode` contracts with parameters and return values.
- Design platform-agnostic flow definitions first (DSL-first workflow).

## Output Modes

- `mode=xml`: produce Intershop-compatible XML.
- `mode=dsl`: produce YAML DSL using [flow dsl spec](./references/flow-dsl-spec.md).

If mode is not specified:
- Prefer `dsl` for architecture/design tasks.
- Prefer `xml` when user explicitly asks for `.xml` output.

## Inputs To Ask For

Before generating XML, gather:
1. Pipeline name and type (`process` or `view`).
2. Start names and their input parameters.
3. Main path steps (call/pipelet/decision/loop/jump/join).
4. Error behavior and named error connectors (if any).
5. Expected outputs/return values.

If details are missing, propose a default and mark assumptions in a short preface.

## Generation Rules

1. Root format:
   - `<?xml version="1.0" encoding="UTF-8" ?>`
   - `<DPipeline ... id="Pipeline1">`
   - `<name>...</name>` and `<type>process|view</type>`
2. Every node must have a unique `id` and a `<display>` block with `DPoint x/y`.
3. Use valid node taxonomy from repository patterns:
   - `DStartNode`, `DCallNode`, `DPipeletNode`, `DDecisionNode`, `DLoopNode`, `DJoinNode`, `DJumpNode`, `DEndNode`.
4. Transition conventions:
   - Default path: `<fromConnector>next</fromConnector>` to `<toConnector>in</toConnector>`.
   - Decision branches: `yes` / `no` to `in1` / `in2` (or equivalent explicit branch mapping).
   - Loop pattern: `do -> loop`, exit to `in`.
   - Error path: `error` (or domain-specific error connector string) to an error end/jump node.
5. `DPipeletNode` should include:
   - `<pipeletName>`
   - Optional `<configProperties>`
   - Optional `<keyBindings>`
   - `<pipeletSetIdentifier><id>...</id></pipeletSetIdentifier>` when relevant.
6. `DCallNode` should include `<startNameRef>` and optional `<keyBindings>`.
7. `DStartNode` should include:
   - `<name>`
   - Optional `<callMode>`
   - `<strict>true|false</strict>`
   - Optional `<startParameters>`
8. `DEndNode` should include `<strict>` and optional `<returnValues>`.
9. Each transition must reference existing node IDs.
10. Output only final XML unless user explicitly asks for explanation.

## Procedure

1. Pick closest pattern family from [pipeline patterns](./references/pipeline-patterns.md):
   - linear process
   - decision branch
   - loop
   - view dispatch to jump/error
2. Draft node list first.
3. Draft transitions second.
4. Validate with checklist below.
5. Return final XML and suggested filename `<PipelineName>.xml`.

## Validation Checklist

- All IDs unique.
- All `fromId` / `toId` exist.
- No orphan `DStartNode` or `DEndNode` unless intentional.
- Connector names consistent with node behavior.
- `type` is exactly `process` or `view`.
- XML is well-formed.

## Output Contract

- For `mode=xml`: one complete XML file body.
- For `mode=dsl`: one complete YAML DSL flow body.
- Optional (if asked): short rationale and extension points.

Use:
- [base template](./assets/pipeline-template.xml) for XML mode.
- [dsl templates](./assets/flow-dsl-templates.md) for DSL mode.
