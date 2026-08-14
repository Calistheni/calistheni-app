import ActivityKit
import SwiftUI
import WidgetKit

struct WorkoutActivityAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable { var exerciseName: String; var setLabel: String; var displayPerformance: String; var completedSets: Int; var totalSets: Int; var isResting: Bool; var restEndsAt: Date? }
    var workoutId: String
    var workoutStartedAt: Date
}

struct WorkoutLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: WorkoutActivityAttributes.self) { context in
            VStack(alignment: .leading, spacing: 8) {
                HStack { Label("Calistheni", systemImage: "figure.strengthtraining.traditional").foregroundStyle(.blue); Spacer(); Text(context.attributes.workoutStartedAt, style: .timer).monospacedDigit() }
                Text(context.state.isResting ? "Rest" : context.state.exerciseName).font(.headline)
                if context.state.isResting {
                    HStack(spacing: 4) {
                        Text("Rest ends")
                        Text(context.state.restEndsAt ?? .now, style: .timer).monospacedDigit()
                    }.foregroundStyle(.secondary)
                } else {
                    Text(context.state.setLabel).foregroundStyle(.secondary)
                }
                Text(context.state.displayPerformance).font(.title3).fontWeight(.semibold).monospacedDigit()
            }.padding().activityBackgroundTint(.black).activitySystemActionForegroundColor(.blue)
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) { Image(systemName: "figure.strengthtraining.traditional").foregroundStyle(.blue) }
                DynamicIslandExpandedRegion(.trailing) { Text(context.state.isResting ? (context.state.restEndsAt ?? .now) : context.attributes.workoutStartedAt, style: .timer).monospacedDigit() }
                DynamicIslandExpandedRegion(.bottom) { VStack(alignment: .leading) { Text(context.state.isResting ? "Rest" : context.state.exerciseName).font(.headline); Text(context.state.isResting ? "Rest countdown" : context.state.setLabel).foregroundStyle(.secondary); Text(context.state.displayPerformance).monospacedDigit() } }
            } compactLeading: { Image(systemName: "figure.strengthtraining.traditional").foregroundStyle(.blue) } compactTrailing: { Text(context.state.isResting ? (context.state.restEndsAt ?? .now) : context.attributes.workoutStartedAt, style: .timer).monospacedDigit() } minimal: { Image(systemName: "figure.strengthtraining.traditional") }
            .widgetURL(URL(string: "calistheni://workouts/new"))
            .keylineTint(.blue)
        }
    }
}

@main struct CalistheniWorkoutWidgetBundle: WidgetBundle { var body: some Widget { WorkoutLiveActivity() } }
