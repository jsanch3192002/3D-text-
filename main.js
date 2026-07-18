import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { Text } from 'troika-three-text';

const $ = id => document.getElementById(id);
const app = $('app'), status = $('status'), panel = $('panel'), menuButton = $('menuButton');

const fields = {
  text1:$('text1'), text2:$('text2'), color:$('color'), background:$('background'),
  size:$('size'), speed:$('speed'), bloom:$('bloom'), stagger:$('stagger'),
  lineDelay:$('lineDelay'), lineGap:$('lineGap'), zoom:$('zoom'), motion:$('motion')
};

const defaults = {
  text1:'GALAXY', text2:'DRAGON', color:'#9b24ff', background:'black',
  size:'.82', speed:'1', bloom:'1.25', stagger:'.13',
  lineDelay:'.85', lineGap:'1.35', zoom:'7.6', motion:'1'
};

const renderer = new THREE.WebGLRenderer({antialias:true, alpha:true, powerPreference:'high-performance'});
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.7));
renderer.setSize(innerWidth, innerHeight);
renderer.setClearColor(0x000000, 0);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(34, innerWidth/innerHeight, .1, 100);
camera.position.set(0,0,7.6);

const composer = new EffectComposer(renderer);
composer.setPixelRatio(Math.min(devicePixelRatio, 1.7));
composer.addPass(new RenderPass(scene,camera));
const bloomPass = new UnrealBloomPass(new THREE.Vector2(innerWidth,innerHeight),1.25,.72,.18);
composer.addPass(bloomPass);
composer.addPass(new OutputPass());

const root = new THREE.Group();
scene.add(root);

const bgGlow = new THREE.Mesh(
  new THREE.PlaneGeometry(18,12),
  new THREE.ShaderMaterial({
    transparent:true, depthWrite:false,
    uniforms:{uColor:{value:new THREE.Color(fields.color.value)},uAlpha:{value:.55}},
    vertexShader:`varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader:`varying vec2 vUv;uniform vec3 uColor;uniform float uAlpha;
      void main(){float d=distance(vUv,vec2(.5));float a=smoothstep(.58,.05,d)*uAlpha;
      gl_FragColor=vec4(uColor,a);}`
  })
);
bgGlow.position.z=-3;
scene.add(bgGlow);

const starsGeo = new THREE.BufferGeometry();
const starCount = 180;
const pos = new Float32Array(starCount*3);
for(let i=0;i<starCount;i++){
  pos[i*3]=(Math.random()-.5)*16; pos[i*3+1]=(Math.random()-.5)*10; pos[i*3+2]=-2-Math.random()*5;
}
starsGeo.setAttribute('position',new THREE.BufferAttribute(pos,3));
const stars = new THREE.Points(starsGeo,new THREE.PointsMaterial({size:.035,color:0xb9d8ff,transparent:true,opacity:.5,depthWrite:false}));
scene.add(stars);

const clock = new THREE.Clock();
let startTime = performance.now()/1000;
let letters = [];
let syncPending = 0;
const fontURL = new URL('./Over%20There.ttf', import.meta.url).href;

function easeOutBack(x){
  const c1=1.70158,c3=c1+1;
  return 1+c3*Math.pow(x-1,3)+c1*Math.pow(x-1,2);
}
function clamp01(x){return Math.max(0,Math.min(1,x));}
function smooth(x){return x*x*(3-2*x);}
function rand(seed){return (Math.sin(seed*999.91)*43758.5453)%1;}
function seeded(seed){const x=Math.sin(seed*91.17+17.3)*43758.5453;return x-Math.floor(x);}

function disposeLetters(){
  for(const item of letters){
    root.remove(item.group);
    item.front.dispose();
    for(const layer of item.layers) layer.dispose();
  }
  letters=[];
}

function createGlyph(char, line, index, count){
  const group=new THREE.Group();
  const front=new Text();
  front.text=char;
  front.font=fontURL;
  front.fontSize=1;
  front.anchorX='center';
  front.anchorY='middle';
  front.color=0xffffff;
  front.outlineWidth=.025;
  front.outlineColor=new THREE.Color(fields.color.value);
  front.outlineOpacity=1;
  front.strokeWidth=.012;
  front.strokeColor=0xdaf4ff;
  front.material = new THREE.MeshPhysicalMaterial({
    color:0xeaf7ff, metalness:.88, roughness:.12, clearcoat:1,
    clearcoatRoughness:.08, emissive:new THREE.Color(fields.color.value), emissiveIntensity:.33,
    transparent:true, opacity:1, side:THREE.DoubleSide
  });
  group.add(front);

  const layers=[];
  for(let d=1;d<=8;d++){
    const layer=new Text();
    layer.text=char; layer.font=fontURL; layer.fontSize=1;
    layer.anchorX='center'; layer.anchorY='middle';
    layer.color=new THREE.Color(fields.color.value).multiplyScalar(.28+.035*d);
    layer.position.z=-.035*d;
    layer.position.x=.012*d;
    layer.position.y=-.01*d;
    layer.outlineWidth=.01;
    layer.outlineColor=0x05020c;
    layer.material = new THREE.MeshStandardMaterial({
      color:new THREE.Color(fields.color.value).multiplyScalar(.22),
      metalness:.95, roughness:.23, emissive:new THREE.Color(fields.color.value), emissiveIntensity:.08
    });
    group.add(layer); layers.push(layer);
  }

  const width=1.02;
  const x=(index-(count-1)/2)*width;
  const y=line===0 ? Number(fields.lineGap.value)/2 : -Number(fields.lineGap.value)/2;
  group.position.set(x,y,0);
  root.add(group);

  syncPending += 1+layers.length;
  const done=()=>{syncPending--;if(syncPending<=0)status.textContent='Ready — use the menu to edit and replay.'};
  front.sync(done); layers.forEach(l=>l.sync(done));

  return {group,front,layers,line,index,count,base:new THREE.Vector3(x,y,0),
    seed:line*50+index+1};
}

function build(){
  disposeLetters();
  const lines=[(fields.text1.value||'GALAXY').toUpperCase(),(fields.text2.value||'DRAGON').toUpperCase()];
  lines.forEach((text,line)=>{
    [...text].forEach((char,index)=>{
      if(char!==' ') letters.push(createGlyph(char,line,index,text.length));
    });
  });
  fitText();
  restart();
}

function fitText(){
  const maxCount=Math.max(fields.text1.value.length,fields.text2.value.length,1);
  const auto=Math.min(1,6.2/maxCount);
  const scale=Number(fields.size.value)*auto;
  root.scale.setScalar(scale);
}

function restart(){startTime=performance.now()/1000;}

function setBackground(){
  const mode=fields.background.value;
  if(mode==='transparent'){
    renderer.setClearColor(0x000000,0); bgGlow.visible=false; stars.visible=false;
  }else if(mode==='green'){
    renderer.setClearColor(0x00ff00,1); bgGlow.visible=false; stars.visible=false;
  }else{
    renderer.setClearColor(0x000000,1); bgGlow.visible=true; stars.visible=true;
  }
}

function applyVisuals(rebuild=false){
  bloomPass.strength=Number(fields.bloom.value);
  camera.position.z=Number(fields.zoom.value);
  bgGlow.material.uniforms.uColor.value.set(fields.color.value);
  for(const item of letters){
    item.front.outlineColor=new THREE.Color(fields.color.value);
    item.front.material.emissive.set(fields.color.value);
    item.layers.forEach((l,i)=>{
      l.color=new THREE.Color(fields.color.value).multiplyScalar(.28+.035*(i+1));
      l.material.color.set(fields.color.value).multiplyScalar(.22);
      l.material.emissive.set(fields.color.value);
    });
  }
  fitText(); setBackground(); updateLabels();
  if(rebuild) build();
}

function updateLabels(){
  $('sizeOut').textContent=Number(fields.size.value).toFixed(2)+'×';
  $('speedOut').textContent=Number(fields.speed.value).toFixed(2)+'×';
  $('bloomOut').textContent=Number(fields.bloom.value).toFixed(2);
  $('staggerOut').textContent=Number(fields.stagger.value).toFixed(2)+' s';
  $('lineDelayOut').textContent=Number(fields.lineDelay.value).toFixed(2)+' s';
  $('lineGapOut').textContent=Number(fields.lineGap.value).toFixed(2);
  $('zoomOut').textContent=Number(fields.zoom.value).toFixed(1);
  $('motionOut').textContent=Number(fields.motion.value).toFixed(2)+'×';
}

function animate(){
  requestAnimationFrame(animate);
  const now=performance.now()/1000;
  const speed=Number(fields.speed.value);
  const motion=Number(fields.motion.value);
  const t=(now-startTime)*speed;

  stars.rotation.z=t*.015;
  stars.position.y=Math.sin(t*.2)*.08;

  let maxDelay=0;
  for(const item of letters){
    const stagger=Number(fields.stagger.value);
    const lineDelay=item.line===1?Number(fields.lineDelay.value):0;
    const delay=.22+item.index*stagger+lineDelay;
    maxDelay=Math.max(maxDelay,delay);
    const p=clamp01((t-delay)/1.15);
    const e=easeOutBack(p);
    const s=item.seed;
    const side=item.index%2===0?-1:1;

    const startX=side*(2.7+seeded(s)*1.7)*motion;
    const startY=(seeded(s+2)-.5)*3.1*motion;
    const startZ=-5.2-(seeded(s+4)*2.4);
    const rx=(seeded(s+7)-.5)*Math.PI*2.2*motion;
    const ry=side*(1.4+seeded(s+9)*1.6)*motion;
    const rz=(seeded(s+11)-.5)*1.8*motion;

    item.group.visible=p>0;
    item.group.position.set(
      item.base.x+(1-e)*startX,
      item.base.y+(1-e)*startY,
      (1-e)*startZ
    );
    item.group.rotation.set((1-e)*rx,(1-e)*ry,(1-e)*rz);
    const sc=.18+.82*e;
    item.group.scale.setScalar(sc);

    if(p>=1){
      const ft=t-delay;
      item.group.position.x=item.base.x+Math.sin(ft*1.4+s)*.025*motion;
      item.group.position.y=item.base.y+Math.sin(ft*1.8+s*.7)*.055*motion;
      item.group.position.z=Math.sin(ft*1.2+s)*.045*motion;
      item.group.rotation.x=Math.sin(ft*1.1+s)*.025*motion;
      item.group.rotation.y=Math.sin(ft*.95+s*.5)*.05*motion;
      item.group.rotation.z=Math.sin(ft*1.25+s*.9)*.018*motion;
    }
  }

  // Camera sequence modeled after the reference: wide reveal, brief push-in, settle.
  const reveal=smooth(clamp01(t/1.5));
  const push=smooth(clamp01((t-(maxDelay+.35))/1.2));
  const settle=smooth(clamp01((t-(maxDelay+1.55))/1.2));
  camera.position.z=Number(fields.zoom.value)-reveal*.25-push*.38+settle*.31;
  camera.position.x=Math.sin(t*.36)*.07*motion;
  camera.position.y=Math.sin(t*.29)*.045*motion;
  root.rotation.y=Math.sin(t*.33)*.025*motion;
  root.rotation.x=Math.sin(t*.27)*.018*motion;

  composer.render();
}

for(const key of ['text1','text2']) fields[key].addEventListener('change',()=>build());
for(const key of ['color','background','size','bloom','lineGap','zoom']) fields[key].addEventListener('input',()=>applyVisuals(false));
for(const key of ['speed','stagger','lineDelay','motion']) fields[key].addEventListener('input',updateLabels);

$('replay').addEventListener('click',restart);
$('save').addEventListener('click',()=>{
  const data={}; Object.entries(fields).forEach(([k,v])=>data[k]=v.value);
  localStorage.setItem('galaxyThreeTitle',JSON.stringify(data));
  $('save').textContent='Saved'; setTimeout(()=>$('save').textContent='Save settings',800);
});
$('reset').addEventListener('click',()=>{
  Object.entries(defaults).forEach(([k,v])=>fields[k].value=v);
  localStorage.removeItem('galaxyThreeTitle'); build(); applyVisuals(false);
});
menuButton.addEventListener('click',()=>{
  panel.classList.toggle('hidden');
  menuButton.textContent=panel.classList.contains('hidden')?'Show menu':'Hide menu';
});

addEventListener('resize',()=>{
  camera.aspect=innerWidth/innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth,innerHeight); composer.setSize(innerWidth,innerHeight);
});

try{
  const saved=JSON.parse(localStorage.getItem('galaxyThreeTitle')||'null');
  if(saved) Object.entries(saved).forEach(([k,v])=>{if(fields[k])fields[k].value=v});
}catch{}

build(); applyVisuals(false); animate();
