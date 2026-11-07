import SwiftUI
import WidgetKit

// FitNFree's streak widget. It only READS a small snapshot the app writes into the shared App Group (see lib/widgetSnapshot.ts in the app).
// It never contacts a server, holds no sign-in, and shows no health data: just the streak, this week's trained days and the weekly target.
//
// The widget can be looked at days after the app was last opened, so the snapshot carries the moments when what it says stops being true.
// `shown(_:at:)` and `changeMoments(_:after:)` below do the same sums as `snapshotAt` and `changeMoments` in lib/widgetSnapshot.ts, which is
// covered by tests (scripts/test-widget-snapshot.mjs). If one changes, change the other.

private let appGroup = "group.com.teamk.fitnfree"
private let snapshotKey = "streakSnapshot"

// MARK: - Data

struct WidgetSnapshot: Codable {
    let v: Int
    let streak: Int
    let weekDone: Int
    let weekTarget: Int
    let days: [Bool]            // Sunday ... Saturday of the current week, true = trained
    let loggedToday: Bool
    let streakValidUntil: Double?  // epoch seconds; after this the streak has run out
    let weekEndsAt: Double         // epoch seconds; after this the week starts again
    let updatedAt: Double          // epoch seconds
}

struct Shown {
    var hasData: Bool
    var streak: Int
    var weekDone: Int
    var weekTarget: Int
    var days: [Bool]
    var loggedToday: Bool

    static let empty = Shown(hasData: false, streak: 0, weekDone: 0, weekTarget: 0, days: Array(repeating: false, count: 7), loggedToday: false)
}

// A missing, damaged or different-version snapshot is treated as "no data", so the widget asks the person to open the app.
func loadSnapshot() -> WidgetSnapshot? {
    guard let text = UserDefaults(suiteName: appGroup)?.string(forKey: snapshotKey),
          let data = text.data(using: .utf8),
          let snapshot = try? JSONDecoder().decode(WidgetSnapshot.self, from: data),
          snapshot.v == 1,
          snapshot.days.count == 7 else { return nil }
    return snapshot
}

// What to show at a moment in time.
func shown(_ snapshot: WidgetSnapshot?, at date: Date) -> Shown {
    guard let s = snapshot else { return .empty }
    let t = date.timeIntervalSince1970
    let weekOver = t >= s.weekEndsAt
    let sameDay = Calendar.current.isDate(Date(timeIntervalSince1970: s.updatedAt), inSameDayAs: date)
    var streak = 0
    if let until = s.streakValidUntil, t < until { streak = s.streak }
    return Shown(
        hasData: true,
        streak: streak,
        weekDone: weekOver ? 0 : s.weekDone,
        weekTarget: s.weekTarget,
        days: weekOver ? Array(repeating: false, count: 7) : s.days,
        loggedToday: sameDay && !weekOver && s.loggedToday
    )
}

// The moments after `now` when what is shown changes: the streak running out, the week ending, and the next midnight.
func changeMoments(_ snapshot: WidgetSnapshot?, after now: Date) -> [Date] {
    guard let s = snapshot else { return [] }
    let t = now.timeIntervalSince1970
    var times: [Double] = []
    if let until = s.streakValidUntil, until > t { times.append(until) }
    if s.weekEndsAt > t { times.append(s.weekEndsAt) }
    let calendar = Calendar.current
    if let nextMidnight = calendar.date(byAdding: .day, value: 1, to: calendar.startOfDay(for: now)) {
        times.append(nextMidnight.timeIntervalSince1970)
    }
    return Array(Set(times)).sorted().map { Date(timeIntervalSince1970: $0) }
}

// MARK: - Timeline

struct StreakEntry: TimelineEntry {
    let date: Date
    let shown: Shown
}

struct StreakProvider: TimelineProvider {
    func placeholder(in context: Context) -> StreakEntry {
        StreakEntry(date: Date(), shown: Shown(hasData: true, streak: 5, weekDone: 3, weekTarget: 5, days: [true, false, true, true, false, false, false], loggedToday: true))
    }

    func getSnapshot(in context: Context, completion: @escaping (StreakEntry) -> Void) {
        if context.isPreview {
            completion(placeholder(in: context))
        } else {
            completion(StreakEntry(date: Date(), shown: shown(loadSnapshot(), at: Date())))
        }
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<StreakEntry>) -> Void) {
        let now = Date()
        let snapshot = loadSnapshot()
        // Now, then each moment the picture changes (so it stays right without the app being opened). Entries must be in time order.
        let dates = Array(([now] + changeMoments(snapshot, after: now)).prefix(6))
        let entries = dates.map { StreakEntry(date: $0, shown: shown(snapshot, at: $0)) }
        // The app also asks for a refresh whenever it writes a new snapshot; this only re-reads storage now and then.
        let refresh = Calendar.current.date(byAdding: .hour, value: 6, to: now) ?? now.addingTimeInterval(6 * 3600)
        completion(Timeline(entries: entries, policy: .after(refresh)))
    }
}

// MARK: - Look

private extension Color {
    init(hex: UInt32) {
        self.init(red: Double((hex >> 16) & 0xFF) / 255, green: Double((hex >> 8) & 0xFF) / 255, blue: Double(hex & 0xFF) / 255)
    }
}

private let accent = Color(hex: 0xA3E635)
private let widgetBackground = Color(hex: 0x0A0A0A)
private let dim = Color(hex: 0x2A2A2A)
private let muted = Color(hex: 0xA1A1AA)
private let dayLetters = ["S", "M", "T", "W", "T", "F", "S"]

private func progress(_ s: Shown) -> Double {
    min(1, Double(s.weekDone) / Double(max(1, s.weekTarget)))
}

private func summary(_ s: Shown) -> String {
    "\(s.streak) day streak. \(s.weekDone) of \(s.weekTarget) workouts this week. \(s.loggedToday ? "Trained today." : "Not trained yet today.")"
}

struct OpenAppView: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("FitNFree")
                .font(.headline)
                .foregroundColor(accent)
            Text("Open the app to see your streak.")
                .font(.caption)
                .foregroundColor(muted)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
    }
}

struct SmallView: View {
    let s: Shown

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: 4) {
                Text("🔥").font(.title2)
                Text("\(s.streak)")
                    .font(.system(size: 36, weight: .heavy, design: .rounded))
                    .foregroundColor(.white)
                    .minimumScaleFactor(0.6)
                    .lineLimit(1)
            }
            Text("day streak")
                .font(.caption)
                .foregroundColor(muted)
            Spacer(minLength: 0)
            Text("\(s.weekDone)/\(s.weekTarget) this week")
                .font(.caption.weight(.semibold))
                .foregroundColor(accent)
            ProgressView(value: progress(s))
                .tint(accent)
            Text(s.loggedToday ? "Done today ✓" : "Not yet today")
                .font(.caption2)
                .foregroundColor(muted)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
    }
}

struct MediumView: View {
    let s: Shown

    var body: some View {
        HStack(alignment: .center, spacing: 16) {
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 4) {
                    Text("🔥").font(.title)
                    Text("\(s.streak)")
                        .font(.system(size: 44, weight: .heavy, design: .rounded))
                        .foregroundColor(.white)
                        .minimumScaleFactor(0.6)
                        .lineLimit(1)
                }
                Text("day streak")
                    .font(.caption)
                    .foregroundColor(muted)
                Text(s.loggedToday ? "Done today ✓" : "Not yet today")
                    .font(.caption2)
                    .foregroundColor(s.loggedToday ? accent : muted)
            }
            VStack(alignment: .leading, spacing: 8) {
                Text("\(s.weekDone)/\(s.weekTarget) this week")
                    .font(.subheadline.weight(.semibold))
                    .foregroundColor(accent)
                HStack(spacing: 6) {
                    ForEach(0..<7, id: \.self) { i in
                        VStack(spacing: 4) {
                            Circle()
                                .fill(s.days[i] ? accent : dim)
                                .frame(width: 18, height: 18)
                            Text(dayLetters[i])
                                .font(.caption2)
                                .foregroundColor(muted)
                        }
                    }
                }
                ProgressView(value: progress(s))
                    .tint(accent)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
    }
}

struct StreakWidgetView: View {
    @Environment(\.widgetFamily) var family
    let entry: StreakEntry

    var body: some View {
        Group {
            if !entry.shown.hasData {
                OpenAppView()
            } else if family == .systemMedium {
                MediumView(s: entry.shown)
                    .accessibilityElement(children: .ignore)
                    .accessibilityLabel(summary(entry.shown))
            } else {
                SmallView(s: entry.shown)
                    .accessibilityElement(children: .ignore)
                    .accessibilityLabel(summary(entry.shown))
            }
        }
    }
}

struct StreakWidget: Widget {
    let kind = "FitNFreeStreak"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: StreakProvider()) { entry in
            StreakWidgetView(entry: entry)
                .containerBackground(widgetBackground, for: .widget)
        }
        .configurationDisplayName("Streak")
        .description("Your workout streak and this week's progress. It updates when you open FitNFree.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}
