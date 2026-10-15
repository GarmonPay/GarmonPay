import {ed25519} from '@noble/curves/ed25519';
import {createHash,generateKeyPairSync,sign} from 'node:crypto';
import {describe,it,expect} from 'vitest';
import {verifyWalletSignature} from './auth-crypto';
function encode(bytes:Buffer){const alphabet='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';let n=BigInt('0x'+bytes.toString('hex')),s='';while(n){s=alphabet[Number(n%BigInt(58))]+s;n/=BigInt(58);}for(const byte of bytes){if(byte)break;s='1'+s;}return s;}
describe('Strict wallet signature authentication',()=>{
 it('rejects the demonstrated small-order authentication forgery',()=>{
 const point=Buffer.alloc(32);point[0]=1;const signature=Buffer.alloc(64);point.copy(signature);const message='synthetic small-order regression';
 expect(verifyWalletSignature(encode(point),message,signature.toString('base64'))).toBe(false);
 });
 it('rejects a mixed-order key even with a valid cofactored signature proof',()=>{
 const torsion=ed25519.Point.fromHex(Buffer.from('ec'+'ff'.repeat(30)+'7f','hex'));
 const mixed=ed25519.Point.BASE.add(torsion);const addressBytes=Buffer.from(mixed.toBytes());
 const message=Buffer.from('synthetic mixed-order authentication regression');const r=Buffer.from(ed25519.Point.BASE.toBytes());
 const hash=createHash('sha512').update(r).update(addressBytes).update(message).digest();
 const k=BigInt('0x'+Buffer.from(hash).reverse().toString('hex'))%ed25519.CURVE.n;
 let scalar=(BigInt(1)+k)%ed25519.CURVE.n;const s=Buffer.alloc(32);
 for(let i=0;i<32;i++){s[i]=Number(scalar%BigInt(256));scalar/=BigInt(256);}
 expect(mixed.isSmallOrder()).toBe(false);expect(mixed.isTorsionFree()).toBe(false);
 expect(verifyWalletSignature(encode(addressBytes),message.toString('utf8'),Buffer.concat([r,s]).toString('base64'))).toBe(false);
 });
 it('accepts normal wallet signatures and rejects alternate base64 padding-bit encodings',()=>{
 const keys=generateKeyPairSync('ed25519');const address=encode(keys.publicKey.export({type:'spki',format:'der'}).subarray(-32));const message='synthetic genuine wallet';
 const signature=sign(null,Buffer.from(message),keys.privateKey).toString('base64');expect(verifyWalletSignature(address,message,signature)).toBe(true);
 const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';const mutated=signature.slice(0,85)+alphabet[alphabet.indexOf(signature[85])+1]+signature.slice(86);
 expect(Buffer.from(mutated,'base64')).toEqual(Buffer.from(signature,'base64'));expect(verifyWalletSignature(address,message,mutated)).toBe(false);
 expect(verifyWalletSignature(address,message+' changed',signature)).toBe(false);
 });
});
