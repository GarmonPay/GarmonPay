export type WalletProvider={publicKey?:{toString():string}|null;connect():Promise<void|{publicKey:{toString():string}}>;signMessage(message:Uint8Array,encoding:string):Promise<Uint8Array|{signature:Uint8Array}>;disconnect():Promise<void>;on?(event:string,handler:()=>void):void;removeListener?(event:string,handler:()=>void):void};
export function startConnect(provider:WalletProvider){
 if(typeof provider.connect!=='function')throw new Error('This wallet did not provide a connect method.');
 return provider.connect();
}
export function withDeadline<T>(promise:Promise<T>,ms:number,message:string){
 return new Promise<T>((resolve,reject)=>{
  const timer=setTimeout(()=>reject(Object.assign(new Error(message),{code:'TIMEOUT'})),ms);
  promise.then(value=>{clearTimeout(timer);resolve(value);},error=>{clearTimeout(timer);reject(error);});
 });
}
export const WALLET_CALL_TIMEOUT_MS=30000;
export function connectWithDeadline(provider:WalletProvider,ms=WALLET_CALL_TIMEOUT_MS){
 return withDeadline(startConnect(provider),ms,'The wallet did not answer the connection request. Tap Sign in with Phantom again.');
}
export function signWithDeadline(provider:WalletProvider,message:Uint8Array,ms=WALLET_CALL_TIMEOUT_MS){
 return withDeadline(provider.signMessage(message,'utf8'),ms,'The wallet did not answer the sign-in request. Tap Sign in with Phantom again.');
}
export function addressFromConnect(result:void|{publicKey?:{toString():string}|null},provider:WalletProvider){
 const wallet=result?.publicKey?.toString()||provider.publicKey?.toString();
 if(!wallet||!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(wallet))throw new Error('Wallet did not provide a valid Solana address.');return wallet;
}
export async function connectWallet(provider:WalletProvider){return addressFromConnect(await startConnect(provider),provider);}
export function walletSignature(result:Uint8Array|{signature:Uint8Array}){
 const bytes=result instanceof Uint8Array?result:result?.signature;
 if(!(bytes instanceof Uint8Array)||bytes.length!==64)throw new Error('Invalid wallet signature response.');return bytes;
}
