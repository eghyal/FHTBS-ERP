//
// PavingJossCleanUI.kt
// Paving Joss ERP — Modular Minimalist & Empty-First Jetpack Compose Component Reference
//
// Screens Covered:
// 0. LoginScreen (Centered minimalist white card, official Web ERP logo, Masuk)
// 1. DashboardScreen (Default leftmost tab, structural cards in neutral empty state)
// 2. MessagesScreen (Search field + neutral empty state card)
// 3. ShopFloorScreen (Workstation & production queue in neutral empty state)
// 4. ProfileHubScreen (Neutral identity card, basic menu rows, Keluar button)
//
// NOTE: Zero dummy data, zero API calls. Designed to build completely empty & clean.
//

package com.pavingjoss.erp.ui.clean

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.pavingjoss.erp.core.MobileMainTab
import com.pavingjoss.erp.core.NeutralEmptyText

// ============================================================================
// 1. OFFICIAL WEB ERP LOGO & MODULAR CARD CONTAINER
// ============================================================================

@Composable
fun WebErpLogoImage(
    logoResId: Int, // Pass R.drawable.ic_erp_logo (copy of public/logo.png)
    size: Dp = 28.dp,
    modifier: Modifier = Modifier
) {
    Image(
        painter = painterResource(id = logoResId),
        contentDescription = "Logo Web ERP",
        modifier = modifier.size(size)
    )
}

@Composable
fun ModularCard(
    modifier: Modifier = Modifier,
    padding: Dp = 16.dp,
    content: @Composable ColumnScope.() -> Unit
) {
    Surface(
        shape = RoundedCornerShape(16.dp),
        color = Color.White,
        border = BorderStroke(1.dp, Color(0xFFE7E5E4)),
        modifier = modifier.fillMaxWidth()
    ) {
        Column(
            modifier = Modifier.padding(padding),
            verticalArrangement = Arrangement.spacedBy(10.dp),
            content = content
        )
    }
}

@Composable
fun ModularSectionLabel(text: String) {
    Text(
        text = text.uppercase(),
        fontSize = 11.sp,
        fontWeight = FontWeight.Bold,
        letterSpacing = 0.6.sp,
        color = Color(0xFF78716C)
    )
}

// ============================================================================
// 2. LOGIN SCREEN (MINIMALIST CENTERED WHITE CARD + WEB ERP LOGO)
// ============================================================================

@Composable
fun LoginScreen(
    logoResId: Int,
    onSignInSuccess: () -> Unit,
    modifier: Modifier = Modifier
) {
    var username by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var showPassword by remember { mutableStateOf(false) }

    Box(
        modifier = modifier
            .fillMaxSize()
            .background(Color(0xFFFAFAF9))
            .padding(horizontal = 20.dp),
        contentAlignment = Alignment.Center
    ) {
        Surface(
            shape = RoundedCornerShape(24.dp),
            color = Color.White,
            border = BorderStroke(1.dp, Color(0xFFE7E5E4)),
            shadowElevation = 6.dp,
            modifier = Modifier.fillMaxWidth()
        ) {
            Column(
                modifier = Modifier.padding(28.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(16.dp)
            ) {
                WebErpLogoImage(logoResId = logoResId, size = 64.dp)

                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text(
                        text = "Masuk ke Akun",
                        fontSize = 20.sp,
                        fontWeight = FontWeight.Bold,
                        color = Color(0xFF1C1917)
                    )
                    Spacer(modifier = Modifier.height(4.dp))
                    Text(
                        text = "Portal Operasional Mobile",
                        fontSize = 13.sp,
                        color = Color(0xFF78716C)
                    )
                }

                Column(
                    modifier = Modifier.fillMaxWidth(),
                    verticalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        ModularSectionLabel("Username")
                        OutlinedTextField(
                            value = username,
                            onValueChange = { username = it },
                            placeholder = { Text("Masukkan username", fontSize = 14.sp) },
                            singleLine = true,
                            shape = RoundedCornerShape(12.dp),
                            modifier = Modifier.fillMaxWidth()
                        )
                    }

                    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        ModularSectionLabel("Password")
                        OutlinedTextField(
                            value = password,
                            onValueChange = { password = it },
                            placeholder = { Text("Masukkan password", fontSize = 14.sp) },
                            singleLine = true,
                            visualTransformation = if (showPassword) VisualTransformation.None else PasswordVisualTransformation(),
                            trailingIcon = {
                                TextButton(onClick = { showPassword = !showPassword }) {
                                    Text(if (showPassword) "Tutup" else "Lihat", fontSize = 11.sp, color = Color(0xFF78716C))
                                }
                            },
                            shape = RoundedCornerShape(12.dp),
                            modifier = Modifier.fillMaxWidth()
                        )
                    }

                    Button(
                        onClick = onSignInSuccess,
                        shape = RoundedCornerShape(12.dp),
                        colors = ButtonDefaults.buttonColors(
                            containerColor = Color(0xFF1C1917),
                            contentColor = Color.White
                        ),
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(48.dp)
                    ) {
                        Text(
                            text = "Masuk",
                            fontSize = 14.sp,
                            fontWeight = FontWeight.Bold
                        )
                    }
                }
            }
        }
    }
}

// ============================================================================
// 3. COMPACT TOP APP BAR (56dp) & 4-TAB BOTTOM NAVIGATION BAR (64dp)
// ============================================================================

@Composable
fun PavingJossTopBar(
    logoResId: Int,
    title: String,
    modifier: Modifier = Modifier
) {
    Surface(
        modifier = modifier
            .fillMaxWidth()
            .height(56.dp),
        color = Color.White,
        border = BorderStroke(1.dp, Color(0xFFE7E5E4))
    ) {
        Row(
            modifier = Modifier
                .fillMaxSize()
                .padding(horizontal = 16.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            WebErpLogoImage(logoResId = logoResId, size = 28.dp)
            Text(
                text = title,
                fontSize = 16.sp,
                fontWeight = FontWeight.Bold,
                color = Color(0xFF1C1917),
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
        }
    }
}

@Composable
fun PavingJossBottomBar(
    selectedTab: MobileMainTab,
    onSelectTab: (MobileMainTab) -> Unit,
    modifier: Modifier = Modifier
) {
    Surface(
        modifier = modifier
            .fillMaxWidth()
            .height(64.dp),
        color = Color.White,
        border = BorderStroke(1.dp, Color(0xFFE7E5E4))
    ) {
        Row(modifier = Modifier.fillMaxSize()) {
            MobileMainTab.orderedTabs.forEach { tab ->
                val isSelected = tab == selectedTab
                Box(
                    modifier = Modifier
                        .weight(1f)
                        .fillMaxHeight()
                        .clickable { onSelectTab(tab) },
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        text = tab.tabLabel,
                        fontSize = 11.sp,
                        fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Medium,
                        color = if (isSelected) Color(0xFF1C1917) else Color(0xFFA8A29E),
                        maxLines = 1
                    )
                }
            }
        }
    }
}

// ============================================================================
// 4. TAB 0 (DEFAULT LEFTMOST): DASHBOARD SCREEN (EMPTY-FIRST)
// ============================================================================

@Composable
fun DashboardScreen(onTapAttendance: () -> Unit = {}) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(Color(0xFFFAFAF9))
            .verticalScroll(rememberScrollState())
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        ModularCard {
            ModularSectionLabel("Presensi Hari Ini")
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(vertical = 8.dp),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                Text(
                    text = NeutralEmptyText.PLACEHOLDER_DASH,
                    fontSize = 28.sp,
                    fontWeight = FontWeight.Bold,
                    fontFamily = FontFamily.Monospace,
                    color = Color(0xFF1C1917)
                )
                Text(
                    text = NeutralEmptyText.ATTENDANCE_NOT_RECORDED,
                    fontSize = 12.sp,
                    color = Color(0xFF78716C)
                )
            }
            Button(
                onClick = onTapAttendance,
                shape = RoundedCornerShape(12.dp),
                colors = ButtonDefaults.buttonColors(
                    containerColor = Color(0xFF1C1917),
                    contentColor = Color.White
                ),
                modifier = Modifier
                    .fillMaxWidth()
                    .height(48.dp)
            ) {
                Text("Catat Kehadiran", fontSize = 13.sp, fontWeight = FontWeight.Bold)
            }
        }

        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            ModularCard(modifier = Modifier.weight(1f)) {
                ModularSectionLabel("Kuota Cuti")
                Text(
                    text = NeutralEmptyText.PLACEHOLDER_DASH,
                    fontSize = 22.sp,
                    fontWeight = FontWeight.Bold,
                    fontFamily = FontFamily.Monospace,
                    color = Color(0xFF1C1917)
                )
                Text(NeutralEmptyText.NO_DATA_YET, fontSize = 12.sp, color = Color(0xFF78716C))
            }

            ModularCard(modifier = Modifier.weight(1f)) {
                ModularSectionLabel("Slip Gaji")
                Text(
                    text = NeutralEmptyText.PLACEHOLDER_DASH,
                    fontSize = 22.sp,
                    fontWeight = FontWeight.Bold,
                    fontFamily = FontFamily.Monospace,
                    color = Color(0xFF1C1917)
                )
                Text(NeutralEmptyText.NOT_AVAILABLE_YET, fontSize = 12.sp, color = Color(0xFF78716C))
            }
        }

        ModularCard {
            ModularSectionLabel("Aktivitas Terbaru")
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(vertical = 24.dp),
                contentAlignment = Alignment.Center
            ) {
                Text(
                    text = NeutralEmptyText.NO_ACTIVITY_HISTORY,
                    fontSize = 13.sp,
                    color = Color(0xFF78716C)
                )
            }
        }
    }
}

// ============================================================================
// 5. TAB 1: MESSAGES SCREEN (EMPTY-FIRST)
// ============================================================================

@Composable
fun MessagesScreen() {
    var searchQuery by remember { mutableStateOf("") }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(Color(0xFFFAFAF9))
            .verticalScroll(rememberScrollState())
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        OutlinedTextField(
            value = searchQuery,
            onValueChange = { searchQuery = it },
            placeholder = { Text("Cari percakapan...", fontSize = 13.sp) },
            singleLine = true,
            shape = RoundedCornerShape(14.dp),
            modifier = Modifier.fillMaxWidth()
        )

        ModularCard(padding = 28.dp) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(vertical = 28.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(6.dp)
            ) {
                Text(
                    text = NeutralEmptyText.NO_CONVERSATIONS,
                    fontSize = 15.sp,
                    fontWeight = FontWeight.Bold,
                    color = Color(0xFF1C1917)
                )
                Text(
                    text = NeutralEmptyText.MESSAGES_CONNECT_HINT,
                    fontSize = 12.sp,
                    color = Color(0xFF78716C),
                    textAlign = TextAlign.Center
                )
            }
        }
    }
}

// ============================================================================
// 6. TAB 2: SHOP FLOOR SCREEN (EMPTY-FIRST)
// ============================================================================

@Composable
fun ShopFloorScreen() {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(Color(0xFFFAFAF9))
            .verticalScroll(rememberScrollState())
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        ModularCard {
            ModularSectionLabel("Workstation Aktif")
            Text(
                text = "${NeutralEmptyText.PLACEHOLDER_DASH}  ·  ${NeutralEmptyText.NO_WORKSTATION_SELECTED}",
                fontSize = 13.sp,
                color = Color(0xFF57534E)
            )
        }

        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            ModularCard(modifier = Modifier.weight(1f)) {
                ModularSectionLabel("Target")
                Text(
                    text = NeutralEmptyText.PLACEHOLDER_DASH,
                    fontSize = 24.sp,
                    fontWeight = FontWeight.Bold,
                    fontFamily = FontFamily.Monospace,
                    color = Color(0xFF1C1917)
                )
            }
            ModularCard(modifier = Modifier.weight(1f)) {
                ModularSectionLabel("Hasil")
                Text(
                    text = NeutralEmptyText.PLACEHOLDER_DASH,
                    fontSize = 24.sp,
                    fontWeight = FontWeight.Bold,
                    fontFamily = FontFamily.Monospace,
                    color = Color(0xFF1C1917)
                )
            }
        }

        ModularCard {
            ModularSectionLabel("Antrian Produksi")
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(vertical = 24.dp),
                contentAlignment = Alignment.Center
            ) {
                Text(
                    text = NeutralEmptyText.NO_PRODUCTION_QUEUE,
                    fontSize = 13.sp,
                    color = Color(0xFF78716C)
                )
            }
        }
    }
}

// ============================================================================
// 7. TAB 3: PROFILE / HUB SCREEN (EMPTY-FIRST)
// ============================================================================

@Composable
fun ProfileHubScreen(onTapLogout: () -> Unit) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(Color(0xFFFAFAF9))
            .verticalScroll(rememberScrollState())
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        ModularCard {
            ModularSectionLabel("Identitas Pengguna")
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(14.dp)
            ) {
                Box(
                    modifier = Modifier
                        .size(48.dp)
                        .clip(CircleShape)
                        .background(Color(0xFFE7E5E4))
                )
                Column {
                    Text(
                        text = NeutralEmptyText.PLACEHOLDER_DASH,
                        fontSize = 16.sp,
                        fontWeight = FontWeight.Bold,
                        color = Color(0xFF1C1917)
                    )
                    Text(
                        text = NeutralEmptyText.NOT_CONNECTED_TO_ERP,
                        fontSize = 12.sp,
                        color = Color(0xFF78716C)
                    )
                }
            }
        }

        ModularCard(padding = 0.dp) {
            Column {
                Box(modifier = Modifier.padding(start = 16.dp, end = 16.dp, top = 16.dp, bottom = 8.dp)) {
                    ModularSectionLabel("Akses Modul")
                }
                listOf("Preferensi Tampilan", "Informasi Aplikasi", "Tentang Sistem").forEachIndexed { idx, label ->
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 16.dp, vertical = 14.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(label, fontSize = 14.sp, color = Color(0xFF1C1917))
                        Text("›", fontSize = 16.sp, color = Color(0xFFA8A29E))
                    }
                    if (idx < 2) {
                        HorizontalDivider(color = Color(0xFFF5F5F4))
                    }
                }
            }
        }

        OutlinedButton(
            onClick = onTapLogout,
            shape = RoundedCornerShape(16.dp),
            border = BorderStroke(1.dp, Color(0xFFE7E5E4)),
            colors = ButtonDefaults.outlinedButtonColors(containerColor = Color.White),
            modifier = Modifier
                .fillMaxWidth()
                .height(48.dp)
        ) {
            Text(
                text = "Keluar",
                fontSize = 14.sp,
                fontWeight = FontWeight.SemiBold,
                color = Color(0xFFB02524)
            )
        }
    }
}
