/** Availability reflects existing route gates. Presentation only; no economics. */
export const GAME_LOBBY = [
 {id:"garmondrop",name:"GarmonDrop",tag:"CONNECT FOUR · PVP",description:"Think ahead. Drop a disc. Connect four to take the match.",href:"/dashboard/games/garmondrop",available:true},
 {id:"coinflip",name:"Coin Flip",tag:"HEADS OR TAILS · PVP",description:"Pick your side and meet your opponent across the coin.",href:"/dashboard/coinflip",available:true},
 {id:"boxing",name:"Boxing Arena",tag:"FIGHTING · IN DEVELOPMENT",description:"A new arena is taking shape. Fighting is not available yet.",href:"/dashboard/arena",available:false},
 {id:"spin",name:"Spin Wheel",tag:"WHEEL · COMING SOON",description:"A fresh spin on your game collection. Opening soon.",href:"/dashboard/games/spin",available:false},
 {id:"scratch",name:"Scratch-Off",tag:"INSTANT REVEAL · COMING SOON",description:"The next reveal is on its way. Opening soon.",href:"/dashboard/games/scratch",available:false},
 {id:"pinball",name:"Pinball",tag:"ARCADE · COMING SOON",description:"Light up the table. Arcade play is coming soon.",href:"/dashboard/games/pinball",available:false},
 {id:"mystery",name:"Mystery Box",tag:"DISCOVERY · COMING SOON",description:"Something new is waiting inside. Opening soon.",href:"/dashboard/games/mystery-box",available:false},
] as const;
