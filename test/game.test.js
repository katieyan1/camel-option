import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,addPlayer,openTrading,moveCamel,quotes,trade,fairValues} from '../game.js';
import {createServer} from '../server.js';
import WebSocket from 'ws';

test('fair values equal exhaustive path average; knockout cheaper than vanilla',()=>{
 const v=fairValues(50,8,false);let call=0,barrier=0;
 for(let path=0;path<256;path++){let s=50,hit=false;for(let t=0;t<8;t++){s+=(path>>t&1)?5:-5;hit ||= s>=65;}call+=Math.max(s-50,0)/256;if(!hit)barrier+=Math.max(s-50,0)/256;}
 assert.equal(v.share,50);assert.equal(v.call,call);assert.equal(v.barrier,barrier);assert.ok(v.barrier<v.call);
});
test('same terminal price has distinct path-dependent payouts',()=>{
 const run=path=>{const g=createGame(),p=addPlayer(g,'p','Player');p.holdings={share:1,call:1,barrier:1};for(const r of path)moveCamel(g,r);return {g,p};};
 const safe=run([1,1,0,1,0,0,1,1]),hit=run([1,1,1,0,0,0,1,1]);
 assert.equal(safe.g.price,60);assert.equal(hit.g.price,60);assert.equal(safe.p.settlement.barrier,1000);assert.equal(hit.p.settlement.barrier,0);assert.equal(hit.p.settlement.call,1000);assert.equal(hit.g.phase,'finished');
});
test('touching barrier knocks out immediately and stays out',()=>{
 const g=createGame();for(const r of [1,1,1])moveCamel(g,r);assert.equal(g.price,65);assert.ok(g.knockedOut);assert.ok(quotes(g).barrier.disabled);moveCamel(g,0);assert.ok(g.knockedOut);
});
test('server rejects invalid, stale, unfunded, short, and closed orders',()=>{
 const g=createGame(),p=addPlayer(g,'p','Player');openTrading(g);const base={asset:'share',side:'buy',quantity:1,revision:g.revision};
 assert.throws(()=>trade(g,p,{...base,quantity:-1}));assert.throws(()=>trade(g,p,{...base,quantity:1.2}));assert.throws(()=>trade(g,p,{...base,revision:0}));assert.throws(()=>trade(g,p,{...base,side:'sell'}));
 trade(g,p,base);assert.equal(p.holdings.share,1);assert.equal(p.cash,4975);assert.throws(()=>trade(g,p,base));
 trade(g,p,{...base,side:'sell'});assert.equal(p.cash,9950);assert.throws(()=>trade(g,p,base,g.deadline));
});
test('window and position limits; final settlement credits cash exactly once in lifecycle',()=>{
 const g=createGame(),p=addPlayer(g,'p','P');openTrading(g);p.cash=100000;trade(g,p,{asset:'call',side:'buy',quantity:10,revision:g.revision});assert.throws(()=>trade(g,p,{asset:'call',side:'sell',quantity:1,revision:g.revision}));openTrading(g);assert.throws(()=>trade(g,p,{asset:'call',side:'buy',quantity:1,revision:g.revision}));for(let i=0;i<8;i++)moveCamel(g,1);assert.equal(p.settlement.call,40000);assert.equal(p.holdings.call,0);
});
function client(url){const ws=new WebSocket(url),queue=[],waiters=[];ws.on('message',raw=>{const m=JSON.parse(raw);const i=waiters.findIndex(w=>w.p(m));if(i>=0){const w=waiters.splice(i,1)[0];clearTimeout(w.t);w.resolve(m);}else queue.push(m);});return {ws,send:m=>ws.send(JSON.stringify(m)),wait:p=>{const i=queue.findIndex(p);if(i>=0)return Promise.resolve(queue.splice(i,1)[0]);return new Promise((resolve,reject)=>{const w={p,resolve};w.t=setTimeout(()=>reject(Error('Timed out waiting for socket event')),5000);waiters.push(w);});},ready:new Promise(resolve=>ws.once('open',resolve))};}
test('two actual WebSocket clients synchronize trades, reconnect, race and restart',async()=>{
 const app=createServer({windowMs:150,revealMs:5});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));const url=`ws://127.0.0.1:${app.server.address().port}`;
 try{
 const a=client(url);await a.ready;a.send({type:'join',name:'Host'});const identity=await a.wait(m=>m.type==='joined');await a.wait(m=>m.type==='state');
 const b=client(url);await b.ready;b.send({type:'join',name:'Guest',room:identity.room});const guest=await b.wait(m=>m.type==='joined');await b.wait(m=>m.type==='state');
 b.send({type:'start'});assert.match((await b.wait(m=>m.type==='error')).message,/host/);
 a.send({type:'start'});const s=await a.wait(m=>m.type==='state'&&m.game.phase==='trading');a.send({type:'trade',asset:'share',side:'buy',quantity:1,revision:s.game.revision});const traded=await a.wait(m=>m.type==='state'&&m.me.holdings.share===1);assert.equal(traded.me.cash,4975);
 b.ws.close();const c=client(url);await c.ready;c.send({type:'join',room:guest.room,token:guest.token});await c.wait(m=>m.type==='joined');const restored=await c.wait(m=>m.type==='state');assert.equal(restored.me.name,'Guest');
 const [endA,endC]=await Promise.all([a.wait(m=>m.type==='state'&&m.game.phase==='finished'),c.wait(m=>m.type==='state'&&m.game.phase==='finished')]);assert.deepEqual(endA.game.history,endC.game.history);assert.equal(endA.game.move,8);assert.equal(endA.me.cash,4975+endA.game.price*100);
 a.send({type:'reset'});const reset=await a.wait(m=>m.type==='state'&&m.game.phase==='lobby'&&m.game.move===0);assert.equal(reset.me.cash,10000);assert.equal(reset.game.players.length,2);
 }finally{await app.close();}
});
