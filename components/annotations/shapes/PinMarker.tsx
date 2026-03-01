"use client";

import { Group, Circle, Text } from "react-konva";

interface PinMarkerProps {
  x: number;
  y: number;
  index: number;
  color: string;
  draggable?: boolean;
  onDragEnd?: (x: number, y: number) => void;
}

export default function PinMarker({
  x,
  y,
  index,
  color,
  draggable = false,
  onDragEnd,
}: PinMarkerProps) {
  return (
    <Group
      x={x}
      y={y}
      draggable={draggable}
      onDragEnd={(e) => {
        const node = e.target;
        onDragEnd?.(node.x(), node.y());
      }}
    >
      <Circle radius={12} fill={color} />
      <Text
        text={String(index)}
        fontSize={11}
        fontStyle="bold"
        fill="#ffffff"
        align="center"
        verticalAlign="middle"
        width={24}
        height={24}
        offsetX={12}
        offsetY={12}
      />
    </Group>
  );
}
