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
        CAPPluginMethod(name: "saveWorkout", returnType: CAPPluginReturnPromise)
    ]

    private let healthStore = HKHealthStore()
    private var bodyMassType: HKQuantityType? { HKQuantityType.quantityType(forIdentifier: .bodyMass) }

    @objc func isAvailable(_ call: CAPPluginCall) {
        call.resolve(["available": HKHealthStore.isHealthDataAvailable()])
    }

    @objc func getAuthorizationStatus(_ call: CAPPluginCall) {
        authorizationStatus { status in call.resolve(["requestStatus": status]) }
    }

    @objc func requestAuthorization(_ call: CAPPluginCall) {
        guard HKHealthStore.isHealthDataAvailable(), let bodyMassType else {
            call.resolve(["requestStatus": "unavailable"])
            return
        }
        healthStore.requestAuthorization(toShare: [HKObjectType.workoutType()], read: [bodyMassType]) { [weak self] _, _ in
            self?.authorizationStatus { status in call.resolve(["requestStatus": status]) }
        }
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

    private func authorizationStatus(_ completion: @escaping (String) -> Void) {
        guard HKHealthStore.isHealthDataAvailable(), let bodyMassType else {
            completion("unavailable")
            return
        }
        healthStore.getRequestStatusForAuthorization(toShare: [HKObjectType.workoutType()], read: [bodyMassType]) { status, _ in
            switch status {
            case .shouldRequest: completion("shouldRequest")
            case .unnecessary: completion("unnecessary")
            case .unknown: fallthrough
            @unknown default: completion("unknown")
            }
        }
    }
}
