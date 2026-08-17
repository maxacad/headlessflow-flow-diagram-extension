# React Flow Node Editor (reactdnd)

VSCode Custom Editor uzantısı. `@xyflow/react` ile Intershop tarzı **cartridge** içeriğini (`.flow` pipeline, `.pipelet`, `.webform`) sürükle-bırak bir node editöründe düzenlemeyi, ve bir dağıtık orchestrator üzerinden **DAG debug** yapmayı hedefliyor.

## Ne işe yarıyor

- **Flow Editor** (`reactdnd.flowEditor`, `*.flow`) — sürükle-bırak node editörü. Dosya formatı **JSON**'dur (uzantı `.flow` olsa da XML değildir); pipelet/HTTP endpoint paletten sürüklenip node olarak bırakılabilir.
- **Web Form Editor** (`reactdnd.webFormEditor`, `*.webform`) — `form-render` + `antd` tabanlı JSON-schema form tasarımcısı; split / JSON / preview görünümleri arasında geçiş yapılabilir.
- **Cartridge Explorer** — workspace'te `model/pipelines/pipelets/webforms/...` klasör düzenine uyan cartridge'leri tarayan tree view.
- **Pipelet Explorer** — workspace genelinde `**/*.pipelet` dosyalarını listeler, flow'a sürüklenebilir/eklenebilir (`insertPipeletToFlow`).
- **OpenAPI Explorer** — `.openapi-sources.json`'da tanımlı OpenAPI/Swagger kaynaklarını çeker, endpoint'leri flow'a HTTP-call node olarak eklenebilir hale getirir.
- **.flow Sync** — `.flow-sync.json` üzerinden, `.flow` dosyalarını harici bir flow-engine'e (varsayılan `http://localhost:3012`) push/pull/rollback eden ayrı bir versiyonlama katmanı.
- **DAG Debug Mode** — flow diagramı üzerinden breakpoint koyup çalıştırmayı hedefleyen, MS Distributed Debugging orchestrator ile konuşan entegrasyon. **Kısmen implement edilmiş** — ayrıntı için aşağıya bakın.

## Mimari

Extension host (`src/`), dört ayrı webpack hedefiyle üretilen webview bundle'larını (`dist/webview.js`, `dist/nodeDetail.js`, `dist/webform.js`) `postMessage` protokolüyle besliyor.

| Dosya | Sorumluluk |
|---|---|
| `extension.ts` | Aktivasyon: custom editor, view provider, tree view ve komut kayıtları |
| `FlowEditorProvider.ts` | Flow custom editor — webview kurulumu, dosya kaydetme, pipelet/webform dosya keşfi, HTTP method-call çalıştırma, DAG debug mesaj yönlendirme |
| `WebFormEditorProvider.ts` | WebForm custom editor |
| `CartridgeExplorerProvider.ts` | Cartridge klasör tarayıcı tree view + drag kaynağı |
| `PipeletTreeViewProvider.ts` | `.pipelet` dosyaları tree view + drag kaynağı (asıl kayıtlı olan; bkz. Bilinen Boşluklar) |
| `OpenApiExplorerProvider.ts` | OpenAPI kaynak tarayıcı tree view |
| `NodeLibraryViewProvider.ts` / `NodeDetailViewProvider.ts` | Sidebar webview'ları: node paleti / seçili node özellik paneli |
| `FlowSyncViewProvider.ts` | `.flow` versiyon senkronizasyonu tree view |
| `DagDebugService.ts`, `OrchestratorClient.ts`, `SocketIoDagDebugBridge.ts`, `LocalDagDebugAgent.ts`, `dagDebugTypes.ts` | DAG debugger istemci yığını |

`webview-src/` React uygulamaları: ana flow editörü (`App.tsx`, node tipleri `nodes/` altında — `StartNode`, `EndNode`/`StopNode`, `ProcessNode`, `FunctionNode`, `ScriptNode`, `DecisionNode`, `LoopNode`, `JoinNode`, `CallNode`, `MethodCallNode`, `JumpNode`, `ApprovalNode`, `ViewNode`, `CustomNode`), node detay paneli (`nodeDetail/`), form editörü (`webform/`). Context'ler: `FlowRuntimeContext`, `DnDContext`, `PipeletFilesContext`, `WebFormFilesContext`, `GotoContext`, `DagDebugContext`.

## `pipelets/` ve `webforms/` klasörleri

Repo kökündeki bu klasörler **örnek/geliştirme verisi**dir, extension tarafından zorunlu okunmuyor — `CartridgeExplorerProvider` sadece bu isimleri "tanınan cartridge alt klasörü" olarak kabul ediyor, geri kalan her yerde `vscode.workspace.findFiles('**/*.pipelet' | '**/*.webform')` glob taraması kullanılıyor.

## Geliştirme

```bash
npm run dev            # tüm hedefleri watch modda derle
npm run build           # production build (vscode:prepublish de bunu çağırır)
npm run compile          # sadece tip kontrolü (tsc --noEmit)
```

VSCode'da F5 ile Extension Development Host açılır.

## Bilinen boşluklar / açık işler

- **DAG debug — UI tetikleyicisi yok**: `DagDebugService`/`OrchestratorClient`/`SocketIoDagDebugBridge` breakpoint set/remove ve execution-state görselleştirmesini (paused/running/completed node halkaları, `webview-src/nodes/NodeRuntimeOverlay.tsx`) uçtan uca destekliyor; `DagCommandType` (`CONTINUE`/`PAUSE`/`STEP_OVER`/`STEP_INTO`/`STEP_OUT`) protokolü de var. Ama komut paletinde veya webview'da bunları tetikleyecek hiçbir buton/komut yok — `DagDebugContext.sendCommand()` hiçbir yerden çağrılmıyor.
- **`LocalDagDebugAgent.ts` hiç instantiate edilmiyor**: `.github/dag-flow-debugger-orchestration-instruction.md` spec'inin merkezi bileşeni olan port-9240 local agent HTTP sunucusu tamamen yazılmış ama kodun hiçbir yerinde `new LocalDagDebugAgent(...)` çağrısı yok — çalışmıyor.
- **`PipeletExplorerViewProvider.ts` ölü kod**: `reactdnd.pipeletExplorerView` viewType'ını `PipeletTreeViewProvider` ile paylaşıyor ama hiçbir yerde register edilmiyor; asıl aktif olan `PipeletTreeViewProvider`.
