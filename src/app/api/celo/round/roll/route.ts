import { NextResponse } from 'next/server';
import { getCeloApiClients,getCeloAuth,celoUnauthorizedJsonResponse } from '@/lib/celo-api-clients';
import { celoRequestId,celoActionError } from '@/lib/celo-actions';
import { runCeloRoll } from '@/lib/celo-roll-action';
export async function POST(request:Request){
 const clients=await getCeloApiClients();if(!clients)return NextResponse.json({error:'Server not configured'},{status:503});
 const auth=await getCeloAuth(request,clients);if(!auth)return celoUnauthorizedJsonResponse();
 let body:Record<string,unknown>;try{body=await request.json();}catch{return celoActionError('Invalid JSON');}
 const requestId=celoRequestId(request,body);if(!requestId)return celoActionError('Refresh the app before rolling (request id required).');
 const roomId=String(body.room_id??''),roundId=String(body.round_id??'');if(!roomId||!roundId)return celoActionError('room_id and round_id required');
 const seq=Number(body.roll_seq),timeout=body.action==='timeout_forfeit';if(!timeout&&(!Number.isInteger(seq)||seq<0))return celoActionError('Authoritative roll version required');
 try{return NextResponse.json(await runCeloRoll(auth.adminClient,auth.user.id,roomId,roundId,requestId,timeout?null:seq,timeout));}catch(error){return celoActionError(error instanceof Error?error.message:'Roll failed');}
}
