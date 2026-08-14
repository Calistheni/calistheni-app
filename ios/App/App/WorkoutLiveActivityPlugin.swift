import Capacitor

#if canImport(ActivityKit)
import ActivityKit

@available(iOS 16.1, *)
struct WorkoutActivityAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        var exerciseName: String
        var setLabel: String
        var displayPerformance: String
        var completedSets: Int
        var totalSets: Int
        var isResting: Bool
        var restEndsAt: Date?
    }

    var workoutId: String
    var workoutStartedAt: Date
}
#endif

@objc(WorkoutLiveActivityPlugin)
public class WorkoutLiveActivityPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "WorkoutLiveActivityPlugin"
    public let jsName = "WorkoutLiveActivity"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isSupported", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "update", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "end", returnType: CAPPluginReturnPromise)
    ]

    @objc func isSupported(_ call: CAPPluginCall) {
        guard #available(iOS 16.1, *) else { call.resolve(["supported": false, "enabled": false]); return }
        call.resolve(["supported": true, "enabled": ActivityAuthorizationInfo().areActivitiesEnabled])
    }

    @objc func start(_ call: CAPPluginCall) {
        guard #available(iOS 16.1, *) else { call.resolve(["started": false]); return }
        guard ActivityAuthorizationInfo().areActivitiesEnabled, let payload = payload(from: call) else { call.resolve(["started": false]); return }
        Task {
            do {
                if let activity = Activity<WorkoutActivityAttributes>.activities.first(where: { $0.attributes.workoutId == payload.workoutId }) {
                    try await activity.update(using: payload.contentState)
                } else {
                    _ = try Activity.request(attributes: WorkoutActivityAttributes(workoutId: payload.workoutId, workoutStartedAt: payload.workoutStartedAt), contentState: payload.contentState, pushType: nil)
                }
                call.resolve(["started": true])
            } catch { call.resolve(["started": false]) }
        }
    }

    @objc func update(_ call: CAPPluginCall) {
        guard #available(iOS 16.1, *), let payload = payload(from: call) else { call.resolve(); return }
        Task {
            for activity in Activity<WorkoutActivityAttributes>.activities where activity.attributes.workoutId == payload.workoutId {
                try? await activity.update(using: payload.contentState)
            }
            call.resolve()
        }
    }

    @objc func end(_ call: CAPPluginCall) {
        guard #available(iOS 16.1, *), let workoutId = call.getString("workoutId") else { call.resolve(); return }
        Task {
            for activity in Activity<WorkoutActivityAttributes>.activities where activity.attributes.workoutId == workoutId {
                await activity.end(using: activity.contentState, dismissalPolicy: .immediate)
            }
            call.resolve()
        }
    }

    @available(iOS 16.1, *)
    private func payload(from call: CAPPluginCall) -> (workoutId: String, workoutStartedAt: Date, contentState: WorkoutActivityAttributes.ContentState)? {
        guard let workoutId = call.getString("workoutId"), let startedAtMs = call.getDouble("workoutStartedAtMs") else { return nil }
        return (workoutId, Date(timeIntervalSince1970: startedAtMs / 1000), WorkoutActivityAttributes.ContentState(
            exerciseName: call.getString("exerciseName") ?? "Workout",
            setLabel: call.getString("setLabel") ?? "",
            displayPerformance: call.getString("displayPerformance") ?? "Next set",
            completedSets: call.getInt("completedSets") ?? 0,
            totalSets: call.getInt("totalSets") ?? 0,
            isResting: call.getBool("isResting") ?? false,
            restEndsAt: call.getDouble("restEndsAtMs").map { Date(timeIntervalSince1970: $0 / 1000) }
        ))
    }
}
