import {expiryPayoff,combinedPayoff} from './payoff.js';
const $=id=>document.getElementById(id),money=n=>(n/100).toFixed(2),names={share:'Red share',call:'Vanilla call',barrier:'Knockout call'};
let ws,state,session,offset=0,retry=true,noticeTimer;
const selected={share:0,call:0,barrier:0};
const colors={share:"#4c7897",call:"#a78434",barrier:"#c16b51",total:"#204c40"};
try{session=JSON.parse(sessionStorage.getItem('camel-session'));}catch{}
const params=new URLSearchParams(location.search);$('room-input').value=params.get('room')||'';$('resume').hidden=!session;
function notice(text){$('notice').textContent=text;clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>$('notice').textContent='',5000);}
function send(msg){if(ws?.readyState!==1){notice('Connection unavailable. Reconnecting…');return;}ws.send(JSON.stringify(msg));}
function connect(){ws=new WebSocket(`${location.protocol==='https:'?'wss:':'ws:'}//${location.host}`);
 ws.onopen=()=>{$('connection').textContent='● Connected';if(state&&session)send({type:'join',...session});};
 ws.onclose=e=>{$('connection').textContent='○ Disconnected';updateClock();if(e.code===4000){retry=false;notice('This session was opened in another tab.');}if(retry)setTimeout(connect,1500);};
 ws.onerror=()=>{};
 ws.onmessage=e=>{const msg=JSON.parse(e.data);if(msg.type==='error'){notice(msg.message);$('join-button').disabled=false;return;}
 if(msg.type==='joined'){session={room:msg.room,token:msg.token};sessionStorage.setItem('camel-session',JSON.stringify(session));}
 if(msg.type==='state'){state=msg;offset=msg.serverNow-Date.now();render();}};
}
$('join-form').onsubmit=e=>{e.preventDefault();if(ws?.readyState!==1)return notice('Still connecting. Try again shortly.');$('join-button').disabled=true;send({type:'join',name:$('name').value,room:$('room-input').value});};
$('resume').onclick=()=>send({type:'join',...session});$('start').onclick=()=>send({type:'start'});$('reset').onclick=()=>send({type:'reset'});
$('copy').onclick=async()=>{const link=new URL(location.href);link.search='?room='+state.room;try{await navigator.clipboard.writeText(link.href);notice('Room invite link copied.');}catch{notice('Room code: '+state.room);}};
function el(tag,cls,text){const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;}
function render(){const {game:g,me,quotes:q}=state;$('join').hidden=true;$('game').hidden=false;$('room-code').textContent=state.room;
 $('headline').textContent=g.phase==='lobby'?'The starting line is open.':g.phase==='finished'?'The race is settled.':g.phase==='reveal'?'A new move. A new market.':'A little lead. A lot at stake.';
 $('progress').textContent=`Leg ${Math.min(2,Math.floor(g.move/4)+1)} / 2 · Move ${g.move} / 8`;
 $('steps').replaceChildren(...Array.from({length:8},(_,i)=>el('span','step'+(i<g.move?' done':''))));
 for(const color of ['red','blue']){$(color+'-position').textContent=`${g[color]} spaces`;$(color+'-track').replaceChildren(...Array.from({length:9},(_,i)=>{const c=el('div','cell');c.append(el('span','camel',i===g[color]?'🐪':' '),document.createTextNode(i));return c;}));}
 const gap=g.red-g.blue;$('lead').textContent=gap===0?'Neck and neck':`${gap>0?'Red':'Blue'} leads by ${Math.abs(gap)}`;$('price').textContent=g.price;
 $('barrier-status').textContent=g.knockedOut?'✕ Barrier hit · permanently out':'↗ Knockout barrier at 65';$('barrier-status').className='pill'+(g.knockedOut?' red-text':'');drawChart(g.history);
 $('contracts').replaceChildren(...['share','call','barrier'].map((a,i)=>{const card=el('article','contract');card.append(el('span','asset-label',['THE UNDERLYING','STRIKE 50','STRIKE 50 · BARRIER 65'][i]),el('h3','',names[a]),el('p','',['Direct exposure to Red’s lead. Redeems at the final reference price.','Pays the final price above 50. Your maximum loss is the premium.','Same call payoff, unless Red ever leads by three spaces.'][i]));
 for(const [label,value]of [['Fair value',q[a].fair],['Buy / Sell',null]]){const row=el('div','quote-row');row.append(el('span','muted',label),el('strong','',value===null?`${money(q[a].ask)} / ${money(q[a].bid)}`:money(value)));card.append(row);}
 const buttons=el('div','trade-buttons');for(const side of ['sell','buy']){const b=el('button','',`${side==='buy'?'Buy':'Sell'} 1`);b.dataset.asset=a;b.dataset.side=side;b.onclick=()=>send({type:'trade',asset:a,side,quantity:1,revision:state.game.revision});buttons.append(b);}card.append(buttons);const select=el('button','payoff-select',selected[a]?'✓ In payoff diagram':'＋ Add to payoff');select.setAttribute('aria-pressed',String(selected[a]>0));select.onclick=()=>{selected[a]=selected[a]?0:1;render();};card.append(select);return card;}));
 $('player-name').textContent=me.name;const equity=me.cash+Object.keys(me.holdings).reduce((v,a)=>v+me.holdings[a]*q[a].bid,0);$('equity').textContent=money(equity)+' coins';$('cash').textContent=money(me.cash);$('pnl').textContent=(equity>=10000?'+':'')+money(equity-10000);$('pnl').className=equity>=10000?'positive':'negative';
 $('holdings').replaceChildren(...Object.keys(me.holdings).map(a=>{const row=el('div','stat');row.append(el('span','',names[a]),el('strong','',me.holdings[a]+' units'));return row;}));$('limit').textContent=`${me.windowVolume} / 10 units traded this window`;
 $('start').hidden=g.phase!=='lobby'||state.host!==me.id;$('reset').hidden=g.phase!=='finished'||state.host!==me.id;
 $('players').replaceChildren(...[...g.players].sort((a,b)=>b.equity-a.equity).map((p,i)=>{const row=el('div','player-row');row.append(el('span','',`${g.phase==='finished'?i+1+'. ':p.connected?'● ':'○ '}${p.name}${p.id===me.id?' (you)':''}`),el('strong','',money(p.equity)));return row;}));
 $('events').replaceChildren(...(g.events.length?g.events.map(e=>{const p=el('p');p.append(el('b','',`0${e.move}`),document.createTextNode(e.text));return p;}):[el('p','','The camels are ready. Share the room code and start when your table is ready.')]));
 $('transactions').replaceChildren(...me.trades.map(t=>el('p','',`${t.side==='buy'?'Bought':'Sold'} ${t.quantity} ${names[t.asset]} · ${money(t.amount)} coins · before move ${t.move+1}`)));
 $('settlement').textContent=me.settlement?'Settlement credited: '+Object.entries(me.settlement).map(([a,v])=>`${names[a]} ${money(v)}`).join(' · '):'';renderPayoff();updateClock();
}
function updateClock(){if(!state)return;const {game:g,me,quotes:q}=state;const seconds=Math.max(0,Math.ceil((g.deadline-Date.now()-offset)/1000));const active=g.phase==='trading'&&seconds>0&&ws?.readyState===1;
 $('phase-label').textContent={lobby:'GATHER YOUR TABLE',trading:'TRADING IS OPEN',reveal:'TRADING PAUSED',finished:'FINAL RESULTS'}[g.phase];$('timer').textContent=g.phase==='trading'?`${seconds}s`:g.phase==='finished'?'Finished':g.phase==='reveal'?'Moving…':'Ready?';
 $('phase-help').textContent={lobby:state.host===me.id?'Start solo or invite friends with the room code.':'Waiting for the host to start.',trading:`Next move ${g.move+1} of 8. All options expire after move 8.`,reveal:g.move===4?'Leg 1 complete. Four moves remain until expiry.':'Updating the race and all barrier contracts.',finished:'Shares redeemed. Options settled. Highest cash wins.'}[g.phase];
 document.querySelectorAll('[data-asset]').forEach(b=>{const a=b.dataset.asset,side=b.dataset.side;b.disabled=!active||q[a].disabled||me.windowVolume>=10||(side==='buy'?(me.cash<q[a].ask||me.holdings[a]>=10):me.holdings[a]<1);});}
function drawChart(history){const svg=$('chart'),ns='http://www.w3.org/2000/svg';svg.replaceChildren();const node=(tag,attrs)=>{const e=document.createElementNS(ns,tag);for(const[k,v]of Object.entries(attrs))e.setAttribute(k,v);svg.append(e);return e;};const x=i=>25+i*72,y=p=>170-(p-10)*1.8;
 for(const p of [30,50,65,90]){node('line',{x1:25,x2:603,y1:y(p),y2:y(p),stroke:p===65?'#c77c62':'#e2e6dc','stroke-dasharray':p===65?'5 5':'0'});node('text',{x:610,y:y(p)+4,fill:'#899689','font-size':10}).textContent=p;}
 node('polyline',{points:history.map((p,i)=>`${x(i)},${y(p)}`).join(' '),fill:'none',stroke:'#315e4d','stroke-width':3,'stroke-linejoin':'round'});history.forEach((p,i)=>node('circle',{cx:x(i),cy:y(p),r:4,fill:p>=65?'#bb6e4f':'#315e4d'}));}
setInterval(updateClock,200);connect();

$('payoff-clear').onclick=()=>{for(const a of Object.keys(selected))selected[a]=0;render();};
$('payoff-scenario').onchange=drawPayoff;
$('payoff-price').oninput=drawPayoff;
function renderPayoff(){
 const assets=Object.keys(selected).filter(a=>selected[a]>0);
 $('payoff-empty').hidden=assets.length>0;$('payoff-content').hidden=!assets.length;
 $('payoff-quantities').replaceChildren(...assets.map(a=>{const label=el('label','quantity-control',names[a]+' × '),input=el('input');input.type='number';input.min='1';input.max='10';input.step='1';input.value=selected[a];input.setAttribute('aria-label',names[a]+' payoff quantity');input.onchange=()=>{const n=Number(input.value);selected[a]=Number.isInteger(n)&&n>=1&&n<=10?n:1;input.value=selected[a];drawPayoff();};label.append(input);return label;}));
 $('payoff-scenario').disabled=state.game.knockedOut||!selected.barrier;
 if(assets.length)drawPayoff();
}
function drawPayoff(){
 const hit=state.game.knockedOut||$('payoff-scenario').value==='hit',assets=Object.keys(selected).filter(a=>selected[a]>0);
 $('payoff-assumption').textContent=!selected.barrier?'No barrier instrument selected.':state.game.knockedOut?'The barrier has already been hit in this race. Knockout payoff is permanently zero.':hit?'Assume an earlier barrier touch: the knockout call pays zero at every final price.':'Assume no earlier barrier touch. A final price of 65 or higher still knocks the option out. Below 65, payment requires the entire path to have avoided the barrier.';
 const svg=$('payoff-chart'),ns='http://www.w3.org/2000/svg';svg.replaceChildren();
 const node=(tag,attrs,text)=>{const e=document.createElementNS(ns,tag);for(const[k,v]of Object.entries(attrs))e.setAttribute(k,v);if(text!==undefined)e.textContent=text;svg.append(e);return e;};
 const max=Math.max(10,Math.ceil(Math.max(...[10,50,64.999,65,90].map(s=>combinedPayoff(selected,s,hit)))/10)*10);
 const x=s=>58+(s-10)/80*590,y=v=>244-v/max*210;
 for(let i=0;i<=4;i++){const v=max*i/4;node('line',{x1:58,x2:648,y1:y(v),y2:y(v),stroke:'#e2e6dc'});node('text',{x:48,y:y(v)+4,'text-anchor':'end','font-size':11,fill:'#78877d'},Number(v.toFixed(1)));}
 for(const s of [10,30,50,65,90])node('text',{x:x(s),y:264,'text-anchor':'middle','font-size':11,fill:'#78877d'},s);
 node('text',{x:58,y:18,'font-size':11,fill:'#78877d'},'Expiry payout (coins)');node('text',{x:350,y:291,'text-anchor':'middle','font-size':11,fill:'#78877d'},'Final reference price');
 for(const [s,color]of [[50,'#bdc6b8'],[65,'#c77c62']])node('line',{x1:x(s),x2:x(s),y1:30,y2:244,stroke:color,'stroke-dasharray':'4 5'});
 const line=(fn,color,total,discontinuous)=>{const ranges=discontinuous?[[10,50,64.999],[65,90]]:[[10,50,65,90]];for(const points of ranges)node('polyline',{points:points.map(s=>`${x(s)},${y(fn(s))}`).join(' '),fill:'none',stroke:color,'stroke-width':total?3.5:2,'stroke-dasharray':total?'0':'6 4','stroke-linejoin':'round'});if(discontinuous){node('circle',{cx:x(65),cy:y(fn(64.999)),r:4,fill:'#fffefa',stroke:color,'stroke-width':2});node('circle',{cx:x(65),cy:y(fn(65)),r:3,fill:color});}};
 for(const a of assets)line(s=>selected[a]*expiryPayoff(a,s,hit),colors[a],false,a==='barrier'&&!hit);
 line(s=>combinedPayoff(selected,s,hit),colors.total,true,!!selected.barrier&&!hit);
 const price=Number($('payoff-price').value),total=combinedPayoff(selected,price,hit);$('payoff-price-label').textContent=price;
 node('line',{x1:x(price),x2:x(price),y1:30,y2:244,stroke:'#aab7ab','stroke-dasharray':'2 4'});node('circle',{cx:x(price),cy:y(total),r:5,fill:colors.total});
 $('payoff-legend').replaceChildren(...[...assets,'total'].map(a=>{const label=el('span','legend-'+a,(a==='total'?'━ Combined':'┄ '+names[a]));return label;}));
 $('payoff-values').replaceChildren(...[...assets,'total'].map(a=>{const row=el('div','stat');row.append(el('span','',a==='total'?'Combined payoff':`${selected[a]} × ${names[a]}`),el('strong','',(a==='total'?total:selected[a]*expiryPayoff(a,price,hit)).toFixed(2)+' coins'));return row;}));
}
