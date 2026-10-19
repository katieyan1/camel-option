export const ASSETS = ['share', 'call', 'barrier'];
export const RULES = {moves:8, strike:50, barrier:65, startingCash:10000, holdingLimit:10, windowLimit:10};
export function fairValues(price, remaining, knockedOut) {
  if (!remaining) return {share:price, call:Math.max(price-50,0), barrier:knockedOut?0:Math.max(price-50,0)};
  const up=fairValues(price+5,remaining-1,knockedOut||price+5>=65);
  const down=fairValues(price-5,remaining-1,knockedOut);
  return Object.fromEntries(ASSETS.map(a=>[a,(up[a]+down[a])/2]));
}
export function quotes(game) {
  const values=fairValues(game.price,8-game.move,game.knockedOut);
  return Object.fromEntries(ASSETS.map(a=>{
    const fair=Math.round(values[a]*100), dead=a==='barrier'&&game.knockedOut;
    return [a,{fair,bid:dead?0:Math.max(0,fair-25),ask:dead?0:fair+25,disabled:dead}];
  }));
}
export function createGame(){return {phase:'lobby',move:0,red:0,blue:0,price:50,knockedOut:false,history:[50],events:[],players:[],deadline:null,revision:0};}
export function addPlayer(game,id,name){
  if(game.phase!=='lobby')throw Error('This race has started. Reconnect or create another room.');
  if(game.players.length>=12)throw Error('Room is full (12 players).');
  const player={id,name,cash:10000,holdings:{share:0,call:0,barrier:0},trades:[],windowVolume:0,connected:true};
  game.players.push(player);return player;
}
export function trade(game,player,{asset,side,quantity,revision},now=Date.now()){
  if(game.phase!=='trading'||now>=game.deadline)throw Error('Trading is closed.');
  if(revision!==game.revision)throw Error('Quotes changed. Please try again.');
  if(!ASSETS.includes(asset)||!['buy','sell'].includes(side)||!Number.isInteger(quantity)||quantity<1||quantity>10)throw Error('Invalid order.');
  const quote=quotes(game)[asset];if(quote.disabled)throw Error('This option has been knocked out.');
  if(player.windowVolume+quantity>10)throw Error('Limit: 10 units traded per window.');
  const amount=quote[side==='buy'?'ask':'bid']*quantity;
  if(side==='buy'){
    if(player.cash<amount)throw Error('Not enough cash.');
    if(player.holdings[asset]+quantity>10)throw Error('Limit: 10 units per instrument.');
    player.cash-=amount;player.holdings[asset]+=quantity;
  }else{
    if(player.holdings[asset]<quantity)throw Error('You can only sell units you own.');
    player.cash+=amount;player.holdings[asset]-=quantity;
  }
  player.windowVolume+=quantity;
  player.trades.unshift({move:game.move,asset,side,quantity,amount});
}
export function openTrading(game,ms=20000){game.phase='trading';game.deadline=Date.now()+ms;game.revision++;for(const p of game.players)p.windowVolume=0;}
export function moveCamel(game,red){
  game[red?'red':'blue']++;game.move++;game.price=50+5*(game.red-game.blue);
  const crossed=!game.knockedOut&&game.price>=65;game.knockedOut ||= game.price>=65;
  game.history.push(game.price);game.events.unshift({move:game.move,text:`${red?'Red':'Blue'} advances. Reference price ${game.price}.${crossed?' Barrier touched — knockout calls are permanently out.':''}${game.move===4?' Leg 1 complete. Four moves remain.':''}`});
  game.phase='reveal';game.deadline=null;
  if(game.move===8){
    const payouts=fairValues(game.price,0,game.knockedOut);
    for(const p of game.players){p.settlement=Object.fromEntries(ASSETS.map(a=>[a,p.holdings[a]*payouts[a]*100]));p.cash+=Object.values(p.settlement).reduce((a,b)=>a+b,0);p.holdings={share:0,call:0,barrier:0};}
    game.phase='finished';
  }
}
