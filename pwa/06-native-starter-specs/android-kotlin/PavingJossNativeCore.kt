//
// PavingJossNativeCore.kt
// Paving Joss ERP — Android Native (Kotlin / Jetpack Compose) Reference Implementation
// Phase 1 Prototype (Auth, HR Portal/ESS, Messages/Forum, Socket.IO & Offline Sync)
// + Phase 2 Foundation (Shop Floor 2-Way & Back-Office Monitor Hub)
//

package com.pavingjoss.erp.core

import androidx.compose.ui.graphics.Color
import java.time.Instant
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import java.util.UUID
import kotlin.math.abs

// ============================================================================
// 1. DESIGN SYSTEM TOKENS (100% Parity with src/index.css)
// ============================================================================

object PavingJossTokens {
    /** Warm Monochrome Industrial Palette (ERP Core, Shop Floor, Messages) */
    object Stone {
        val S50  = Color(0xFFFAFAF9)
        val S100 = Color(0xFFF5F5F4)
        val S200 = Color(0xFFE7E5E4)
        val S300 = Color(0xFFD6D3D1)
        val S400 = Color(0xFFA8A29E)
        val S500 = Color(0xFF78716C)
        val S600 = Color(0xFF57534E)
        val S700 = Color(0xFF44403C)
        val S800 = Color(0xFF292524)
        val S900 = Color(0xFF1C1917) // Primary Brand Surface
        val S950 = Color(0xFF0C0A09)
    }

    /** Airy Frosted Glass Theme (.hris-theme for HR Portal & ESS) */
    object HrisAlabaster {
        val S50  = Color(0xFFF7F7F9) // Primary HRIS Background
        val S100 = Color(0xFFEFEFF3)
        val S200 = Color(0xFFE2E3EA) // Crisp Card Border
        val S300 = Color(0xFFCBCDD6)
        val S400 = Color(0xFF8E929F)
        val S500 = Color(0xFF646876)
        val S600 = Color(0xFF484B57)
        val S700 = Color(0xFF32353E)
        val S800 = Color(0xFF1E2028)
        val S900 = Color(0xFF121318) // Primary HRIS Ink
        val S950 = Color(0xFF0A0B0E)

        val Coral500   = Color(0xFFF25730)
        val Coral600   = Color(0xFFE04620)
        val Emerald500 = Color(0xFF10B981)
        val Emerald600 = Color(0xFF059669)
    }

    /** Brand & Semantic Status Tokens */
    object Brand {
        val Primary       = Color(0xFF1C1917)
        val PrimaryHover  = Color(0xFF292524)
        val LetterheadRed = Color(0xFFB02524) // Strictly for Kop Surat & destructive actions
        val PavingYellow  = Color(0xFFFFD700) // Daily Auth Key icon accent
        val Emerald500    = Color(0xFF10B981)
        val Amber500      = Color(0xFFF59E0B)
        val Red500        = Color(0xFFEF4444)
        val Blue500       = Color(0xFF3B82F6)
    }
}

// ============================================================================
// 2. DETERMINISTIC 6-CHARACTER DAILY AUTH KEY (PIN) GENERATOR
// Matches src/utils/auth.ts bit-for-bit using 32-bit signed Int overflow
// ============================================================================

object DailyAuthKeyGenerator {
    private const val CHARSET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    private val SALTS = intArrayOf(17, 31, 7, 3, 11, 23)

    fun generateForDate(
        username: String?,
        dateStr: String,
        secretSeed: String = "_sec_fhtbs_2026"
    ): String {
        val cleanUsername = username?.trim()?.lowercase() ?: ""
        if (cleanUsername.isEmpty()) return ""

        val seedStr = cleanUsername + dateStr + secretSeed
        var hash = 0 // 32-bit signed Int in Kotlin (matches JS `hash |= 0`)
        for (ch in seedStr) {
            hash = ((hash shl 5) - hash) + ch.code
        }

        val absHash = abs(hash.toLong()).toInt()
        var currentHash = absHash
        val result = StringBuilder(6)

        for (i in 0 until 6) {
            val idx = (currentHash + SALTS[i]) % CHARSET.length
            result.append(CHARSET[idx])
            currentHash /= CHARSET.length
            if (currentHash == 0) {
                currentHash = absHash + (i * 13)
            }
        }
        return result.toString()
    }

    fun todayKey(username: String?, secretSeed: String = "_sec_fhtbs_2026"): String {
        val dateStr = DateTimeFormatter.ISO_LOCAL_DATE
            .withZone(ZoneOffset.UTC)
            .format(Instant.now())
        return generateForDate(username, dateStr, secretSeed)
    }
}

// ============================================================================
// 3. CORE DATA MODELS (Phase 1 Prototype: Auth, ESS/HR Portal, Messages/Forum)
// ============================================================================

enum class MobileAppScope {
    OPERATOR_MOBILE,
    BACKOFFICE_MOBILE
}

data class MobileUser(
    val id: String,
    val username: String,
    val role: String,
    val level: String? = "STAFF",
    val name: String? = null,
    val status: String? = "APPROVED",
    val employee_no: String? = null,
    val work_center_id: String? = null,
    val contract_type: String? = null,
    val join_date: String? = null
)

data class MobileLoginResponse(
    val success: Boolean,
    val token: String,
    val user: MobileUser,
    val app_scope: String,
    val allowed_modules: List<String>
)

data class AttendanceRecord(
    val id: String,
    val employee_username: String,
    val date: String,
    val clock_in: String? = null,
    val clock_out: String? = null,
    val clock_in_location: String? = null,
    val clock_out_location: String? = null,
    val shift: String? = "SHIFT_1",
    val project_id: String? = null,
    val work_hours: Double? = 0.0,
    val overtime_hours: Double? = 0.0,
    val overtime_status: String? = "NONE"
)

data class LeaveRecord(
    val id: String,
    val employee_username: String,
    val leave_type: String,
    val start_date: String,
    val end_date: String,
    val reason: String? = null,
    val status: String = "PENDING",
    val approved_by: String? = null,
    val manager_note: String? = null
)

data class PayslipRecord(
    val id: String,
    val employee_username: String,
    val period_month: String,
    val basic_salary: Double,
    val allowances: Double,
    val deductions: Double,
    val net_salary: Double,
    val status: String
)

data class ChatThread(
    val id: String,
    val name: String? = null,
    val is_group: Int = 0,
    val participant_count: Int = 0,
    val last_message: String? = null,
    val last_message_time: String? = null,
    val last_message_sender: String? = null,
    val unread_count: Int = 0,
    val participants: List<String> = emptyList()
)

data class ChatMessage(
    val id: String,
    val thread_id: String,
    val sender_username: String,
    val content: String? = null,
    val file_url: String? = null,
    val file_name: String? = null,
    val file_type: String? = null,
    val forwarded_from: String? = null,
    val reply_to_id: String? = null,
    val reply_to_sender: String? = null,
    val reply_to_content: String? = null,
    val is_pinned: Int = 0,
    val created_at: String? = null
)

// ============================================================================
// 4. OFFLINE OUTBOX ENTITY (Room Database Schema Reference)
// Mirrors src/lib/localDb.ts & src/hooks/useSyncEngine.ts
// ============================================================================

data class OfflineActionEntity(
    val id: Long = 0,
    val entity: String,           // e.g. "attendance", "leave", "chat_message", "shopfloor_wot"
    val action: String,           // "CREATE" | "UPDATE" | "DELETE"
    val endpoint: String,         // e.g. "/api/hr/leaves"
    val method: String,           // "POST" | "PUT"
    val payloadJson: String,
    val idempotencyKey: String = "android:${UUID.randomUUID()}",
    val timestamp: Long = System.currentTimeMillis(),
    val status: String = "pending", // "pending" | "synced" | "failed"
    val error: String? = null
)
