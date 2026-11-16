//
// PavingJossCleanUI.swift
// Paving Joss ERP — Clean, Non-Overinformative SwiftUI Component Reference
// Implements 15% Sticky Surface Cap, 2x2 Metric Grid, 3-Point Card Anatomy,
// and Progressive Disclosure via Slide-Up Bottom Inspector Sheet.
//

import SwiftUI

// MARK: - 1. Compact Mobile Top App Bar (56pt Height, Sticky)

public struct PavingJossTopBar: View {
    public let title: String
    public let roleSubtitle: String
    public let unreadNotifications: Int
    public let onTapSystemInfo: () -> Void
    public let onTapNotifications: () -> Void

    public init(
        title: String,
        roleSubtitle: String,
        unreadNotifications: Int = 0,
        onTapSystemInfo: @escaping () -> Void,
        onTapNotifications: @escaping () -> Void
    ) {
        self.title = title
        self.roleSubtitle = roleSubtitle
        self.unreadNotifications = unreadNotifications
        self.onTapSystemInfo = onTapSystemInfo
        self.onTapNotifications = onTapNotifications
    }

    public var body: some View {
        HStack(spacing: 10) {
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .fill(Color.white)
                .frame(width: 36, height: 36)
                .overlay(
                    RoundedRectangle(cornerRadius: 12, style: .continuous)
                        .stroke(Color(hex: 0xE7E5E4), lineWidth: 1)
                )
                .overlay(
                    Text("PJ")
                        .font(.system(size: 12, weight: .black, design: .monospaced))
                        .foregroundColor(Color(hex: 0x1C1917))
                )

            VStack(alignment: .leading, spacing: 1) {
                Text(title)
                    .font(.system(size: 14, weight: .bold))
                    .foregroundColor(Color(hex: 0x1C1917))
                    .lineLimit(1)
                Text(roleSubtitle)
                    .font(.system(size: 10, weight: .semibold, design: .monospaced))
                    .foregroundColor(Color(hex: 0x78716C))
                    .lineLimit(1)
            }

            Spacer()

            Button(action: onTapSystemInfo) {
                HStack(spacing: 5) {
                    Image(systemName: "key.fill")
                        .font(.system(size: 11, weight: .bold))
                    Text("System Info")
                        .font(.system(size: 11, weight: .bold))
                }
                .foregroundColor(Color(hex: 0x44403C))
                .padding(.horizontal, 10)
                .frame(height: 36)
                .background(Color(hex: 0xF5F5F4))
                .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: 12, style: .continuous)
                        .stroke(Color(hex: 0xE7E5E4), lineWidth: 1)
                )
            }

            Button(action: onTapNotifications) {
                ZStack(alignment: .topTrailing) {
                    RoundedRectangle(cornerRadius: 12, style: .continuous)
                        .fill(Color(hex: 0xF5F5F4))
                        .frame(width: 36, height: 36)
                        .overlay(
                            Image(systemName: "bell")
                                .font(.system(size: 14, weight: .semibold))
                                .foregroundColor(Color(hex: 0x44403C))
                        )

                    if unreadNotifications > 0 {
                        Text(unreadNotifications > 9 ? "9+" : "\(unreadNotifications)")
                            .font(.system(size: 9, weight: .bold, design: .monospaced))
                            .foregroundColor(.white)
                            .padding(.horizontal, 4)
                            .frame(minWidth: 16, minHeight: 16)
                            .background(Color(hex: 0x1C1917))
                            .clipShape(Capsule())
                            .offset(x: 4, y: -4)
                    }
                }
            }
        }
        .padding(.horizontal, 14)
        .frame(height: 56)
        .background(.ultraThinMaterial)
        .overlay(
            Rectangle()
                .fill(Color(hex: 0xE7E5E4))
                .frame(height: 1),
            alignment: .bottom
        )
    }
}

// MARK: - 2. Clean 2x2 KPI Summary Grid (Max 2 Columns Rule)

public struct CleanKpiMetricItem: Identifiable {
    public let id = UUID()
    public let label: String
    public let value: String
    public let subtitle: String?
    public let accentColor: Color

    public init(label: String, value: String, subtitle: String? = nil, accentColor: Color = Color(hex: 0x1C1917)) {
        self.label = label
        self.value = value
        self.subtitle = subtitle
        self.accentColor = accentColor
    }
}

public struct CleanMetricGrid2x2: View {
    public let items: [CleanKpiMetricItem]
    public let onTapItem: (CleanKpiMetricItem) -> Void

    private let columns = [
        GridItem(.flexible(), spacing: 10),
        GridItem(.flexible(), spacing: 10)
    ]

    public var body: some View {
        LazyVGrid(columns: columns, spacing: 10) {
            ForEach(items.prefix(4)) { item in
                Button(action: { onTapItem(item) }) {
                    VStack(alignment: .leading, spacing: 8) {
                        Text(item.label.uppercased())
                            .font(.system(size: 10, weight: .bold))
                            .tracking(0.5)
                            .foregroundColor(Color(hex: 0x78716C))
                            .lineLimit(1)

                        Text(item.value)
                            .font(.system(size: 20, weight: .black, design: .monospaced))
                            .monospacedDigit()
                            .foregroundColor(item.accentColor)
                            .lineLimit(1)

                        if let sub = item.subtitle {
                            Text(sub)
                                .font(.system(size: 11, weight: .medium))
                                .foregroundColor(Color(hex: 0x78716C))
                                .lineLimit(1)
                        }
                    }
                    .frame(maxWidth: .infinity, minHeight: 92, alignment: .leading)
                    .padding(14)
                    .background(Color.white)
                    .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                    .overlay(
                        RoundedRectangle(cornerRadius: 16, style: .continuous)
                            .stroke(Color(hex: 0xE7E5E4), lineWidth: 1)
                    )
                }
                .buttonStyle(.plain)
            }
        }
    }
}

// MARK: - 3. Strict 3-Point Card Anatomy (Anti-Overinformative List Card)

public enum SemanticBadgeTone {
    case emerald, amber, red, stone

    var backgroundColor: Color {
        switch self {
        case .emerald: return Color(hex: 0xECFDF5)
        case .amber:   return Color(hex: 0xFFFBEB)
        case .red:     return Color(hex: 0xFEF2F2)
        case .stone:   return Color(hex: 0xF5F5F4)
        }
    }

    var textColor: Color {
        switch self {
        case .emerald: return Color(hex: 0x047857)
        case .amber:   return Color(hex: 0xB45309)
        case .red:     return Color(hex: 0xB91C1C)
        case .stone:   return Color(hex: 0x44403C)
        }
    }
}

public struct CleanThreePointCard: View {
    /// Point 1: Monospace Document Code + Single Semantic Status Badge
    public let docCode: String
    public let statusText: String
    public let statusTone: SemanticBadgeTone
    /// Point 2: Primary Title (1 line) + Secondary Subtitle (1 line)
    public let title: String
    public let subtitle: String
    /// Point 3: Tabular Monospace Metric Value + Disclosure Chevron
    public let primaryMetric: String
    public let onTap: () -> Void

    public var body: some View {
        Button(action: onTap) {
            VStack(alignment: .leading, spacing: 8) {
                // Row 1: Code + Single Status Badge
                HStack {
                    Text(docCode)
                        .font(.system(size: 11, weight: .bold, design: .monospaced))
                        .foregroundColor(Color(hex: 0x78716C))
                        .lineLimit(1)

                    Spacer()

                    Text(statusText.uppercased())
                        .font(.system(size: 10, weight: .bold, design: .monospaced))
                        .foregroundColor(statusTone.textColor)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 3)
                        .background(statusTone.backgroundColor)
                        .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                }

                // Row 2: Title + Subtitle
                VStack(alignment: .leading, spacing: 2) {
                    Text(title)
                        .font(.system(size: 14, weight: .bold))
                        .foregroundColor(Color(hex: 0x1C1917))
                        .lineLimit(1)
                    Text(subtitle)
                        .font(.system(size: 12, weight: .regular))
                        .foregroundColor(Color(hex: 0x78716C))
                        .lineLimit(1)
                }

                // Row 3: Metric + Chevron Disclosure
                HStack {
                    Text(primaryMetric)
                        .font(.system(size: 13, weight: .black, design: .monospaced))
                        .monospacedDigit()
                        .foregroundColor(Color(hex: 0x1C1917))

                    Spacer()

                    HStack(spacing: 4) {
                        Text("Inspect")
                            .font(.system(size: 11, weight: .semibold))
                        Image(systemName: "chevron.right")
                            .font(.system(size: 10, weight: .bold))
                    }
                    .foregroundColor(Color(hex: 0x78716C))
                }
                .padding(.top, 2)
            }
            .padding(14)
            .background(Color.white)
            .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .stroke(Color(hex: 0xE7E5E4), lineWidth: 1)
            )
        }
        .buttonStyle(.plain)
    }
}

// MARK: - 4. HR Portal / ESS Attendance Hero Card (.hris-theme Alabaster)

public struct EssAttendanceHeroCard: View {
    public let employeeNoAndShift: String
    public let employeeName: String
    public let jakartaTimeStr: String
    public let isClockedIn: Bool
    public let onTapClockAction: () -> Void

    public var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text(employeeNoAndShift)
                    .font(.system(size: 10, weight: .bold, design: .monospaced))
                    .foregroundColor(Color(hex: 0x646876))
                Spacer()
                Text(isClockedIn ? "ON DUTY" : "OFF DUTY")
                    .font(.system(size: 10, weight: .bold, design: .monospaced))
                    .foregroundColor(isClockedIn ? Color(hex: 0x047857) : Color(hex: 0x646876))
                    .padding(.horizontal, 8)
                    .padding(.vertical, 3)
                    .background(isClockedIn ? Color(hex: 0xD1FAE5) : Color(hex: 0xEFEFF3))
                    .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
            }

            Text(employeeName)
                .font(.system(size: 18, weight: .bold))
                .foregroundColor(Color(hex: 0x121318))

            Text(jakartaTimeStr)
                .font(.system(size: 26, weight: .black, design: .monospaced))
                .monospacedDigit()
                .foregroundColor(Color(hex: 0x121318))

            Button(action: onTapClockAction) {
                Text(isClockedIn ? "Clock Out Sekarang" : "Clock In Shift Sekarang")
                    .font(.system(size: 13, weight: .bold))
                    .foregroundColor(.white)
                    .frame(maxWidth: .infinity, minHeight: 48)
                    .background(Color(hex: 0x121318))
                    .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
            }
        }
        .padding(16)
        .background(Color.white)
        .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 20, style: .continuous)
                .stroke(Color(hex: 0xE2E3EA), lineWidth: 1)
        )
    }
}

// MARK: - 5. Compact ERP Document Share Card in Messages + PIN Authorization Sheet

public struct ChatErpDocumentCard: View {
    public let docTypeLabel: String
    public let docNumberAndPartner: String
    public let amountFormatted: String
    public let statusText: String
    public let canAuthorize: Bool
    public let onTapPreview: () -> Void
    public let onTapAuthorize: () -> Void

    public var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text(docTypeLabel)
                    .font(.system(size: 12, weight: .bold))
                    .foregroundColor(Color(hex: 0x1C1917))
                Spacer()
                Text(statusText)
                    .font(.system(size: 10, weight: .bold, design: .monospaced))
                    .foregroundColor(Color(hex: 0xB45309))
                    .padding(.horizontal, 8)
                    .padding(.vertical, 3)
                    .background(Color(hex: 0xFFFBEB))
                    .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
            }

            Text(docNumberAndPartner)
                .font(.system(size: 12, weight: .medium))
                .foregroundColor(Color(hex: 0x57534E))
                .lineLimit(1)

            Text(amountFormatted)
                .font(.system(size: 18, weight: .black, design: .monospaced))
                .monospacedDigit()
                .foregroundColor(Color(hex: 0x1C1917))

            HStack(spacing: 8) {
                Button(action: onTapPreview) {
                    Text("Preview Dokumen")
                        .font(.system(size: 12, weight: .bold))
                        .foregroundColor(Color(hex: 0x1C1917))
                        .frame(maxWidth: .infinity, minHeight: 44)
                        .background(Color(hex: 0xF5F5F4))
                        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                        .overlay(
                            RoundedRectangle(cornerRadius: 12, style: .continuous)
                                .stroke(Color(hex: 0xE7E5E4), lineWidth: 1)
                        )
                }

                if canAuthorize {
                    Button(action: onTapAuthorize) {
                        Text("Authorize")
                            .font(.system(size: 12, weight: .bold))
                            .foregroundColor(.white)
                            .frame(maxWidth: .infinity, minHeight: 44)
                            .background(Color(hex: 0x1C1917))
                            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                    }
                }
            }
        }
        .padding(14)
        .background(Color.white)
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .stroke(Color(hex: 0xE7E5E4), lineWidth: 1)
        )
    }
}
