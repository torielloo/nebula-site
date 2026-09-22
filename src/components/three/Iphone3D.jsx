import React, { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { SVGLoader } from "three/examples/jsm/loaders/SVGLoader.js";

/** Smartphone premium laranja inspirado na linguagem visual de um iPhone Pro Max. */
export default function Iphone3D({ className = "h-64 w-full" }) {
  const mountRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const scene = new THREE.Scene();
    // Mantém folga suficiente para o aparelho nunca encostar no frustum ao girar.
    // A distância anterior (8.8) deixava o modelo quase no limite do canvas em alguns ângulos.
    const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 60);
    camera.position.set(0, 0.02, 10.4);

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    mount.appendChild(renderer.domElement);

    scene.add(new THREE.HemisphereLight(0xffffff, 0x21140b, 1.25));
    const key = new THREE.DirectionalLight(0xfff2df, 2.8);
    key.position.set(4, 5, 6);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xffa35c, 1.4);
    fill.position.set(-5, 0, 3);
    scene.add(fill);
    const rim = new THREE.PointLight(0xff7b32, 2.2, 18);
    rim.position.set(3, -1, -5);
    scene.add(rim);

    const phone = new THREE.Group();
    phone.rotation.z = -0.035;
    phone.scale.setScalar(0.92);
    scene.add(phone);

    const orange = new THREE.MeshPhysicalMaterial({
      color: 0xe87935,
      metalness: 0.72,
      roughness: 0.22,
      clearcoat: 0.72,
      clearcoatRoughness: 0.2,
    });
    const orangeBack = new THREE.MeshPhysicalMaterial({
      color: 0xf18342,
      metalness: 0.42,
      roughness: 0.3,
      clearcoat: 0.8,
      clearcoatRoughness: 0.18,
    });
    const blackMetal = new THREE.MeshStandardMaterial({ color: 0x080808, metalness: 0.85, roughness: 0.18 });
    const glass = new THREE.MeshPhysicalMaterial({ color: 0x030405, metalness: 0.05, roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.05 });

    // Chassi alto e fino, com cantos mais próximos de um Pro Max moderno.
    const frame = new THREE.Mesh(new RoundedBoxGeometry(2.55, 5.25, 0.36, 8, 0.32), orange);
    phone.add(frame);

    // Frente preta com moldura laranja bem fina.
    const screen = new THREE.Mesh(new RoundedBoxGeometry(2.38, 5.02, 0.035, 8, 0.27), glass);
    screen.position.z = 0.195;
    phone.add(screen);

    // Parte traseira laranja fosca.
    const back = new THREE.Mesh(new RoundedBoxGeometry(2.38, 5.02, 0.045, 8, 0.27), orangeBack);
    back.position.z = -0.195;
    phone.add(back);

    // Dynamic-island discreta na frente.
    const island = new THREE.Mesh(new RoundedBoxGeometry(0.72, 0.20, 0.035, 5, 0.09), blackMetal);
    island.position.set(0, 2.08, 0.225);
    phone.add(island);

    // Nova logo branca Nébula, convertida em geometria real.
    // Assim ela não depende mais de textura SVG e não some no WebGL.
    // Há exatamente uma logo na frente e uma atrás.
    const svgLoader = new SVGLoader();
    let logoLoadCancelled = false;

    svgLoader.load(
      "/brand/nebula-phone-mark.svg",
      (data) => {
        if (logoLoadCancelled) return;

        const path = data.paths?.[0];
        if (!path) return;

        const shapes = SVGLoader.createShapes(path);
        if (!shapes.length) return;

        const logoGeometry = new THREE.ShapeGeometry(shapes);
        logoGeometry.computeBoundingBox();

        const box = logoGeometry.boundingBox;
        const width = Math.max(0.001, box.max.x - box.min.x);
        const height = Math.max(0.001, box.max.y - box.min.y);
        const centerX = (box.min.x + box.max.x) / 2;
        const centerY = (box.min.y + box.max.y) / 2;

        logoGeometry.translate(-centerX, -centerY, 0);
        const normalizedScale = 1 / width;
        // Mantém a geometria com escala positiva. O flip vertical necessário
        // para converter as coordenadas SVG é feito em cada mesh, evitando
        // inverter silenciosamente o winding/normal da geometria.
        logoGeometry.scale(normalizedScale, normalizedScale, 1);

        const makeLogoMaterial = () => new THREE.MeshBasicMaterial({
          color: 0xffffff,
          transparent: false,
          opacity: 1,
          depthWrite: false,
          depthTest: true,
          toneMapped: false,
          // DoubleSide aqui é intencional: os flips de escala não podem fazer
          // a logo sumir por backface culling. O próprio corpo do celular
          // continua ocultando a logo da face oposta via depthTest.
          side: THREE.DoubleSide,
          polygonOffset: true,
          polygonOffsetFactor: -4,
          polygonOffsetUnits: -4,
        });

        const visualWidth = 1.56;

        // Frente: instância própria, colada alguns milímetros acima do vidro.
        const frontGeometry = logoGeometry.clone();
        const frontLogo = new THREE.Mesh(frontGeometry, makeLogoMaterial());
        frontLogo.name = "nebula-logo-front";
        frontLogo.scale.set(visualWidth, -visualWidth, 1);
        frontLogo.position.set(0, -0.12, 0.238);
        frontLogo.renderOrder = 30;
        phone.add(frontLogo);

        // Traseira: segunda instância independente. O X negativo compensa
        // o espelhamento causado pela rotação de 180° e deixa o símbolo correto.
        const backGeometry = logoGeometry.clone();
        const backLogo = new THREE.Mesh(backGeometry, makeLogoMaterial());
        backLogo.name = "nebula-logo-back";
        backLogo.scale.set(-visualWidth, visualWidth, 1);
        backLogo.position.set(0.10, -0.38, -0.238);
        backLogo.rotation.y = Math.PI;
        backLogo.renderOrder = 30;
        phone.add(backLogo);

        logoGeometry.dispose();

        renderer.render(scene, camera);
      },
      undefined,
      () => {}
    );

    // Ilha de câmeras traseira no canto superior esquerdo.
    const cameraPlate = new THREE.Mesh(new RoundedBoxGeometry(1.25, 1.48, 0.13, 6, 0.25), orange);
    cameraPlate.position.set(-0.48, 1.62, -0.245);
    phone.add(cameraPlate);

    const lensGlass = new THREE.MeshPhysicalMaterial({ color: 0x050506, metalness: 0.35, roughness: 0.08, clearcoat: 1 });
    const lensRing = new THREE.MeshStandardMaterial({ color: 0x171719, metalness: 0.95, roughness: 0.12 });
    const addLens = (x, y) => {
      const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.29, 0.29, 0.08, 32), lensRing);
      ring.rotation.x = Math.PI / 2;
      ring.position.set(x, y, -0.35);
      phone.add(ring);
      const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.225, 0.225, 0.09, 32), lensGlass);
      lens.rotation.x = Math.PI / 2;
      lens.position.set(x, y, -0.405);
      phone.add(lens);
      const glint = new THREE.Mesh(new THREE.CircleGeometry(0.055, 18), new THREE.MeshBasicMaterial({ color: 0x667788, transparent: true, opacity: 0.55 }));
      glint.position.set(x - 0.06, y + 0.07, -0.456);
      glint.rotation.y = Math.PI;
      phone.add(glint);
    };
    addLens(-0.76, 1.93);
    addLens(-0.24, 1.60);
    addLens(-0.76, 1.28);

    // Flash e sensor traseiros.
    const flash = new THREE.Mesh(new THREE.CircleGeometry(0.105, 24), new THREE.MeshBasicMaterial({ color: 0xffe3b8 }));
    flash.position.set(-0.20, 2.01, -0.325);
    flash.rotation.y = Math.PI;
    phone.add(flash);
    const sensor = new THREE.Mesh(new THREE.CircleGeometry(0.075, 24), blackMetal);
    sensor.position.set(-0.18, 1.25, -0.326);
    sensor.rotation.y = Math.PI;
    phone.add(sensor);

    // Botões laterais.
    const buttonMat = new THREE.MeshStandardMaterial({ color: 0xd96328, metalness: 0.8, roughness: 0.2 });
    [[-1.30, 1.15, 0.52], [-1.30, 0.25, 0.72], [1.30, 0.78, 0.82]].forEach(([x, y, h], i) => {
      const b = new THREE.Mesh(new RoundedBoxGeometry(0.055, h, 0.16, 3, 0.025), buttonMat);
      b.position.set(x, y, 0);
      phone.add(b);
    });

    // Sombra discreta embaixo, sem partículas.
    const shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(3.5, 1.0),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.22, depthWrite: false })
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.set(0, -2.85, 0);
    scene.add(shadow);

    const fit = () => {
      const w = mount.clientWidth || 240;
      const h = mount.clientHeight || 260;
      renderer.setSize(w, h, false);
      renderer.domElement.style.width = "100%";
      renderer.domElement.style.height = "100%";
      renderer.domElement.style.display = "block";
      camera.aspect = Math.max(0.72, w / h);
      camera.updateProjectionMatrix();
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(mount);

    const clock = new THREE.Clock();
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    let raf = 0;
    let visible = true;
    const io = typeof IntersectionObserver !== "undefined"
      ? new IntersectionObserver(([entry]) => { visible = !!entry?.isIntersecting; }, { threshold: 0.02 })
      : null;
    io?.observe(mount);
    const tick = () => {
      if (visible) {
        const t = clock.getElapsedTime();
        // ~24 segundos por volta: movimento contínuo e lento, sem balanço/flutuação.
        if (!reduceMotion) phone.rotation.y = 0.45 + t * (Math.PI * 2 / 24);
        renderer.render(scene, camera);
      }
      raf = requestAnimationFrame(tick);
    };
    tick();

    return () => {
      cancelAnimationFrame(raf);
      io?.disconnect();
      ro.disconnect();
      scene.traverse((obj) => {
        obj.geometry?.dispose?.();
        if (Array.isArray(obj.material)) obj.material.forEach((m) => m?.dispose?.());
        else obj.material?.dispose?.();
      });
      logoLoadCancelled = true;
      renderer.dispose();
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
    };
  }, []);

  return (
    <button type="button" onClick={() => navigate("/solucoes?aba=mobile")} aria-label="Abrir soluções de erros mobile" className="group block w-full cursor-pointer overflow-visible">
      <div ref={mountRef} className={`${className} overflow-visible`} />
    </button>
  );
}
