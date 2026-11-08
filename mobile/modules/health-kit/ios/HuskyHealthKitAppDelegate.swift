import ExpoModulesCore
import HealthKit

/// HealthKit background delivery only works if the observer query is registered every time
/// the app launches, including when iOS launches it in the background after a workout is saved.
public class HuskyHealthKitAppDelegate: ExpoAppDelegateSubscriber {
  public func application(_ application: UIApplication,
                          didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
    if SyncConfig.load() != nil {
      Task { _ = await HealthCore.startBackgroundSync() }
    }
    return true
  }
}
