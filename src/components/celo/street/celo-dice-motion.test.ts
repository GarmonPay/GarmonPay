import {describe,it,expect} from 'vitest';
import {stepDice,DICE_RADIUS} from './celo-dice-motion';
describe('presentation dice physics',()=>{
 it('keeps dice above the ground through falls and bounces',()=>{const b={x:0,y:3,z:0,vx:2,vy:-4,vz:1};for(let i=0;i<1000;i++){stepDice([b],.016,4);expect(b.y).toBeGreaterThanOrEqual(DICE_RADIUS);expect(Math.abs(b.x)).toBeLessThanOrEqual(4);}});
 it('separates colliding bodies and reverses approaching velocity',()=>{const a={x:-.5,y:1,z:0,vx:1,vy:0,vz:0},b={x:.5,y:1,z:0,vx:-1,vy:0,vz:0};stepDice([a,b],.016,4);expect(b.x-a.x).toBeCloseTo(2*DICE_RADIUS);expect(a.vx).toBeLessThan(0);expect(b.vx).toBeGreaterThan(0);});
});
