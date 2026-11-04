#include "Sheet.hpp"
#include <chrono>
#include <fstream>
#include <iostream>
#include <string>
#include <vector>
using namespace paper;
using Clock = std::chrono::steady_clock;
static Material a4() {
  Material m;
  m.width = .210;
  m.height = .297;
  return m;
}
static void dump(Sheet &s, const std::string &path) {
  std::ofstream out(path);
  out << "{\"positions\":[";
  bool first = true;
  for (auto &n : s.nodes) {
    for (double x : {n.p.x, n.p.y, n.p.z}) {
      if (!first)
        out << ',';
      first = false;
      out << x;
    }
  }
  out << "],\"uv\":[";
  first = true;
  for (auto &n : s.nodes)
    for (double x : {n.uv.x, n.uv.y}) {
      if (!first)
        out << ',';
      first = false;
      out << x;
    }
  out << "],\"triangles\":[";
  first = true;
  for (auto &f : s.faces)
    for (int v : f.v) {
      if (!first)
        out << ',';
      first = false;
      out << v;
    }
  out << "],\"plastic\":[";
  first = true;
  for (auto &h : s.hinges) {
    if (!first)
      out << ',';
    first = false;
    out << h.rest;
  }
  out << "]}";
  std::ofstream save(path + ".paper");
  save << s.save();
}
static void result(const std::string &name, Sheet &s, double ms, double peak,
                   double p95, const std::string &note = "") {
  std::cout << "{\"case\":\"" << name << "\",\"solver\":\""
            << (s.solver == Solver::Implicit ? "implicit-gn" : "xpbd")
            << "\",\"nodes\":" << s.nodes.size()
            << ",\"triangles\":" << s.faces.size()
            << ",\"fixedDt\":" << s.fixedDt
            << ",\"nonlinearIterations\":" << s.nonlinearIterations
            << ",\"cgIterations\":" << s.cgIterations
            << ",\"steps\":" << s.stats.steps
            << ",\"simSeconds\":" << s.stats.time << ",\"wallMs\":" << ms
            << ",\"peakPrincipalStrain\":" << peak << ",\"worstP95\":" << p95
            << ",\"finalPeak\":" << s.stats.strainMax
            << ",\"finalP95\":" << s.stats.strainP95
            << ",\"plasticHinges\":" << s.stats.plastic
            << ",\"maxPlasticRadians\":" << s.stats.maxPlastic
            << ",\"massKg\":" << s.stats.mass
            << ",\"restAreaM2\":" << s.stats.area << ",\"note\":\"" << note
            << "\"}\n";
}
int main(int argc, char **argv) {
  try {
    std::string folder = argc > 1 ? argv[1] : ".cache";
    for (auto solver : {Solver::XPBD, Solver::Implicit})
      for (int cells : {5, 8}) {
        Sheet s(cells, a4());
        s.solver = solver;
        s.nonlinearIterations = argc > 2 ? std::stoi(argv[2]) : 5;
        s.cgIterations = argc > 3 ? std::stoi(argv[3]) : 80;
        s.iterations = 12;
        s.fixedDt = 1. / 120;
        s.setHandle(s.anchor(-.075, -.105, 1,
                             {-.075, -.105, s.material.thickness / 2}, true));
        s.setHandle(s.anchor(.075, .105, 2, {.075, .105, .03}));
        double peak = 0, p95 = 0;
        auto start = Clock::now();
        for (int i = 0; i < 120; i++) {
          s.advance(1. / 120);
          peak = std::max(peak, s.stats.strainMax);
          p95 = std::max(p95, s.stats.strainP95);
        }
        result("E01-lift", s,
               std::chrono::duration<double, std::milli>(Clock::now() - start)
                   .count(),
               peak, p95,
               "shared material and continuous grip targets; finite solver "
               "budgets");
      }
    for (double dt : {1. / 60, 1. / 240}) {
      Sheet s(8, a4());
      s.solver = Solver::Implicit;
      s.fixedDt = dt;
      s.setHandle(s.anchor(-.075, -.105, 1,
                           {-.075, -.105, s.material.thickness / 2}, true));
      s.setHandle(s.anchor(.075, .105, 2, {.075, .105, .03}));
      double peak = 0, p95 = 0;
      auto start = Clock::now();
      for (int i = 0; i < 120; i++) {
        s.advance(1. / 120);
        peak = std::max(peak, s.stats.strainMax);
        p95 = std::max(p95, s.stats.strainP95);
      }
      result("E01-time-step", s,
             std::chrono::duration<double, std::milli>(Clock::now() - start)
                 .count(),
             peak, p95);
    }
    for (auto specification :
         std::array<std::array<double, 3>, 5>{{{17, 0, .045},
                                               {37, 0, .045},
                                               {71, 0, .045},
                                               {37, .23, .025},
                                               {37, .47, .045}}}) {
      const double degrees = specification[0], position = specification[1],
                   radius = specification[2];
      Sheet s(8, a4());
      s.solver = Solver::Implicit;
      s.nonlinearIterations = argc > 2 ? std::stoi(argv[2]) : 5;
      s.cgIterations = argc > 3 ? std::stoi(argv[3]) : 80;
      s.fixedDt = 1. / 240;
      double radians = degrees * 3.141592653589793 / 180;
      V normal{std::cos(radians), std::sin(radians), 0},
          tangent{-normal.y, normal.x, 0},
          center = position > 0 ? V{s.material.width * (position - .5), 0, 0}
                                : normal * .009;
      std::vector<V> moving;
      for (int j = 0; j < 2; j++) {
        double sign = j == 0 ? -1 : 1;
        V fixed = center - normal * radius + tangent * (radius * sign),
          mobile = center + normal * radius + tangent * (radius * sign);
        fixed.z = mobile.z = s.material.thickness / 2;
        s.setHandle(s.anchor(fixed.x, fixed.y, 10 + j, fixed, true));
        s.setHandle(s.anchor(mobile.x, mobile.y, 20 + j, mobile));
        moving.push_back(mobile);
      }
      double peak = 0, p95 = 0;
      long contacts = 0, limits = 0;
      auto start = Clock::now();
      // An external gripper trajectory, not a rotation of paper vertices or a
      // prescribed crease in the kernel. Position and direction vary per
      // fixture.
      for (int i = 0; i < 300; i++) {
        double angle = 3.137 * std::min(1., i / 240.);
        for (int j = 0; j < 2; j++) {
          V target = center + normal * (radius * std::cos(angle)) +
                     tangent * (j == 0 ? -radius : radius);
          target.z = s.material.thickness / 2 + radius * std::sin(angle);
          s.moveHandle(20 + j, target);
        }
        if (i >= 160) {
          V uv = center + tangent * (-radius + 2 * radius * (i - 160) / 139.);
          auto brush =
              s.anchor(uv.x, uv.y, 30, {uv.x, uv.y, s.material.thickness / 2},
                       false, true);
          brush.target = {brush.current.x, brush.current.y,
                          s.material.thickness / 2};
          s.setHandle(brush);
        }
        s.advance(1. / 120);
        peak = std::max(peak, s.stats.strainMax);
        p95 = std::max(p95, s.stats.strainP95);
        contacts += s.stats.contacts;
        limits += s.stats.ccdLimited;
      }
      std::string suffix =
          std::to_string(int(degrees)) +
          (position > 0
               ? "-p" + std::to_string(int(std::lround(position * 100)))
               : "");
      dump(s, folder + "/fold-" + suffix + ".json");
      auto audit = s.audit();
      std::cout << "{\"case\":\"E05-contact-audit-" << suffix
                << "\",\"intersections\":" << audit.intersections
                << ",\"thicknessPenetrationM\":" << audit.penetration << "}\n";
      s.releaseTransient();
      for (int i = 0; i < 120; i++)
        s.advance(1. / 120);
      dump(s, folder + "/released-" + suffix + ".json");
      result("E02-E03-press-" + suffix, s,
             std::chrono::duration<double, std::milli>(Clock::now() - start)
                 .count(),
             peak, p95,
             "uncalibrated; plasticity and mesh-direction bias require "
             "evaluation");
      std::cout << "{\"case\":\"contact-count-" << suffix
                << "\",\"responses\":" << contacts
                << ",\"ccdIterationLimits\":" << limits << "}\n";
      std::string state = s.save();
      Sheet restored(2);
      restored.load(state);
      std::cout << "{\"case\":\"E11-restore-" << suffix
                << "\",\"exactSnapshot\":"
                << (restored.save() == state ? "true" : "false") << "}\n";
      for (int j = 0; j < 2; j++) {
        const V uv = moving[j];
        s.setHandle(s.anchor(uv.x, uv.y, 40 + j,
                             {uv.x, uv.y, s.material.thickness / 2}));
      }
      for (int i = 0; i < 240; i++)
        s.advance(1. / 120);
      s.releaseTransient();
      s.measure();
      double rms = 0;
      for (const auto &n : s.nodes)
        rms += (n.p.z - s.material.thickness / 2) *
               (n.p.z - s.material.thickness / 2);
      rms = std::sqrt(rms / s.nodes.size());
      dump(s, folder + "/unfolded-" + suffix + ".json");
      std::cout << "{\"case\":\"E02-unfold-" << suffix
                << "\",\"rmsHeightM\":" << rms
                << ",\"plasticHinges\":" << s.stats.plastic
                << ",\"maxPlasticRadians\":" << s.stats.maxPlastic << "}\n";
    }
    // A short cantilever fixture avoids free rigid rotation about a line of
    // pins, table impacts and preparation plasticity. It is generated directly
    // for numerical testing; there is no user-facing cutting implementation.
    for (double factor : {.5, 2.}) {
      Material m = a4();
      m.width = .06;
      m.height = .10;
      m.bending *= factor;
      Sheet s(8, m);
      s.solver = Solver::Implicit;
      for (auto &n : s.nodes)
        n.p.z = .12;
      int id = 50;
      for (double x : {-.025, -.015})
        for (double y : {-.045, 0., .045})
          s.setHandle(s.anchor(x, y, id++, {x, y, .12}, true));
      for (int i = 0; i < 240; i++)
        s.advance(1. / 120);
      double freeHeight = 0;
      int count = 0;
      for (const auto &n : s.nodes)
        if (n.uv.x > .025) {
          freeHeight += n.p.z;
          count++;
        }
      std::cout << "{\"case\":\"E06-parameter-sensitivity\",\"fixture\":"
                   "\"60x100mm-clamped-strip\",\"bendingFactor\":"
                << factor << ",\"freeEdgeHeightM\":" << freeHeight / count
                << ",\"plasticHinges\":" << s.stats.plastic
                << ",\"physicalMaterialCalibrated\":false}\n";
    }
    // Near-rest no load must not create permanent creases.
    {
      Sheet s(8, a4());
      s.solver = Solver::Implicit;
      auto start = Clock::now();
      for (int i = 0; i < 120; i++)
        s.advance(1. / 120);
      result("E02-flat-control", s,
             std::chrono::duration<double, std::milli>(Clock::now() - start)
                 .count(),
             s.stats.strainMax, s.stats.strainP95);
    }
    return 0;
  } catch (const std::exception &e) {
    std::cerr << e.what() << '\n';
    return 1;
  }
}
