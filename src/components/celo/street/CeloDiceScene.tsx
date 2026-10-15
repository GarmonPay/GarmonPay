"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";

import { stepDice, DICE_RADIUS, type VisualBody } from "./celo-dice-motion";

const normals = [new THREE.Vector3(0,1,0),new THREE.Vector3(1,0,0),new THREE.Vector3(0,0,1),new THREE.Vector3(0,0,-1),new THREE.Vector3(-1,0,0),new THREE.Vector3(0,-1,0)];
const dots = [[],[[0,0]],[[-1,-1],[1,1]],[[-1,-1],[0,0],[1,1]],[[-1,-1],[-1,1],[1,-1],[1,1]],[[-1,-1],[-1,1],[0,0],[1,-1],[1,1]],[[-1,-1],[-1,0],[-1,1],[1,-1],[1,0],[1,1]]];
/** Presentation only: rotations finish on the supplied server face; no outcome generation. */
export function CeloDiceScene(props: {settled: [number,number,number] | null; throwing: boolean; holding: boolean; variant: number}) {
  const host = useRef<HTMLDivElement>(null), live = useRef(props);
  const [failed,setFailed] = useState(false);
  live.current = props;
  useEffect(() => {
    const node = host.current;
    if (!node) return;
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({antialias:true,alpha:true}); } catch {setFailed(true);return;}
    renderer.setPixelRatio(Math.min(devicePixelRatio,2));
    renderer.shadowMap.enabled=true; renderer.shadowMap.type=THREE.PCFSoftShadowMap;
    renderer.toneMapping=THREE.ACESFilmicToneMapping; renderer.toneMappingExposure=1.25;
    node.appendChild(renderer.domElement);
    const scene=new THREE.Scene();
    const environment=new RoomEnvironment(), pmrem=new THREE.PMREMGenerator(renderer), env=pmrem.fromScene(environment);scene.environment=env.texture;environment.dispose();pmrem.dispose();
    const camera=new THREE.PerspectiveCamera(38,1,.1,100);
    scene.add(new THREE.HemisphereLight(0xe5d5ff,0x322017,.85));
    const key=new THREE.DirectionalLight(0xffe2a1,2.1);key.position.set(-3,8,5);key.castShadow=true;key.shadow.mapSize.set(1024,1024);key.shadow.camera.left=-10;key.shadow.camera.right=10;key.shadow.camera.top=8;key.shadow.camera.bottom=-8;key.shadow.normalBias=.015;scene.add(key);
    const rim=new THREE.PointLight(0xb72cff,35);rim.position.set(4,3,-3);scene.add(rim);
    const charcoal=new THREE.MeshPhysicalMaterial({color:0x06080b,roughness:.23,metalness:.3,envMapIntensity:.22,clearcoat:1,clearcoatRoughness:.12});
    const gold=new THREE.MeshPhysicalMaterial({color:0xf9b82f,metalness:.8,roughness:.24,envMapIntensity:.65,clearcoat:.7});
    const weave=document.createElement("canvas");weave.width=weave.height=128;const ctx=weave.getContext("2d")!;
    for(let y=0;y<128;y++)for(let x=0;x<128;x++){const shade=30+Math.round(7*Math.sin(x*17+y*31));ctx.fillStyle=`rgb(${shade},${shade},${shade})`;ctx.fillRect(x,y,1,1);}
    const fabric=new THREE.CanvasTexture(weave);fabric.wrapS=fabric.wrapT=THREE.RepeatWrapping;fabric.repeat.set(12,12);
    const felt=new THREE.MeshStandardMaterial({color:0x012019,roughness:1,bumpMap:fabric,bumpScale:.025});
    const table=new THREE.Mesh(new THREE.CylinderGeometry(1,1,.16,96),felt);table.position.y=-.08;table.receiveShadow=true;scene.add(table);
    const rail=new THREE.Mesh(new THREE.TorusGeometry(1,.025,12,96),gold);rail.rotation.x=-Math.PI/2;rail.position.y=.02;scene.add(rail);
    const bodyGeometry=new RoundedBoxGeometry(.72,.72,.72,4,.065), pipGeometry=new THREE.SphereGeometry(.052,16,10);
    const dice=Array.from({length:3},()=>{
      const group=new THREE.Group();const body=new THREE.Mesh(bodyGeometry,charcoal);body.castShadow=true;body.receiveShadow=true;group.add(body);
      normals.forEach((normal,index)=>{const face=new THREE.Group();face.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),normal);face.position.copy(normal).multiplyScalar(.357);for(const [x,y] of dots[index+1]){const pip=new THREE.Mesh(pipGeometry,gold);pip.scale.z=.22;pip.position.set(x*.18,y*.18,0);face.add(pip);}group.add(face);});scene.add(group);return group;
    });
    let frame=0, width=1,height=1, started=0, previous=false, last=0;
    let bodies: VisualBody[]=[];
    const resize=()=>{width=node.clientWidth;height=node.clientHeight;if(!width||!height)return;renderer.setSize(width,height);camera.aspect=width/height;camera.position.set(0,7,7);camera.lookAt(0,0,0);camera.updateProjectionMatrix();const viewH=2*Math.tan(THREE.MathUtils.degToRad(19))*Math.sqrt(98);table.scale.set(Math.max(3,viewH*camera.aspect*.47),1,4.4);rail.scale.set(table.scale.x,4.4,1);};
    const observer=new ResizeObserver(resize);observer.observe(node);resize();
    const render=(now:number)=>{
      const state=live.current;if(state.throwing&&!previous){started=now;bodies=dice.map((_,i)=>({x:(i-1)*1.3,y:1.9+i*.12,z:1.4,vx:(1-i)*2.4,vy:2+i*.25,vz:-2.2-i*.3}));}previous=state.throwing;
      if(state.throwing)stepDice(bodies,(now-last)/1000,Math.max(2,table.scale.x-1));last=now;
      const t=Math.min(1,(now-started)/1200);
      dice.forEach((die,i)=>{
        die.visible=!!state.settled||state.holding||state.throwing;
        const face=state.settled?.[i]??(i+1), target=new THREE.Quaternion().setFromUnitVectors(normals[Math.max(0,Math.min(5,face-1))],new THREE.Vector3(0,1,0));
        target.premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),(i-1)*.32));
        let lift=0;
        if(state.holding){die.position.set((i-1)*.77+Math.sin(now/70)*.1,1.6+Math.cos(now/90)*.12,1.1);die.quaternion.setFromEuler(new THREE.Euler(now/190+i,now/170,now/230));}
        else if(state.throwing&&t<1){
          const body=bodies[i], blend=Math.max(0,(t-.7)/.3);
          die.position.set(THREE.MathUtils.lerp(body.x,(i-1)*1.35,blend),0,THREE.MathUtils.lerp(body.z,0,blend));
          lift=Math.max(0,body.y-DICE_RADIUS)*(1-blend);
          const spin=new THREE.Quaternion().setFromEuler(new THREE.Euler((1-t)*Math.PI*6,(1-t)*Math.PI*4,(1-t)*Math.PI*2));die.quaternion.copy(target).multiply(spin);
        } else {die.position.set((i-1)*1.35,0,0);die.quaternion.copy(target);}
        if(!state.holding){const m=new THREE.Matrix4().makeRotationFromQuaternion(die.quaternion).elements;die.position.y=.36*(Math.abs(m[1])+Math.abs(m[5])+Math.abs(m[9]))+.012+lift;}
      });
      renderer.render(scene,camera);frame=requestAnimationFrame(render);
    };
    frame=requestAnimationFrame(render);
    const lost=(event:Event)=>{event.preventDefault();setFailed(true);};renderer.domElement.addEventListener('webglcontextlost',lost);
    return()=>{cancelAnimationFrame(frame);observer.disconnect();renderer.domElement.removeEventListener('webglcontextlost',lost);scene.traverse(object=>{if(object instanceof THREE.Mesh)object.geometry.dispose();});[charcoal,gold,felt].forEach(material=>material.dispose());env.dispose();fabric.dispose();renderer.dispose();renderer.domElement.remove();};
  },[]);
  return <div ref={host} className="celo-dice-canvas" aria-hidden="true">{failed ? <span className="celo-render-fallback">3D preview unavailable — see dice result below</span> : null}</div>;
}
