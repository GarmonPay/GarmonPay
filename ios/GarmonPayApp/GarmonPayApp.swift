import SwiftUI

@main
struct GarmonPayApp: App {
    var body: some Scene {
        WindowGroup {
            WebView(url: URL(string: "https://garmonpay.com")!)
                .ignoresSafeArea(.container)
        }
    }
}
