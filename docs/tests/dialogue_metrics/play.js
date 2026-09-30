const B='/Users/alexey/Documents/workspace/10_projects/cursed_sword/docs/visual/beta/';
require(B+'lexicon.js');require(B+'parser.js');require(B+'game.js');
const CS=globalThis.CS;
const scripts={
 gab:['осмотреться','пью пиво','говорю с хозяином','иду к стойке','угощаю всех','срезаю кошелёк','бью задиру','закрываюсь столом','бью капитана табуреткой','дальше','бью капитана','жду','жду','жду','жду'],
 elf:['кладу лук в сундук','угощаю всех','говорю с задирой','жду','жду','бросаю вилку в капитана','прячусь под стол','жду','жду','жду','жду','жду'],
 mage:['кладу нож в сундук','подсаживаюсь к меченосцу','говорю с габом','жду','жгу усы капитану','лечу Габа','жду','жду','жду','жду'],
 nobby:['кладу нож в сундук','жду','срезаю кошелёк','швыряю миску молока в капитана','жду','жду','жду','жду','жду']
};
const out=[];
for(const pc of Object.keys(scripts)){
 for(const gender of ['m','f']){
  const cfg={pc,seed:12345,genders:{gab:gender,elf:gender,mage:gender,nobby:gender}};
  const g=new CS.Game(cfg);
  out.push({pc,gender,turn:0,text:g.intro});
  scripts[pc].forEach((t,i)=>{const r=g.input(t);out.push({pc,gender,turn:i+1,input:t,text:r.text.join('\n')});});
 }
}
require('fs').writeFileSync('/tmp/cc/play.json',JSON.stringify(out,null,1));
const L=out.map(o=>o.text.length);
console.log('turns',out.length,'max',Math.max(...L),'>1024:',L.filter(x=>x>1024).length,'>700:',L.filter(x=>x>700).length,'>400:',L.filter(x=>x>400).length);
console.log(out.filter(o=>o.text.length>500).map(o=>o.pc+o.gender+'#'+o.turn+':'+o.text.length).join(' '));
