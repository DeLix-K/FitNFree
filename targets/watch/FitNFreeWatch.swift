import SwiftUI
import WatchConnectivity
import WatchKit

// FitNFree for Apple Watch. It shows the streak and this week's workouts, and can send "log today's workout" to the iPhone app.
//
// What it does NOT do: it has no sign-in, contacts no server, reads no health data and runs nothing in the background. The iPhone app sends it one small
// snapshot (the same one the home-screen widget reads; see lib/widgetSnapshot.ts / lib/watchSync.ts in the app) over Apple's WatchConnectivity, and the
// watch only displays it. The tap on "Log today's workout" is queued by iOS and the iPhone app saves it the next time it runs.
//
// The watch can be looked at days after the phone last sent anything, so `shown(_:at:)` below does the same sums as `snapshotAt` in lib/widgetSnapshot.ts
// (covered by tests there). If one changes, change the other. This Swift has never been compiled: see docs/release/watch.md.

private let contextVersion = 1
private let contextSnapshotKey = "snapshot"
private let sentDayKey = "sentWorkoutDay"

// MARK: - Data

struct WatchSnapshot: Codable {
    let v: Int
    let streak: Int
    let weekDone: Int
    let weekTarget: Int
    let days: [Bool]               // Sunday ... Saturday of the current week, true = trained
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

// What to show at a moment in time. A missing snapshot is "no data", so the watch asks the person to open the iPhone app.
func shown(_ snapshot: WatchSnapshot?, at date: Date) -> Shown {
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

// The local day as "YYYY-MM-DD", the form the iPhone app expects (lib/watchSync.ts).
func dayString(_ date: Date) -> String {
    let formatter = DateFormatter()
    formatter.calendar = Calendar(identifier: .gregorian)
    formatter.locale = Locale(identifier: "en_US_POSIX")
    formatter.timeZone = TimeZone.current
    formatter.dateFormat = "yyyy-MM-dd"
    return formatter.string(from: date)
}

// MARK: - Link to the iPhone

final class WatchStore: NSObject, ObservableObject, WCSessionDelegate {
    @Published private(set) var snapshot: WatchSnapshot?
    @Published private(set) var sentDay: String?   // the day whose workout was sent to the iPhone (shown as "Sent" until the iPhone confirms)
    @Published private(set) var notice: String?

    override init() {
        super.init()
        sentDay = UserDefaults.standard.string(forKey: sentDayKey)
        guard WCSession.isSupported() else { return }
        let session = WCSession.default
        session.delegate = self
        session.activate()
    }

    // MARK: WCSessionDelegate (called on a background queue)

    func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: Error?) {
        if activationState == .activated { apply(session.receivedApplicationContext) }
    }

    func session(_ session: WCSession, didReceiveApplicationContext applicationContext: [String: Any]) {
        apply(applicationContext)
    }

    private func apply(_ context: [String: Any]) {
        guard (context["v"] as? Int) == contextVersion, let text = context[contextSnapshotKey] as? String else { return }
        if text.isEmpty {
            // The iPhone app says the person signed out.
            DispatchQueue.main.async { self.snapshot = nil }
            return
        }
        guard let data = text.data(using: .utf8),
              let decoded = try? JSONDecoder().decode(WatchSnapshot.self, from: data),
              decoded.v == 1,
              decoded.days.count == 7 else { return }  // damaged or from a newer app: keep showing what we had
        DispatchQueue.main.async {
            self.snapshot = decoded
            self.notice = nil
        }
    }

    // MARK: Logging

    // Queues "log a workout for today" for the iPhone app. iOS delivers it when the iPhone app next runs, which is usually within moments.
    func logToday() {
        guard WCSession.isSupported(), WCSession.default.activationState == .activated else {
            notice = "Can't reach your iPhone. Try again."
            return
        }
        let day = dayString(Date())
        WCSession.default.transferUserInfo(["v": contextVersion, "type": "log-workout", "date": day])
        sentDay = day
        notice = nil
        UserDefaults.standard.set(day, forKey: sentDayKey)
        WKInterfaceDevice.current().play(.success)
    }
}

// MARK: - Look

private extension Color {
    init(hex: UInt32) {
        self.init(red: Double((hex >> 16) & 0xFF) / 255, green: Double((hex >> 8) & 0xFF) / 255, blue: Double(hex & 0xFF) / 255)
    }
}

private let accent = Color(hex: 0xA3E635)
private let dim = Color(hex: 0x2A2A2A)
private let muted = Color(hex: 0xA1A1AA)
private let dayLetters = ["S", "M", "T", "W", "T", "F", "S"]

struct OpenPhoneView: View {
    var body: some View {
        VStack(spacing: 6) {
            Text("FitNFree")
                .font(.headline)
                .foregroundStyle(accent)
            Text("Open FitNFree on your iPhone to see your streak.")
                .font(.footnote)
                .multilineTextAlignment(.center)
                .foregroundStyle(muted)
        }
        .padding()
    }
}

struct StreakView: View {
    @EnvironmentObject var store: WatchStore
    let shown: Shown
    let sentToday: Bool
    let updatedAt: Date?
    let now: Date
    @State private var confirming = false

    private var summary: String {
        "\(shown.streak) day streak. \(shown.weekDone) of \(shown.weekTarget) workouts this week. \(shown.loggedToday || sentToday ? "Trained today." : "Not trained yet today.")"
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 8) {
                VStack(spacing: 2) {
                    HStack(spacing: 4) {
                        Text("🔥").font(.title3)
                        Text("\(shown.streak)")
                            .font(.system(size: 40, weight: .heavy, design: .rounded))
                            .minimumScaleFactor(0.6)
                            .lineLimit(1)
                    }
                    Text("day streak")
                        .font(.footnote)
                        .foregroundStyle(muted)
                    Text("\(shown.weekDone)/\(shown.weekTarget) this week")
                        .font(.footnote.weight(.semibold))
                        .foregroundStyle(accent)
                    HStack(spacing: 4) {
                        ForEach(0..<7, id: \.self) { i in
                            VStack(spacing: 2) {
                                Circle()
                                    .fill(shown.days[i] ? accent : dim)
                                    .frame(width: 12, height: 12)
                                Text(dayLetters[i])
                                    .font(.system(size: 9))
                                    .foregroundStyle(muted)
                            }
                        }
                    }
                    .padding(.top, 2)
                }
                .accessibilityElement(children: .ignore)
                .accessibilityLabel(summary)

                if shown.loggedToday {
                    Label("Done today", systemImage: "checkmark.circle.fill")
                        .font(.footnote.weight(.semibold))
                        .foregroundStyle(accent)
                } else if sentToday {
                    VStack(spacing: 2) {
                        Label("Sent to iPhone", systemImage: "paperplane.fill")
                            .font(.footnote.weight(.semibold))
                            .foregroundStyle(accent)
                        Text("It counts once your iPhone has saved it.")
                            .font(.caption2)
                            .multilineTextAlignment(.center)
                            .foregroundStyle(muted)
                    }
                } else {
                    Button("Log today's workout") { confirming = true }
                        .tint(accent)
                }

                if let message = store.notice {
                    Text(message)
                        .font(.caption2)
                        .multilineTextAlignment(.center)
                        .foregroundStyle(.red)
                }

                if let updatedAt = updatedAt, now.timeIntervalSince(updatedAt) > 300 {
                    (Text("Updated ") + Text(updatedAt, style: .relative) + Text(" ago"))
                        .font(.caption2)
                        .foregroundStyle(muted)
                }
            }
            .frame(maxWidth: .infinity)
        }
        .confirmationDialog("Log today's workout?", isPresented: $confirming, titleVisibility: .visible) {
            Button("Log it") { store.logToday() }
            Button("Cancel", role: .cancel) {}
        }
    }
}

struct RootView: View {
    @EnvironmentObject var store: WatchStore

    var body: some View {
        // Re-worked every minute so the streak running out, the end of the week and midnight show up without anything being sent.
        TimelineView(.everyMinute) { context in
            let current = shown(store.snapshot, at: context.date)
            if current.hasData {
                StreakView(
                    shown: current,
                    sentToday: store.sentDay == dayString(context.date),
                    updatedAt: store.snapshot.map { Date(timeIntervalSince1970: $0.updatedAt) },
                    now: context.date
                )
            } else {
                OpenPhoneView()
            }
        }
    }
}

@main
struct FitNFreeWatchApp: App {
    @StateObject private var store = WatchStore()

    var body: some Scene {
        WindowGroup {
            RootView().environmentObject(store)
        }
    }
}
