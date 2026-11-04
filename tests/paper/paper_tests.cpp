#include "Sheet.hpp"
#include <iomanip>
#include <iostream>
#include <sstream>
#include <stdexcept>
using namespace paper;
static int checks = 0;
void check(bool p, const char *m) {
  checks++;
  if (!p)
    throw std::runtime_error(m);
}
static std::string stackState(int layers) {
  std::ostringstream state;
  state << std::setprecision(17)
        << "PAPER_LAB 2\n1 .25 .08 .00015 80000 .00016 65 18 .35\n"
        << layers * 3 << ' ' << layers << " 0\n";
  for (int layer = 0; layer < layers; layer++)
    for (int j = 0; j < 3; j++) {
      double x = j == 0   ? -.04
                 : j == 1 ? .04
                          : 0,
             y = j == 2 ? .04 : -.04,
             uvX = x + .18 * (layer - (layers - 1) * .5);
      state << uvX << ' ' << y << ' ' << x << ' ' << y << ' '
            << (.01 + layer * .015) << " 0 0 " << (layer == 0 ? 0 : -3) << '\n';
    }
  for (int layer = 0; layer < layers; layer++)
    state << layer * 3 << ' ' << layer * 3 + 1 << ' ' << layer * 3 + 2 << '\n';
  state << "0\n1 0.008333333333333333 12 5 80 1 0 0\n";
  return state.str();
}
int main() {
  try {
    {
      Sheet s(7);
      check(std::abs(s.stats.area - .15 * .15) < 1e-12, "rest area");
      check(std::abs(s.stats.mass - .15 * .15 * .08) < 1e-12,
            "areal density must not multiply thickness");
      for (const auto &h : s.hinges)
        check(h.rest == 0, "initial white sheet has no crease");
    }
    {
      V p[] = {{.1, .2, .3}, {1, .2, .2}, {.2, 1, .1}, {.2, -.7, .6}};
      auto a = dihedral(p[0], p[1], p[2], p[3]);
      check(a.valid, "valid hinge");
      for (int i = 0; i < 4; i++)
        for (int k = 0; k < 3; k++) {
          V x[4];
          std::copy(p, p + 4, x);
          double *v = k == 0 ? &x[i].x : k == 1 ? &x[i].y : &x[i].z;
          *v += 1e-6;
          double plus = dihedral(x[0], x[1], x[2], x[3]).value;
          *v -= 2e-6;
          double minus = dihedral(x[0], x[1], x[2], x[3]).value;
          double fd = wrap(plus - minus) / 2e-6, g = k == 0   ? a.gradient[i].x
                                                     : k == 1 ? a.gradient[i].y
                                                              : a.gradient[i].z;
          check(std::abs(fd - g) < 1e-5,
                "signed bending gradient matches finite difference");
        }
    }
    {
      std::array<V, 4> a{{{.2, .2, .1}, {0, 0, 0}, {1, 0, 0}, {0, 1, 0}}},
          b = a;
      b[0].z = -.1;
      auto hit = continuous(a, b, .001, true);
      check(hit.hit && hit.time > .49 && hit.time < .51,
            "VF CCD catches crossing when endpoints are separated");
      b[0].z = .2;
      check(!continuous(a, b, .001, true).hit,
            "VF no collision when moving away");
    }
    {
      std::array<V, 4> a{{{-.1, 0, .1}, {.1, 0, .1}, {0, -.1, 0}, {0, .1, 0}}},
          b = a;
      b[0].z = b[1].z = -.1;
      check(continuous(a, b, .001, false).hit, "EE CCD catches crossed edges");
    }
    {
      Sheet s(5);
      s.advance(.1);
      check(s.stats.strainMax < 1e-6, "flat floor rest does not stretch");
      check(s.stats.minZ >= s.material.thickness / 2 - 1e-10, "table contact");
      check(s.stats.plastic == 0,
            "flat resting paper must not acquire creases");
    }
    {
      Sheet s(5);
      s.setHandle(s.anchor(.013, .017, 3, {.013, .017, .02}));
      auto h = s.handles[0];
      V uv{};
      for (int i = 0; i < 3; i++)
        uv += s.nodes[h.v[i]].uv * h.w[i];
      check((uv - V{.013, .017, 0}).norm() < 1e-10,
            "arbitrary barycentric material grip");
      s.releaseTransient();
      check(s.handles.empty(), "transient grip releases");
    }
    {
      Sheet s(5);
      s.nodes[5].p.z += .01;
      s.nodes[5].v = {.01, .02, .03};
      s.hinges[3].rest = .6;
      s.hinges[3].strength = .2;
      s.setHandle(s.anchor(.013, .017, 4, {.013, .017, .02}, true));
      std::string saved = s.save();
      Sheet other(2);
      other.load(saved);
      check(
          other.save() == saved,
          "half-fold geometry, velocity, plasticity and pins restore exactly");
      try {
        other.load(saved.substr(0, saved.size() / 2));
        check(false, "truncated state rejected");
      } catch (const std::runtime_error &) {
      }
      check(other.save() == saved, "bad load leaves state unchanged");
    }
    {
      std::ostringstream state;
      state << std::setprecision(17)
            << "PAPER_LAB 2\n.5 .25 .08 .00015 80000 .00016 65 18 .35\n6 2 0\n";
      V uv[] = {{-.2, -.04, 0}, {-.12, -.04, 0}, {-.16, .04, 0},
                {.12, -.04, 0}, {.2, -.04, 0},   {.16, .04, 0}};
      for (int i = 0; i < 6; i++) {
        int j = i % 3;
        double x = j == 0 ? -.04 : j == 1 ? .04 : 0, y = j == 2 ? .04 : -.04;
        state << uv[i].x << ' ' << uv[i].y << ' ' << x << ' ' << y << ' '
              << (i < 3 ? .01 : .025) << " 0 0 " << (i < 3 ? 0 : -3) << '\n';
      }
      state << "0 1 2\n3 4 5\n0\n1 0.008333333333333333 12 5 80 1 0 0\n";
      Sheet s(2);
      s.load(state.str());
      int responses = 0;
      for (int step = 0; step < 20; step++) {
        s.advance(1. / 120);
        responses += s.stats.contacts;
        double low = 0, high = 0;
        for (int i = 0; i < 3; i++) {
          low += s.nodes[i].p.z / 3;
          high += s.nodes[i + 3].p.z / 3;
        }
        check(high > low + s.material.thickness * .98,
              "two layers must not swap, even after fast incoming motion and "
              "table contact");
        check(s.audit().intersections == 0,
              "layer end-state intersection audit");
      }
      check(responses > 0, "layer fixture must actually exercise contact");
      check(s.audit().penetration < s.material.thickness * .02,
            "two-layer thickness residual");
    }
    {
      Sheet s(2);
      s.load(stackState(4));
      int responses = 0;
      for (int step = 0; step < 30; step++) {
        s.advance(1. / 120);
        responses += s.stats.contacts;
        for (int layer = 1; layer < 4; layer++) {
          double low = 0, high = 0;
          for (int j = 0; j < 3; j++) {
            low += s.nodes[(layer - 1) * 3 + j].p.z / 3;
            high += s.nodes[layer * 3 + j].p.z / 3;
          }
          check(high > low + s.material.thickness * .98,
                "four-layer ordering under incoming motion");
        }
        check(s.audit().intersections == 0,
              "four-layer end-state intersection audit");
      }
      check(responses > 0, "four-layer fixture exercises contact");
      check(s.audit().penetration < s.material.thickness * .02,
            "four-layer thickness residual");
    }
    {
      Sheet s(5);
      for (int i = 0; i < 12; i++) {
        double u = -.06 + i * .01;
        s.setHandle(s.anchor(u, 0, 100 + i, {u, 0, .02}, true));
      }
      const std::string saved = s.save();
      Sheet restored(2);
      restored.load(saved);
      check(restored.handles.size() == 12,
            "maximum supported pins must restore");
      check(restored.save() == saved, "maximum-pin snapshot round trip");
      try {
        s.setHandle(s.anchor(0, 0, 200, {0, 0, .03}));
        check(false, "grip capacity must reject overflow");
      } catch (const std::runtime_error &) {
      }
      check(s.save() == saved,
            "capacity rejection leaves existing pins intact");
    }
    std::cout << "PASS " << checks << " checks\n";
    return 0;
  } catch (const std::exception &e) {
    std::cerr << "FAIL: " << e.what() << " (check " << checks << ")\n";
    return 1;
  }
}
