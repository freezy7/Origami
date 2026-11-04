#import <UIKit/UIKit.h>
#import <CoreMotion/CoreMotion.h>
#import <QuartzCore/QuartzCore.h>
#if __has_include(<UIKit/UIHingeInteraction.h>)
#import <UIKit/UIHingeInteraction.h>
#endif

// Samples are polled by the game on the main thread; only an explicit player
// choice starts motion sampling. No raw readings or transient folds are saved.
@interface OrigamiDeviceInput : NSObject
+ (NSString *)sample:(NSString *)unused;
+ (void)configure:(NSString *)mode;
+ (void)feedback:(NSString *)kind;
@end

@implementation OrigamiDeviceInput
static CMMotionManager *motion;
static BOOL hingeAvailable = NO;
static CGFloat hingeAngle = 0;
#if __has_include(<UIKit/UIHingeInteraction.h>)
static UIHingeInteraction *hingeInteraction API_AVAILABLE(ios(27.1));
static UIView *hingeView;
#endif
+ (void)installHinge {
#if __has_include(<UIKit/UIHingeInteraction.h>)
    if (@available(iOS 27.1, *)) {
        UIView *view = UIApplication.sharedApplication.delegate.window;
        if (!view || view == hingeView) return;
        if (hingeInteraction) {
            [hingeView removeInteraction:hingeInteraction];
            [hingeInteraction release];
        }
        hingeAvailable = NO;
        hingeView = view;
        hingeInteraction = [[UIHingeInteraction alloc] initWithUpdateHandler:^(UIHingeInteraction *interaction, UIHingeInteractionUpdate *update) {
            hingeAvailable = update.hinge != nil && update.hinge.status != UIHingeStatusUnknown;
            if (hingeAvailable) hingeAngle = update.hinge.angle; // UIKit reports radians.
        }];
        [view addInteraction:hingeInteraction];
    }
#endif
}
+ (NSString *)sample:(NSString *)unused {
    if (!NSThread.isMainThread) {
        __block NSString *result;
        dispatch_sync(dispatch_get_main_queue(), ^{ result = [[self sample:unused] retain]; });
        return [result autorelease];
    }
    if (!motion) motion = [[CMMotionManager alloc] init];
    [self installHinge];
    CMDeviceMotion *reading = motion.deviceMotion;
    NSDictionary *sample = @{
        @"tiltAvailable": @(motion.deviceMotionAvailable),
        @"hingeAvailable": @(hingeAvailable && UIApplication.sharedApplication.applicationState == UIApplicationStateActive),
        @"active": @(motion.deviceMotionActive && reading != nil),
        @"age": reading ? @(MAX(0, CACurrentMediaTime() - reading.timestamp)) : @999,
        @"pitch": reading ? @(reading.attitude.pitch) : @0,
        @"roll": reading ? @(reading.attitude.roll) : @0,
        @"hinge": hingeAvailable ? @(hingeAngle) : NSNull.null,
    };
    NSData *data = [NSJSONSerialization dataWithJSONObject:sample options:0 error:nil];
    return [[[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding] autorelease];
}
+ (void)configure:(NSString *)mode {
    if (!NSThread.isMainThread) { dispatch_async(dispatch_get_main_queue(), ^{ [self configure:mode]; }); return; }
    if (!motion) motion = [[CMMotionManager alloc] init];
    [motion stopDeviceMotionUpdates];
    if ([mode isEqualToString:@"tilt"] && motion.deviceMotionAvailable) {
        motion.deviceMotionUpdateInterval = 1.0 / 50.0;
        [motion startDeviceMotionUpdatesUsingReferenceFrame:CMAttitudeReferenceFrameXArbitraryZVertical];
    }
    [self installHinge];
}
+ (void)feedback:(NSString *)kind {
    if (!NSThread.isMainThread) { dispatch_async(dispatch_get_main_queue(), ^{ [self feedback:kind]; }); return; }
    if ([kind isEqualToString:@"complete"]) {
        UINotificationFeedbackGenerator *generator = [[UINotificationFeedbackGenerator alloc] init];
        [generator notificationOccurred:UINotificationFeedbackTypeSuccess];
        [generator release];
    } else {
        UIImpactFeedbackGenerator *generator = [[UIImpactFeedbackGenerator alloc] initWithStyle:
            [kind isEqualToString:@"fold"] ? UIImpactFeedbackStyleSoft : UIImpactFeedbackStyleLight];
        [generator impactOccurredWithIntensity:[kind isEqualToString:@"fold"] ? 0.65 : 0.35];
        [generator release];
    }
}
@end
