import test from 'node:test';
import assert from 'node:assert/strict';
import {PaperFlight,FLIGHT_STANDARD,FlightMesh,plateForce} from '../assets/scripts/core/PaperFlight';
import {dot,norm} from '../assets/scripts/core/FreePaper';
const proof={intersections:0,penetration:0,strain:0,stable:true};
function plate():FlightMesh{return{positions:[0,-.1485,-.105,0,-.1485,.105,0,.1485,.105,0,.1485,-.105],uv:[-.105,-.1485,.105,-.1485,.105,.1485,-.105,.1485],triangles:[0,1,2,0,2,3]};}
function finish(f:PaperFlight){for(let i=0;i<2000&&!f.done;i++)f.advance(1/60);assert.ok(f.done);return f.result();}
test('unsafe or moving material shapes cannot enter flight',()=>{
 for(const bad of [{...proof,stable:false},{...proof,intersections:1},{...proof,penetration:.00004},{...proof,strain:.03}])assert.throws(()=>new PaperFlight(plate(),bad),/不能试飞/);
});
test('uniform launch vacuum reproduces ballistic first contact with the floor',()=>{
 const f=new PaperFlight(plate(),proof,false);
 assert.ok(Math.abs(f.mass-.21*.297*.08)<1e-12);
 const lowest=Math.min(...f.posedVertices().map(p=>p[2]));
 const vz=FLIGHT_STANDARD.speed*Math.sin(FLIGHT_STANDARD.throwDegrees*Math.PI/180);
 const t=(vz+Math.sqrt(vz*vz+2*FLIGHT_STANDARD.gravity*lowest))/FLIGHT_STANDARD.gravity;
 const result=finish(f);assert.equal(result.outcome,'landed');assert.ok(Math.abs(result.airtime-t)<FLIGHT_STANDARD.dt*2);
 assert.ok(Math.min(...f.posedVertices().map(p=>p[2]))>-1e-5);
});
test('two-sided aerodynamic estimate removes energy rather than inventing thrust',()=>{
 for(const v of [[3,2,1],[-2,3,-1],[0,0,5],[4,0,0]] as [number,number,number][]){
  const force=plateForce([0,0,1],v,.02);assert.ok(dot(force,v)<=1e-12);assert.ok(norm(force)>0);
 }
});
test('same shape and fixed conditions are repeatable and leave the source untouched',()=>{
 const mesh=plate(),before=JSON.stringify(mesh),a=finish(new PaperFlight(mesh,proof)),b=finish(new PaperFlight(mesh,proof));
 assert.deepEqual(a,b);assert.equal(JSON.stringify(mesh),before);assert.equal(a.standard,FLIGHT_STANDARD.id);
 assert.ok(a.distance>0 && a.airtime>0 && Number.isFinite(a.distance));
});
test('laminated faces contribute mass but hidden inner faces do not duplicate exposed area',()=>{
 const mesh=plate(),single=new PaperFlight(mesh,proof);
 const second=mesh.positions.map((v,i)=>i%3===0?v+.00015:v);
 const stack={positions:mesh.positions.concat(second),uv:mesh.uv.concat(mesh.uv.map((v,i)=>i%2===0?v+.3:v)),triangles:mesh.triangles.concat(mesh.triangles.map(i=>i+4))};
 const doubled=new PaperFlight(stack,proof);
 assert.ok(Math.abs(doubled.mass-2*single.mass)<1e-12);
 assert.ok(doubled.result().exposedArea<1.1*single.result().exposedArea);
});

test('V-shaped wing geometry changes the benchmark under identical conditions',()=>{
 function vWing(angle:number):FlightMesh{
  const positions:number[]=[],uv:number[]=[],triangles:number[]=[];
  for(const v of [-.1485,.1485])for(const u of [-.105,0,.105]){positions.push(Math.abs(u)*Math.sin(angle),v,u*Math.cos(angle));uv.push(u,v);}
  for(let i=0;i<2;i++){const a=i,b=i+1,c=i+3,d=i+4;triangles.push(a,b,d,a,d,c);}
  return{positions,uv,triangles};
 }
 const a=finish(new PaperFlight(vWing(0),proof)),b=finish(new PaperFlight(vWing(Math.PI/6),proof));
 assert.equal(a.standard,b.standard);assert.ok(Math.abs(a.mass-b.mass)<1e-12);
 assert.ok(Math.abs(a.distance-b.distance)>.001||Math.abs(a.airtime-b.airtime)>.001);
});

test('non-finite proof values cannot authorize a flight',()=>{
 assert.throws(()=>new PaperFlight(plate(),{...proof,strain:NaN}));
 assert.throws(()=>new PaperFlight(plate(),{...proof,penetration:-1}));
});
