"use client";

import { Rect } from "react-konva";

interface RectShapeProps {
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  opacity: number;
  strokeWidth: number;
}

export default function RectShape({
  x,
  y,
  width,
  height,
  color,
  opacity,
  strokeWidth,
}: RectShapeProps) {
  return (
    <Rect
      x={x}
      y={y}
      width={width}
      height={height}
      stroke={color}
      strokeWidth={strokeWidth}
      opacity={opacity}
      fill={color}
      fillEnabled={true}
    />
  );
}
