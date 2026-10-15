/** Backend integration boundary. Caller supplies a verified session, never a browser wallet claim. */
type Result<T>={data:T|null;error:unknown};
export type CampaignStore={
 getApprovedQuote(campaignId:string,wallet:string):Promise<Result<{reward_lamports:string;seconds:number;daily_limit:number}>>;
 fundCampaign(args:{p_campaign:string;p_receipt:string;p_reward:string;p_seconds:number;p_daily_limit:number}):Promise<Result<string>>;
 claimView(args:{p_proof:string;p_viewer:string}):Promise<Result<string>>;
};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function id(value:unknown){if(typeof value!=='string'||!uuid.test(value))throw new Error('Valid server record reference required');return value;}
function identity(wallet:string){if(!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(wallet))throw new Error('Verified identity required');}
export async function fundSessionCampaign(store:CampaignStore,session:{wallet:string},input:{campaignId:unknown;receiptId:unknown}){
 identity(session.wallet);const campaignId=id(input.campaignId),receiptId=id(input.receiptId);
 const quote=await store.getApprovedQuote(campaignId,session.wallet);
 if(quote.error||!quote.data)throw new Error('Owned approved campaign unavailable');
 const result=await store.fundCampaign({p_campaign:campaignId,p_receipt:receiptId,p_reward:quote.data.reward_lamports,p_seconds:quote.data.seconds,p_daily_limit:quote.data.daily_limit});
 if(result.error||!result.data)throw new Error('Campaign funding could not be verified');
 return {campaignId:result.data};
}
export async function claimSessionView(store:CampaignStore,session:{wallet:string},proofId:unknown){
 identity(session.wallet);const result=await store.claimView({p_proof:id(proofId),p_viewer:session.wallet});
 if(result.error||!result.data)throw new Error('Verified reward unavailable');
 return {proofId:result.data};
}
