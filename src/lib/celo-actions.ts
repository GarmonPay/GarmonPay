import { NextResponse } from "next/server";
import { getCeloApiClients, getCeloAuth, celoUnauthorizedJsonResponse } from "./celo-api-clients";

export function celoRequestId(request: Request, body: Record<string, unknown>): string | null {
  const id=String(request.headers.get("x-celo-request-id") ?? body.request_id ?? "");
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)?id:null;
}
export function celoActionError(message:string) {
  const status=/Only the banker|Only a seated|Not seated|identity/.test(message)?403:/already in progress|Stale|claim/.test(message)?409:400;
  return NextResponse.json({ok:false,error:message},{status});
}
/** No caller ID from headers/body is trusted. Authentication supplies the RPC user. */
export async function runCeloRoomAction(request: Request, action:string, input:(body:Record<string,unknown>)=>Record<string,unknown>=()=>({})) {
  const clients=await getCeloApiClients();if(!clients)return NextResponse.json({error:"Server not configured"},{status:503});
  const auth=await getCeloAuth(request,clients);if(!auth)return celoUnauthorizedJsonResponse();
  let body:Record<string,unknown>;try{body=await request.json();}catch{return celoActionError("Invalid JSON");}
  const requestId=celoRequestId(request,body);if(!requestId)return celoActionError("Refresh the app before submitting this action (request id required).");
  const room=action==='create'?null:String(body.room_id??body.roomId??'');if(action!=='create'&&!room)return celoActionError("room_id required");
  const {data,error}=await auth.adminClient.rpc('celo_room_action_atomic',{p_user:auth.user.id,p_room:room,p_action:action,p_request:requestId,p_input:input(body)});
  if(error)return celoActionError(error.message);
  return NextResponse.json(data);
}

export async function runCeloSideAction(request:Request,action:'create'|'accept'){
 const clients=await getCeloApiClients();if(!clients)return NextResponse.json({error:'Server not configured'},{status:503});
 const auth=await getCeloAuth(request,clients);if(!auth)return celoUnauthorizedJsonResponse();
 let body:Record<string,unknown>;try{body=await request.json();}catch{return celoActionError('Invalid JSON');}
 const requestId=celoRequestId(request,body);if(!requestId)return celoActionError('Request id required');
 const {data,error}=await auth.adminClient.rpc('celo_sidebet_action_atomic',{p_user:auth.user.id,p_room:body.room_id??null,p_action:action,p_request:requestId,p_input:action==='accept'?{bet_id:body.bet_id}:{amount_sc:body.amount_sc,bet_type:body.bet_type,round_id:body.round_id}});
 if(error)return celoActionError(error.message);return NextResponse.json(data);
}
