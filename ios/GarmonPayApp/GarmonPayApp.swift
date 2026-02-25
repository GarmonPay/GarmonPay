import SwiftUI

@main
struct GarmonPayApp: App {
    var body: some Scene {
        WindowGroup {
            WebView(url: URL(string: "https://garmonpay.com") ?? URL(string: "http://localhost:3000")!)
                .ignoresSafeArea(.container)
        }
    }
}
