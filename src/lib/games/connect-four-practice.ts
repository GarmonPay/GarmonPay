export type PracticeBoard=number[][];
export const emptyPracticeBoard=():PracticeBoard=>Array.from({length:6},()=>Array(7).fill(0));
export function dropPracticeDisc(board:PracticeBoard,column:number,player:1|2){
 if(!Number.isInteger(column)||column<0||column>6||board.length!==6||board.some(row=>row.length!==7))throw new Error('Invalid move');
 const copy=board.map(row=>[...row]);let row=5;
 while(row>=0&&copy[row][column]!==0)row--;
 if(row<0)return null;
 copy[row][column]=player;
 let won=false;
 for(const [dr,dc] of [[0,1],[1,0],[1,1],[1,-1]]){
  let count=1;
  for(const direction of [-1,1]){let r=row+dr*direction,c=column+dc*direction;while(r>=0&&r<6&&c>=0&&c<7&&copy[r][c]===player){count++;r+=dr*direction;c+=dc*direction;}}
  if(count>=4)won=true;
 }
 return {board:copy,winner:won?player:null,draw:!won&&copy[0].every(cell=>cell!==0)};
}
