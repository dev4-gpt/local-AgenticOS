"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType, type MutableRefObject } from "react";
import { Maximize2, RotateCcw, ZoomIn } from "lucide-react";
import SpriteText from "three-spritetext";
import * as THREE from "three";
import type { ForceGraphMethods, ForceGraphProps, GraphData, NodeObject } from "react-force-graph-3d";

const ForceGraph3D = dynamic(() => import("react-force-graph-3d"), { ssr: false });
const TypedForceGraph3D = ForceGraph3D as unknown as ComponentType<ForceGraphProps<VisualNode, VisualLink> & { ref?: MutableRefObject<ForceGraphMethods<VisualNode, VisualLink> | undefined> }>;

export type ClientGraphNode = {
  id: string;
  label: string;
  kind: "document" | "tag";
  record_id?: string | null;
};

export type ClientGraphEdge = {
  source_node_id: string;
  target_node_id: string;
};

type VisualNode = ClientGraphNode & { degree: number };
type VisualLink = { source: string; target: string; relation: string };

type Props = {
  nodes: ClientGraphNode[];
  edges: ClientGraphEdge[];
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string) => void;
  onClearSelection: () => void;
};

const DOCUMENT = "#63d6a0";
const TAG = "#ff9bb7";
const FLOW = "#f5c56b";

function linkEndId(value: unknown) {
  return typeof value === "object" && value !== null ? String((value as { id?: string | number }).id ?? "") : String(value ?? "");
}

function nodeColor(node: NodeObject<VisualNode>) {
  return node.kind === "document" ? DOCUMENT : TAG;
}

function makeNodeObject(node: NodeObject<VisualNode>) {
  const accent = nodeColor(node);
  const radius = node.kind === "document" ? 4.8 : 6.8;
  const displayLabel = node.label.length > 24 ? `${node.label.slice(0, 22)}…` : node.label;
  const group = new THREE.Group();
  const sphere = new THREE.Mesh(
    new THREE.SphereGeometry(radius, 18, 18),
    new THREE.MeshStandardMaterial({ color: accent, emissive: accent, emissiveIntensity: 0.7, roughness: 0.38, metalness: 0.15 })
  );
  const halo = new THREE.Mesh(
    new THREE.SphereGeometry(radius * 1.8, 16, 16),
    new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0.09, blending: THREE.AdditiveBlending, depthWrite: false })
  );
  const label = new SpriteText(displayLabel, node.kind === "document" ? 3.6 : 4.2, accent);
  label.position.set(0, radius + 5.2, 0);
  label.backgroundColor = node.kind === "document" ? "rgba(4, 33, 31, 0.88)" : "rgba(45, 14, 29, 0.9)";
  label.padding = 2.2;
  label.borderRadius = 3;
  label.strokeWidth = 0.25;
  label.strokeColor = accent;
  label.fontWeight = "600";
  group.add(halo, sphere, label);
  return group;
}

export default function ClientMemoryGraph3D({ nodes, edges, selectedNodeId, onSelectNode, onClearSelection }: Props) {
  const graphRef = useRef<ForceGraphMethods<VisualNode, VisualLink> | undefined>(undefined);
  const hostRef = useRef<HTMLDivElement>(null);
  const selectedRef = useRef(selectedNodeId);
  const [size, setSize] = useState({ width: 900, height: 430 });
  selectedRef.current = selectedNodeId;

  const degree = useMemo(() => {
    const counts = new Map<string, number>();
    edges.forEach((edge) => {
      counts.set(edge.source_node_id, (counts.get(edge.source_node_id) ?? 0) + 1);
      counts.set(edge.target_node_id, (counts.get(edge.target_node_id) ?? 0) + 1);
    });
    return counts;
  }, [edges]);

  const graphData = useMemo<GraphData<VisualNode, VisualLink>>(() => ({
    nodes: (() => {
      const documents = nodes.filter((node) => node.kind === "document");
      const tags = nodes.filter((node) => node.kind === "tag");
      const orbit = (index: number, count: number, radius: number, phase: number) => {
        const angle = (index / Math.max(1, count)) * Math.PI * 2 + phase;
        return {
          x: Math.cos(angle) * radius,
          y: Math.sin(angle * 1.7) * radius * 0.46,
          z: Math.sin(angle) * radius,
        };
      };
      return [...documents.map((node, index) => ({ ...node, ...orbit(index, documents.length, 64, 0), degree: degree.get(node.id) ?? 0 })), ...tags.map((node, index) => ({ ...node, ...orbit(index, tags.length, 132, Math.PI / 10), degree: degree.get(node.id) ?? 0 }))];
    })(),
    links: edges.map((edge) => ({ source: edge.source_node_id, target: edge.target_node_id, relation: "tagged" })),
  }), [degree, edges, nodes]);

  const connectedToSelection = useMemo(() => {
    if (!selectedNodeId) return new Set<string>();
    const connected = new Set([selectedNodeId]);
    edges.forEach((edge) => {
      if (edge.source_node_id === selectedNodeId) connected.add(edge.target_node_id);
      if (edge.target_node_id === selectedNodeId) connected.add(edge.source_node_id);
    });
    return connected;
  }, [edges, selectedNodeId]);

  const resetView = useCallback(() => {
    graphRef.current?.cameraPosition({ x: 0, y: 0, z: 220 }, { x: 0, y: 0, z: 0 }, 700);
    onClearSelection();
  }, [onClearSelection]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const measure = () => {
      const rect = host.getBoundingClientRect();
      setSize({ width: Math.max(320, Math.round(rect.width)), height: Math.max(320, Math.round(rect.height)) });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => graphRef.current?.cameraPosition({ x: 0, y: 0, z: 220 }, { x: 0, y: 0, z: 0 }, 700), 350);
    return () => window.clearTimeout(timer);
  }, [graphData, size]);

  const selectNode = useCallback((node: NodeObject<VisualNode>) => {
    if (!node.id) return;
    onSelectNode(String(node.id));
    const x = typeof node.x === "number" ? node.x : 0;
    const y = typeof node.y === "number" ? node.y : 0;
    const z = typeof node.z === "number" ? node.z : 0;
    graphRef.current?.cameraPosition({ x: x + 0.1, y: y + 0.1, z: z + 170 }, { x, y, z }, 900);
  }, [onSelectNode]);

  return <div className="relative mt-5 overflow-hidden rounded-xl border" style={{ borderColor: "rgba(96,165,250,0.34)", background: "#07111d", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.1), 0 18px 42px rgba(30,50,74,0.2)", minHeight: 430 }}>
    <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between gap-3 p-4">
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em]" style={{ color: "#a7f3d0" }}>Tenant knowledge space</p>
        <p className="mt-1 max-w-[280px] text-[11px] leading-relaxed" style={{ color: "rgba(226,238,250,0.72)" }}>Documents orbit their approved tags. Moving particles show the active relationship flow.</p>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <button type="button" title="Reset graph view" aria-label="Reset graph view" onClick={resetView} className="pointer-events-auto grid h-8 w-8 place-items-center rounded-md border" style={{ borderColor: "rgba(167,243,208,0.25)", color: "#a7f3d0", background: "rgba(7,17,29,0.72)" }}><RotateCcw size={14} /></button>
        <span className="hidden items-center gap-1 rounded-md border px-2 py-1.5 text-[10px] sm:inline-flex" style={{ borderColor: "rgba(226,238,250,0.16)", color: "rgba(226,238,250,0.64)", background: "rgba(7,17,29,0.72)" }}><ZoomIn size={12} /> orbit · zoom · select</span>
      </div>
    </div>
    <div className="absolute bottom-4 left-4 z-10 flex items-center gap-3 rounded-md border px-3 py-2 text-[10px]" style={{ borderColor: "rgba(226,238,250,0.14)", color: "rgba(226,238,250,0.7)", background: "rgba(7,17,29,0.72)" }}>
      <span className="inline-flex items-center gap-1.5"><i className="h-2 w-2 rounded-full" style={{ background: DOCUMENT, boxShadow: `0 0 10px ${DOCUMENT}` }} /> memories</span>
      <span className="inline-flex items-center gap-1.5"><i className="h-2 w-2 rounded-full" style={{ background: TAG, boxShadow: `0 0 10px ${TAG}` }} /> tags</span>
      <span className="hidden items-center gap-1.5 md:inline-flex"><i className="h-2 w-2 rounded-full" style={{ background: FLOW, boxShadow: `0 0 10px ${FLOW}` }} /> flow</span>
    </div>
    <div ref={hostRef} className="h-[430px] w-full">
      <TypedForceGraph3D
        ref={graphRef}
        graphData={graphData}
        width={size.width}
        height={size.height}
        backgroundColor="#07111d"
        showNavInfo={false}
        nodeRelSize={5}
        nodeVal={(node) => node.kind === "tag" ? 2.2 : Math.max(1.4, Math.min(4, 1.2 + node.degree * 0.18))}
        nodeColor={nodeColor}
        nodeLabel={(node) => `${node.kind === "tag" ? "Tag" : "Memory"}: ${node.label}`}
        nodeThreeObject={makeNodeObject}
        nodeThreeObjectExtend={false}
        linkColor={(link) => {
          const source = linkEndId(link.source);
          const target = linkEndId(link.target);
          if (!selectedRef.current) return FLOW;
          return connectedToSelection.has(source) && connectedToSelection.has(target) ? "#a7f3d0" : "rgba(226,238,250,0.12)";
        }}
        linkOpacity={0.72}
        linkWidth={(link) => {
          const source = linkEndId(link.source);
          const target = linkEndId(link.target);
          return selectedNodeId && connectedToSelection.has(source) && connectedToSelection.has(target) ? 1.7 : 0.7;
        }}
        linkDirectionalArrowLength={3.4}
        linkDirectionalArrowRelPos={0.82}
        linkDirectionalArrowColor={() => FLOW}
        linkDirectionalParticles={(link) => {
          const source = linkEndId(link.source);
          const target = linkEndId(link.target);
          return !selectedNodeId || (connectedToSelection.has(source) && connectedToSelection.has(target)) ? 2 : 0;
        }}
        linkDirectionalParticleSpeed={0.006}
        linkDirectionalParticleWidth={2.4}
        linkDirectionalParticleColor={() => FLOW}
        warmupTicks={0}
        cooldownTicks={0}
        cooldownTime={0}
        d3VelocityDecay={0.42}
        enableNavigationControls
        enableNodeDrag
        onNodeClick={selectNode}
        onBackgroundClick={onClearSelection}
        showPointerCursor
      />
    </div>
    <div className="pointer-events-none absolute bottom-4 right-4 z-10 hidden items-center gap-1.5 rounded-md border px-2.5 py-2 text-[10px] md:flex" style={{ borderColor: "rgba(226,238,250,0.14)", color: "rgba(226,238,250,0.56)", background: "rgba(7,17,29,0.72)" }}><Maximize2 size={12} /> drag nodes to reshape</div>
  </div>;
}
