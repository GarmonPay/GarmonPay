import {describe,it,expect} from 'vitest';
import sharp from 'sharp';
import {normalizeMemberPicture} from './member-picture';
describe('Member picture pixel verification',()=>{
 it('decodes and persists a bounded portrait without client metadata',async()=>{
  const bytes=await sharp({create:{width:100,height:80,channels:3,background:'#682aa0'}}).withMetadata().png().toBuffer();
  const result=await normalizeMemberPicture('data:image/png;base64,'+bytes.toString('base64'));
  expect(result?.length).toBeLessThan(6000);
  const meta=await sharp(Buffer.from(result!.split(',')[1],'base64')).metadata();
  expect([meta.width,meta.height,meta.format]).toEqual([64,64,'jpeg']);
  expect(meta.exif).toBeUndefined();expect(meta.icc).toBeUndefined();
 });
 it('rejects a plausible PNG header without decodable pixels',async()=>{
  const header=Buffer.alloc(33);Buffer.from('89504e470d0a1a0a','hex').copy(header);header.write('IHDR',12);header.writeUInt32BE(64,16);header.writeUInt32BE(64,20);
  await expect(normalizeMemberPicture('data:image/png;base64,'+header.toString('base64'))).rejects.toThrow('Unable to read');
 });
 it('rejects excessive pixel dimensions and preserves picture removal',async()=>{
  const bytes=await sharp({create:{width:129,height:1,channels:3,background:'purple'}}).png().toBuffer();
  await expect(normalizeMemberPicture('data:image/png;base64,'+bytes.toString('base64'))).rejects.toThrow();
  expect(await normalizeMemberPicture(null)).toBeNull();
 });
});
