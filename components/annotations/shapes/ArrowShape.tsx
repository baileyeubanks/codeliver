"use client";

import { Arrow } from "react-konva";

interface ArrowShapeProps {
  points: [number, number, number, number];
  color: string;
  opacity: number;
  strokeWidth: number;
}

export default function ArrowShape({
  points,
  color,
  opacity,
  strokeWidth,
}: ArrowShapeProps) {
  return (
    <Arrow
      points={points}
      stroke={color}
      strokeWidth={strokeWidth}
      opacity={opacity}
      fill={color}
      pointerLength={10}
      pointerWidth={8}
    />
  );
}
