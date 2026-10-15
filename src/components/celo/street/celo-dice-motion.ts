/** Visual physics only. Never generates or changes game outcomes. */
export type VisualBody = {x:number;y:number;z:number;vx:number;vy:number;vz:number};
export const DICE_RADIUS=.63;
export function stepDice(bodies:VisualBody[],dt:number,bounds:number) {
  const h=Math.min(.025,Math.max(0,dt));
  for(const b of bodies){b.vy-=12*h;b.x+=b.vx*h;b.y+=b.vy*h;b.z+=b.vz*h;
    if(b.y<DICE_RADIUS){b.y=DICE_RADIUS;b.vy=Math.abs(b.vy)*.46;if(b.vy<.22)b.vy=0;b.vx*=.94;b.vz*=.94;}
    if(Math.abs(b.x)>bounds){b.x=Math.sign(b.x)*bounds;b.vx*=-.65;}
    if(Math.abs(b.z)>2.7){b.z=Math.sign(b.z)*2.7;b.vz*=-.65;}
  }
  for(let i=0;i<bodies.length;i++)for(let j=i+1;j<bodies.length;j++){
    const a=bodies[i],b=bodies[j],dx=b.x-a.x,dy=b.y-a.y,dz=b.z-a.z,d=Math.hypot(dx,dy,dz);
    if(d>0&&d<2*DICE_RADIUS){const nx=dx/d,ny=dy/d,nz=dz/d,overlap=(2*DICE_RADIUS-d)/2;
      a.x-=nx*overlap;a.y-=ny*overlap;a.z-=nz*overlap;b.x+=nx*overlap;b.y+=ny*overlap;b.z+=nz*overlap;
      const relative=(b.vx-a.vx)*nx+(b.vy-a.vy)*ny+(b.vz-a.vz)*nz;
      if(relative<0){const impulse=-relative*.8;a.vx-=impulse*nx;a.vy-=impulse*ny;a.vz-=impulse*nz;b.vx+=impulse*nx;b.vy+=impulse*ny;b.vz+=impulse*nz;}
    }
  }
  for(const b of bodies)b.y=Math.max(DICE_RADIUS,b.y);
}
