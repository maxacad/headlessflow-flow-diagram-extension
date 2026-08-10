import { Background, BackgroundVariant } from '@xyflow/react';

interface FlowBackgroundProps {
  gridWidth: number;
  gridHeight: number;
}

export default function FlowBackground({ gridWidth, gridHeight }: FlowBackgroundProps) {
  return (
    <>
      {/* Dots layer — bottom */}
      <Background
        id="grid-dots"
        variant={BackgroundVariant.Dots}
        gap={20}
        size={1.6}
        color="#c1c5c8"
        bgColor="transparent"
        offset={[0,0]}
      />

      {/* Lines layer — top, transparent so dots remain visible below */}
      <Background
        id="grid-lines"
        variant={BackgroundVariant.Lines}
        gap={[gridWidth, gridHeight]}
        lineWidth={1}
        color="#c1c5c8"
        bgColor="transparent"
      />
    </>
  );
}
