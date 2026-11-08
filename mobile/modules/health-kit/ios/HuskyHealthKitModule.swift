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

    // Personal API: log in with your HuskyHealth account (keys derived here, password never sent), then this
    // phone holds only a write token and posts new workouts to /v1/me/records, also when iOS wakes it in the background.
    AsyncFunction("login") { (relay: String, username: String, password: String) async -> [String: Any] in
      let status = await Account.login(relay: relay, username: username, password: password)
      guard status == 200 else { return ["ok": false, "status": status, "background": false] }
      let bg = await HealthCore.startBackgroundSync()
      return ["ok": true, "status": 200, "background": bg]
    }

    AsyncFunction("deleteAccount") { (relay: String, username: String, password: String) async -> Int in
      let status = await Account.deleteAccount(relay: relay, username: username, password: password)
      if status == 204 { await HealthCore.stopBackgroundSync() }
      return status
    }

    AsyncFunction("unpair") { () async in
      await HealthCore.stopBackgroundSync()
      SyncConfig.clear()
    }

    Function("user") { SyncConfig.load() != nil ? SyncConfig.user : nil }

    Function("isPaired") { SyncConfig.load() != nil }

    // Minutes asleep per night as [[wakeMs, minutes]], for the engine on this device (Today screen).
    AsyncFunction("getSleep") { (startMs: Double, endMs: Double) async throws -> [[Double]] in
      try await HealthCore.sleepNights(from: Date(timeIntervalSince1970: startMs / 1000), to: Date(timeIntervalSince1970: endMs / 1000))
    }

    AsyncFunction("syncNow") { () async -> [String: Any] in
      await HealthCore.syncNow()
    }

    AsyncFunction("backfill") { (days: Int) async -> [String: Any] in
      await HealthCore.backfill(days: days)
    }

    AsyncFunction("seedDemoWorkout") { (sport: String, minutes: Int, endedMinutesAgo: Int) async throws -> Bool in
      try await HealthCore.seedDemoWorkout(sport: sport, minutes: minutes, endedMinutesAgo: endedMinutesAgo)
    }

    // History of reports and debriefs: on this phone only (file protection: complete).
    // The account vault (HealthCore.swift): the same encrypted history the website reads and writes.
    AsyncFunction("getVault") { () async -> [String: Any] in await Vault.get() }
    AsyncFunction("saveVault") { (json: String) async -> Int in await Vault.put(json) }

    // Voice, as on the website: Gradium speaks today's call; a spoken question comes back as words.
    AsyncFunction("speak") { (text: String) async -> [String: Any] in await Voice.speak(text) }
    Function("stopSpeaking") { Voice.stop() }
    AsyncFunction("listen") { () async -> [String: Any] in await Voice.listen() }
  }
}
