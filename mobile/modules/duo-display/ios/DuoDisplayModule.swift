import ExpoModulesCore
import UIKit

/// What the app needs from iPhone Duo to lay itself out, for React Native,
/// which has no size-class API of its own.
///
/// Everything here is UIKit's public iOS 27.1 API (UIKit's
/// UIViewReservedRegion.h, UIHingeInteraction.h, UIVerticalBarEdge.h):
///
/// - size classes: Apple's signal for layout. The inner display is regular
///   by regular; the cover display compact by regular (portrait).
/// - verticalBarEdge: the side the system puts bars on when they turn
///   vertical, Apple's signal for the cover display's two shapes.
/// - reserved regions: the fold (`.division`) and the cameras (`.occlusion`),
///   in window points, the same coordinate space React Native lays out in.
/// - the hinge: for effects only. Apple: drive layout from size classes and
///   regions, never from the hinge angle.
///
/// On anything older than iOS 27.1 the state reports size classes and
/// nothing else, and on Android this module isn't built at all
/// (expo-module.config.json), so the JS hook falls back to window width.
public class DuoDisplayModule: Module {
  private var observer: AnyObject?

  public func definition() -> ModuleDefinition {
    Name("DuoDisplay")

    Events("onChange")

    // runOnQueue(.main) puts this on the main thread; assumeIsolated tells
    // Swift so, for the UIKit reads inside.
    AsyncFunction("getState") { () -> [String: Any] in
      MainActor.assumeIsolated {
        DuoDisplayModule.stateWithHinge(of: DuoDisplayModule.keyWindow())
      }
    }.runOnQueue(.main)

    OnStartObserving("onChange") { [weak self] in
      DispatchQueue.main.async { self?.startObserving() }
    }

    OnStopObserving("onChange") { [weak self] in
      DispatchQueue.main.async { self?.stopObserving() }
    }
  }

  // MARK: - Observing

  @MainActor
  private func startObserving() {
    guard observer == nil, let window = DuoDisplayModule.keyWindow() else { return }
    let emit: () -> Void = { [weak self, weak window] in
      self?.sendEvent("onChange", DuoDisplayModule.stateWithHinge(of: window))
    }
    if #available(iOS 27.1, *) {
      observer = DuoObserver(window: window, onChange: emit)
    } else if #available(iOS 17.0, *) {
      observer = SizeClassObserver(window: window, onChange: emit)
    }
    // iOS 16.4 to 16.x: no trait-change API. The JS hook still re-reads the
    // state whenever the window resizes, which covers what changes there.
  }

  @MainActor
  private func stopObserving() {
    (observer as? Stoppable)?.stop()
    observer = nil
  }

  // MARK: - State

  @MainActor
  static func keyWindow() -> UIWindow? {
    let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
    let scene = scenes.first { $0.activationState == .foregroundActive } ?? scenes.first
    return scene?.keyWindow ?? scene?.windows.first
  }

  @MainActor
  static func state(of window: UIWindow?) -> [String: Any] {
    guard let window else { return ["available": false] }
    let traits = window.traitCollection
    var state: [String: Any] = [
      "available": true,
      "horizontalSizeClass": name(of: traits.horizontalSizeClass),
      "verticalSizeClass": name(of: traits.verticalSizeClass),
      "width": window.bounds.width,
      "height": window.bounds.height,
      "verticalBarEdge": "unspecified",
      "division": [[String: Any]](),
      "occlusion": [[String: Any]](),
    ]
    if #available(iOS 27.1, *) {
      state["verticalBarEdge"] = name(of: traits.verticalBarEdge)
      // Inactive regions are included so the app can tell "the fold is here,
      // but flat right now" from "no fold"; each carries its own isActive.
      state["division"] = window.reservedRegions(kind: .division, options: .includeInactive).map(describe)
      state["occlusion"] = window.reservedRegions(kind: .occlusion, options: .includeInactive).map(describe)
    }
    return state
  }

  @available(iOS 27.1, *)
  static func describe(_ region: UIView.ReservedRegion) -> [String: Any] {
    [
      "x": region.frame.origin.x,
      "y": region.frame.origin.y,
      "width": region.frame.width,
      "height": region.frame.height,
      "isActive": region.isActive,
      "margins": [
        "top": region.margins.top,
        "left": region.margins.left,
        "bottom": region.margins.bottom,
        "right": region.margins.right,
      ],
    ]
  }

  static func name(of sizeClass: UIUserInterfaceSizeClass) -> String {
    switch sizeClass {
    case .compact: return "compact"
    case .regular: return "regular"
    default: return "unspecified"
    }
  }

  @available(iOS 27.1, *)
  static func name(of edge: UIVerticalBarEdge) -> String {
    switch edge {
    case .leading: return "leading"
    case .trailing: return "trailing"
    default: return "unspecified"
    }
  }

  @available(iOS 27.1, *)
  static func name(of status: UIHinge.Status) -> String {
    switch status {
    case .closed: return "closed"
    case .partiallyOpen: return "partiallyOpen"
    case .fullyOpen: return "fullyOpen"
    default: return "unknown"
    }
  }
}

private protocol Stoppable: AnyObject {
  @MainActor func stop()
}

/// iOS 17 to 27.0: size-class changes only.
@available(iOS 17.0, *)
@MainActor
private final class SizeClassObserver: Stoppable {
  private var registration: UITraitChangeRegistration?
  private weak var window: UIWindow?

  init(window: UIWindow, onChange: @escaping () -> Void) {
    self.window = window
    registration = window.registerForTraitChanges(
      [UITraitHorizontalSizeClass.self, UITraitVerticalSizeClass.self]
    ) { (_: UIWindow, _: UITraitCollection) in onChange() }
  }

  func stop() {
    if let registration { window?.unregisterForTraitChanges(registration) }
    registration = nil
  }
}

/// iOS 27.1: size classes, the vertical bar edge, and the hinge. The hinge
/// moving is also when the fold region turns active or inactive, so its
/// updates double as the trigger for re-reading reserved regions.
@available(iOS 27.1, *)
@MainActor
private final class DuoObserver: Stoppable {
  private var registration: UITraitChangeRegistration?
  private var hinge: UIHingeInteraction?
  private weak var window: UIWindow?
  // The angle changes continuously while the device moves, and layout never
  // uses it, so only a change of status is worth a message across the bridge.
  private var lastStatus: UIHinge.Status??

  init(window: UIWindow, onChange: @escaping () -> Void) {
    self.window = window
    let traits: [UITrait] = [UITraitHorizontalSizeClass.self, UITraitVerticalSizeClass.self]
      + UITraitCollection.systemTraitsAffectingVerticalBarEdge
    registration = window.registerForTraitChanges(traits) { (_: UIWindow, _: UITraitCollection) in onChange() }

    let interaction = UIHingeInteraction { [weak self] _, update in
      guard let self else { return }
      let status = update.hinge?.status
      if let last = self.lastStatus, last == status { return }
      self.lastStatus = .some(status)
      HingeStore.latest = update.hinge.map { (DuoDisplayModule.name(of: $0.status), $0.angle) }
      onChange()
    }
    window.addInteraction(interaction)
    hinge = interaction
  }

  func stop() {
    if let registration { window?.unregisterForTraitChanges(registration) }
    if let hinge { window?.removeInteraction(hinge) }
    registration = nil
    hinge = nil
    HingeStore.latest = nil
  }
}

/// The last hinge reading, attached to every state while observing.
@MainActor
enum HingeStore {
  static var latest: (status: String, angle: CGFloat)?
}

extension DuoDisplayModule {
  @MainActor
  static func stateWithHinge(of window: UIWindow?) -> [String: Any] {
    var state = state(of: window)
    if let hinge = HingeStore.latest {
      // UIHinge.h doesn't state the angle's unit, so it's passed through
      // untouched. Nothing in the app lays out by it.
      state["hinge"] = ["status": hinge.status, "angle": hinge.angle]
    }
    return state
  }
}
