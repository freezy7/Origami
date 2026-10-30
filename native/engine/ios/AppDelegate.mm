/****************************************************************************
 Copyright (c) 2010-2013 cocos2d-x.org
 Copyright (c) 2013-2016 Chukong Technologies Inc.
 Copyright (c) 2017-2022 Xiamen Yaji Software Co., Ltd.

 http://www.cocos.com

 Permission is hereby granted, free of charge, to any person obtaining a copy
 of this software and associated engine source code (the "Software"), a limited,
 worldwide, royalty-free, non-assignable, revocable and non-exclusive license
 to use Cocos Creator solely to develop games on your target platforms. You shall
 not use Cocos Creator software for developing other software or tools that's
 used for developing games. You are not granted to publish, distribute,
 sublicense, and/or sell copies of Cocos Creator.

 The software or tools in this License Agreement are licensed, not sold.
 Xiamen Yaji Software Co., Ltd. reserves all rights not expressly granted to you.

 THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 THE SOFTWARE.
****************************************************************************/

#import "AppDelegate.h"
#import "ViewController.h"
#import "View.h"

#include "platform/ios/IOSPlatform.h"
#import "platform/ios/AppDelegateBridge.h"
#import "service/SDKWrapper.h"

@interface AppDelegate ()
@property(nonatomic, copy) NSDictionary *origamiLaunchOptions;
@property(nonatomic, assign) BOOL origamiEngineStarted;
- (void)connectWindowScene:(UIWindowScene *)scene;
@end

// Cocos 3.8.8 still exposes an application-delegate bridge. Own the window in
// a single UIKit scene and forward that scene's lifecycle to the existing bridge.
@interface OrigamiSceneDelegate : NSObject <UIWindowSceneDelegate>
@property(nonatomic, strong) UIWindow *window;
@end

@implementation OrigamiSceneDelegate
- (void)scene:(UIScene *)scene willConnectToSession:(UISceneSession *)session options:(UISceneConnectionOptions *)options {
    if (![scene isKindOfClass:UIWindowScene.class]) return;
    AppDelegate *delegate = (AppDelegate *)UIApplication.sharedApplication.delegate;
    [delegate connectWindowScene:(UIWindowScene *)scene];
    self.window = delegate.window;
}
- (void)sceneWillResignActive:(UIScene *)scene {
    [(AppDelegate *)UIApplication.sharedApplication.delegate applicationWillResignActive:UIApplication.sharedApplication];
}
- (void)sceneDidBecomeActive:(UIScene *)scene {
    [(AppDelegate *)UIApplication.sharedApplication.delegate applicationDidBecomeActive:UIApplication.sharedApplication];
}
- (void)sceneDidEnterBackground:(UIScene *)scene {
    [(AppDelegate *)UIApplication.sharedApplication.delegate applicationDidEnterBackground:UIApplication.sharedApplication];
}
- (void)sceneWillEnterForeground:(UIScene *)scene {
    [(AppDelegate *)UIApplication.sharedApplication.delegate applicationWillEnterForeground:UIApplication.sharedApplication];
}
@end

@implementation AppDelegate
@synthesize window;
@synthesize appDelegateBridge;

#pragma mark -
#pragma mark Application lifecycle

- (BOOL)application:(UIApplication *)application didFinishLaunchingWithOptions:(NSDictionary *)launchOptions {
    [[SDKWrapper shared] application:application didFinishLaunchingWithOptions:launchOptions];
    appDelegateBridge = [[AppDelegateBridge alloc] init];
    
    self.origamiLaunchOptions = launchOptions;
    return YES;
}

- (void)connectWindowScene:(UIWindowScene *)scene {
    self.window = [[UIWindow alloc] initWithWindowScene:scene];
    if (!_viewController) {
        _viewController = [[ViewController alloc] init];
        _viewController.view = [[View alloc] initWithFrame:scene.coordinateSpace.bounds];
        _viewController.view.contentScaleFactor = scene.screen.scale;
        _viewController.view.multipleTouchEnabled = true;
    }
    self.window.rootViewController = _viewController;
    [self.window makeKeyAndVisible];
    if (!self.origamiEngineStarted) {
        [appDelegateBridge application:UIApplication.sharedApplication didFinishLaunchingWithOptions:self.origamiLaunchOptions];
        self.origamiEngineStarted = YES;
        self.origamiLaunchOptions = nil;
    }
}

- (void)applicationWillResignActive:(UIApplication *)application {
    /*
     Sent when the application is about to move from active to inactive state. This can occur for certain types of temporary interruptions (such as an incoming phone call or SMS message) or when the user quits the application and it begins the transition to the background state.
     Use this method to pause ongoing tasks, disable timers, and throttle down OpenGL ES frame rates. Games should use this method to pause the game.
     */
    [[SDKWrapper shared] applicationWillResignActive:application];
    if (self.origamiEngineStarted) [appDelegateBridge applicationWillResignActive:application];
}

- (void)applicationDidBecomeActive:(UIApplication *)application {
    /*
     Restart any tasks that were paused (or not yet started) while the application was inactive. If the application was previously in the background, optionally refresh the user interface.
     */
    [[SDKWrapper shared] applicationDidBecomeActive:application];
    if (self.origamiEngineStarted) [appDelegateBridge applicationDidBecomeActive:application];
}

- (void)applicationDidEnterBackground:(UIApplication *)application {
    /*
     Use this method to release shared resources, save user data, invalidate timers, and store enough application state information to restore your application to its current state in case it is terminated later.
     If your application supports background execution, called instead of applicationWillTerminate: when the user quits.
     */
    [[SDKWrapper shared] applicationDidEnterBackground:application];
}

- (void)applicationWillEnterForeground:(UIApplication *)application {
    /*
     Called as part of  transition from the background to the inactive state: here you can undo many of the changes made on entering the background.
     */
    [[SDKWrapper shared] applicationWillEnterForeground:application];
}

- (void)applicationWillTerminate:(UIApplication *)application {
    [[SDKWrapper shared] applicationWillTerminate:application];
    if (self.origamiEngineStarted) [appDelegateBridge applicationWillTerminate:application];
}

#pragma mark -
#pragma mark Memory management

- (void)applicationDidReceiveMemoryWarning:(UIApplication *)application {
    [[SDKWrapper shared] applicationDidReceiveMemoryWarning:application];
}

@end

// A concise scene summary for assistive technology and native integration checks.
// Canvas controls are not yet full VoiceOver controls in this prototype.
@interface OrigamiAccessibility : NSObject
+ (void)updateState:(NSString *)state;
@end
@implementation OrigamiAccessibility
+ (void)updateState:(NSString *)state {
    dispatch_async(dispatch_get_main_queue(), ^{
        id delegate = UIApplication.sharedApplication.delegate;
        UIWindow *window = [delegate window];
        UIView *view = window.rootViewController.view;
        view.isAccessibilityElement = YES;
        view.accessibilityIdentifier = @"origami-state";
        view.accessibilityLabel = @"Origami paper journal";
        view.accessibilityValue = state;
    });
}
@end
