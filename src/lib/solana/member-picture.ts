import sharp from 'sharp';

// Decode pixels server-side; never persist client metadata or header-only images.
export async function normalizeMemberPicture(picture: string | null): Promise<string | null> {
 if(picture===null)return null;
 try {
  const bytes=Buffer.from(picture.slice(picture.indexOf(',')+1),'base64');
  const image=sharp(bytes,{limitInputPixels:128*128,failOn:'warning',animated:false});
  const metadata=await image.metadata();
  if(!['png','jpeg'].includes(metadata.format??'')||!metadata.width||!metadata.height||metadata.width>128||metadata.height>128||(metadata.pages??1)>1)throw new Error();
  const output=await image.rotate().resize(64,64,{fit:'cover'}).flatten({background:'#241036'}).jpeg({quality:65}).toBuffer();
  const normalized='data:image/jpeg;base64,'+output.toString('base64');
  if(normalized.length>6000)throw new Error();
  return normalized;
 }catch{throw new Error('Unable to read this picture. Choose a valid PNG or JPEG.');}
}
