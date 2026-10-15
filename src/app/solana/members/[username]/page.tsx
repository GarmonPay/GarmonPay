import {notFound} from 'next/navigation';
import {MemberCommunity} from '@/components/solana/MemberCommunity';
export default async function Member({params}:{params:Promise<{username:string}>}){const {username}=await params;if(!/^[a-z][a-z0-9_]{2,23}$/.test(username))notFound();return <MemberCommunity username={username}/>;}
