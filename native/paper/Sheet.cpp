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
void require(bool condition, const char *message) {
  if (!condition)
    throw std::runtime_error(message);
}
struct Equation {
  std::array<int, 4> id{};
  std::array<V, 4> g{};
  int count = 0;
  double c = 0, k = 0;
};
std::vector<Equation> equations(const Sheet &s) {
  std::vector<Equation> all;
  all.reserve(s.edges.size() + s.hinges.size() + s.handles.size() * 3);
  for (const auto &e : s.edges) {
    V d = s.nodes[e.a].p - s.nodes[e.b].p;
    double l = d.norm();
    if (l > 1e-12) {
      V g = d / l;
      all.push_back(
          {{e.a, e.b, 0, 0}, {g, -g, V{}, V{}}, 2, l - e.length, e.stiffness});
    }
  }
  for (const auto &h : s.hinges) {
    auto a = dihedral(s.nodes[h.v[0]].p, s.nodes[h.v[1]].p, s.nodes[h.v[2]].p,
                      s.nodes[h.v[3]].p);
    if (a.valid)
      all.push_back({h.v, a.gradient, 4, wrap(a.value - h.rest),
                     h.stiffness * (1 - .65 * h.strength)});
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
  for (auto &e : edges) {
    V d = nodes[e.a].p - nodes[e.b].p;
    double l = d.norm();
    if (l < 1e-12)
      continue;
    V g = d / l;
    double wa = 1 / nodes[e.a].mass, wb = 1 / nodes[e.b].mass,
           alpha = 1 / (e.stiffness * h2),
           dl = (-(l - e.length) - alpha * e.lambda) / (wa + wb + alpha);
    e.lambda += dl;
    nodes[e.a].p += g * (wa * dl);
    nodes[e.b].p -= g * (wb * dl);
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
  for (const auto &e : edges) {
    double c = (x[e.a] - x[e.b]).norm() - e.length;
    E += .5 * e.stiffness * c * c;
  }
  for (const auto &h : hinges) {
    auto a = dihedral(x[h.v[0]], x[h.v[1]], x[h.v[2]], x[h.v[3]]);
    if (a.valid) {
      double c = wrap(a.value - h.rest);
      E += .5 * h.stiffness * (1 - .65 * h.strength) * c * c;
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
  for (const auto &p : x)
    if (p.z < material.thickness / 2) {
      double gap = p.z - material.thickness / 2;
      E += .5 * 1e6 * gap * gap;
    }
  return E;
}
void Sheet::implicit(double dt, const std::vector<V> &predicted) {
  // Damped Gauss-Newton, matrix-free PCG. Same membrane and signed bending
  // energies as XPBD; contact uses the same split projection in both
  // candidates.
  const size_t n = nodes.size();
  const double h2 = dt * dt;
  auto energy = [&](const std::vector<V> &x) {
    double E = potential(x);
    for (size_t i = 0; i < n; i++)
      E += .5 * nodes[i].mass / h2 * (x[i] - predicted[i]).norm2();
    return E;
  };
  for (int outer = 0; outer < nonlinearIterations; outer++) {
    auto eq = equations(*this);
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
      if (energy(trial) <= e0 + 1e-14) {
        accepted = true;
        break;
      }
      rate *= .5;
    }
    if (!accepted)
      break;
    for (size_t i = 0; i < n; i++)
      nodes[i].p = trial[i];
    if (inner(step, step) * rate * rate < 1e-18)
      break;
  }
}
bool Sheet::contacts(const std::vector<V> &old) {
  bool changed = false;
  const double d = material.thickness;
  auto response = [&](std::array<int, 4> id, bool vf) {
    std::array<V, 4> a, b;
    for (int j = 0; j < 4; j++) {
      a[j] = old[id[j]];
      b[j] = nodes[id[j]].p;
    }
    Hit hit = continuous(a, b, d, vf);
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
  if (selfContact) {
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
        response({int(i), f.v[0], f.v[1], f.v[2]}, true);
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
    bool pressing = false;
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
    implicit(dt, predicted);
    contacts(old);
  }
  // Rebuild swept bounds between contact passes because an earlier correction
  // can introduce a new candidate. Finite passes remain an explicit limitation.
  for (int pass = 0; pass < 32; pass++)
    if (!contacts(old))
      break;
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
        double distance = pointTriangle(nodes[i].p, nodes[f.v[0]].p,
                                        nodes[f.v[1]].p, nodes[f.v[2]].p)
                              .delta.norm();
        result.penetration = std::max(result.penetration, d - distance);
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
      if (overlaps(aa, bb))
        result.penetration = std::max(
            result.penetration,
            d - edgeEdge(nodes[a.a].p, nodes[a.b].p, nodes[b.a].p, nodes[b.b].p)
                    .delta.norm());
    }
  for (const auto &e : edges)
    for (const auto &f : faces) {
      if ((e.a == f.v[0] || e.a == f.v[1] || e.a == f.v[2]) &&
          (e.b == f.v[0] || e.b == f.v[1] || e.b == f.v[2]))
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
