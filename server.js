import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {randomBytes,randomInt} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {WebSocketServer} from 'ws';
import {createGame,addPlayer,openTrading,moveCamel,quotes,trade} from './game.js';
const root=fileURLToPath(new URL('./public/',import.meta.url));
export function createServer({windowMs=20000,revealMs=2200}={}){
 const rooms=new Map();
 const server=http.createServer(async(req,res)=>{
  const path=new URL(req.url,'http://localhost').pathname;
  const file={'/':'index.html','/app.js':'app.js','/payoff.js':'payoff.js','/style.css':'style.css'}[path];
  if(path==='/health'){res.writeHead(200,{'Content-Type':'application/json'});return res.end('{"ok":true}');}
  if(!file){res.writeHead(404);return res.end('Not found');}
  try{res.writeHead(200,{'Content-Type':file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'self'; connect-src 'self' ws: wss:; style-src 'self'; script-src 'self'; img-src 'self' data:; base-uri 'none'; frame-ancestors 'self'"});res.end(await readFile(root+file));}catch{res.writeHead(500);res.end('Unable to load app');}
 });
 const wss=new WebSocketServer({server,maxPayload:4096});
 function broadcast(room){
  const g=room.game,q=quotes(g);
  for(const [ws,id] of room.sockets){if(ws.readyState!==1)continue;const me=g.players.find(p=>p.id===id);
   ws.send(JSON.stringify({type:'state',room:room.code,host:room.host,serverNow:Date.now(),windowMs,game:{...g,players:g.players.map(p=>({id:p.id,name:p.name,connected:p.connected,equity:p.cash+Object.keys(p.holdings).reduce((v,a)=>v+p.holdings[a]*q[a].bid,0)}))},quotes:q,me}));
  }
 }
 function schedule(room){room.timer=setTimeout(()=>{moveCamel(room.game,randomInt(2)===0);broadcast(room);if(room.game.phase!=='finished')room.timer=setTimeout(()=>{openTrading(room.game,windowMs);broadcast(room);schedule(room);},revealMs);},windowMs);}
 wss.on('connection',(ws,req)=>{
  // Reject cross-origin browser connections. Non-browser test clients may omit Origin.
  if(req.headers.origin){try{if(new URL(req.headers.origin).host!==req.headers.host){ws.close(1008,'Origin rejected');return;}}catch{ws.close(1008);return;}}
  let room,player,count=0,last=Date.now();
  const fail=message=>ws.send(JSON.stringify({type:'error',message}));
  ws.on('message',raw=>{try{
   if(Date.now()-last>1000){last=Date.now();count=0;}if(++count>30)throw Error('Too many requests.');
   const m=JSON.parse(raw);if(!m||typeof m!=='object')throw Error('Invalid message.');
   if(m.type==='join'){
    if(room)throw Error('Already in a room.');
    const code=typeof m.room==='string'?m.room.trim().toUpperCase():'';
    let selected;
    if(code){selected=rooms.get(code);if(!selected)throw Error('Room not found.');}
    else{if(rooms.size>=500)throw Error('Server is full.');let fresh;do{fresh=randomBytes(3).toString('hex').toUpperCase();}while(rooms.has(fresh));selected={code:fresh,game:createGame(),tokens:new Map(),sockets:new Map(),host:null,timer:null,touched:Date.now()};rooms.set(fresh,selected);}
    let id=typeof m.token==='string'?selected.tokens.get(m.token):null,token=m.token;
    if(id){player=selected.game.players.find(p=>p.id===id);for(const [old,oldId]of selected.sockets)if(oldId===id){selected.sockets.delete(old);old.close(4000,'Session resumed elsewhere');}}
    else{const name=typeof m.name==='string'?m.name.trim().slice(0,24):'';if(!name)throw Error('Enter your name.');id=randomBytes(8).toString('hex');token=randomBytes(24).toString('hex');player=addPlayer(selected.game,id,name);selected.tokens.set(token,id);if(!selected.host)selected.host=id;}
    room=selected;room.touched=Date.now();player.connected=true;room.sockets.set(ws,id);ws.send(JSON.stringify({type:'joined',room:room.code,token}));broadcast(room);return;
   }
   if(!room)throw Error('Join a room first.');room.touched=Date.now();
   if(m.type==='start'){if(player.id!==room.host)throw Error('Only the host can start.');if(room.game.phase!=='lobby')throw Error('Race already started.');openTrading(room.game,windowMs);schedule(room);}
   else if(m.type==='trade')trade(room.game,player,m);
   else if(m.type==='reset'){if(player.id!==room.host||room.game.phase!=='finished')throw Error('The host can restart after settlement.');const old=room.game.players;room.game=createGame();for(const p of old){const fresh=addPlayer(room.game,p.id,p.name);Object.assign(p,fresh,{connected:[...room.sockets.values()].includes(p.id)});}room.game.players=old;}
   else throw Error('Unknown action.');broadcast(room);
  }catch(e){fail(e instanceof SyntaxError?'Invalid message.':e.message);}});
  ws.on('close',()=>{if(room&&room.sockets.has(ws)){room.sockets.delete(ws);player.connected=false;room.touched=Date.now();broadcast(room);}});
  ws.on('error',()=>{});
 });
 const cleanup=setInterval(()=>{for(const [code,r]of rooms)if(!r.sockets.size&&Date.now()-r.touched>3600000){clearTimeout(r.timer);rooms.delete(code);}},60000);cleanup.unref();
 return {server,rooms,close:async()=>{clearInterval(cleanup);for(const r of rooms.values())clearTimeout(r.timer);for(const ws of wss.clients)ws.terminate();await new Promise(resolve=>wss.close(resolve));await new Promise(resolve=>server.close(resolve));}};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){const {server}=createServer();server.listen(Number(process.env.PORT)||3000,process.env.HOST||'0.0.0.0',()=>console.log('Camel Exchange listening on port '+(process.env.PORT||3000)));}
