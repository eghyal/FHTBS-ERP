//
// PavingJossNativeCore.kt
// Paving Joss ERP — Android Native (Kotlin / Jetpack Compose) UI/UX Foundation Spec
// Focus: Modular Minimalist Card System, Official Web ERP Logo, Zero-Data Empty-First Shell
//
// NOTE: Backend API clients, Room sync entities, and PostgreSQL integration are intentionally
// excluded in Phase 1 and deferred to the Final Phase per PRD roadmap.
//

package com.pavingjoss.erp.core

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp

// ============================================================================
// 1. MODULAR MINIMALIST DESIGN TOKENS
// ============================================================================

object PavingJossTokens {
    /** Warm Monochrome Canvas & Surface Palette */
    object Stone {
        val S50  = Color(0xFFFAFAF9) // Primary Canvas Background
        val S100 = Color(0xFFF5F5F4) // Subtle Input / Secondary Surface
        val S200 = Color(0xFFE7E5E4) // 1dp Card Hairline Border
        val S300 = Color(0xFFD6D3D1)
        val S400 = Color(0xFFA8A29E) // Inactive Tab / Placeholder
        val S500 = Color(0xFF78716C) // Muted Label / Empty Caption
        val S600 = Color(0xFF57534E)
        val S700 = Color(0xFF44403C)
        val S800 = Color(0xFF292524)
        val S900 = Color(0xFF1C1917) // Primary Ink & Primary CTA
    }

    /** Official Web ERP Brand Tokens */
    object Brand {
        val PrimaryAction = Color(0xFF1C1917)
        val ErpLogoRed    = Color(0xFFCC0000) // Matches public/logo.png 'P'
        val ErpLogoAmber  = Color(0xFFF59E0B) // Matches public/logo.png 'J'
        val LogoutCrimson = Color(0xFFB02524)
        const val LIGHT_LOGO_RESOURCE = "ic_erp_logo"     // Copy of public/logo.png
        const val DARK_LOGO_RESOURCE  = "ic_erp_dm_logo"  // Copy of public/dm_logo.png
    }

    /** Modular Card Geometry & Spacing */
    object Layout {
        val ScreenHorizontalPadding = 16.dp
        val CardSpacing = 12.dp
        val CardPadding = 16.dp
        val CardCornerRadius = 16.dp
        val LoginCardCornerRadius = 24.dp
        val InputCornerRadius = 12.dp
        val PrimaryButtonHeight = 48.dp
        val TopBarHeight = 56.dp
        val BottomBarHeight = 64.dp
    }
}

// ============================================================================
// 2. NAVIGATION ROUTE & BOTTOM TAB ORDER (LEFT-TO-RIGHT)
// ============================================================================

enum class MobileRootRoute {
    LOGIN,
    APP_SHELL
}

/** Exact Bottom Tab Order: Dashboard (Default Leftmost) -> Messages -> Shop Floor -> Profile/Hub */
enum class MobileMainTab(
    val index: Int,
    val tabLabel: String,
    val screenTitle: String
) {
    DASHBOARD(0, "Dashboard", "Dashboard"),
    MESSAGES(1, "Messages", "Messages"),
    SHOP_FLOOR(2, "Shop Floor", "Shop Floor"),
    PROFILE_HUB(3, "Profile/Hub", "Profile / Hub");

    companion object {
        val orderedTabs: List<MobileMainTab> = listOf(
            DASHBOARD,
            MESSAGES,
            SHOP_FLOOR,
            PROFILE_HUB
        )
    }
}

// ============================================================================
// 3. PURE UI SHELL STATE HOLDER (NO BACKEND / NO DUMMY DATA)
// ============================================================================

class MobileUiShellState {
    var rootRoute: MobileRootRoute by mutableStateOf(MobileRootRoute.LOGIN)
        private set

    var selectedTab: MobileMainTab by mutableStateOf(MobileMainTab.DASHBOARD)
        private set

    fun enterDashboardShell() {
        selectedTab = MobileMainTab.DASHBOARD // Always land on leftmost Dashboard tab
        rootRoute = MobileRootRoute.APP_SHELL
    }

    fun selectTab(tab: MobileMainTab) {
        selectedTab = tab
    }

    fun returnToLogin() {
        rootRoute = MobileRootRoute.LOGIN
        selectedTab = MobileMainTab.DASHBOARD
    }
}

// ============================================================================
// 4. NEUTRAL EMPTY-STATE DISPLAY CONSTANTS (ZERO DUMMY DATA)
// ============================================================================

object NeutralEmptyText {
    const val PLACEHOLDER_DASH = "—"
    const val ATTENDANCE_NOT_RECORDED = "Belum tercatat"
    const val NO_DATA_YET = "Belum ada data"
    const val NOT_AVAILABLE_YET = "Belum tersedia"
    const val NO_ACTIVITY_HISTORY = "Belum ada riwayat aktivitas"
    const val NO_CONVERSATIONS = "Belum ada percakapan"
    const val MESSAGES_CONNECT_HINT = "Pesan tim akan tampil di sini setelah terhubung dengan sistem."
    const val NO_WORKSTATION_SELECTED = "Belum ada stasiun kerja dipilih"
    const val NO_PRODUCTION_QUEUE = "Belum ada tugas produksi aktif"
    const val NOT_CONNECTED_TO_ERP = "Belum terhubung ke akun ERP"
}
