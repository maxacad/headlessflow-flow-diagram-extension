# Node Tasarım Standardı — Design Spec

**Tarih:** 2026-08-18
**Kapsam:** Flow editor canvas'ındaki node bileşenlerinin görsel standardizasyonu ve node içi konfigürasyon UI'larının Node Detail paneline taşınması.
**Kapsam dışı:** MSdistributedDebugging eklentisinin bu projeye taşınması (ayrı spec + ayrı plan olarak sonra ele alınacak).

---

## 1. Problem

`webview-src/nodes/` altında üç ayrı görsel dil aynı anda yaşıyor:

1. **Referans dil** — `ProcessNode` (pipelet) ve `StartNode`: `NodeWrapper` içinde sol üstte `CellLabel`, şeffaf 64×64 `IconBox`, 64×64 gradient SVG glyph, `NodeRuntimeOverlay`, yanda kaynak rozeti.
2. **Uyumsuz dil** — `ScriptNode`, `LoopNode`, `StopNode`, `CustomNode`: `BaseNode`'un beyaz `NodeInner` kutusu, 26px stroke ikon, kutu içinde ortalanmış `NodeLabel` + `NodeSubtitle`, sol kenarda `accentColor` şeridi.
3. **Karma** — `DecisionNode`, `EndNode`, `ViewNode`, `CallNode`, `JumpNode`, `FunctionNode`: `BaseNode` + `transparentInner` ile 64×64 glyph, ama hâlâ ortalanmış label/subtitle ve kimi yerde ayrıca `CellLabel`.

Ayrıca konfigürasyon UI'ı node'ların içine gömülü: `MethodCallNode` (672 satır, tam bir HTTP istemcisi), `CallNode` picker'ı, `JumpNode` picker'ı, `ProcessNode` dropdown'u, `FunctionNode` `EndpointInfoPanel`'i. Bu hem canvas'ı kalabalıklaştırıyor hem de aynı konfigürasyonun iki yerden (node ve panel) düzenlenebilmesine yol açıyor.

Hedef: pipelet (`ProcessNode`) ve `StartNode` görselini **standart** kabul edip tüm node'ları ona çekmek, tüm detay/konfigürasyonu **Node Detail** paneline toplamak.

---

## 2. Ortak bileşen: `StandardNode`

Yeni dosya: `webview-src/nodes/StandardNode.tsx`.

```tsx
export type NodeTagTone = 'resource' | 'target' | 'method' | 'actor';

export interface NodeTag {
  text: string;
  tone: NodeTagTone;
  title?: string;   // hover tooltip (tam değer)
}

export interface StandardNodeProps {
  id: string;
  selected: boolean;
  label?: string;                 // CellLabel'da `${label} · ${id}`, yoksa sadece id
  glyph: React.ReactNode;         // 64×64 SVG
  handles: HandleDef[];
  rotation?: 0 | 90 | 180 | 270;
  tags?: NodeTag[];
  onDoubleClick?: React.MouseEventHandler<HTMLDivElement>;
  onMouseEnter?: React.MouseEventHandler<HTMLDivElement>;
  onMouseLeave?: React.MouseEventHandler<HTMLDivElement>;
  children?: React.ReactNode;     // yalnızca çalıştırma-zamanı overlay'leri (ör. Start popover)
}
```

### Render zinciri

```
NodeWrapper (240×160 hücre, pointer-events: none)
├── CellLabel            sol üst, 'Consolas' 9px, color #243447, opacity .5, max-width 130px
├── handles              rotation'a göre Top/Bottom/Left/RightHandle
├── IconBox              64×64, şeffaf, border-radius 12px, class="node-inner-box"
│   ├── glyph            64×64 SVG
│   └── NodeRuntimeOverlay nodeId={id}
├── ResourceTag[]        sağda dikey yığın
└── children
```

### Görsel kurallar (mevcut referanstan birebir)

- Seçili: `IconBox` üzerinde `outline: 4px solid #ff7105; outline-offset: 3px`.
- Hover: `NodeWrapper:hover .node-inner-box` → `outline: 4px solid #4283f4; outline-offset: 3px` (mevcut `NodeWrapper` kuralı korunur).
- Rotation: `IconBox`'a `transform: rotate(Ndeg)`, handle pozisyonları `rotatePosition()` ile döndürülür, `useUpdateNodeInternals(id)` rotation değişiminde çağrılır.
- `pointer-events`: `NodeWrapper` `none`; `.node-inner-box` ve `.node-handle` `all`.

### `ResourceTag`

Bugün iki isimle duran `ProcessNode.FileLabel` ve `ApprovalNode.FloatingTag` tek bileşende birleşir.

- Konum: `left: calc(50% + 36px)`, ilk rozet `top: calc(50% - 32px)`, sonrakiler 20px aralıkla aşağı.
- Ortak: `'Consolas'` 10px, `padding 2px 6px`, `border-radius 3px`, `background rgba(10,18,32,0.72)`, `pointer-events: none`, `white-space: nowrap`, `max-width: 180px`, taşarsa ellipsis.
- Tone → renk:

  | tone | color | border |
  |---|---|---|
  | `resource` | `#7ab4f5` | `rgba(66,131,244,0.22)` |
  | `target` | `#ffd066` | `rgba(230,160,32,0.30)` |
  | `method` | ilgili method rengi | aynı renk %30 alfa |
  | `actor` | `#c4b5fd` | `rgba(124,58,237,0.35)` |

### `BaseNode.tsx` sadeleşmesi

Silinir: `NodeInner`, `NodeIcon`, `NodeLabel`, `NodeSubtitle`, `BaseNode` bileşeni, `BaseNodeProps.accentColor`, `transparentInner`, `icon`, `label`, `subtitle`.

Kalır (`StandardNode`'un altyapısı olarak): `NodeWrapper`, `HandleDef`, `TopHandle`, `BottomHandle`, `LeftHandle`, `RightHandle`, `rotatePosition`, `resolveHandle`.

`CellLabel` ve `IconBox` bugün `ProcessNode`, `StartNode`, `ApprovalNode`, `FunctionNode` içinde kopyalanmış durumda; tek tanım olarak `StandardNode.tsx`'e taşınır ve kopyalar silinir.

---

## 3. Node başına hedef durum

| Node | Glyph | Rozetler | Node üstünde kalan etkileşim |
|---|---|---|---|
| `StartNode` | mevcut | — | Hover "Start" popover'ı **kalır** (çalıştırma aksiyonu) |
| `ProcessNode` | mevcut | `resource`: pipelet dosyası (+ handler) | pipelet dropdown'u **kalkar** |
| `CallNode` | mevcut | `target`: `flow › startNode` | picker **kalkar**; Ctrl+Click ile hedefe gitme **kalır** |
| `JumpNode` | mevcut | `target`: hedef node etiketi | picker **kalkar**; Ctrl+Click ile hedefe gitme **kalır** |
| `ApprovalNode` | mevcut | `actor`: `U:`/`G:` + ad, `resource`: webform | değişiklik yok (zaten standart) |
| `FunctionNode` | mevcut | `resource`: endpoint yolu | `EndpointInfoPanel` **kalkar** |
| `MethodCallNode` | **yeni** | `method`: `GET /path`, auth varsa `actor`: `auth` | tüm HTTP UI (`Panel`, param formu, `RunButton`, `ResponseBox`, token butonu) **kalkar** |
| `DecisionNode` | mevcut | — | — |
| `EndNode` | mevcut | — | — |
| `ViewNode` | mevcut | — | — |
| `ScriptNode` | **yeni** | — | — |
| `LoopNode` | **yeni** | — | — |
| `StopNode` | **yeni** | — | — |
| `JoinNode` | **yeni** | — | — |
| `CustomNode` | **yeni** | — | bağlantı sürükleme durumuna göre glyph değişimi **kalır** |

`DecisionNode`'un `DiamondInner` sarmalayıcısı kalkar — glyph zaten baklava biçimli çizilmiş durumda, ek 45° rotasyona gerek yok.

`JoinNode` özel bir durum: 28px `JoinPoint` dairesi ve merkez handle semantiği (`connectionCount`) korunur, ancak `JoinPoint` 64×64 `IconBox` içine yerleştirilir ve `CellLabel` kazanır; böylece seçim/hover davranışı diğerleriyle aynılaşır.

---

## 4. Node Detail panelinin genişlemesi

### 4.1 Payload

`NodeDetailPayload` tek bir `context` alanıyla büyür ve mevcut `webformFiles` / `pipeletFiles` alanları oraya taşınır:

```ts
export interface NodeDetailContext {
  // workspace kaynaklı — NodeDetailViewProvider doldurur
  pipeletFiles?: PipeletDetailEntry[];
  webformFiles?: Array<{ name: string; uri: string }>;
  // doküman kaynaklı — FlowEditorProvider doldurur
  flowNodes?: Array<{ id: string; label: string; nodeType: string }>;
  flows?: Array<{ name: string; startNodes: Array<{ id: string; label: string }> }>;
}

export interface NodeDetailPayload {
  id: string;
  nodeType: string;
  data: Record<string, unknown>;
  context?: NodeDetailContext;
}
```

Doldurma sorumluluğu net ayrışır:

- **`FlowEditorProvider`** dokümanı bilir → `node-selected` mesajını işlerken `nodeType`'a göre `flowNodes` (jump) ve `flows` (call) doldurup `showNode()`'a geçirir.
- **`NodeDetailViewProvider`** workspace'i bilir → bugünkü gibi `pipeletFiles` (process) ve `webformFiles` (approval) doldurur.

`request-flow-start-nodes` / `flow-start-nodes-response` mesaj turu tamamen kalkar (tek tüketicisi `CallNode` picker'ıydı).

### 4.2 Yeni formlar

`webview-src/nodeDetail/App.tsx` içinde üç yeni form; `NodeDetailApp` yönlendirmesi genişler:

- **`CallForm`** — `context.flows` üzerinden flow ve start node seçimi (gruplanmış dropdown). Kaydettiğinde `callTarget: { flow, nodeId, label }` ve `subtitle` yazar (bugünkü `CallNode.handleSelect` mantığı birebir taşınır).
- **`JumpForm`** — `context.flowNodes` üzerinden hedef node seçimi. `jumpTargetId` yazar.
- **`MethodCallForm`** — `MethodCallNode`'dan taşınan tam UI: method + URL başlığı, path/query/header parametre alanları (`InBadge` ile `in` göstergesi, zorunlu alan yıldızı), body textarea, "Run" butonu, response gösterimi (status rengi + gövde), tespit edilen token'ı kaydetme butonu, auth uyarı bandı.

`GenericNodeForm`'daki `NODE_FIELD_CONFIG`'ten `call` ve `jump` satırları kalkar (artık kendi formları var).

### 4.3 HTTP çalıştırma relay'i

Panel ayrı bir webview olduğu için `MethodCallForm`'un istekleri eklenti host'una ulaşmalı. Mesaj ping-pong yerine `FlowEditorProvider` kendini bir host arayüzüyle kaydeder:

```ts
export interface FlowHost {
  executeHttpCall(req: HttpCallRequest): Promise<{ status: number; body: string }>;
  getApiToken(baseUrl: string): Promise<string | undefined>;
  storeApiToken(baseUrl: string, token: string): Promise<void>;
}
```

`NodeDetailViewProvider.setFlowHost(host)` — `showNode()` çağrısında `flowWebview` ile birlikte geçirilir. Panelden gelen `http-call-execute` / `request-api-token` / `store-api-token` mesajları bu host üzerinden karşılanır.

`FlowEditorProvider.ts:284-310`'daki mevcut işleyiciler **yerinde kalır**; sadece gövdeleri `FlowHost` metotlarına çıkarılır ve mesaj işleyicileri o metotları çağırır. Böylece HTTP çalıştırma mantığının ikinci bir kopyası oluşmaz.

### 4.4 Canlı güncelleme

Mevcut `save-node` → `update-node-data` akışı korunur: panel kaydettiğinde `NodeDetailViewProvider` hem `.nodeconfig/<id>.json`'a yazar hem de aktif flow webview'ine `update-node-data` gönderir. Canvas'taki rozetler bu veriden türediği için anında güncellenir.

---

## 5. Yeni glyph'ler

Üretilecek 64×64 SVG'ler: `ScriptNode`, `LoopNode`, `StopNode`, `JoinNode`, `CustomNode`, `MethodCallNode`. `CustomNode` iki glyph alır — bugünkü `isTarget` ayrımı (bağlantı hedefi / bağlantı kaynağı) korunur.

Palet — mevcut glyph'lerden (`CallNode`, `ViewNode`, `EndNode`, `DecisionNode`) çıkarılmış:

| Rol | Değer |
|---|---|
| Gövde gradyanı | `#FFDC87` → `#EEC04E` |
| Gövde alternatifi | `#FFD485` → `#F3BF3E` |
| Mavi aksan | `#6695FF` → `#47ADC6` (veya `#426DB8` → `#47ADC6`) |
| Turuncu gölge/derinlik | `#FFA800`, `#FF9B01`, `#FAAB34` |
| Açık iç yüzey | `#FFF7D9`, `#FEF4DC`, `#F5E4B8` |
| Kontur | `stroke #333333`, `width 1`, `linejoin bevel`, `linecap round` |

Kurallar:

- `viewBox="0 0 64 64"`, `width/height` 64, içerik `translate(7, 7.4)` ile ~50×50 alana yerleşir (mevcut glyph'lerin ortak yerleşimi).
- Gradient / filter / `<g id>` tanımlarının `id`'leri node adıyla öneklenir (`ScriptNode_Gradient_1` gibi) — aynı sayfada birden çok SVG olduğu için çakışma önlenir.
- `MethodCallNode` glyph'i sarı gövdeli kalır; method rengi (`METHOD_COLOR`) yalnızca `method` tonlu rozete ve glyph üzerindeki ince bir aksan şeridine uygulanır, böylece node ailenin içinde durur.

---

## 6. Etkilenen dosyalar

**Yeni:**
- `webview-src/nodes/StandardNode.tsx`

**Yeniden yazılan:**
- `webview-src/nodes/BaseNode.tsx` (sadeleşir)
- 15 node bileşeni: `Approval`, `Call`, `Custom`, `Decision`, `End`, `Function`, `Join`, `Jump`, `Loop`, `MethodCall`, `Process`, `Script`, `Start`, `Stop`, `View`
- `webview-src/nodeDetail/App.tsx`

**Değişen:**
- `src/NodeDetailViewProvider.ts` (`context` alanı, `FlowHost`, yeni mesaj işleyicileri)
- `src/FlowEditorProvider.ts` (`FlowHost` implementasyonu, `node-selected` payload zenginleştirmesi, `request-flow-start-nodes` kaldırılması)
- `webview-src/App.tsx` (`onNodeClick`, kaldırılan mesaj turları)

**Silinen:**
- Kaldırılan bileşenlere ait `webview-src/**/*.d.ts` build çıktıları (repoda izleniyor, `.gitignore`'da değil)

Net satır beklentisi negatif: `MethodCallNode` 672 → ~90, `CallNode` 342 → ~90, `FunctionNode` 271 → ~70, `ProcessNode` 217 → ~80.

---

## 7. Doğrulama

Repoda otomatik test altyapısı yok (`jest`/`vitest`/`mocha` bağımlılığı ve `test` script'i bulunmuyor). Bu spec test altyapısı kurmayı kapsam dışı bırakır. Doğrulama:

1. `npm run compile` — `tsc -p tsconfig.json --noEmit` hatasız geçmeli.
2. `npm run build` — webpack'in dört config'i (extension, webview, nodeDetail, webform) hatasız derlenmeli.
3. Manuel görsel kontrol: eklenti çalıştırılır, bir `.flow` dosyası açılır, 15 node bileşeninin her biri canvas'a bırakılıp şu maddeler doğrulanır:
   - Sol üstte `label · id` etiketi var.
   - Glyph 64×64 ve şeffaf zeminde; beyaz kutu yok.
   - Seçilince turuncu (`#ff7105`), hover'da mavi (`#4283f4`) outline.
   - Node üstünde form/picker/panel açılmıyor.
   - Node'a tıklayınca Node Detail paneli o node'un formunu gösteriyor.
   - Panelde yapılan değişiklik kaydedilince canvas'taki rozet anında güncelleniyor.
4. `MethodCallForm` için: bir OpenAPI endpoint'i node'a bağlanır, panelden parametre girilip "Run" çalıştırılır, response panelde görünür; token kaydetme çalışır.
