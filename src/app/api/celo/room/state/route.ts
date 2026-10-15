import { NextResponse } from "next/server";
import { getCeloApiClients,getCeloAuth,celoUnauthorizedJsonResponse } from "@/lib/celo-api-clients";
export async function GET(request:Request){
 const clients=await getCeloApiClients();if(!clients)return NextResponse.json({error:"Server not configured"},{status:503});
 const auth=await getCeloAuth(request,clients);if(!auth)return celoUnauthorizedJsonResponse();
 const roomId=new URL(request.url).searchParams.get('room_id');if(!roomId)return NextResponse.json({error:'room_id required'},{status:400});
 const {data,error}=await auth.adminClient.rpc('celo_room_snapshot',{p_user:auth.user.id,p_room:roomId});
 if(error)return NextResponse.json({error:error.message},{status:500});
 if(!data)return NextResponse.json({error:'Room not found or access denied'},{status:404});
 return NextResponse.json(data,{headers:{'Cache-Control':'no-store'}});
}
