"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import {
  PARTICLE_COUNT,
  buildNetworkEdges,
  buildStage,
  buildStarfield,
} from "./stageGeometry";

/**
 * Each page pins the scene to the stage(s) that match its topic, instead of
 * replaying the whole storyline. "full" (Home) is the only theme that walks
 * through every stage; the rest hold a single motif and drift gently between
 * two procedural variants of it so the scene still feels alive on scroll.
 */
export type SceneTheme =
  | "full"
  | "method"
  | "usecases"
  | "security"
  | "proof"
  | "engagement";

type Keyframe = { at: number; positions: Float32Array };

const STAGE_SETS: Record<SceneTheme, Keyframe[]> = {
  // Home: the whole storyline — fragmentation -> signal -> workflows -> gate -> delivery.
  full: [
    { at: 0, positions: buildStage(11, "scatter") },
    { at: 0.18, positions: buildStage(23, "point") },
    { at: 0.42, positions: buildStage(37, "network") },
    { at: 0.66, positions: buildStage(51, "ring") },
    { at: 1, positions: buildStage(67, "constellation") },
  ],
  // Method: stays in the connected-workflow motif, drifting between two node layouts.
  method: [
    { at: 0, positions: buildStage(101, "network") },
    { at: 1, positions: buildStage(102, "network") },
  ],
  // Use Cases: the same network motif, distinct layout so it doesn't feel identical to Method.
  usecases: [
    { at: 0, positions: buildStage(201, "network") },
    { at: 1, positions: buildStage(202, "network") },
  ],
  // Security: stays on the approval-gate ring throughout.
  security: [
    { at: 0, positions: buildStage(301, "ring") },
    { at: 1, positions: buildStage(302, "ring") },
  ],
  // Proof: calm, settled constellation — nothing left to resolve.
  proof: [
    { at: 0, positions: buildStage(401, "constellation") },
    { at: 1, positions: buildStage(402, "constellation") },
  ],
  // Engagement: workflows in motion settling into delivered, ordered outcomes.
  engagement: [
    { at: 0, positions: buildStage(501, "network") },
    { at: 1, positions: buildStage(502, "constellation") },
  ],
};

const NETWORK_SUBSET = 140;
const NETWORK_EDGES = buildNetworkEdges(NETWORK_SUBSET);

function segmentFor(stages: Keyframe[], progress: number) {
  for (let i = 0; i < stages.length - 1; i++) {
    if (progress >= stages[i].at && progress <= stages[i + 1].at) {
      const span = stages[i + 1].at - stages[i].at || 1;
      const localT = (progress - stages[i].at) / span;
      return { from: stages[i], to: stages[i + 1], t: smoothstep(localT) };
    }
  }
  return { from: stages[0], to: stages[0], t: 0 };
}

function smoothstep(t: number) {
  const clamped = Math.min(1, Math.max(0, t));
  return clamped * clamped * (3 - 2 * clamped);
}

function weightNear(progress: number, target: number, width: number) {
  const d = Math.abs(progress - target);
  return Math.max(0, 1 - d / width);
}

/** Connected-workflow line visibility: full storyline keys off absolute scroll position; themed pages hold a steady, gently breathing value. */
function lineWeightFor(theme: SceneTheme, progress: number, t: number) {
  switch (theme) {
    case "full":
      return weightNear(progress, 0.42, 0.22);
    case "method":
      return 0.35 + 0.15 * t;
    case "usecases":
      return 0.42 + 0.15 * t;
    case "engagement":
      return 0.45 * (1 - t); // workflow lines fade as it settles into delivery
    default:
      return 0;
  }
}

/** Approval-gate ring visibility, same pattern as the line weight above. */
function gateWeightFor(theme: SceneTheme, progress: number, t: number) {
  switch (theme) {
    case "full":
      return weightNear(progress, 0.66, 0.16);
    case "security":
      return 0.75 + 0.2 * t;
    default:
      return 0;
  }
}

export default function OperationalScene({
  progressRef,
  reduced,
  theme = "full",
}: {
  progressRef: React.MutableRefObject<number>;
  reduced: boolean;
  theme?: SceneTheme;
}) {
  const pointsRef = useRef<THREE.Points>(null);
  const linesRef = useRef<THREE.LineSegments>(null);
  const gateRef = useRef<THREE.Mesh>(null);
  const groupRef = useRef<THREE.Group>(null);

  const stages = STAGE_SETS[theme];
  const working = useMemo(() => new Float32Array(PARTICLE_COUNT * 3), []);
  const lineWorking = useMemo(() => new Float32Array(NETWORK_EDGES.length * 3), []);

  const starfield = useMemo(() => buildStarfield(500, 5), []);

  useFrame((_, delta) => {
    const progress = progressRef.current;
    const { from, to, t } = segmentFor(stages, progress);

    for (let i = 0; i < PARTICLE_COUNT * 3; i++) {
      working[i] = from.positions[i] + (to.positions[i] - from.positions[i]) * t;
    }

    if (pointsRef.current) {
      const attr = pointsRef.current.geometry.getAttribute("position") as THREE.BufferAttribute;
      attr.array.set(working);
      attr.needsUpdate = true;
    }

    if (linesRef.current) {
      for (let i = 0; i < NETWORK_EDGES.length; i++) {
        const idx = NETWORK_EDGES[i];
        lineWorking[i * 3] = working[idx * 3];
        lineWorking[i * 3 + 1] = working[idx * 3 + 1];
        lineWorking[i * 3 + 2] = working[idx * 3 + 2];
      }
      const attr = linesRef.current.geometry.getAttribute("position") as THREE.BufferAttribute;
      attr.array.set(lineWorking);
      attr.needsUpdate = true;

      const networkWeight = lineWeightFor(theme, progress, t);
      (linesRef.current.material as THREE.LineBasicMaterial).opacity = networkWeight * 0.5;
    }

    if (gateRef.current) {
      const gateWeight = gateWeightFor(theme, progress, t);
      gateRef.current.scale.setScalar(0.85 + gateWeight * 0.3);
      (gateRef.current.material as THREE.MeshBasicMaterial).opacity = gateWeight * 0.9;
      if (!reduced) {
        gateRef.current.rotation.z += delta * 0.08;
      }
    }

    if (groupRef.current && !reduced) {
      groupRef.current.rotation.y += delta * 0.02;
    }
  });

  return (
    <>
      {/* Fixed background starfield: colorful, procedural, always present */}
      <points>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[starfield.positions, 3]} />
          <bufferAttribute attach="attributes-color" args={[starfield.colors, 3]} />
        </bufferGeometry>
        <pointsMaterial size={0.045} vertexColors transparent opacity={0.55} sizeAttenuation />
      </points>

      <group ref={groupRef}>
        {/* Primary signal particle field, animates through this page's theme stages */}
        <points ref={pointsRef}>
          <bufferGeometry>
            <bufferAttribute attach="attributes-position" args={[new Float32Array(working), 3]} />
          </bufferGeometry>
          <pointsMaterial
            size={0.065}
            color="#ff9a4d"
            transparent
            opacity={0.85}
            sizeAttenuation
          />
        </points>

        {/* Connected-workflow lines, visible for network-themed pages */}
        <lineSegments ref={linesRef}>
          <bufferGeometry>
            <bufferAttribute attach="attributes-position" args={[new Float32Array(lineWorking), 3]} />
          </bufferGeometry>
          <lineBasicMaterial color="#ffd7ad" transparent opacity={0} />
        </lineSegments>

        {/* Human approval gate: visible for the full storyline and the Security theme */}
        <mesh ref={gateRef}>
          <torusGeometry args={[3.1, 0.03, 16, 96]} />
          <meshBasicMaterial color="#ff9a4d" transparent opacity={0} />
        </mesh>
      </group>
    </>
  );
}
