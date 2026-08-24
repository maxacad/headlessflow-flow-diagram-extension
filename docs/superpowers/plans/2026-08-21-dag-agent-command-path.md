# DAG Agent Komut Yolu ve Session Sahipliği — Uygulama Planı

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Orkestratörden inen debug komutlarının (Continue, Step Over/Into/Out) DAG flow engine'e gerçekten ulaşmasını sağlamak ve aynı agent için iki session oluşmasını kökten kaldırmak.

**Architecture:** Flow engine bir debug agent'ı gibi davranır: kendini doğru adreste kaydeder, komutu orkestratörden alır, olayı geri yayar. Komut üretmez ve session açmaz. Orkestratör, komutu HTTP mi NATS mı ile göndereceğini agent'ın kayıt biçiminden türetir.

**Tech Stack:** Node.js (CommonJS, express, ws) — flow engine · NestJS + jest — orkestratör · TypeScript + VS Code API — extension

**Spec:** `docs/superpowers/specs/2026-08-21-dag-agent-inspector-design.md`

**Durum: tamamlandı (2026-08-24).** Task 1-7 uygulandı, Task 8 kullanıcı
tarafından uçtan uca doğrulandı. Uygulama sırasındaki sapmalar ve sonradan
ortaya çıkan kusur en altta "Uygulama notları" başlığında.

**Kapsam notu:** Bu plan spec'in 1, 2 (komut yolu kısmı), 5, 5.1, 5.2 bölümlerini uygular. Inspector durum modeli (spec 3), satır↔node eşlemesi (spec 4), `setBreakpoints`/`scopes`/`variables`/`evaluate` yüzeyi, breakpoint sahipliğinin orkestratöre taşınması (spec 5, üçüncü madde) ve Debug görünümü odağı (spec 5.3) **ayrı bir plana** bırakılmıştır; bu plan tek başına çalışan yazılım üretir (Continue ve Step Over uçtan uca çalışır, tek session kalır).

## Global Constraints

- Flow engine CommonJS'tir (`"type": "commonjs"`). `import` kullanma, `require` kullan.
- Flow engine'e **yeni npm bağımlılığı eklenmeyecek**. Testler Node'un yerleşik `node:test` ve `node:assert/strict` modülleriyle yazılır.
- Wire formatı DAP'tır. Orkestratör agent'a `{ command, arguments }` gönderir; agent `{ success, payload }` döner (`data` alanı geriye dönük korunur).
- `USE_HTTP_AGENT_COMMANDS` ortam değişkeni **açılmayacak**. Taşıma seçimi koddan, kayıt biçiminden türetilir.
- Sidecar davranışı (cdp-sidecar, java-sidecar) değişmeyecek: NATS'tan kaydolurlar, NATS ile komut alırlar.
- Yorumlar ve commit mesajları Türkçe, ASCII karakterlerle (mevcut depo geleneği).
- Her task TDD ile ilerler: önce başarısız test, sonra en küçük uygulama, sonra commit.

## Dosya Haritası

| Dosya | Sorumluluk | Durum |
| --- | --- | --- |
| `~/flowengine/services/flow/debugBridge.js` | Agent kaydı, olay yayını. Komut iletme sorumluluğu **kaldırılır**, session açma sorumluluğu **kaldırılır**. | Değiştir |
| `~/flowengine/services/flow/index.js` | HTTP yüzeyi. `/flow/debug/command` rotası kaldırılır. | Değiştir |
| `~/flowengine/services/flow/test/debugBridge.test.js` | Kayıt yükü ve session sahipliği testleri | Oluştur |
| `~/flowengine/services/flow/package.json` | `test` script'i | Değiştir |
| `~/MSdistributedDebugging/apps/debug-orchestrator/src/agent/agent.service.ts` | Taşıma seçimi (`http` \| `nats`) | Değiştir |
| `~/MSdistributedDebugging/apps/debug-orchestrator/src/agent/agent.controller.ts` | HTTP kaydında taşımayı `http` olarak bildir | Değiştir |
| `~/MSdistributedDebugging/apps/debug-orchestrator/src/agent/nats-agent-listener.service.ts` | NATS kaydında taşımayı `nats` olarak bildir | Değiştir |
| `~/MSdistributedDebugging/apps/debug-orchestrator/src/agent/agent.service.spec.ts` | Taşıma seçimi testleri | Oluştur |
| `src/DagDebugService.ts` (reactdnd) | Çift gönderim kaldırılır; gerçek orkestratör session'ı kullanılır | Değiştir |

---

### Task 1: Flow engine'de sürüm kontrolü ve test altyapısı

`~/flowengine` bir git deposu değil. Bu plandaki commit adımlarının çalışması ve
değişikliklerin geri alınabilir olması için önce bu kurulmalı. Flow engine'de
test koşucusu da yok.

**Files:**
- Create: `~/flowengine/.gitignore`
- Create: `~/flowengine/services/flow/test/smoke.test.js`
- Modify: `~/flowengine/services/flow/package.json`

**Interfaces:**
- Consumes: yok (ilk task)
- Produces: `npm test` → `node --test test/` komutu, `services/flow/test/` dizini

- [x] **Step 1: Depoyu başlat**

```bash
cd ~/flowengine
git init
printf 'node_modules/\n.DS_Store\n*.log\n' > .gitignore
git add -A
git commit -m "chore: flowengine icin surum kontrolu baslat"
```

- [x] **Step 2: Başarısız bir duman testi yaz**

`~/flowengine/services/flow/test/smoke.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');

const { DagDebugBridge } = require('../debugBridge');

test('debugBridge modulu DagDebugBridge sinifini disari verir', () => {
  assert.equal(typeof DagDebugBridge, 'function');
});
```

- [x] **Step 3: Testi koş, koşucunun olmadığını gör**

Run: `cd ~/flowengine/services/flow && npm test`
Expected: FAIL — `Error: no test specified` (mevcut placeholder script)

- [x] **Step 4: Test script'ini ekle**

`~/flowengine/services/flow/package.json` içinde `scripts.test` değerini değiştir:

```json
"test": "node --test test/"
```

- [x] **Step 5: Testi koş, geçtiğini gör**

Run: `cd ~/flowengine/services/flow && npm test`
Expected: PASS — 1 test geçer

- [x] **Step 6: Commit**

```bash
cd ~/flowengine
git add services/flow/package.json services/flow/test/smoke.test.js
git commit -m "test: node:test ile test altyapisi kur"
```

---

### Task 2: Agent kaydı motorun gerçek adresini bildirsin

**Kök neden (spec 5.2):** `index.js:14` varsayılanı `PORT || 3033`, `debugBridge.js:218` ve `:530` varsayılanı `PORT || 3000`. Motor 3033'te dinlerken kendini 3000 olarak kaydeder. Ayrıca `agentUrl` `/api/v1` ile biter, orkestratör üstüne `/api/v1/agent/command` ekler.

**Files:**
- Modify: `~/flowengine/services/flow/debugBridge.js:218` (constructor `agentUrl`), `:530` (`registerAgent` içindeki `port`)
- Test: `~/flowengine/services/flow/test/debugBridge.test.js`

**Interfaces:**
- Consumes: Task 1'den `npm test`
- Produces: `DagDebugBridge` örneğinin `agentUrl` alanı `/api/v1` ile bitmez ve varsayılan portu 3033'tür.

- [x] **Step 1: Başarısız testleri yaz**

`~/flowengine/services/flow/test/debugBridge.test.js` (yeni dosya):

```js
const test = require('node:test');
const assert = require('node:assert/strict');

const { DagDebugBridge } = require('../debugBridge');

test('agentUrl varsayilani motorun dinledigi portu gosterir', () => {
  const bridge = new DagDebugBridge();
  assert.equal(bridge.agentUrl, 'http://127.0.0.1:3033');
});

test('agentUrl asla /api/v1 ile bitmez -- orkestrator o oneki kendisi ekler', () => {
  const bridge = new DagDebugBridge({ agentUrl: 'http://127.0.0.1:3033/api/v1' });
  assert.equal(bridge.agentUrl, 'http://127.0.0.1:3033');
});

test('kayit yuku motorun gercek portunu tasir', async () => {
  const bridge = new DagDebugBridge();
  const calls = [];
  bridge.post = async (path, body) => { calls.push({ path, body }); return {}; };

  await bridge.registerAgent('dag-flow-service', 'ws-1');

  assert.equal(calls.length, 1);
  assert.equal(calls[0].path, '/agent/register');
  assert.equal(calls[0].body.port, 3033);
  assert.equal(calls[0].body.agentUrl, 'http://127.0.0.1:3033');
});

test('kayit yuku kosullu breakpoint yetenegini bildirir', async () => {
  const bridge = new DagDebugBridge();
  const calls = [];
  bridge.post = async (path, body) => { calls.push({ path, body }); return {}; };

  await bridge.registerAgent('dag-flow-service', 'ws-1');

  assert.deepEqual(calls[0].body.capabilities, ['breakpoints', 'conditional_breakpoints', 'evaluate']);
});
```

- [x] **Step 2: Testleri koş, başarısız olduklarını gör**

Run: `cd ~/flowengine/services/flow && npm test`
Expected: FAIL — `agentUrl` `'http://127.0.0.1:3000/api/v1'` gelir, `port` `3000` gelir

- [x] **Step 3: En küçük uygulamayı yaz**

`debugBridge.js` başına, diğer yardımcıların yanına ekle:

```js
// Motorun gercekten dinledigi port. index.js ile AYNI varsayilani kullanmak
// zorunlu: iki dosyada iki farkli varsayilan oldugu icin motor 3033'te
// dinlerken kendini 3000 olarak kaydediyordu ve orkestratorun HTTP komutlari
// hicbir yere gitmiyordu.
const ENGINE_PORT = Number(process.env.PORT) || 3033;

// Orkestrator komut adresini `${agentUrl}/api/v1/agent/command` diye kurar.
// agentUrl zaten /api/v1 ile biterse adres /api/v1/api/v1/... olur ve 404 doner.
function stripApiPrefix(url) {
  return trimTrailingSlash(String(url || '')).replace(/\/api\/v1$/, '');
}
```

`constructor` içindeki satırı değiştir (eski `:218`):

```js
    this.agentUrl = stripApiPrefix(options.agentUrl || process.env.FLOW_AGENT_URL || `http://127.0.0.1:${ENGINE_PORT}`);
```

`registerAgent` içindeki satırı değiştir (eski `:530`):

```js
      port: ENGINE_PORT,
```

Aynı `registerAgent` çağrısında yetenek listesini spec Bölüm 1'e göre güncelle:

```js
      capabilities: ['breakpoints', 'conditional_breakpoints', 'evaluate'],
```

- [x] **Step 4: Testleri koş, geçtiklerini gör**

Run: `cd ~/flowengine/services/flow && npm test`
Expected: PASS — 5 test geçer

- [x] **Step 5: Commit**

```bash
cd ~/flowengine
git add services/flow/debugBridge.js services/flow/test/debugBridge.test.js
git commit -m "fix: agent kaydi motorun gercek adresini bildirsin

index.js 3033, debugBridge.js 3000 varsayiyordu; motor dinlemedigi bir
portu kaydediyordu. Ayrica agentUrl /api/v1 ile bitiyordu, orkestrator ise
ustune /api/v1/agent/command ekliyordu."
```

---

### Task 3: Orkestratör taşımayı kayıt biçiminden türetsin

**Kök neden (spec 5.2):** `USE_HTTP_AGENT_COMMANDS` set olmadığı için her komut NATS'a gider. NATS ayakta olduğundan yayın başarılı sayılır, ama DAG agent'ı o subject'i dinlemez — komut sessizce kaybolur.

**Files:**
- Modify: `~/MSdistributedDebugging/apps/debug-orchestrator/src/agent/agent.service.ts:115-175` (`registerAgent`), `:322-337` (`propagateBreakpoint`)
- Modify: `~/MSdistributedDebugging/apps/debug-orchestrator/src/agent/agent.controller.ts:34`
- Modify: `~/MSdistributedDebugging/apps/debug-orchestrator/src/agent/nats-agent-listener.service.ts:71`
- Test: `~/MSdistributedDebugging/apps/debug-orchestrator/src/agent/agent.service.spec.ts`

**Interfaces:**
- Consumes: yok
- Produces: `AgentService.registerAgent(req, agentUrl, skipRepublish?, transport?: 'http' | 'nats')` — dördüncü parametre varsayılanı `'nats'`. `AgentService.getCommandTransport(service): 'http' | 'nats'`.

- [x] **Step 1: Başarısız testleri yaz**

`~/MSdistributedDebugging/apps/debug-orchestrator/src/agent/agent.service.spec.ts` (yeni dosya):

```ts
import { AgentService } from './agent.service';
import { EventBusService } from '../event-bus/event-bus.service';

describe('AgentService komut tasimasi', () => {
  const eventBus = { publish: jest.fn().mockResolvedValue(undefined) } as unknown as EventBusService;

  const request = (service: string, agentId: string) => ({
    agentId,
    service,
    runtime: 'dag' as const,
    host: '127.0.0.1',
    port: 3033,
    runtimeVersion: 'dag-flowengine/v22',
    capabilities: [],
  });

  it('HTTP ile kaydolan agent HTTP tasimasi alir', async () => {
    const svc = new AgentService(eventBus);
    await svc.registerAgent(request('dag-flow-service', 'dag-1'), 'http://127.0.0.1:3033', false, 'http');

    expect(svc.getCommandTransport('dag-flow-service')).toBe('http');
  });

  it('NATS ile kaydolan agent NATS tasimasi alir', async () => {
    const svc = new AgentService(eventBus);
    await svc.registerAgent(request('cdp-sidecar', 'cdp-1'), 'http://127.0.0.1:9229', true, 'nats');

    expect(svc.getCommandTransport('cdp-sidecar')).toBe('nats');
  });

  it('tasima bildirilmezse NATS varsayilir', async () => {
    const svc = new AgentService(eventBus);
    await svc.registerAgent(request('java-service', 'java-1'), 'http://127.0.0.1:5005', true);

    expect(svc.getCommandTransport('java-service')).toBe('nats');
  });
});
```

- [x] **Step 2: Testleri koş, başarısız olduklarını gör**

Run: `cd ~/MSdistributedDebugging/apps/debug-orchestrator && npx jest src/agent/agent.service.spec.ts`
Expected: FAIL — `svc.getCommandTransport is not a function`

- [x] **Step 3: En küçük uygulamayı yaz**

`agent.service.ts` — alan listesine ekle (`agentUrlsById` yanına):

```ts
  // service -> komutlarin hangi tasima ile gonderilecegi. HTTP /agent/register
  // ile kaydolan agent'lar kendi komut sunucularini bildirir; NATS'tan kaydolan
  // sidecar'lar ise agentUrl olarak CDP/JDWP portunu verir, o adrese DAP POST
  // edilemez. Bu yuzden tasima kayit BICIMINDEN turetilir.
  private readonly commandTransports = new Map<string, 'http' | 'nats'>();
```

`registerAgent` imzasını ve gövdesini güncelle:

```ts
  async registerAgent(
    req: WorkspaceAgentRegisterRequest,
    agentUrl: string,
    skipRepublish = false,
    transport: 'http' | 'nats' = 'nats',
  ): Promise<void> {
```

`this.agentUrls.set(req.service, agentUrl);` satırının hemen ardına ekle:

```ts
    this.commandTransports.set(req.service, transport);
```

`getAgentUrl` yanına ekle:

```ts
  getCommandTransport(service: string): 'http' | 'nats' {
    return this.commandTransports.get(service) ?? 'nats';
  }
```

`propagateBreakpoint` başındaki koşulu değiştir:

```ts
    const resolvedService = this.resolveServiceAlias(service);
    const preferHttp = this.useHttpAgentCommands
      || (resolvedService ? this.getCommandTransport(resolvedService) === 'http' : false);

    if (!preferHttp) {
      return this.propagateBreakpointViaNats(service, command);
    }

    const agentUrl = resolvedService ? this.agentUrls.get(resolvedService) : undefined;
```

(Eski `if (!this.useHttpAgentCommands)` bloğu ve onun altındaki
`const resolvedService` / `const agentUrl` satırları bu blokla değişir;
`if (!agentUrl)` NATS'a düşme kontrolü olduğu yerde kalır.)

`agent.controller.ts:34`:

```ts
    await this.agentService.registerAgent(body, body.agentUrl, false, 'http');
```

`nats-agent-listener.service.ts:71`:

```ts
            await this.agentService.registerAgent(payload, agentUrl, true, 'nats');
```

- [x] **Step 4: Testleri koş, geçtiklerini gör**

Run: `cd ~/MSdistributedDebugging/apps/debug-orchestrator && npx jest src/agent/agent.service.spec.ts`
Expected: PASS — 3 test geçer

- [x] **Step 5: Derlemeyi doğrula**

Run: `cd ~/MSdistributedDebugging/apps/debug-orchestrator && npm run build`
Expected: hatasız

- [x] **Step 6: Commit**

```bash
cd ~/MSdistributedDebugging
git add apps/debug-orchestrator/src/agent/
git commit -m "fix: komut tasimasini agent'in kayit biciminden turet

USE_HTTP_AGENT_COMMANDS set olmadigi icin her komut NATS'a gidiyordu. NATS
ayakta oldugundan yayin basarili sayiliyor, ama DAG agent'i o subject'i
dinlemedigi icin Continue ve Step Over sessizce kayboluyordu. Bayragi global
acmak sidecar'lari kirardi: onlar agentUrl olarak CDP/JDWP portunu bildiriyor."
```

---

### Task 4: Motor komut iletmeyi bıraksın

Agent komut tüketir, komut üretmez. `forwardCommand` komutları orkestratöre yukarı POST ediyor — ters yön (spec 2).

**Files:**
- Modify: `~/flowengine/services/flow/debugBridge.js` (`forwardCommand` metodunu sil)
- Modify: `~/flowengine/services/flow/index.js:123-141` (`/flow/debug/command` rotasını sil), `:315` (başlangıç logu)
- Test: `~/flowengine/services/flow/test/debugBridge.test.js`

**Interfaces:**
- Consumes: Task 2'den `DagDebugBridge`
- Produces: `DagDebugBridge.prototype.forwardCommand` artık yoktur. `POST /flow/debug/command` artık yoktur.

- [x] **Step 1: Başarısız testi yaz**

`test/debugBridge.test.js` sonuna ekle:

```js
test('agent komut uretmez: forwardCommand kaldirildi', () => {
  assert.equal(DagDebugBridge.prototype.forwardCommand, undefined);
});
```

- [x] **Step 2: Testi koş, başarısız olduğunu gör**

Run: `cd ~/flowengine/services/flow && npm test`
Expected: FAIL — `forwardCommand` hâlâ bir fonksiyon

- [x] **Step 3: Uygulamayı yap**

`debugBridge.js` içinden `async forwardCommand(command) { ... }` metodunun tamamını sil.

`index.js` içinden `app.post('/flow/debug/command', ...)` bloğunun tamamını sil (yorum başlığı dahil). `index.js:8`'deki `handleDebugCommand` ve `:11`'deki `normalizeCommandType` import'ları bu rotadan sonra kullanılmıyorsa onları da sil. `:315`'teki `COMMAND` log satırını sil.

- [x] **Step 4: Testi koş ve motorun ayağa kalktığını doğrula**

Run: `cd ~/flowengine/services/flow && npm test`
Expected: PASS

Run: `cd ~/flowengine/services/flow && node -e "require('./index.js')" & sleep 2; curl -s -o /dev/null -w '%{http_code}\n' -X POST http://127.0.0.1:3033/flow/debug/command -H 'Content-Type: application/json' -d '{}'; kill %1`
Expected: `404`

- [x] **Step 5: Commit**

```bash
cd ~/flowengine
git add services/flow/debugBridge.js services/flow/index.js services/flow/test/debugBridge.test.js
git commit -m "refactor: motor komut iletmeyi biraksin

forwardCommand komutlari orkestratore yukari POST ediyordu; gercek agent'ta
yon tersidir. /flow/debug/command rotasi da kalkti -- artik tek komut yolu
orkestratorun /api/v1/agent/command cagrisidir."
```

---

### Task 5: Extension çift gönderimi bıraksın

`DagDebugService.sendCommand` aynı komutu iki yere birden yolluyor: önce flow engine'e, sonra orkestratöre (`DagDebugService.ts:293-301`). Task 4'ten sonra ilki zaten 404 döner.

**Files:**
- Modify: `src/DagDebugService.ts:293-301` (çift gönderim), `:615-624` (`sendFlowEngineDebugCommand`), ve `sendFlowEngineDebugCommandWs`

**Interfaces:**
- Consumes: Task 4'ten kaldırılmış `/flow/debug/command`
- Produces: `DagDebugService.sendCommand` yalnızca `this.client.sendCommand(command)` çağırır.

- [x] **Step 1: Çift gönderimi kaldır**

`src/DagDebugService.ts` içinde `sendCommand`'in sonundaki bloğu:

```ts
    await this.sendFlowEngineDebugCommand(command).catch((err: Error) => {
      this.output.appendLine(`[dag-debug] flow engine command failed: ${err.message}`);
    });

    try {
      await this.client.sendCommand(command);
    } catch (err) {
      this.output.appendLine(`[dag-debug] orchestrator command failed: ${(err as Error).message}`);
    }
```

şununla değiştir:

```ts
    // Tek komut yolu: orkestrator. Oradan agent'a (flow engine) HTTP ile iner.
    // Eskiden komut once dogrudan motora, sonra orkestratore gidiyordu; motor
    // ayni durusu iki kez cozmeye calisiyordu.
    try {
      await this.client.sendCommand(command);
    } catch (err) {
      this.output.appendLine(`[dag-debug] orchestrator command failed: ${(err as Error).message}`);
    }
```

- [x] **Step 2: Ölü kodu sil**

`sendFlowEngineDebugCommand` ve `sendFlowEngineDebugCommandWs` metotlarının tamamını sil. Başka çağıranı olmadığını doğrula:

Run: `cd ~/Development/Workspace/react/reactdnd && grep -rn "sendFlowEngineDebugCommand" src/`
Expected: çıktı yok

- [x] **Step 3: Derlemeyi doğrula**

Run: `cd ~/Development/Workspace/react/reactdnd && npx tsc --noEmit -p tsconfig.json`
Expected: hatasız

- [x] **Step 4: Commit**

```bash
cd ~/Development/Workspace/react/reactdnd
git add src/DagDebugService.ts
git commit -m "refactor: DAG komutlari yalnizca orkestrator uzerinden gitsin

sendCommand ayni komutu once motora sonra orkestratore yolluyordu. Motor
tarafindaki ucun kaldirilmasiyla tek yol kaldi."
```

---

### Task 6: Motor session açmayı bıraksın

**Kök neden (spec 5.1):** Motor `registerAgent()` çağırınca orkestratör `agent.registered` yayıyor, extension bunu görüp service adıyla bir session açıyor; motor da hemen ardından `flowId` adıyla kendi session'ını açıyor. 1 ms arayla iki session oluşuyor.

**Files:**
- Modify: `~/flowengine/services/flow/debugBridge.js` — `startOrReuseSession`, `stopAutoSessions` silinir; `ensureDebugSession` verilen `sessionId`'yi kullanır; `stopSessionForContext` ve `forwardCommand` kalıntısı `/debug/session/stop` çağrıları kalkar
- Test: `~/flowengine/services/flow/test/debugBridge.test.js`

**Interfaces:**
- Consumes: Task 4'ten temizlenmiş `DagDebugBridge`
- Produces: `ensureDebugSession(debug, payload)` — `debug.orchestratorSessionId` yalnızca çağrandan gelir; bridge hiçbir zaman `/debug/session/start` POST etmez.

- [x] **Step 1: Başarısız testi yaz**

`test/debugBridge.test.js` sonuna ekle:

```js
test('bridge session acmaz: verilen orchestratorSessionId oldugu gibi kullanilir', async () => {
  const bridge = new DagDebugBridge();
  const posts = [];
  bridge.post = async (path, body) => { posts.push({ path, body }); return {}; };
  bridge.connectAgentWs = async () => {};

  const debug = await bridge.ensureDebugSession({
    enabled: true,
    sessionId: 'dag-local-1',
    orchestratorSessionId: 'orch-session-1',
    service: 'dag-flow-service',
    flowId: 'untitled',
    breakpoints: [],
  }, {});

  assert.equal(debug.orchestratorSessionId, 'orch-session-1');
  assert.equal(posts.some((p) => p.path === '/debug/session/start'), false);
});
```

- [x] **Step 2: Testi koş, başarısız olduğunu gör**

Run: `cd ~/flowengine/services/flow && npm test`
Expected: FAIL — `/debug/session/start` POST'u yapılmış olur

- [x] **Step 3: Uygulamayı yap**

`debugBridge.js` içinde `startOrReuseSession` ve `stopAutoSessions` metotlarının
tamamını sil. `ensureDebugSession` içindeki

```js
      const session = await this.startOrReuseSession(debug, payload);
      debug.orchestratorSessionId = session?.sessionId || debug.orchestratorSessionId || debug.sessionId;
```

satırlarını şununla değiştir:

```js
      // Gercek agent debug session'i ACMAZ -- session'i istemci acar
      // (cdp-sidecar ve java-sidecar da acmaz). Motor session actigi icin
      // extension'in agent.registered tepkisiyle yarisiyor ve ayni agent icin
      // iki session olusuyordu. Artik yalnizca bize verilen kimligi kullaniriz.
      debug.orchestratorSessionId = firstString(
        debug.orchestratorSessionId,
        payload.orchestratorSessionId,
        payload.sessionId,
        debug.sessionId,
      );
```

`stopSessionForContext` içindeki `await this.post('/debug/session/stop', ...)`
çağrısını sil; metot yalnızca yerel bağlamı unutsun:

```js
  async stopSessionForContext(context) {
    if (!context) {
      return { accepted: false, forwarded: false, error: 'No debug bridge session matches this stop request.' };
    }

    // Session'i acan taraf kapatir. Agent yalnizca kendi yerel baglamini birakir.
    this.forgetSession(context);
    this.closeAgentWsIfIdle();
    return { accepted: true, forwarded: false, stopped: true, sessionId: context.orchestratorSessionId, flowId: context.flowId };
  }
```

- [x] **Step 4: Testleri koş, geçtiklerini gör**

Run: `cd ~/flowengine/services/flow && npm test`
Expected: PASS

- [x] **Step 5: Commit**

```bash
cd ~/flowengine
git add services/flow/debugBridge.js services/flow/test/debugBridge.test.js
git commit -m "fix: motor debug session acmasin

registerAgent cagrisi orkestratorde agent.registered yayiyor, extension da
bunu gorup service adiyla session aciyordu; motor ise hemen ardindan flowId
adiyla kendi session'ini aciyordu. Ayni agent icin 1 ms arayla iki session
olusuyor ve kullaniciya iki agent gibi gorunuyordu."
```

---

### Task 7: Extension gerçek orkestratör session'ını kullansın

`DagDebugService.ensureSession` (`src/DagDebugService.ts:308-319`) `dag-<base36>` biçiminde sahte bir kimlik üretiyor. Task 6'dan sonra motorun kullanacağı `sessionId` bu payload'dan geliyor — dolayısıyla gerçek olmalı.

**Files:**
- Modify: `src/DagDebugService.ts:308-319` (`ensureSession`)
- Modify: `src/OrchestratorClient.ts` (session listeleme yardımcısı gerekiyorsa)

**Interfaces:**
- Consumes: Task 6'dan `ensureDebugSession`'ın payload'dan okuduğu `sessionId`
- Produces: `ensureSession(flowId): Promise<string>` — orkestratörde bu service için aktif olan session'ın gerçek kimliğini döndürür.

- [x] **Step 1: `ensureSession`'ı gerçek session'a bağla**

`src/DagDebugService.ts` içindeki `ensureSession` gövdesini değiştir:

```ts
  private async ensureSession(flowId: string): Promise<string> {
    if (this.sessionId && this.activeFlowId === flowId) {
      return this.sessionId;
    }
    const config = this.readConfig();

    // Orkestratorde bu service icin zaten bir session var: msdebug tarafi
    // agent kaydini gorunce aciyor. Kendi kimligimizi uydurursak motorun
    // yaydigi olaylar hicbir session'a denk gelmez.
    const sessionId = await this.client.findActiveSessionId(config.service, config.workspaceId);
    if (!sessionId) {
      this.output.appendLine('[dag-debug] No active orchestrator session for this service yet.');
      return '';
    }

    this.sessionId = sessionId;
    this.activeFlowId = flowId;
    this.socketBridge.setActiveWorkspace(config.workspaceId);
    this.socketBridge.setActiveSession(sessionId);
    this.broadcastState();
    return sessionId;
  }
```

- [x] **Step 2: `findActiveSessionId`'yi ekle**

`src/OrchestratorClient.ts` içine, `stopSession` yanına:

```ts
  /**
   * Bu service icin orkestratorde aktif olan session'in kimligi.
   * DAG tarafi session ACMAZ: session'i msdebug tarafi agent kaydinda aciyor,
   * biz yalnizca ona baglaniriz.
   */
  async findActiveSessionId(service: string, workspaceId?: string): Promise<string> {
    const active = new Set(['running', 'active', 'initializing', 'paused', 'stepping', 'replaying']);
    const body = await this.request<{ sessions?: Array<Record<string, unknown>> }>(
      'GET',
      '/debug/session?limit=100&offset=0',
    );
    const sessions = Array.isArray(body.sessions) ? body.sessions : [];
    const match = sessions
      .filter((s) => active.has(String(s.status ?? '')))
      .filter((s) => {
        const services = Array.isArray(s.services) ? s.services : [];
        return services.some((svc) => (svc as { service?: string })?.service === service);
      })
      .filter((s) => {
        const metadata = (s.metadata ?? {}) as Record<string, unknown>;
        const candidate = typeof s.workspaceId === 'string' ? s.workspaceId : metadata.workspaceId;
        return !workspaceId || !candidate || candidate === workspaceId;
      })
      .sort((a, b) => Number(b.createdAt ?? 0) - Number(a.createdAt ?? 0))[0];

    return typeof match?.sessionId === 'string' ? match.sessionId : '';
  }
```

- [x] **Step 3: Derlemeyi doğrula**

Run: `cd ~/Development/Workspace/react/reactdnd && npx tsc --noEmit -p tsconfig.json`
Expected: hatasız

- [x] **Step 4: Commit**

```bash
cd ~/Development/Workspace/react/reactdnd
git add src/DagDebugService.ts src/OrchestratorClient.ts
git commit -m "fix: DAG tarafi gercek orkestrator session'ini kullansin

ensureSession dag-<base36> biciminde sahte bir kimlik uretiyordu. Motor artik
sessionId'yi bizden aldigi icin bu kimligin orkestratorde gercekten karsiligi
olmali; aksi halde yayilan olaylar hicbir session'a denk gelmez."
```

---

### Task 8: Uçtan uca doğrulama

**Files:** yok (doğrulama)

**Interfaces:**
- Consumes: Task 1-7

- [x] **Step 1: Her şeyi yeniden başlat**

```bash
# Orkestratör
cd ~/MSdistributedDebugging/apps/debug-orchestrator && npm run build && npm start &
# Flow engine
cd ~/flowengine && npm run start:flow &
```

Extension'ı Extension Development Host'ta yeniden başlat.

- [x] **Step 2: Agent kaydının doğru adresi bildirdiğini doğrula**

Run: `curl -s http://127.0.0.1:4000/api/v1/agent | python3 -m json.tool | grep -E 'agentUrl|service|runtime'`
Expected: `"agentUrl": "http://127.0.0.1:3033"` — `/api/v1` yok, port 3033

- [x] **Step 3: Tek session olduğunu doğrula**

Bir `.flow` dosyasında debug modunu aç, bir node'a breakpoint koy, akışı başlat.

Run: `curl -s "http://127.0.0.1:4000/api/v1/debug/session?limit=20&offset=0" | python3 -c "import json,sys; d=json.load(sys.stdin); print([(s['name'], s['status']) for s in d['sessions']])"`
Expected: `dag-flow-service` için **tek** aktif session

- [x] **Step 4: Continue'nun uçtan uca çalıştığını doğrula**

Breakpoint'e denk gelindiğinde VS Code'da Continue'ya bas.

Run: `curl -s http://127.0.0.1:3033/flow/debug/state | python3 -c "import json,sys; print(json.load(sys.stdin)['pendingDebugPauses'])"`
Expected: `[]` — duraklama çözülmüş

- [x] **Step 5: Step Over'ın uçtan uca çalıştığını doğrula**

Akışı yeniden başlat, breakpoint'te dur, Step Over'a bas. Motorun sonraki node'da durduğunu ve extension'ın bunu gösterdiğini doğrula:

Run: `curl -s http://127.0.0.1:3033/flow/debug/state | python3 -c "import json,sys; print(json.load(sys.stdin)['pendingDebugPauses'])"`
Expected: `nodeId` bir sonraki node — yani duraklama yeni bir node'a taşınmış

- [x] **Step 6: Sidecar'ların bozulmadığını doğrula**

cdp-sidecar veya java-sidecar ile bir oturum aç, breakpoint koy, Continue çalıştır.
Expected: eskisi gibi çalışır (NATS taşıması korunmuştur)


---

## Uygulama notları (2026-08-24)

Planı yazarken bilmediğim, uygulama sırasında ortaya çıkan şeyler. Planın
kendisi değil, gerçekte olan kayıt altına alınıyor.

### Plandan sapmalar

| Nerede | Plan ne diyordu | Ne yapıldı ve neden |
| --- | --- | --- |
| Task 1 | `"test": "node --test test/"` | Bu Node sürümü `test/` dizinini modül olarak çözmeye çalışıp patladı. `node --test test/*.test.js` kullanıldı. |
| Task 3 | Yalnızca jest testi yazılacaktı | Pakette ts-jest kuruluydu ama **jest yapılandırması ve `@types/jest` yoktu** — monorepo'da hiç test koşmamış. `jest.config.js` eklendi, `@types/jest` devDependency olarak kuruldu. |
| Task 4 | Yalnızca HTTP rotası (`/flow/debug/command`) silinecekti | Rotanın bir **WS ikizi** vardı: `onDebugCommand` işleyicisi ve `wsServer.js` içindeki komut yolu. Task 5 extension'ın WS komut yolunu kaldırdığı için bunlar da ölü kod olacaktı; aynı gerekçeyle aynı task'ta silindi. |
| Task 8 | Ben doğrulayacaktım | Agent yalnızca editörden debug modu açılınca kaydolduğu için UI adımlarını kullanıcı sürdü. |

### Uygulamanın ortaya çıkardığı kusur

Task 6-7'den sonra breakpoint'ler orkestratöre kaydoluyor ama akış hiç durmuyor,
motorda breakpoint görünmüyordu. Kök neden bir yumurta-tavuk sıralamasıydı:
orkestratör oturumu agent kaydından, agent kaydı ise debug-mode mesajından
sonra doğuyor. Motor boş kimlik görünce `dbg-xxxxxx` uyduruyor ve sonradan
gelen gerçek kimlikli mesajlar hiçbir oturumu bulamıyor. Ayrıntılı analiz ve
iki parçalı düzeltme spec'in "Uygulama sonrası" bölümünde.

Düzeltme commit'leri:

- flowengine `d22083f` — `findOrAdoptDebugSession`: üretilmiş kimlikli oturumu
  gerçek kimliğe taşı (5 test)
- reactdnd `ae62bfc` — `enableDebugMode`: önce agent kaydını tetikle, sonra
  oturuma bağlan

### Test kapsamı boşluğu

Extension deposunda test altyapısı yok (`package.json`'da test script'i bile
yok). Bu yüzden extension tarafındaki değişiklikler (Task 5, Task 7 ve
sıralama düzeltmesi) **birim testiyle korunmuyor**; yalnızca `tsc --noEmit` ve
uçtan uca deneme ile kapandı. Motor ve orkestratör tarafı testli.

Bu, ayrı bir iş olarak ele alınmalı.
