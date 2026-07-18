import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const $ = id => document.getElementById(id);
const status = $('status');
const panel = $('panel');
const showMenu = $('showMenu');

const renderer = new THREE.WebGLRenderer({ antialias:true, alpha:false, powerPreference:'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.6));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
document.body.prepend(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x02030b);
const camera = new THREE.PerspectiveCamera(38, innerWidth/innerHeight, 0.1, 100);
camera.position.set(0, 0.2, 9.6);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.enablePan = false;
controls.minDistance = 5;
controls.maxDistance = 18;
controls.target.set(0,0,0);

const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
pmrem.dispose();

scene.add(new THREE.HemisphereLight(0x91a9ff,0x050510,1.5));
const key = new THREE.DirectionalLight(0xaec6ff,7); key.position.set(-4,5,6); scene.add(key);
const rim = new THREE.PointLight(0x6633ff,80,20,2); rim.position.set(4,1,3); scene.add(rim);
const cyan = new THREE.PointLight(0x00bbff,55,18,2); cyan.position.set(-5,-1,4); scene.add(cyan);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene,camera));
const bloomPass = new UnrealBloomPass(new THREE.Vector2(innerWidth,innerHeight),0.85,0.48,0.62);
composer.addPass(bloomPass);
composer.addPass(new OutputPass());

const titleRoot = new THREE.Group(); scene.add(titleRoot);
const stars = makeStars(); scene.add(stars);
let font, letterEntries = [], animationStart = performance.now();

const material = new THREE.MeshPhysicalMaterial({
  color:0x507dff, metalness:1, roughness:0.16, clearcoat:1, clearcoatRoughness:0.08,
  emissive:0x071536, emissiveIntensity:1.1, envMapIntensity:2.4
});
const sideMaterial = material.clone(); sideMaterial.color.set(0x101a55); sideMaterial.roughness=0.24;

function makeStars(){
  const n=1100, pos=new Float32Array(n*3);
  for(let i=0;i<n;i++){const r=18+Math.random()*26,a=Math.random()*Math.PI*2,z=(Math.random()-.5)*28;pos[i*3]=Math.cos(a)*r;pos[i*3+1]=z;pos[i*3+2]=Math.sin(a)*r-10}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(pos,3));
  return new THREE.Points(g,new THREE.PointsMaterial({color:0x9eb6ff,size:.045,sizeAttenuation:true,transparent:true,opacity:.82}));
}

function opentypePathToShapes(path, scale=1){
  const shapes=[], holes=[]; let current=null, start=null;
  const makePath=()=>new THREE.Shape();
  for(const c of path.commands){
    const x=(c.x||0)*scale, y=-(c.y||0)*scale;
    if(c.type==='M'){
      if(current){ current.autoClose=true; shapes.push(current); }
      current=makePath(); current.moveTo(x,y); start=[x,y];
    } else if(c.type==='L') current?.lineTo(x,y);
    else if(c.type==='C') current?.bezierCurveTo(c.x1*scale,-c.y1*scale,c.x2*scale,-c.y2*scale,x,y);
    else if(c.type==='Q') current?.quadraticCurveTo(c.x1*scale,-c.y1*scale,x,y);
    else if(c.type==='Z' && current){ if(start) current.lineTo(...start); current.autoClose=true; shapes.push(current); current=null; }
  }
  if(current){current.autoClose=true;shapes.push(current)}
  // ShapeUtils determines winding; reverse classification where needed.
  const solids=[];
  for(const s of shapes){
    const pts=s.getPoints(16);
    if(pts.length<3) continue;
    if(THREE.ShapeUtils.isClockWise(pts)) solids.push(s); else holes.push(s);
  }
  if(!solids.length && shapes.length) solids.push(shapes[0]);
  for(const h of holes){
    const hp=h.getPoints(12); const p=hp[0];
    let owner=solids.find(s=>pointInPolygon(p,s.getPoints(16)));
    if(owner) owner.holes.push(h); else solids.push(h);
  }
  return solids;
}
function pointInPolygon(p,vs){let inside=false;for(let i=0,j=vs.length-1;i<vs.length;j=i++){const xi=vs[i].x,yi=vs[i].y,xj=vs[j].x,yj=vs[j].y;const hit=((yi>p.y)!=(yj>p.y))&&(p.x<(xj-xi)*(p.y-yi)/(yj-yi+1e-9)+xi);if(hit)inside=!inside}return inside}

function clearTitle(){
  titleRoot.traverse(o=>{if(o.geometry)o.geometry.dispose()});
  titleRoot.clear(); letterEntries=[];
}

function buildLine(text, y, settings, lineIndex){
  const glyphs=[]; let total=0; const fontSize=1.55; const scale=fontSize/font.unitsPerEm;
  for(const char of text.toUpperCase()){
    const glyph=font.charToGlyph(char), advance=(glyph.advanceWidth||font.unitsPerEm*.6)*scale;
    glyphs.push({char,glyph,advance}); total += advance + settings.spacing;
  }
  total-=settings.spacing;
  let x=-total/2;
  glyphs.forEach((item,i)=>{
    const path=item.glyph.getPath(0,0,font.unitsPerEm);
    const shapes=opentypePathToShapes(path,scale);
    const geom=new THREE.ExtrudeGeometry(shapes,{depth:settings.depth,bevelEnabled:settings.bevel>0,bevelThickness:settings.bevel,bevelSize:settings.bevel,bevelSegments:4,curveSegments:10,steps:1});
    geom.computeBoundingBox(); const bb=geom.boundingBox; const gx=(bb.max.x-bb.min.x)/2; const gy=(bb.max.y-bb.min.y)/2;
    geom.translate(-gx-bb.min.x,-gy-bb.min.y,-settings.depth/2);
    geom.computeVertexNormals();
    const mesh=new THREE.Mesh(geom,[material,sideMaterial]); mesh.castShadow=true;
    const group=new THREE.Group(); group.add(mesh); group.position.set(x+item.advance/2,y,0); titleRoot.add(group);
    const glowMesh=new THREE.Mesh(geom, new THREE.MeshBasicMaterial({color:0x193cff,transparent:true,opacity:.12,side:THREE.BackSide,blending:THREE.AdditiveBlending,depthWrite:false}));
    glowMesh.scale.set(1.025,1.025,1.025); group.add(glowMesh);
    letterEntries.push({group, target:new THREE.Vector3(x+item.advance/2,y,0), index:i, line:lineIndex});
    x += item.advance+settings.spacing;
  });
}

function currentSettings(){return {spacing:+$('spacing').value, lineGap:+$('lineGap').value, depth:+$('depth').value, bevel:+$('bevel').value}}
function rebuild(){
  if(!font)return; clearTitle(); const s=currentSettings();
  buildLine($('line1').value||'GALAXY',s.lineGap/2,s,0);
  buildLine($('line2').value||'DRAGON',-s.lineGap/2,s,1);
  titleRoot.rotation.set(-0.02,0,0); animationStart=performance.now(); status.textContent='Ready — tap Replay.';
}

function replay(){animationStart=performance.now();}
function easeOutBack(x){const c1=1.70158,c3=c1+1;return 1+c3*Math.pow(x-1,3)+c1*Math.pow(x-1,2)}
function animateLetters(now){
  const speed=+$('speed').value; const elapsed=(now-animationStart)/1000*speed;
  for(const e of letterEntries){
    const delay=e.line*.34+e.index*.095, p=THREE.MathUtils.clamp((elapsed-delay)/1.05,0,1), q=easeOutBack(p);
    e.group.position.copy(e.target);
    e.group.position.z=THREE.MathUtils.lerp(-5.2,0,q);
    e.group.position.y += (1-p)*((e.index%2?1:-1)*1.1);
    e.group.rotation.x=(1-p)*(e.index%2?1.15:-1.0);
    e.group.rotation.y=(1-p)*(e.index%3-1)*1.35;
    e.group.rotation.z=(1-p)*(e.index%2?-.45:.45);
    const sc=Math.max(.001,THREE.MathUtils.lerp(.12,1,q)); e.group.scale.setScalar(sc);
  }
  const settle=THREE.MathUtils.clamp((elapsed-1.8)/2.4,0,1);
  titleRoot.rotation.y=Math.sin(now*.00034)*.09*(.35+settle);
  titleRoot.rotation.x=-.035+Math.sin(now*.00025)*.025;
}

function applyBackground(){
  const v=$('background').value;
  stars.visible=v==='space'; scene.background=new THREE.Color(v==='green'?0x00ff00:v==='black'?0x000000:0x02030b);
}

$('apply').onclick=rebuild; $('replay').onclick=replay;
$('hide').onclick=()=>{panel.classList.add('hidden');showMenu.classList.add('visible')};
showMenu.onclick=()=>{panel.classList.remove('hidden');showMenu.classList.remove('visible')};
$('background').onchange=applyBackground;
$('bloom').oninput=()=>bloomPass.strength=+$('bloom').value;
$('radius').oninput=()=>bloomPass.radius=+$('radius').value;
$('camera').oninput=()=>{camera.position.z=+$('camera').value};
$('tint').oninput=()=>{material.color.set($('tint').value);material.emissive.copy(material.color).multiplyScalar(.08)};
$('save').onclick=()=>{const data={};document.querySelectorAll('#panel input,#panel select').forEach(el=>data[el.id]=el.value);localStorage.setItem('galaxyTitleSettings',JSON.stringify(data));status.textContent='Settings saved.'};

try{const saved=JSON.parse(localStorage.getItem('galaxyTitleSettings')||'null');if(saved)for(const[k,v]of Object.entries(saved)){const el=$(k);if(el)el.value=v}}catch{}
applyBackground(); bloomPass.strength=+$('bloom').value; bloomPass.radius=+$('radius').value; camera.position.z=+$('camera').value;

window.addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);composer.setSize(innerWidth,innerHeight);renderer.setPixelRatio(Math.min(devicePixelRatio,1.6))});

function loop(now){requestAnimationFrame(loop);controls.update();animateLetters(now);stars.rotation.y=now*.000015;rim.position.x=Math.sin(now*.0007)*5;cyan.position.x=Math.cos(now*.00055)*5;composer.render()}
requestAnimationFrame(loop);

opentype.load('./Over%20There.ttf',(err,loaded)=>{
  if(err){console.error(err);status.textContent='Font failed to load. Check “Over There.ttf” is in the repository root.';return}
  font=loaded; rebuild();
});
