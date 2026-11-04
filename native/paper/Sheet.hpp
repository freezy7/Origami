#pragma once
#include "Geometry.hpp"
#include <string>
#include <vector>
namespace paper {
struct Material {
  double width = .15, height = .15, grammage = .08, thickness = .00015,
         membrane = 80000, bending = .00016, yieldCurvature = 65, creep = 18,
         friction = .35;
  static Material card() {
    Material m;
    m.grammage = .16;
    m.thickness = .00028;
    m.bending = .0007;
    m.yieldCurvature = 48;
    return m;
  }
};
struct Node {
  V uv, p, v;
  double mass = 0;
};
struct Triangle {
  std::array<int, 3> v;
  double area = 0;
};
struct Edge {
  int a, b;
  double length = 0, stiffness = 0, lambda = 0;
};
struct Hinge {
  std::array<int, 4> v;
  double rest = 0, strength = 0, stiffness = 0, dualHeight = 0, lambda = 0;
};
struct Handle {
  int id = 0;
  std::array<int, 3> v{};
  std::array<double, 3> w{};
  V target, current, lambda;
  bool pin = false, press = false;
  V materialPoint;
};
struct Statistics {
  double time = 0, stepMs = 0, strainMax = 0, strainP95 = 0, mass = 0, area = 0,
         maxPlastic = 0, minZ = 0, maxPenetration = 0, droppedTime = 0;
  int plastic = 0, contacts = 0, ccdLimited = 0, steps = 0;
};
struct Audit {
  int intersections = 0;
  double penetration = 0;
};
enum class Solver { XPBD, Implicit };
class Sheet {
public:
  Material material;
  Solver solver = Solver::XPBD;
  std::vector<Node> nodes;
  std::vector<Triangle> faces;
  std::vector<Edge> edges;
  std::vector<Hinge> hinges;
  std::vector<Handle> handles;
  Statistics stats;
  double fixedDt = 1. / 120;
  int iterations = 12;
  int nonlinearIterations = 5, cgIterations = 80;
  bool selfContact = true, gravity = true;
  double accumulator = 0;
  explicit Sheet(int cells = 10, Material m = Material());
  Handle anchor(double u, double v, int id, V target, bool pin = false,
                bool press = false) const;
  void setHandle(Handle handle);
  void moveHandle(int id, V target);
  void release(int id);
  void releaseTransient();
  void advance(double elapsed);
  void step(double h);
  std::string save() const;
  void load(const std::string &text);
  Audit audit() const;
  void measure();
  double potential(const std::vector<V> &x) const;

private:
  void rebuild();
  void xpbd(double h);
  void implicit(double h, const std::vector<V> &predicted);
  void solveHandles(double h);
  bool contacts(const std::vector<V> &old);
  void plasticity(double h);
};
} // namespace paper
