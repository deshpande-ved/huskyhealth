import CommonCrypto
import CryptoKit
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
/// - The only thing that leaves the phone is a record POSTed to your own personal API (/v1/me/records), sent to the
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

  /// Garmin Connect writes workouts into Apple Health; so may Whoop, Oura, Polar. The relay accepts watch / garmin / other.
  static func fromGarmin(_ s: HKSample) -> Bool {
    let src = s.sourceRevision.source
    return src.bundleIdentifier.lowercased().contains("garmin") || src.name.lowercased().contains("garmin")
  }

  static func srcTag(_ s: HKSample) -> String { fromWatch(s) ? "watch" : fromGarmin(s) ? "garmin" : "other" }

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
        "kcal": kcal(w).map { $0 as Any } ?? NSNull(), "device": fromWatch(w) ? "Apple Watch" : "", "sourceName": fromGarmin(w) ? "Garmin" : "",   // a category, never the device's own name
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
  /// One record: workouts (heart rate capped at `hrCap` readings each), their Watch effort scores, and optionally
  /// daily resting HR and HRV over `daily`. Times are seconds before `now`; heart rate uses ISO times.
  static func recordBody(workouts ws: [HKWorkout], daily: (from: Date, to: Date)?, now: Date, hrCap: Int = 1500) async throws -> Data {
    let tS = { (x: [Double]) -> [String: Any] in ["t_s": max(0, Int(now.timeIntervalSince1970 - x[0] / 1000)), "v": x[1]] }
    var items: [[String: Any]] = []
    var effort: [[String: Any]] = []
    for w in ws {
      var hr = try await quantity("hr", from: w.startDate, to: w.endDate)
      if hr.count > hrCap { let step = Int((Double(hr.count) / Double(hrCap)).rounded(.up)); hr = stride(from: 0, to: hr.count, by: step).map { hr[$0] } }
      items.append([
        "sport": sport(w.workoutActivityType),
        "start_s": Int(now.timeIntervalSince(w.startDate)), "end_s": Int(now.timeIntervalSince(w.endDate)),
        "kcal": kcal(w).map { min(max($0, 0), 10000) as Any } ?? NSNull(),
        "src": srcTag(w),
        "hr_t": hr.map { iso.string(from: Date(timeIntervalSince1970: $0[0] / 1000)) },
        "hr_v": hr.map { min(max($0[1], 20), 300) },
      ])
      effort += try await quantity("effort", from: w.startDate, to: w.endDate.addingTimeInterval(3600)).map(tS)
    }
    var rhr: [[String: Any]] = [], hrv: [[String: Any]] = []
    if let d = daily {
      rhr = Array(try await quantity("rhr", from: d.from, to: d.to).suffix(120)).map(tS)
      hrv = Array(try await quantity("hrv", from: d.from, to: d.to).suffix(400)).map(tS)
    }
    let body: [String: Any] = ["v": 1, "workouts": items, "rhr": rhr, "hrv": hrv, "effort": Array(effort.suffix(50))]
    // JSONSerialization raises an Objective-C exception (a crash) on non-JSON values; check first so it throws instead.
    guard JSONSerialization.isValidJSONObject(body) else { throw NSError(domain: "HuskyHealth", code: 1) }
    return try JSONSerialization.data(withJSONObject: body)
  }

  static func dropPayload(since: Date, now: Date = Date()) async throws -> (body: Data, newest: Date?, count: Int) {
    let floor = max(since, now.addingTimeInterval(-3 * 86400 + 60))
    let ws = Array(try await workouts(since: floor, until: now).filter { $0.endDate <= now }.suffix(20))
    return (try await recordBody(workouts: ws, daily: (floor, now), now: now), ws.last?.endDate, ws.count)
  }

  /// POST one record. On 429 the relay says how long to wait (Retry-After); wait (at most 60 s) and try once more.
  private static func post(_ cfg: SyncConfig, _ body: Data) async -> Int {
    var req = URLRequest(url: cfg.relay.appendingPathComponent("v1/me/records"))
    req.httpMethod = "POST"
    req.setValue("application/json", forHTTPHeaderField: "Content-Type")
    req.setValue("Bearer \(cfg.token)", forHTTPHeaderField: "Authorization")
    req.httpBody = body
    req.timeoutInterval = 30
    for attempt in 0..<2 {
      guard let (_, resp) = try? await URLSession.shared.data(for: req), let http = resp as? HTTPURLResponse else { return -1 }
      guard http.statusCode == 429, attempt == 0 else { return http.statusCode }
      let wait = min(Double(http.value(forHTTPHeaderField: "Retry-After") ?? "") ?? 10, 60)
      try? await Task.sleep(nanoseconds: UInt64(wait * 1_000_000_000))
    }
    return 429
  }

  /// POST new workouts to your personal API. Returns the HTTP status (0 = nothing to send / not logged in).
  @discardableResult
  static func syncNow() async -> [String: Any] {
    guard let cfg = SyncConfig.load() else { return ["status": 0, "workouts": 0, "reason": "not logged in"] }
    do {
      let since = SyncConfig.lastEnd ?? Date().addingTimeInterval(-86400)
      let (body, newest, count) = try await dropPayload(since: since.addingTimeInterval(1))
      if count == 0 { return ["status": 0, "workouts": 0, "reason": "no new workouts"] }
      let status = await post(cfg, body)
      if status == 201, let newest { SyncConfig.lastEnd = newest }
      return ["status": status, "workouts": count]
    } catch {
      return ["status": -1, "workouts": 0, "reason": "could not read Health"]
    }
  }

  /// First login: send the last `days` days so a new account has its history without an export.
  /// One record per workout keeps each under the relay's 128 KB cap; then one record of daily resting HR and HRV.
  static func backfill(days: Int = 60) async -> [String: Any] {
    guard let cfg = SyncConfig.load() else { return ["status": 0, "workouts": 0, "total": 0] }
    let now = Date()
    let floor = now.addingTimeInterval(-Double(days) * 86400 + 3600)
    do {
      let ws = try await workouts(since: floor, until: now).filter { $0.endDate <= now }
      var sent = 0, last = 0
      for w in ws {
        last = await post(cfg, try await recordBody(workouts: [w], daily: nil, now: now, hrCap: 900))
        if last == 201 { sent += 1 } else if last == 401 || last == 409 { break }
      }
      let dailyStatus = await post(cfg, try await recordBody(workouts: [], daily: (floor, now), now: now))
      if sent == ws.count, let end = ws.last?.endDate { SyncConfig.lastEnd = end }
      return ["status": ws.isEmpty ? dailyStatus : last, "workouts": sent, "total": ws.count, "daily": dailyStatus]
    } catch {
      return ["status": -1, "workouts": 0, "total": 0]
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
  let token: String           // device write token: can add records to your account, never read them

  private static let defaults = UserDefaults.standard
  private static let service = "dev.huskyhealth.companion.sync"

  static func save(relay: String, token: String) -> Bool {
    guard let url = URL(string: relay), url.scheme == "https", token.hasPrefix("hhw_") else { return false }
    defaults.set(url.absoluteString, forKey: "hh.relay")
    let base: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service,
                               kSecAttrAccount as String: "token"]
    SecItemDelete(base as CFDictionary)
    var add = base
    add[kSecValueData as String] = Data(token.utf8)
    add[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
    return SecItemAdd(add as CFDictionary, nil) == errSecSuccess
  }

  static func load() -> SyncConfig? {
    guard let r = defaults.string(forKey: "hh.relay"), let url = URL(string: r) else { return nil }
    let q: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service,
                            kSecAttrAccount as String: "token", kSecReturnData as String: true]
    var out: AnyObject?
    guard SecItemCopyMatching(q as CFDictionary, &out) == errSecSuccess, let d = out as? Data,
          let token = String(data: d, encoding: .utf8) else { return nil }
    return SyncConfig(relay: url, token: token)
  }

  static func clear() {
    defaults.removeObject(forKey: "hh.relay")
    defaults.removeObject(forKey: "hh.lastEnd")
    defaults.removeObject(forKey: "hh.user")
    SecItemDelete([kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service] as CFDictionary)
  }

  static var lastEnd: Date? {
    get { defaults.object(forKey: "hh.lastEnd") as? Date }
    set { defaults.set(newValue, forKey: "hh.lastEnd") }
  }

  static var user: String? {
    get { defaults.string(forKey: "hh.user") }
    set { defaults.set(newValue, forKey: "hh.user") }
  }
}

/// Account login, same derivation as the website (web/js/account.js), so the password never leaves this phone:
///   id   = SHA-256("huskyhealth:" + username)
///   auth = bytes 32..<64 of PBKDF2-HMAC-SHA256(password, "huskyhealth-v1:" + username, 600 000, 64)
/// The first 32 bytes (the vault key) are thrown away: this phone only ever needs a write token.
enum Account {
  static func derive(username: String, password: String) -> (id: String, auth: String)? {
    let u = username.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    guard !u.isEmpty, !password.isEmpty else { return nil }
    let id = SHA256.hash(data: Data("huskyhealth:\(u)".utf8)).map { String(format: "%02x", $0) }.joined()
    let salt = Array("huskyhealth-v1:\(u)".utf8)
    var out = [UInt8](repeating: 0, count: 64)
    let rc = CCKeyDerivationPBKDF(CCPBKDFAlgorithm(kCCPBKDF2), password, password.utf8.count, salt, salt.count,
                                  CCPseudoRandomAlgorithm(kCCPRFHmacAlgSHA256), 600_000, &out, out.count)
    guard rc == kCCSuccess else { return nil }
    let auth = Data(out[32..<64]).base64EncodedString()
    for i in out.indices { out[i] = 0 }
    return (id, auth)
  }

  private static func post(_ url: URL, _ body: [String: Any], bearer: String? = nil) async -> (Int, [String: Any]) {
    var req = URLRequest(url: url)
    req.httpMethod = "POST"
    req.setValue("application/json", forHTTPHeaderField: "Content-Type")
    if let bearer { req.setValue("Bearer \(bearer)", forHTTPHeaderField: "Authorization") }
    req.httpBody = try? JSONSerialization.data(withJSONObject: body)
    req.timeoutInterval = 20
    guard let (data, resp) = try? await URLSession.shared.data(for: req) else { return (0, [:]) }
    return ((resp as? HTTPURLResponse)?.statusCode ?? 0, (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] ?? [:])
  }

  /// Log in, make this phone's own write token, keep it in the Keychain. Returns an HTTP-ish status (200 = ok).
  static func login(relay: String, username: String, password: String) async -> Int {
    guard let base = URL(string: relay), let k = derive(username: username, password: password) else { return 422 }
    let (s1, open) = await post(base.appendingPathComponent("v1/account/open"), ["id": k.id, "auth": k.auth])
    guard s1 == 200, let session = open["session"] as? String else { return s1 }
    let (s2, tok) = await post(base.appendingPathComponent("v1/account/tokens"), ["scope": "write", "days": 365], bearer: session)
    guard s2 == 201, let token = tok["token"] as? String, SyncConfig.save(relay: relay, token: token) else { return s2 == 201 ? 500 : s2 }
    SyncConfig.user = username.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    SyncConfig.lastEnd = nil
    return 200
  }
}
