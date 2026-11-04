#include "../Sheet.hpp"
#include <iomanip>
#include <memory>
#include <sstream>
using namespace paper;
namespace {
std::unique_ptr<Sheet> sheet;
std::string output;
void quoted(std::ostream &o, const std::string &s) {
  o << '"';
  for (unsigned char c:s) {
    if(c=='"'||c=='\\') o << '\\' << c;
    else if(c=='\n') o << "\\n";
    else if(c=='\r') o << "\\r";
    else if(c=='\t') o << "\\t";
    else if(c<32) o << ' ';
    else o << c;
  }
  o << '"';
}
void vector(std::ostream &o,V p) { o << '[' << p.x << ',' << p.y << ',' << p.z << ']'; }
}
// Stable C boundary; shared Sheet.cpp stays independent of browser/platform APIs.
extern "C" const char *paper_call(int op,int id,double u,double v,double x,double y,double z,double dt,const char *snapshot,int flags) {
 try {
  if(!sheet || op==0) {
   Material m; m.width=.210; m.height=.297;
   sheet=std::make_unique<Sheet>(8,m); sheet->solver=Solver::Implicit; sheet->fixedDt=1./240;
  }
  if(op==2) sheet->advance(dt);
  else if(op==3) sheet->setHandle(sheet->anchor(u,v,id,{x,y,z},flags&1,flags&2));
  else if(op==4) sheet->moveHandle(id,{x,y,z});
  else if(op==5) sheet->release(id);
  else if(op==6) sheet->releaseTransient();
  else if(op==9) { if(!snapshot) throw std::runtime_error("missing material mesh"); sheet->importMesh(snapshot,dt); }
  else if(op==10 || op==13) {}
  else if(op==11) { if(!snapshot) throw std::runtime_error("missing forming targets");sheet->drivePose(snapshot,flags&2); }
  else if(op==12) {sheet->formingTargets.clear();sheet->formingPress=false;}
  else if(op==8) { if(!snapshot) throw std::runtime_error("missing snapshot"); sheet->load(snapshot); }
  else if(op!=0 && op!=1 && op!=7) throw std::runtime_error("unknown operation");
  sheet->measure();
  std::ostringstream o; o << std::setprecision(12) << "{\"ok\":true,\"positions\":[";
  bool first=true;
  for(auto &n:sheet->nodes) { if(!first)o<<','; first=false; o<<n.p.x<<','<<n.p.y<<','<<n.p.z; }
  o<<"],\"uv\":[";first=true;
  for(auto &n:sheet->nodes) {if(!first)o<<',';first=false;o<<n.uv.x<<','<<n.uv.y;}
  o<<"],\"triangles\":[";first=true;
  for(auto &f:sheet->faces)for(int i:f.v){if(!first)o<<',';first=false;o<<i;}
  o<<"],\"creases\":[";first=true;
  for(auto &h:sheet->hinges)if(std::abs(h.rest)>.015){if(!first)o<<',';first=false;o<<'['<<h.v[0]<<','<<h.v[1]<<','<<h.rest<<']';}
  o<<"],\"anchors\":[";first=true;
  for(auto &h:sheet->handles){
   V p{};for(int i=0;i<3;i++)p+=sheet->nodes[h.v[i]].p*h.w[i];
   if(!first)o<<',';first=false;
   o<<"{\"id\":"<<h.id<<",\"uv\":["<<h.materialPoint.x<<','<<h.materialPoint.y<<"],\"p\":";vector(o,p);
   o<<",\"target\":";vector(o,h.target);o<<",\"pin\":"<<(h.pin?"true":"false")<<",\"press\":"<<(h.press?"true":"false")<<'}';
  }
  double maxSpeed=0;for(const auto&n:sheet->nodes)maxSpeed=std::max(maxSpeed,n.v.norm());
  auto&s=sheet->stats;
  o<<"],\"solver\":\"implicit-gn\",\"stats\":{\"time\":"<<s.time<<",\"ms\":"<<s.stepMs<<",\"strainMax\":"<<s.strainMax<<",\"strainP95\":"<<s.strainP95<<",\"mass\":"<<s.mass<<",\"area\":"<<s.area<<",\"plastic\":"<<s.plastic<<",\"maxPlastic\":"<<s.maxPlastic<<",\"contacts\":"<<s.contacts<<",\"ccdLimited\":"<<s.ccdLimited<<",\"backlog\":"<<s.droppedTime<<",\"maxSpeed\":"<<maxSpeed<<'}';
  if(op==10 || op==9 || op==7) {
    auto a=sheet->audit();
    o<<",\"audit\":{\"checked\":true,\"intersections\":"<<a.intersections<<",\"penetration\":"<<a.penetration<<'}';
  }
  if(op==7||op==6||op==13){o<<",\"state\":";quoted(o,sheet->save());}
  o<<'}'; output=o.str();
 }catch(const std::exception&e){std::ostringstream o;o<<"{\"ok\":false,\"error\":";quoted(o,e.what());o<<'}';output=o.str();}
 return output.c_str();
}
