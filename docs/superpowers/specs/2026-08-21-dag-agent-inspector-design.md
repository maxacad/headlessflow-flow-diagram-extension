# DAG Flow Engine'i Gerçek Bir Debug Agent'ına Dönüştürme

Tarih: 2026-08-21
Durum: Onaylandı (tasarım), uygulama planı bekliyor

## Sorun

Flow engine bugün bir debug agent'ı gibi değil, bir debug *kontrolcüsü* gibi
davranıyor. Komutlar diyagram UI'ından doğrudan motora gidiyor, motor da bunları
orkestratöre yukarı doğru POST ediyor. Gerçek agent'larda (cdp-sidecar,
java-sidecar) yön terstir: orkestratör komut basar, agent yürütür ve olay yayar.

Bunun görünür sonuçları:

- Değişkenler yalnızca duraklama olayının payload'ında yaşıyor. `scopes` sabit
  tek bir kapsam döndürüyor, nesneler `JSON.stringify` ile düzleştiriliyor,
  ağaç genişletme yok.
- `evaluate`, `pause`, `disconnect`, `setBreakpoints`, `scopes`, `variables`
  komutları agent yüzeyinde yok.
- Extension aynı komutu iki yere birden gönderiyor (motor + orkestratör).

## Kapsam dışı

- NATS taşımasını flow engine'e getirmek.
- `.flow` satır numaralandırmasını değiştirmek (wire formatı korunur).
- Akış çalıştırma yaşam döngüsü (`/flow/start-debug`) — bu debug kontrolü değil.

## Mevcut durum (doğrulanmış)

| Bileşen | Gerçek |
| --- | --- |
| `POST /debug/command` (orkestratör) | `DebugService` → `agentService.sendCommand` → agent. Extension'ın kullandığı yol **zaten doğru**. |
| `agentService.propagateBreakpoint` | Varsayılan taşıma **NATS**. HTTP yalnız `USE_HTTP_AGENT_COMMANDS=true` iken. |
| Sidecar kaydı | NATS üzerinden; `agentUrl` olarak CDP/JDWP portu veriliyor — bu yüzden bayrağı global açmak sidecar'ları kırar. |
| `toDapRequest` | Wire formatı DAP: `RESUME→continue`, `STEP_OVER→next`, `GET_STACK_TRACE→stackTrace`, `SET_BREAKPOINT→setBreakpoints{source.path, breakpoints[]}`. |
| Flow engine kaydı | `agentUrl` `.../api/v1` ile kaydediliyor; orkestratör üstüne `/api/v1/agent/command` ekliyor → `/api/v1/api/v1/...`. Komut 404 alır, sağlık kontrolü tesadüfen çalışır. |
| Flow engine agent yüzeyi | `/api/v1/agent/command` var; `continue`/`next`/`stepIn`/`stepOut`/`GET_VARIABLES`/`GET_STACK_TRACE`/`GET_THREADS` kısmen işleniyor. |

## Tasarım

### 1. Kayıt ve taşıma

Flow engine (`debugBridge.registerAgent`):

- `agentUrl` = `http://127.0.0.1:${PORT}`; sondaki `/api/v1` her durumda kırpılır
  (`FLOW_AGENT_URL` verilse bile). Böylece orkestratörün ürettiği iki URL de
  doğru olur: `${agentUrl}/api/v1/agent/command` ve `${agentUrl}/health`.
- `capabilities: ['breakpoints', 'conditional_breakpoints', 'evaluate']`.

Orkestratör (`agent.service.ts`):

- `registerAgent` açık bir `transport: 'http' | 'nats'` alanı kaydeder. HTTP
  `/agent/register` ile gelen kayıtlar `http`, `NatsAgentListenerService`'ten
  gelenler `nats` olur. `skipRepublish` bayrağı taşıma sinyali olarak yeniden
  yorumlanmaz — ayrı ve okunur bir alan kullanılır.
- `propagateBreakpoint`: `useHttpAgentCommands || transportOf(service) === 'http'`
  ise HTTP, aksi halde NATS. Sidecar'lar NATS'tan kayıt olduğu için davranışları
  aynen korunur; global bayrak açılmaz.

Taşıma seçimi `runtime === 'dag'` diye sabitlenmez; kayıt biçiminden türetilir.

### 2. DAP komut yüzeyi

`POST /api/v1/agent/command`, gövde `{ command, arguments }`, yanıt
`{ success, payload }` (`data` alanı geriye dönük korunur).

| DAP komutu | Engine karşılığı |
| --- | --- |
| `continue` | Bekleyen duraklamayı `CONTINUE` ile çöz |
| `next` / `stepIn` / `stepOut` | `stepMode` kur, duraklamayı çöz |
| `pause` | "Sonraki node'da dur" bayrağını kur |
| `setBreakpoints` | `source.path` + `line[]` → nodeId'ler; o dosyanın breakpoint kümesini **replace** et |
| `stackTrace` | Duraklama bağlamının frame'leri |
| `scopes` | frame → `Locals` / `Flow Variables` / `Node Data` |
| `variables` | `variablesReference` → alt değişkenler |
| `evaluate` | Duraklama kapsamında ifade değerlendirme |
| `threads` | Aktif flowRun başına bir thread |
| `disconnect` | Oturumu kapat |

Silinir: `debugBridge.forwardCommand` ve motorun orkestratöre yaptığı
`/debug/continue`, `/debug/step`, `/debug/breakpoint` POST'ları. Agent komut
üretmez, komut tüketir. `publishDebugEvent` ve agent WS olduğu gibi kalır —
olay yönü zaten doğru.

### 3. Inspector durum modeli

Yeni dosya: `services/flow/debugInspector.js`. (`flowEngine.js` 52KB; bu
sorumluluk oraya eklenmez.)

- Her duraklamada bir `PauseInspector` üretilir; `pendingDebugPauses` girdisi
  onu tutar.
- **Frames:** çalışan node + varsa üst akış/Call zinciri + kök flow frame'i.
  `id` sayısal (DAP böyle bekler), `name` = `label (nodeId)`, `source.path` =
  gerçek `.flow` dosyası.
- **Scopes (frame başına):** `Locals` (gelen kenarların çıktıları + node
  çıktısı), `Flow Variables` (ctx state), `Node Data` (node.data).
- **variablesReference handle tablosu:** `Map<number, value>`. Nesne ve diziler
  tembel olarak yeni handle alır; dizilerde `indexedVariables` doldurulur.
  Handle'lar resume'da geçersizleşir — bayat referans döndürülmez.
- **evaluate:** yerleşik `vm` modülü (yeni bağımlılık yok), kapsam olarak
  birleşik scope, 100ms timeout, `require`/`process` erişimi yok.

### 4. Satır ↔ node eşlemesi

`lineForNodeId` tek yönlü bir hash olduğu için orkestratörden gelen
`setBreakpoints{source.path, line}` bir node'a çözülemiyor.

Wire formatı değiştirilmez. Flow yüklendiğinde flowId başına bir `nodeIndex`
tutulur; ters çözüm, bilinen node id'leri üzerinde aynı hash hesaplanıp
eşleştirilerek yapılır. Hash deterministik olduğu için bu kayıpsızdır. İstemci
açık bir `line` gönderdiyse o değer önceliklidir.

### 5. Extension sadeleşmesi

- `DagDebugService.sendCommand` bugün komutu iki kere yolluyor. Flow engine'e
  giden yol (`sendFlowEngineDebugCommand` ve WS komut yolu) silinir; tek yol
  `client.sendCommand` → `/debug/command` olur.
- Flow engine'de `POST /flow/debug/command` rotası kaldırılır.
- Breakpoint'ler de aynı yöne çevrilir: extension → orkestratör
  `/debug/breakpoint` → agent `setBreakpoints`.
- `/flow/start-debug` ve `agent:event` olay yolu korunur.

### 5.1 Session sahipliği

Kanıt (canlı orkestratör, 2026-08-21): aynı `dag-flow-service` agent'ı için 1 ms
arayla iki session oluşuyor —

| sessionId | name | status | kaynak |
| --- | --- | --- | --- |
| `59a5bbbb…` | `dag-flow-service` | active | extension, `rebindSessionsForActiveAgents` |
| `a0792db5…` | `untitled` | paused | flow engine, `startOrReuseSession` |

Zincir: motor `registerAgent()` çağırır → orkestratör `agent.registered` yayar →
extension bunu görüp "bayat session'ları durdur, taze bir tane aç" yolunu
işletir → bu sırada motorun kendi `POST /debug/session/start` isteği hâlâ yolda
olduğu için görülmez. Extension'ın Sessions ağacı `session.name` bastığı için
kullanıcıya iki agent varmış gibi görünür.

`DagDebugService.ensureSession` orkestratör session'ı açmaz; `dag-<base36>`
biçiminde yerel bir kimlik uydurur. Yani DAG tarafında gerçek session'ı açan iki
taraf vardır ve ikisi de diğerinden habersizdir.

Karar: **gerçek agent debug session'ı açmaz.** cdp-sidecar ve java-sidecar
`/debug/session/start` çağırmaz; session'ı istemci açar.

- Flow engine'den `startOrReuseSession`, `/debug/session/start` ve
  `/debug/session/stop` çağrıları kalkar.
- Session sahibi extension olur. `DagDebugService` uydurma `dag-…` kimliği
  yerine `rebindSessionsForActiveAgents`'in service için zaten açtığı session'ı
  kullanır — yeni session açmasına gerek yoktur.
- Motor, `publishDebugEvent`'te kullanacağı `sessionId`'yi `/flow/debug/session`
  ve `/flow/start-debug` payload'ından alır. Extension bu alanı bugün de
  gönderiyor; yalnızca içindeki değer sahte.

Reddedilen alternatif: motorun `startOrReuseSession`'ını gerçekten "reuse"
yapmak (önce listele, aktif olanı benimse). Yarışı kapatmaz — iki taraf da aynı
anda listeleyip açabilir — ve sahipliği yanlış tarafta bırakır.

### 5.2 Komut yolunun kopuk olduğu yer (kök neden kanıtı)

Continue ve Step Over'ın hiçbir şey yapmamasının sebebi olay yönü değil, komut
yönüdür. Canlı sistemde ölçüldü:

1. **Taşıma.** `USE_HTTP_AGENT_COMMANDS` orkestratör sürecinde set değil →
   `propagateBreakpoint` NATS'a düşer. NATS ayakta (4222) olduğu için yayın
   *başarılı* olur, ama DAG agent'ı o subject'i dinlemez. Komut sessizce
   kaybolur: ne hata, ne log. Birincil sebep.
2. **Port.** `index.js:14` varsayılanı `PORT || 3033`, `debugBridge.js:218` ve
   `:530` varsayılanı `PORT || 3000`. Motor 3033'te dinlerken kendini 3000
   olarak kaydeder. Bayrak açılsa bile HTTP yanlış porta gider.
3. **Çift önek.** `agentUrl` `.../api/v1` ile kaydedilir, orkestratör üstüne
   `/api/v1/agent/command` ekler.

Motorun komut yüzeyinin sağlam olduğu doğrulandı: DAP `continue` doğrudan
`http://127.0.0.1:3033/api/v1/agent/command` adresine gönderildiğinde 345
saniyedir bekleyen duraklama anında çözüldü
(`{"success":true,"payload":{"resumed":true,"nodeId":"node-12"}}`).

Bu üç kusur yalnız Continue'yu değil, orkestratörden inen her komutu keser:
Step Over/Into/Out, `evaluate`, `setBreakpoints`.

### 5.3 Debug görünümü odağı

Breakpoint'e denk gelindiğinde VS Code'un yerleşik Debug görünümü öne geçiyor;
MS Distributed Debug view'ı odakta kalmıyor. Bu gerçek bir kusurdur ama komut
yolunu kırmaz — 5.2'deki ölçüm, komutların extension'dan çıkıp orkestratöre
ulaştığını ve orada öldüğünü gösteriyor. Sırası 5.2'den sonradır.

### 6. Test

flowengine'de test koşucusu yok. Yerleşik `node:test` eklenir (yeni bağımlılık
yok), `npm test` → `node --test`.

- `debugInspector` birim testleri: scope üretimi, iç içe nesne genişletme,
  resume'da handle geçersizleşmesi, evaluate timeout'u.
- Komut yüzeyi testleri: her DAP fiili için sahte bir duraklama üzerinde
  beklenen etki. TDD — testler önce.
- Satır → node ters çözümü testi.
- Orkestratörde jest mevcut: taşıma seçimi için `agent.service` birim testi
  (HTTP kayıt → HTTP, NATS kayıt → NATS).
- Uçtan uca elle senaryo: engine + orkestratör ayakta, breakpoint'li akış,
  Continue / Step Over / değişken genişletme.
- Kırmızı test (5.1): aynı service için agent kaydından sonra orkestratörde
  **tek** aktif session kalmalı.
- Kırmızı test (5.2): agent kaydındaki `port` ve `agentUrl`, motorun gerçekten
  dinlediği portu göstermeli; `agentUrl` `/api/v1` ile bitmemeli.

## Riskler

- Ortamda `USE_HTTP_AGENT_COMMANDS=true` ise davranış zaten HTTP'dir; taşıma
  testi bu iki durumu da kapsamalı.
- Breakpoint kaydını orkestratöre taşımak, motorun `registeredBreakpoints`
  haritasına bağlı olan olay zenginleştirmesini (`publishDebugEvent` içindeki
  `file`, `line`, `hitCount`) etkiler. Bu harita artık orkestratörden gelen
  `setBreakpoints` ile doldurulmalıdır.
- Flow engine bir git deposu değil; değişiklikler sürüm kontrolü altında
  değildir. Uygulamaya başlamadan önce orada `git init` yapılması önerilir.

## Başarı ölçütü

VS Code Debug UI'ında DAG oturumu için Continue, Step Over/Into/Out, Call
Stack, Scopes, iç içe değişken genişletme, Watch ve hover evaluate çalışır —
ve komutların tamamı orkestratör üzerinden akar; extension flow engine'e hiçbir
debug komutu göndermez.
