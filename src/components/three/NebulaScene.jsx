import React, { useEffect, useRef } from "react";
import * as THREE from "three";

/**
 * Cena 3D de fundo do Nébula OS (Three.js):
 * - Nebulosa de partículas carmesim
 * - Núcleo icosaédrico wireframe com "respiração"
 * - Nó tórico girando ao fundo
 * - Parallax suave seguindo o mouse
 */
export default function NebulaScene() {
  const mountRef = useRef(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x000000, 0.05);

    const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 100);
    camera.position.set(0, 0, 7);

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: false, powerPreference: "low-power" });
    renderer.setPixelRatio(1);
    renderer.setSize(window.innerWidth, window.innerHeight);
    mount.appendChild(renderer.domElement);

    // Nebulosa de partículas
    const COUNT = 320;
    const positions = new Float32Array(COUNT * 3);
    for (let i = 0; i < COUNT; i++) {
      const r = 3.5 + Math.random() * 10;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta) * 0.6;
      positions[i * 3 + 2] = r * Math.cos(phi) - 4;
    }
    const particlesGeo = new THREE.BufferGeometry();
    particlesGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const particlesMat = new THREE.PointsMaterial({
      color: 0xff3350,
      size: 0.06,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
    });
    const particles = new THREE.Points(particlesGeo, particlesMat);
    scene.add(particles);

    // Núcleo icosaédrico
    const coreGeo = new THREE.IcosahedronGeometry(2.2, 1);
    const coreMat = new THREE.MeshBasicMaterial({
      color: 0xff3344,
      wireframe: true,
      transparent: true,
      opacity: 0.16,
    });
    const core = new THREE.Mesh(coreGeo, coreMat);
    core.position.set(4.2, 1.2, -3.5);
    scene.add(core);

    // Nó tórico
    const knotGeo = new THREE.TorusKnotGeometry(0.85, 0.26, 48, 8);
    const knotMat = new THREE.MeshBasicMaterial({
      color: 0xff2244,
      wireframe: true,
      transparent: true,
      opacity: 0.13,
    });
    const knot = new THREE.Mesh(knotGeo, knotMat);
    knot.position.set(-5, -1.8, -2.5);
    scene.add(knot);

    // Parallax do mouse com interpolação suave
    let targetX = 0;
    let targetY = 0;
    let curX = 0;
    let curY = 0;
    const onMouse = (e) => {
      targetX = e.clientX / window.innerWidth - 0.5;
      targetY = e.clientY / window.innerHeight - 0.5;
    };
    window.addEventListener("mousemove", onMouse);

    const onResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener("resize", onResize);

    const clock = new THREE.Clock();
    let raf;
    let lastRender = 0;
    const tick = () => {
      const t = clock.getElapsedTime();
      // ~30fps: movimento ambiente não precisa de 60fps
      if (t - lastRender >= 1 / 30) {
        lastRender = t;
        curX += (targetX - curX) * 0.12;
        curY += (targetY - curY) * 0.12;

        particles.rotation.y = t * 0.018 + curX * 0.35;
        particles.rotation.x = curY * 0.2;
        core.rotation.y = t * 0.1;
        core.rotation.z = t * 0.06;
        core.scale.setScalar(1 + Math.sin(t * 0.6) * 0.04);
        knot.rotation.x = t * 0.12;
        knot.rotation.y = t * 0.15;

        camera.position.x = curX * 0.9;
        camera.position.y = -curY * 0.6;
        camera.lookAt(0, 0, 0);
        renderer.render(scene, camera);
      }
      raf = requestAnimationFrame(tick);
    };
    tick();

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("mousemove", onMouse);
      window.removeEventListener("resize", onResize);
      renderer.dispose();
      particlesGeo.dispose();
      particlesMat.dispose();
      coreGeo.dispose();
      coreMat.dispose();
      knotGeo.dispose();
      knotMat.dispose();
      if (renderer.domElement.parentNode === mount) {
        mount.removeChild(renderer.domElement);
      }
    };
  }, []);

  return <div ref={mountRef} aria-hidden="true" className="pointer-events-none fixed inset-0 -z-[5]" />;
}