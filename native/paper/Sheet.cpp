#include "Sheet.hpp"
#include <chrono>
#include <iomanip>
#include <map>
#include <numeric>
#include <sstream>
#include <stdexcept>
namespace paper {
namespace {
constexpr double gripStiffness = 800, gripForce = .08;
constexpr double formingFrequencySquared=4000000, formingHingeGain=10000;
constexpr double contactBarrierStiffness=10000;
double formingGain(double angle){double t=std::min(1.,std::abs(angle)/.05);return 10+(formingHingeGain-10)*t*t;}
double formingError(const Sheet&s,size_t i,double angle){
  const double reference=s.formingActual.size()==s.hinges.size()?s.formingActual[i]:angle;
  return reference+wrap(angle-reference)-s.formingAngles[i];
}
struct BarrierValue {double value,first,second;};
BarrierValue contactBarrier(double distance,double thickness){
  // Keep the logarithm's singularity strictly inside the swept guard, so
  // floating-point contact tolerance cannot leave an infinite-energy state.
  const double gap=distance-thickness*.95,range=.1*thickness;
  if(gap>=range)return{0,0,0};
  if(gap<=0)return{std::numeric_limits<double>::infinity(),-1e30,1e30};
  const double q=gap-range,l=std::log(gap/range);
  return{-q*q*l,-2*q*l-q*q/gap,-2*l-4*q/gap+q*q/(gap*gap)};
}
void require(bool condition, const char *message) {
  if (!condition)
    throw std::runtime_error(message);
}
struct Equation {
  std::array<int, 4> id{};
  std::array<V, 4> g{};
  int count = 0;
  double c = 0, k = 0;
  bool contact=false;
  bool vf=false;
  std::array<double,4> weights{};
  V normal;
};
struct FrictionContact {
  std::array<int,4> id;
  std::array<double,4> weights;
  V normal;
  double force=0;
};
// Isotropic membrane strain in material coordinates. Edge springs alone do not
// control shear on skinny triangles, even when their edge errors look small.
std::vector<Equation> membraneTerms(const Sheet &s, const std::vector<V> *x=nullptr, int faceIndex=-1) {
  std::vector<Equation> out;out.reserve(faceIndex>=0?4:s.faces.size()*4);
  const double nu=.3,mu=s.material.membrane/(2*(1+nu)),lambda=s.material.membrane*nu/(1-nu*nu);
  const size_t first=faceIndex>=0?size_t(faceIndex):0,last=faceIndex>=0?first+1:s.faces.size();
  for(size_t fi=first;fi<last;fi++) {
    const auto &f=s.faces[fi];
    V u=s.nodes[f.v[1]].uv-s.nodes[f.v[0]].uv,v=s.nodes[f.v[2]].uv-s.nodes[f.v[0]].uv;
    double det=u.x*v.y-u.y*v.x;
    V a=x?(*x)[f.v[0]]:s.nodes[f.v[0]].p,b=x?(*x)[f.v[1]]:s.nodes[f.v[1]].p,c=x?(*x)[f.v[2]]:s.nodes[f.v[2]].p;
    V fx=((b-a)*v.y-(c-a)*u.y)/det,fy=((c-a)*u.x-(b-a)*v.x)/det;
    double wx[]={ (u.y-v.y)/det,v.y/det,-u.y/det },wy[]={ (v.x-u.x)/det,-v.x/det,u.x/det };
    double ex=.5*(fx.norm2()-1),ey=.5*(fy.norm2()-1),shear=fx.dot(fy);
    double values[]={ex,ey,shear,ex+ey},stiffness[]={2*mu*f.area,2*mu*f.area,mu*f.area,lambda*f.area};
    for(int k=0;k<4;k++) {
      Equation q;q.count=3;q.c=values[k];q.k=stiffness[k];
      for(int i=0;i<3;i++) {
        q.id[i]=f.v[i];
        q.g[i]=k==0?fx*wx[i]:k==1?fy*wy[i]:k==2?fy*wx[i]+fx*wy[i]:fx*wx[i]+fy*wy[i];
      }
      out.push_back(q);
    }
  }
  return out;
}
void projectMaterial(const Sheet&s,std::vector<V>&x){
  for(int pass=0;pass<12;pass++){
    bool changed=false;
    for(size_t fi=0;fi<s.faces.size();fi++){
      const auto&f=s.faces[fi];V u=s.nodes[f.v[1]].uv-s.nodes[f.v[0]].uv,v=s.nodes[f.v[2]].uv-s.nodes[f.v[0]].uv;
      V a=x[f.v[1]]-x[f.v[0]],b=x[f.v[2]]-x[f.v[0]];const double det=u.x*v.y-u.y*v.x;
      V fx=(a*v.y-b*u.y)/det,fy=(b*u.x-a*v.x)/det;
      const double A=fx.norm2(),B=fx.dot(fy),C=fy.norm2(),root=std::hypot(A-C,2*B),s1=.5*(A+C+root),s2=.5*(A+C-root);
      if(s1<=1.0195*1.0195 && s2>=.9805*.9805)continue;
      changed=true;const double angle=.5*std::atan2(2*B,A-C),c=std::cos(angle),q=std::sin(angle);
      const double p=clamp(s1,.9805*.9805,1.0195*1.0195),r=clamp(s2,.9805*.9805,1.0195*1.0195);
      double target[]={.5*(p*c*c+r*q*q-1),.5*(p*q*q+r*c*c-1),(p-r)*c*q,.5*(p+r-2)};
      for(int k=0;k<4;k++){
        const auto e=membraneTerms(s,&x,int(fi))[k];double den=0;for(int j=0;j<3;j++)den+=e.g[j].norm2()/s.nodes[e.id[j]].mass;
        if(den<1e-20)continue;const double dl=(e.c-target[k])/den;
        for(int j=0;j<3;j++)x[e.id[j]]-=e.g[j]*(dl/s.nodes[e.id[j]].mass);
      }
    }
    if(!changed)break;
  }
}
// Collision penalties participate in the same membrane/bending solve. A final
// projection remains as a finite-iteration safeguard, not the sole response.
// Layer ordering only selects a separation direction when an imported pair is
// exactly coincident. Subsequent dynamics use geometric contact normals.
V contactNormal(const Sheet&s,std::array<int,4> id,bool vf,const std::array<V,4>&p) {
  V n{};
  if(vf)n=(p[2]-p[1]).cross(p[3]-p[1]);
  else {
    n=(p[1]-p[0]).cross(p[3]-p[2]);
    if(n.norm()<1e-14)for(const auto&f:s.faces) {
      bool a=false,b=false;for(int v:f.v){a|=v==id[0];b|=v==id[1];}
      if(a&&b){n=(s.nodes[f.v[1]].p-s.nodes[f.v[0]].p).cross(s.nodes[f.v[2]].p-s.nodes[f.v[0]].p);break;}
    }
  }
  auto q=vf?pointTriangle(p[0],p[1],p[2],p[3]):edgeEdge(p[0],p[1],p[2],p[3]);
  double order=0;for(int i=0;i<4;i++)order+=s.nodes[id[i]].layer*q.weights[i];
  if(std::abs(order)>1e-6){
    double dominant=std::abs(n.x)>=std::abs(n.y)&&std::abs(n.x)>=std::abs(n.z)?n.x:std::abs(n.y)>=std::abs(n.z)?n.y:n.z;
    if(dominant*order<0)n=-n;
  }
  return n;
}
bool feasible(const Sheet &s,const std::vector<V> &from,const std::vector<V> &to) {
  // Numerical strain limit: reject a step instead of stretching paper through
  // contact. This is a solver safeguard, not a measured rupture criterion.
  for(const auto&f:s.faces){
    V u=s.nodes[f.v[1]].uv-s.nodes[f.v[0]].uv,v=s.nodes[f.v[2]].uv-s.nodes[f.v[0]].uv;
    V a=to[f.v[1]]-to[f.v[0]],b=to[f.v[2]]-to[f.v[0]];double det=u.x*v.y-u.y*v.x;
    V fx=(a*v.y-b*u.y)/det,fy=(b*u.x-a*v.x)/det;
    double A=fx.norm2(),B=fx.dot(fy),C=fy.norm2(),root=std::sqrt((A-C)*(A-C)+4*B*B);
    if(.5*(A+C+root)>1.02*1.02+1e-10 || .5*(A+C-root)<.98*.98-1e-10)return false;
  }
  if(!s.selfContact)return true;
  const double d=s.material.thickness*.96,tol=std::max(1e-10,d*1e-5);
  std::vector<Box> boxes;for(size_t i=0;i<s.nodes.size();i++)boxes.push_back(swept(from[i],to[i],d));
  auto safe=[&](std::array<int,4> id,bool vf){
    std::array<V,4>a,b;for(int i=0;i<4;i++){a[i]=from[id[i]];b[i]=to[id[i]];}
    auto hit=continuous(a,b,d,vf,contactNormal(s,id,vf,a));if(!hit.hit)return true;
    V uv{};for(int i=0;i<4;i++)uv+=s.nodes[id[i]].uv*hit.feature.weights[i];
    if(uv.norm()<2*s.material.thickness)return true;
    auto start=vf?pointTriangle(a[0],a[1],a[2],a[3]):edgeEdge(a[0],a[1],a[2],a[3]);
    auto end=vf?pointTriangle(b[0],b[1],b[2],b[3]):edgeEdge(b[0],b[1],b[2],b[3]);
    if(hit.time<=1e-7 && start.delta.norm()<d-tol && end.delta.dot(hit.normal)>=start.delta.norm()-tol)return true;
    if(hit.time<=1e-7 && start.delta.norm()<=d+tol && end.delta.dot(hit.normal)>=d-tol)return true;
    return false;
  };
  for(size_t i=0;i<s.nodes.size();i++)for(const auto&f:s.faces){
    if(f.v[0]==int(i)||f.v[1]==int(i)||f.v[2]==int(i))continue;
    if(overlaps(boxes[i],unite(unite(boxes[f.v[0]],boxes[f.v[1]]),boxes[f.v[2]])) && !safe({int(i),f.v[0],f.v[1],f.v[2]},true))return false;
  }
  for(size_t i=0;i<s.edges.size();i++)for(size_t j=i+1;j<s.edges.size();j++){
    const auto&a=s.edges[i];const auto&b=s.edges[j];if(a.a==b.a||a.a==b.b||a.b==b.a||a.b==b.b)continue;
    if(overlaps(unite(boxes[a.a],boxes[a.b]),unite(boxes[b.a],boxes[b.b])) && !safe({a.a,a.b,b.a,b.b},false))return false;
  }
  return true;
}
std::vector<Equation> contactTerms(const Sheet &s,const std::vector<V> &old) {
  std::vector<Equation> out;if(!s.selfContact)return out;
  const double d=s.material.thickness,activation=d*1.05;
  std::vector<Box> boxes;for(size_t i=0;i<s.nodes.size();i++)boxes.push_back(swept(old[i],s.nodes[i].p,activation));
  auto add=[&](std::array<int,4> id,bool vf,V hint=V{}) {
    std::array<V,4>a,b;for(int i=0;i<4;i++){a[i]=old[id[i]];b[i]=s.nodes[id[i]].p;}
    auto current=vf?pointTriangle(b[0],b[1],b[2],b[3]):edgeEdge(b[0],b[1],b[2],b[3]);
    auto barrier=contactBarrier(current.delta.norm(),d);if(barrier.second<=0)return;
    V uv{};for(int i=0;i<4;i++)uv+=s.nodes[id[i]].uv*current.weights[i];
    if(uv.norm()<2*d)return;
    Equation q;q.id=id;q.count=4;q.c=barrier.first/barrier.second;q.k=contactBarrierStiffness*barrier.second;q.contact=true;q.vf=vf;
    V normal=current.delta.unit(contactNormal(s,id,vf,a));
    q.weights=current.weights;q.normal=normal;
    for(int i=0;i<4;i++)q.g[i]=normal*current.weights[i];out.push_back(q);
  };
  for(size_t i=0;i<s.nodes.size();i++)for(const auto&f:s.faces){
    if(f.v[0]==int(i)||f.v[1]==int(i)||f.v[2]==int(i))continue;
    auto tri=unite(unite(boxes[f.v[0]],boxes[f.v[1]]),boxes[f.v[2]]);
    if(overlaps(boxes[i],tri))add({int(i),f.v[0],f.v[1],f.v[2]},true,(old[f.v[1]]-old[f.v[0]]).cross(old[f.v[2]]-old[f.v[0]]));
  }
  for(size_t i=0;i<s.edges.size();i++)for(size_t j=i+1;j<s.edges.size();j++){
    const auto&a=s.edges[i];const auto&b=s.edges[j];
    if(a.a==b.a||a.a==b.b||a.b==b.a||a.b==b.b)continue;
    if(overlaps(unite(boxes[a.a],boxes[a.b]),unite(boxes[b.a],boxes[b.b])))add({a.a,a.b,b.a,b.b},false);
  }
  return out;
}
std::vector<Equation> equations(const Sheet &s) {
  std::vector<Equation> all;
  all.reserve(s.edges.size() + s.hinges.size() + s.handles.size() * 3);
  auto membrane=membraneTerms(s);all.insert(all.end(),membrane.begin(),membrane.end());
  for (const auto &h : s.hinges) {
    auto a = dihedral(s.nodes[h.v[0]].p, s.nodes[h.v[1]].p, s.nodes[h.v[2]].p,
                      s.nodes[h.v[3]].p);
    if (a.valid) {
      all.push_back({h.v, a.gradient, 4, wrap(a.value - h.rest),h.stiffness * (1 - .65 * h.strength)});
      size_t index=&h-s.hinges.data();
      if(s.formingTargets.size()==s.nodes.size() && s.formingAngles.size()==s.hinges.size() && s.formingActive[index])
        all.push_back({h.v,a.gradient,4,formingError(s,index,a.value),h.stiffness*formingGain(s.formingAngles[index])});
    }
  }
  for (const auto &h : s.handles) {
    V p{};
    for (int i = 0; i < 3; i++)
      p += s.nodes[h.v[i]].p * h.w[i];
    V delta = p - h.current;
    double components[] = {delta.x, delta.y, delta.z};
    for (int a = 0; a < 3; a++) {
      Equation q;
      q.count = 3;
      q.c = components[a];
      q.k = h.pin ? 1e8
                  : std::min(gripStiffness,
                             gripForce / std::max(delta.norm(), 1e-12));
      for (int i = 0; i < 3; i++) {
        q.id[i] = h.v[i];
        q.g[i] = a == 0   ? V{h.w[i], 0, 0}
                 : a == 1 ? V{0, h.w[i], 0}
                          : V{0, 0, h.w[i]};
      }
      all.push_back(q);
    }
  }
  if(s.formingTargets.size()==s.nodes.size()) for(size_t i=0;i<s.nodes.size();i++) {
    V delta=s.nodes[i].p-s.formingTargets[i];
    for(V direction:{V{1,0,0},V{0,1,0},V{0,0,1}}) {
      Equation q;q.count=1;q.id[0]=int(i);q.c=delta.dot(direction);q.k=s.nodes[i].mass*formingFrequencySquared;
      q.g[0]=direction;all.push_back(q);
    }
  }
  for (size_t i = 0; i < s.nodes.size(); i++)
    if (s.nodes[i].p.z < s.material.thickness / 2) {
      Equation q;
      q.id[0] = int(i);
      q.g[0] = {0, 0, 1};
      q.count = 1;
      q.c = s.nodes[i].p.z - s.material.thickness / 2;
      q.k = 1e6;
      all.push_back(q);
    }
  return all;
}
double inner(const std::vector<V> &a, const std::vector<V> &b) {
  double sum = 0;
  for (size_t i = 0; i < a.size(); i++)
    sum += a[i].dot(b[i]);
  return sum;
}
} // namespace
Sheet::Sheet(int cells, Material m) : material(m) {
  require(m.width > 0 && m.width <= 1 && m.height > 0 && m.height <= 1,
          "invalid sheet dimensions");
  require(cells >= 2 && cells <= 24,
          "mesh cells outside experimental capacity");
  const int rows = std::max(2, int(std::lround(cells * m.height / m.width)));
  uint32_t seed = 731;
  auto noise = [&]() {
    seed = 1664525 * seed + 1013904223;
    return (double(seed % 65536) / 65535 - .5) * .3;
  };
  for (int j = 0; j <= rows; j++)
    for (int i = 0; i <= cells; i++) {
      const bool boundary = i == 0 || j == 0 || i == cells || j == rows;
      V uv{(i + (boundary ? 0 : noise())) * m.width / cells - m.width / 2,
           (j + (boundary ? 0 : noise())) * m.height / rows - m.height / 2, 0};
      nodes.push_back({uv, {uv.x, uv.y, m.thickness / 2}, {}, 0});
    }
  for (int j = 0; j < rows; j++)
    for (int i = 0; i < cells; i++) {
      int a = j * (cells + 1) + i, b = a + 1, c = a + cells + 1, d = c + 1;
      if ((i + j) % 2) {
        faces.push_back({{a, b, c}});
        faces.push_back({{b, d, c}});
      } else {
        faces.push_back({{a, b, d}});
        faces.push_back({{a, d, c}});
      }
    }
  rebuild();
  measure();
}
void Sheet::rebuild() {
  require(material.width > 0 && material.width <= 1 && material.height > 0 &&
              material.height <= 1 && material.grammage > 0 &&
              material.grammage < 2 && material.thickness > 1e-6 &&
              material.thickness < .005 && material.membrane > 0 &&
              material.bending > 0 && material.yieldCurvature > 0 &&
              material.creep >= 0 && material.friction >= 0,
          "invalid material");
  for (auto &n : nodes)
    n.mass = 0;
  struct Half {
    int a, b, c;
    double area;
  };
  std::map<std::pair<int, int>, Half> halves;
  std::map<std::pair<int, int>, double> edgeAreas;
  std::map<std::pair<int, int>, int> incidences;
  edges.clear();
  hinges.clear();
  for (auto &f : faces) {
    for (int v : f.v)
      require(v >= 0 && v < int(nodes.size()), "invalid face vertex");
    V a = nodes[f.v[0]].uv, b = nodes[f.v[1]].uv, c = nodes[f.v[2]].uv;
    double area = (b - a).cross(c - a).z / 2;
    require(area > 1e-12, "non-positive material triangle");
    f.area = area;
    for (int v : f.v)
      nodes[v].mass += area * material.grammage / 3;
    for (int j = 0; j < 3; j++) {
      int a = f.v[j], b = f.v[(j + 1) % 3], c = f.v[(j + 2) % 3];
      auto key = std::minmax(a, b);
      edgeAreas[key] += area;
      require(++incidences[key] <= 2, "non-manifold edge");
      auto it = halves.find(key);
      if (it == halves.end())
        halves[key] = {a, b, c, area};
      else {
        Half old = it->second;
        require(old.a == b && old.b == a,
                "non-manifold or inconsistent winding");
        double l = (nodes[a].uv - nodes[b].uv).norm(),
               dual = (old.area + area) / l;
        hinges.push_back({{old.a, old.b, old.c, c},
                          0,
                          0,
                          material.bending * l / dual,
                          dual,
                          0});
        halves.erase(it);
      }
    }
  }
  for (const auto &entry : edgeAreas) {
    int a = entry.first.first, b = entry.first.second;
    double l = (nodes[a].uv - nodes[b].uv).norm();
    edges.push_back({a, b, l, material.membrane * entry.second / (l * l), 0});
  }
  for (const auto &n : nodes)
    require(n.mass > 0 && n.p.finite() && n.v.finite() && n.uv.finite(),
            "invalid or orphan node");
}
Handle Sheet::anchor(double u, double v, int id, V target, bool pin,
                     bool press) const {
  require(std::isfinite(u) && std::isfinite(v) && target.finite() &&
              target.norm() < 2,
          "invalid grip target");
  for (const auto &f : faces) {
    V a = nodes[f.v[0]].uv, b = nodes[f.v[1]].uv, c = nodes[f.v[2]].uv,
      p{u, v, 0};
    V e = b - a, d = c - a, r = p - a;
    double det = e.x * d.y - e.y * d.x, w1 = (r.x * d.y - r.y * d.x) / det,
           w2 = (e.x * r.y - e.y * r.x) / det, w0 = 1 - w1 - w2;
    if (std::min({w0, w1, w2}) >= -1e-7) {
      V current{};
      std::array<double, 3> w{w0, w1, w2};
      for (int i = 0; i < 3; i++)
        current += nodes[f.v[i]].p * w[i];
      return {id, f.v, w, target, current, {}, pin, press, {u, v, 0}};
    }
  }
  throw std::runtime_error("grip outside material domain");
}
void Sheet::setHandle(Handle h) {
  release(h.id);
  require(handles.size() < 12, "too many grips");
  handles.push_back(h);
}
void Sheet::moveHandle(int id, V target) {
  require(target.finite() && target.norm() < 2, "invalid grip target");
  for (auto &h : handles)
    if (h.id == id) {
      h.target = target;
      return;
    }
}
void Sheet::release(int id) {
  handles.erase(std::remove_if(handles.begin(), handles.end(),
                               [&](const Handle &h) { return h.id == id; }),
                handles.end());
}
void Sheet::releaseTransient() {
  handles.erase(std::remove_if(handles.begin(), handles.end(),
                               [](const Handle &h) { return !h.pin; }),
                handles.end());
}
void Sheet::solveHandles(double dt) {
  for (auto &h : handles) {
    V p{};
    double wsum = 0;
    for (int i = 0; i < 3; i++) {
      p += nodes[h.v[i]].p * h.w[i];
      wsum += h.w[i] * h.w[i] / nodes[h.v[i]].mass;
    }
    double alpha = 1 / ((h.pin ? 1e8 : gripStiffness) * dt * dt);
    V dl = (-(p - h.current) - h.lambda * alpha) / (wsum + alpha),
      next = h.lambda + dl;
    if (!h.pin && next.norm() > gripForce * dt * dt)
      next = next.unit() * (gripForce * dt * dt);
    dl = next - h.lambda;
    h.lambda = next;
    for (int i = 0; i < 3; i++)
      nodes[h.v[i]].p += dl * (h.w[i] / nodes[h.v[i]].mass);
  }
}
void Sheet::xpbd(double dt) {
  const double h2 = dt * dt;
  for(size_t f=0;f<faces.size();f++) for(int k=0;k<4;k++) {
    const auto terms=membraneTerms(*this,nullptr,int(f));const auto&q=terms[k];
    double alpha=1/(q.k*h2),den=alpha;
    for(int i=0;i<q.count;i++)den+=q.g[i].norm2()/nodes[q.id[i]].mass;
    double &lambda=faces[f].lambda[k],dl=(-q.c-alpha*lambda)/den;lambda+=dl;
    for(int i=0;i<q.count;i++)nodes[q.id[i]].p+=q.g[i]*(dl/nodes[q.id[i]].mass);
  }
  for (auto &h : hinges) {
    auto a = dihedral(nodes[h.v[0]].p, nodes[h.v[1]].p, nodes[h.v[2]].p,
                      nodes[h.v[3]].p);
    if (!a.valid)
      continue;
    double alpha = 1 / (h.stiffness * (1 - .65 * h.strength) * h2), den = alpha;
    for (int i = 0; i < 4; i++)
      den += a.gradient[i].norm2() / nodes[h.v[i]].mass;
    double dl = (-wrap(a.value - h.rest) - alpha * h.lambda) / den;
    h.lambda += dl;
    for (int i = 0; i < 4; i++)
      nodes[h.v[i]].p += a.gradient[i] * (dl / nodes[h.v[i]].mass);
  }
  solveHandles(dt);
}
double Sheet::potential(const std::vector<V> &x) const {
  double E = 0;
  for(const auto&q:membraneTerms(*this,&x)) E+=.5*q.k*q.c*q.c;
  for (const auto &h : hinges) {
    auto a = dihedral(x[h.v[0]], x[h.v[1]], x[h.v[2]], x[h.v[3]]);
    if (a.valid) {
      double c = wrap(a.value - h.rest);
      E += .5 * h.stiffness * (1 - .65 * h.strength) * c * c;
      size_t index=&h-hinges.data();
      if(formingTargets.size()==nodes.size() && formingAngles.size()==hinges.size() && formingActive[index]) {
        double d=formingError(*this,index,a.value);E+=.5*h.stiffness*formingGain(formingAngles[index])*d*d;
      }
    }
  }
  for (const auto &h : handles) {
    V p{};
    for (int i = 0; i < 3; i++)
      p += x[h.v[i]] * h.w[i];
    double dist = (p - h.current).norm();
    E += h.pin ? .5 * 1e8 * dist * dist
         : dist < gripForce / gripStiffness
             ? .5 * gripStiffness * dist * dist
             : gripForce * (dist - .5 * gripForce / gripStiffness);
  }
  if(formingTargets.size()==x.size()) for(size_t i=0;i<x.size();i++)E+=.5*nodes[i].mass*formingFrequencySquared*(x[i]-formingTargets[i]).norm2();
  for (const auto &p : x)
    if (p.z < material.thickness / 2) {
      double gap = p.z - material.thickness / 2;
      E += .5 * 1e6 * gap * gap;
    }
  return E;
}
void Sheet::implicit(double dt, const std::vector<V> &predicted,const std::vector<V> &old) {
  // Damped Gauss-Newton, matrix-free PCG. Same membrane and signed bending
  // energies as XPBD; contact uses the same split projection in both
  // candidates.
  const size_t n = nodes.size();
  const double h2 = dt * dt;
  std::vector<Equation> contact;
  std::vector<FrictionContact> friction;
  const double frictionEpsilon=1e-3*dt;
  double barrierStiffness=contactBarrierStiffness;
  auto energy = [&](const std::vector<V> &x) {
    double E = potential(x);
    for(const auto&q:contact) {
      auto p=q.vf?pointTriangle(x[q.id[0]],x[q.id[1]],x[q.id[2]],x[q.id[3]]):edgeEdge(x[q.id[0]],x[q.id[1]],x[q.id[2]],x[q.id[3]]);
      V uv{};for(int j=0;j<4;j++)uv+=nodes[q.id[j]].uv*p.weights[j];
      if(uv.norm()<2*material.thickness)continue;
      E+=barrierStiffness*contactBarrier(p.delta.norm(),material.thickness).value;
    }
    for(const auto&q:friction) {
      V slip{};for(int j=0;j<4;j++)slip+=(x[q.id[j]]-old[q.id[j]])*q.weights[j];
      slip-=q.normal*slip.dot(q.normal);
      E+=q.force*(std::sqrt(slip.norm2()+frictionEpsilon*frictionEpsilon)-frictionEpsilon);
    }
    for (size_t i = 0; i < n; i++)
      E += .5 * nodes[i].mass / h2 * (x[i] - predicted[i]).norm2();
    return E;
  };
  for (int outer = 0; outer < nonlinearIterations; outer++) {
    auto eq = equations(*this);
    contact=contactTerms(*this,old);
    std::vector<V> otherForce(n);
    for(size_t i=0;i<n;i++)otherForce[i]=(predicted[i]-nodes[i].p)*(nodes[i].mass/h2);
    for(const auto&q:eq)for(int j=0;j<q.count;j++)otherForce[q.id[j]]-=q.g[j]*(q.k*q.c);
    barrierStiffness=contactBarrierStiffness;
    for(const auto&q:contact){
      double closing=0,den=0;
      for(int j=0;j<q.count;j++){const int id=q.id[j];closing+=q.g[j].dot(otherForce[id])/nodes[id].mass;den+=q.g[j].norm2()/nodes[id].mass;}
      const double derivative=q.c*q.k/contactBarrierStiffness;
      if(closing<0&&derivative<0)barrierStiffness=std::max(barrierStiffness,std::min(1e9,4*(-closing)/std::max(1e-30,(-derivative)*den)));
    }
    for(auto&q:contact)q.k*=barrierStiffness/contactBarrierStiffness;
    // Lag the contact frame and normal force during each Newton/line-search
    // iteration. Tangential resistance is bounded by mu*N, never a weld.
    // Releasing normal contact removes friction automatically.
    friction.clear();
    if(material.friction>0)for(const auto&q:contact) {
      const double force=material.friction*std::max(0.,-q.c*q.k);
      if(force<=0)continue;
      friction.push_back({q.id,q.weights,q.normal,force});
      V slip{};for(int j=0;j<4;j++)slip+=(nodes[q.id[j]].p-old[q.id[j]])*q.weights[j];
      slip-=q.normal*slip.dot(q.normal);
      V tangent=q.normal.cross(std::abs(q.normal.x)<.8?V{1,0,0}:V{0,1,0}).unit();
      for(const V direction:{tangent,q.normal.cross(tangent)}) {
        Equation f;f.id=q.id;f.count=4;f.c=slip.dot(direction);
        f.k=force/std::sqrt(slip.norm2()+frictionEpsilon*frictionEpsilon);
        for(int j=0;j<4;j++)f.g[j]=direction*q.weights[j];
        eq.push_back(f);
      }
    }
    eq.insert(eq.end(),contact.begin(),contact.end());
    std::vector<V> x(n), b(n), diag(n), step(n), r(n), z(n), p(n), ap(n);
    for (size_t i = 0; i < n; i++) {
      x[i] = nodes[i].p;
      double m = nodes[i].mass / h2;
      diag[i] = {m, m, m};
      b[i] = (predicted[i] - x[i]) * m;
    }
    for (auto &q : eq) {
      for (int j = 0; j < q.count; j++) {
        int i = q.id[j];
        V g = q.g[j];
        b[i] -= g * (q.k * q.c);
        diag[i] += {q.k * g.x * g.x, q.k * g.y * g.y, q.k * g.z * g.z};
      }
    }
    auto mul = [&](const std::vector<V> &v, std::vector<V> &out) {
      for (size_t i = 0; i < n; i++)
        out[i] = v[i] * (nodes[i].mass / h2);
      for (const auto &q : eq) {
        double dot = 0;
        for (int j = 0; j < q.count; j++)
          dot += q.g[j].dot(v[q.id[j]]);
        for (int j = 0; j < q.count; j++)
          out[q.id[j]] += q.g[j] * (q.k * dot);
      }
    };
    r = b;
    for (size_t i = 0; i < n; i++)
      z[i] = {r[i].x / diag[i].x, r[i].y / diag[i].y, r[i].z / diag[i].z};
    p = z;
    double rz = inner(r, z), initial = std::max(inner(r, r), 1e-30);
    for (int k = 0; k < cgIterations && inner(r, r) > initial * 1e-12; k++) {
      mul(p, ap);
      double den = inner(p, ap);
      if (den < 1e-30)
        break;
      double a = rz / den;
      for (size_t i = 0; i < n; i++) {
        step[i] += p[i] * a;
        r[i] -= ap[i] * a;
        z[i] = {r[i].x / diag[i].x, r[i].y / diag[i].y, r[i].z / diag[i].z};
      }
      double next = inner(r, z), beta = next / std::max(rz, 1e-30);
      for (size_t i = 0; i < n; i++)
        p[i] = z[i] + p[i] * beta;
      rz = next;
    }
    double e0 = energy(x), rate = 1;
    std::vector<V> trial(n);
    bool accepted = false;
    for (int ls = 0; ls < 18; ls++) {
      for (size_t i = 0; i < n; i++)
        trial[i] = x[i] + step[i] * rate;
      if(formingTargets.size()==nodes.size())projectMaterial(*this,trial);
      if (energy(trial) <= e0 + 1e-14 && feasible(*this,x,trial)) {
        accepted = true;
        break;
      }
      rate *= .5;
    }
    if (!accepted)
      break;
    // Count active barrier responses as well as XPBD projections. Implicit
    // contact keeps layers apart without entering the projection counter.
    stats.contacts += int(contact.size());
    for (size_t i = 0; i < n; i++)
      nodes[i].p = trial[i];
    if (inner(step, step) * rate * rate < 1e-18)
      break;
  }
}
bool Sheet::contacts(const std::vector<V> &old) {
  bool changed = false;
  const double d = material.thickness;
  auto response = [&](std::array<int, 4> id, bool vf, V normalHint = V{}) {
    std::array<V, 4> a, b;
    for (int j = 0; j < 4; j++) {
      a[j] = old[id[j]];
      b[j] = nodes[id[j]].p;
    }
    normalHint=contactNormal(*this,id,vf,a);
    Hit hit = continuous(a, b, d, vf, normalHint);
    if(solver==Solver::Implicit && hit.hit){
      auto current=vf?pointTriangle(b[0],b[1],b[2],b[3]):edgeEdge(b[0],b[1],b[2],b[3]);
      // Implicit candidates have already passed the swept guard. Do not push
      // a safely separated endpoint back toward a stale impact plane.
      if(current.delta.norm()>=d)return;
      if(current.delta.dot(hit.normal)>=0){hit.feature=current;hit.normal=current.delta.unit(hit.normal);}
    }
    if (hit.hit) {
      V materialDelta{};
      for(int j=0;j<4;j++) materialDelta+=nodes[id[j]].uv*hit.feature.weights[j];
      // A thickness-sized neighbourhood belongs to the same local shell;
      // forcing its material-near samples apart would stretch tiny elements.
      if(materialDelta.norm()<2*d) return;
    }
    if (!hit.hit)
      return;
    if (hit.limited)
      stats.ccdLimited++;
    V delta{};
    double den = 0;
    for (int j = 0; j < 4; j++) {
      delta += nodes[id[j]].p * hit.feature.weights[j];
      den +=
          hit.feature.weights[j] * hit.feature.weights[j] / nodes[id[j]].mass;
    }
    double violation = d - delta.dot(hit.normal);
    if (violation <= 1e-10 || den < 1e-15)
      return;
    stats.contacts++;
    changed = true;
    V impulse = hit.normal * (violation / den);
    V before{};
    for (int j = 0; j < 4; j++)
      before += old[id[j]] * hit.feature.weights[j];
    V slip = (delta - before) - hit.normal * (delta - before).dot(hit.normal);
    if (slip.norm() > 1e-12)
      impulse -= slip.unit() *
                 (std::min(slip.norm(), material.friction * violation) / den);
    for (int j = 0; j < 4; j++)
      nodes[id[j]].p += impulse * (hit.feature.weights[j] / nodes[id[j]].mass);
  };
  if (selfContact && solver==Solver::XPBD) {
    std::vector<Box> boxes;
    boxes.reserve(nodes.size());
    for (size_t i = 0; i < nodes.size(); i++)
      boxes.push_back(swept(old[i], nodes[i].p, d));
    std::vector<Box> tri;
    tri.reserve(faces.size());
    for (const auto &f : faces)
      tri.push_back(unite(unite(boxes[f.v[0]], boxes[f.v[1]]), boxes[f.v[2]]));
    for (size_t i = 0; i < nodes.size(); i++)
      for (size_t j = 0; j < faces.size(); j++) {
        const auto &f = faces[j];
        if (f.v[0] == int(i) || f.v[1] == int(i) || f.v[2] == int(i) ||
            !overlaps(boxes[i], tri[j]))
          continue;
        response({int(i), f.v[0], f.v[1], f.v[2]}, true, (old[f.v[1]]-old[f.v[0]]).cross(old[f.v[2]]-old[f.v[0]]));
      }
    std::vector<Box> eb;
    eb.reserve(edges.size());
    for (const auto &e : edges)
      eb.push_back(unite(swept(old[e.a], nodes[e.a].p, d),
                         swept(old[e.b], nodes[e.b].p, d)));
    for (size_t i = 0; i < edges.size(); i++)
      for (size_t j = i + 1; j < edges.size(); j++) {
        const auto &a = edges[i];
        const auto &b = edges[j];
        if (a.a == b.a || a.a == b.b || a.b == b.a || a.b == b.b ||
            !overlaps(eb[i], eb[j]))
          continue;
        response({a.a, a.b, b.a, b.b}, false);
      }
  }
  for (size_t i = 0; i < nodes.size(); i++)
    if (nodes[i].p.z < d / 2 - 1e-12) {
      changed = true;
      double dz = d / 2 - nodes[i].p.z;
      V slip = nodes[i].p - old[i];
      slip.z = 0;
      if (slip.norm() > 0)
        nodes[i].p -=
            slip.unit() * std::min(slip.norm(), dz * material.friction);
      nodes[i].p.z = d / 2;
    }
  return changed;
}
void Sheet::plasticity(double dt) {
  for (auto &h : hinges) {
    auto a = dihedral(nodes[h.v[0]].p, nodes[h.v[1]].p, nodes[h.v[2]].p,
                      nodes[h.v[3]].p);
    if (!a.valid)
      continue;
    V mid = (nodes[h.v[0]].p + nodes[h.v[1]].p) * .5;
    size_t index=&h-hinges.data();
    bool pressing = formingPress && formingTargets.size()==nodes.size() && formingAngles.size()==hinges.size() && formingActive[index] && std::abs(formingAngles[index])>.005;
    for (const auto &g : handles)
      if (g.press) {
        V contact{};
        for (int i = 0; i < 3; i++)
          contact += nodes[g.v[i]].p * g.w[i];
        V diff = mid - contact;
        if (std::hypot(diff.x, diff.y) < .02 && std::abs(diff.z) < .02)
          pressing = true;
      }
    double elastic = wrap(a.value - h.rest),
           yield =
               material.yieldCurvature * h.dualHeight * (pressing ? .06 : 1);
    if (std::abs(elastic) > yield) {
      double change = std::copysign((std::abs(elastic) - yield) *
                                        (1 - std::exp(-material.creep * dt)),
                                    elastic);
      h.rest = wrap(h.rest + change);
      h.strength = clamp(h.strength + std::abs(change) / 3.141592653589793);
    }
  }
}
void Sheet::step(double dt) {
  require(dt > 0 && dt <= 1. / 30, "invalid physics time step");
  std::vector<V> old, predicted;
  old.reserve(nodes.size());
  predicted.reserve(nodes.size());
  for (auto &n : nodes) {
    old.push_back(n.p);
    if (gravity)
      n.v.z -= 9.81 * dt;
    n.p += n.v * dt;
    n.p.z = std::max(n.p.z, material.thickness / 2);
    predicted.push_back(n.p);
  }
  for (auto &e : edges)
    e.lambda = 0;
  for(auto &f:faces) f.lambda.fill(0);
  for (auto &h : hinges)
    h.lambda = 0;
  for (auto &h : handles) {
    V delta = h.target - h.current;
    double travel = .25 * dt;
    h.current += delta.norm() > travel ? delta.unit() * travel : delta;
    h.lambda = {};
  }
  if (solver == Solver::XPBD) {
    for (int k = 0; k < iterations; k++) {
      xpbd(dt);
      if (k == iterations - 1 || k % 4 == 3)
        contacts(old);
    }
  } else {
    // Start Newton from the feasible old sheet rather than an inertial forecast
    // that may already have tunneled through another layer.
    for(size_t i=0;i<nodes.size();i++)nodes[i].p=old[i];
    implicit(dt, predicted, old);
    contacts(old);
  }
  // Rebuild swept bounds between contact passes because an earlier correction
  // can introduce a new candidate. Finite passes remain an explicit limitation.
  for (int pass = 0; pass < 32; pass++)
    if (!contacts(old))
      break;
  if(solver==Solver::Implicit && selfContact) {
    std::vector<V> proposed;for(const auto&n:nodes)proposed.push_back(n.p);
    if(!feasible(*this,old,proposed)) {
      double rate=.5;std::vector<V> trial(nodes.size());bool accepted=false;
      for(int i=0;i<24;i++,rate*=.5){
        for(size_t j=0;j<nodes.size();j++)trial[j]=lerp(old[j],proposed[j],rate);
        if(feasible(*this,old,trial)){accepted=true;break;}
      }
      for(size_t j=0;j<nodes.size();j++)nodes[j].p=accepted?trial[j]:old[j];
    }
  }
  if(formingTargets.size()==nodes.size()&&formingActual.size()==hinges.size())for(size_t i=0;i<hinges.size();i++){
    const auto&h=hinges[i];auto a=dihedral(nodes[h.v[0]].p,nodes[h.v[1]].p,nodes[h.v[2]].p,nodes[h.v[3]].p);
    if(a.valid)formingActual[i]+=wrap(a.value-formingActual[i]);
  }
  plasticity(dt);
  for (size_t i = 0; i < nodes.size(); i++) {
    require(nodes[i].p.finite() && nodes[i].p.norm() < 10,
            "numerical divergence");
    nodes[i].v = (nodes[i].p - old[i]) * (std::exp(-2.5 * dt) / dt);
  }
  stats.time += dt;
  stats.steps++;
}
void Sheet::advance(double elapsed) {
  require(std::isfinite(elapsed) && elapsed >= 0 && elapsed <= 1,
          "invalid elapsed time");
  auto start = std::chrono::steady_clock::now();
  stats.contacts = 0;
  stats.ccdLimited = 0;
  accumulator += elapsed;
  int steps = 0;
  while (accumulator + 1e-12 >= fixedDt && steps < 16) {
    step(fixedDt);
    accumulator -= fixedDt;
    steps++;
  }
  // Backlog is retained and reported. The host pauses while backgrounded.
  stats.droppedTime = std::max(0., accumulator);
  measure();
  stats.stepMs = std::chrono::duration<double, std::milli>(
                     std::chrono::steady_clock::now() - start)
                     .count();
}
void Sheet::measure() {
  stats.mass = 0;
  stats.area = 0;
  stats.strainMax = 0;
  stats.minZ = std::numeric_limits<double>::infinity();
  stats.plastic = 0;
  stats.maxPlastic = 0;
  stats.maxPenetration = 0;
  for (const auto &n : nodes) {
    stats.mass += n.mass;
    stats.minZ = std::min(stats.minZ, n.p.z);
  }
  std::vector<double> strains;
  for (const auto &f : faces) {
    stats.area += f.area;
    V u = nodes[f.v[1]].uv - nodes[f.v[0]].uv,
      v = nodes[f.v[2]].uv - nodes[f.v[0]].uv,
      a = nodes[f.v[1]].p - nodes[f.v[0]].p,
      b = nodes[f.v[2]].p - nodes[f.v[0]].p;
    double det = u.x * v.y - u.y * v.x;
    V fx = (a * v.y - b * u.y) / det, fy = (b * u.x - a * v.x) / det;
    double A = fx.norm2(), B = fx.dot(fy), C = fy.norm2();
    double eigen = .5 * (A + C + std::sqrt((A - C) * (A - C) + 4 * B * B));
    double strain = std::sqrt(std::max(0., eigen)) - 1;
    strains.push_back(strain);
    stats.strainMax = std::max(stats.strainMax, strain);
  }
  std::sort(strains.begin(), strains.end());
  stats.strainP95 =
      strains.empty() ? 0 : strains[size_t(.95 * (strains.size() - 1))];
  for (const auto &h : hinges) {
    if (std::abs(h.rest) > .015)
      stats.plastic++;
    stats.maxPlastic = std::max(stats.maxPlastic, std::abs(h.rest));
  }
}
Audit Sheet::audit() const {
  Audit result;
  double d = material.thickness;
  for (size_t i = 0; i < nodes.size(); i++)
    for (const auto &f : faces) {
      if (f.v[0] == int(i) || f.v[1] == int(i) || f.v[2] == int(i))
        continue;
      Box box = unite(unite(swept(nodes[f.v[0]].p, nodes[f.v[0]].p, d),
                            swept(nodes[f.v[1]].p, nodes[f.v[1]].p, d)),
                      swept(nodes[f.v[2]].p, nodes[f.v[2]].p, d));
      if (overlaps(swept(nodes[i].p, nodes[i].p), box)) {
        auto q=pointTriangle(nodes[i].p,nodes[f.v[0]].p,nodes[f.v[1]].p,nodes[f.v[2]].p);
        V uv=nodes[i].uv*q.weights[0]+nodes[f.v[0]].uv*q.weights[1]+nodes[f.v[1]].uv*q.weights[2]+nodes[f.v[2]].uv*q.weights[3];
        if(uv.norm()>=2*d) result.penetration=std::max(result.penetration,d-q.delta.norm());
      }
    }
  for (size_t i = 0; i < edges.size(); i++)
    for (size_t j = i + 1; j < edges.size(); j++) {
      const auto &a = edges[i];
      const auto &b = edges[j];
      if (a.a == b.a || a.a == b.b || a.b == b.a || a.b == b.b)
        continue;
      Box aa = unite(swept(nodes[a.a].p, nodes[a.a].p, d),
                     swept(nodes[a.b].p, nodes[a.b].p, d)),
          bb = unite(swept(nodes[b.a].p, nodes[b.a].p, d),
                     swept(nodes[b.b].p, nodes[b.b].p, d));
      if (overlaps(aa, bb)) {
        auto q=edgeEdge(nodes[a.a].p,nodes[a.b].p,nodes[b.a].p,nodes[b.b].p);
        V uv=nodes[a.a].uv*q.weights[0]+nodes[a.b].uv*q.weights[1]+nodes[b.a].uv*q.weights[2]+nodes[b.b].uv*q.weights[3];
        if(uv.norm()>=2*d) result.penetration=std::max(result.penetration,d-q.delta.norm());
      }
    }
  for (const auto &e : edges)
    for (const auto &f : faces) {
      // An endpoint in the triangle plane cannot also cross its strict
      // interior along the same straight segment. Skip shared endpoints
      // before the nearly-coplanar determinant loses endpoint precision.
      if (e.a == f.v[0] || e.a == f.v[1] || e.a == f.v[2] ||
          e.b == f.v[0] || e.b == f.v[1] || e.b == f.v[2])
        continue;
      if (crosses(nodes[e.a].p, nodes[e.b].p, nodes[f.v[0]].p, nodes[f.v[1]].p,
                  nodes[f.v[2]].p))
        result.intersections++;
    }
  return result;
}
std::string Sheet::save() const {
  std::ostringstream out;
  out << std::setprecision(17) << "PAPER_LAB 2\n"
      << material.width << ' ' << material.height << ' ' << material.grammage
      << ' ' << material.thickness << ' ' << material.membrane << ' '
      << material.bending << ' ' << material.yieldCurvature << ' '
      << material.creep << ' ' << material.friction << '\n';
  out << nodes.size() << ' ' << faces.size() << ' ' << hinges.size() << '\n';
  for (const auto &n : nodes)
    out << n.uv.x << ' ' << n.uv.y << ' ' << n.p.x << ' ' << n.p.y << ' '
        << n.p.z << ' ' << n.v.x << ' ' << n.v.y << ' ' << n.v.z << '\n';
  for (const auto &f : faces)
    out << f.v[0] << ' ' << f.v[1] << ' ' << f.v[2] << '\n';
  for (const auto &h : hinges)
    out << h.v[0] << ' ' << h.v[1] << ' ' << h.rest << ' ' << h.strength
        << '\n';
  int pins = int(std::count_if(handles.begin(), handles.end(),
                               [](const Handle &h) { return h.pin; }));
  out << pins << '\n';
  for (const auto &h : handles)
    if (h.pin) {
      V uv = h.materialPoint;
      out << h.id << ' ' << uv.x << ' ' << uv.y << ' ' << h.current.x << ' '
          << h.current.y << ' ' << h.current.z << ' ' << h.target.x << ' '
          << h.target.y << ' ' << h.target.z << '\n';
    }
  out << int(solver == Solver::Implicit) << ' ' << fixedDt << ' ' << iterations
      << ' ' << nonlinearIterations << ' ' << cgIterations << ' ' << selfContact
      << ' ' << gravity << ' ' << stats.time << '\n';
  return out.str();
}
void Sheet::drivePose(const std::string &text, bool press) {
  require(text.size()<1024*1024,"forming targets too large");
  std::istringstream in(text);std::string magic;int version;size_t n;
  in>>magic>>version>>n;
  require(magic=="PAPER_TARGETS" && version==1 && n==nodes.size(),"invalid forming targets");
  std::vector<V> next(n);for(auto &p:next){in>>p.x>>p.y>>p.z;require(p.finite() && p.norm()<2,"invalid target position");}
  require(bool(in),"truncated forming targets");in>>std::ws;require(in.eof(),"trailing forming targets");
  std::vector<double> angles;
  for(const auto&h:hinges){auto a=dihedral(next[h.v[0]],next[h.v[1]],next[h.v[2]],next[h.v[3]]);require(a.valid,"degenerate forming target");angles.push_back(a.value);}
  const bool continuing=formingAngles.size()==angles.size()&&!formingTargets.empty();
  if(continuing)for(size_t i=0;i<angles.size();i++)angles[i]=formingAngles[i]+wrap(angles[i]-formingAngles[i]);
  else{formingActual.clear();for(const auto&h:hinges)formingActual.push_back(dihedral(nodes[h.v[0]].p,nodes[h.v[1]].p,nodes[h.v[2]].p,nodes[h.v[3]].p).value);}
  std::vector<bool> changed(angles.size(),false);bool newHinge=false;
  if(formingActive.size()!=angles.size()||formingTargets.empty())formingActive.assign(angles.size(),false);
  for(size_t i=0;i<angles.size();i++){
    const double previous=formingAngles.size()==angles.size()&&!formingTargets.empty()?formingAngles[i]:0;
    changed[i]=std::abs(wrap(angles[i]-previous))>1e-8;
    if(changed[i]&&!formingActive[i])newHinge=true;
  }
  // Release the previous folding tool as soon as a different hinge starts.
  // Old creases remain in the material's plastic state, but must be free to
  // open and slip while the next layer stack is folded.
  if(newHinge)formingActive=changed;
  formingTargets=std::move(next);formingAngles=std::move(angles);formingPress=press;solver=Solver::Implicit;
}
void Sheet::importMesh(const std::string &text, double elasticRecovery) {
  require(text.size()<2*1024*1024 && std::isfinite(elasticRecovery) && elasticRecovery>=0 && elasticRecovery<=1, "invalid material import");
  std::istringstream in(text);
  std::string magic; int version=0; size_t n=0,f=0;
  in>>magic>>version>>n>>f;
  require(magic=="PAPER_MESH" && (version==1 || version==2) && n>=3 && n<=1600 && f>0 && f<=3200,"invalid material mesh");
  Material m=material;m.width=.210;m.height=.297;
  Sheet next(2,m);next.nodes.assign(n,{});next.faces.assign(f,{});
  for(auto &v:next.nodes) {
    in>>v.uv.x>>v.uv.y>>v.p.x>>v.p.y>>v.p.z;
    if(version==2)in>>v.layer;
    require(std::isfinite(v.layer),"invalid layer ordering");
    require(v.uv.finite() && std::abs(v.uv.x)<=.105001 && std::abs(v.uv.y)<=.148501 && v.p.finite() && v.p.norm()<2,"invalid material point");
  }
  for(auto &face:next.faces) in>>face.v[0]>>face.v[1]>>face.v[2];
  require(bool(in),"truncated material mesh");in>>std::ws;require(in.eof(),"trailing material mesh data");
  next.rebuild();
  for(auto &h:next.hinges) {
    auto angle=dihedral(next.nodes[h.v[0]].p,next.nodes[h.v[1]].p,next.nodes[h.v[2]].p,next.nodes[h.v[3]].p);
    require(angle.valid,"degenerate material hinge");
    if(std::abs(angle.value)>.02) {
      h.rest=angle.value*(1-elasticRecovery);
      h.strength=std::min(1.,std::abs(angle.value)/3.141592653589793);
    }
  }
  next.solver=Solver::Implicit;next.fixedDt=1./240;next.gravity=false;
  next.nonlinearIterations=5;next.cgIterations=100;
  next.measure();
  *this=std::move(next);
}
void Sheet::load(const std::string &text) {
  require(text.size() < 4 * 1024 * 1024, "snapshot too large");
  std::istringstream in(text);
  std::string magic;
  int version = 0;
  in >> magic >> version;
  require(magic == "PAPER_LAB" && version == 2, "unsupported snapshot");
  Sheet next(2);
  Material &m = next.material;
  in >> m.width >> m.height >> m.grammage >> m.thickness >> m.membrane >>
      m.bending >> m.yieldCurvature >> m.creep >> m.friction;
  size_t n = 0, f = 0, h = 0;
  in >> n >> f >> h;
  require(n >= 3 && n <= 10000 && f > 0 && f <= 20000 && h <= 30000,
          "invalid snapshot capacity");
  next.nodes.assign(n, {});
  next.faces.assign(f, {});
  for (auto &v : next.nodes) {
    in >> v.uv.x >> v.uv.y >> v.p.x >> v.p.y >> v.p.z >> v.v.x >> v.v.y >>
        v.v.z;
    require(v.p.finite() && v.p.norm() < 2 && v.v.finite() && v.v.norm() < 50 &&
                v.uv.finite() && v.uv.norm() < 2,
            "invalid snapshot coordinates");
  }
  for (auto &t : next.faces)
    in >> t.v[0] >> t.v[1] >> t.v[2];
  require(bool(in), "truncated snapshot");
  next.rebuild();
  require(next.hinges.size() == h, "invalid hinge count");
  for (auto &hinge : next.hinges) {
    int a = 0, b = 0;
    in >> a >> b >> hinge.rest >> hinge.strength;
    require(a == hinge.v[0] && b == hinge.v[1] && std::isfinite(hinge.rest) &&
                std::abs(hinge.rest) <= 3.141593 &&
                std::isfinite(hinge.strength) && hinge.strength >= 0 &&
                hinge.strength <= 1,
            "invalid plastic state");
  }
  int pins = 0;
  in >> pins;
  require(pins >= 0 && pins <= 12, "invalid pin count");
  for (int i = 0; i < pins; i++) {
    int id = 0;
    double u = 0, v = 0;
    V p, target;
    in >> id >> u >> v >> p.x >> p.y >> p.z >> target.x >> target.y >> target.z;
    require(p.finite() && p.norm() < 2, "invalid pin position");
    next.setHandle(next.anchor(u, v, id, target, true));
    next.handles.back().current = p;
  }
  int solverValue = 0, contact = 0, grav = 0;
  in >> solverValue >> next.fixedDt >> next.iterations >>
      next.nonlinearIterations >> next.cgIterations >> contact >> grav >>
      next.stats.time;
  require(bool(in) && solverValue >= 0 && solverValue <= 1 &&
              next.fixedDt >= 1. / 1000 && next.fixedDt <= 1. / 30 &&
              next.iterations >= 1 && next.iterations <= 100 &&
              next.nonlinearIterations >= 1 && next.nonlinearIterations <= 20 &&
              next.cgIterations >= 1 && next.cgIterations <= 500 &&
              (contact == 0 || contact == 1) && (grav == 0 || grav == 1) &&
              std::isfinite(next.stats.time) && next.stats.time >= 0,
          "invalid solver state");
  in >> std::ws;
  require(in.eof(), "trailing snapshot data");
  next.solver = solverValue ? Solver::Implicit : Solver::XPBD;
  next.selfContact = contact;
  next.gravity = grav;
  next.measure();
  *this = std::move(next);
}
} // namespace paper
