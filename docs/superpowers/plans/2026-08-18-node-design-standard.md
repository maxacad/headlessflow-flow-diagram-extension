# Node Tasarım Standardı Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Flow editor canvas'ındaki 15 node bileşenini tek bir görsel standarda (`ProcessNode`/`StartNode` dili) çekmek ve node içine gömülü tüm konfigürasyon UI'ını Node Detail paneline taşımak.

**Architecture:** Yeni bir `StandardNode` bileşeni tüm node'ların ortak kabuğu olur (CellLabel + şeffaf 64×64 IconBox + glyph + runtime overlay + kaynak rozetleri). Node'lar salt görsel hale gelir; picker ve HTTP çalıştırma gibi her şey Node Detail paneline taşınır. Panel, ihtiyaç duyduğu veriyi genişletilmiş bir `NodeDetailPayload.context` alanından alır; doküman kaynaklı veriyi `FlowEditorProvider`, workspace kaynaklı veriyi `NodeDetailViewProvider` doldurur. HTTP çalıştırma mantığı `FlowHost` arayüzüyle tek yerde kalır.

**Tech Stack:** TypeScript, React 18, `@xyflow/react` v12, `styled-components` v6, `@vscode/webview-ui-toolkit`, webpack (4 config: extension / webview / nodeDetail / webform), VS Code Extension API.

**Spec:** `docs/superpowers/specs/2026-08-18-node-design-standard-design.md`

## Global Constraints

- **Test altyapısı yok.** Repoda `jest`/`vitest`/`mocha` bağımlılığı ve `test` script'i bulunmuyor; spec bunu açıkça kapsam dışı bıraktı. Bu yüzden her task'ın döngüsü "kırmızı test → yeşil test" yerine **tip denetimi + derleme + görsel doğrulama**. Task adımlarında komutlar birebir yazılıdır; test uydurmayın.
- **Webview şu an hiç typecheck edilmiyor — bu planla düzeliyor.** İki ayrı gerçek var:
  - `npm run compile` (`tsc -p tsconfig.json --noEmit`) yalnızca `src/**`'i denetler; `tsconfig.json` `webview-src`'i **exclude** ediyor. Yani `webview-src/nodes/*` bu komutla hiç görülmez.
  - `webpack.config.js`'teki `ts-loader` `transpileOnly: true` ile çalışıyor, yani `npm run build` de tip hatası yakalamaz.

  Bu yüzden Task 1'de `package.json`'a `typecheck:webview` script'i eklenir ve **her webview task'ında çalıştırılır**. Uzantı tarafı (`src/**`) için `npm run compile` geçerliliğini korur.
- **Taban (baseline): sıfır hata.** Bu planın worktree'sinde `npm install` `package-lock.json`'a uyduğu için `@xyflow/react` **12.10.2** kuruludur ve `npm run typecheck:webview` **hiç hata vermez**. Doğrulama adımlarında beklenen sonuç budur: **herhangi bir hata sizin değişikliğinizden gelmiştir.**

  Uyarı: ana çalışma ağacının `node_modules`'ünde sürüm 12.11.0'a kaymış durumda (repoda hem `package-lock.json` hem `yarn.lock` var) ve 12.11.0 daha katı `OnNodeDrag` tiplemesiyle `App.tsx` 1173/1174/1175'te 3 hata üretiyor. Bu plan kapsamı dışı — **`App.tsx`'e dokunmayın**; lockfile sürümüyle çalışın.

- **`webview-src/App.tsx` değişmiyor.** Spec §6 bu dosyayı "değişen" arasında saymıştı ama incelemede değişiklik gerekmediği görüldü: `onNodeClick`'teki Ctrl+Click goto mantığı olduğu gibi kalır, `nodeTypes` registry'si aynıdır, `update-node-data` dinleyicisi korunur. Kaldırılan mesaj turlarının (`request-flow-start-nodes` / `flow-start-nodes-response`) gönderici ve dinleyicisi `CallNode` içindeydi, `App.tsx`'te değil. Bu dosyaya dokunmayın.
- **Seçim outline'ı:** `outline: 4px solid #ff7105; outline-offset: 3px` — sadece `IconBox` üzerinde.
- **Hover outline'ı:** `outline: 4px solid #4283f4; outline-offset: 3px` — `NodeWrapper:hover .node-inner-box` kuralından gelir; her node'un tıklanabilir kutusu `className="node-inner-box"` taşımalı.
- **Glyph boyutu:** her zaman `width=64 height=64 viewBox="0 0 64 64"`, içerik `transform="translate(7 7.4)"` ile ~50×50 alana yerleşir.
- **SVG id çakışması:** her `linearGradient`, `filter`, `g id` node adıyla öneklenir (`ScriptNode_Gradient_1`). Aynı DOM'da onlarca SVG olduğu için öneksiz id'ler birbirini ezer.
- **Palet** (mevcut glyph'lerden çıkarıldı, bunun dışına çıkılmaz):

  | Rol | Değer |
  |---|---|
  | Gövde gradyanı | `#FFDC87` → `#EEC04E` |
  | Gövde alternatifi | `#FFD485` → `#F3BF3E` |
  | Mavi aksan | `#6695FF` → `#47ADC6` |
  | Turuncu derinlik | `#FFA800`, `#FF9B01`, `#FAAB34` |
  | Açık iç yüzey | `#FFF7D9`, `#FEF4DC`, `#F5E4B8` |
  | Kontur | `stroke="#333333" strokeWidth="1" strokeLinejoin="bevel" strokeLinecap="round"` |

- **Rozet tonları:** `resource` `#7ab4f5`, `target` `#ffd066`, `method` method rengi, `actor` `#c4b5fd`.
- **Commit:** her task sonunda tek commit, Türkçe gövde, `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>` satırıyla biter.

## Task Ordering

`StandardNode` (Task 1) önce gelir. Task 2–6 node'ları tek tek ona geçirir; `BaseNode`'un eski API'si bu süre boyunca yaşamaya devam eder, böylece her task sonunda proje derlenir. Task 7 panel altyapısını kurar, Task 8–9 picker'ları ve HTTP UI'ını panele taşır. Task 10 ölü kodu siler.

---

### Task 1: `StandardNode` ortak bileşeni

**Files:**
- Create: `webview-src/nodes/StandardNode.tsx`
- Modify: `webview-src/nodes/BaseNode.tsx` (yalnızca `export` eklemek)
- Modify: `package.json` (`typecheck:webview` script'i)

**Interfaces:**
- Consumes: `NodeWrapper`, `HandleDef`, `TopHandle`, `BottomHandle`, `LeftHandle`, `RightHandle` — `./BaseNode`; `NodeRuntimeOverlay` — `./NodeRuntimeOverlay`
- Produces: `StandardNode`, `StandardNodeProps`, `NodeTag`, `NodeTagTone`, `CellLabel`, `IconBox` — hepsi `./StandardNode`'dan export edilir. Task 2–9 bunları kullanır.

- [ ] **Step 1: `BaseNode.tsx`'teki rotation yardımcılarını export et**

`webview-src/nodes/BaseNode.tsx` içinde iki fonksiyon şu an dosya-yerel. Başlarına `export` ekle (gövdeleri değişmez):

```tsx
export function rotatePosition(pos: Position, steps: number): Position {
  const idx = POSITION_ORDER.indexOf(pos);
  if (idx === -1) return pos;
  return POSITION_ORDER[(idx + steps + 4) % 4];
}

export function resolveHandle(pos: Position) {
  switch (pos) {
    case Position.Top:    return TopHandle;
    case Position.Bottom: return BottomHandle;
    case Position.Right:  return RightHandle;
    case Position.Left:   return LeftHandle;
    default:              return Handle;
  }
}
```

- [ ] **Step 2: `StandardNode.tsx`'i oluştur**

```tsx
import React, { useEffect } from 'react';
import { Position, useUpdateNodeInternals } from '@xyflow/react';
import styled, { css } from 'styled-components';
import {
  NodeWrapper,
  HandleDef,
  rotatePosition,
  resolveHandle,
} from './BaseNode';
import { NodeRuntimeOverlay } from './NodeRuntimeOverlay';

// -- Types --------------------------------------------------------------------

export type NodeTagTone = 'resource' | 'target' | 'method' | 'actor';

export interface NodeTag {
  /** Rozet metni */
  text: string;
  tone: NodeTagTone;
  /** Hover tooltip - tam deger, metin kisaltildiginda ise yarar */
  title?: string;
  /** Yalnizca tone === 'method' icin: HTTP method rengi */
  color?: string;
}

export interface StandardNodeProps {
  id: string;
  selected: boolean;
  /** CellLabel'da `${label} - ${id}`; yoksa yalnizca id */
  label?: string;
  /** 64x64 SVG */
  glyph: React.ReactNode;
  handles: HandleDef[];
  rotation?: 0 | 90 | 180 | 270;
  tags?: NodeTag[];
  onDoubleClick?: React.MouseEventHandler<HTMLDivElement>;
  onMouseEnter?: React.MouseEventHandler<HTMLDivElement>;
  onMouseLeave?: React.MouseEventHandler<HTMLDivElement>;
  /** Yalnizca calisma-zamani overlay'leri (or. StartNode'un Start popover'i) */
  children?: React.ReactNode;
}

// -- Tone paleti --------------------------------------------------------------

const TAG_TONE: Record<NodeTagTone, { color: string; border: string }> = {
  resource: { color: '#7ab4f5', border: 'rgba(66,131,244,0.22)' },
  target:   { color: '#ffd066', border: 'rgba(230,160,32,0.30)' },
  method:   { color: '#c8d8ee', border: 'rgba(200,216,238,0.30)' },
  actor:    { color: '#c4b5fd', border: 'rgba(124,58,237,0.35)' },
};

// -- Styled primitives --------------------------------------------------------

/** Node'un sol ustundeki kimlik etiketi */
export const CellLabel = styled.div`
  position: absolute;
  top: 4px;
  left: 5px;
  font-family: 'Consolas', 'Courier New', monospace;
  font-size: 9px;
  font-weight: 400;
  color: #243447;
  opacity: 0.5;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 130px;
  pointer-events: none;
  user-select: none;
  letter-spacing: 0.2px;
`;

/** Glyph'i saran 64x64 seffaf kutu - secim ve hover outline'i buraya biner */
export const IconBox = styled.div<{ $selected: boolean; $rotation: number }>`
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 64px;
  height: 64px;
  border-radius: 12px;
  transform: ${({ $rotation }) => ($rotation ? `rotate(${$rotation}deg)` : 'none')};

  ${({ $selected }) =>
    $selected &&
    css`
      outline: 4px solid #ff7105;
      outline-offset: 3px;
    `}
`;

const ResourceTag = styled.div<{ $color: string; $border: string; $index: number }>`
  position: absolute;
  left: calc(50% + 36px);
  top: calc(50% - 32px + ${({ $index }) => $index * 20}px);
  font-family: 'Consolas', 'Courier New', monospace;
  font-size: 10px;
  font-weight: 500;
  color: ${({ $color }) => $color};
  background: rgba(10, 18, 32, 0.72);
  border: 1px solid ${({ $border }) => $border};
  border-radius: 3px;
  padding: 2px 6px;
  max-width: 180px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  letter-spacing: 0.2px;
  pointer-events: none;
  user-select: none;
`;

// -- Component ----------------------------------------------------------------

export function StandardNode({
  id,
  selected,
  label,
  glyph,
  handles,
  rotation,
  tags,
  onDoubleClick,
  onMouseEnter,
  onMouseLeave,
  children,
}: StandardNodeProps) {
  const rot = rotation ?? 0;
  const rotSteps = rot / 90;
  const updateNodeInternals = useUpdateNodeInternals();

  useEffect(() => {
    updateNodeInternals(id);
  }, [id, rotation, updateNodeInternals]);

  return (
    <NodeWrapper
      onDoubleClick={onDoubleClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <CellLabel>{label ? `${label} · ${id}` : id}</CellLabel>

      {handles.map((h) => {
        const rotatedPos = rotatePosition(h.position, rotSteps);
        const StyledHandle = resolveHandle(rotatedPos);
        return (
          <StyledHandle
            key={h.id}
            type={h.type}
            position={rotatedPos}
            id={h.id}
            className="node-handle"
          />
        );
      })}

      <IconBox className="node-inner-box" $selected={selected} $rotation={rot}>
        {glyph}
        <NodeRuntimeOverlay nodeId={id} />
      </IconBox>

      {(tags ?? []).map((tag, i) => {
        const tone = TAG_TONE[tag.tone];
        const color = tag.tone === 'method' && tag.color ? tag.color : tone.color;
        const border = tag.tone === 'method' && tag.color ? `${tag.color}4d` : tone.border;
        return (
          <ResourceTag
            key={`${tag.tone}-${i}`}
            $color={color}
            $border={border}
            $index={i}
            title={tag.title ?? tag.text}
          >
            {tag.text}
          </ResourceTag>
        );
      })}

      {children}
    </NodeWrapper>
  );
}
```

Not: `CellLabel` içindeki ayırıcı `·` (orta nokta) olarak yazıldı; mevcut `ProcessNode`/`StartNode` kodundaki `·` karakteriyle aynıdır.

- [ ] **Step 3: `typecheck:webview` script'ini ekle**

`package.json`'ın `scripts` bloğuna ekle. `tsconfig.webview.json` `composite: true` taşıdığı için `--noEmit` kullanılamaz; bunun yerine çıktı çöp bir dizine yönlendirilir:

```json
    "typecheck:webview": "tsc -p tsconfig.webview.json --outDir node_modules/.cache/tscheck-webview",
```

Bu, `webview-src` altındaki `.d.ts` dosyalarının kaynak ağacına sızmasını da engeller — bugün repoda izlenen bayat `.d.ts` dosyaları tam da `outDir`'siz bir `tsc` çalıştırmasından kalmadır (Task 10 Step 3 onları temizler).

- [ ] **Step 4: Tip denetiminin geçtiğini doğrula**

```bash
npm run typecheck:webview
```

Beklenen: **hiç hata yok** (Global Constraints'teki sıfır-hata tabanı). `StandardNode.tsx` veya `BaseNode.tsx` kaynaklı bir hata çıkarsa düzeltin.

- [ ] **Step 5: Commit**

```bash
git add webview-src/nodes/StandardNode.tsx webview-src/nodes/BaseNode.tsx package.json
git commit -m "feat: StandardNode ortak node kabugu

CellLabel + seffaf 64x64 IconBox + glyph + runtime overlay + kaynak
rozeti yigini tek bilesende topluyor. ProcessNode/StartNode gorsel
dilini tum node'lara yayabilmek icin temel.

Webview su ana kadar hic typecheck edilmiyordu (tsconfig.json
webview-src'i exclude ediyor, ts-loader transpileOnly). Bunun icin
typecheck:webview script'i eklendi.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: Glyph'i hazır, etkileşimsiz node'lar

`DecisionNode`, `EndNode`, `ViewNode` — üçü de zaten 64×64 glyph'e sahip, `BaseNode` + `transparentInner` kullanıyor. Yapılacak: `StandardNode`'a geçir, ortalanmış label/subtitle yerine `CellLabel` gelsin, `DecisionNode`'un gereksiz `DiamondInner` sarmalayıcısı kalksın.

**Files:**
- Modify: `webview-src/nodes/DecisionNode.tsx`
- Modify: `webview-src/nodes/EndNode.tsx`
- Modify: `webview-src/nodes/ViewNode.tsx`

**Interfaces:**
- Consumes: `StandardNode` (Task 1), `HandleDef` (`./BaseNode`)
- Produces: yok (bu node'ların dış API'si `NodeProps` ile sabit)

- [ ] **Step 1: `DecisionNode.tsx`'i dönüştür**

Mevcut `Icon` fonksiyonunu **olduğu gibi bırak** (SVG bloğu). `DiamondInner` styled bileşenini sil — glyph zaten baklava biçimli, üstüne CSS rotasyonu binmemeli. Dosyanın geri kalanı:

```tsx
import React from 'react';
import { NodeProps, Node, Position } from '@xyflow/react';
import { StandardNode } from './StandardNode';
import type { HandleDef } from './BaseNode';

const handles: HandleDef[] = [
  { type: 'target', position: Position.Top,    id: 'input' },
  { type: 'source', position: Position.Bottom, id: 'yes'   },
  { type: 'source', position: Position.Right,  id: 'no'    },
];

// ... Icon tanimi burada, degismeden ...

interface Data { label: string; subtitle?: string; [k: string]: unknown }

export const DecisionNode: React.FC<NodeProps<Node<Data>>> = ({ data, selected, id }) => (
  <StandardNode
    id={id}
    selected={selected}
    label={data?.label || 'Decision'}
    glyph={<Icon />}
    handles={handles}
    rotation={data?.rotation as 0 | 90 | 180 | 270 | undefined}
  />
);
```

Artık kullanılmayan importları sil: `styled` (`styled-components`), `BaseNode`, `NodeInner`, `NodeIcon`, `NodeLabel`, `NodeSubtitle`, `NodeWrapper`, `BottomHandle`, `RightHandle`, `TopHandle`. Kullanılmayan `ACCENT` sabitini de sil.

- [ ] **Step 2: `EndNode.tsx`'i dönüştür**

`Icon` fonksiyonunu olduğu gibi bırak. Gerisi:

```tsx
import React from 'react';
import { NodeProps, Node, Position } from '@xyflow/react';
import { StandardNode } from './StandardNode';
import type { HandleDef } from './BaseNode';

const handles: HandleDef[] = [
  { type: 'target', position: Position.Top, id: 'input' },
];

// ... Icon tanimi burada, degismeden ...

interface Data { label: string; subtitle?: string; [k: string]: unknown }

export const EndNode: React.FC<NodeProps<Node<Data>>> = ({ data, selected, id }) => (
  <StandardNode
    id={id}
    selected={selected}
    label={data?.label || 'End'}
    glyph={<Icon />}
    handles={handles}
    rotation={data?.rotation as 0 | 90 | 180 | 270 | undefined}
  />
);
```

`ACCENT` sabitini ve `BaseNode` bileşen importunu sil.

- [ ] **Step 3: `ViewNode.tsx`'i dönüştür**

`Icon` fonksiyonunu olduğu gibi bırak. Gerisi:

```tsx
import React from 'react';
import { NodeProps, Node, Position } from '@xyflow/react';
import { StandardNode } from './StandardNode';
import type { HandleDef } from './BaseNode';

const handles: HandleDef[] = [
  { type: 'target', position: Position.Top,    id: 'input'  },
  { type: 'source', position: Position.Bottom, id: 'output' },
];

// ... Icon tanimi burada, degismeden ...

interface Data { label: string; subtitle?: string; [k: string]: unknown }

export const ViewNode: React.FC<NodeProps<Node<Data>>> = ({ data, selected, id }) => (
  <StandardNode
    id={id}
    selected={selected}
    label={data?.label || 'View'}
    glyph={<Icon />}
    handles={handles}
    rotation={data?.rotation as 0 | 90 | 180 | 270 | undefined}
  />
);
```

`ACCENT` sabitini ve `BaseNode` bileşen importunu sil.

- [ ] **Step 4: Derle ve görsel doğrula**

```bash
npm run typecheck:webview && npm run build:webview
```

Beklenen: `typecheck:webview` hic hata vermemeli (sifir-hata tabani) ve webpack derlemesi hatasiz bitmeli.

Eklentiyi çalıştır (`F5` → Extension Development Host), bir `.flow` dosyası aç, Decision / End / View node'larını canvas'a bırak ve doğrula:
- Sol üstte `label · id` etiketi var.
- Beyaz kutu yok; glyph şeffaf zeminde.
- Seçince turuncu `#ff7105`, hover'da mavi `#4283f4` outline.
- Decision node'unun glyph'i **eğik değil** (DiamondInner kalktı), handle'ları hâlâ üst/alt/sağda.

- [ ] **Step 5: Commit**

```bash
git add webview-src/nodes/DecisionNode.tsx webview-src/nodes/EndNode.tsx webview-src/nodes/ViewNode.tsx
git commit -m "refactor: Decision/End/View node'larini StandardNode'a gecir

Ortalanmis label/subtitle yerine CellLabel geldi. DecisionNode'un
gereksiz DiamondInner sarmalayicisi kaldirildi - glyph zaten baklava
biciminde cizili.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: Zaten standarda yakın node'lar

`StartNode`, `ProcessNode`, `ApprovalNode` — üçü de `CellLabel` + `IconBox`'ı kendi içinde kopyalamış durumda. Yapılacak: kopyaları silip `StandardNode`'a geçir, `ProcessNode`'un pipelet dropdown'unu kaldır, rozetleri `tags` prop'una taşı.

**Files:**
- Modify: `webview-src/nodes/StartNode.tsx`
- Modify: `webview-src/nodes/ProcessNode.tsx`
- Modify: `webview-src/nodes/ApprovalNode.tsx`

**Interfaces:**
- Consumes: `StandardNode`, `NodeTag` (Task 1); `usePipeletFiles` — `../context/PipeletFilesContext`
- Produces: `APPROVAL_OUTCOMES` — `./ApprovalNode`'dan export edilmeye devam eder (mevcut tüketicileri korunur)

- [ ] **Step 1: `StartNode.tsx`'i dönüştür**

`Icon`, `Popover`, `PopoverBtn`, `popoverIn` tanımlarını **olduğu gibi bırak** — Start popover'ı bir çalıştırma aksiyonu, konfigürasyon değil, node üzerinde kalır. `CellLabel`, `IconBox`, `sourceHandleFor`, `normalizeRotation` yerel tanımlarını sil (ilk ikisi artık `StandardNode`'da, son ikisi `StandardNode`'un rotation mantığıyla gereksiz). Bileşen:

```tsx
import React, { useState } from 'react';
import type { SVGProps } from 'react';
import { NodeProps, Node, Position } from '@xyflow/react';
import styled, { keyframes } from 'styled-components';
import { StandardNode } from './StandardNode';
import type { HandleDef } from './BaseNode';
import vscodeApi from '../vscodeApi';

const handles: HandleDef[] = [
  { type: 'source', position: Position.Bottom, id: 'output' },
];

// ... popoverIn / Popover / PopoverBtn / Icon tanimlari burada, degismeden ...

interface Data { label: string; subtitle?: string; [k: string]: unknown }

export const StartNode: React.FC<NodeProps<Node<Data>>> = ({ data, selected, id }) => {
  const [hovered, setHovered] = useState(false);

  const handleStart = (e: React.MouseEvent) => {
    e.stopPropagation();
    vscodeApi?.postMessage({ type: 'start-flow', nodeId: id });
  };

  return (
    <StandardNode
      id={id}
      selected={selected}
      label={data?.label}
      glyph={<Icon />}
      handles={handles}
      rotation={data?.rotation as 0 | 90 | 180 | 270 | undefined}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {hovered && (
        <Popover>
          <PopoverBtn onClick={handleStart}>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <polygon points="2,1 11,6 2,11" fill="#4caf50" />
            </svg>
            Start
          </PopoverBtn>
        </Popover>
      )}
    </StandardNode>
  );
};
```

Not: eski kod rotasyonu elle `sourceHandleFor` ile çözüyordu; `StandardNode` bunu `rotatePosition` ile yapıyor ve davranış aynıdır (`Bottom` → 90°'de `Left`, 180°'de `Top`, 270°'de `Right`). Kullanılmayan `ACCENT` sabitini sil.

- [ ] **Step 2: `ProcessNode.tsx`'i dönüştür**

`Icon` tanımını olduğu gibi bırak. Sil: `IconBox`, `CellLabel`, `FileLabel`, `Dropdown`, `DropdownHeader`, `DropdownItem` styled bileşenleri ve dropdown state'i (`isOpen`, `closeTimerRef`, `openDropdown`, `scheduleClose`, `handleSelect`). Pipelet seçimi artık yalnızca panelden yapılır.

```tsx
import React from 'react';
import type { SVGProps } from 'react';
import { NodeProps, Node, Position } from '@xyflow/react';
import { StandardNode, type NodeTag } from './StandardNode';
import type { HandleDef } from './BaseNode';
import { usePipeletFiles } from '../context/PipeletFilesContext';

const handles: HandleDef[] = [
  { type: 'target', position: Position.Top,    id: 'input'  },
  { type: 'source', position: Position.Bottom, id: 'output' },
  { type: 'source', position: Position.Right,  id: 'error'  },
];

// ... Icon tanimi burada, degismeden ...

interface Data {
  label: string;
  subtitle?: string;
  pipeletFile?: string;
  pipeletHandler?: string;
  pipeletSkill?: string;
  pipeletAi?: Record<string, unknown>;
  pipeletInputs?: Record<string, string>;
  pipeletOutputs?: Record<string, string>;
  [k: string]: unknown;
}

export const ProcessNode: React.FC<NodeProps<Node<Data>>> = ({ selected, id, data }) => {
  const files = usePipeletFiles();

  const pipeletFile = data?.pipeletFile;
  const pipeletMeta = files.find((file) => file.name === pipeletFile);
  const pipeletLabel = pipeletMeta?.handler ?? data?.pipeletHandler ?? pipeletFile;

  const tags: NodeTag[] = [];
  if (pipeletFile) {
    const text = pipeletLabel && pipeletLabel !== pipeletFile
      ? `${pipeletFile} · ${pipeletLabel}`
      : pipeletFile;
    tags.push({ text, tone: 'resource', title: text });
  }

  return (
    <StandardNode
      id={id}
      selected={selected}
      label={data?.label}
      glyph={<Icon />}
      handles={handles}
      rotation={data?.rotation as 0 | 90 | 180 | 270 | undefined}
      tags={tags}
    />
  );
};
```

- [ ] **Step 3: `ApprovalNode.tsx`'i dönüştür**

`BG`, `Badge`, `UserIcon`, `GroupIcon` ve `APPROVAL_OUTCOMES` tanımlarını olduğu gibi bırak. Sil: `IconBox`, `CellLabel`, `FloatingTag`, `ACCENT`.

`ApprovalNode`'un altı handle'ı özel konumlandırılmış (`HInput`, `HApproved`, `HRejected`, `HFeedback`, `HInfoReq`, `HEscalated` — hepsi `styled(Handle)` ile ofsetlenmiş). `StandardNode`'un `handles` prop'u bu ofsetleri ifade edemez, bu yüzden **bu styled handle'lar korunur** ve `StandardNode`'a `handles={[]}` verilip handle'lar `children` içinde render edilir:

```tsx
import React from 'react';
import type { SVGProps } from 'react';
import { Handle, NodeProps, Node, Position } from '@xyflow/react';
import styled from 'styled-components';
import { StandardNode, type NodeTag } from './StandardNode';

export const APPROVAL_OUTCOMES = [ /* ... degismeden ... */ ];

// ... BG / Badge / UserIcon / GroupIcon tanimlari burada, degismeden ...
// ... HInput / HApproved / HRejected / HFeedback / HInfoReq / HEscalated, degismeden ...

interface Data {
  label: string;
  subtitle?: string;
  assigneeType?: 'user' | 'group';
  assigneeName?: string;
  webFormFile?: string;
  [k: string]: unknown;
}

export const ApprovalNode: React.FC<NodeProps<Node<Data>>> = ({ selected, id, data }) => {
  const assigneeType = data?.assigneeType ?? 'user';
  const assigneeName = data?.assigneeName ?? '';
  const webFormFile  = data?.webFormFile  ?? '';

  const tags: NodeTag[] = [];
  if (assigneeName) {
    const text = `${assigneeType === 'user' ? 'U:' : 'G:'} ${assigneeName}`;
    tags.push({ text, tone: 'actor', title: text });
  }
  if (webFormFile) {
    tags.push({ text: webFormFile, tone: 'resource', title: webFormFile });
  }

  return (
    <StandardNode
      id={id}
      selected={selected}
      label={data?.label}
      glyph={assigneeType === 'group' ? <GroupIcon /> : <UserIcon />}
      handles={[]}
      tags={tags}
    >
      <HInput     type="target" position={Position.Top}    id="input"                  className="node-handle" />
      <HApproved  type="source" position={Position.Bottom} id="approved"               className="node-handle" />
      <HRejected  type="source" position={Position.Right}  id="rejected"               className="node-handle" />
      <HFeedback  type="source" position={Position.Right}  id="rejected_with_feedback" className="node-handle" />
      <HInfoReq   type="source" position={Position.Left}   id="info_requested"         className="node-handle" />
      <HEscalated type="source" position={Position.Left}   id="escalated"              className="node-handle" />
    </StandardNode>
  );
};
```

- [ ] **Step 4: Derle ve görsel doğrula**

```bash
npm run typecheck:webview && npm run build:webview
```

Extension Development Host'ta doğrula:
- **Start:** hover'da "Start" popover'ı hâlâ çıkıyor ve tıklanınca flow başlıyor. Node'u 90° döndür → handle alta değil sola geçiyor.
- **Process:** hover'da artık dropdown açılmıyor. Atanmış pipelet varsa sağda mavi (`#7ab4f5`) rozet duruyor.
- **Approval:** altı handle da eski yerlerinde; atanan ve webform rozetleri sağda alt alta, ilki mor (`#c4b5fd`), ikincisi mavi.

- [ ] **Step 5: Commit**

```bash
git add webview-src/nodes/StartNode.tsx webview-src/nodes/ProcessNode.tsx webview-src/nodes/ApprovalNode.tsx
git commit -m "refactor: Start/Process/Approval node'larini StandardNode'a gecir

CellLabel ve IconBox kopyalari silindi. ProcessNode'un pipelet
dropdown'u kaldirildi; secim artik yalnizca Node Detail panelinden.
FileLabel ve FloatingTag rozetleri ortak ResourceTag'e tasindi.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: Yeni glyph gereken sade node'lar

`ScriptNode`, `LoopNode`, `StopNode` — hepsi bugün 26px stroke ikon + beyaz kutu kullanıyor. Üçüne de palet içinde 64×64 glyph yazılır.

**Files:**
- Modify: `webview-src/nodes/ScriptNode.tsx`
- Modify: `webview-src/nodes/LoopNode.tsx`
- Modify: `webview-src/nodes/StopNode.tsx`

**Interfaces:**
- Consumes: `StandardNode` (Task 1), `HandleDef` (`./BaseNode`)
- Produces: yok

- [ ] **Step 1: `ScriptNode.tsx`'i yeniden yaz**

Kod sayfası + chevron'lar:

```tsx
import React from 'react';
import { NodeProps, Node, Position } from '@xyflow/react';
import { StandardNode } from './StandardNode';
import type { HandleDef } from './BaseNode';

const handles: HandleDef[] = [
  { type: 'target', position: Position.Top,    id: 'input'  },
  { type: 'source', position: Position.Bottom, id: 'output' },
  { type: 'source', position: Position.Right,  id: 'error'  },
];

const Icon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64" preserveAspectRatio="none">
    <defs>
      <linearGradient id="ScriptNode_Gradient_1" gradientUnits="userSpaceOnUse" x1="4" y1="2" x2="42" y2="44" spreadMethod="pad">
        <stop offset="0%" stopColor="#FFDC87" />
        <stop offset="100%" stopColor="#EEC04E" />
      </linearGradient>
    </defs>
    <g transform="translate(7 7.4)">
      {/* turuncu derinlik golgesi */}
      <path fill="#FFA800" d="M8 6 L46 6 L46 48 L8 48 Z" />
      {/* sari govde */}
      <path fill="url(#ScriptNode_Gradient_1)" d="M4 2 L42 2 L42 44 L4 44 Z" />
      {/* acik baslik seridi */}
      <path fill="#FFF7D9" d="M4 2 L42 2 L42 8 L4 8 Z" />
      {/* mavi aksan chevron'lar */}
      <path fill="none" stroke="#6695FF" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" d="M17 18 L11 26 L17 34" />
      <path fill="none" stroke="#47ADC6" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" d="M29 18 L35 26 L29 34" />
      {/* kontur */}
      <path fill="none" stroke="#333333" strokeWidth="1" strokeLinejoin="bevel" strokeLinecap="round" d="M4 2 L42 2 L42 44 L4 44 Z M4 8 L42 8" />
    </g>
  </svg>
);

interface Data { label: string; subtitle?: string; [k: string]: unknown }

export const ScriptNode: React.FC<NodeProps<Node<Data>>> = ({ data, selected, id }) => (
  <StandardNode
    id={id}
    selected={selected}
    label={data?.label || 'Script'}
    glyph={<Icon />}
    handles={handles}
    rotation={data?.rotation as 0 | 90 | 180 | 270 | undefined}
  />
);
```

- [ ] **Step 2: `LoopNode.tsx`'i yeniden yaz**

Yuvarlatılmış sarı gövde + mavi dönüş oku:

```tsx
import React from 'react';
import { NodeProps, Node, Position } from '@xyflow/react';
import { StandardNode } from './StandardNode';
import type { HandleDef } from './BaseNode';

const handles: HandleDef[] = [
  { type: 'target', position: Position.Top,    id: 'input'  },
  { type: 'source', position: Position.Bottom, id: 'output' },
  { type: 'source', position: Position.Right,  id: 'error'  },
];

const Icon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64" preserveAspectRatio="none">
    <defs>
      <linearGradient id="LoopNode_Gradient_1" gradientUnits="userSpaceOnUse" x1="3" y1="3" x2="45" y2="45" spreadMethod="pad">
        <stop offset="0%" stopColor="#FFD485" />
        <stop offset="100%" stopColor="#F3BF3E" />
      </linearGradient>
    </defs>
    <g transform="translate(7 7.4)">
      {/* turuncu derinlik */}
      <rect x="6" y="6" width="42" height="42" rx="9" fill="#FFA800" />
      {/* sari govde */}
      <rect x="3" y="3" width="42" height="42" rx="9" fill="url(#LoopNode_Gradient_1)" />
      {/* acik ic yuzey */}
      <rect x="7" y="7" width="34" height="34" rx="6" fill="#F5E4B8" fillOpacity="0.55" />
      {/* mavi donus oku */}
      <path fill="none" stroke="#6695FF" strokeWidth="3.2" strokeLinecap="round" d="M12 24 A12 12 0 1 1 20.5 35.4" />
      <path fill="none" stroke="#47ADC6" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" d="M6.5 19 L12 24.5 L17.5 19" />
      {/* kontur */}
      <rect x="3" y="3" width="42" height="42" rx="9" fill="none" stroke="#333333" strokeWidth="1" strokeLinejoin="bevel" />
    </g>
  </svg>
);

interface Data { label: string; subtitle?: string; [k: string]: unknown }

export const LoopNode: React.FC<NodeProps<Node<Data>>> = ({ data, selected, id }) => (
  <StandardNode
    id={id}
    selected={selected}
    label={data?.label || 'Loop'}
    glyph={<Icon />}
    handles={handles}
    rotation={data?.rotation as 0 | 90 | 180 | 270 | undefined}
  />
);
```

- [ ] **Step 3: `StopNode.tsx`'i yeniden yaz**

Sekizgen gövde + mavi dolu kare:

```tsx
import React from 'react';
import { NodeProps, Node, Position } from '@xyflow/react';
import { StandardNode } from './StandardNode';
import type { HandleDef } from './BaseNode';

const handles: HandleDef[] = [
  { type: 'target', position: Position.Top, id: 'input' },
];

const Icon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64" preserveAspectRatio="none">
    <defs>
      <linearGradient id="StopNode_Gradient_1" gradientUnits="userSpaceOnUse" x1="2" y1="2" x2="48" y2="48" spreadMethod="pad">
        <stop offset="0%" stopColor="#FFDC87" />
        <stop offset="100%" stopColor="#EEC04E" />
      </linearGradient>
    </defs>
    <g transform="translate(7 7.4)">
      {/* turuncu derinlik */}
      <path fill="#FF9B01" d="M18 5 L36 5 L48 17 L48 35 L36 47 L18 47 L6 35 L6 17 Z" />
      {/* sari sekizgen govde */}
      <path fill="url(#StopNode_Gradient_1)" d="M16 2 L34 2 L46 14 L46 32 L34 44 L16 44 L4 32 L4 14 Z" />
      {/* acik ic yuzey */}
      <path fill="#FEF4DC" fillOpacity="0.5" d="M18 6 L32 6 L42 16 L42 30 L32 40 L18 40 L8 30 L8 16 Z" />
      {/* mavi dur karesi */}
      <rect x="18" y="16" width="14" height="14" rx="2.5" fill="#426DB8" />
      {/* kontur */}
      <path fill="none" stroke="#333333" strokeWidth="1" strokeLinejoin="bevel" strokeLinecap="round" d="M16 2 L34 2 L46 14 L46 32 L34 44 L16 44 L4 32 L4 14 Z" />
    </g>
  </svg>
);

interface Data { label: string; subtitle?: string; [k: string]: unknown }

export const StopNode: React.FC<NodeProps<Node<Data>>> = ({ data, selected, id }) => (
  <StandardNode
    id={id}
    selected={selected}
    label={data?.label || 'Stop'}
    glyph={<Icon />}
    handles={handles}
    rotation={data?.rotation as 0 | 90 | 180 | 270 | undefined}
  />
);
```

- [ ] **Step 4: Derle ve görsel doğrula**

```bash
npm run typecheck:webview && npm run build:webview
```

Extension Development Host'ta Script / Loop / Stop node'larını yan yana Decision ve Process node'larıyla koy ve doğrula:
- Üçü de aynı sarı gövde + `#333` kontur ailesinde görünüyor, yabancı durmuyor.
- Beyaz kutu ve ortalanmış label kalmadı; sol üstte `label · id` var.
- Glyph'ler 64×64 alanı dolduruyor, kırpılmıyor.

- [ ] **Step 5: Commit**

```bash
git add webview-src/nodes/ScriptNode.tsx webview-src/nodes/LoopNode.tsx webview-src/nodes/StopNode.tsx
git commit -m "feat: Script/Loop/Stop node'larina palet ici 64x64 glyph

26px stroke ikon + beyaz kutu gorunumu kaldirildi; ucu de mevcut
sari govde / mavi aksan / #333 kontur diline cekildi ve StandardNode'a
gecirildi.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: Özel semantikli node'lar — Join ve Custom

`JoinNode` merkez handle semantiğini (`connectionCount`) ve 28px daire görünümünü korur, ama daire artık bir styled-div değil 64×64 SVG glyph olur. `CustomNode` bağlantı sürükleme durumuna göre iki glyph alır.

**Files:**
- Modify: `webview-src/nodes/JoinNode.tsx`
- Modify: `webview-src/nodes/CustomNode.tsx`

**Interfaces:**
- Consumes: `StandardNode` (Task 1); `useNodeConnections`, `useConnection` — `@xyflow/react`
- Produces: yok

- [ ] **Step 1: `JoinNode.tsx`'i yeniden yaz**

`JoinPoint` styled-div'i ve `FlowHint` SVG'si tek bir glyph'te birleşir; radial gradient SVG'ye taşınır. `CustomHandle` ve `EdgeHandle` aynen korunur.

```tsx
import React from 'react';
import { Handle, NodeProps, Node, Position, useNodeConnections } from '@xyflow/react';
import styled from 'styled-components';
import { StandardNode } from './StandardNode';

const CustomHandle = (props: any) => {
  const connections = useNodeConnections({
    handleType: props.type,
    handleId: props.id,
  });

  return (
    <Handle
      disabled={connections.length >= props.connectionCount}
      {...props}
      isConnectable={true}
    />
  );
};

const EdgeHandle = styled(CustomHandle)`
  && {
    width: 10px;
    height: 10px;
    background: #7cb6ff;
    border: 2px solid #ffffff;
    box-shadow: 0 0 0 1px rgba(15, 24, 36, 0.35);
  }
`;

const Icon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
    <defs>
      <radialGradient id="JoinNode_Gradient_1" cx="30%" cy="30%" r="75%">
        <stop offset="0%" stopColor="#F5E4B8" />
        <stop offset="48%" stopColor="#F3BF3E" />
        <stop offset="100%" stopColor="#E6A020" />
      </radialGradient>
    </defs>
    <g transform="translate(32 32)">
      {/* dis halka */}
      <circle r="17" fill="none" stroke="#C98A10" strokeOpacity="0.5" strokeWidth="1" />
      {/* sari govde - eski 28px JoinPoint ile ayni cap */}
      <circle r="14" fill="url(#JoinNode_Gradient_1)" stroke="#C98A10" strokeWidth="1.5" />
      {/* akis yonu ipucu */}
      <path d="M-4 2 L0 6 L4 2" fill="none" stroke="#7A4A00" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      {/* kontur */}
      <circle r="14" fill="none" stroke="#333333" strokeWidth="1" strokeOpacity="0.55" />
    </g>
  </svg>
);

interface Data { label: string; subtitle?: string; [k: string]: unknown }

export const JoinNode: React.FC<NodeProps<Node<Data>>> = ({ selected, id, data }) => (
  <StandardNode
    id={id}
    selected={selected}
    label={data?.label}
    glyph={<Icon />}
    handles={[]}
  >
    <EdgeHandle
      type="target"
      position={Position.Top}
      id="centerInput"
      className="node-handle"
      connectionCount={4}
      style={{ left: '50%', top: '50%', transform: 'translate(-50%, -50%)' }}
    />
    <EdgeHandle
      type="source"
      position={Position.Bottom}
      id="output"
      className="node-handle"
      connectionCount={1}
      style={{ left: '50%', top: '50%', transform: 'translate(-50%, calc(-50% + 24px))' }}
    />
  </StandardNode>
);
```

Not: eski kodda `resolveHandlePosition('center')` adında, `'center'` değerini `Position.Top`'a çeviren bir yardımcı vardı. Tek çağrısı doğrudan `Position.Top` ile değiştirildi; `ExtendedPosition` tipi ve `resolveHandlePosition` silinir. Handle konumu zaten `style` ile merkeze sabitleniyor. Eski `RADIUS + 8 = 24px` ofseti korundu.

- [ ] **Step 2: `CustomNode.tsx`'i yeniden yaz**

```tsx
import React from 'react';
import { Handle, Position, useConnection } from '@xyflow/react';
import { StandardNode } from './StandardNode';

/** Baglanti hedefi: asagi ok + toplayici tabla */
const TargetIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
    <defs>
      <linearGradient id="CustomNodeTarget_Gradient_1" gradientUnits="userSpaceOnUse" x1="3" y1="3" x2="45" y2="45" spreadMethod="pad">
        <stop offset="0%" stopColor="#FFDC87" />
        <stop offset="100%" stopColor="#EEC04E" />
      </linearGradient>
    </defs>
    <g transform="translate(7 7.4)">
      <rect x="6" y="6" width="42" height="42" rx="9" fill="#FFA800" />
      <rect x="3" y="3" width="42" height="42" rx="9" fill="url(#CustomNodeTarget_Gradient_1)" />
      <path fill="none" stroke="#6695FF" strokeWidth="3.2" strokeLinecap="round" d="M24 10 L24 28" />
      <path fill="none" stroke="#47ADC6" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" d="M16 21 L24 29 L32 21" />
      <path fill="none" stroke="#426DB8" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" d="M13 34 L13 38 L35 38 L35 34" />
      <rect x="3" y="3" width="42" height="42" rx="9" fill="none" stroke="#333333" strokeWidth="1" strokeLinejoin="bevel" />
    </g>
  </svg>
);

/** Baglanti kaynagi: iki yonlu konnektor */
const SourceIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
    <defs>
      <linearGradient id="CustomNodeSource_Gradient_1" gradientUnits="userSpaceOnUse" x1="3" y1="3" x2="45" y2="45" spreadMethod="pad">
        <stop offset="0%" stopColor="#FFDC87" />
        <stop offset="100%" stopColor="#EEC04E" />
      </linearGradient>
    </defs>
    <g transform="translate(7 7.4)">
      <rect x="6" y="6" width="42" height="42" rx="9" fill="#FFA800" />
      <rect x="3" y="3" width="42" height="42" rx="9" fill="url(#CustomNodeSource_Gradient_1)" />
      <circle cx="24" cy="24" r="6" fill="none" stroke="#426DB8" strokeWidth="2.6" />
      <path fill="none" stroke="#6695FF" strokeWidth="2.6" strokeLinecap="round" d="M8 24 L15 24 M33 24 L40 24" />
      <path fill="none" stroke="#47ADC6" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" d="M12 20 L8 24 L12 28 M36 20 L40 24 L36 28" />
      <rect x="3" y="3" width="42" height="42" rx="9" fill="none" stroke="#333333" strokeWidth="1" strokeLinejoin="bevel" />
    </g>
  </svg>
);

export default function CustomNode({ id, selected }: { id: string; selected?: boolean }) {
  const connection = useConnection();
  const isTarget = connection.inProgress && connection.fromNode.id !== id;

  return (
    <StandardNode
      id={id}
      selected={!!selected}
      label={isTarget ? 'Drop here' : 'Drag to connect'}
      glyph={isTarget ? <TargetIcon /> : <SourceIcon />}
      handles={[]}
    >
      {(!connection.inProgress || isTarget) && (
        <Handle
          className="node-handle"
          style={{ left: 'calc(50% - var(--inner-half) - var(--handle-gap))', top: '50%', transform: 'translateY(-50%)' }}
          position={Position.Left}
          type="target"
          id="target"
          isConnectableStart={false}
        />
      )}
      {!connection.inProgress && (
        <Handle
          className="node-handle"
          style={{ right: 'calc(50% - var(--inner-half) - var(--handle-gap))', top: '50%', transform: 'translateY(-50%)' }}
          position={Position.Right}
          type="source"
          id="source"
        />
      )}
    </StandardNode>
  );
}
```

- [ ] **Step 3: Derle ve görsel doğrula**

```bash
npm run typecheck:webview && npm run build:webview
```

Extension Development Host'ta doğrula:
- **Join:** daire eskisiyle aynı büyüklükte ve renkte; merkez hedef handle 4 bağlantı kabul ediyor, 5.'de kapanıyor; kaynak handle dairenin 24px altında. Artık `CellLabel` ve seçim/hover outline'ı var.
- **Custom:** bir node'dan bağlantı sürüklerken glyph aşağı-ok haline geçiyor ve etiket "Drop here" oluyor; sürükleme bitince konnektör glyph'ine ve "Drag to connect" etiketine dönüyor.

- [ ] **Step 4: Commit**

```bash
git add webview-src/nodes/JoinNode.tsx webview-src/nodes/CustomNode.tsx
git commit -m "refactor: Join ve Custom node'larini StandardNode'a gecir

JoinPoint styled-div'i 64x64 SVG glyph'e donustu; connectionCount
semantigi ve daire gorunumu korundu. CustomNode baglanti hedefi /
kaynagi icin iki palet ici glyph aldi.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: FunctionNode — gömülü EndpointInfoPanel'i kaldır

**Files:**
- Modify: `webview-src/nodes/FunctionNode.tsx`

**Interfaces:**
- Consumes: `StandardNode`, `NodeTag` (Task 1), `HandleDef` (`./BaseNode`)
- Produces: yok

- [ ] **Step 1: `FunctionNode.tsx`'i yeniden yaz**

`Icon` tanımını olduğu gibi bırak. Sil: `InfoPanel`, `Section`, `SectionTitle`, `ParamRow`, `InBadge`, `ParamName`, `ParamType`, `Required`, `JsonBlock`, `ResponseRow`, `StatusBadge`, `RespDesc`, `truncateJson`, `EndpointInfoPanel`, yerel `CellLabel`, `ACCENT`. Endpoint bilgisi artık Node Detail panelinde gösterilir; node yalnızca yolu rozet olarak taşır.

```tsx
import React from 'react';
import { NodeProps, Node, Position } from '@xyflow/react';
import { StandardNode, type NodeTag } from './StandardNode';
import type { HandleDef } from './BaseNode';

const handles: HandleDef[] = [
  { type: 'target', position: Position.Top,    id: 'input'  },
  { type: 'source', position: Position.Bottom, id: 'output' },
  { type: 'source', position: Position.Right,  id: 'error'  },
];

// ... Icon tanimi burada, degismeden ...

interface EndpointParam {
  name: string;
  in: 'path' | 'query' | 'header' | 'body' | 'formData' | 'cookie';
  required?: boolean;
  type?: string;
  description?: string;
}

interface ResponseEntry { status: string; description: string; sample?: unknown }

interface Data {
  label: string;
  subtitle?: string;
  path?: string;
  params?: EndpointParam[];
  requestSample?: unknown;
  responses?: ResponseEntry[];
  [k: string]: unknown;
}

export const FunctionNode: React.FC<NodeProps<Node<Data>>> = ({ data, selected, id }) => {
  const endpointPath = data?.path ?? data?.subtitle;

  const tags: NodeTag[] = [];
  if (endpointPath) {
    tags.push({ text: endpointPath, tone: 'resource', title: endpointPath });
  }

  return (
    <StandardNode
      id={id}
      selected={selected}
      label={data?.label}
      glyph={<Icon />}
      handles={handles}
      rotation={data?.rotation as 0 | 90 | 180 | 270 | undefined}
      tags={tags}
    />
  );
};
```

- [ ] **Step 2: Derle ve görsel doğrula**

```bash
npm run typecheck:webview && npm run build:webview
```

Extension Development Host'ta: bir Function node'u seç → artık node'un altında endpoint bilgi paneli açılmıyor; endpoint yolu varsa sağda mavi rozet duruyor.

- [ ] **Step 3: Commit**

```bash
git add webview-src/nodes/FunctionNode.tsx
git commit -m "refactor: FunctionNode'un gomulu EndpointInfoPanel'ini kaldir

Node artik salt gorsel: endpoint yolu ResourceTag olarak duruyor,
parametre/response detayi Node Detail paneline birakildi.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 7: Panel context altyapısı ve `FlowHost`

Panelin Call / Jump / MethodCall formlarını besleyebilmesi için `NodeDetailPayload` genişler ve HTTP çalıştırma mantığı `FlowHost` arayüzü ardına alınır. Bu task hiçbir form eklemez — yalnızca altyapı.

**Files:**
- Modify: `src/NodeDetailViewProvider.ts`
- Modify: `src/FlowEditorProvider.ts`

**Interfaces:**
- Consumes: `PipeletDetailEntry` (mevcut, `src/NodeDetailViewProvider.ts`)
- Produces:
  - `NodeDetailContext`, `FlowHost`, `HttpCallRequest` — `src/NodeDetailViewProvider.ts`'ten export
  - `NodeDetailPayload` yeni şekliyle: `{ id, nodeType, data, context? }`
  - `NodeDetailViewProvider.setFlowHost(host: FlowHost): void`
  - `FlowEditorProvider` public metotları: `executeHttpCallRequest(req: HttpCallRequest): Promise<{ status: number; body: string }>`, `getApiToken(baseUrl: string): string | undefined`, `storeApiTokenFor(baseUrl: string, token: string): void`

- [ ] **Step 1: `NodeDetailViewProvider.ts`'te tipleri genişlet**

`PipeletDetailEntry` aynen kalır. `NodeDetailPayload`'ı şununla değiştir ve yanına yeni tipleri ekle:

```ts
export interface NodeDetailContext {
  /** workspace kaynakli - NodeDetailViewProvider doldurur */
  pipeletFiles?: PipeletDetailEntry[];
  webformFiles?: Array<{ name: string; uri: string }>;
  /** dokuman kaynakli - FlowEditorProvider doldurur */
  flowNodes?: Array<{ id: string; label: string; nodeType: string }>;
  flows?: Array<{ name: string; startNodes: Array<{ id: string; label: string }> }>;
}

export interface NodeDetailPayload {
  id: string;
  nodeType: string;
  data: Record<string, unknown>;
  context?: NodeDetailContext;
}

export interface HttpCallRequest {
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: string;
  baseUrl?: string;
}

/** Panelin eklenti host'undaki flow editorune eristigi dar arayuz */
export interface FlowHost {
  executeHttpCallRequest(req: HttpCallRequest): Promise<{ status: number; body: string }>;
  getApiToken(baseUrl: string): string | undefined;
  storeApiTokenFor(baseUrl: string, token: string): void;
}
```

- [ ] **Step 2: `NodeDetailViewProvider`'a host kaydı ve mesaj işleyicileri ekle**

Sınıfa alan ve setter ekle:

```ts
  private _flowHost?: FlowHost;

  setFlowHost(host: FlowHost): void {
    this._flowHost = host;
  }
```

`resolveWebviewView` içindeki `onDidReceiveMessage` gövdesine, mevcut `save-node` bloğunun ardına şunları ekle:

```ts
      if (msg.type === 'http-call-execute' && this._flowHost) {
        const req: HttpCallRequest = {
          method: String(msg.method ?? 'GET'),
          url: String(msg.url ?? ''),
          headers: (msg.headers as Record<string, string> | undefined) ?? {},
          body: typeof msg.body === 'string' ? msg.body : undefined,
          baseUrl: typeof msg.baseUrl === 'string' ? msg.baseUrl : undefined,
        };
        void this._flowHost.executeHttpCallRequest(req).then((result) => {
          void webviewView.webview.postMessage({
            type: 'http-call-response',
            nodeId: msg.nodeId,
            status: result.status,
            body: result.body,
          });
        });
      }

      if (msg.type === 'request-api-token' && typeof msg.baseUrl === 'string' && this._flowHost) {
        void webviewView.webview.postMessage({
          type: 'api-token-response',
          reqId: msg.reqId,
          baseUrl: msg.baseUrl,
          token: this._flowHost.getApiToken(msg.baseUrl) ?? null,
        });
      }

      if (msg.type === 'store-api-token'
          && typeof msg.baseUrl === 'string'
          && typeof msg.token === 'string'
          && this._flowHost) {
        this._flowHost.storeApiTokenFor(msg.baseUrl, msg.token);
        void webviewView.webview.postMessage({
          type: 'api-token-stored',
          baseUrl: msg.baseUrl,
        });
      }
```

- [ ] **Step 3: `showNode`'u `context` alanına geçir**

Mevcut `showNode` gövdesindeki `sendPayload` fonksiyonunu şununla değiştir. Workspace kaynaklı veriyi artık `context`'e yazar ve `FlowEditorProvider`'ın koyduğu `context`'i ezmez:

```ts
    const sendPayload = async (base: NodeDetailPayload) => {
      const context: NodeDetailContext = { ...(base.context ?? {}) };
      if (base.nodeType === 'approval') {
        context.webformFiles = await this.readWebformFiles();
      }
      if (base.nodeType === 'process') {
        context.pipeletFiles = await this.readPipeletFiles();
      }
      void this._view!.webview.postMessage({
        type: 'show-node',
        payload: { ...base, context },
      });
    };
```

- [ ] **Step 4: `FlowEditorProvider`'da `FlowHost`'u implemente et**

Sınıf bildirimini `FlowHost`'u uygulayacak şekilde değiştir:

```ts
export class FlowEditorProvider implements vscode.CustomTextEditorProvider, FlowHost {
```

`NodeDetailViewProvider` importuna yeni tipleri ekle:

```ts
import { NodeDetailViewProvider, type FlowHost, type HttpCallRequest, type NodeDetailContext } from './NodeDetailViewProvider';
```

Constructor gövdesine (ya da `register` içinde provider oluşturulduktan hemen sonra) host kaydını ekle:

```ts
    this.nodeDetail.setFlowHost(this);
```

Üç public metodu ekle — gövdeler mevcut private helper'ları yeniden kullanır, mantık kopyalanmaz:

```ts
  public getApiToken(baseUrl: string): string | undefined {
    const tokens = this.readAuthTokens();
    return tokens[this.normalizeBaseUrl(baseUrl)]?.token;
  }

  public storeApiTokenFor(baseUrl: string, token: string): void {
    this.writeAuthToken(baseUrl, token);
  }

  public async executeHttpCallRequest(req: HttpCallRequest): Promise<{ status: number; body: string }> {
    const headers: Record<string, string> = { ...req.headers };
    if (req.baseUrl) {
      const stored = this.getApiToken(req.baseUrl);
      if (stored) { headers['Authorization'] = stored; }
    }

    try {
      const parsed = new URL(req.url);
      const isHttps = parsed.protocol === 'https:';
      const transport = isHttps ? https : http;
      const port = parsed.port ? parseInt(parsed.port, 10) : (isHttps ? 443 : 80);

      const bodyBuf = req.body ? Buffer.from(req.body, 'utf8') : undefined;
      if (bodyBuf) { headers['Content-Length'] = String(bodyBuf.length); }

      return await new Promise<{ status: number; body: string }>((resolve, reject) => {
        const request = transport.request(
          {
            hostname: parsed.hostname,
            port,
            path: `${parsed.pathname}${parsed.search}`,
            method: req.method.toUpperCase(),
            headers,
            timeout: 15000,
          },
          (res) => {
            let out = '';
            res.on('data', (chunk: Buffer) => { out += chunk.toString(); });
            res.on('end', () => resolve({ status: res.statusCode ?? 0, body: out }));
          },
        );
        request.on('timeout', () => request.destroy(new Error('Request timeout')));
        request.on('error', reject);
        if (bodyBuf) { request.write(bodyBuf); }
        request.end();
      });
    } catch (err) {
      return { status: 0, body: `Error: ${(err as Error).message}` };
    }
  }
```

Mevcut `private async executeHttpCall(...)` metodunu şununla değiştir — artık yalnızca yeni metoda delege eden ince bir sarmalayıcı, HTTP mantığının ikinci kopyası kalmaz:

```ts
  private async executeHttpCall(
    webview: vscode.Webview,
    nodeId: string,
    method: string,
    url: string,
    extraHeaders: Record<string, string>,
    body: string | undefined,
    baseUrl: string | undefined,
  ): Promise<void> {
    const result = await this.executeHttpCallRequest({ method, url, headers: extraHeaders, body, baseUrl });
    void webview.postMessage({
      type: 'http-call-response',
      nodeId,
      status: result.status,
      body: result.body,
    });
  }
```

- [ ] **Step 5: `node-selected` payload'ını zenginleştir**

`src/FlowEditorProvider.ts`'teki `node-selected` bloğunu şununla değiştir:

```ts
      if (message.type === 'node-selected' && message.id) {
        const nodeType = String(message.nodeType ?? 'custom');
        void this.buildNodeDetailContext(document, nodeType).then((context) => {
          this.nodeDetail.showNode({
            id: String(message.id),
            nodeType,
            data: (message.data as Record<string, unknown>) ?? {},
            context,
          }, webviewPanel.webview);
        });
      }
```

Sınıfa iki private metot ekle:

```ts
  /** Node tipine gore dokuman/motor kaynakli baglami toplar. */
  private async buildNodeDetailContext(
    document: vscode.TextDocument,
    nodeType: string,
  ): Promise<NodeDetailContext | undefined> {
    if (nodeType === 'jump') {
      return { flowNodes: this.readFlowNodes(document) };
    }
    if (nodeType === 'call') {
      try {
        const raw = await this.fetchFlowsFromEngine() as {
          flows?: Array<{ name?: string; startNodes?: Array<{ id?: string; label?: string }>; startNodeIds?: string[] }>;
        };
        const flows = (raw.flows ?? []).map((flow) => {
          const fromStartNodes = (flow.startNodes ?? [])
            .map((n) => ({ id: String(n.id ?? ''), label: String(n.label ?? n.id ?? '') }))
            .filter((n) => n.id);
          const fromIds = (flow.startNodeIds ?? []).map((fid) => ({ id: String(fid), label: String(fid) }));
          return {
            name: String(flow.name ?? 'Unnamed Flow'),
            startNodes: fromStartNodes.length > 0 ? fromStartNodes : fromIds,
          };
        });
        return { flows };
      } catch {
        return { flows: [] };
      }
    }
    return undefined;
  }

  /** Acik .flow dokumanindaki node'lari id/label/tip uclusu olarak okur. */
  private readFlowNodes(document: vscode.TextDocument): Array<{ id: string; label: string; nodeType: string }> {
    try {
      const parsed = JSON.parse(document.getText()) as {
        nodes?: Array<{ id?: string; type?: string; data?: { label?: string } }>;
      };
      return (parsed.nodes ?? [])
        .filter((n) => typeof n.id === 'string')
        .map((n) => ({
          id: String(n.id),
          label: String(n.data?.label ?? n.id),
          nodeType: String(n.type ?? 'custom'),
        }));
    } catch {
      return [];
    }
  }
```

- [ ] **Step 6: Derle ve doğrula**

```bash
npm run compile && npm run build:extension && npm run build:node-detail
```

Beklenen: hata yok.

Extension Development Host'ta bir node'a tıkla — Node Detail paneli açılmalı. **Dikkat: bu task'tan sonra Approval ve Process formlarının dosya listeleri geçici olarak boş görünecek**, çünkü `webformFiles` / `pipeletFiles` artık `payload.context` altında geliyor ama panel hâlâ `payload.webformFiles`'a bakıyor. Bu beklenen ara durumdur ve Task 8 Step 1'de kapanır.

- [ ] **Step 7: Commit**

```bash
git add src/NodeDetailViewProvider.ts src/FlowEditorProvider.ts
git commit -m "feat: Node Detail paneli icin context altyapisi ve FlowHost

NodeDetailPayload.context eklendi; dokuman kaynakli veriyi
FlowEditorProvider, workspace kaynakli veriyi NodeDetailViewProvider
dolduruyor. HTTP calistirma ve token yonetimi FlowHost arayuzu
ardina alindi, mantik tek yerde kaldi.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 8: Call ve Jump picker'larını panele taşı

**Files:**
- Modify: `webview-src/nodeDetail/App.tsx`
- Modify: `webview-src/nodes/CallNode.tsx`
- Modify: `webview-src/nodes/JumpNode.tsx`
- Modify: `src/FlowEditorProvider.ts` (ölü `request-flow-start-nodes` işleyicisini sil)

**Interfaces:**
- Consumes: `NodeDetailContext` şekli (Task 7); `StandardNode`, `NodeTag` (Task 1)
- Produces: yok

- [ ] **Step 1: Panelin payload tipini `context`'e uyarla**

`webview-src/nodeDetail/App.tsx` içindeki `NodePayload` arayüzünü şununla değiştir:

```tsx
interface FlowNodeEntry { id: string; label: string; nodeType: string; }
interface FlowEntry { name: string; startNodes: Array<{ id: string; label: string }>; }

interface NodeDetailContext {
  pipeletFiles?: PipeletFileEntry[];
  webformFiles?: WebformFileEntry[];
  flowNodes?: FlowNodeEntry[];
  flows?: FlowEntry[];
}

interface NodePayload {
  id: string;
  nodeType: string;
  data: Record<string, unknown>;
  context?: NodeDetailContext;
}
```

`ApprovalForm` içindeki `const { data, webformFiles = [] } = payload;` satırını şununla değiştir:

```tsx
  const { data } = payload;
  const webformFiles = payload.context?.webformFiles ?? [];
```

`ProcessForm` içindeki `const { data, pipeletFiles = [] } = payload;` satırını şununla değiştir:

```tsx
  const { data } = payload;
  const pipeletFiles = payload.context?.pipeletFiles ?? [];
```

- [ ] **Step 2: `CallForm`'u ekle**

`ProcessForm`'un ardına ekle:

```tsx
// -- Call Node Form -----------------------------------------------------------
interface CallFields { label: string; flow: string; nodeId: string; }

function CallForm({ payload }: { payload: NodePayload }) {
  const { data } = payload;
  const flows = payload.context?.flows ?? [];
  const target = (data.callTarget ?? {}) as { flow?: string; nodeId?: string; label?: string };

  const [fields, setFields] = useState<CallFields>({
    label:  toStr(data.label),
    flow:   toStr(target.flow),
    nodeId: toStr(target.nodeId),
  });

  useEffect(() => {
    const t = (payload.data.callTarget ?? {}) as { flow?: string; nodeId?: string };
    setFields({
      label:  toStr(payload.data.label),
      flow:   toStr(t.flow),
      nodeId: toStr(t.nodeId),
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payload.id]);

  // Flow adlari bosluk/ayirici karakter icerebildigi icin dropdown degeri
  // olarak duzlestirilmis listenin indeksi kullanilir - string kodlama yok.
  const options = flows.flatMap((flow) =>
    flow.startNodes.map((n) => ({ flow: flow.name, id: n.id, label: n.label })),
  );

  const selectedIndex = options.findIndex(
    (o) => o.flow === fields.flow && o.id === fields.nodeId,
  );
  const selectedNode = selectedIndex >= 0 ? options[selectedIndex] : undefined;

  const handleSelect = (e: Event | React.ChangeEvent) => {
    const idx = Number(fieldValue(e));
    const picked = Number.isInteger(idx) && idx >= 0 ? options[idx] : undefined;
    setFields((prev) => ({
      ...prev,
      flow:   picked?.flow ?? '',
      nodeId: picked?.id   ?? '',
    }));
  };

  const handleSave = () => {
    vscode?.postMessage({
      type: 'save-node',
      id: payload.id,
      fields: {
        label: fields.label,
        callTarget: selectedNode
          ? { flow: selectedNode.flow, nodeId: selectedNode.id, label: selectedNode.label }
          : undefined,
        subtitle: selectedNode ? `${selectedNode.flow} > ${selectedNode.label}` : '',
      },
    });
  };

  return (
    <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <Header payload={payload} subtitle="Pipeline Call" />
      <VSCodeDivider />

      <label style={labelStyle}>Label</label>
      <VSCodeTextField
        value={fields.label}
        onInput={((e: Event) => setFields((prev) => ({ ...prev, label: fieldValue(e) }))) as never}
        placeholder="Call label"
      />

      <label style={labelStyle}>Call Pipeline / Start Node</label>
      {flows.length === 0 ? (
        <div style={emptyStyle}>No pipelines found.</div>
      ) : (
        <VSCodeDropdown value={String(selectedIndex)} onChange={handleSelect as never} style={{ width: '100%' }}>
          <VSCodeOption value="-1">-- None --</VSCodeOption>
          {options.map((o, i) => (
            <VSCodeOption key={`${o.flow}/${o.id}`} value={String(i)}>
              {o.flow} / {o.label}
            </VSCodeOption>
          ))}
        </VSCodeDropdown>
      )}

      {selectedNode ? (
        <div style={{ border: '1px solid var(--vscode-panel-border)', borderRadius: 6, padding: 8, display: 'grid', gap: 5 }}>
          <div style={metaLineStyle}><b>Flow</b><span>{selectedNode.flow}</span></div>
          <div style={metaLineStyle}><b>Node</b><span>{selectedNode.label}</span></div>
          <div style={metaLineStyle}><b>Node ID</b><span>{selectedNode.id}</span></div>
        </div>
      ) : (
        <div style={emptyStyle}>Select a target start node. Ctrl+Click the node on the canvas to jump there.</div>
      )}

      <VSCodeDivider />
      <VSCodeButton appearance="primary" onClick={handleSave}>Save Call Target</VSCodeButton>
    </div>
  );
}
```

- [ ] **Step 3: `JumpForm`'u ekle**

`CallForm`'un ardına ekle:

```tsx
// -- Jump Node Form -----------------------------------------------------------
function JumpForm({ payload }: { payload: NodePayload }) {
  const { data } = payload;
  // JumpNode yalnizca ayni flow icindeki start node'lara atlar
  const startNodes = (payload.context?.flowNodes ?? []).filter((n) => n.nodeType === 'start');

  const [label, setLabel]   = useState(toStr(data.label));
  const [target, setTarget] = useState(toStr(data.jumpTargetId));

  useEffect(() => {
    setLabel(toStr(payload.data.label));
    setTarget(toStr(payload.data.jumpTargetId));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payload.id]);

  const selected = startNodes.find((n) => n.id === target);

  const handleSave = () => {
    vscode?.postMessage({
      type: 'save-node',
      id: payload.id,
      fields: {
        label,
        jumpTargetId: target,
        subtitle: selected?.label ?? '',
      },
    });
  };

  return (
    <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <Header payload={payload} subtitle="Jump Target" />
      <VSCodeDivider />

      <label style={labelStyle}>Label</label>
      <VSCodeTextField
        value={label}
        onInput={((e: Event) => setLabel(fieldValue(e))) as never}
        placeholder="Jump label"
      />

      <label style={labelStyle}>Jump to Start Node</label>
      {startNodes.length === 0 ? (
        <div style={emptyStyle}>No start nodes in this flow.</div>
      ) : (
        <VSCodeDropdown value={target} onChange={((e: Event) => setTarget(fieldValue(e))) as never} style={{ width: '100%' }}>
          <VSCodeOption value="">-- None --</VSCodeOption>
          {startNodes.map((n) => (
            <VSCodeOption key={n.id} value={n.id}>{n.label} ({n.id})</VSCodeOption>
          ))}
        </VSCodeDropdown>
      )}

      {selected ? null : <div style={emptyStyle}>Select a target. Ctrl+Click the node on the canvas to jump there.</div>}

      <VSCodeDivider />
      <VSCodeButton appearance="primary" onClick={handleSave}>Save Jump Target</VSCodeButton>
    </div>
  );
}
```

- [ ] **Step 4: Yönlendirmeyi ve `NODE_FIELD_CONFIG`'i güncelle**

`NODE_FIELD_CONFIG`'ten `call` ve `jump` satırlarını sil (artık kendi formları var).

`NodeDetailApp`'in son bloğunu şununla değiştir:

```tsx
  if (payload.nodeType === 'approval') { return <ApprovalForm payload={payload} />; }
  if (payload.nodeType === 'process')  { return <ProcessForm  payload={payload} />; }
  if (payload.nodeType === 'call')     { return <CallForm     payload={payload} />; }
  if (payload.nodeType === 'jump')     { return <JumpForm     payload={payload} />; }
  return <GenericNodeForm payload={payload} />;
```

`TYPE_LABELS` haritasına `jump: 'Jump',` ve `TYPE_COLORS` haritasına `jump: '#e6a020',` ekle.

- [ ] **Step 5: `CallNode.tsx`'i sadeleştir**

`CallSvg` tanımını olduğu gibi bırak. Sil: `PickerPanel`, `PickerHeader`, `GroupHeader`, `PickerItem`, `PickerItemLabel`, `PickerItemMeta`, `StatusMsg`, `HintBadge`, `fadeIn`, `normalizeFlows`, `StartNodeEntry`, `FlowEntry`, `FlowsResponse`, tüm `useEffect`/`useRef`/picker state'i ve `handleSelect`. Ctrl+Click ile hedefe gitme `webview-src/App.tsx`'in `onNodeClick`'inde yaşıyor, bu dosyada değil.

```tsx
import React from 'react';
import { NodeProps, Node, Position } from '@xyflow/react';
import { StandardNode, type NodeTag } from './StandardNode';
import type { HandleDef } from './BaseNode';

const handles: HandleDef[] = [
  { type: 'target', position: Position.Top,    id: 'input'  },
  { type: 'source', position: Position.Bottom, id: 'output' },
  { type: 'source', position: Position.Right,  id: 'error'  },
];

// ... CallSvg tanimi burada, degismeden ...

interface Data {
  label: string;
  subtitle?: string;
  callTarget?: { flow: string; nodeId: string; label: string };
  [k: string]: unknown;
}

export const CallNode: React.FC<NodeProps<Node<Data>>> = ({ id, data, selected }) => {
  const target = data?.callTarget;

  const tags: NodeTag[] = [];
  if (target) {
    const text = `${target.flow} › ${target.label}`;
    tags.push({ text, tone: 'target', title: `${text} (${target.nodeId})` });
  }

  return (
    <StandardNode
      id={id}
      selected={selected}
      label={data?.label || 'Call'}
      glyph={<CallSvg />}
      handles={handles}
      rotation={data?.rotation as 0 | 90 | 180 | 270 | undefined}
      tags={tags}
    />
  );
};
```

- [ ] **Step 6: `JumpNode.tsx`'i sadeleştir**

`Icon` tanımını olduğu gibi bırak. Sil: `PickerPanel`, `PickerHeader`, `PickerItem`, `PickerItemLabel`, `PickerItemMeta`, `EmptyMsg`, `fadeIn`, `ACCENT`, tüm state ve `useEffect`'ler, `handleSelect`. Mevcut `handles` dizisini (yalnızca `input` hedefi) birebir koru.

```tsx
import React from 'react';
import { NodeProps, Node, Position, useNodes } from '@xyflow/react';
import { StandardNode, type NodeTag } from './StandardNode';
import type { HandleDef } from './BaseNode';

const handles: HandleDef[] = [
  { type: 'target', position: Position.Top, id: 'input' },
];

// ... Icon tanimi burada, degismeden ...

interface Data { label: string; subtitle?: string; jumpTargetId?: string; [k: string]: unknown }

export const JumpNode: React.FC<NodeProps<Node<Data>>> = ({ data, selected, id }) => {
  const allNodes = useNodes();
  const targetId = data?.jumpTargetId;
  const targetNode = targetId ? allNodes.find((n) => n.id === targetId) : undefined;
  const targetLabel = (targetNode?.data as { label?: string } | undefined)?.label ?? targetId;

  const tags: NodeTag[] = [];
  if (targetId) {
    tags.push({ text: String(targetLabel), tone: 'target', title: `${targetLabel} (${targetId})` });
  }

  return (
    <StandardNode
      id={id}
      selected={selected}
      label={data?.label}
      glyph={<Icon />}
      handles={handles}
      rotation={data?.rotation as 0 | 90 | 180 | 270 | undefined}
      tags={tags}
    />
  );
};
```

- [ ] **Step 7: Ölü `request-flow-start-nodes` işleyicisini sil**

`src/FlowEditorProvider.ts`'teki `request-flow-start-nodes` bloğunu tamamen sil (yaklaşık 15 satır, `fetchFlowsFromEngine().then(...)` çağrısını ve `flow-start-nodes-response` postMessage'larını içerir). Tek tüketicisi `CallNode`'un picker'ıydı; `fetchFlowsFromEngine` artık `buildNodeDetailContext` üzerinden çağrılıyor.

- [ ] **Step 8: Derle ve görsel doğrula**

```bash
npm run compile && npm run typecheck:webview && npm run build
```

Extension Development Host'ta doğrula:
- **Approval / Process:** dosya listeleri tekrar dolu (Task 7'deki ara durum kapandı).
- **Call:** node'a çift tıklayınca artık picker açılmıyor. Node'a tıkla → panelde `CallForm` çıkıyor, dropdown flow'ları `flow / startNode` biçiminde listeliyor. Bir hedef seçip kaydet → canvas'taki node'da sarı (`#ffd066`) rozet anında beliriyor. Ctrl+Click hâlâ hedef flow'u açıyor.
- **Jump:** picker açılmıyor. Panelde `JumpForm` aynı flow'un start node'larını listeliyor. Hedef seçilip kaydedilince sarı rozet beliriyor. Ctrl+Click hâlâ hedef node'a gidiyor.

- [ ] **Step 9: Commit**

```bash
git add webview-src/nodeDetail/App.tsx webview-src/nodes/CallNode.tsx webview-src/nodes/JumpNode.tsx src/FlowEditorProvider.ts
git commit -m "feat: Call ve Jump hedef secimini Node Detail paneline tasi

Node uzerindeki picker panelleri kaldirildi; yerine CallForm ve
JumpForm geldi. Secili hedef canvas'ta ResourceTag olarak gorunuyor,
Ctrl+Click ile hedefe gitme korundu. Olu request-flow-start-nodes
mesaj turu silindi.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 9: MethodCall — HTTP UI'ını panele taşı

`MethodCallNode` 672 satırdan ~110 satıra iner; tüm HTTP istemcisi `MethodCallForm` olarak panele geçer ve `FlowHost` üzerinden çalışır.

**Files:**
- Modify: `webview-src/nodeDetail/App.tsx`
- Modify: `webview-src/nodes/MethodCallNode.tsx`

**Interfaces:**
- Consumes: Task 7'nin mesaj protokolü — panelden `http-call-execute` / `request-api-token` / `store-api-token` gönderilir; `http-call-response` / `api-token-response` / `api-token-stored` alınır. `StandardNode`, `NodeTag` (Task 1).
- Produces: yok

- [ ] **Step 1: `MethodCallForm`'u panele ekle**

`JumpForm`'un ardına ekle. Bu, `MethodCallNode`'un mevcut çalıştırma mantığının birebir taşınmış hali; `vscodeApi` yerine panelin `vscode` nesnesini kullanır.

```tsx
// -- Method Call Node Form ----------------------------------------------------
interface EndpointParam {
  name: string;
  in: 'path' | 'query' | 'header' | 'body' | 'formData' | 'cookie';
  required?: boolean;
  type?: string;
  description?: string;
}

const METHOD_COLOR: Record<string, string> = {
  get: '#22c55e', post: '#3b82f6', put: '#f59e0b', patch: '#f97316',
  delete: '#ef4444', head: '#8b5cf6', options: '#6b7280',
};

function methodColor(m: string): string {
  return METHOD_COLOR[m.toLowerCase()] ?? '#6b7280';
}

function MethodCallForm({ payload }: { payload: NodePayload }) {
  const { data } = payload;

  const method  = toStr(data.method || 'get').toLowerCase();
  const path    = toStr(data.path) || toStr(data.label) || '/';
  const baseUrl = toStr(data.baseUrl);
  const params  = (Array.isArray(data.params) ? data.params : []) as EndpointParam[];
  const color   = methodColor(method);

  const [paramValues, setParamValues] = useState<Record<string, string>>(toRecord(data.paramValues));
  const [bodyValue, setBodyValue]     = useState<string>(
    toStr(data.bodyValue) || (data.requestSample ? JSON.stringify(data.requestSample, null, 2) : ''),
  );
  const [running, setRunning]   = useState(false);
  const [response, setResponse] = useState<{ status: number; body: string } | null>(null);
  const [hasToken, setHasToken] = useState(false);
  const [detectedToken, setDetectedToken] = useState<string | null>(null);

  const reqIdRef = useRef<string | null>(null);

  // Farkli bir node gosterildiginde alanlari sifirla
  useEffect(() => {
    setParamValues(toRecord(payload.data.paramValues));
    setBodyValue(
      toStr(payload.data.bodyValue)
        || (payload.data.requestSample ? JSON.stringify(payload.data.requestSample, null, 2) : ''),
    );
    setResponse(null);
    setDetectedToken(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payload.id]);

  // Token durumunu sor
  useEffect(() => {
    if (!baseUrl) { setHasToken(false); return; }
    const reqId = `token-check-${payload.id}`;
    reqIdRef.current = reqId;
    vscode?.postMessage({ type: 'request-api-token', baseUrl, reqId });
  }, [payload.id, baseUrl]);

  // Eklenti host yanitlarini dinle
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      const msg = e.data;
      if (!msg) { return; }

      if (msg.type === 'api-token-response' && msg.reqId === reqIdRef.current) {
        setHasToken(!!msg.token);
      }

      if (msg.type === 'http-call-response' && msg.nodeId === payload.id) {
        setRunning(false);
        const statusCode = typeof msg.status === 'number' ? msg.status : 0;
        let bodyStr = '';
        try {
          bodyStr = typeof msg.body === 'string' ? msg.body : JSON.stringify(msg.body, null, 2);
        } catch { bodyStr = String(msg.body ?? ''); }
        setResponse({ status: statusCode, body: bodyStr });

        // Yanitta bearer token ara
        try {
          const parsed = typeof msg.body === 'object'
            ? msg.body as Record<string, unknown>
            : JSON.parse(msg.body as string) as Record<string, unknown>;
          const token = parsed.token ?? parsed.accessToken ?? parsed.access_token
            ?? parsed.bearerToken ?? parsed.bearer_token ?? parsed.jwt;
          if (typeof token === 'string' && token.length > 10) {
            setDetectedToken(`Bearer ${token}`);
          }
        } catch { /* JSON degil */ }
      }

      if (msg.type === 'api-token-stored' && msg.baseUrl === baseUrl) {
        setHasToken(true);
        setDetectedToken(null);
      }
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, [payload.id, baseUrl]);

  const nonBodyParams = params.filter((p) => p.in !== 'body' && p.in !== 'formData');
  const hasBodyParam  = params.some((p)  => p.in === 'body' || p.in === 'formData');

  const handleRun = () => {
    if (running) { return; }
    setRunning(true);
    setResponse(null);
    setDetectedToken(null);

    let resolvedPath = path;
    for (const [k, v] of Object.entries(paramValues)) {
      resolvedPath = resolvedPath.replace(`{${k}}`, encodeURIComponent(v));
    }

    const qs = nonBodyParams
      .filter((p) => p.in === 'query')
      .filter((p) => paramValues[p.name] !== undefined && paramValues[p.name] !== '')
      .map((p) => `${encodeURIComponent(p.name)}=${encodeURIComponent(paramValues[p.name] ?? '')}`)
      .join('&');
    const url = `${baseUrl}${resolvedPath}${qs ? '?' + qs : ''}`;

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    for (const p of nonBodyParams.filter((x) => x.in === 'header')) {
      if (paramValues[p.name]) { headers[p.name] = paramValues[p.name]; }
    }

    const body = ['post', 'put', 'patch'].includes(method) && bodyValue.trim()
      ? bodyValue.trim()
      : undefined;

    vscode?.postMessage({
      type: 'http-call-execute',
      nodeId: payload.id,
      method: method.toUpperCase(),
      url,
      headers,
      body,
      baseUrl,
    });
  };

  const handleSave = () => {
    vscode?.postMessage({
      type: 'save-node',
      id: payload.id,
      fields: { label: toStr(data.label), paramValues, bodyValue },
    });
  };

  const statusColor = response
    ? (response.status >= 200 && response.status < 300 ? '#22c55e'
      : response.status === 0 ? '#ef4444' : '#f59e0b')
    : '#6b7280';

  return (
    <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <span style={{
          fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 4,
          background: `${color}22`, border: `1px solid ${color}55`, color,
        }}>
          {method.toUpperCase()}
        </span>
        <span
          style={{
            fontSize: 12, fontFamily: 'var(--vscode-editor-font-family, monospace)',
            color: 'var(--vscode-foreground)', overflow: 'hidden', textOverflow: 'ellipsis',
          }}
          title={`${baseUrl}${path}`}
        >
          {path}
        </span>
      </div>

      {hasToken && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#22c55e',
          background: '#22c55e11', border: '1px solid #22c55e33', borderRadius: 5, padding: '4px 8px',
        }}>
          Authenticated - Bearer token active
        </div>
      )}

      <VSCodeDivider />

      {nonBodyParams.length > 0 ? (
        <>
          <label style={labelStyle}>Parameters</label>
          <div style={{ display: 'grid', gap: 8 }}>
            {nonBodyParams.map((p) => (
              <div key={p.name} style={{ display: 'grid', gridTemplateColumns: '96px 1fr', gap: 8, alignItems: 'center' }}>
                <span style={fieldNameStyle} title={p.description ?? p.name}>
                  {p.name}{p.required ? ' *' : ''}<small>{p.in}</small>
                </span>
                <VSCodeTextField
                  value={paramValues[p.name] ?? ''}
                  placeholder={p.type ?? 'value'}
                  onInput={((e: Event) => {
                    const v = fieldValue(e);
                    setParamValues((prev) => ({ ...prev, [p.name]: v }));
                  }) as never}
                />
              </div>
            ))}
          </div>
        </>
      ) : <div style={emptyStyle}>No parameters defined.</div>}

      {(hasBodyParam || ['post', 'put', 'patch'].includes(method)) && (
        <>
          <label style={labelStyle}>Request Body (JSON)</label>
          <VSCodeTextArea
            value={bodyValue}
            rows={8}
            resize="vertical"
            style={codeAreaStyle}
            placeholder='{ "key": "value" }'
            onInput={((e: Event) => setBodyValue(fieldValue(e))) as never}
          />
        </>
      )}

      <VSCodeDivider />

      <div style={{ display: 'flex', gap: 6 }}>
        <VSCodeButton appearance="primary" onClick={handleRun} disabled={running} style={{ flex: 1 }}>
          {running ? 'Executing...' : 'Execute'}
        </VSCodeButton>
        <VSCodeButton appearance="secondary" onClick={handleSave}>Save</VSCodeButton>
      </div>

      {response && (
        <>
          <label style={labelStyle}>Response</label>
          <div style={{ border: `1px solid ${statusColor}55`, borderRadius: 6, overflow: 'hidden' }}>
            <div style={{
              padding: '4px 8px', fontSize: 11, fontWeight: 700,
              color: statusColor, background: `${statusColor}18`,
            }}>
              HTTP {response.status}
            </div>
            <pre style={{
              margin: 0, padding: 8, maxHeight: 260, overflow: 'auto',
              fontFamily: 'var(--vscode-editor-font-family, monospace)',
              fontSize: 11, whiteSpace: 'pre-wrap', wordBreak: 'break-all',
              color: 'var(--vscode-foreground)',
            }}>
              {response.body}
            </pre>
          </div>
          {detectedToken && (
            <VSCodeButton
              appearance="secondary"
              onClick={() => vscode?.postMessage({ type: 'store-api-token', baseUrl, token: detectedToken })}
            >
              Store Bearer Token
            </VSCodeButton>
          )}
        </>
      )}
    </div>
  );
}
```

`App.tsx`'in en üstündeki React importuna `useRef` ekle:

```tsx
import React, { useCallback, useEffect, useRef, useState } from 'react';
```

- [ ] **Step 2: `NodeDetailApp` yönlendirmesine MethodCall'u ekle**

`nodeTypes` registry'sinde `httpCall` ve `methodCall` ikisi de `MethodCallNode`'a bağlı olduğu için ikisi de aynı forma gider:

```tsx
  if (payload.nodeType === 'approval')   { return <ApprovalForm   payload={payload} />; }
  if (payload.nodeType === 'process')    { return <ProcessForm    payload={payload} />; }
  if (payload.nodeType === 'call')       { return <CallForm       payload={payload} />; }
  if (payload.nodeType === 'jump')       { return <JumpForm       payload={payload} />; }
  if (payload.nodeType === 'methodCall'
   || payload.nodeType === 'httpCall')   { return <MethodCallForm payload={payload} />; }
  return <GenericNodeForm payload={payload} />;
```

`TYPE_LABELS` haritasına `methodCall: 'HTTP Call', httpCall: 'HTTP Call',` ve `TYPE_COLORS` haritasına `methodCall: '#3b82f6', httpCall: '#3b82f6',` ekle.

- [ ] **Step 3: `MethodCallNode.tsx`'i yeniden yaz**

Tüm styled bileşenleri (`NodeBox`, `MethodBadge`, `PathBadge`, `AuthDot`, `Panel`, `PanelHeader`, `MethodTag`, `PathText`, `PanelBody`, `SectionLabel`, `ParamRow`, `ParamName`, `RequiredStar`, `ParamInput`, `InBadge`, `BodyTextarea`, `RunButton`, `Spinner`, `ResponseBox`, `ResponseStatus`, `ResponseBody`, `StoreTokenBtn`, `AuthBanner`, `spin`), tüm state'i, `handleRun`/`handleParamChange`/`handleBodyChange`/`handleStoreToken`'ı ve method ikonlarını (`GetIcon`, `PostIcon`, `PutIcon`, `PatchIcon`, `DeleteIcon`, `DefaultIcon`, `MethodIcon`) sil. Yerine palet içi tek glyph gelir; method rengi yalnızca üst şeride ve rozete uygulanır.

```tsx
import React from 'react';
import { NodeProps, Node, Position } from '@xyflow/react';
import { StandardNode, type NodeTag } from './StandardNode';
import type { HandleDef } from './BaseNode';

const handles: HandleDef[] = [
  { type: 'target', position: Position.Top,    id: 'input'  },
  { type: 'source', position: Position.Bottom, id: 'output' },
  { type: 'source', position: Position.Right,  id: 'error'  },
];

// -- Types --------------------------------------------------------------------

interface EndpointParam {
  name: string;
  in: 'path' | 'query' | 'header' | 'body' | 'formData' | 'cookie';
  required?: boolean;
  type?: string;
  description?: string;
}

interface ResponseEntry { status: string; description: string; sample?: unknown }

interface Data {
  label: string;
  subtitle?: string;
  method?: string;
  path?: string;
  baseUrl?: string;
  summary?: string;
  params?: EndpointParam[];
  requestSample?: unknown;
  responses?: ResponseEntry[];
  paramValues?: Record<string, string>;
  bodyValue?: string;
  [k: string]: unknown;
}

// -- Method rengi -------------------------------------------------------------

const METHOD_COLOR: Record<string, string> = {
  get:    '#22c55e',
  post:   '#3b82f6',
  put:    '#f59e0b',
  patch:  '#f97316',
  delete: '#ef4444',
  head:   '#8b5cf6',
  options:'#6b7280',
};

function methodColor(m: string): string {
  return METHOD_COLOR[m.toLowerCase()] ?? '#6b7280';
}

// -- Glyph --------------------------------------------------------------------

/** Sari govde ailede kalir; method rengi yalnizca ust seritte gorunur. */
const Icon = ({ accent }: { accent: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64" preserveAspectRatio="none">
    <defs>
      <linearGradient id="MethodCallNode_Gradient_1" gradientUnits="userSpaceOnUse" x1="3" y1="6" x2="45" y2="42" spreadMethod="pad">
        <stop offset="0%" stopColor="#FFDC87" />
        <stop offset="100%" stopColor="#EEC04E" />
      </linearGradient>
    </defs>
    <g transform="translate(7 7.4)">
      {/* turuncu derinlik */}
      <rect x="6" y="9" width="42" height="34" rx="6" fill="#FFA800" />
      {/* sari govde */}
      <rect x="3" y="6" width="42" height="34" rx="6" fill="url(#MethodCallNode_Gradient_1)" />
      {/* method renkli ust serit */}
      <path d="M3 12 A6 6 0 0 1 9 6 L39 6 A6 6 0 0 1 45 12 L45 14 L3 14 Z" fill={accent} />
      {/* istek / yanit oklari */}
      <path fill="none" stroke="#426DB8" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" d="M12 24 L30 24 M25 19 L30 24 L25 29" />
      <path fill="none" stroke="#47ADC6" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" d="M36 33 L18 33 M23 28 L18 33 L23 38" />
      {/* kontur */}
      <rect x="3" y="6" width="42" height="34" rx="6" fill="none" stroke="#333333" strokeWidth="1" strokeLinejoin="bevel" />
    </g>
  </svg>
);

// -- Component ----------------------------------------------------------------

export const MethodCallNode: React.FC<NodeProps<Node<Data>>> = ({ id, data, selected }) => {
  const method = (data?.method ?? 'get').toLowerCase();
  const path   = data?.path ?? data?.label ?? '/';
  const color  = methodColor(method);

  const tags: NodeTag[] = [{
    text: `${method.toUpperCase()} ${path}`,
    tone: 'method',
    color,
    title: `${data?.baseUrl ?? ''}${path}`,
  }];

  return (
    <StandardNode
      id={id}
      selected={selected}
      label={data?.label}
      glyph={<Icon accent={color} />}
      handles={handles}
      rotation={data?.rotation as 0 | 90 | 180 | 270 | undefined}
      tags={tags}
    />
  );
};
```

- [ ] **Step 4: Derle ve doğrula**

```bash
npm run compile && npm run typecheck:webview && npm run build
```

Extension Development Host'ta, OpenAPI Explorer'dan bir endpoint'i canvas'a sürükle ve doğrula:
- Node'a tıklayınca artık node üstünde panel açılmıyor; sağda `GET /path` rozeti method renginde.
- Node'a tıklayınca Node Detail panelinde `MethodCallForm` çıkıyor: method + yol başlığı, parametre alanları, gerekirse body textarea.
- "Execute" bir istek gönderiyor, yanıt panelde HTTP status rengiyle görünüyor.
- Yanıtta token varsa "Store Bearer Token" butonu çıkıyor; basılınca "Authenticated" bandı beliriyor.
- "Save" ile girilen parametre değerleri kalıcı oluyor (başka bir node'a geçip geri dönünce değerler duruyor).

- [ ] **Step 5: Commit**

```bash
git add webview-src/nodeDetail/App.tsx webview-src/nodes/MethodCallNode.tsx
git commit -m "feat: HTTP cagri UI'ini Node Detail paneline tasi

MethodCallNode 672 satirdan ~110 satira indi; parametre formu, Execute,
response gosterimi ve token saklama MethodCallForm olarak panele gecti.
Node artik palet ici tek glyph ve method renkli rozet tasiyor.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 10: Ölü kodu sil ve bütünsel doğrulama

**Files:**
- Modify: `webview-src/nodes/BaseNode.tsx`
- Modify: `.gitignore`
- Delete: `webview-src/**/*.d.ts` build çıktıları

**Interfaces:**
- Consumes: yok
- Produces: `BaseNode.tsx` yalnızca `HandleDef`, `NodeWrapper`, `TopHandle`, `BottomHandle`, `LeftHandle`, `RightHandle`, `rotatePosition`, `resolveHandle` export eder

- [ ] **Step 1: Hiçbir node'un eski `BaseNode` API'sini kullanmadığını doğrula**

```bash
grep -rn "NodeInner\|NodeLabel\|NodeSubtitle\|NodeIcon\|transparentInner\|accentColor\|<BaseNode" webview-src/nodes/ webview-src/App.tsx
```

Beklenen: yalnızca `BaseNode.tsx`'in kendi içindeki tanımlar. Başka bir eşleşme çıkarsa o dosya önceki task'lardan birinde atlanmış demektir — geri dönüp düzelt.

- [ ] **Step 2: `BaseNode.tsx`'i sadeleştir**

Sil: `BaseNodeProps` arayüzü, `BaseNode` bileşeni, `NodeInner`, `NodeIcon`, `NodeLabel`, `NodeSubtitle`. Dosyanın tamamı şu hale gelir:

```tsx
import { Handle, Position } from '@xyflow/react';
import styled from 'styled-components';
import { NODE_WIDTH, NODE_HEIGHT } from '../constants';

// -- Types --------------------------------------------------------------------

export interface HandleDef {
  type: 'source' | 'target';
  position: Position;
  id: string;
}

// -- Styled primitives --------------------------------------------------------

export const NodeWrapper = styled.div<{ $width?: number; $height?: number }>`
  --inner-size: 64px;
  --inner-half: 32px;
  --handle-gap: 10px;
  width: ${({ $width }) => $width ?? NODE_WIDTH}px;
  height: ${({ $height }) => $height ?? NODE_HEIGHT}px;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  cursor: default;
  overflow: visible;
  pointer-events: none;

  & .node-inner-box {
    pointer-events: all;
    cursor: grab;
  }

  & .node-handle,
  & .react-flow__handle {
    pointer-events: all;
  }

  &:hover .node-inner-box {
    outline: 4px solid #4283f4;
    outline-offset: 3px;
  }
`;

// Handle placement helpers (mirror the CSS classes from index.css)
export const TopHandle = styled(Handle)`
  && {
    top: calc(50% - var(--inner-half) - var(--handle-gap)) !important;
  }
`;

export const BottomHandle = styled(Handle)`
  && {
    bottom: calc(50% - var(--inner-half) - var(--handle-gap)) !important;
  }
`;

export const RightHandle = styled(Handle)`
  && {
    right: calc(50% - var(--inner-half) - var(--handle-gap)) !important;
  }
`;

export const LeftHandle = styled(Handle)`
  && {
    left: calc(50% - var(--inner-half) - var(--handle-gap)) !important;
  }
`;

// -- Rotation helpers ---------------------------------------------------------

const POSITION_ORDER = [Position.Top, Position.Right, Position.Bottom, Position.Left];

export function rotatePosition(pos: Position, steps: number): Position {
  const idx = POSITION_ORDER.indexOf(pos);
  if (idx === -1) return pos;
  return POSITION_ORDER[(idx + steps + 4) % 4];
}

export function resolveHandle(pos: Position) {
  switch (pos) {
    case Position.Top:    return TopHandle;
    case Position.Bottom: return BottomHandle;
    case Position.Right:  return RightHandle;
    case Position.Left:   return LeftHandle;
    default:              return Handle;
  }
}
```

- [ ] **Step 3: Bayat `.d.ts` build çıktılarını temizle**

`webview-src/` altındaki `.d.ts` dosyaları tsc çıktısı ama `.gitignore`'da olmadığı için repoda izleniyor ve artık kaynakla uyuşmuyor. Hepsini sil ve `.gitignore`'a ekle ki tekrar birikmesin:

```bash
find webview-src -name '*.d.ts' -print0 | xargs -0 git rm -q --
printf 'webview-src/**/*.d.ts\n' >> .gitignore
```

- [ ] **Step 4: Tam derleme**

```bash
npm run compile && npm run typecheck:webview && npm run build
```

Beklenen: dört webpack config'i (extension, webview, nodeDetail, webform) de hatasız.

- [ ] **Step 5: Spec §7 görsel kontrol listesini baştan sona çalıştır**

Extension Development Host'ta bir `.flow` dosyası aç ve 15 node bileşeninin **her birini** canvas'a bırakıp doğrula:

1. Sol üstte `label · id` etiketi var.
2. Glyph 64×64 ve şeffaf zeminde; beyaz kutu yok.
3. Seçilince turuncu (`#ff7105`), hover'da mavi (`#4283f4`) outline.
4. Node üstünde form/picker/panel açılmıyor (tek istisna: StartNode'un hover "Start" popover'ı).
5. Node'a tıklayınca Node Detail paneli o node'un formunu gösteriyor.
6. Panelde yapılan değişiklik kaydedilince canvas'taki rozet anında güncelleniyor.
7. Node'ları döndür (rotation) → handle'lar doğru kenara geçiyor.

Ayrıca uçtan uca: `MethodCallForm`'dan bir OpenAPI endpoint'i çalıştır, yanıtın panelde göründüğünü ve token saklamanın çalıştığını doğrula.

- [ ] **Step 6: Commit**

```bash
git add -A webview-src src .gitignore
git commit -m "chore: BaseNode'un olu API'sini ve bayat .d.ts ciktilarini sil

BaseNode artik yalnizca NodeWrapper, handle yardimcilari ve rotation
mantigini barindiriyor; beyaz kutu gorsel dili (NodeInner/NodeLabel/
NodeSubtitle/accentColor) tamamen kalkti. webview-src altindaki
uretilmis .d.ts dosyalari repodan cikarildi ve .gitignore'a eklendi.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```
