// swift-tools-version: 5.9
import PackageDescription

// NOTE: The Capacitor framework is provided by the main Xcode project
// (added automatically by `npx cap add ios`). This package only declares
// the GCDWebServer dependency. When adding this package to the Xcode
// workspace, ensure the Capacitor framework is linked to this target.
let package = Package(
    name: "CornerPOSHttpServer",
    platforms: [.iOS(.v14)],
    products: [
        .library(name: "CornerPOSHttpServer", targets: ["CornerPOSHttpServerPlugin"]),
    ],
    dependencies: [
        .package(url: "https://github.com/nicklockwood/GCDWebServer.git", from: "3.5.4"),
    ],
    targets: [
        .target(
            name: "CornerPOSHttpServerPlugin",
            dependencies: ["GCDWebServer"],
            path: ".",
            exclude: ["Package.swift"]
        ),
    ]
)
