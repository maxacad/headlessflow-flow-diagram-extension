# FLOW DSL Specification (XML-Independent)

This DSL models flow behavior independently from XML structure. It can later be transpiled to Intershop DPipeline XML or any other runtime format.

## Core Model

- `flow`: top-level definition
- `entry`: named start point with input contract
- `step`: executable unit (`call`, `pipelet`, `decision`, `loop`, `join`, `jump`, `end`)
- `link`: directed transition with connector semantics
- `outputs`: return contract per terminal step

## Syntax

```yaml
flow: <FlowName>
kind: process | view

entries:
  - id: <entry-id>
    name: <entry-name>
    mode: private | public
    strict: true | false
    inputs:
      - key: <InputKey>
        type: <TypeName>
        required: true | false

steps:
  - id: <step-id>
    type: call | pipelet | decision | loop | join | jump | end
    ref: <start-name-ref-or-pipelet-name> # for call/pipelet/jump
    condition: <condition-key>            # for decision
    config: {}                            # for pipelet
    bindings: {}                          # dictionary mappings
    strict: true | false                  # for end
    outputs:                              # for end
      - key: <OutputKey>
        type: <TypeName>
        guaranteed: true | false

links:
  - from: <step-or-entry-id>
    via: next | yes | no | error | do | <custom>
    to: <step-id>
    into: in | in1 | in2 | in3 | loop | <custom>
```

## Connector Semantics

- `next -> in`: default sequential route.
- `yes/no -> in1/in2`: decision branch mapping.
- `do -> loop`: loop-body transition.
- `error -> in`: error branch to terminal or jump handler.
- custom connectors are allowed for domain-specific states.

## Design Rules

1. IDs must be unique across entries and steps.
2. Every entry must eventually reach an `end` or `jump` target.
3. `decision` should have at least two outgoing links.
4. `loop` should have one body route and one exit route.
5. Output keys should only be declared on `end` steps.

## Validation Checklist

- No dangling links.
- No unreachable terminal nodes.
- Inputs are declared where consumed.
- Branch names are deterministic and readable.
