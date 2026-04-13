import { BaseEdge, type EdgeProps } from "reactflow";

export function ParallelStraightEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  style,
  markerEnd,
}: EdgeProps) {
  const direction = targetX >= sourceX ? 1 : -1;
  const elbowX = sourceX + direction * 72;
  const path = `M ${sourceX} ${sourceY} L ${elbowX} ${sourceY} L ${elbowX} ${targetY} L ${targetX} ${targetY}`;

  return <BaseEdge id={id} path={path} style={style} markerEnd={markerEnd} />;
}
