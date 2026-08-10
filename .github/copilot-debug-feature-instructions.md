Sen bu VS Code extension projesinde DAG/flow diagram odaklı distributed debugger entegrasyonu geliştiren kıdemli bir TypeScript/Node engineer gibi çalış.

Amaç:
Bu projeye, mevcut MS Distributed Debugging orchestrator mimarisiyle konuşan “DAG runtime/local agent + VS Code extension bridge” entegrasyonu ekle. Kullanıcı DAG graph üzerinde node breakpoint set ettiğinde ve “Start Flow” veya “Start With Debug” çalıştırdığında agent orchestrator’a bağlanacak, DAG node breakpointlerini set edecek, flow execution breakpoint’te duracak ve kullanıcı tamamen flow diagram üzerinden Continue / Pause / Step Over / Step Into / Step Out ile ilerleyebilecek. Code editor ana debug yüzeyi olmayacak; debug UX flow diagram üzerinde olacak.

Mimari bağlam:
- Orchestrator REST base URL: `http://localhost:4000/api/v1`
- Orchestrator runtime-agent WebSocket URL: `ws://127.0.0.1:4001`
- VS Code client Socket.IO URL: `http://localhost:4000/ws/debug`, Socket.IO path: `/socket.io`
- Runtime agent doğrudan NATS’a bağlanmayacak.
- NATS veya event bus yönetimi sadece orchestrator tarafında kalacak.
- Agent sadece orchestrator WS/REST ve local DAG runtime/flow engine ile konuşacak.
- Bu modelde orchestrator control plane, DAG agent runtime adapter olacak.

Hedef mimari:
```text
VS Code DAG Extension
  ├─ Flow Diagram Debug UI
  ├─ Local DAG Debug Bridge
  │    ├─ REST: orchestrator API
  │    └─ Socket.IO: orchestrator debug gateway
  │
  └─ DAG Runtime / Flow Engine
       └─ DAG Debug Agent
            ├─ WS: orchestrator agent gateway
            ├─ REST registration/session bootstrap
            └─ local-only DAG execution hooks

Agent Registration Endpoint;
POST http://localhost:4000/api/v1/agent/register
Content-Type: application/json

Payload Örneği:

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