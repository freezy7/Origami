import XCTest
final class OrigamiSmokeTests: XCTestCase {
 private let app=XCUIApplication(bundleIdentifier:"com.freezy7.origami")
 private var state:XCUIElement {app.otherElements["origami-state"].firstMatch}
 override func setUpWithError() throws {continueAfterFailure=false;app.launchArguments=["--origami-legacy"]}
 private func waitFor(_ value:String,timeout:TimeInterval=12){expectation(for:NSPredicate(format:"value CONTAINS %@",value),evaluatedWith:state);waitForExpectations(timeout:timeout)}
 private func point(_ x:CGFloat,_ y:CGFloat)->XCUICoordinate{app.coordinate(withNormalizedOffset:.zero).withOffset(CGVector(dx:x*app.frame.width/390,dy:y*app.frame.width/390))}
 private func tap(_ x:CGFloat,bottom:CGFloat){point(x,app.frame.height*390/app.frame.width-bottom).tap()}
 private func top(_ x:CGFloat,_ y:CGFloat){point(x,y).tap()}
 private func capture(_ name:String){let a=XCTAttachment(screenshot:app.screenshot());a.name=name;a.lifetime = .keepAlways;add(a)}
 private func vector(_ key:String)->[CGFloat]{let s=state.value as? String ?? "";let field=s.components(separatedBy:"|").first{$0.hasPrefix(key+":")} ?? "";return field.dropFirst(key.count+1).split(separator:",").compactMap{Double($0).map{CGFloat($0)}}}
 private func fold(_ direction:CGFloat=1){waitFor("busy:false");let p=vector("grip"),a=vector("axis");XCTAssertEqual(p.count,2);XCTAssertEqual(a.count,2);guard p.count==2&&a.count==2 else{return};let length=max(1,hypot(a[0],a[1]));point(p[0],p[1]).press(forDuration:0.08,thenDragTo:point(p[0]+a[0]/length*150*direction,p[1]+a[1]/length*150*direction));}
 private func assist(){tap(138,bottom:47);top(195,274)}
 func testDirectFoldingObservationTutorialAndPersistence(){
  app.launch();XCTAssertTrue(state.waitForExistence(timeout:30));waitFor("step:0");capture("01-large-workspace");
  state.pinch(withScale:1.2,velocity:1);expectation(for:NSPredicate(format:"NOT (value CONTAINS %@)","zoom:1.00"),evaluatedWith:state);waitForExpectations(timeout:5);capture("02-pinch-zoom");tap(311,bottom:206);waitFor("zoom:1.00");
  fold(-1);waitFor("busy:false");waitFor("step:0");
  fold(0.2);waitFor("busy:false");waitFor("step:0");capture("02-wrong-way-and-short-drag-cancelled");
  fold();waitFor("step:1");capture("03-direct-fold");
  XCUIDevice.shared.press(.home);app.activate();waitFor("step:1");waitFor("mode:touch");waitFor("armed:false");
  app.terminate();app.launch();XCTAssertTrue(state.waitForExistence(timeout:20));waitFor("step:1");
  tap(108,bottom:92);fold();waitFor("wrong:true");capture("04-wrong-crease");
  tap(195,bottom:92);waitFor("wrong:false");tap(282,bottom:92);fold();waitFor("step:2");fold();waitFor("step:3");
  tap(282,bottom:92);fold();waitFor("wrong:true");capture("05-wrong-front-layer");tap(195,bottom:92);waitFor("wrong:false");
  tap(108,bottom:92);fold();waitFor("step:4");waitFor("complete:true");capture("06-completed");
  // Single-finger observation can expose the reverse; reset restores the view.
  let middle=app.frame.height*390/app.frame.width/2;
  point(55,middle).press(forDuration:0.08,thenDragTo:point(360,middle));waitFor("back:true");capture("07-back-side");
  tap(311,bottom:206);waitFor("back:false");
  tap(108,bottom:92);waitFor("tutorial|");waitFor("tutorial:0");
  tap(195,bottom:92);waitFor("playing:true");tap(195,bottom:92);waitFor("playing:false");waitFor("tutorial:0");capture("08-paused-tutorial");
  tap(195,bottom:92);waitFor("tutorial:1");tap(311,bottom:92);waitFor("tutorial:2");tap(195,bottom:92);waitFor("tutorial:3");tap(195,bottom:92);waitFor("tutorial:4");capture("09-guide-completed");
  top(284,106);waitFor("journal|");capture("10-3d-collection");tap(195,bottom:47);waitFor("favorite:false");
  app.terminate();app.launch();XCTAssertTrue(state.waitForExistence(timeout:20));waitFor("complete:true");waitFor("favorite:false");waitFor("step:4");
  tap(195,bottom:47);waitFor("step:0");tap(230,bottom:47);capture("11-motion-availability");top(195,390);waitFor("mode:touch");
  top(303,61);capture("12-english-workspace");top(303,61);
  // Buttons remain an auxiliary input, rather than the primary gameplay path.
  assist();waitFor("step:1");tap(58,bottom:47);waitFor("step:0");capture("13-ready-to-play");
 }
}
