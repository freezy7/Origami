#include "Sheet.hpp"
#include <fstream>
#include <sstream>
#include <iostream>
#include <iomanip>
#include <stdexcept>
#include <cstdlib>
using namespace paper;
int main(int argc,char**argv){try{
 if(argc!=4&&argc!=5)throw std::runtime_error("mesh, targets, output snapshot and optional supports required");
 std::ifstream input(argv[1]);std::stringstream text;text<<input.rdbuf();Sheet s(2);s.importMesh(text.str(),0);
 if(std::getenv("PAPER_SOLVE_ACCURATE")){s.nonlinearIterations=12;s.cgIterations=500;}
 std::vector<V> pins=std::getenv("PAPER_INTERIOR_PINS")?std::vector<V>{{.0072,-.09779,0},{.0144,-.09779,0},{.0144,.003626,0}}:std::vector<V>{{0,-.12,0},{.01,-.12,0},{0,.08,0}};
 if(argc==5){std::ifstream supportFile(argv[4]);int count;supportFile>>count;if(!supportFile||count<0||count>3)throw std::runtime_error("invalid supports");pins.clear();for(int i=0;i<count;i++){V uv;supportFile>>uv.x>>uv.y;if(!supportFile)throw std::runtime_error("truncated supports");pins.push_back(uv);}}
 int id=-1;if(!std::getenv("PAPER_NO_SUPPORT_PINS"))for(auto uv:pins){auto h=s.anchor(uv.x,uv.y,id--,{},true);h.target=h.current;s.setHandle(h);}
 double peakStrain=0,peakPenetration=0;int intersections=0,step=0;double peakSpeed=0;
 auto inspect=[&](){s.measure();peakStrain=std::max(peakStrain,s.stats.strainMax);if(s.stats.strainMax>.020001)throw std::runtime_error("material strain gate failed");
  auto a=s.audit();intersections=std::max(intersections,a.intersections);peakPenetration=std::max(peakPenetration,a.penetration);
  if(a.intersections || a.penetration>s.material.thickness*.2)throw std::runtime_error("material collision gate failed at step "+std::to_string(step)+": intersections="+std::to_string(a.intersections)+", penetration="+std::to_string(a.penetration));
 };
 inspect();std::ifstream drive(argv[2]);std::string line;
 auto advanceTarget=[&](const std::string&line){
  std::ostringstream target;target<<"PAPER_TARGETS 1\n"<<s.nodes.size()<<'\n'<<line;s.drivePose(target.str(),true);s.step(1./240);step++;
  s.measure();peakStrain=std::max(peakStrain,s.stats.strainMax);if(step%12==0)inspect();
  if(std::getenv("PAPER_FORM_DEBUG") && step%192==0){double error=0,angular=0;int active=0;for(size_t i=0;i<s.nodes.size();i++)error+=(s.nodes[i].p-s.formingTargets[i]).norm2();for(size_t i=0;i<s.hinges.size();i++)if(s.formingActive[i]){const auto&h=s.hinges[i];auto a=dihedral(s.nodes[h.v[0]].p,s.nodes[h.v[1]].p,s.nodes[h.v[2]].p,s.nodes[h.v[3]].p);double d=wrap(a.value-s.formingAngles[i]);angular+=d*d;active++;}std::cerr<<"stage "<<step/192<<" target RMS "<<std::sqrt(error/s.nodes.size())<<" strain "<<s.stats.strainMax<<" active "<<active<<" angular RMS "<<std::sqrt(angular/std::max(1,active))<<" z "<<s.nodes.back().p.z<<'\n';}
 };
 while(std::getline(drive,line))advanceTarget(line);
 std::vector<V> held;for(const auto&n:s.nodes)held.push_back(n.p);
 s.formingTargets.clear();s.formingPress=false;
 double speed=0;int relaxed=0;
 for(int i=0;i<720;i++){
  s.step(1./240);step++;relaxed++;speed=0;for(const auto&n:s.nodes)speed=std::max(speed,n.v.norm());
  if(i%12==11)inspect();if(i>=119&&speed<.02)break;
 }
 inspect();double rebound=0;for(size_t i=0;i<s.nodes.size();i++)rebound+=(s.nodes[i].p-held[i]).norm2();rebound=std::sqrt(rebound/s.nodes.size());
 if(rebound<1e-7)throw std::runtime_error("release produced no material response");
 if(speed>.05)throw std::runtime_error("material did not settle before flight");
 auto saved=s.save();Sheet restored(2);restored.load(saved);if(restored.save()!=saved)throw std::runtime_error("material snapshot round trip");
 std::ofstream output(argv[3]);output<<saved;
 std::cout<<std::setprecision(12)<<"{\"ok\":true,\"nodes\":"<<s.nodes.size()<<",\"triangles\":"<<s.faces.size()<<",\"steps\":"<<step<<",\"relaxSteps\":"<<relaxed<<",\"peakStrain\":"<<peakStrain<<",\"finalStrain\":"<<s.stats.strainMax<<",\"intersections\":"<<intersections<<",\"peakPenetration\":"<<peakPenetration<<",\"releaseMotionRMS\":"<<rebound<<",\"finalSpeed\":"<<speed<<",\"plasticHinges\":"<<s.stats.plastic<<",\"mass\":"<<s.stats.mass<<",\"area\":"<<s.stats.area<<"}\n";
 }catch(const std::exception&e){std::cerr<<e.what()<<'\n';return 1;}}
