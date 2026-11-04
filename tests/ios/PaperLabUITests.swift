import XCTest

final class PaperLabUITests: XCTestCase {
    private let app = XCUIApplication(bundleIdentifier: "com.freezy7.origami")
    private var state: XCUIElement { app.otherElements["origami-state"].firstMatch }
    private var height: CGFloat { app.frame.height * 390 / app.frame.width }
    override func setUpWithError() throws { continueAfterFailure = false }
    private func waitFor(_ s: String, timeout: TimeInterval = 15) {
        expectation(for: NSPredicate(format: "value CONTAINS %@", s), evaluatedWith: state)
        waitForExpectations(timeout: timeout)
    }
    private func field(_ key: String) -> String {
        let s = state.value as? String ?? ""
        return String((s.split(separator: "|").first { $0.hasPrefix(key + ":") } ?? "").dropFirst(key.count + 1))
    }
    private func number(_ key: String) -> Double { Double(field(key)) ?? -1 }
    private func vertex(_ key: String) -> [CGFloat] { field(key).split(separator: ",").compactMap { Double($0).map { CGFloat($0) } } }
    private func point(_ x: CGFloat, _ y: CGFloat) -> XCUICoordinate {
        app.coordinate(withNormalizedOffset: .zero).withOffset(CGVector(dx: x * app.frame.width / 390, dy: y * app.frame.width / 390))
    }
    private func tap(_ x: CGFloat, _ bottom: CGFloat) { point(x, height - bottom).tap() }
    private func capture(_ name: String) {
        let a = XCTAttachment(screenshot: app.screenshot()); a.name = name; a.lifetime = .keepAlways; add(a)
        let values = XCTAttachment(string: state.value as? String ?? ""); values.name = name + "-state"; values.lifetime = .keepAlways; add(values)
    }
    private func freshSheet() {
        app.launch(); XCTAssertTrue(state.waitForExistence(timeout: 30)); waitFor("lab|")
        tap(281, 46); waitFor("pins:0"); waitFor("plastic:0"); waitFor("error:false")
    }
    private func fix(_ key: String) {
        tap(195, 91); let p = vertex(key); XCTAssertEqual(p.count, 2); point(p[0], p[1]).tap()
    }
    private func raiseSelected() {
        point(351, height / 2 + 60).press(forDuration: 0.1, thenDragTo: point(351, height / 2 - 30), withVelocity: .slow, thenHoldForDuration: 0.7)
    }

    func testPauseThenDragDoesNotLock() {
        freshSheet(); capture("controls-01-white-sheet")
        let b = vertex("b")
        // The old 0.65 s timer pinned before this drag even started.
        point(b[0], b[1]).press(forDuration: 1.2, thenDragTo: point(b[0] - 65, b[1] - 30), withVelocity: .slow, thenHoldForDuration: 1.2)
        waitFor("pins:0"); waitFor("grips:0"); waitFor("error:false")
        let moved = vertex("b")
        XCTAssertGreaterThan(hypot(moved[0] - b[0], moved[1] - b[1]), 15)
        capture("controls-02-pause-does-not-pin")
    }

    func testPinHeightRegrabPressureAndPersistence() {
        freshSheet(); fix("a"); waitFor("pins:1"); fix("b"); waitFor("pins:2")
        raiseSelected(); XCTAssertGreaterThan(number("bz"), 0.025); capture("controls-03-explicit-height")
        let before = vertex("b")
        point(before[0], before[1]).press(forDuration: 1.2, thenDragTo: point(before[0] - 40, before[1] + 15), withVelocity: .slow, thenHoldForDuration: 1)
        waitFor("pins:2"); waitFor("grips:0"); waitFor("error:false")
        let moved = vertex("b")
        XCTAssertGreaterThan(hypot(moved[0] - before[0], moved[1] - before[1]), 12)
        capture("controls-04-regrab-existing-pin")
        tap(211, 46); let savedHeight = number("bz")
        app.terminate(); app.launch(); XCTAssertTrue(state.waitForExistence(timeout: 30)); waitFor("restored:true"); waitFor("pins:2")
        XCTAssertEqual(number("bz"), savedHeight, accuracy: 0.003)
        capture("controls-05-continuous-shape-restored")
        XCUIDevice.shared.press(.home); app.activate(); waitFor("grips:0"); waitFor("pins:2")
        let yaw = number("yaw")
        point(28, 270).press(forDuration: 0.1, thenDragTo: point(95, 275))
        XCTAssertGreaterThan(abs(number("yaw") - yaw), 10); waitFor("pins:2")
        tap(133, 46)
        let high = number("bz"), b = vertex("b")
        tap(315, 91)
        // Actual stationary pressure on a raised material point, not a tool screenshot.
        point(b[0], b[1]).press(forDuration: 2)
        waitFor("pins:1"); waitFor("grips:0"); waitFor("error:false")
        XCTAssertLessThan(number("pressheight"), high - 0.005)
        capture("controls-06-stationary-pressure")
        tap(75, 91); tap(55, 46); waitFor("pins:2")
        capture("controls-07-undo-pressure")
        point(327, 62).tap(); waitFor("studio|"); capture("controls-08-legacy")
        app.terminate(); app.launch(); XCTAssertTrue(state.waitForExistence(timeout: 30)); waitFor("lab|")
        tap(281, 46); waitFor("pins:0"); capture("controls-09-ready")
    }

    func testTwoPaperTouchesAreTwoHands() {
        freshSheet()
        app.otherElements["origami-paper-center"].firstMatch.twoFingerTap()
        XCTAssertEqual(number("peakHands"), 2, state.value as? String ?? "")
        waitFor("grips:0"); waitFor("pins:0"); waitFor("error:false")
        capture("controls-10-two-paper-hands")
    }
}
