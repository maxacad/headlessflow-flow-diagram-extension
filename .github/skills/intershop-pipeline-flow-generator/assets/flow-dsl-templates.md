# FLOW DSL Templates

These templates are XML-independent and derived from recurring patterns in `.github/clean`.

## 1) Linear Process Template

```yaml
flow: ProcessSomething
kind: process

entries:
  - id: start_main
    name: ProcessSomething
    mode: private
    strict: true
    inputs:
      - key: Input
        type: java.lang.String
        required: true

steps:
  - id: p_validate
    type: pipelet
    ref: ValidateInput
    config: {}
    bindings: {}

  - id: c_execute
    type: call
    ref: ProcessSomething-Execute
    bindings: {}

  - id: end_ok
    type: end
    strict: true
    outputs:
      - key: Result
        type: java.lang.String
        guaranteed: false

links:
  - from: start_main
    via: next
    to: p_validate
    into: in
  - from: p_validate
    via: next
    to: c_execute
    into: in
  - from: c_execute
    via: next
    to: end_ok
    into: in
```

## 2) Decision Branch Template

```yaml
flow: ProcessWithDecision
kind: process

entries:
  - id: start_main
    name: ProcessWithDecision
    mode: private
    strict: true
    inputs:
      - key: ConditionInput
        type: java.lang.String
        required: true

steps:
  - id: d_route
    type: decision
    condition: ConditionInput

  - id: c_yes
    type: call
    ref: ProcessWithDecision-YesPath

  - id: c_no
    type: call
    ref: ProcessWithDecision-NoPath

  - id: j_merge
    type: join

  - id: end_ok
    type: end
    strict: true

links:
  - from: start_main
    via: next
    to: d_route
    into: in
  - from: d_route
    via: yes
    to: c_yes
    into: in1
  - from: d_route
    via: no
    to: c_no
    into: in2
  - from: c_yes
    via: next
    to: j_merge
    into: in
  - from: c_no
    via: next
    to: j_merge
    into: in
  - from: j_merge
    via: next
    to: end_ok
    into: in
```

## 3) Loop Template

```yaml
flow: ProcessBatchItems
kind: process

entries:
  - id: start_batch
    name: ProcessBatchItems
    mode: private
    strict: true
    inputs:
      - key: Items
        type: java.util.Iterator
        required: true

steps:
  - id: l_iterate
    type: loop

  - id: c_handle_item
    type: call
    ref: ProcessBatchItems-HandleItem

  - id: end_done
    type: end
    strict: true

links:
  - from: start_batch
    via: next
    to: l_iterate
    into: in
  - from: l_iterate
    via: do
    to: c_handle_item
    into: loop
  - from: c_handle_item
    via: next
    to: l_iterate
    into: in
  - from: l_iterate
    via: no
    to: end_done
    into: in
```

## 4) Multi-Entry Wrapper Template

```yaml
flow: ProcessCacheLike
kind: process

entries:
  - id: start_a
    name: ActionA
    mode: private
    strict: true
    inputs: []

  - id: start_b
    name: ActionB
    mode: private
    strict: true
    inputs:
      - key: Objects
        type: java.util.Iterator
        required: true

steps:
  - id: c_a
    type: call
    ref: ProcessCacheLike-DoA

  - id: c_b
    type: call
    ref: ProcessCacheLike-DoB

  - id: end_a
    type: end
    strict: true

  - id: end_b
    type: end
    strict: true

links:
  - from: start_a
    via: next
    to: c_a
    into: in
  - from: c_a
    via: next
    to: end_a
    into: in
  - from: start_b
    via: next
    to: c_b
    into: in
  - from: c_b
    via: next
    to: end_b
    into: in
```

## 5) View Dispatch Template

```yaml
flow: ViewSomething
kind: view

entries:
  - id: start_dispatch
    name: Dispatch
    mode: public
    strict: false
    inputs: []

steps:
  - id: j_error
    type: jump
    ref: Error-Start

links:
  - from: start_dispatch
    via: next
    to: j_error
    into: in
```
