#pragma once
#include <algorithm>
#include <array>
#include <cmath>
#include <cstdint>
#include <limits>
namespace paper {
struct V {
  double x = 0, y = 0, z = 0;
  V operator+(V b) const { return {x + b.x, y + b.y, z + b.z}; }
  V operator-(V b) const { return {x - b.x, y - b.y, z - b.z}; }
  V operator-() const { return {-x, -y, -z}; }
  V operator*(double s) const { return {x * s, y * s, z * s}; }
  V operator/(double s) const { return *this * (1 / s); }
  V &operator+=(V b) {
    x += b.x;
    y += b.y;
    z += b.z;
    return *this;
  }
  V &operator-=(V b) { return *this += -b; }
  double dot(V b) const { return x * b.x + y * b.y + z * b.z; }
  V cross(V b) const {
    return {y * b.z - z * b.y, z * b.x - x * b.z, x * b.y - y * b.x};
  }
  double norm2() const { return dot(*this); }
  double norm() const { return std::sqrt(norm2()); }
  V unit(V fallback = {0, 0, 1}) const {
    double l = norm();
    return l > 1e-14 ? *this / l : fallback;
  }
  bool finite() const {
    return std::isfinite(x) && std::isfinite(y) && std::isfinite(z);
  }
};
inline V lerp(V a, V b, double t) { return a * (1 - t) + b * t; }
inline double clamp(double v, double a = 0, double b = 1) {
  return std::max(a, std::min(b, v));
}
inline double wrap(double a) { return std::atan2(std::sin(a), std::cos(a)); }
struct Closest {
  V delta;
  std::array<double, 4> weights{};
};
// Closest material features, including boundaries and degenerate input.
inline Closest pointTriangle(V p, V a, V b, V c) {
  const V ab = b - a, ac = c - a, ap = p - a;
  const double d1 = ab.dot(ap), d2 = ac.dot(ap);
  if (d1 <= 0 && d2 <= 0)
    return {p - a, {1, -1, 0, 0}};
  const V bp = p - b;
  const double d3 = ab.dot(bp), d4 = ac.dot(bp);
  if (d3 >= 0 && d4 <= d3)
    return {p - b, {1, 0, -1, 0}};
  const double vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) {
    double v = d1 / (d1 - d3);
    return {p - (a + ab * v), {1, -(1 - v), -v, 0}};
  }
  const V cp = p - c;
  const double d5 = ab.dot(cp), d6 = ac.dot(cp);
  if (d6 >= 0 && d5 <= d6)
    return {p - c, {1, 0, 0, -1}};
  const double vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) {
    double w = d2 / (d2 - d6);
    return {p - (a + ac * w), {1, -(1 - w), 0, -w}};
  }
  const double va = d3 * d6 - d5 * d4;
  if (va <= 0 && (d4 - d3) >= 0 && (d5 - d6) >= 0) {
    double w = (d4 - d3) / ((d4 - d3) + (d5 - d6));
    return {p - lerp(b, c, w), {1, 0, -(1 - w), -w}};
  }
  const double sum = va + vb + vc;
  if (std::abs(sum) < 1e-25) {
    Closest result{p - a, {1, -1, 0, 0}};
    const V pts[] = {a, b, c};
    for (int i = 0; i < 3; i++) {
      int j = (i + 1) % 3;
      V e = pts[j] - pts[i];
      double t = clamp((p - pts[i]).dot(e) / std::max(e.norm2(), 1e-30));
      V delta = p - lerp(pts[i], pts[j], t);
      if (delta.norm2() < result.delta.norm2()) {
        result.delta = delta;
        result.weights = {1, 0, 0, 0};
        result.weights[i + 1] = -(1 - t);
        result.weights[j + 1] = -t;
      }
    }
    return result;
  }
  const double v = vb / sum, w = vc / sum;
  return {p - (a + ab * v + ac * w), {1, -(1 - v - w), -v, -w}};
}
inline Closest edgeEdge(V a, V b, V c, V d) {
  V u = b - a, v = d - c, w = a - c;
  double A = u.norm2(), B = u.dot(v), C = v.norm2(), D = u.dot(w), E = v.dot(w),
         s = 0, t = 0;
  if (A < 1e-25 && C < 1e-25)
    return {a - c, {1, 0, -1, 0}};
  if (A < 1e-25)
    t = clamp(E / C);
  else if (C < 1e-25)
    s = clamp(-D / A);
  else {
    double den = A * C - B * B;
    s = den > 1e-25 ? clamp((B * E - C * D) / den) : 0;
    t = (B * s + E) / C;
    if (t < 0) {
      t = 0;
      s = clamp(-D / A);
    } else if (t > 1) {
      t = 1;
      s = clamp((B - D) / A);
    }
  }
  return {lerp(a, b, s) - lerp(c, d, t), {1 - s, s, -(1 - t), -t}};
}
struct Box {
  V lo, hi;
};
inline Box swept(V a, V b, double pad = 0) {
  return {{std::min(a.x, b.x) - pad, std::min(a.y, b.y) - pad,
           std::min(a.z, b.z) - pad},
          {std::max(a.x, b.x) + pad, std::max(a.y, b.y) + pad,
           std::max(a.z, b.z) + pad}};
}
inline Box unite(Box a, Box b) {
  return {{std::min(a.lo.x, b.lo.x), std::min(a.lo.y, b.lo.y),
           std::min(a.lo.z, b.lo.z)},
          {std::max(a.hi.x, b.hi.x), std::max(a.hi.y, b.hi.y),
           std::max(a.hi.z, b.hi.z)}};
}
inline bool overlaps(Box a, Box b) {
  return a.lo.x <= b.hi.x && b.lo.x <= a.hi.x && a.lo.y <= b.hi.y &&
         b.lo.y <= a.hi.y && a.lo.z <= b.hi.z && b.lo.z <= a.hi.z;
}
struct Hit {
  bool hit = false, limited = false;
  double time = 1;
  Closest feature;
  V normal;
};
// Conservative advancement of linearly moving features. The supplied speed is
// an upper bound on distance change. Iteration exhaustion is fail-closed.
inline Hit continuous(const std::array<V, 4> &old, const std::array<V, 4> &now,
                      double thickness, bool vf) {
  double speed =
      vf ? (now[0] - old[0]).norm() +
               std::max({(now[1] - old[1]).norm(), (now[2] - old[2]).norm(),
                         (now[3] - old[3]).norm()})
         : std::max((now[0] - old[0]).norm(), (now[1] - old[1]).norm()) +
               std::max((now[2] - old[2]).norm(), (now[3] - old[3]).norm());
  auto at = [&](double t) {
    std::array<V, 4> p;
    for (int i = 0; i < 4; i++)
      p[i] = lerp(old[i], now[i], t);
    return vf ? pointTriangle(p[0], p[1], p[2], p[3])
              : edgeEdge(p[0], p[1], p[2], p[3]);
  };
  double t = 0;
  Closest q = at(0);
  V n = q.delta.unit();
  for (int i = 0; i < 64; i++) {
    q = at(t);
    double gap = q.delta.norm() - thickness;
    if (gap <= std::max(1e-9, thickness * 1e-5))
      return {true, false, t, q, q.delta.unit(n)};
    if (speed < 1e-15)
      return {};
    double step = .9 * gap / speed;
    if (t + step > 1)
      return {};
    t += step;
  }
  return {true, true, t, q, q.delta.unit(n)};
}
// Strict interior segment/triangle crossing for independent end-state audits.
inline bool crosses(V a, V b, V p, V q, V r) {
  V dir = b - a, e1 = q - p, e2 = r - p, h = dir.cross(e2);
  double det = e1.dot(h);
  if (std::abs(det) < 1e-16)
    return false;
  double inv = 1 / det;
  V s = a - p;
  double u = s.dot(h) * inv;
  if (u <= 1e-7 || u >= 1 - 1e-7)
    return false;
  V cross = s.cross(e1);
  double v = dir.dot(cross) * inv, t = e2.dot(cross) * inv;
  return v > 1e-7 && u + v < 1 - 1e-7 && t > 1e-7 && t < 1 - 1e-7;
}
struct Angle {
  double value = 0;
  std::array<V, 4> gradient{};
  bool valid = false;
};
// a,b are the shared directed edge; c,d are opposite vertices. Adjacent faces
// have consistent winding [a,b,c], [b,a,d]. Signed angle is zero when flat.
inline Angle dihedral(V a, V b, V c, V d) {
  V e = b - a, n1 = e.cross(c - a), n2 = (-e).cross(d - b);
  double l = e.norm(), a1 = n1.norm(), a2 = n2.norm();
  if (l < 1e-10 || a1 < 1e-14 || a2 < 1e-14)
    return {};
  n1 = n1 / a1;
  n2 = n2 / a2;
  double angle =
      std::atan2((e / l).dot(n1.cross(n2)), clamp(n1.dot(n2), -1, 1));
  V gc = n1 * (-l / a1), gd = n2 * (-l / a2);
  V ga = gc * (-(b - c).dot(e) / (l * l)) + gd * (-(b - d).dot(e) / (l * l));
  V gb = -ga - gc - gd;
  return {angle, {ga, gb, gc, gd}, true};
}
} // namespace paper
