# VSCode Custom Editor + React Flow Node Drag & Drop Instruction

## 🎯 Goal

Build a VSCode extension with a **Custom Editor (WebView)** that integrates **@xyflow/react** to support:

* Drag & Drop from Project Explorer into WebView
* Grid-based layout system (150x200, vertical orientation)
* Smooth drag (no snap while dragging)
* Magnetic positioning on drop
* Visual overlay + hover + highlight system
* Custom Node UI with specific connection points

---

## 🧱 Layout & Grid სისტ

### Grid Configuration

* Grid size: **150px width x 200px height** (vertical orientation)
* Background: **dot grid**
* Each cell represents a valid drop zone

### CSS (Dot Grid Background)

```css
.canvas {
  position: relative;
  width: 100%;
  height: 100%;

  background-image: radial-gradient(#e0e0e0 1px, transparent 1px);
  background-size: 150px 200px;
}
```

---

## 🧩 Node Design

### Node Dimensions

| Element       | Size        |
| ------------- | ----------- |
| Outer Area    | 150x200 px  |
| Inner Node UI | 64x64 px    |

### Layout Behavior

* Node is centered inside 150x200 area
* Outer area acts as **interactive zone**
* Inner 64x64 is the **visual component**

---

## 🎨 Node Component (React Flow)

```tsx
const CustomNode = () => {
  return (
    <div className="node-wrapper">
      <div className="node-inner">
        {/* 64x64 visual */}
      </div>

      {/* Handles */}
      <Handle type="target" position="top" id="input" />
      <Handle type="source" position="bottom" id="output" />
      <Handle type="source" position="right" id="error" />
    </div>
  );
};
```

---

## 🎯 Handle Rules

* Top → Input
* Bottom → Output
* Right → Error output only

---

## 🧲 Drag Behavior

### ❗ Important Rule

* Drag = **free movement (NO snap)**
* Drop = **magnetic snap to nearest grid cell**

---

## 📐 Snap Calculation

```ts
const GRID_X = 150;
const GRID_Y = 200;

function snapToGrid(x: number, y: number) {
  return {
    x: Math.round(x / GRID_X) * GRID_X,
    y: Math.round(y / GRID_Y) * GRID_Y,
  };
}
```

---

## 🖱️ Drag Lifecycle

### During Drag

* Node follows cursor freely
* No snapping applied

### On Drop

* Calculate nearest grid cell
* Move node to snapped position

---

## 🌐 WebView Drag & Drop Bridge

> ⚠️ VSCode does NOT support native drag from explorer → webview directly

### Solution:

Use WebView DOM drag events:

```js
window.addEventListener("dragover", (e) => {
  e.preventDefault();
});

window.addEventListener("drop", (e) => {
  e.preventDefault();

  const data = e.dataTransfer?.getData("text");
  // Send to extension if needed
});
```

---

## ✨ Overlay System (Drag Active Only)

### Behavior

* Overlay appears ONLY during drag
* Shows grid hover state
* Highlights current cell under cursor

---

## 🧠 Drag State

```ts
const [isDragging, setIsDragging] = useState(false);
```

### Events

```ts
onDragStart => setIsDragging(true)
onDragEnd => setIsDragging(false)
```

---

## 🔲 Grid Cell Highlight

### Mouse Tracking

```ts
function getHoveredCell(x: number, y: number) {
  return {
    col: Math.floor(x / 150),
    row: Math.floor(y / 200),
  };
}
```

---

## 🎨 Highlight Style

```css
.grid-cell.highlight {
  outline: 2px solid #4da3ff;
  background: rgba(77, 163, 255, 0.1);
}
```

---

## 🖱️ Hover Effect (150x200 Area)

* Triggered when mouse enters a grid cell
* Visual feedback:

```css
.grid-cell:hover {
  background: rgba(255, 255, 255, 0.05);
}
```

---

## 🧱 Node Wrapper Styling

```css
.node-wrapper {
  width: 150px;
  height: 200p
  x;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
}

.node-inner {
  width: 64px;
  height: 64px;
  background: #222;
  border-radius: 8px;
}
```

---

## 🔁 Drop → Create Node Flow

1. User drags item
2. Overlay activates
3. Hovered grid cell highlights
4. On drop:

   * Position snapped
   * New node created in React Flow
   * Node placed at snapped coordinates

---

## 🔗 React Flow Integration

```tsx
<ReactFlow
  nodes={nodes}
  edges={edges}
  nodeTypes={{ custom: CustomNode }}
  onNodeDragStop={(event, node) => {
    const snapped = snapToGrid(node.position.x, node.position.y);
    updateNodePosition(node.id, snapped);
  }}
/>
```

---

## 🚀 UX Summary

✔ Smooth drag
✔ Magnetic drop
✔ Grid-based layout
✔ Visual feedback (hover + highlight)
✔ Clean node alignment
✔ VSCode WebView compatible

---

## ⚠️ Constraints & Notes

* Native file explorer drag → WebView is limited
* Use workaround with custom drag data if needed
* All positioning must be calculated manually

---

## ✅ Expected Result

* Professional node editor experience inside VSCode
* Clean grid alignment
* Intuitive drag-drop interaction
* Visual clarity during placement

---

## 🧩 Optional Enhancements

* Snap preview ghost
* Multi-select drag
* Zoom-aware grid
* Smart alignment guides

---

**End of Instruction**
