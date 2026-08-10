# DAG Flow Debugger Orchestration Instruction

Bu instruction, DAG/flow diagram tabanli bir VS Code extension projesine MS Distributed Debugging orchestrator ile entegre calisan bir debug agent eklemek icin kullanilir.

## Rol

Sen bu projede DAG/flow diagram odakli distributed debugger entegrasyonu gelistiren kidemli bir TypeScript/Node.js engineer gibi calis.

Kod yazarken mevcut projenin mimarisini, state management yapisini, command registration modelini ve diagram rendering patternlerini once incele. Yeni yapilari mevcut stile uygun, minimal ve test edilebilir sekilde ekle.

## Ana Hedef

DAG graph uzerinden breakpoint set edilebilen ve flow execution diagram uzerinde debug edilebilen bir sistem kur.

Kullanici:

- DAG node uzerinden breakpoint koyabilmeli.
- `Start Flow` ile normal flow calistirabilmeli.
- `Start With Debug` ile debug session baslatabilmeli.
- Flow breakpoint olan node'a gelince durmali.
- Continue, Pause, Step Over, Step Into, Step Out, Stop, Restart kontrollerini diagram toolbar uzerinden kullanabilmeli.
- Variables, node input/output payloadlari ve execution path'i code editor yerine flow diagram uzerinden inceleyebilmeli.

Code editor ana debug yuzeyi olmayacak. Debug deneyimi tamamen flow diagram uzerinde olacak.

## Mimari Kurallar

Runtime agent dogrudan NATS'a baglanmayacak.

Agent sadece sunlarla konusacak:

- Orchestrator REST API
- Orchestrator runtime-agent WebSocket
- Local DAG runtime / flow engine hooks

NATS ve event bus yonetimi sadece orchestrator tarafinda kalacak.

DAG agent, runtime adapter olarak davranacak. Orchestrator control plane olacak.

```text
VS Code DAG Extension
  |- Flow Diagram Debug UI
  |- Local DAG Debug Bridge
  |    |- REST: orchestrator API
  |    `- Socket.IO: orchestrator debug gateway
  |
  `- DAG Runtime / Flow Engine
       `- DAG Debug Agent
            |- WS: orchestrator agent gateway
            |- REST registration/session bootstrap
            `- local-only DAG execution hooks
```

## Baglanti Bilgileri

Varsayilan orchestrator REST base URL:

```text
http://localhost:4000/api/v1
```

Runtime agent WebSocket URL:

```text
ws://127.0.0.1:4001
```

VS Code client Socket.IO URL:

```text
http://localhost:4000/ws/debug
```

Socket.IO path:

```text
/socket.io
```

Local DAG agent URL:

```text
http://127.0.0.1:9240/api/v1
```

## VS Code Settings

Extension ayarlari ekle:

```json
{
  "dagDebug.defaultService": "dag-flow-service",
  "dagDebug.orchestratorUrl": "http://localhost:4000/api/v1",
  "dagDebug.orchestratorWsUrl": "http://localhost:4000",
  "dagDebug.localAgentUrl": "http://127.0.0.1:9240/api/v1"
}
```

Coklu VS Code pencerelerinde state karismamasi icin tum session, breakpoint ve event islemlerini `service`, `runtime`, `sessionId`, `flowId` ile filtrele.

## Runtime Agent Config

Local DAG agent su env degerlerini desteklemeli:

```bash
SERVICE_NAME=dag-flow-service
DAG_AGENT_PORT=9240
ORCHESTRATOR_URL=http://127.0.0.1:4000/api/v1
AGENT_WS_URL=ws://127.0.0.1:4001
```

## Agent Registration

DAG agent basladiginda orchestrator'a register olmali.

Endpoint:

```http
POST http://localhost:4000/api/v1/agent/register
Content-Type: application/json
```

Payload:

```json
{
  "service": "dag-flow-service",
  "runtime": "dag",
  "runtimeVersion": "1.0.0",
  "agentUrl": "http://127.0.0.1:9240/api/v1",
  "capabilities": [
    "breakpoints",
    "node-breakpoints",
    "continue",
    "pause",
    "step-over",
    "step-into",
    "step-out",
    "variables",
    "flow-state"
  ],
  "metadata": {
    "workspace": "dag-project",
    "debugModel": "flow-diagram"
  }
}
```

Register basarili olduktan sonra agent `AGENT_WS_URL` uzerinden runtime-agent WebSocket'e baglanmali.

Reconnect durumunda agent tekrar register olmali ve aktif breakpoint/session state'ini restore etmeli.

## Local Agent Endpoints

Local DAG agent su endpointleri acmali.

Health:

```http
GET http://127.0.0.1:9240/api/v1/health
```

Response:

```json
{
  "ok": true,
  "service": "dag-flow-service",
  "runtime": "dag",
  "orchestratorConnected": true,
  "activeSessionId": "dbg-123",
  "activeFlowId": "flow-order-processing",
  "breakpoints": 3
}
```

Command endpoint:

```http
POST http://127.0.0.1:9240/api/v1/agent/command
Content-Type: application/json
```

Command tipleri:

```ts
type DagAgentCommand =
  | {
      type: 'SET_BREAKPOINT';
      sessionId: string;
      breakpointId?: string;
      flowId: string;
      nodeId: string;
      condition?: string;
    }
  | {
      type: 'REMOVE_BREAKPOINT';
      sessionId: string;
      breakpointId?: string;
      flowId?: string;
      nodeId?: string;
    }
  | {
      type: 'CONTINUE';
      sessionId: string;
      threadId?: string;
    }
  | {
      type: 'PAUSE';
      sessionId: string;
      threadId?: string;
    }
  | {
      type: 'STEP_OVER';
      sessionId: string;
      threadId?: string;
    }
  | {
      type: 'STEP_INTO';
      sessionId: string;
      threadId?: string;
    }
  | {
      type: 'STEP_OUT';
      sessionId: string;
      threadId?: string;
    }
  | {
      type: 'GET_VARIABLES';
      sessionId: string;
      nodeId?: string;
      frameId?: string;
    }
  | {
      type: 'EVALUATE';
      sessionId: string;
      nodeId?: string;
      expression: string;
    };
```

## Runtime Event WebSocket

Agent runtime eventlerini orchestrator runtime-agent WS'e su formatta gondermeli:

```json
{
  "type": "agent:event",
  "envelope": {
    "subject": "debug.session.dbg-123.dag.breakpoint.hit",
    "type": "BREAKPOINT_HIT",
    "sessionId": "dbg-123",
    "service": "dag-flow-service",
    "runtime": "dag",
    "timestamp": 1770000000000,
    "data": {}
  }
}
```

Event subject onerileri:

```text
debug.session.<sessionId>.dag.flow.started
debug.session.<sessionId>.dag.flow.completed
debug.session.<sessionId>.dag.flow.failed
debug.session.<sessionId>.dag.node.started
debug.session.<sessionId>.dag.node.completed
debug.session.<sessionId>.dag.node.failed
debug.session.<sessionId>.dag.breakpoint.hit
debug.session.<sessionId>.dag.paused
debug.session.<sessionId>.dag.resumed
debug.session.<sessionId>.dag.variables
debug.session.<sessionId>.dag.step
```

Breakpoint hit event payload:

```json
{
  "type": "BREAKPOINT_HIT",
  "sessionId": "dbg-123",
  "service": "dag-flow-service",
  "runtime": "dag",
  "flowId": "flow-order-processing",
  "nodeId": "validate-order",
  "nodeLabel": "Validate Order",
  "threadId": "flow-run-789",
  "timestamp": 1770000000000,
  "data": {
    "flowRunId": "flow-run-789",
    "currentNodeId": "validate-order",
    "previousNodeIds": ["load-order"],
    "nextNodeIds": ["reserve-stock", "reject-order"],
    "variables": [
      {
        "name": "orderId",
        "value": "ORD-123",
        "type": "string"
      },
      {
        "name": "payload",
        "value": "{\"amount\":120}",
        "type": "object",
        "variablesReference": "payload-ref-1"
      }
    ],
    "stackFrames": [
      {
        "id": "frame-validate-order",
        "name": "Validate Order",
        "nodeId": "validate-order",
        "flowId": "flow-order-processing"
      }
    ]
  }
}
```

## VS Code Socket.IO Bridge

Extension orchestrator debug gateway'e Socket.IO ile baglanmali.

```ts
import { io, Socket } from 'socket.io-client';

const socket = io('http://localhost:4000/ws/debug', {
  path: '/socket.io',
  transports: ['websocket', 'polling'],
  forceNew: true,
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 1000,
  timeout: 5000,
});

socket.on('connect', () => {
  output.appendLine(`[dag-debug] connected ${socket.id}`);
});

socket.on('connect_error', (err) => {
  output.appendLine(`[dag-debug] connect_error ${err.message}`);
});

socket.on('debug:event', (event) => {
  if (event.runtime !== 'dag') return;
  if (event.service !== configuredService) return;
  handleDagDebugEvent(event);
});
```

## Orchestrator REST Client

Extension tarafinda bir REST client olustur.

```ts
class OrchestratorClient {
  constructor(private readonly baseUrl: string) {}

  async registerOrGetSession(service: string, flowId: string): Promise<DebugSessionDto>;
  async listSessions(service?: string): Promise<DebugSessionDto[]>;
  async listAgents(): Promise<AgentDto[]>;
  async getAgent(service: string): Promise<AgentDto | null>;

  async setDagBreakpoint(input: {
    sessionId: string;
    service: string;
    flowId: string;
    nodeId: string;
    condition?: string;
  }): Promise<BreakpointDto>;

  async removeBreakpoint(input: {
    sessionId: string;
    breakpointId?: string;
    service: string;
    flowId?: string;
    nodeId?: string;
  }): Promise<void>;

  async sendCommand(input: {
    sessionId: string;
    service: string;
    type: 'CONTINUE' | 'PAUSE' | 'STEP_OVER' | 'STEP_INTO' | 'STEP_OUT' | 'GET_VARIABLES' | 'EVALUATE';
    payload?: Record<string, unknown>;
  }): Promise<unknown>;
}
```

## DAG Breakpoint Model

DAG breakpoint identity file/line olmayacak. Identity `flowId + nodeId` olacak.

```ts
type DagBreakpoint = {
  id?: string;
  sessionId: string;
  service: string;
  runtime: 'dag';
  flowId: string;
  nodeId: string;
  nodeLabel?: string;
  condition?: string;
  enabled: boolean;
};
```

Local map:

```ts
const breakpointIdsByNode = new Map<string, string>();

function breakpointKey(flowId: string, nodeId: string): string {
  return `${flowId}:${nodeId}`;
}
```

SET_BREAKPOINT idempotent olmali. Ayni `flowId + nodeId` tekrar set edilirse duplicate yaratma.

REMOVE_BREAKPOINT hem `breakpointId` hem de `flowId + nodeId` ile calismali.

## Breakpoint Set Akisi

```text
User clicks breakpoint marker on DAG node
  -> extension creates DagBreakpoint
  -> ensure session exists for service + flowId
  -> POST orchestrator breakpoint create with runtime='dag'
  -> orchestrator routes SET_BREAKPOINT to DAG agent
  -> DAG agent stores node breakpoint in local map
  -> diagram node renders verified breakpoint
```

## Start Flow Akisi

```text
User clicks Start Flow
  -> normal flow execution starts
  -> agent may be connected but does not pause unless breakpoints are hit
  -> node events stream to orchestrator
  -> diagram highlights running/completed/failed nodes
```

## Start With Debug Akisi

```text
User clicks Start With Debug
  -> extension ensures local DAG agent is running or reachable
  -> extension ensures orchestrator session exists
  -> extension syncs all diagram breakpoints to orchestrator
  -> extension sends start-debug command to local DAG runtime/agent
  -> agent starts flow execution in debug mode
  -> before each node execution, agent checks breakpoint map
  -> if current node has breakpoint, agent pauses and emits BREAKPOINT_HIT
  -> extension receives debug:event and marks node as paused
  -> user controls execution from diagram toolbar
```

## DAG Execution Hook

Flow engine'de her node calismadan once debug boundary hook'u olmali.

```ts
async function beforeNodeExecute(ctx: DagExecutionContext): Promise<void> {
  await debugAgent.onBeforeNodeExecute({
    sessionId: ctx.sessionId,
    flowId: ctx.flowId,
    flowRunId: ctx.flowRunId,
    nodeId: ctx.nodeId,
    nodeLabel: ctx.nodeLabel,
    input: ctx.input,
    variables: ctx.variables,
  });
}
```

## Agent Pause Controller

```ts
class DagDebugController {
  private readonly breakpoints = new Map<string, DagBreakpoint>();
  private paused:
    | {
        sessionId: string;
        flowId: string;
        flowRunId: string;
        nodeId: string;
        resume: () => void;
      }
    | undefined;

  async onBeforeNodeExecute(ctx: DagNodeContext): Promise<void> {
    const key = `${ctx.flowId}:${ctx.nodeId}`;
    const bp = this.breakpoints.get(key);

    if (!bp?.enabled) {
      this.emitNodeStarted(ctx);
      return;
    }

    await this.pauseAtBreakpoint(ctx);

    await new Promise<void>((resolve) => {
      this.paused = {
        sessionId: ctx.sessionId,
        flowId: ctx.flowId,
        flowRunId: ctx.flowRunId,
        nodeId: ctx.nodeId,
        resume: resolve,
      };
    });
  }

  continue(sessionId: string): void {
    if (this.paused?.sessionId !== sessionId) return;
    const resume = this.paused.resume;
    this.paused = undefined;
    resume();
  }
}
```

## Step Semantics

DAG diagram line-based degildir. Step davranislari graph/node boundary semantigiyle tanimlanmali.

- Continue: bir sonraki breakpoint'e kadar calis.
- Pause: mumkun olan en yakin node boundary'de dur.
- Step Over: mevcut node tamamlandiktan sonra ayni flow level'daki sonraki node boundary'de dur.
- Step Into: subflow/composite node ise ic flow'un ilk node'unda dur; degilse Step Over gibi davran.
- Step Out: subflow icindeyse parent flow'daki sonraki node boundary'ye kadar calis.
- Restart Flow: ayni input ile flow run'i bastan baslat.
- Stop: flow run'i iptal et veya debug session detach et.

## Diagram UX Gereksinimleri

- Node uzerinde breakpoint marker olmali.
- Current paused node belirgin vurgulanmali.
- Running node, completed node, failed node ayri state ile gosterilmeli.
- Debug toolbar diagram uzerinde olmali:
  - Continue
  - Pause
  - Step Over
  - Step Into
  - Step Out
  - Stop
  - Restart
- Variables panel node secimine gore degismeli.
- Node input/output payloadlari debug sirasinda inspect edilebilmeli.
- Execution path graph uzerinde cizilmeli.
- Breakpoint hit oldugunda code editor acma. Sadece diagram node'una focus/center yap.

## Orchestrator Runtime Desteği

Eger mevcut orchestrator `runtime = "dag"` ve `flowId/nodeId` desteklemiyorsa orchestrator tarafinda su degisiklikleri yap:

- Runtime validation `java`, `nodejs`, `python` yaninda `dag` kabul etmeli.
- Breakpoint modeline DAG metadata destegi ekle: `flowId`, `nodeId`, `nodeLabel`.
- DAG breakpointleri file/line zorunluluguna bagli olmamali.
- DAG breakpoint identity `service + sessionId + flowId + nodeId` olmali.
- Agent command routing `SET_BREAKPOINT` payloadinda `flowId/nodeId` gondermeli.
- `REMOVE_BREAKPOINT` hem `breakpointId` hem `flowId/nodeId` ile calismali.
- Session service DAG runtime agent registration ile session acabılmeli.
- Debug gateway `debug:event` payloadlarini bozmadan Socket.IO clientlara yayinlamali.
- Eski Java/Node davranisini bozma.
- Migration gerekiyorsa TypeORM migration ekle.

## Uygulama Adimlari

1. Projedeki mevcut DAG modelini incele:
   - Flow/DAG schema nerede?
   - Node id nasil tutuluyor?
   - Start Flow komutu nerede?
   - Diagram component state management nerede?
   - VS Code extension activation ve command registration nerede?
2. `DagDebugAgent` veya `LocalDagDebugAgent` modulunu olustur.
3. Agent local HTTP server ekle:
   - `/api/v1/health`
   - `/api/v1/agent/command`
4. Orchestrator REST registration client ekle.
5. Orchestrator runtime-agent WS client ekle.
6. Flow engine node execution hooklarina debug boundary ekle.
7. Diagram breakpoint state modelini ekle.
8. `Start With Debug` command ekle.
9. Orchestrator'a DAG breakpoint create/remove/sync clientleri ekle.
10. Socket.IO debug event bridge ekle.
11. Diagram toolbar debug controls ekle.
12. Variables/input/output panelini event payloadlarindan besle.
13. Multi-window service izolasyonu icin settings ekle.
14. Build/test/package dogrula.

## Kodlama Kurallari

- TypeScript strict uyumlu yaz.
- Existing project patternlerini takip et.
- Runtime `dag` olarak gonderilmeli.
- Her eventte `sessionId`, `service`, `runtime`, `flowId`, mumkunse `flowRunId`, `nodeId` bulunmali.
- Extension sadece kendi `service/runtime/session` eventlerini islemeli.
- Local agent reconnect durumunda register ve state restore yapmali.
- Extension activation'da mevcut diagram breakpointlerini session'a sync etmeli.
- `socket.io-client` extension runtime dependency ise paketleme icin bundle kullan veya dependency'nin VSIX'e girdigini dogrula.
- VS Code extension package icin gerekirse `esbuild` bundle script ekle.
- `vscode` modulunu bundle external birak.
- Local agent Node.js server icin `fastify` veya projedeki mevcut HTTP framework'u kullan.
- WebSocket client icin `ws` kullan.
- Logging icin VS Code output channel ve agent tarafinda structured logger kullan.
- Hatalari output channel'a yaz; kullaniciya sadece aksiyon gerektiren durumlarda notification goster.

## Beklenen Sonuc

- Kullanici DAG node'una breakpoint koyabilir.
- `Start Flow` normal calisir ve execution state diagram uzerinde gorunur.
- `Start With Debug` agent baglantisini kurar, session acar, breakpointleri sync eder.
- Flow breakpoint node'una gelince durur.
- Continue/Step/Pause/Stop diagram toolbar'dan calisir.
- Variables/input/output diagram UI'da gorunur.
- Code editor acilmadan flow diagram uzerinde debug yapilir.
- Orchestrator gateway uzerinden gelen eventler `service/runtime/session` filtrelenerek islenir.
- Packaged extension F5 gelistirme moduyla ayni sekilde orchestrator'a baglanir.
