//
// PavingJossNativeCore.swift
// Paving Joss ERP — iOS Native (Swift / SwiftUI) UI/UX Foundation Spec
// Focus: Modular Minimalist Card System, Official Web ERP Logo, Zero-Data Empty-First Shell
//
// NOTE: Backend API clients, DTOs, and PostgreSQL integration are intentionally excluded
// in Phase 1 and deferred to the Final Phase per PRD roadmap.
//

import SwiftUI

// MARK: - 1. Modular Minimalist Design Tokens

public enum PavingJossTheme {
    /// Warm Monochrome Canvas & Surface Palette
    public enum Stone {
        public static let s50  = Color(hex: 0xFAFAF9) // Primary Canvas Background
        public static let s100 = Color(hex: 0xF5F5F4) // Subtle Input / Secondary Surface
        public static let s200 = Color(hex: 0xE7E5E4) // 1pt Card Hairline Border
        public static let s300 = Color(hex: 0xD6D3D1)
        public static let s400 = Color(hex: 0xA8A29E) // Inactive Tab / Placeholder
        public static let s500 = Color(hex: 0x78716C) // Muted Label / Empty Caption
        public static let s600 = Color(hex: 0x57534E)
        public static let s700 = Color(hex: 0x44403C)
        public static let s800 = Color(hex: 0x292524)
        public static let s900 = Color(hex: 0x1C1917) // Primary Ink & Primary CTA
    }

    /// Official Web ERP Brand Tokens
    public enum Brand {
        public static let primaryAction = Color(hex: 0x1C1917)
        public static let erpLogoRed    = Color(hex: 0xCC0000) // Matches public/logo.png 'P'
        public static let erpLogoAmber  = Color(hex: 0xF59E0B) // Matches public/logo.png 'J'
        public static let logoutCrimson = Color(hex: 0xB02524)
        public static let lightLogoAsset = "erp_logo"          // Copy of public/logo.png
        public static let darkLogoAsset  = "erp_dm_logo"       // Copy of public/dm_logo.png
    }

    /// Modular Card Geometry & Spacing
    public enum Layout {
        public static let screenHorizontalPadding: CGFloat = 16
        public static let cardSpacing: CGFloat = 12
        public static let cardPadding: CGFloat = 16
        public static let cardCornerRadius: CGFloat = 16
        public static let loginCardCornerRadius: CGFloat = 24
        public static let inputCornerRadius: CGFloat = 12
        public static let primaryButtonHeight: CGFloat = 48
        public static let topBarHeight: CGFloat = 56
        public static let bottomBarHeight: CGFloat = 64
    }
}

public extension Color {
    init(hex: UInt, alpha: Double = 1.0) {
        self.init(
            .sRGB,
            red: Double((hex >> 16) & 0xFF) / 255.0,
            green: Double((hex >> 8) & 0xFF) / 255.0,
            blue: Double(hex & 0xFF) / 255.0,
            opacity: alpha
        )
    }
}

// MARK: - 2. Navigation Route & Bottom Tab Order (Left-to-Right)

public enum MobileRootRoute: Equatable {
    case login
    case appShell
}

/// Exact Bottom Tab Order: Dashboard (Default Leftmost) -> Messages -> Shop Floor -> Profile/Hub
public enum MobileMainTab: Int, CaseIterable, Identifiable {
    case dashboard = 0
    case messages = 1
    case shopFloor = 2
    case profileHub = 3

    public var id: Int { rawValue }

    public var title: String {
        switch self {
        case .dashboard:  return "Dashboard"
        case .messages:   return "Messages"
        case .shopFloor:  return "Shop Floor"
        case .profileHub: return "Profile/Hub"
        }
    }

    public var screenHeaderTitle: String {
        switch self {
        case .dashboard:  return "Dashboard"
        case .messages:   return "Messages"
        case .shopFloor:  return "Shop Floor"
        case .profileHub: return "Profile / Hub"
        }
    }

    public var systemIconName: String {
        switch self {
        case .dashboard:  return "square.grid.2x2"
        case .messages:   return "bubble.left"
        case .shopFloor:  return "building.2"
        case .profileHub: return "person"
        }
    }
}

// MARK: - 3. Pure UI Session State (No Backend / No Dummy Data)

@MainActor
public final class MobileUiShellState: ObservableObject {
    @Published public var rootRoute: MobileRootRoute = .login
    @Published public var selectedTab: MobileMainTab = .dashboard

    public init() {}

    public func enterDashboardShell() {
        selectedTab = .dashboard // Always land on leftmost Dashboard tab
        rootRoute = .appShell
    }

    public func returnToLogin() {
        rootRoute = .login
        selectedTab = .dashboard
    }
}

// MARK: - 4. Neutral Empty-State Display Helpers (Zero Dummy Data)

public enum NeutralEmptyText {
    public static let placeholderDash = "—"
    public static let attendanceNotRecorded = "Belum tercatat"
    public static let noDataYet = "Belum ada data"
    public static let notAvailableYet = "Belum tersedia"
    public static let noActivityHistory = "Belum ada riwayat aktivitas"
    public static let noConversations = "Belum ada percakapan"
    public static let messagesConnectHint = "Pesan tim akan tampil di sini setelah terhubung dengan sistem."
    public static let noWorkstationSelected = "Belum ada stasiun kerja dipilih"
    public static let noProductionQueue = "Belum ada tugas produksi aktif"
    public static let notConnectedToErp = "Belum terhubung ke akun ERP"
}
