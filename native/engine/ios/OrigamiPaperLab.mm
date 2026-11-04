#include "../../paper/Sheet.hpp"
#import <Foundation/Foundation.h>
#include <memory>
#include <mutex>
using namespace paper;
@interface OrigamiPaperLab : NSObject
+ (NSString *)command:(NSString *)json;
+ (NSString *)legacyRequested:(NSString *)unused;
@end
@implementation OrigamiPaperLab
static std::unique_ptr<Sheet> sheet;
static std::mutex mutex;
+ (NSString *)legacyRequested:(NSString *)unused {
  return
      [NSProcessInfo.processInfo.arguments containsObject:@"--origami-legacy"]
          ? @"yes"
          : @"no";
}
+ (NSString *)command:(NSString *)json {
  std::lock_guard<std::mutex> lock(mutex);
  @try {
    try {
      NSData *input = [json dataUsingEncoding:NSUTF8StringEncoding];
      NSDictionary *q = [NSJSONSerialization JSONObjectWithData:input
                                                        options:0
                                                          error:nil];
      if (![q isKindOfClass:NSDictionary.class])
        throw std::runtime_error("invalid command");
      NSString *op = q[@"op"];
      if (!sheet || [op isEqualToString:@"reset"]) {
        Material m = Material();
        m.width = .210;
        m.height = .297;
        sheet = std::make_unique<Sheet>(8, m);
        sheet->solver = Solver::Implicit;
        sheet->fixedDt = 1. / 120;
      }
      auto vector = [](NSArray *a) -> V {
        if (![a isKindOfClass:NSArray.class] || a.count != 3)
          throw std::runtime_error("invalid vector");
        return {[a[0] doubleValue], [a[1] doubleValue], [a[2] doubleValue]};
      };
      if ([op isEqualToString:@"advance"])
        sheet->advance([q[@"dt"] doubleValue]);
      else if ([op isEqualToString:@"grip"]) {
        int id = [q[@"id"] intValue];
        bool pin = [q[@"pin"] boolValue], press = [q[@"press"] boolValue];
        sheet->setHandle(sheet->anchor([q[@"u"] doubleValue],
                                       [q[@"v"] doubleValue], id,
                                       vector(q[@"target"]), pin, press));
      } else if ([op isEqualToString:@"move"])
        sheet->moveHandle([q[@"id"] intValue], vector(q[@"target"]));
      else if ([op isEqualToString:@"release"])
        sheet->release([q[@"id"] intValue]);
      else if ([op isEqualToString:@"pause"])
        sheet->releaseTransient();
      else if ([op isEqualToString:@"load"]) {
        NSString *state = q[@"state"];
        if (![state isKindOfClass:NSString.class])
          throw std::runtime_error("invalid state");
        sheet->load(state.UTF8String);
      } else if (![op isEqualToString:@"state"] &&
                 ![op isEqualToString:@"save"] &&
                 ![op isEqualToString:@"reset"])
        throw std::runtime_error("unknown command");
      sheet->measure();
      NSMutableArray *positions = [NSMutableArray array],
                     *anchors = [NSMutableArray array];
      for (const auto &n : sheet->nodes)
        [positions addObjectsFromArray:@[ @(n.p.x), @(n.p.y), @(n.p.z) ]];
      for (const auto &h : sheet->handles) {
        V p{};
        for (int i = 0; i < 3; i++)
          p += sheet->nodes[h.v[i]].p * h.w[i];
        [anchors addObject:@{
          @"id" : @(h.id),
          @"uv" : @[ @(h.materialPoint.x), @(h.materialPoint.y) ],
          @"target" : @[ @(h.target.x), @(h.target.y), @(h.target.z) ],
          @"p" : @[ @(p.x), @(p.y), @(p.z) ],
          @"pin" : @(h.pin),
          @"press" : @(h.press)
        }];
      }
      const auto &s = sheet->stats;
      NSMutableDictionary *result =
          [NSMutableDictionary dictionaryWithDictionary:@{
            @"ok" : @YES,
            @"positions" : positions,
            @"anchors" : anchors,
            @"stats" : @{
              @"time" : @(s.time),
              @"ms" : @(s.stepMs),
              @"strainMax" : @(s.strainMax),
              @"strainP95" : @(s.strainP95),
              @"mass" : @(s.mass),
              @"area" : @(s.area),
              @"plastic" : @(s.plastic),
              @"maxPlastic" : @(s.maxPlastic),
              @"contacts" : @(s.contacts),
              @"ccdLimited" : @(s.ccdLimited),
              @"backlog" : @(s.droppedTime)
            },
            @"solver" : sheet->solver == Solver::Implicit ? @"implicit-gn"
                                                          : @"xpbd"
          }];
      if (![op isEqualToString:@"advance"] && ![op isEqualToString:@"move"]) {
        NSMutableArray *uv = [NSMutableArray array],
                       *tri = [NSMutableArray array],
                       *crease = [NSMutableArray array];
        for (const auto &n : sheet->nodes)
          [uv addObjectsFromArray:@[ @(n.uv.x), @(n.uv.y) ]];
        for (const auto &f : sheet->faces)
          for (int v : f.v)
            [tri addObject:@(v)];
        for (const auto &h : sheet->hinges)
          if (std::abs(h.rest) > .015)
            [crease addObject:@[ @(h.v[0]), @(h.v[1]), @(h.rest) ]];
        result[@"uv"] = uv;
        result[@"triangles"] = tri;
        result[@"creases"] = crease;
      }
      if ([op isEqualToString:@"save"] || [op isEqualToString:@"pause"])
        result[@"state"] =
            [NSString stringWithUTF8String:sheet->save().c_str()];
      NSData *data = [NSJSONSerialization dataWithJSONObject:result
                                                     options:0
                                                       error:nil];
      return [[[NSString alloc] initWithData:data
                                    encoding:NSUTF8StringEncoding] autorelease];
    } catch (const std::exception &e) {
      NSData *data = [NSJSONSerialization dataWithJSONObject:@{
        @"ok" : @NO,
        @"error" : [NSString stringWithUTF8String:e.what()]
      }
                                                     options:0
                                                       error:nil];
      return [[[NSString alloc] initWithData:data
                                    encoding:NSUTF8StringEncoding] autorelease];
    }
  } @catch (NSException *exception) {
    return @"{\"ok\":false,\"error\":\"native command failed\"}";
  }
}
@end
