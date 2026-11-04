import {FreePaper,creaseBetween,V3} from '../../assets/scripts/core/FreePaper';
export function airplaneFixture():FreePaper{
 const p=new FreePaper();
 const fold=(a:V3,b:V3,uv:[number,number],angle:number,all=false)=>{p.setCrease(a,b,[0,0,1]);p.begin(uv,all);p.preview(angle);p.finish();};
 fold([0,-.1485,0],[0,.1485,0],[-.1,-.13],Math.PI);p.preview(0);
 fold([-.105,.0435,0],[0,.1485,0],[-.1,.14],Math.PI);
 fold([0,.1485,0],[.105,.0435,0],[.1,.14],Math.PI);
 const y=.1485-.105*Math.sqrt(2);
 for(const side of [-1,1]){
  const from:V3=[side*.105,.0435,0],to:V3=[0,y,0],c=creaseBetween(from,to,[0,0,1]);
  p.setCrease(c.a,c.b,c.normal);p.begin([side*.105,.0435],true);p.preview(Math.PI);p.finish();
 }
 fold([0,-.1485,0],[0,.1485,0],[-.09,-.13],Math.PI,true);
 fold([.018,-.1485,0],[.018,.1485,0],[-.09,-.13],93.5*Math.PI/180);
 fold([.018,-.1485,0],[.018,.1485,0],[.09,-.13],-86.5*Math.PI/180);
 return p;
}
