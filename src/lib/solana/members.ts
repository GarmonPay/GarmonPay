import { cookies } from 'next/headers';
import { digest } from './auth-crypto';
import { normalizeDisplayName, normalizeHandle } from './profile-name';
import { SOLANA_SESSION_COOKIE, walletAuthEnabled } from './policy';
export async function memberSessionHash() {
 if(!walletAuthEnabled()) return null;
 const token=(await cookies()).get(SOLANA_SESSION_COOKIE)?.value;
 return token && /^[A-Za-z0-9_-]{43}$/.test(token) ? digest(token) : null;
}
export function profileInput(body: Record<string,unknown>) {
 const {biography,picture,walletPublic}=body;
 const displayName=Object.prototype.hasOwnProperty.call(body,"displayName")?normalizeDisplayName(body.displayName):null;
 const handleSource=Object.prototype.hasOwnProperty.call(body,"handle")?body.handle:body.username;
 let username:string|null=null;
 if(typeof handleSource==="string"&&handleSource.trim()!=="")username=normalizeHandle(handleSource);
 else if(handleSource!==undefined&&handleSource!==null&&handleSource!=="")throw new Error("Public handles use 3–24 lowercase letters, numbers, or underscores.");
 if(typeof biography!=='string'||biography.length>280||typeof walletPublic!=='boolean')throw new Error('Biography must be 280 characters or fewer.');
 if(picture!==null){
  if(typeof picture!=='string'||picture.length>6000)throw new Error('Choose a small profile picture.');
  const match=/^data:image\/(png|jpeg);base64,([A-Za-z0-9+/]+=*)$/.exec(picture);
  if(!match)throw new Error('Use a resized PNG or JPEG picture.');
  const bytes=Buffer.from(match[2],'base64');
  if(bytes.toString('base64')!==match[2])throw new Error('Invalid picture format.');
  let width=0,height=0;
  if(match[1]==='png'){
   if(bytes.length<24||!bytes.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex'))||bytes.toString('ascii',12,16)!=='IHDR')throw new Error('Invalid PNG.');
   width=bytes.readUInt32BE(16);height=bytes.readUInt32BE(20);
  }else{
   if(bytes.length<4||!bytes.subarray(0,3).equals(Buffer.from('ffd8ff','hex'))||bytes.readUInt16BE(bytes.length-2)!==0xffd9)throw new Error('Invalid JPEG.');
   let offset=2;
   while(offset+4<=bytes.length){
    if(bytes[offset]!==255)break;const marker=bytes[offset+1];offset+=2;
    const length=bytes.readUInt16BE(offset);if(length<2||offset+length>bytes.length)break;
    if([0xc0,0xc1,0xc2].includes(marker)&&length>=8){height=bytes.readUInt16BE(offset+3);width=bytes.readUInt16BE(offset+5);break;}
    if(marker===0xda)break;offset+=length;
   }
  }
  if(width<1||height<1||width>128||height>128)throw new Error('Profile pictures must be resized to at most 128 pixels.');
 }
 return {p_username:username,p_bio:biography,p_picture:picture,p_public:walletPublic,p_display:displayName};
}

export function memberActorId(body:Record<string,unknown>){
 if(typeof body.actorId!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.actorId))throw new Error('Refresh your member session before trying again.');
 return body.actorId;
}
