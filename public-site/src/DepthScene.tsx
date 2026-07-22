import { useEffect, useRef } from "react";
import * as THREE from "three";

const CHAPTER_COLORS = ["#f4ae4e", "#72d8c0", "#8d7eff", "#f4ae4e", "#72d8c0", "#8d7eff"].map((value) => new THREE.Color(value));

/**
 * Original Veloce system visual: small signal dots establish connections as the
 * scroll advances through operating layers. Every chapter still has DOM copy
 * and a reduced-motion fallback in the parent experience.
 */
export default function DepthScene({ progress }: { progress: number }) {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const mobile = window.matchMedia("(max-width: 760px)").matches;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 100);
    camera.position.set(0, 0.6, 14);
    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, mobile ? 1 : 1.45));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    mount.appendChild(renderer.domElement);

    const group = new THREE.Group();
    scene.add(group);

    const chapterPositions = [
      new THREE.Vector3(-2.0, 1.6, 0),
      new THREE.Vector3(1.9, 1.05, -7),
      new THREE.Vector3(-1.7, -0.45, -14),
      new THREE.Vector3(1.65, -1.15, -21),
      new THREE.Vector3(-0.5, 0.8, -28),
      new THREE.Vector3(0.95, -0.85, -35),
    ];
    const sphere = new THREE.SphereGeometry(0.44, 24, 24);
    const nodes: THREE.Mesh[] = [];
    const rings: THREE.Mesh[] = [];
    chapterPositions.forEach((position, index) => {
      const material = new THREE.MeshStandardMaterial({
        color: CHAPTER_COLORS[index], emissive: CHAPTER_COLORS[index], emissiveIntensity: 0.52, roughness: 0.28,
      });
      const node = new THREE.Mesh(sphere, material);
      node.position.copy(position);
      group.add(node);
      nodes.push(node);

      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(0.72 + index * 0.028, 0.016, 8, 48),
        new THREE.MeshBasicMaterial({ color: CHAPTER_COLORS[index], transparent: true, opacity: 0.38 }),
      );
      ring.position.copy(position);
      ring.rotation.x = Math.PI * 0.42;
      group.add(ring);
      rings.push(ring);
    });

    const signalCount = mobile ? 42 : 76;
    const maxConnections = mobile ? 80 : 172;
    const signalBase = Array.from({ length: signalCount }, (_, index) => {
      const chapter = index % chapterPositions.length;
      const anchor = chapterPositions[chapter];
      return new THREE.Vector3(
        anchor.x + (Math.random() - 0.5) * 4.7,
        anchor.y + (Math.random() - 0.5) * 3.2,
        anchor.z + (Math.random() - 0.5) * 5.8,
      );
    });
    const signalPositions = new Float32Array(signalCount * 3);
    const signalGeometry = new THREE.BufferGeometry();
    const signalAttribute = new THREE.BufferAttribute(signalPositions, 3);
    signalGeometry.setAttribute("position", signalAttribute);
    const signalMesh = new THREE.Points(signalGeometry, new THREE.PointsMaterial({
      color: 0xdde6f1, size: mobile ? 0.045 : 0.038, transparent: true, opacity: 0.82, depthWrite: false,
    }));
    group.add(signalMesh);

    const connectionPositions = new Float32Array(maxConnections * 6);
    const connectionGeometry = new THREE.BufferGeometry();
    const connectionAttribute = new THREE.BufferAttribute(connectionPositions, 3);
    connectionGeometry.setAttribute("position", connectionAttribute);
    connectionGeometry.setDrawRange(0, 0);
    const connectionMesh = new THREE.LineSegments(connectionGeometry, new THREE.LineBasicMaterial({
      color: 0x8aa5b9, transparent: true, opacity: 0.29,
    }));
    group.add(connectionMesh);

    const dustGeometry = new THREE.BufferGeometry();
    const dustPositions = new Float32Array((mobile ? 250 : 560) * 3);
    for (let index = 0; index < dustPositions.length; index += 3) {
      dustPositions[index] = (Math.random() - 0.5) * 13;
      dustPositions[index + 1] = (Math.random() - 0.5) * 9;
      dustPositions[index + 2] = -Math.random() * 47;
    }
    dustGeometry.setAttribute("position", new THREE.BufferAttribute(dustPositions, 3));
    const dustMesh = new THREE.Points(dustGeometry, new THREE.PointsMaterial({
      color: 0xd2d9e5, size: 0.022, transparent: true, opacity: 0.58, depthWrite: false,
    }));
    group.add(dustMesh);

    scene.add(new THREE.PointLight(0xf4ae4e, 15, 20).translateX(-2).translateY(2).translateZ(3));
    scene.add(new THREE.AmbientLight(0x9ab2e7, 1.1));

    let target = 0;
    let current = 0;
    let frame = 0;
    let resizeFrame = 0;
    let elapsed = 0;
    const activeSignals = Array.from({ length: signalCount }, () => new THREE.Vector3());

    const resize = () => {
      const rect = mount.getBoundingClientRect();
      renderer.setSize(Math.max(rect.width, 1), Math.max(rect.height, 1), false);
      camera.aspect = Math.max(rect.width, 1) / Math.max(rect.height, 1);
      camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(resizeFrame);
      resizeFrame = requestAnimationFrame(resize);
    });
    observer.observe(mount);
    resize();

    const updateSignals = () => {
      const reveal = 0.32 + current * 0.68;
      for (let index = 0; index < signalCount; index += 1) {
        const base = signalBase[index];
        const phase = elapsed * 0.58 + index * 0.91;
        const position = activeSignals[index];
        position.set(
          base.x + Math.sin(phase) * (0.15 + current * 0.18),
          base.y + Math.cos(phase * 0.82) * 0.12,
          base.z + Math.sin(phase * 0.44) * 0.16,
        );
        signalPositions[index * 3] = position.x;
        signalPositions[index * 3 + 1] = position.y;
        signalPositions[index * 3 + 2] = position.z;
      }
      signalAttribute.needsUpdate = true;

      let edge = 0;
      const distanceLimit = 1.15 + reveal * 1.1;
      for (let from = 0; from < signalCount && edge < maxConnections; from += 1) {
        for (let to = from + 1; to < signalCount && edge < maxConnections; to += 1) {
          if (activeSignals[from].distanceToSquared(activeSignals[to]) > distanceLimit * distanceLimit) continue;
          const offset = edge * 6;
          connectionPositions[offset] = activeSignals[from].x;
          connectionPositions[offset + 1] = activeSignals[from].y;
          connectionPositions[offset + 2] = activeSignals[from].z;
          connectionPositions[offset + 3] = activeSignals[to].x;
          connectionPositions[offset + 4] = activeSignals[to].y;
          connectionPositions[offset + 5] = activeSignals[to].z;
          edge += 1;
        }
      }
      connectionGeometry.setDrawRange(0, edge * 2);
      connectionAttribute.needsUpdate = true;
    };

    const render = (time: number) => {
      elapsed = time / 1000;
      current += (target - current) * 0.075;
      camera.position.z = 14 - current * 39;
      camera.position.x = Math.sin(current * Math.PI * 2) * 0.54;
      camera.position.y = 0.65 - current * 1.18;
      camera.lookAt(0, -0.4, camera.position.z - 11);
      group.rotation.z = Math.sin(current * Math.PI) * 0.075;
      dustMesh.rotation.z += 0.0008;

      const activeChapter = Math.min(nodes.length - 1, Math.round(current * (nodes.length - 1)));
      nodes.forEach((node, index) => {
        node.rotation.y += 0.009;
        const pulse = index === activeChapter ? 1.18 : 0.92;
        node.scale.setScalar(pulse + Math.sin(elapsed * 1.45 + index) * 0.05);
        (node.material as THREE.MeshStandardMaterial).emissiveIntensity = index === activeChapter ? 1.2 : 0.48;
        rings[index].rotation.z += 0.002 + index * 0.0003;
        (rings[index].material as THREE.MeshBasicMaterial).opacity = index === activeChapter ? 0.7 : 0.28;
      });
      updateSignals();
      renderer.render(scene, camera);
      frame = requestAnimationFrame(render);
    };

    const interval = window.setInterval(() => { target = Number(mount.dataset.progress || 0); }, 40);
    frame = requestAnimationFrame(render);

    return () => {
      clearInterval(interval);
      cancelAnimationFrame(frame);
      cancelAnimationFrame(resizeFrame);
      observer.disconnect();
      sphere.dispose();
      signalGeometry.dispose();
      connectionGeometry.dispose();
      dustGeometry.dispose();
      nodes.forEach((node) => (node.material as THREE.Material).dispose());
      rings.forEach((ring) => { ring.geometry.dispose(); (ring.material as THREE.Material).dispose(); });
      (signalMesh.material as THREE.Material).dispose();
      (connectionMesh.material as THREE.Material).dispose();
      (dustMesh.material as THREE.Material).dispose();
      renderer.dispose();
      mount.removeChild(renderer.domElement);
    };
  }, []);

  return <div ref={mountRef} data-progress={progress} className="depth-scene" aria-hidden="true"><div className="depth-fallback"><span>Signal</span><i></i><span>Context</span><i></i><span>Orchestrate</span><i></i><span>Approval</span></div></div>;
}
