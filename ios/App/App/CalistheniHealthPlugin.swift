import Capacitor
import HealthKit

@objc(CalistheniHealthPlugin)
public class CalistheniHealthPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "CalistheniHealthPlugin"
    public let jsName = "CalistheniHealth"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isAvailable", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestAuthorization", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getAuthorizationStatus", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getLatestBodyWeight", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getLatestProfileMeasurements", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "saveBodyMeasurements", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "saveWorkout", returnType: CAPPluginReturnPromise)
    ]

    private let healthStore = HKHealthStore()
    private var bodyMassType: HKQuantityType? { HKQuantityType.quantityType(forIdentifier: .bodyMass) }

    private func readTypes(includePro: Bool) -> Set<HKObjectType> {
        var types = Set([
            HKQuantityType.quantityType(forIdentifier: .bodyMass),
            HKQuantityType.quantityType(forIdentifier: .waistCircumference),
            HKObjectType.characteristicType(forIdentifier: .dateOfBirth)
        ].compactMap { $0 })
        if includePro {
            types.formUnion([
                HKQuantityType.quantityType(forIdentifier: .height),
                HKQuantityType.quantityType(forIdentifier: .bodyFatPercentage),
                HKObjectType.characteristicType(forIdentifier: .biologicalSex)
            ].compactMap { $0 })
        }
        return types
    }

    private func shareTypes(includePro: Bool) -> Set<HKSampleType> {
        var types = Set([
            HKObjectType.workoutType(),
            HKQuantityType.quantityType(forIdentifier: .bodyMass),
            HKQuantityType.quantityType(forIdentifier: .waistCircumference)
        ].compactMap { $0 })
        if includePro {
            types.formUnion([
                HKQuantityType.quantityType(forIdentifier: .bodyFatPercentage),
                HKQuantityType.quantityType(forIdentifier: .height)
            ].compactMap { $0 })
        }
        return types
    }

    @objc func isAvailable(_ call: CAPPluginCall) {
        call.resolve(["available": HKHealthStore.isHealthDataAvailable()])
    }

    @objc func getAuthorizationStatus(_ call: CAPPluginCall) {
        authorizationStatus(includePro: call.getBool("includePro") ?? false) { status in call.resolve(["requestStatus": status]) }
    }

    @objc func requestAuthorization(_ call: CAPPluginCall) {
        guard HKHealthStore.isHealthDataAvailable() else {
            call.resolve(["requestStatus": "unavailable"])
            return
        }
        let includePro = call.getBool("includePro") ?? false
        healthStore.requestAuthorization(toShare: shareTypes(includePro: includePro), read: readTypes(includePro: includePro)) { [weak self] _, _ in
            self?.authorizationStatus(includePro: includePro) { status in call.resolve(["requestStatus": status]) }
        }
    }

    @objc func getLatestProfileMeasurements(_ call: CAPPluginCall) {
        guard HKHealthStore.isHealthDataAvailable() else { call.resolve(emptyMeasurements()); return }
        let includePro = call.getBool("includePro") ?? false
        let group = DispatchGroup()
        var result = emptyMeasurements()
        let queue = DispatchQueue(label: "app.calistheni.health.measurements")

        func latest(_ identifier: HKQuantityTypeIdentifier, unit: HKUnit, map: @escaping (Double) -> Double, key: String) {
            guard let type = HKQuantityType.quantityType(forIdentifier: identifier) else { return }
            group.enter()
            healthStore.execute(HKSampleQuery(sampleType: type, predicate: nil, limit: 1, sortDescriptors: [NSSortDescriptor(key: HKSampleSortIdentifierEndDate, ascending: false)]) { _, samples, _ in
                if let sample = samples?.first as? HKQuantitySample {
                    queue.sync {
                        result[key] = map(sample.quantity.doubleValue(for: unit))
                        var dates = result["sampledAtMs"] as? [String: Double] ?? [:]
                        dates[key] = sample.endDate.timeIntervalSince1970 * 1000
                        result["sampledAtMs"] = dates
                    }
                }
                group.leave()
            })
        }

        latest(.bodyMass, unit: HKUnit.gramUnit(with: .kilo), map: { $0 }, key: "bodyweightKg")
        latest(.waistCircumference, unit: .meter(), map: { $0 * 100 }, key: "waistAtNavelCm")
        if includePro {
            latest(.height, unit: .meter(), map: { $0 * 100 }, key: "heightCm")
            latest(.bodyFatPercentage, unit: .percent(), map: { $0 * 100 }, key: "manualBodyFatPercent")
        }
        group.enter()
        DispatchQueue.global().async { [weak self] in
            if let components = try? self?.healthStore.dateOfBirthComponents(),
               let date = Calendar(identifier: .gregorian).date(from: components) {
                queue.sync { result["dateOfBirth"] = ISO8601DateFormatter().string(from: date).prefix(10).description }
            }
            group.leave()
        }
        if includePro {
            group.enter()
            DispatchQueue.global().async { [weak self] in
                if let sex = try? self?.healthStore.biologicalSex().biologicalSex {
                    let value = sex == .male ? "MALE" : sex == .female ? "FEMALE" : nil
                    if let value { queue.sync { result["bodyFatSex"] = value } }
                }
                group.leave()
            }
        }
        group.notify(queue: .main) { call.resolve(result) }
    }

    @objc func getLatestBodyWeight(_ call: CAPPluginCall) {
        guard HKHealthStore.isHealthDataAvailable(), let bodyMassType else {
            call.resolve(["weightKg": NSNull(), "sampledAtMs": NSNull()])
            return
        }
        let query = HKSampleQuery(
            sampleType: bodyMassType,
            predicate: nil,
            limit: 1,
            sortDescriptors: [NSSortDescriptor(key: HKSampleSortIdentifierEndDate, ascending: false)]
        ) { _, samples, _ in
            guard let sample = samples?.first as? HKQuantitySample else {
                call.resolve(["weightKg": NSNull(), "sampledAtMs": NSNull()])
                return
            }
            call.resolve([
                "weightKg": sample.quantity.doubleValue(for: HKUnit.gramUnit(with: .kilo)),
                "sampledAtMs": sample.endDate.timeIntervalSince1970 * 1000
            ])
        }
        healthStore.execute(query)
    }

    @objc func saveBodyMeasurements(_ call: CAPPluginCall) {
        guard HKHealthStore.isHealthDataAvailable(), let values = call.getArray("measurements", [Any].self) else {
            call.resolve(["savedIds": [], "duplicateIds": [], "failedIds": []])
            return
        }
        let group = DispatchGroup()
        let lock = NSLock()
        var savedIds: [String] = []
        var duplicateIds: [String] = []
        var failedIds: [String] = []

        for case let measurement as [String: Any] in values {
            guard let measurementId = measurement["measurementId"] as? String,
                  let kind = measurement["kind"] as? String,
                  let canonicalValue = measurement["canonicalValue"] as? Double,
                  let measuredAtMs = measurement["measuredAtMs"] as? Double,
                  let mapping = bodyMeasurementMapping(kind: kind) else {
                continue
            }
            let externalId = "calistheni-body-measurement-\(measurementId)-\(kind)"
            group.enter()
            let predicate = HKQuery.predicateForObjects(withMetadataKey: HKMetadataKeyExternalUUID, allowedValues: [externalId])
            healthStore.execute(HKSampleQuery(sampleType: mapping.type, predicate: predicate, limit: 1, sortDescriptors: nil) { [weak self] _, samples, _ in
                if !(samples?.isEmpty ?? true) {
                    lock.lock(); duplicateIds.append("\(measurementId):\(kind)"); lock.unlock(); group.leave(); return
                }
                let sample = HKQuantitySample(type: mapping.type, quantity: HKQuantity(unit: mapping.unit, doubleValue: canonicalValue * mapping.multiplier), start: Date(timeIntervalSince1970: measuredAtMs / 1000), end: Date(timeIntervalSince1970: measuredAtMs / 1000), metadata: [HKMetadataKeyExternalUUID: externalId])
                self?.healthStore.save(sample) { success, _ in
                    lock.lock()
                    if success { savedIds.append("\(measurementId):\(kind)") } else { failedIds.append("\(measurementId):\(kind)") }
                    lock.unlock()
                    group.leave()
                }
            })
        }
        group.notify(queue: .main) { call.resolve(["savedIds": savedIds, "duplicateIds": duplicateIds, "failedIds": failedIds]) }
    }

    @objc func saveWorkout(_ call: CAPPluginCall) {
        guard HKHealthStore.isHealthDataAvailable(),
              let workoutId = call.getString("workoutId"),
              let startedAtMs = call.getDouble("startedAtMs"),
              let endedAtMs = call.getDouble("endedAtMs") else {
            call.resolve(["saved": false, "duplicate": false])
            return
        }
        let start = Date(timeIntervalSince1970: startedAtMs / 1000)
        let end = Date(timeIntervalSince1970: max(startedAtMs, endedAtMs) / 1000)
        let externalId = "calistheni-workout-\(workoutId)"
        let duplicatePredicate = HKQuery.predicateForObjects(withMetadataKey: HKMetadataKeyExternalUUID, allowedValues: [externalId])
        let duplicateQuery = HKSampleQuery(
            sampleType: HKObjectType.workoutType(), predicate: duplicatePredicate, limit: 1, sortDescriptors: nil
        ) { [weak self] _, samples, _ in
            if !(samples?.isEmpty ?? true) {
                call.resolve(["saved": true, "duplicate": true])
                return
            }
            let distance = call.getDouble("distanceMeters").flatMap { $0 > 0 ? HKQuantity(unit: .meter(), doubleValue: $0) : nil }
            let workout = HKWorkout(
                activityType: .traditionalStrengthTraining,
                start: start,
                end: end,
                duration: end.timeIntervalSince(start),
                totalEnergyBurned: nil,
                totalDistance: distance,
                metadata: [HKMetadataKeyExternalUUID: externalId]
            )
            self?.healthStore.save(workout) { success, _ in
                call.resolve(["saved": success, "duplicate": false])
            }
        }
        healthStore.execute(duplicateQuery)
    }

    private func authorizationStatus(includePro: Bool, _ completion: @escaping (String) -> Void) {
        guard HKHealthStore.isHealthDataAvailable() else {
            completion("unavailable")
            return
        }
        healthStore.getRequestStatusForAuthorization(toShare: self.shareTypes(includePro: includePro), read: self.readTypes(includePro: includePro)) { status, _ in
            switch status {
            case .shouldRequest: completion("shouldRequest")
            case .unnecessary: completion("unnecessary")
            case .unknown: fallthrough
            @unknown default: completion("unknown")
            }
        }
    }

    private func bodyMeasurementMapping(kind: String) -> (type: HKQuantityType, unit: HKUnit, multiplier: Double)? {
        switch kind {
        case "BODY_WEIGHT": return HKQuantityType.quantityType(forIdentifier: .bodyMass).map { ($0, HKUnit.gramUnit(with: .kilo), 1) }
        case "BODY_FAT": return HKQuantityType.quantityType(forIdentifier: .bodyFatPercentage).map { ($0, .percent(), 0.01) }
        case "WAIST": return HKQuantityType.quantityType(forIdentifier: .waistCircumference).map { ($0, .meter(), 0.01) }
        case "HEIGHT": return HKQuantityType.quantityType(forIdentifier: .height).map { ($0, .meter(), 0.01) }
        default: return nil
        }
    }

    private func emptyMeasurements() -> [String: Any] {
        ["bodyweightKg": NSNull(), "waistAtNavelCm": NSNull(), "heightCm": NSNull(), "manualBodyFatPercent": NSNull(), "dateOfBirth": NSNull(), "bodyFatSex": NSNull(), "sampledAtMs": [:]]
    }
}
