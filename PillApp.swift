import SwiftUI
import AppKit

// Pill - prototype v0.1
// Capsule noire flottante, déplaçable partout sur l'écran, avec l'heure animée.
// Nécessite macOS 14 ou plus (pour .contentTransition(.numericText())).

@main
struct PillApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) var appDelegate

    var body: some Scene {
        // Pas de fenêtre classique : la capsule est créée dans AppDelegate.
        Settings { EmptyView() }
    }
}

final class AppDelegate: NSObject, NSApplicationDelegate {
    var panel: NSPanel!

    func applicationDidFinishLaunching(_ notification: Notification) {
        // Pas d'icône dans le Dock
        NSApp.setActivationPolicy(.accessory)

        let size = NSSize(width: 150, height: 44)
        panel = NSPanel(
            contentRect: NSRect(origin: .zero, size: size),
            styleMask: [.borderless, .nonactivatingPanel],
            backing: .buffered,
            defer: false
        )

        panel.isFloatingPanel = true
        panel.level = .floating                       // toujours au premier plan
        panel.collectionBehavior = [.canJoinAllSpaces, // visible sur tous les bureaux
                                    .fullScreenAuxiliary]
        panel.isOpaque = false
        panel.backgroundColor = .clear
        panel.hasShadow = true
        panel.isMovableByWindowBackground = true       // on la déplace en la faisant glisser

        panel.contentView = NSHostingView(rootView: PillView())
        panel.center()
        panel.orderFrontRegardless()
    }
}

struct PillView: View {
    var body: some View {
        TimelineView(.periodic(from: .now, by: 1)) { context in
            let text = context.date.formatted(.dateTime.hour().minute().second())

            Text(text)
                .font(.system(size: 20, weight: .semibold, design: .rounded))
                .monospacedDigit()
                .foregroundStyle(.white)
                .contentTransition(.numericText())      // les chiffres "roulent"
                .animation(.snappy, value: text)
        }
        .frame(width: 150, height: 44)
        .background(Capsule().fill(Color.black))
        .contextMenu {
            Button("Quitter Pill") { NSApp.terminate(nil) }
        }
    }
}
