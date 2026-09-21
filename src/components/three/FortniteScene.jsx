import React, { useEffect, useRef } from "react";
import * as THREE from "three";
import { cn } from "@/lib/utils";

/** Llama Nébula 3D em blocos, com rift e loot flutuante — inspirado em Fortnite. */
export default function FortniteScene({ className }) {
  const mountRef = useRef(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, (mount.clientWidth || 1) / (mount.clientHeight || 1), 0.1, 100);
    camera.position.set(0, 0.5, 5.4);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.setSize(mount.clientWidth || 1, mount.clientHeight || 1);
    mount.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight(0xffffff, 0.5));
    const key = new THREE.DirectionalLight(0xffffff, 1.1);
    key.position.set(3, 5, 4);
    scene.add(key);
    const redLight = new THREE.PointLight(0xff2e3d, 9, 14);
    redLight.position.set(-2, 1.5, 2);
    scene.add(redLight);

    const mat = (hex) => new THREE.MeshStandardMaterial({ color: hex, flatShading: true, roughness: 0.7 });
    const crimson = mat(0xd91e3d);
    const dark = mat(0x191920);
    const gold = mat(0xfbbf24);
    const white = mat(0xf3f3f3);

    // Llama em blocos
    const llama = new THREE.Group();
    llama.add(new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.95, 0.75), crimson));

    const head = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.6, 0.55), crimson);
    head.position.set(0.95, 0.55, 0);
    llama.add(head);

    const snout = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.35), white);
    snout.position.set(1.3, 0.4, 0);
    llama.add(snout);

    [-0.18, 0.18].forEach((z) => {
      const ear = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.3, 0.12), dark);
      ear.position.set(0.8, 0.95, z);
      llama.add(ear);
    });

    [-0.5, 0.5].forEach((x) =>
      [-0.22, 0.22].forEach((z) => {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.85, 0.18), dark);
        leg.position.set(x, -0.88, z);
        llama.add(leg);
      })
    );

    const saddle = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.22, 0.85), gold);
    saddle.position.set(-0.05, 0.56, 0);
    llama.add(saddle);

    llama.position.y = 0.15;
    scene.add(llama);

    // Rift estilo Fortnite (anel luminoso)
    const rift = new THREE.Mesh(
      new THREE.TorusGeometry(2.1, 0.05, 10, 72),
      new THREE.MeshBasicMaterial({ color: 0xff2e3d })
    );
    rift.position.set(0, 0.1, -0.9);
    rift.rotation.x = 0.12;
    scene.add(rift);

    // Loot flutuante
    const cubes = [];
    for (let i = 0; i < 8; i++) {
      const size = 0.08 + Math.random() * 0.1;
      const cube = new THREE.Mesh(new THREE.BoxGeometry(size, size, size), i % 2 ? gold : crimson);
      cube.position.set((Math.random() - 0.5) * 5, (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 2 - 1);
      cube.userData.speed = 0.4 + Math.random();
      scene.add(cube);
      cubes.push(cube);
    }

    let raf = 0;
    const clock = new THREE.Clock();
    const animate = () => {
      const t = clock.getElapsedTime();
      llama.rotation.y = 0.25 + Math.sin(t * 0.35) * 0.5;
      llama.position.y = 0.15 + Math.sin(t * 1.2) * 0.12;
      rift.rotation.z = t * 0.5;
      rift.scale.setScalar(1 + Math.sin(t * 2) * 0.03);
      cubes.forEach((c) => {
        c.rotation.x = t * c.userData.speed;
        c.rotation.y = t * c.userData.speed * 0.7;
        c.position.y += Math.sin(t * 1.5 + c.userData.speed * 5) * 0.0025;
      });
      renderer.render(scene, camera);
      raf = requestAnimationFrame(animate);
    };
    animate();

    const onResize = () => {
      if (!mount.clientWidth || !mount.clientHeight) return;
      camera.aspect = mount.clientWidth / mount.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(mount.clientWidth, mount.clientHeight);
    };
    const ro = new ResizeObserver(onResize);
    ro.observe(mount);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      scene.traverse((obj) => {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) obj.material.dispose && obj.material.dispose();
      });
      renderer.dispose();
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
    };
  }, []);

  return <div ref={mountRef} className={cn("h-full w-full", className)} />;
}