(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const status = $('status');
  const errorBox = $('error');
  const app = $('app');
  const panel = $('panel');
  const toggle = $('toggle');

  function fail(message) {
    status.textContent = 'Could not start';
    errorBox.style.display = 'block';
    errorBox.textContent = message;
  }

  toggle.addEventListener('click', () => {
    const hidden = panel.classList.toggle('hidden');
    toggle.textContent = hidden ? 'Show menu' : 'Hide menu';
  });

  window.addEventListener('error', (event) => fail('3D error:\n' + (event.message || 'Unknown error')));
  window.addEventListener('unhandledrejection', (event) => fail('3D loading error:\n' + String(event.reason || 'Unknown error')));

  if (!window.THREE) {
    fail('Three.js did not load. Check the internet connection, then refresh the page.');
    return;
  }
  if (!THREE.SVGLoader || !window.GLYPHS) {
    fail('The text geometry loader did not load. Refresh the page.');
    return;
  }

  const controls = {
    text1: $('text1'), text2: $('text2'), background: $('background'), textColor: $('textColor'),
    size: $('size'), depth: $('depth'), lineGap: $('lineGap'), speed: $('speed'), stagger: $('stagger'),
    lineDelay: $('lineDelay'), zoom: $('zoom'), motion: $('motion')
  };

  const defaults = {
    text1: 'J.S.R', text2: 'Speed Dial', background: 'green', textColor: '#000000', size: '3', depth: '.22',
    lineGap: '2.2', speed: '1', stagger: '.10', lineDelay: '.55', zoom: '4.8', motion: '.55'
  };

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  app.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, window.innerWidth / window.innerHeight, 0.1, 100);
  camera.position.set(0, 0, 8.2);

  const root = new THREE.Group();
  scene.add(root);

  // Plain lighting only: enough to reveal the extrusion, with no visual effects.
  scene.add(new THREE.HemisphereLight(0xffffff, 0x777777, 1.6));
  const key = new THREE.DirectionalLight(0xffffff, 2.1);
  key.position.set(-4, 5, 6);
  key.castShadow = true;
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xffffff, 0.65);
  rim.position.set(4, -2, 3);
  scene.add(rim);

  const loader = new THREE.SVGLoader();
  let letters = [];
  let startTime = performance.now() / 1000;
  let rebuildTimer = 0;

  function colorValue(name) {
    if (name === 'white') return 0xffffff;
    if (name === 'gray') return 0x202020;
    return 0x000000;
  }

  function setBackground() {
    const v = controls.background.value;
    const colors = { green: 0x00ff00, white: 0xffffff, gray: 0xd6d6d6, black: 0x000000 };
    scene.background = new THREE.Color(colors[v] ?? 0x00ff00);
    document.body.style.background = '#' + scene.background.getHexString();
  }

  function clearText() {
    letters.forEach((item) => {
      root.remove(item.group);
      item.group.traverse((object) => {
        if (object.geometry) object.geometry.dispose();
        if (object.material) {
          if (Array.isArray(object.material)) object.material.forEach((m) => m.dispose());
          else object.material.dispose();
        }
      });
    });
    letters = [];
  }

  function geometryForCharacter(character) {
    const glyph = window.GLYPHS[character] || window.GLYPHS[character.toUpperCase()] || window.GLYPHS['?'];
    if (!glyph || !glyph.d) return null;
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"><path d="' + glyph.d + '"/></svg>';
    const data = loader.parse(svg);
    const shapes = [];
    data.paths.forEach((path) => shapes.push.apply(shapes, path.toShapes(true)));
    if (!shapes.length) return null;

    const depth = Number(controls.depth.value) * window.UNITS_PER_EM;
    const bevel = Math.min(depth * 0.17, window.UNITS_PER_EM * 0.035);
    const geometry = new THREE.ExtrudeBufferGeometry(shapes, {
      depth: depth,
      bevelEnabled: true,
      bevelThickness: bevel,
      bevelSize: bevel * 0.75,
      bevelSegments: 2,
      curveSegments: 7,
      steps: 1
    });
    const scale = 1 / window.UNITS_PER_EM;
    // Keep the glyph orientation produced by SVGLoader. The previous extra Y flip made the words upside down.
    geometry.scale(scale, scale, scale);
    geometry.computeBoundingBox();
    const b = geometry.boundingBox;
    geometry.translate(-(b.min.x + b.max.x) / 2, -(b.min.y + b.max.y) / 2, -(b.min.z + b.max.z) / 2);
    geometry.computeVertexNormals();
    return geometry;
  }

  function measureLine(text, tracking) {
    let width = 0;
    for (let i = 0; i < text.length; i++) {
      const glyph = window.GLYPHS[text[i]] || window.GLYPHS[text[i].toUpperCase()] || { advance: 0.7 };
      width += glyph.advance + (i < text.length - 1 ? tracking : 0);
    }
    return width;
  }

  function addLine(text, y, lineIndex) {
    const tracking = 0.035;
    const total = measureLine(text, tracking);
    let cursor = -total / 2;
    let visibleIndex = 0;

    for (let i = 0; i < text.length; i++) {
      const character = text[i];
      const glyph = window.GLYPHS[character] || window.GLYPHS[character.toUpperCase()] || { advance: 0.7 };
      const advance = glyph.advance;
      const x = cursor + advance / 2;
      cursor += advance + tracking;
      if (character === ' ') continue;

      const geometry = geometryForCharacter(character);
      if (!geometry) continue;
      const frontColor = colorValue(controls.textColor.value);
      const sideColor = controls.textColor.value === 'black' ? 0x111111 : frontColor;
      const materials = [
        new THREE.MeshStandardMaterial({ color: frontColor, roughness: 0.9, metalness: 0, side: THREE.DoubleSide }),
        new THREE.MeshStandardMaterial({ color: sideColor, roughness: 0.82, metalness: 0, side: THREE.DoubleSide })
      ];
      const mesh = new THREE.Mesh(geometry, materials);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      const group = new THREE.Group();
      group.add(mesh);
      group.position.set(x, y, 0);
      root.add(group);
      letters.push({ group, baseX: x, baseY: y, line: lineIndex, index: visibleIndex++ });
    }
  }

  function fitText() {
    const box = new THREE.Box3().setFromObject(root);
    const size = new THREE.Vector3();
    box.getSize(size);
    const maxWidth = 5.65;
    const maxHeight = 3.2;
    const scale = Math.min(maxWidth / Math.max(size.x, 0.01), maxHeight / Math.max(size.y, 0.01)) * Number(controls.size.value);
    root.scale.setScalar(scale);
    const center = new THREE.Vector3();
    box.getCenter(center);
    root.position.set(-center.x * scale, -center.y * scale, 0);
  }

  function rebuild() {
    clearText();
    setBackground();
    const gap = Number(controls.lineGap.value);
    addLine(controls.text1.value || 'J.S.R', gap / 2, 0);
    addLine(controls.text2.value || 'Speed Dial', -gap / 2, 1);
    fitText();
    startTime = performance.now() / 1000;
    status.style.display = 'none';
  }

  function easeOutBack(x) {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
  }
  function clamp01(x) { return Math.max(0, Math.min(1, x)); }

  function animate() {
    requestAnimationFrame(animate);
    const now = performance.now() / 1000;
    const speed = Number(controls.speed.value);
    const stagger = Number(controls.stagger.value);
    const lineDelay = Number(controls.lineDelay.value);
    const motion = Number(controls.motion.value);
    const elapsed = (now - startTime) * speed;

    letters.forEach((item) => {
      const delay = item.index * stagger + item.line * lineDelay;
      const p = clamp01((elapsed - delay) / 0.9);
      const e = easeOutBack(p);
      item.group.visible = p > 0;
      item.group.position.x = item.baseX;
      item.group.position.y = item.baseY + (1 - e) * (item.line === 0 ? 1.3 : -1.3);
      item.group.position.z = (1 - e) * -2.2;
      item.group.rotation.x = (1 - e) * (item.line === 0 ? -0.9 : 0.9);
      item.group.rotation.y = (1 - e) * ((item.index % 2 ? 1 : -1) * 0.7);
      item.group.scale.setScalar(Math.max(0.001, 0.35 + e * 0.65));
    });

    camera.position.z = Number(controls.zoom.value) - Math.min(elapsed / 3.2, 1) * 0.45 * motion;
    camera.position.x = Math.sin(now * 0.42) * 0.11 * motion;
    camera.position.y = Math.cos(now * 0.36) * 0.06 * motion;
    camera.lookAt(0, 0, 0);
    renderer.render(scene, camera);
  }

  function updateOutputs() {
    $('sizeOut').textContent = Number(controls.size.value).toFixed(2) + '×';
    $('depthOut').textContent = Number(controls.depth.value).toFixed(2);
    $('lineGapOut').textContent = Number(controls.lineGap.value).toFixed(2);
    $('speedOut').textContent = Number(controls.speed.value).toFixed(2) + '×';
    $('staggerOut').textContent = Number(controls.stagger.value).toFixed(2) + ' s';
    $('lineDelayOut').textContent = Number(controls.lineDelay.value).toFixed(2) + ' s';
    $('zoomOut').textContent = Number(controls.zoom.value).toFixed(1);
    $('motionOut').textContent = Number(controls.motion.value).toFixed(2) + '×';
  }

  function scheduleRebuild() {
    updateOutputs();
    clearTimeout(rebuildTimer);
    rebuildTimer = setTimeout(rebuild, 120);
  }

  Object.values(controls).forEach((control) => {
    control.addEventListener('input', scheduleRebuild);
    control.addEventListener('change', scheduleRebuild);
  });

  $('replay').addEventListener('click', () => { startTime = performance.now() / 1000; });
  $('save').addEventListener('click', () => {
    const values = {};
    Object.keys(controls).forEach((key) => { values[key] = controls[key].value; });
    localStorage.setItem('jsr-clean-3d-settings-v2', JSON.stringify(values));
    $('save').textContent = 'Saved';
    setTimeout(() => { $('save').textContent = 'Save settings'; }, 900);
  });
  $('reset').addEventListener('click', () => {
    Object.keys(defaults).forEach((key) => { controls[key].value = defaults[key]; });
    localStorage.removeItem('jsr-clean-3d-settings-v2');
    updateOutputs();
    rebuild();
  });

  try {
    const saved = JSON.parse(localStorage.getItem('jsr-clean-3d-settings-v2') || 'null');
    if (saved) Object.keys(saved).forEach((key) => { if (controls[key]) controls[key].value = saved[key]; });
  } catch (_) {}

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  updateOutputs();
  rebuild();
  animate();
}());
