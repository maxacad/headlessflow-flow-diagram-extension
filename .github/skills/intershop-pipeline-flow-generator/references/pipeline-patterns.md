# Pipeline Patterns From .github/clean

This reference captures high-frequency conventions observed in `.github/clean` pipeline XML files.

## High-Frequency Node Types

- `DPipeletNode`
- `DCallNode`
- `DJoinNode`
- `DStartNode`
- `DDecisionNode`
- `DEndNode`
- `DJumpNode`
- `DLoopNode`

## High-Frequency Connectors

From connectors:
- `next` (dominant default)
- `error`
- `yes`
- `no`
- `do`

To connectors:
- `in` (dominant default)
- `in1`, `in2`, `in3`
- `loop`

## Pattern A: Minimal View Dispatch

Observed in files like `ViewPageletPropertiesAssignCampaign.xml`.

- `DStartNode(name=Dispatch)`
- `DJumpNode(startNameRef=Error-Start)`
- transition: `StartNode -> JumpNode` with `next -> in`

Use when flow only delegates to shared error/view handling.

## Pattern B: Multi-Start Process Wrapper

Observed in files like `ProcessCacheClear.xml`.

- Multiple `DStartNode` entries, each modeling a callable operation.
- Each start routes to a `DCallNode`.
- Each call terminates in a dedicated `DEndNode`.

Use when one pipeline groups related callable operations.

## Pattern C: Decision + Join

Observed widely in process/view files.

- `DDecisionNode(conditionKey=...)`
- branches via `yes/no` or custom strings
- optional `DJoinNode` for merge
- continue via `next`

Use for conditional routing and branch convergence.

## Pattern D: Loop Processing

Observed with `DLoopNode` and connectors `do -> loop`.

- Enter loop body from `do` to `loop`
- exit path to `in` on downstream node

Use when iterating collections.

## Node Content Guidelines

`DPipeletNode`:
- include `pipeletName`
- include `pipeletSetIdentifier/id` when known
- add `keyBindings` for dictionary aliasing
- add `configProperties` for behavior flags

`DCallNode`:
- include `startNameRef`
- optional `keyBindings`

`DStartNode`:
- include `name`, `strict`
- include `callMode` if private callable
- include `startParameters` when input contract exists

`DEndNode`:
- include `strict`
- include `name` for semantic exits like `Error`
- include `returnValues` when returning dictionary entries

## Naming Heuristics

- Pipeline: verb + domain object (`ProcessX`, `ViewY`).
- Node IDs: `StartNode1`, `CallNode1`, `DecisionNode1`, `EndNode1`.
- Transition IDs: `Transition1..N`.
- `startNameRef`: `<PipelineName>-<ActionName>` or shared pipeline start.

## Quality Gates

- Keep node IDs unique.
- Keep transition graph connected from each start to at least one end.
- Ensure connector semantics match node type.
- Keep `display` coordinates coherent for readability.
