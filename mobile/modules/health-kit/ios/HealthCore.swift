import Foundation
import HealthKit
import Security

/// Everything HuskyHealth needs from HealthKit, with no React Native in it, so the
/// background observer (HuskyHealthKitAppDelegate) can sync when iOS wakes the app
/// after a workout, even if JavaScript never starts.
///
/// Privacy rules this file keeps:
/// - Reads only workouts, heart rate, resting HR, HRV, VO2 max and effort scores.
///   Never routes, ECGs or clinical records.
/// - The only thing that leaves the phone is the convenience-mode drop, sent to the
///   relay the user paired with, which encrypts it to a key held by the user's phone
///   and keeps only ciphertext, in memory, until it is collected (max 24 h).
/// - History stays on the phone, in a file iOS encrypts while the phone is locked.
enum HealthCore {
  static let store = HKHealthStore()

  // MARK: - Types

  static let quantityIds: [String: HKQuantityTypeIdentifier] = {
    var ids: [String: HKQuantityTypeIdentifier] = [
      "hr": .heartRate, "rhr": .restingHeartRate, "hrv": .heartRateVariabilitySDNN, "vo2": .vo2Max,
    ]
    if #available(iOS 18.0, *) {
      ids["effort"] = .workoutEffortScore
      ids["effortEst"] = .estimatedWorkoutEffortScore
    }
    return ids
  }()

  static let units: [String: HKUnit] = {
    let bpm = HKUnit.count().unitDivided(by: .minute())
    var u: [String: HKUnit] = [
      "hr": bpm, "rhr": bpm, "hrv": .secondUnit(with: .milli),
      "vo2": HKUnit(from: "ml/kg*min"),
    ]
    if #available(iOS 18.0, *) {
      u["effort"] = .appleEffortScore()
      u["effortEst"] = .appleEffortScore()
    }
    return u
  }()

  static var readTypes: Set<HKObjectType> {
    var s: Set<HKObjectType> = [HKObjectType.workoutType()]
    for id in quantityIds.values { s.insert(HKQuantityType(id)) }
    return s
  }

  /// Write access exists only so the simulator demo can add a sample workout.
  static var shareTypes: Set<HKSampleType> {
    [HKObjectType.workoutType(), HKQuantityType(.heartRate), HKQuantityType(.activeEnergyBurned)]
  }

  static func requestAuthorization() async throws -> Bool {
    guard HKHealthStore.isHealthDataAvailable() else { return false }
    try await store.requestAuthorization(toShare: shareTypes, read: readTypes)
    return true
  }

  // MARK: - Sports

  /// The relay's sport names (relay/dropbox.py SyncSport) and the HK type names features.js reads.
  static func sport(_ t: HKWorkoutActivityType) -> String {
    switch t {
    case .squash: return "squash"
    case .running: return "running"
    case .walking, .hiking: return "walking"
    case .cycling: return "cycling"
    case .traditionalStrengthTraining, .functionalStrengthTraining: return "strength"
    case .highIntensityIntervalTraining: return "hiit"
    default: return "other"
    }
  }

  static let hkName: [String: String] = [
    "squash": "HKWorkoutActivityTypeSquash", "running": "HKWorkoutActivityTypeRunning",
    "walking": "HKWorkoutActivityTypeWalking", "cycling": "HKWorkoutActivityTypeCycling",
    "strength": "HKWorkoutActivityTypeTraditionalStrengthTraining",
    "hiit": "HKWorkoutActivityTypeHighIntensityIntervalTraining", "other": "HKWorkoutActivityTypeOther",
  ]

  static func ms(_ d: Date) -> Double { (d.timeIntervalSince1970 * 1000).rounded() }

  static func fromWatch(_ s: HKSample) -> Bool {
    (s.sourceRevision.productType ?? "").contains("Watch") || (s.device?.model ?? "").contains("Watch")
  }

  // MARK: - Queries

  static func workouts(since start: Date, until end: Date = Date()) async throws -> [HKWorkout] {
    let pred = HKQuery.predicateForSamples(withStart: start, end: end, options: .strictStartDate)
    let d = HKSampleQueryDescriptor(predicates: [.workout(pred)], sortDescriptors: [SortDescriptor(\.startDate)])
    return try await d.result(for: store)
  }

  static func quantity(_ kind: String, from start: Date, to end: Date) async throws -> [[Double]] {
    guard let id = quantityIds[kind], let unit = units[kind] else { return [] }
    let pred = HKQuery.predicateForSamples(withStart: start, end: end, options: [])
    let d = HKSampleQueryDescriptor(predicates: [.quantitySample(type: HKQuantityType(id), predicate: pred)],
                                    sortDescriptors: [SortDescriptor(\.startDate)])
    let samples = try await d.result(for: store)
    return samples.map { [ms($0.startDate), $0.quantity.doubleValue(for: unit)] }
  }

  static func kcal(_ w: HKWorkout) -> Double? {
    w.statistics(for: HKQuantityType(.activeEnergyBurned))?.sumQuantity()?.doubleValue(for: .kilocalorie())
  }

  /// Workouts for the app's own on-phone scoring, in the shape features.js expects.
  static func workoutList(days: Int) async throws -> [[String: Any]] {
    let start = Calendar.current.date(byAdding: .day, value: -days, to: Date()) ?? Date()
    return try await workouts(since: start).map { w in
      let sp = sport(w.workoutActivityType)
      return [
        "type": hkName[sp] ?? "HKWorkoutActivityTypeOther", "sport": sp,
        "start": ms(w.startDate), "end": ms(w.endDate), "min": w.duration / 60,
        "kcal": kcal(w).map { $0 as Any } ?? NSNull(), "device": fromWatch(w) ? "Apple Watch" : "", "sourceName": "",
      ]
    }
  }

  // MARK: - Convenience-mode drop (the "phone posts to a web API" path)

  private static let iso: ISO8601DateFormatter = {
    let f = ISO8601DateFormatter()
    f.formatOptions = [.withInternetDateTime]
    return f
  }()

  /// Payload matching relay/dropbox.py SyncDrop: explicit workout windows with the real sport,
  /// and the heart rate inside each as parallel ISO-time / bpm lists. No names, places or devices.
  static func dropPayload(since: Date, now: Date = Date()) async throws -> (body: Data, newest: Date?, count: Int) {
    let floor = max(since, now.addingTimeInterval(-3 * 86400 + 60))
    let ws = try await workouts(since: floor, until: now).filter { $0.endDate <= now }
    var items: [[String: Any]] = []
    for w in ws.suffix(20) {
      var hr = try await quantity("hr", from: w.startDate, to: w.endDate)
      if hr.count > 4000 { let step = Int((Double(hr.count) / 4000).rounded(.up)); hr = stride(from: 0, to: hr.count, by: step).map { hr[$0] } }
      items.append([
        "sport": sport(w.workoutActivityType),
        "start_s": Int(now.timeIntervalSince(w.startDate)), "end_s": Int(now.timeIntervalSince(w.endDate)),
        "kcal": kcal(w).map { min(max($0, 0), 10000) as Any } ?? NSNull(),
        "src": fromWatch(w) ? "watch" : "other",
        "hr_t": hr.map { iso.string(from: Date(timeIntervalSince1970: $0[0] / 1000)) },
        "hr_v": hr.map { min(max($0[1], 20), 300) },
      ])
    }
    let effort = try await quantity("effort", from: floor, to: now).map { ["t_s": Int(now.timeIntervalSince1970 - $0[0] / 1000), "v": $0[1]] }
    let body: [String: Any] = ["v": 1, "workouts": items, "rhr": [Any](), "hrv": [Any](), "effort": Array(effort.suffix(50))]
    // JSONSerialization raises an Objective-C exception (a crash) on non-JSON values; check first so it throws instead.
    guard JSONSerialization.isValidJSONObject(body) else { throw NSError(domain: "HuskyHealth", code: 1) }
    return (try JSONSerialization.data(withJSONObject: body), ws.last?.endDate, items.count)
  }

  /// POST new workouts to the paired box. Returns the HTTP status (0 = nothing to send / not paired).
  @discardableResult
  static func syncNow() async -> [String: Any] {
    guard let cfg = SyncConfig.load() else { return ["status": 0, "workouts": 0, "reason": "not paired"] }
    do {
      let since = SyncConfig.lastEnd ?? Date().addingTimeInterval(-86400)
      let (body, newest, count) = try await dropPayload(since: since.addingTimeInterval(1))
      if count == 0 { return ["status": 0, "workouts": 0, "reason": "no new workouts"] }
      var req = URLRequest(url: cfg.relay.appendingPathComponent("v1/drop/\(cfg.box)"))
      req.httpMethod = "POST"
      req.setValue("application/json", forHTTPHeaderField: "Content-Type")
      req.setValue("Bearer \(cfg.write)", forHTTPHeaderField: "Authorization")
      req.httpBody = body
      req.timeoutInterval = 20
      let (_, resp) = try await URLSession.shared.data(for: req)
      let status = (resp as? HTTPURLResponse)?.statusCode ?? 0
      if status == 204, let newest { SyncConfig.lastEnd = newest }
      return ["status": status, "workouts": count]
    } catch {
      return ["status": -1, "workouts": 0, "reason": "could not reach the relay"]
    }
  }

  // MARK: - Background delivery: HealthKit wakes the app when a workout is saved

  private static var observer: HKObserverQuery?

  static func startBackgroundSync() async -> Bool {
    guard SyncConfig.load() != nil, HKHealthStore.isHealthDataAvailable() else { return false }
    if observer == nil {
      let q = HKObserverQuery(sampleType: HKObjectType.workoutType(), predicate: nil) { _, completion, error in
        guard error == nil else { completion(); return }
        Task { await syncNow(); completion() }
      }
      store.execute(q)
      observer = q
    }
    do {
      try await store.enableBackgroundDelivery(for: HKObjectType.workoutType(), frequency: .immediate)
      return true
    } catch { return false }
  }

  static func stopBackgroundSync() async {
    if let q = observer { store.stop(q); observer = nil }
    try? await store.disableAllBackgroundDelivery()
  }

  // MARK: - Simulator demo: add a sample workout with workout-rate heart rate

  static func seedDemoWorkout(sport name: String, minutes: Int, endedMinutesAgo: Int) async throws -> Bool {
    let type: HKWorkoutActivityType = ["squash": .squash, "running": .running, "walking": .walking,
                                       "cycling": .cycling, "strength": .traditionalStrengthTraining][name] ?? .squash
    let end = Date().addingTimeInterval(-Double(endedMinutesAgo * 60))
    let start = end.addingTimeInterval(-Double(minutes * 60))
    let config = HKWorkoutConfiguration()
    config.activityType = type
    let builder = HKWorkoutBuilder(healthStore: store, configuration: config, device: .local())
    try await builder.beginCollection(at: start)
    let bpm = HKUnit.count().unitDivided(by: .minute())
    var samples: [HKSample] = []
    var t = start
    var i = 0
    while t < end {
      let wave = 135 + 25 * sin(Double(i) / 18) + Double((i * 7) % 11)
      samples.append(HKQuantitySample(type: HKQuantityType(.heartRate), quantity: HKQuantity(unit: bpm, doubleValue: wave), start: t, end: t))
      t = t.addingTimeInterval(5)
      i += 1
    }
    samples.append(HKQuantitySample(type: HKQuantityType(.activeEnergyBurned),
                                    quantity: HKQuantity(unit: .kilocalorie(), doubleValue: Double(minutes) * 9), start: start, end: end))
    try await builder.addSamples(samples)
    try await builder.endCollection(at: end)
    return try await builder.finishWorkout() != nil
  }

  // MARK: - On-phone history (reports and debriefs never leave the phone)

  static var historyURL: URL {
    FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
      .appendingPathComponent("history.jsonl")
  }

  static func historyAppend(_ line: String) throws {
    let url = historyURL
    try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
    if !FileManager.default.fileExists(atPath: url.path) {
      FileManager.default.createFile(atPath: url.path, contents: nil, attributes: [.protectionKey: FileProtectionType.complete])
    }
    let h = try FileHandle(forWritingTo: url)
    defer { try? h.close() }
    try h.seekToEnd()
    try h.write(contentsOf: Data((line.replacingOccurrences(of: "\n", with: " ") + "\n").utf8))
  }

  static func historyList() -> [String] {
    guard let s = try? String(contentsOf: historyURL, encoding: .utf8) else { return [] }
    return s.split(separator: "\n").map(String.init)
  }

  static func historyClear() { try? FileManager.default.removeItem(at: historyURL) }
}

/// Pairing for convenience mode. The write secret lives in the Keychain; box id and relay in UserDefaults.
struct SyncConfig {
  let relay: URL
  let box: String
  let write: String

  private static let defaults = UserDefaults.standard
  private static let service = "dev.huskyhealth.companion.sync"

  static func save(relay: String, box: String, write: String) -> Bool {
    guard let url = URL(string: relay), url.scheme == "https", !box.isEmpty, !write.isEmpty else { return false }
    defaults.set(url.absoluteString, forKey: "hh.relay")
    defaults.set(box, forKey: "hh.box")
    let base: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service,
                               kSecAttrAccount as String: "write"]
    SecItemDelete(base as CFDictionary)
    var add = base
    add[kSecValueData as String] = Data(write.utf8)
    add[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
    return SecItemAdd(add as CFDictionary, nil) == errSecSuccess
  }

  static func load() -> SyncConfig? {
    guard let r = defaults.string(forKey: "hh.relay"), let url = URL(string: r), let box = defaults.string(forKey: "hh.box") else { return nil }
    let q: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service,
                            kSecAttrAccount as String: "write", kSecReturnData as String: true]
    var out: AnyObject?
    guard SecItemCopyMatching(q as CFDictionary, &out) == errSecSuccess, let d = out as? Data,
          let write = String(data: d, encoding: .utf8) else { return nil }
    return SyncConfig(relay: url, box: box, write: write)
  }

  static func clear() {
    defaults.removeObject(forKey: "hh.relay")
    defaults.removeObject(forKey: "hh.box")
    defaults.removeObject(forKey: "hh.lastEnd")
    SecItemDelete([kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service] as CFDictionary)
  }

  static var lastEnd: Date? {
    get { defaults.object(forKey: "hh.lastEnd") as? Date }
    set { defaults.set(newValue, forKey: "hh.lastEnd") }
  }
}
