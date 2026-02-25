# GarmonPay iOS App

Wrapper app that opens GarmonPay in a full-screen web view. Requires Xcode 14+ and iOS 15+.

## Open in Xcode

From Terminal:

```bash
open /Users/bishop/Desktop/GarmonPay/ios/GarmonPay.xcodeproj
```

Or in Finder: double-click `GarmonPay.xcodeproj` inside the `ios` folder.

## Run

1. Open the project in Xcode.
2. Select a simulator (e.g. iPhone 15) or a connected device.
3. Press **Run** (⌘R).

The app loads **https://garmonpay.com** by default. To test against localhost, change the URL in `GarmonPayApp/GarmonPayApp.swift`.

## Signing

Set your **Team** under **Signing & Capabilities** for the GarmonPay target before running on a device.
