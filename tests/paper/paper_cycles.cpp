#include "Sheet.hpp"
#include <chrono>
#include <iostream>
using namespace paper;
int main() {
  for (int cells : {5, 8}) {
    Material m;
    m.width = .210;
    m.height = .297;
    Sheet s(cells, m);
    s.solver = Solver::Implicit;
    s.fixedDt = 1. / 240;
    double peak = 0, p95 = 0, maxPen = 0;
    int crossings = 0;
    long contacts = 0, limits = 0;
    auto start = std::chrono::steady_clock::now();
    for (int cycle = 0; cycle < 20; cycle++) {
      s.handles.clear();
      double a = (cycle < 10 ? 37. : 71.) * 3.141592653589793 / 180;
      V n{std::cos(a), std::sin(a), 0}, t{-n.y, n.x, 0}, center = n * .009;
      for (int j = 0; j < 2; j++) {
        V fixed = center - n * .045 + t * (j == 0 ? -.045 : .045),
          moving = center + n * .045 + t * (j == 0 ? -.045 : .045);
        auto pin = s.anchor(fixed.x, fixed.y, 10 + j,
                            {fixed.x, fixed.y, m.thickness / 2}, true);
        s.setHandle(pin);
        s.setHandle(s.anchor(moving.x, moving.y, 20 + j,
                             {moving.x, moving.y, m.thickness / 2}));
      }
      for (int i = 0; i < 240; i++) {
        double angle = 3.137 * (i < 120 ? i / 119. : 1 - (i - 120) / 119.);
        for (int j = 0; j < 2; j++) {
          V p = center + n * (.045 * std::cos(angle)) +
                t * (j == 0 ? -.045 : .045);
          p.z = m.thickness / 2 + .045 * std::sin(angle);
          s.moveHandle(20 + j, p);
        }
        if (i >= 80 && i < 120) {
          V uv = center + t * (-.045 + .09 * (i - 80) / 39.);
          auto brush = s.anchor(uv.x, uv.y, 30, {uv.x, uv.y, m.thickness / 2},
                                false, true);
          brush.target = {brush.current.x, brush.current.y, m.thickness / 2};
          s.setHandle(brush);
        } else
          s.release(30);
        s.advance(1. / 120);
        peak = std::max(peak, s.stats.strainMax);
        p95 = std::max(p95, s.stats.strainP95);
        contacts += s.stats.contacts;
        limits += s.stats.ccdLimited;
      }
      s.releaseTransient();
      auto audit = s.audit();
      maxPen = std::max(maxPen, audit.penetration);
      crossings += audit.intersections;
      std::string state = s.save();
      Sheet restored(2);
      restored.load(state);
      if (restored.save() != state) {
        std::cerr << "cycle snapshot mismatch\n";
        return 1;
      }
    }
    double strength = 0;
    for (const auto &h : s.hinges)
      strength += h.strength;
    std::cout << "{\"case\":\"E04-repeat-cross-creases\",\"cells\":" << cells
              << ",\"nodes\":" << s.nodes.size()
              << ",\"cycles\":20,\"simSeconds\":" << s.stats.time
              << ",\"wallMs\":"
              << std::chrono::duration<double, std::milli>(
                     std::chrono::steady_clock::now() - start)
                     .count()
              << ",\"peakPrincipalStrain\":" << peak << ",\"worstP95\":" << p95
              << ",\"plasticHinges\":" << s.stats.plastic
              << ",\"strengthSum\":" << strength
              << ",\"intersectionsAtCycleEnds\":" << crossings
              << ",\"thicknessPenetrationM\":" << maxPen
              << ",\"contactResponses\":" << contacts
              << ",\"ccdIterationLimits\":" << limits
              << ",\"snapshotRoundTrips\":20}\n";
  }
  return 0;
}
