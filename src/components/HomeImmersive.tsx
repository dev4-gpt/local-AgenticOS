"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { ArrowUpRight, Brain, Command, Cpu, DatabaseZap, Orbit, Palette, RadioTower, ShieldCheck, Sparkles, Target, Workflow } from "lucide-react";
import Overview from "./Overview";

const CHAPTERS = [
  {
    id: "command",
    kicker: "Command",
    title: "Signals stop scattering when the work has one live command layer.",
    body: "Mission Control gives agents, goals, active work, and the next human decision a shared operational view.",
    metric: "control room",
    href: "/claude",
    action: "Open agent bay",
    artifact: "Live agent routing",
    tools: [["Claude", "/claude"], ["Hermes", "/hermes"], ["Codex", "/codex"], ["Fusion", "/fusion"]],
  },
  {
    id: "context",
    kicker: "Context",
    title: "Approved reasoning becomes a memory your next project can actually use.",
    body: "Vault notes, journals, research, and Graphify links become a private context layer instead of discarded source material.",
    metric: "private vault",
    href: "/memory",
    action: "Open memory",
    artifact: "Connected knowledge",
    tools: [["Memory", "/memory"], ["Notebook", "/notebook"], ["Goals", "/goals"], ["Journal", "/journal"]],
  },
  {
    id: "orchestrate",
    kicker: "Orchestrate",
    title: "The work moves through accountable lanes, not a chain of blank prompts.",
    body: "Paperclip, Pipeline, Kanban, and agent workflows create clear transitions from intake to approved handoff.",
    metric: "review-first",
    href: "/pipeline",
    action: "Open pipeline",
    artifact: "Approval-aware workflow",
    tools: [["Paperclip", "/paperclip"], ["Pipeline", "/pipeline"], ["Agent Kanban", "/agent-kanban"], ["Ruflo", "/ruflo"]],
  },
  {
    id: "create",
    kicker: "Create",
    title: "Strategy becomes an original production direction before it becomes an asset.",
    body: "Flow Lab, Web Studio, Open Design, and the media tools turn a brief into reviewable creative work without copying references.",
    metric: "asset studio",
    href: "/flow-lab",
    action: "Open Flow Lab",
    artifact: "Original production brief",
    tools: [["Flow Lab", "/flow-lab"], ["Web Studio", "/web-studio"], ["Open Design", "/opendesign"], ["Video", "/video"]],
  },
  {
    id: "govern",
    kicker: "Govern",
    title: "Automation moves quickly, while approval, privacy, and budgets stay visible.",
    body: "Provider routing, integration status, human approvals, and local-first boundaries make the system safe to operate.",
    metric: "human gate",
    href: "/integrations",
    action: "Open governance",
    artifact: "Human approval boundary",
    tools: [["Integrations", "/integrations"], ["Capabilities", "/capabilities"], ["SEO", "/seo"], ["Build Guide", "/guide"]],
  },
  {
    id: "deliver",
    kicker: "Deliver",
    title: "The system proves its value through outcomes your team can reuse.",
    body: "Builds, content, reporting, and playbooks move from a named owner through approval to a client-ready result.",
    metric: "delivery loop",
    href: "/agent-kanban",
    action: "Open delivery board",
    artifact: "Measured handoff",
    tools: [["Leads", "/leads"], ["Radar", "/radar"], ["Kanban", "/kanban"], ["Studio", "/studio"]],
  },
];

const QUICK_LINKS = [
  { href: "/claude", label: "Command", icon: Cpu },
  { href: "/memory", label: "Context", icon: Brain },
  { href: "/pipeline", label: "Orchestrate", icon: Workflow },
  { href: "/flow-lab", label: "Create", icon: Palette },
  { href: "/integrations", label: "Govern", icon: ShieldCheck },
  { href: "/agent-kanban", label: "Deliver", icon: Target },
];

function useReducedMotion() {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  return reduced;
}

export default function HomeImmersive() {
  const mountRef = useRef<HTMLDivElement>(null);
  const scrollHostRef = useRef<HTMLElement | null>(null);
  const [active, setActive] = useState(0);
  const [webglFailed, setWebglFailed] = useState(false);
  const reducedMotion = useReducedMotion();

  const chapter = CHAPTERS[active] ?? CHAPTERS[0];
  const progressLabel = useMemo(() => String(active + 1).padStart(2, "0"), [active]);

  useEffect(() => {
    const host = document.querySelector<HTMLElement>("[data-scroll-root]");
    const sections = CHAPTERS.map((item) => document.getElementById(item.id)).filter(
      (section): section is HTMLElement => Boolean(section),
    );
    if (!host || sections.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (!visible) return;
        const next = CHAPTERS.findIndex((item) => item.id === visible.target.id);
        if (next >= 0) setActive(next);
      },
      { root: host, rootMargin: "-32% 0px -48% 0px", threshold: [0, 0.2, 0.5, 0.8] },
    );

    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount || reducedMotion) return;

    const scrollHost = mount.closest("main") as HTMLElement | null;
    scrollHostRef.current = scrollHost;

    const isMobile = window.innerWidth < 760;
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x09070d, 0.045);

    const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 110);
    camera.position.set(0, 1.5, 18);

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        alpha: true,
        antialias: true,
        powerPreference: "high-performance",
      });
    } catch {
      setWebglFailed(true);
      return;
    }
    setWebglFailed(false);
    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isMobile ? 1.15 : 1.7));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    mount.appendChild(renderer.domElement);

    const clock = new THREE.Clock();
    const pointer = new THREE.Vector2(0, 0);
    let targetScroll = 0;
    let scroll = 0;
    let raf = 0;
    let resizeFrame = 0;
    let destroyed = false;

    const root = new THREE.Group();
    scene.add(root);

    scene.add(new THREE.AmbientLight(0xf3ebda, 0.55));

    const keyLight = new THREE.PointLight(0xe6c69a, 32, 44);
    keyLight.position.set(-5, 7, 8);
    scene.add(keyLight);

    const coolLight = new THREE.PointLight(0x5ab896, 20, 36);
    coolLight.position.set(7, -3, -10);
    scene.add(coolLight);

    const ringMaterial = new THREE.MeshBasicMaterial({
      color: 0xd4a574,
      wireframe: true,
      transparent: true,
      opacity: 0.18,
    });
    const rings: THREE.Mesh[] = [];
    for (let i = 0; i < 27; i += 1) {
      const geometry = new THREE.TorusGeometry(5.2 + (i % 4) * 0.22, 0.01, 8, 96);
      const ring = new THREE.Mesh(geometry, ringMaterial.clone());
      ring.position.z = -i * 3;
      ring.rotation.x = Math.PI / 2;
      ring.rotation.z = i * 0.31;
      rings.push(ring);
      root.add(ring);
    }

    const railMaterial = new THREE.LineBasicMaterial({
      color: 0x5ab896,
      transparent: true,
      opacity: 0.32,
    });
    for (let i = 0; i < 9; i += 1) {
      const angle = (i / 9) * Math.PI * 2;
      const radius = 5.1;
      const points = [
        new THREE.Vector3(Math.cos(angle) * radius, Math.sin(angle) * radius, 4),
        new THREE.Vector3(Math.cos(angle + 0.45) * radius, Math.sin(angle + 0.45) * radius, -80),
      ];
      root.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), railMaterial.clone()));
    }

    const particleCount = isMobile ? 320 : 760;
    const particleGeometry = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    const colors = new Float32Array(particleCount * 3);
    const colorA = new THREE.Color(0xf3ebda);
    const colorB = new THREE.Color(0x5ab896);
    const colorC = new THREE.Color(0xc4607e);

    for (let i = 0; i < particleCount; i += 1) {
      const radius = 2 + Math.random() * 10;
      const angle = Math.random() * Math.PI * 2;
      positions[i * 3] = Math.cos(angle) * radius;
      positions[i * 3 + 1] = Math.sin(angle) * radius * 0.58 + (Math.random() - 0.5) * 4;
      positions[i * 3 + 2] = 8 - Math.random() * 90;
      const color = i % 7 === 0 ? colorC : i % 3 === 0 ? colorB : colorA;
      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;
    }
    particleGeometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    particleGeometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    const particles = new THREE.Points(
      particleGeometry,
      new THREE.PointsMaterial({
        size: isMobile ? 0.028 : 0.036,
        transparent: true,
        opacity: 0.78,
        vertexColors: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    root.add(particles);

    const nodeGeometry = new THREE.IcosahedronGeometry(0.42, 2);
    const nodeMaterial = new THREE.MeshStandardMaterial({
      color: 0x15101a,
      emissive: 0xd4a574,
      emissiveIntensity: 0.72,
      metalness: 0.8,
      roughness: 0.28,
      wireframe: false,
    });
    const nodePositions = [
      new THREE.Vector3(-2.4, 1.4, -4),
      new THREE.Vector3(2.2, -0.7, -17),
      new THREE.Vector3(-1.6, -1.3, -30),
      new THREE.Vector3(2.7, 1.1, -43),
      new THREE.Vector3(-0.95, 0.25, -56),
      new THREE.Vector3(1.4, -0.9, -69),
    ];
    const nodes = nodePositions.map((position, index) => {
      const node = new THREE.Mesh(nodeGeometry, nodeMaterial.clone());
      node.position.copy(position);
      node.scale.setScalar(index === 0 ? 1.25 : 1);
      root.add(node);
      return node;
    });

    const connectionMaterial = new THREE.LineBasicMaterial({
      color: 0xe6c69a,
      transparent: true,
      opacity: 0.42,
    });
    root.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(nodePositions), connectionMaterial));

    const resize = () => {
      const rect = mount.getBoundingClientRect();
      const parentRect = mount.parentElement?.getBoundingClientRect();
      const width = Math.max(1, rect.width || parentRect?.width || window.innerWidth);
      const height = Math.max(1, rect.height || parentRect?.height || window.innerHeight);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };

    const scheduleResize = () => {
      window.cancelAnimationFrame(resizeFrame);
      resizeFrame = window.requestAnimationFrame(resize);
    };

    const updateScroll = () => {
      const host = scrollHostRef.current;
      if (!host) return;
      const max = Math.max(1, host.scrollHeight - host.clientHeight);
      targetScroll = Math.min(1, Math.max(0, host.scrollTop / max));
    };

    const updatePointer = (event: PointerEvent) => {
      pointer.x = (event.clientX / window.innerWidth - 0.5) * 2;
      pointer.y = (event.clientY / window.innerHeight - 0.5) * 2;
    };

    const animate = () => {
      if (destroyed) return;
      const elapsed = clock.getElapsedTime();
      scroll += (targetScroll - scroll) * 0.07;

      const cameraZ = 18 - scroll * 80;
      camera.position.x += (pointer.x * 1.2 + Math.sin(scroll * Math.PI * 2) * 1.1 - camera.position.x) * 0.04;
      camera.position.y += ((1.8 - scroll * 2.2) - pointer.y * 0.6 - camera.position.y) * 0.04;
      camera.position.z += (cameraZ - camera.position.z) * 0.08;
      camera.lookAt(0, -0.25 - scroll * 1.2, camera.position.z - 16);

      root.rotation.z = Math.sin(elapsed * 0.12) * 0.05 + pointer.x * 0.035;
      particles.rotation.z = elapsed * 0.015;
      particles.rotation.y = scroll * 0.28;

      rings.forEach((ring, index) => {
        ring.rotation.z += 0.0015 + index * 0.00004;
        const mat = ring.material as THREE.MeshBasicMaterial;
        const distance = Math.abs(ring.position.z - (camera.position.z - 14));
        mat.opacity = THREE.MathUtils.clamp(0.3 - distance * 0.012, 0.08, 0.32);
      });

      nodes.forEach((node, index) => {
        node.rotation.x += 0.005 + index * 0.001;
        node.rotation.y += 0.008 + index * 0.001;
        const distance = Math.abs(node.position.z - (camera.position.z - 12));
        const intensity = THREE.MathUtils.clamp(1.2 - distance * 0.05, 0.35, 1.7);
        (node.material as THREE.MeshStandardMaterial).emissiveIntensity = intensity;
        node.scale.setScalar(0.95 + intensity * 0.22);
      });

      renderer.render(scene, camera);
      raf = window.requestAnimationFrame(animate);
    };

    const resizeObserver = new ResizeObserver(scheduleResize);
    resizeObserver.observe(mount);

    scheduleResize();
    updateScroll();
    animate();

    scrollHost?.addEventListener("scroll", updateScroll, { passive: true });
    window.addEventListener("resize", scheduleResize);
    window.addEventListener("pointermove", updatePointer, { passive: true });

    return () => {
      destroyed = true;
      window.cancelAnimationFrame(raf);
      window.cancelAnimationFrame(resizeFrame);
      resizeObserver.disconnect();
      scrollHost?.removeEventListener("scroll", updateScroll);
      window.removeEventListener("resize", scheduleResize);
      window.removeEventListener("pointermove", updatePointer);
      renderer.dispose();
      particleGeometry.dispose();
      nodeGeometry.dispose();
      ringMaterial.dispose();
      railMaterial.dispose();
      connectionMaterial.dispose();
      nodes.forEach((node) => (node.material as THREE.Material).dispose());
      rings.forEach((ring) => ring.geometry.dispose());
      mount.removeChild(renderer.domElement);
    };
  }, [reducedMotion]);

  return (
    <div className="home-immersive">
      <div className="home-immersive__stage" aria-hidden="true">
        <div ref={mountRef} className="home-immersive__canvas" data-canvas-ready={!reducedMotion && !webglFailed} />
        {(reducedMotion || webglFailed) && <div className="home-immersive__fallback" />}
      </div>

      <header className="home-edition-head">
        <Link href="/" className="home-edition-head__brand">
          <strong>Veloce AgenticOS</strong>
          <span>Private operating edition</span>
        </Link>
        <div className="home-edition-head__status">
          <span><i /> Local runtime</span>
          <Link href="/integrations">System status</Link>
        </div>
      </header>

      <nav className="home-edition-index" aria-label="Mission Control chapters">
        {CHAPTERS.map((item, index) => (
          <a key={item.id} href={`#${item.id}`} className={active === index ? "is-active" : ""}>
            <span>{item.kicker}</span>
            <em>{String(index + 1).padStart(2, "0")}</em>
          </a>
        ))}
      </nav>

      <section className="home-immersive__hero">
        <div className="home-immersive__rail">
          <span>{progressLabel}</span>
          <span>{chapter.kicker}</span>
        </div>

        <div className="home-immersive__copy">
          <div className="home-immersive__eyebrow">
            <Sparkles size={14} />
            <span>Veloce AgenticOS · System Edition 01</span>
          </div>
          <h1>
            Follow the work.
            <span>Keep the system in view.</span>
          </h1>
          <p>
            One private command system for agents, memory, creation, governance, and measurable delivery.
          </p>
          <div className="home-immersive__actions">
            <Link href="/claude" className="home-immersive__primary">
              Enter Control Room <ArrowUpRight size={16} />
            </Link>
            <Link href="/memory" className="home-immersive__secondary">
              Connect Memory
            </Link>
          </div>
        </div>
      </section>

      <div className="home-immersive__chapters">
        {CHAPTERS.map((item, index) => (
          <section id={item.id} key={item.id} className={`home-immersive__chapter home-immersive__chapter--${item.id}`}>
            <div className={`home-immersive__chapter-card ${active === index ? "is-active" : ""}`}>
              <div className="home-immersive__chapter-copy-block">
                <div className="home-immersive__chapter-top">
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <span>{item.metric}</span>
                </div>
                <p>{item.kicker}</p>
                <h2>{item.title}</h2>
                <div>{item.body}</div>
                <Link href={item.href} className="home-immersive__chapter-link">
                  {item.action} <ArrowUpRight size={14} />
                </Link>
              </div>

              <div className="home-immersive__artifact" aria-label={`${item.kicker} workspace preview`}>
                <div className="home-immersive__artifact-head">
                  <span>{item.artifact}</span>
                  <i>live</i>
                </div>
                <div className="home-immersive__artifact-signal">
                  <span className="home-immersive__artifact-orbit" />
                  <span className="home-immersive__artifact-core"><Orbit size={28} /></span>
                  <span className="home-immersive__artifact-route" />
                </div>
                <nav className="home-immersive__artifact-tools" aria-label={`${item.kicker} tools`}>
                  {item.tools.map(([label, href], toolIndex) => (
                    <Link key={href} href={href}>
                      <span>{String(toolIndex + 1).padStart(2, "0")}</span>
                      <strong>{label}</strong>
                      <ArrowUpRight size={14} />
                    </Link>
                  ))}
                </nav>
              </div>
            </div>
          </section>
        ))}
      </div>

      <section className="home-immersive__dock" aria-label="Primary destinations">
        <div className="home-immersive__dock-inner">
          <div>
            <Command size={18} />
            <span>Open a live bay</span>
          </div>
          <nav>
            {QUICK_LINKS.map((item) => {
              const Icon = item.icon;
              return (
                <Link key={item.href} href={item.href}>
                  <Icon size={15} />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>
        </div>
      </section>

      <section className="home-immersive__overview">
        <div className="home-immersive__overview-head">
          <DatabaseZap size={18} />
          <span>Dashboard substrate</span>
        </div>
        <Overview />
      </section>
    </div>
  );
}
