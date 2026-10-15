import {runCeloSideAction} from '@/lib/celo-actions';
export async function POST(request:Request){return runCeloSideAction(request,'accept');}
