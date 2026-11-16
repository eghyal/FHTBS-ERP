//
// PavingJossCleanUI.swift
// Paving Joss ERP — Modular Minimalist & Empty-First SwiftUI Component Reference
//
// Screens Covered:
// 0. LoginScreenView (Centered minimalist white card, official Web ERP logo, Masuk)
// 1. DashboardScreenView (Default leftmost tab, structural cards in neutral empty state)
// 2. MessagesScreenView (Search field + neutral empty state card)
// 3. ShopFloorScreenView (Workstation & production queue in neutral empty state)
// 4. ProfileHubScreenView (Neutral identity card, basic settings rows, Keluar button)
//
// NOTE: Zero dummy data, zero API calls. Designed to build completely empty & clean.
//

import SwiftUI

// MARK: - 1. Official Web ERP Logo View

public struct WebErpLogoImage: View {
    public let size: CGFloat
    public init(size: CGFloat = 28) { self.size = size }

    public var body: some View {
        // Place public/logo.png into Assets.xcassets as "erp_logo"
        Image("erp_logo")
            .resizable()
            .renderingMode(.original)
            .scaledToFit()
            .frame(width: size, height: size)
    }
}

// MARK: - 2. Modular Minimalist Card Container (16pt Radius, 1pt Hairline Border)

public struct ModularCard<Content: View>: View {
    private let padding: CGFloat
    private let content: () -> Content

    public init(padding: CGFloat = 16, @ViewBuilder content: @escaping () -> Content) {
        self.padding = padding
        self.content = content
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            content()
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(padding)
        .background(Color.white)
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .stroke(Color(hex: 0xE7E5E4), lineWidth: 1)
        )
    }
}

public struct ModularSectionLabel: View {
    public let text: String
    public init(_ text: String) { self.text = text }

    public var body: some View {
        Text(text.uppercased())
            .font(.system(size: 11, weight: .bold))
            .tracking(0.6)
            .foregroundColor(Color(hex: 0x78716C))
    }
}

// MARK: - 3. Login Screen (Minimalist Centered White Card + Web ERP Logo)

public struct LoginScreenView: View {
    @State private var username: String = ""
    @State private var password: String = ""
    @State private var showPassword: Bool = false
    public let onSignInSuccess: () -> Void

    public init(onSignInSuccess: @escaping () -> Void) {
        self.onSignInSuccess = onSignInSuccess
    }

    public var body: some View {
        ZStack {
            Color(hex: 0xFAFAF9).ignoresSafeArea()

            VStack(spacing: 24) {
                VStack(spacing: 10) {
                    WebErpLogoImage(size: 64)

                    Text("Masuk ke Akun")
                        .font(.system(size: 20, weight: .bold))
                        .foregroundColor(Color(hex: 0x1C1917))

                    Text("Portal Operasional Mobile")
                        .font(.system(size: 13, weight: .regular))
                        .foregroundColor(Color(hex: 0x78716C))
                }

                VStack(alignment: .leading, spacing: 14) {
                    VStack(alignment: .leading, spacing: 6) {
                        ModularSectionLabel("Username")
                        TextField("Masukkan username", text: $username)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                            .padding(.horizontal, 14)
                            .frame(height: 48)
                            .background(Color(hex: 0xFAFAF9))
                            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                            .overlay(
                                RoundedRectangle(cornerRadius: 12, style: .continuous)
                                    .stroke(Color(hex: 0xE7E5E4), lineWidth: 1)
                            )
                    }

                    VStack(alignment: .leading, spacing: 6) {
                        ModularSectionLabel("Password")
                        HStack {
                            Group {
                                if showPassword {
                                    TextField("Masukkan password", text: $password)
                                } else {
                                    SecureField("Masukkan password", text: $password)
                                }
                            }
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()

                            Button(action: { showPassword.toggle() }) {
                                Image(systemName: showPassword ? "eye.slash" : "eye")
                                    .font(.system(size: 14))
                                    .foregroundColor(Color(hex: 0x78716C))
                            }
                        }
                        .padding(.horizontal, 14)
                        .frame(height: 48)
                        .background(Color(hex: 0xFAFAF9))
                        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                        .overlay(
                            RoundedRectangle(cornerRadius: 12, style: .continuous)
                                .stroke(Color(hex: 0xE7E5E4), lineWidth: 1)
                        )
                    }

                    Button(action: onSignInSuccess) {
                        Text("Masuk")
                            .font(.system(size: 14, weight: .bold))
                            .foregroundColor(.white)
                            .frame(maxWidth: .infinity, minHeight: 48)
                            .background(Color(hex: 0x1C1917))
                            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                    }
                    .padding(.top, 6)
                }
            }
            .padding(28)
            .background(Color.white)
            .clipShape(RoundedRectangle(cornerRadius: 24, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 24, style: .continuous)
                    .stroke(Color(hex: 0xE7E5E4), lineWidth: 1)
            )
            .shadow(color: Color.black.opacity(0.05), radius: 24, y: 8)
            .padding(.horizontal, 20)
        }
    }
}

// MARK: - 4. Compact Top App Bar (56pt) & 4-Tab Bottom Bar (64pt)

public struct PavingJossTopBar: View {
    public let title: String
    public init(title: String) { self.title = title }

    public var body: some View {
        HStack(spacing: 10) {
            WebErpLogoImage(size: 28)

            Text(title)
                .font(.system(size: 16, weight: .bold))
                .foregroundColor(Color(hex: 0x1C1917))
                .lineLimit(1)

            Spacer()
        }
        .padding(.horizontal, 16)
        .frame(height: 56)
        .background(Color.white.opacity(0.96))
        .overlay(
            Rectangle().fill(Color(hex: 0xE7E5E4)).frame(height: 1),
            alignment: .bottom
        )
    }
}

public struct PavingJossBottomBar: View {
    @Binding public var selectedTab: MobileMainTab

    public init(selectedTab: Binding<MobileMainTab>) {
        self._selectedTab = selectedTab
    }

    public var body: some View {
        HStack(spacing: 0) {
            ForEach(MobileMainTab.allCases) { tab in
                let isSelected = selectedTab == tab
                Button(action: { selectedTab = tab }) {
                    VStack(spacing: 4) {
                        Image(systemName: tab.systemIconName)
                            .font(.system(size: 17, weight: isSelected ? .semibold : .regular))
                        Text(tab.title)
                            .font(.system(size: 11, weight: isSelected ? .bold : .medium))
                            .lineLimit(1)
                    }
                    .foregroundColor(isSelected ? Color(hex: 0x1C1917) : Color(hex: 0xA8A29E))
                    .frame(maxWidth: .infinity, minHeight: 64)
                }
                .buttonStyle(.plain)
            }
        }
        .background(Color.white.opacity(0.98))
        .overlay(
            Rectangle().fill(Color(hex: 0xE7E5E4)).frame(height: 1),
            alignment: .top
        )
    }
}

// MARK: - 5. Tab 0 (Default Leftmost): Dashboard Screen (Empty-First)

public struct DashboardScreenView: View {
    public var onTapAttendance: () -> Void = {}

    public init(onTapAttendance: @escaping () -> Void = {}) {
        self.onTapAttendance = onTapAttendance
    }

    public var body: some View {
        ScrollView {
            VStack(spacing: 12) {
                ModularCard {
                    ModularSectionLabel("Presensi Hari Ini")

                    VStack(spacing: 4) {
                        Text(NeutralEmptyText.placeholderDash)
                            .font(.system(size: 28, weight: .bold, design: .monospaced))
                            .foregroundColor(Color(hex: 0x1C1917))
                        Text(NeutralEmptyText.attendanceNotRecorded)
                            .font(.system(size: 12))
                            .foregroundColor(Color(hex: 0x78716C))
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 8)

                    Button(action: onTapAttendance) {
                        Text("Catat Kehadiran")
                            .font(.system(size: 13, weight: .bold))
                            .foregroundColor(.white)
                            .frame(maxWidth: .infinity, minHeight: 48)
                            .background(Color(hex: 0x1C1917))
                            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                    }
                }

                HStack(spacing: 12) {
                    ModularCard {
                        ModularSectionLabel("Kuota Cuti")
                        Text(NeutralEmptyText.placeholderDash)
                            .font(.system(size: 22, weight: .bold, design: .monospaced))
                            .foregroundColor(Color(hex: 0x1C1917))
                        Text(NeutralEmptyText.noDataYet)
                            .font(.system(size: 12))
                            .foregroundColor(Color(hex: 0x78716C))
                    }

                    ModularCard {
                        ModularSectionLabel("Slip Gaji")
                        Text(NeutralEmptyText.placeholderDash)
                            .font(.system(size: 22, weight: .bold, design: .monospaced))
                            .foregroundColor(Color(hex: 0x1C1917))
                        Text(NeutralEmptyText.notAvailableYet)
                            .font(.system(size: 12))
                            .foregroundColor(Color(hex: 0x78716C))
                    }
                }

                ModularCard {
                    ModularSectionLabel("Aktivitas Terbaru")
                    VStack(spacing: 8) {
                        Image(systemName: "calendar")
                            .font(.system(size: 24))
                            .foregroundColor(Color(hex: 0xD6D3D1))
                        Text(NeutralEmptyText.noActivityHistory)
                            .font(.system(size: 13))
                            .foregroundColor(Color(hex: 0x78716C))
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 20)
                }
            }
            .padding(16)
        }
        .background(Color(hex: 0xFAFAF9))
    }
}

// MARK: - 6. Tab 1: Messages Screen (Empty-First)

public struct MessagesScreenView: View {
    @State private var searchQuery: String = ""
    public init() {}

    public var body: some View {
        ScrollView {
            VStack(spacing: 12) {
                HStack(spacing: 8) {
                    Image(systemName: "magnifyingglass")
                        .font(.system(size: 14))
                        .foregroundColor(Color(hex: 0xA8A29E))
                    TextField("Cari percakapan...", text: $searchQuery)
                        .font(.system(size: 13))
                }
                .padding(.horizontal, 14)
                .frame(height: 46)
                .background(Color.white)
                .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: 14, style: .continuous)
                        .stroke(Color(hex: 0xE7E5E4), lineWidth: 1)
                )

                ModularCard(padding: 28) {
                    VStack(spacing: 8) {
                        Image(systemName: "bubble.left")
                            .font(.system(size: 28))
                            .foregroundColor(Color(hex: 0xD6D3D1))
                        Text(NeutralEmptyText.noConversations)
                            .font(.system(size: 15, weight: .bold))
                            .foregroundColor(Color(hex: 0x1C1917))
                        Text(NeutralEmptyText.messagesConnectHint)
                            .font(.system(size: 12))
                            .foregroundColor(Color(hex: 0x78716C))
                            .multilineTextAlignment(.center)
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 28)
                }
            }
            .padding(16)
        }
        .background(Color(hex: 0xFAFAF9))
    }
}

// MARK: - 7. Tab 2: Shop Floor Screen (Empty-First)

public struct ShopFloorScreenView: View {
    public init() {}

    public var body: some View {
        ScrollView {
            VStack(spacing: 12) {
                ModularCard {
                    ModularSectionLabel("Workstation Aktif")
                    Text("\(NeutralEmptyText.placeholderDash)  ·  \(NeutralEmptyText.noWorkstationSelected)")
                        .font(.system(size: 13, weight: .medium))
                        .foregroundColor(Color(hex: 0x57534E))
                        .padding(.vertical, 4)
                }

                HStack(spacing: 12) {
                    ModularCard {
                        ModularSectionLabel("Target")
                        Text(NeutralEmptyText.placeholderDash)
                            .font(.system(size: 24, weight: .bold, design: .monospaced))
                            .foregroundColor(Color(hex: 0x1C1917))
                    }
                    ModularCard {
                        ModularSectionLabel("Hasil")
                        Text(NeutralEmptyText.placeholderDash)
                            .font(.system(size: 24, weight: .bold, design: .monospaced))
                            .foregroundColor(Color(hex: 0x1C1917))
                    }
                }

                ModularCard {
                    ModularSectionLabel("Antrian Produksi")
                    VStack(spacing: 8) {
                        Image(systemName: "square.stack.3d.up")
                            .font(.system(size: 24))
                            .foregroundColor(Color(hex: 0xD6D3D1))
                        Text(NeutralEmptyText.noProductionQueue)
                            .font(.system(size: 13))
                            .foregroundColor(Color(hex: 0x78716C))
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 24)
                }
            }
            .padding(16)
        }
        .background(Color(hex: 0xFAFAF9))
    }
}

// MARK: - 8. Tab 3: Profile / Hub Screen (Empty-First)

public struct ProfileHubScreenView: View {
    public let onTapLogout: () -> Void
    public init(onTapLogout: @escaping () -> Void) { self.onTapLogout = onTapLogout }

    public var body: some View {
        ScrollView {
            VStack(spacing: 12) {
                ModularCard {
                    ModularSectionLabel("Identitas Pengguna")
                    HStack(spacing: 14) {
                        Circle()
                            .fill(Color(hex: 0xE7E5E4))
                            .frame(width: 48, height: 48)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(NeutralEmptyText.placeholderDash)
                                .font(.system(size: 16, weight: .bold))
                                .foregroundColor(Color(hex: 0x1C1917))
                            Text(NeutralEmptyText.notConnectedToErp)
                                .font(.system(size: 12))
                                .foregroundColor(Color(hex: 0x78716C))
                        }
                    }
                }

                ModularCard(padding: 0) {
                    VStack(alignment: .leading, spacing: 0) {
                        ModularSectionLabel("Akses Modul")
                            .padding(.horizontal, 16)
                            .padding(.top, 16)
                            .padding(.bottom, 8)

                        ForEach(["Preferensi Tampilan", "Informasi Aplikasi", "Tentang Sistem"], id: \.self) { label in
                            HStack {
                                Text(label)
                                    .font(.system(size: 14, weight: .medium))
                                    .foregroundColor(Color(hex: 0x1C1917))
                                Spacer()
                                Image(systemName: "chevron.right")
                                    .font(.system(size: 12, weight: .semibold))
                                    .foregroundColor(Color(hex: 0xA8A29E))
                            }
                            .padding(.horizontal, 16)
                            .padding(.vertical, 14)
                            if label != "Tentang Sistem" {
                                Divider().background(Color(hex: 0xF5F5F4))
                            }
                        }
                    }
                }

                Button(action: onTapLogout) {
                    Text("Keluar")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundColor(Color(hex: 0xB02524))
                        .frame(maxWidth: .infinity, minHeight: 48)
                        .background(Color.white)
                        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                        .overlay(
                            RoundedRectangle(cornerRadius: 16, style: .continuous)
                                .stroke(Color(hex: 0xE7E5E4), lineWidth: 1)
                        )
                }
            }
            .padding(16)
        }
        .background(Color(hex: 0xFAFAF9))
    }
}
