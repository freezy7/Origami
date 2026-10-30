import XCTest

final class OrigamiSmokeTests: XCTestCase {
    private let app = XCUIApplication(bundleIdentifier: "com.freezy7.origami")
    private var state: XCUIElement { app.otherElements["origami-state"].firstMatch }
    override func setUpWithError() throws { continueAfterFailure = false }
    private func waitFor(_ value: String, timeout: TimeInterval = 12) {
        let predicate = NSPredicate(format: "value CONTAINS %@", value)
        expectation(for: predicate, evaluatedWith: state)
        waitForExpectations(timeout: timeout)
    }
    private func tap(_ x: CGFloat, bottom: CGFloat) {
        let frame = app.frame
        app.coordinate(withNormalizedOffset: .zero).withOffset(CGVector(dx: x * frame.width / 390, dy: frame.height - bottom * frame.width / 390)).tap()
    }
    private func tapTop(_ x: CGFloat, _ y: CGFloat) {
        let frame = app.frame
        app.coordinate(withNormalizedOffset: .zero).withOffset(CGVector(dx: x * frame.width / 390, dy: y * frame.width / 390)).tap()
    }
    private func capture(_ name: String) {
        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = name; attachment.lifetime = .keepAlways; add(attachment)
    }
    func testPuzzleUndoTutorialAndPersistence() {
        app.launch()
        XCTAssertTrue(state.waitForExistence(timeout: 30))
        waitFor("step:0"); capture("01-studio")
        tap(195, bottom: 94); waitFor("step:1")
        tap(110, bottom: 145); tap(195, bottom: 94)
        waitFor("wrong:true"); capture("02-wrong-fold")
        tap(195, bottom: 105); waitFor("wrong:false"); waitFor("step:1")
        tap(280, bottom: 145); tap(195, bottom: 94); waitFor("step:2")
        tap(195, bottom: 94); waitFor("step:3")
        tap(280, bottom: 145); tap(195, bottom: 94); waitFor("wrong:true")
        tap(195, bottom: 105); waitFor("wrong:false")
        tap(110, bottom: 145); tap(195, bottom: 94); waitFor("step:4")
        waitFor("complete:true"); capture("03-completed")
        tap(195, bottom: 105); waitFor("tutorial|" ); waitFor("tutorial:0")
        tap(195, bottom: 100); waitFor("tutorial:1")
        tap(195, bottom: 100); waitFor("playing:true")
        tap(195, bottom: 100); waitFor("playing:false"); waitFor("tutorial:1")
        capture("04-paused-tutorial")
        tap(195, bottom: 100); waitFor("tutorial:2")
        tap(308, bottom: 100); waitFor("tutorial:3"); capture("05-tutorial")
        tapTop(278, 148); waitFor("journal|"); capture("05-journal")
        tapTop(195, 659); waitFor("favorite:false")
        app.terminate(); app.launch()
        XCTAssertTrue(state.waitForExistence(timeout: 20)); waitFor("step:4"); waitFor("complete:true"); waitFor("favorite:false")
        capture("07-restored")
        tap(280, bottom: 51); waitFor("step:0")
        let start = app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5))
        let small = start.withOffset(CGVector(dx: 0, dy: 15))
        start.press(forDuration: 0.05, thenDragTo: small)
        waitFor("step:0")
        let end = start.withOffset(CGVector(dx: 0, dy: 130 * app.frame.width / 390))
        start.press(forDuration: 0.05, thenDragTo: end)
        waitFor("step:1")
        tap(82, bottom: 43); waitFor("step:0")
        tapTop(347, 78); capture("08-chinese-studio")
        tapTop(347, 78); capture("09-ready-to-play")
    }
}
