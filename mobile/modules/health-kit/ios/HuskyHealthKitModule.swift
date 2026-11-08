import ExpoModulesCore
import HealthKit

/// The JS face of HealthCore (see HealthCore.swift). Same shape as modules/duo-display.
public class HuskyHealthKitModule: Module {
  public func definition() -> ModuleDefinition {
    Name("HuskyHealthKit")

    Function("isAvailable") { HKHealthStore.isHealthDataAvailable() }

    AsyncFunction("requestAuthorization") { () async throws -> Bool in
      try await HealthCore.requestAuthorization()
    }

    AsyncFunction("getWorkouts") { (days: Int) async throws -> [[String: Any]] in
      try await HealthCore.workoutList(days: days)
    }

    AsyncFunction("getSamples") { (kind: String, startMs: Double, endMs: Double) async throws -> [[Double]] in
      try await HealthCore.quantity(kind, from: Date(timeIntervalSince1970: startMs / 1000), to: Date(timeIntervalSince1970: endMs / 1000))
    }

    // Convenience mode: pair with a box (code BOX:WRITESECRET from the website), sync, background delivery.
    // Pairing succeeds once the box and secret are saved; background delivery is reported separately
    // (it needs the HealthKit background entitlement and Background App Refresh, and is off in some simulators).
    AsyncFunction("pair") { (relay: String, code: String) async -> [String: Bool] in
      let parts = code.trimmingCharacters(in: .whitespacesAndNewlines).split(separator: ":", maxSplits: 1).map(String.init)
      guard parts.count == 2, SyncConfig.save(relay: relay, box: parts[0], write: parts[1]) else { return ["ok": false, "background": false] }
      SyncConfig.lastEnd = nil
      let bg = await HealthCore.startBackgroundSync()
      return ["ok": true, "background": bg]
    }

    AsyncFunction("unpair") { () async in
      await HealthCore.stopBackgroundSync()
      SyncConfig.clear()
    }

    Function("isPaired") { SyncConfig.load() != nil }

    AsyncFunction("syncNow") { () async -> [String: Any] in
      await HealthCore.syncNow()
    }

    AsyncFunction("seedDemoWorkout") { (sport: String, minutes: Int, endedMinutesAgo: Int) async throws -> Bool in
      try await HealthCore.seedDemoWorkout(sport: sport, minutes: minutes, endedMinutesAgo: endedMinutesAgo)
    }

    // History of reports and debriefs: on this phone only (file protection: complete).
    Function("historyAppend") { (line: String) throws in try HealthCore.historyAppend(line) }
    Function("historyList") { HealthCore.historyList() }
    Function("historyClear") { HealthCore.historyClear() }
  }
}
