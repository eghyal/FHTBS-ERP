//
// PavingJossNativeCore.swift
// Paving Joss ERP — iOS Native (Swift / SwiftUI) Reference Implementation
// Phase 1 Prototype (Auth, HR Portal/ESS, Messages/Forum, Socket.IO & Offline Sync)
// + Phase 2 Foundation (Shop Floor 2-Way & Back-Office Monitor Hub)
//

import Foundation
import SwiftUI
import Combine

// MARK: - 1. Design System Tokens (100% Parity with src/index.css)

public enum PavingJossTheme {
    /// Warm Monochrome Industrial Palette (ERP Core, Shop Floor, Messages)
    public enum Stone {
        public static let s50  = Color(hex: 0xFAFAF9)
        public static let s100 = Color(hex: 0xF5F5F4)
        public static let s200 = Color(hex: 0xE7E5E4)
        public static let s300 = Color(hex: 0xD6D3D1)
        public static let s400 = Color(hex: 0xA8A29E)
        public static let s500 = Color(hex: 0x78716C)
        public static let s600 = Color(hex: 0x57534E)
        public static let s700 = Color(hex: 0x44403C)
        public static let s800 = Color(hex: 0x292524)
        public static let s900 = Color(hex: 0x1C1917) // Primary Brand Surface
        public static let s950 = Color(hex: 0x0C0A09)
    }

    /// Airy Frosted Glass Theme (.hris-theme for HR Portal & ESS)
    public enum HrisAlabaster {
        public static let s50  = Color(hex: 0xF7F7F9) // Primary HRIS Background
        public static let s100 = Color(hex: 0xEFEFF3)
        public static let s200 = Color(hex: 0xE2E3EA) // Crisp Card Border
        public static let s300 = Color(hex: 0xCBCDD6)
        public static let s400 = Color(hex: 0x8E929F)
        public static let s500 = Color(hex: 0x646876)
        public static let s600 = Color(hex: 0x484B57)
        public static let s700 = Color(hex: 0x32353E)
        public static let s800 = Color(hex: 0x1E2028)
        public static let s900 = Color(hex: 0x121318) // Primary HRIS Ink
        public static let s950 = Color(hex: 0x0A0B0E)

        public static let coral500   = Color(hex: 0xF25730)
        public static let coral600   = Color(hex: 0xE04620)
        public static let emerald500 = Color(hex: 0x10B981)
        public static let emerald600 = Color(hex: 0x059669)
    }

    /// Brand & Semantic Status Tokens
    public enum Brand {
        public static let primary       = Color(hex: 0x1C1917)
        public static let primaryHover  = Color(hex: 0x292524)
        public static let letterheadRed = Color(hex: 0xB02524) // Reserved strictly for Kop Surat & destructive actions
        public static let pavingYellow  = Color(hex: 0xFFD700) // Daily Auth Key icon accent
        public static let emerald500    = Color(hex: 0x10B981)
        public static let amber500      = Color(hex: 0xF59E0B)
        public static let red500        = Color(hex: 0xEF4444)
        public static let blue500       = Color(hex: 0x3B82F6)
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

// MARK: - 2. Deterministic 6-Character Daily Auth Key (PIN) Generator
// Matches src/utils/auth.ts bit-for-bit using 32-bit signed integer overflow (&* / &+ / &-).

public enum DailyAuthKeyGenerator {
    private static let charset = Array("ABCDEFGHJKLMNPQRSTUVWXYZ23456789")
    private static let salts: [Int] = [17, 31, 7, 3, 11, 23]

    public static func generateForDate(
        username: String,
        dateStr: String,
        secretSeed: String = "_sec_fhtbs_2026"
    ) -> String {
        let cleanUsername = username.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !cleanUsername.isEmpty else { return "" }

        let seedStr = cleanUsername + dateStr + secretSeed
        var hash: Int32 = 0
        for scalar in seedStr.unicodeScalars {
            let code = Int32(scalar.value)
            hash = ((hash &<< 5) &- hash) &+ code
        }

        let absHash = Int(abs(Int64(hash)))
        var currentHash = absHash
        var result = ""

        for i in 0..<6 {
            let index = (currentHash + salts[i]) % charset.count
            result.append(charset[index])
            currentHash = currentHash / charset.count
            if currentHash == 0 {
                currentHash = absHash + (i * 13)
            }
        }
        return result
    }

    public static func todayKey(username: String, secretSeed: String = "_sec_fhtbs_2026") -> String {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withFullDate]
        formatter.timeZone = TimeZone(secondsFromGMT: 0)
        let dateStr = formatter.string(from: Date())
        return generateForDate(username: username, dateStr: dateStr, secretSeed: secretSeed)
    }
}

// MARK: - 3. Core DTOs (Phase 1 Prototype: Auth, ESS/HR Portal, Messages/Forum)

public enum MobileAppScope: String, Codable {
    case operatorMobile = "OPERATOR_MOBILE"
    case backofficeMobile = "BACKOFFICE_MOBILE"
}

public struct MobileUser: Codable, Identifiable {
    public let id: String
    public let username: String
    public let role: String
    public let level: String?
    public let name: String?
    public let status: String?
    public let employee_no: String?
    public let work_center_id: String?
    public let contract_type: String?
    public let join_date: String?
}

public struct MobileLoginResponse: Codable {
    public let success: Bool
    public let token: String
    public let user: MobileUser
    public let app_scope: MobileAppScope
    public let allowed_modules: [String]
}

public struct EssSummaryResponse: Codable {
    public let success: Bool
    public let profile: MobileUser?
    public let attendance: AttendanceSummaryBlock
    public let leave: LeaveSummaryBlock
    public let compensation: CompensationBlock
}

public struct AttendanceSummaryBlock: Codable {
    public let today: AttendanceRecord?
    public let recent: [AttendanceRecord]
}

public struct AttendanceRecord: Codable, Identifiable {
    public let id: String
    public let employee_username: String
    public let date: String
    public let clock_in: String?
    public let clock_out: String?
    public let clock_in_location: String?
    public let clock_out_location: String?
    public let shift: String?
    public let project_id: String?
    public let work_hours: Double?
    public let overtime_hours: Double?
    public let overtime_status: String?
}

public struct LeaveSummaryBlock: Codable {
    public let annual_quota: Int
    public let used_days: Int
    public let remaining_days: Int
    public let requests: [LeaveRecord]
}

public struct LeaveRecord: Codable, Identifiable {
    public let id: String
    public let employee_username: String
    public let leave_type: String
    public let start_date: String
    public let end_date: String
    public let reason: String?
    public let status: String
    public let approved_by: String?
    public let manager_note: String?
}

public struct CompensationBlock: Codable {
    public let payslips: [PayslipRecord]
}

public struct PayslipRecord: Codable, Identifiable {
    public let id: String
    public let employee_username: String
    public let period_month: String
    public let basic_salary: Double
    public let allowances: Double
    public let deductions: Double
    public let net_salary: Double
    public let status: String
}

public struct ChatThread: Codable, Identifiable {
    public let id: String
    public let name: String?
    public let is_group: Int?
    public let participant_count: Int?
    public let last_message: String?
    public let last_message_time: String?
    public let last_message_sender: String?
    public let unread_count: Int?
    public let participants: [String]?
}

public struct ChatMessage: Codable, Identifiable {
    public let id: String
    public let thread_id: String
    public let sender_username: String
    public let content: String?
    public let file_url: String?
    public let file_name: String?
    public let file_type: String?
    public let forwarded_from: String?
    public let reply_to_id: String?
    public let reply_to_sender: String?
    public let reply_to_content: String?
    public let is_pinned: Int?
    public let created_at: String?
}

// MARK: - 4. Express ERP REST API Client (with JWT, Idempotency & Offline Outbox Support)

public final class PavingJossApiClient {
    public static let shared = PavingJossApiClient()

    public var baseURL: URL = URL(string: "https://your-erp-domain.example.com")!
    public var authToken: String?
    public var currentUsername: String?

    private let session: URLSession

    public init(session: URLSession = .shared) {
        self.session = session
    }

    public func request<T: Decodable>(
        path: String,
        method: String = "GET",
        body: Data? = nil,
        idempotencyKey: String? = nil
    ) async throws -> T {
        guard let url = URL(string: path, relativeTo: baseURL) else {
            throw URLError(.badURL)
        }

        var req = URLRequest(url: url)
        req.httpMethod = method
        req.timeoutInterval = 15.0
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.setValue("mobile-app", forHTTPHeaderField: "x-client-platform")
        req.setValue("iOS", forHTTPHeaderField: "x-mobile-os")

        if let token = authToken, !token.isEmpty {
            req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        if let username = currentUsername, !username.isEmpty {
            req.setValue(username, forHTTPHeaderField: "x-user-email")
        }
        if method != "GET" && method != "HEAD" {
            let key = idempotencyKey ?? "ios:\(method):\(path):\(UUID().uuidString)"
            req.setValue(String(key.prefix(128)), forHTTPHeaderField: "x-idempotency-key")
        }
        req.httpBody = body

        let (data, response) = try await session.data(for: req)
        guard let httpRes = response as? HTTPURLResponse else {
            throw URLError(.badServerResponse)
        }
        guard (200...299).contains(httpRes.statusCode) else {
            throw NSError(
                domain: "PavingJossAPI",
                code: httpRes.statusCode,
                userInfo: [NSLocalizedDescriptionKey: String(data: data, encoding: .utf8) ?? "HTTP \(httpRes.statusCode)"]
            )
        }
        return try JSONDecoder().decode(T.self, from: data)
    }
}
