import {HOME, STOPS, HOLD, RADIUS} from './game.js';

const W=1280,H=1010,TAU=Math.PI*2;
const mainland=[[-180,-160],[388,-150],[395,10],[363,76],[380,136],[335,222],[290,249],[303,286],[275,354],[224,381],[213,436],[244,497],[235,539],[178,591],[160,656],[178,690],[209,712],[221,747],[194,786],[156,822],[172,866],[230,920],[250,1040],[-180,1160]];
const north=[[657,211],[688,188],[731,196],[761,224],[750,246],[711,265],[676,257],[648,236]];
const east=[[1105,543],[1142,518],[1179,526],[1192,559],[1172,579],[1130,589],[1099,568]];
const sand=[[-30,0],[6,-12],[26,-5],[32,7],[0,13],[-35,8]].map(([x,y])=>[x+870,y+780]);
function polygon(ctx,points) {
  ctx.beginPath();points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath();
}
function circle(c,x,y,r,color) {c.beginPath();c.arc(x,y,r,0,TAU);c.fillStyle=color;c.fill();}
function line(c,points,color,width=1) {
  c.beginPath();points.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));c.strokeStyle=color;c.lineWidth=width;c.stroke();
}
function label(c,text,x,y,size,color){c.font='600 '+size+'px system-ui';c.fillStyle=color;c.fillText(text,x,y);}
function lighthouse(c,x,y) {
  c.save();c.translate(x,y);c.rotate(-0.18);
  c.fillStyle='#193d3b70';c.fillRect(2,-1,19,7);
  circle(c,0,0,10,'#eadfb6');circle(c,0,0,7,'#ed8156');circle(c,-1,-2,4,'#ffedc0');c.restore();
}
function bakeChart() {
  const canvas=document.createElement('canvas');canvas.width=W;canvas.height=H;
  const c=canvas.getContext('2d'), water=c.createLinearGradient(0,0,W,H);
  water.addColorStop(0,'#387770');water.addColorStop(.46,'#18585b');water.addColorStop(1,'#113e49');
  c.fillStyle=water;c.fillRect(0,0,W,H);
  let seed=13579;const rand=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/4294967296);
  for(let i=0;i<2300;i++){
    const x=rand()*W,y=rand()*H,len=2+rand()*15;
    line(c,[[x,y],[x+len*.4,y-1.3],[x+len,y-.5]],'rgba(178,222,201,'+(.05+rand()*.16)+')',1);
  }
  for(let i=0;i<W;i+=90)line(c,[[i,0],[i,H]],'#cae9cc18');
  for(let i=0;i<H;i+=90)line(c,[[0,i],[W,i]],'#cae9cc18');
  for(const pts of [mainland,north,east,sand]){
    c.lineJoin='round';polygon(c,pts);
    for(const [width,color] of [[110,'#99ccac12'],[80,'#75b49b21'],[54,'#85ba9570'],[32,'#9ac2a6aa'],[14,'#e0d19d'],[5,'#eee0af']]) {
      c.lineWidth=width;c.strokeStyle=color;c.stroke();
    }
    c.fillStyle='#96a57b';c.fill();
    c.save();c.clip();
    for(let i=0;i<850;i++){
      const x=rand()*W,y=rand()*H;
      c.fillStyle=['#748f6e','#879b73','#adad81'][i%3];c.save();c.translate(x,y);c.rotate(.3);
      c.fillRect(0,0,20+rand()*70,20+rand()*45);c.restore();
    }
    const road=[[-42,1040],[113,903],[108,798],[145,716],[117,633],[179,525],[159,437],[205,326],[264,233],[275,94],[307,-50]];
    line(c,road,'#697e66',11);line(c,road,'#d4c89c',6);
    for(let i=0;i<230;i++){
      const x=rand()*385,y=rand()*H;c.save();c.translate(x,y);c.rotate(-.23);
      c.fillStyle='#536e5d';c.fillRect(2,3,12,7);c.fillStyle=i%4?'#c8baa0':'#be896b';c.fillRect(0,0,12,7);c.restore();
    }
    c.restore();
  }
  line(c,[[175,815],[198,792],[247,792]],'#354e46',11);
  line(c,[[175,815],[198,792],[247,792]],'#d1b998',7);
  lighthouse(c,708,222);lighthouse(c,1148,550);
  c.save();c.translate(517,860);c.rotate(-.55);
  polygon(c,[[0,-20],[6,-9],[6,16],[-6,16],[-6,-9]]);c.fillStyle='#d9d4af';c.fill();c.fillStyle='#7c8b77';c.fillRect(-3,-3,6,10);c.restore();
  label(c,'N O R T H   P O I N T',655,172,11,'#e8e2b5aa');
  label(c,'S O U T H   B A Y',680,703,14,'#b4dacf77');
  return canvas;
}

export function createChart(canvas) {
  const c=canvas.getContext('2d',{alpha:false}), map=bakeChart();
  let width=1,height=1;
  function resize(){
    const box=canvas.getBoundingClientRect(), dpr=Math.min(1.6,window.devicePixelRatio||1);
    width=Math.max(1,box.width);height=Math.max(1,box.height);
    canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);
  }
  function render(f,overview){
    const sx=canvas.width/width,sy=canvas.height/height;
    c.setTransform(sx,0,0,sy,0,0);c.fillStyle='#164c54';c.fillRect(0,0,width,height);
    const scale=overview?Math.min(width/1050,height/795):Math.min(1.75,Math.max(.65,Math.min(width/390,height/355)));
    const cx=overview?644:f.x,cy=overview?496:f.y;
    const px=width*.5,py=overview?height*.5:height*.48;
    c.save();c.translate(px,py);c.scale(scale,scale);c.translate(-cx,-cy);c.drawImage(map,0,0);
    const points=[HOME,...STOPS];
    c.setLineDash([7/scale,7/scale]);line(c,points.map(p=>[p.x,p.y]),'#dddfb868',1.3/scale);c.setLineDash([]);
    const active=Math.min(f.leg,3);
    for(const [i,p] of STOPS.entries()){
      const current=i===active,done=i<f.leg;
      c.lineWidth=(current?2:1)/scale;
      c.strokeStyle=current?'#ffca78':'#d7e7cc99';c.beginPath();c.arc(p.x,p.y,RADIUS,0,TAU);c.stroke();
      circle(c,p.x,p.y,11/Math.sqrt(scale),current?'#ffd286':done?'#a2dac3':'#d8e1bf');
      c.textAlign='center';c.textBaseline='middle';label(c,i===3?'H':String(i+1),p.x,p.y+1,12/Math.sqrt(scale),'#193e3f');
      c.textBaseline='alphabetic';
      if(overview||current){c.lineWidth=3/scale;c.strokeStyle='#245051';c.font='600 '+(12/scale)+'px system-ui';c.strokeText(p.name,p.x,p.y+RADIUS+16/scale);label(c,p.name,p.x,p.y+RADIUS+16/scale,12/scale,'#f0edce');}
    }
    if(!overview){
      c.save();c.translate(f.x,f.y);c.rotate(f.angle);c.scale(1/scale,1/scale);
      c.shadowColor='#092b30';c.shadowBlur=5;c.shadowOffsetY=4;
      for(const side of [-1,1])for(const end of [-1,1]){
        line(c,[[0,0],[side*11,end*9]],'#ebebcc',3);
        circle(c,side*11,end*9,6,'#c7e6d780');
        circle(c,side*11,end*9,2,'#21484b');
      }
      polygon(c,[[0,-13],[5,-4],[5,7],[0,11],[-5,7],[-5,-4]]);c.fillStyle='#fff3cc';c.fill();circle(c,0,-5,2.5,'#ed985b');c.restore();
      if(f.scan>0){c.strokeStyle='#ffe0a4';c.lineWidth=3/scale;c.beginPath();c.arc(f.x,f.y,24/scale,-Math.PI/2,-Math.PI/2+TAU*f.scan/HOLD);c.stroke();}
    }
    c.restore();
    if(!overview && f.leg<4){
      const target=STOPS[active],dx=(target.x-f.x)*scale,dy=(target.y-f.y)*scale;
      const t=Math.min((width/2-27)/Math.max(1,Math.abs(dx)),(height*.43-16)/Math.max(1,Math.abs(dy)));
      if(t<1){c.save();c.translate(px+dx*t,py+dy*t);c.rotate(Math.atan2(dy,dx));polygon(c,[[12,0],[-7,-7],[-4,0],[-7,7]]);c.fillStyle='#ffcc81';c.fill();c.restore();}
    }
  }
  return {resize,render};
}
