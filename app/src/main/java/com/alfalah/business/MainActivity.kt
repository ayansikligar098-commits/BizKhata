package com.alfalah.business

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Assessment
import androidx.compose.material.icons.filled.Build
import androidx.compose.material.icons.filled.Chat
import androidx.compose.material.icons.filled.Dashboard
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Description
import androidx.compose.material.icons.filled.GridView
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Menu
import androidx.compose.material.icons.filled.MoreHoriz
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.People
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Receipt
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.SwapHoriz
import androidx.compose.material.icons.filled.Tune
import androidx.compose.material.icons.filled.Wallet
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.DrawerValue
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ModalDrawerSheet
import androidx.compose.material3.ModalNavigationDrawer
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.NavigationDrawerItem
import androidx.compose.material3.NavigationDrawerItemDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.material3.rememberDrawerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import com.alfalah.business.data.SettingsStore
import com.alfalah.business.data.entity.BusinessProfileEntity
import com.alfalah.business.domain.AppLanguage
import com.alfalah.business.domain.Branding
import com.alfalah.business.domain.BusinessCategory
import com.alfalah.business.domain.ServiceType
import com.alfalah.business.navigation.Routes
import com.alfalah.business.ui.agents.AgentDetailScreen
import com.alfalah.business.ui.agents.AgentScreen
import com.alfalah.business.ui.auth.AuthScreen
import com.alfalah.business.ui.cashbook.CashBookScreen
import com.alfalah.business.ui.cashbook.DifferenceFinderScreen
import com.alfalah.business.ui.chatbot.ChatbotScreen
import com.alfalah.business.ui.dashboard.DashboardScreen
import com.alfalah.business.ui.dashboard.DashboardViewModel
import com.alfalah.business.ui.dailybusiness.DailyBusinessScreen
import com.alfalah.business.ui.dailybusiness.DailyBusinessViewModel
import com.alfalah.business.ui.expenses.ExpensesScreen
import com.alfalah.business.ui.expenses.MaintenanceScreen
import com.alfalah.business.ui.khata.CustomerDetailScreen
import com.alfalah.business.ui.khata.KhataScreen
import com.alfalah.business.ui.language.LanguageScreen
import com.alfalah.business.ui.moneytransfer.MoneyTransferScreen
import com.alfalah.business.ui.receipts.ReceiptsScreen
import com.alfalah.business.ui.reports.ReportsScreen
import com.alfalah.business.ui.services.ServiceJobsScreen
import com.alfalah.business.ui.services.ServicesScreen
import com.alfalah.business.ui.settings.AuditLogScreen
import com.alfalah.business.ui.settings.CategoryPickScreen
import com.alfalah.business.ui.settings.CustomizationScreen
import com.alfalah.business.ui.settings.RecycleBinScreen
import com.alfalah.business.ui.settings.SettingsScreen
import com.alfalah.business.ui.theme.BizColors
import com.alfalah.business.ui.theme.BizKhataTheme
import kotlinx.coroutines.launch

/**
 * Entry point — native Compose navigation only, no WebView.
 * Shell: dark navy top bar (logo + bell + avatar), left navigation drawer
 * (reference screen 2), bottom navigation (Home, Services, centre +,
 * Reports, More). First run: Language → Category pick → mobile + PIN
 * → Dashboard. After that the Dashboard is the start screen; if a PIN
 * is set, the PIN screen unlocks the app first.
 */
class MainActivity : ComponentActivity() {

    @OptIn(ExperimentalMaterial3Api::class)
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val app = application as AlFalahApp
        val settings = SettingsStore(this)

        setContent {
            val language by settings.language.collectAsState(initial = AppLanguage.ENGLISH)
            val themeMode by settings.themeMode.collectAsState(initial = SettingsStore.ThemeMode.SYSTEM)
            val darkTheme = when (themeMode) {
                SettingsStore.ThemeMode.DARK -> true
                SettingsStore.ThemeMode.LIGHT -> false
                SettingsStore.ThemeMode.SYSTEM -> androidx.compose.foundation.isSystemInDarkTheme()
            }
            val profiles by app.repository.observeProfiles().collectAsState(initial = emptyList())
            val activeProfileId by settings.activeProfileId.collectAsState(initial = -1L)
            val hasPin by settings.hasPin.collectAsState(initial = false)
            val savedMobile by settings.mobile.collectAsState(initial = "")
            val geminiApiKey by settings.geminiApiKey.collectAsState(initial = "")            var unlocked by remember { mutableStateOf(false) }

            // The active profile: the one the user picked, else the first one.
            // Profiles are strictly isolated — every screen gets this id.
            val activeProfile: BusinessProfileEntity? =
                profiles.firstOrNull { it.id == activeProfileId } ?: profiles.firstOrNull()

            BizKhataTheme(darkTheme = darkTheme) {
                val nav = rememberNavController()
                val scope = rememberCoroutineScope()
                val drawerState = rememberDrawerState(initialValue = DrawerValue.Closed)
                var showQuickAdd by remember { mutableStateOf(false) }
                val backStack by nav.currentBackStackEntryAsState()
                val currentRoute = backStack?.destination?.route

                val start = when {
                    profiles.isEmpty() -> Routes.LANGUAGE
                    hasPin && !unlocked -> Routes.AUTH
                    else -> Routes.DASHBOARD
                }
                val inOnboarding = currentRoute == Routes.LANGUAGE ||
                    currentRoute == Routes.AUTH || currentRoute == Routes.CATEGORY_PICK
                val onDashboard = currentRoute == Routes.DASHBOARD

                fun go(route: String) {
                    scope.launch { drawerState.close() }
                    nav.navigate(route) {
                        if (route == Routes.DASHBOARD) popUpTo(Routes.DASHBOARD) { inclusive = false }
                        launchSingleTop = true
                    }
                }

                ModalNavigationDrawer(
                    drawerState = drawerState,
                    gesturesEnabled = !inOnboarding,
                    drawerContent = {
                        ModalDrawerSheet {
                            DrawerContent(
                                profile = activeProfile,
                                profiles = profiles,
                                activeProfileId = activeProfile?.id ?: -1L,
                                savedMobile = savedMobile,
                                onProfile = { id -> scope.launch { settings.setActiveProfile(id) } },
                                onNavigate = ::go
                            )
                        }
                    }
                ) {
                    Scaffold(
                        // Chatbot FAB: purple chat button, fixed bottom-right
                        // on the Dashboard only — the main home of the chatbot.
                        // Other screens reach it from the drawer / More menu.
                        floatingActionButton = {
                            if (!inOnboarding && onDashboard) {
                                FloatingActionButton(
                                    onClick = { go(Routes.CHATBOT) },
                                    containerColor = BizColors.Purple,
                                    contentColor = Color.White
                                ) {
                                    Icon(Icons.Filled.Chat, contentDescription = "Chatbot — BizKhata Assistant")
                                }
                            }
                        },
                        topBar = {
                            if (!inOnboarding) {
                                TopAppBar(
                                    title = {
                                        Row(verticalAlignment = Alignment.CenterVertically) {
                                            Box(
                                                Modifier.size(36.dp).clip(CircleShape)
                                                    .background(BizColors.Purple),
                                                contentAlignment = Alignment.Center
                                            ) {
                                                Text("B", color = Color.White, fontWeight = FontWeight.Bold, fontSize = 18.sp)
                                            }
                                            Spacer(Modifier.width(10.dp))
                                            Column {
                                                Text(Branding.APP_NAME, color = Color.White, fontWeight = FontWeight.Bold, fontSize = 18.sp)
                                                Text("Business Management", color = Color.White.copy(alpha = 0.8f), fontSize = 12.sp)
                                            }
                                        }
                                    },
                                    navigationIcon = {
                                        if (onDashboard) {
                                            IconButton(onClick = { scope.launch { drawerState.open() } }) {
                                                Icon(Icons.Filled.Menu, contentDescription = "Menu", tint = Color.White)
                                            }
                                        } else if (nav.previousBackStackEntry != null) {
                                            IconButton(onClick = { nav.popBackStack() }) {
                                                Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back", tint = Color.White)
                                            }
                                        }
                                    },
                                    actions = {
                                        IconButton(onClick = { /* Notifications: no alerts yet — empty state lives in-app. */ }) {
                                            Icon(Icons.Filled.Notifications, contentDescription = "Notifications", tint = Color.White)
                                        }
                                        Box(
                                            Modifier.size(36.dp).clip(CircleShape).background(Color.White.copy(alpha = 0.2f)),
                                            contentAlignment = Alignment.Center
                                        ) {
                                            Icon(Icons.Filled.Person, contentDescription = "Account", tint = Color.White)
                                        }
                                        Spacer(Modifier.width(8.dp))
                                    },
                                    colors = TopAppBarDefaults.topAppBarColors(containerColor = BizColors.Navy)
                                )
                            }
                        },
                        bottomBar = {
                            if (!inOnboarding) {
                                NavigationBar(containerColor = androidx.compose.material3.MaterialTheme.colorScheme.surface) {
                                    NavigationBarItem(
                                        selected = currentRoute == Routes.DASHBOARD,
                                        onClick = { go(Routes.DASHBOARD) },
                                        icon = { Icon(Icons.Filled.Home, contentDescription = "Home") },
                                        label = { Text("Home") },
                                        colors = navItemColors()
                                    )
                                    NavigationBarItem(
                                        selected = currentRoute == Routes.SERVICES ||
                                            (currentRoute?.startsWith("service/") == true),
                                        onClick = { go(Routes.SERVICES) },
                                        icon = { Icon(Icons.Filled.GridView, contentDescription = "Services") },
                                        label = { Text("Services") },
                                        colors = navItemColors()
                                    )
                                    NavigationBarItem(
                                        selected = false,
                                        onClick = { showQuickAdd = true },
                                        icon = {
                                            Box(
                                                Modifier.size(52.dp).clip(CircleShape).background(BizColors.Purple),
                                                contentAlignment = Alignment.Center
                                            ) {
                                                Icon(Icons.Filled.Add, contentDescription = "Add", tint = Color.White, modifier = Modifier.size(28.dp))
                                            }
                                        },
                                        label = { Text("") },
                                        colors = navItemColors()
                                    )
                                    NavigationBarItem(
                                        selected = currentRoute == Routes.REPORTS,
                                        onClick = { go(Routes.REPORTS) },
                                        icon = { Icon(Icons.Filled.Assessment, contentDescription = "Reports") },
                                        label = { Text("Reports") },
                                        colors = navItemColors()
                                    )
                                    NavigationBarItem(
                                        selected = false,
                                        onClick = { scope.launch { drawerState.open() } },
                                        icon = { Icon(Icons.Filled.MoreHoriz, contentDescription = "More") },
                                        label = { Text("More") },
                                        colors = navItemColors()
                                    )
                                }
                            }
                        }
                    ) { padding ->
                        key(start) {
                            NavHost(
                                navController = nav,
                                startDestination = start,
                                modifier = Modifier.padding(padding)
                            ) {
                                composable(Routes.LANGUAGE) {
                                    LanguageScreen(language = language) { chosen ->
                                        scope.launch {
                                            settings.setLanguage(chosen)
                                            nav.navigate(Routes.CATEGORY_PICK)
                                        }
                                    }
                                }
                                composable(Routes.AUTH) {
                                    AuthScreen(
                                        hasPin = hasPin,
                                        savedMobile = savedMobile,
                                        onCreatePin = { mobile, pin ->
                                            scope.launch {
                                                settings.setPin(mobile, pin)
                                                unlocked = true
                                                nav.navigate(Routes.DASHBOARD) {
                                                    popUpTo(Routes.AUTH) { inclusive = true }
                                                }
                                            }
                                        },
                                        onUnlock = { pin, onWrong ->
                                            scope.launch {
                                                if (settings.verifyPin(pin)) {
                                                    unlocked = true
                                                    nav.navigate(Routes.DASHBOARD) {
                                                        popUpTo(Routes.AUTH) { inclusive = true }
                                                    }
                                                } else {
                                                    onWrong()
                                                }
                                            }
                                        },
                                        onUnlocked = {
                                            unlocked = true
                                            nav.navigate(Routes.DASHBOARD) {
                                                popUpTo(Routes.AUTH) { inclusive = true }
                                            }
                                        }
                                    )
                                }
                                composable(Routes.CATEGORY_PICK) {
                                    CategoryPickScreen(language = language) { category ->
                                        scope.launch {
                                            val id = app.repository.addProfile(
                                                BusinessProfileEntity(
                                                    name = if (category == BusinessCategory.CSC)
                                                        Branding.OWNER_BUSINESS_NAME else "",
                                                    category = category
                                                )
                                            )
                                            settings.setActiveProfile(id)
                                            nav.navigate(Routes.AUTH) {
                                                popUpTo(Routes.LANGUAGE) { inclusive = true }
                                            }
                                        }
                                    }
                                }
                                composable(Routes.DASHBOARD) {
                                    val profile = activeProfile ?: return@composable
                                    val vm: DashboardViewModel = viewModel(
                                        factory = vmFactory { DashboardViewModel(profile.id, app.repository) }
                                    )
                                    val period by vm.period.collectAsState()
                                    DashboardScreen(
                                        state = vm.state.collectAsState().value,
                                        period = period,
                                        onPeriod = { vm.selectPeriod(it) },
                                        language = language,
                                        profileName = profile.name.ifBlank { Branding.OWNER_BUSINESS_NAME },
                                        profileType = "${profile.category.label}",
                                        onOpen = { route -> nav.navigate(route) }
                                    )
                                }
                                composable(Routes.SERVICES) {
                                    ServicesScreen(onOpenService = { route -> nav.navigate(route) })
                                }
                                composable(Routes.CASH_BOOK) {
                                    val profile = activeProfile ?: return@composable
                                    CashBookScreen(profileId = profile.id, repository = app.repository, language = language, mode = "CASH")
                                }
                                composable(Routes.UPI_BOOK) {
                                    val profile = activeProfile ?: return@composable
                                    CashBookScreen(profileId = profile.id, repository = app.repository, language = language, mode = "UPI")
                                }
                                composable(Routes.MONEY_TRANSFER) {
                                    val profile = activeProfile ?: return@composable
                                    MoneyTransferScreen(profileId = profile.id, repository = app.repository, language = language)
                                }
                                composable(Routes.SERVICE) { backStackEntry ->
                                    val profile = activeProfile ?: return@composable
                                    val serviceName = backStackEntry.arguments?.getString("service") ?: "PAN"
                                    ServiceJobsScreen(
                                        profileId = profile.id,
                                        repository = app.repository,
                                        language = language,
                                        service = ServiceType.valueOf(serviceName),
                                        onOpenCustomer = { id -> nav.navigate(Routes.customerDetail(id)) }
                                    )
                                }
                                composable(Routes.CUSTOMER_DETAIL) { backStackEntry ->
                                    val profile = activeProfile ?: return@composable
                                    val customerId = backStackEntry.arguments?.getString("customerId")?.toLongOrNull() ?: return@composable
                                    CustomerDetailScreen(
                                        profileId = profile.id,
                                        customerId = customerId,
                                        repository = app.repository,
                                        language = language,
                                        onAddJob = { service -> nav.navigate(Routes.service(service)) }
                                    )
                                }
                                composable(Routes.KHATA) {
                                    val profile = activeProfile ?: return@composable
                                    KhataScreen(
                                        profileId = profile.id,
                                        repository = app.repository,
                                        language = language,
                                        onOpenCustomer = { id -> nav.navigate(Routes.customerDetail(id)) }
                                    )
                                }
                                composable(Routes.AGENTS) {
                                    val profile = activeProfile ?: return@composable
                                    AgentScreen(
                                        profileId = profile.id,
                                        repository = app.repository,
                                        language = language,
                                        onOpenAgent = { id -> nav.navigate(Routes.agentDetail(id)) }
                                    )
                                }
                                composable(Routes.AGENT_DETAIL) { backStackEntry ->
                                    val profile = activeProfile ?: return@composable
                                    val agentId = backStackEntry.arguments?.getString("agentId")?.toLongOrNull() ?: return@composable
                                    AgentDetailScreen(
                                        profileId = profile.id,
                                        agentId = agentId,
                                        repository = app.repository,
                                        language = language
                                    )
                                }
                                composable(Routes.EXPENSES) {
                                    val profile = activeProfile ?: return@composable
                                    ExpensesScreen(
                                        profileId = profile.id,
                                        repository = app.repository,
                                        language = language,
                                        onOpenMaintenance = { nav.navigate(Routes.MAINTENANCE) }
                                    )
                                }
                                composable(Routes.MAINTENANCE) {
                                    val profile = activeProfile ?: return@composable
                                    MaintenanceScreen(profileId = profile.id, repository = app.repository, language = language)
                                }
                                composable(Routes.RECEIPTS) {
                                    val profile = activeProfile ?: return@composable
                                    ReceiptsScreen(
                                        profileId = profile.id,
                                        repository = app.repository,
                                        language = language,
                                        businessName = profile.name.ifBlank { Branding.OWNER_BUSINESS_NAME }
                                    )
                                }
                                composable(Routes.DAILY_BUSINESS) {
                                    val profile = activeProfile ?: return@composable
                                    val vm: DailyBusinessViewModel = viewModel(
                                        factory = vmFactory { DailyBusinessViewModel(profile.id, app.repository, settings) }
                                    )
                                    DailyBusinessScreen(
                                        profileId = profile.id,
                                        repository = app.repository,
                                        settings = settings,
                                        language = language,
                                        viewModel = vm,
                                        onOpen = { route -> nav.navigate(route) }
                                    )
                                }
                                composable(Routes.REPORTS) {
                                    val profile = activeProfile ?: return@composable
                                    ReportsScreen(profileId = profile.id, repository = app.repository, language = language)
                                }
                                composable(Routes.CHATBOT) {
                                    val profile = activeProfile ?: return@composable
                                    ChatbotScreen(
                                        profileId = profile.id,
                                        repository = app.repository,
                                        settings = settings,
                                        language = language,
                                        onOpenSettings = { nav.navigate(Routes.SETTINGS) }
                                    )
                                }
                                composable(Routes.DIFFERENCE_FINDER) {
                                    val profile = activeProfile ?: return@composable
                                    DifferenceFinderScreen(profileId = profile.id, repository = app.repository, language = language)
                                }
                                composable(Routes.AUDIT_LOG) {
                                    val profile = activeProfile ?: return@composable
                                    AuditLogScreen(profileId = profile.id, repository = app.repository, language = language)
                                }
                                composable(Routes.RECYCLE_BIN) {
                                    val profile = activeProfile ?: return@composable
                                    RecycleBinScreen(profileId = profile.id, repository = app.repository, language = language)
                                }
                                composable(Routes.CUSTOMIZATION) {
                                    CustomizationScreen(settings = settings, language = language)
                                }
                                composable(Routes.SETTINGS) {
                                    val profile = activeProfile ?: return@composable
                                    SettingsScreen(
                                        profileId = profile.id,
                                        language = language,
                                        themeMode = themeMode,
                                        profiles = profiles,
                                        activeProfileId = activeProfile?.id ?: -1L,
                                        onLanguage = { l -> scope.launch { settings.setLanguage(l) } },
                                        onThemeMode = { m -> scope.launch { settings.setThemeMode(m) } },
                                        onProfile = { id -> scope.launch { settings.setActiveProfile(id) } },
                                        onOpen = { route -> nav.navigate(route) },
                                        onRemovePin = { scope.launch { settings.clearPin() } },
                                        geminiApiKey = geminiApiKey,
                                        onSaveGeminiKey = { key -> scope.launch { settings.setGeminiApiKey(key) } },
                                        onClearGeminiKey = { scope.launch { settings.clearGeminiApiKey() } }
                                    )
                                }
                            }
                        }
                    }
                }
                if (showQuickAdd) {
                    AlertDialog(
                        onDismissRequest = { showQuickAdd = false },
                        title = { Text("Quick Add") },
                        text = {
                            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                Text("What do you want to add?", style = androidx.compose.material3.MaterialTheme.typography.bodyMedium)
                            }
                        },
                        confirmButton = {
                            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                TextButton(
                                    onClick = { showQuickAdd = false; nav.navigate(Routes.DAILY_BUSINESS) }
                                ) { Text("New Daily Entry") }
                                TextButton(
                                    onClick = { showQuickAdd = false; nav.navigate(Routes.SERVICES) }
                                ) { Text("New Service Job") }
                                TextButton(
                                    onClick = { showQuickAdd = false; nav.navigate(Routes.MONEY_TRANSFER) }
                                ) { Text("New Money Transfer") }
                                TextButton(
                                    onClick = { showQuickAdd = false; nav.navigate(Routes.EXPENSES) }
                                ) { Text("New Expense") }
                                TextButton(
                                    onClick = { showQuickAdd = false; nav.navigate(Routes.CASH_BOOK) }
                                ) { Text("Cash Book Entry") }
                            }
                        },
                        dismissButton = { TextButton(onClick = { showQuickAdd = false }) { Text("Cancel") } }
                    )
                }
            }
        }
    }
}

/** Bottom-nav colours: purple for the selected item. */
@Composable
private fun navItemColors() = NavigationBarItemDefaults.colors(
    selectedIconColor = BizColors.Purple,
    selectedTextColor = BizColors.Purple,
    indicatorColor = BizColors.PurpleSoft
)

private data class DrawerEntry(
    val label: String,
    val icon: ImageVector,
    val route: String
)

/**
 * Navigation drawer — reference screen 2. Purple gradient header with the
 * owner and the business card (+ profile switcher), then every module.
 * Services expand to the service pages (all ServiceType values except
 * Money Transfer, which has its own ledger screen, and Other).
 */
@Composable
private fun DrawerContent(
    profile: BusinessProfileEntity?,
    profiles: List<BusinessProfileEntity>,
    activeProfileId: Long,
    savedMobile: String,
    onProfile: (Long) -> Unit,
    onNavigate: (String) -> Unit
) {
    var servicesExpanded by remember { mutableStateOf(false) }
    var profilesExpanded by remember { mutableStateOf(false) }
    // Owner display name: the profile's owner name when set, else the
    // account name on record (Ayan Sikligar). Changeable in Settings.
    val ownerDisplayName = profile?.ownerName?.takeIf { it.isNotBlank() } ?: "Ayan Sikligar"

    Column(Modifier.fillMaxSize()) {
        // Purple gradient header.
        Box(
            Modifier.fillMaxWidth()
                .background(Brush.linearGradient(listOf(BizColors.Purple, BizColors.Navy)))
                .padding(20.dp)
        ) {
            Column {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(
                        Modifier.size(48.dp).clip(CircleShape).background(Color.White.copy(alpha = 0.25f)),
                        contentAlignment = Alignment.Center
                    ) {
                        Text(
                            ownerDisplayName.take(1),
                            color = Color.White, fontWeight = FontWeight.Bold, fontSize = 20.sp
                        )
                    }
                    Spacer(Modifier.width(12.dp))
                    Column {
                        Text(
                            ownerDisplayName,
                            color = Color.White, fontWeight = FontWeight.Bold, fontSize = 16.sp
                        )
                        if (savedMobile.isNotBlank()) {
                            Text(savedMobile, color = Color.White.copy(alpha = 0.8f), fontSize = 13.sp)
                        }
                    }
                }
                Spacer(Modifier.height(16.dp))
                // Business card + profile switcher.
                androidx.compose.material3.Card(
                    colors = androidx.compose.material3.CardDefaults.cardColors(
                        containerColor = Color.White.copy(alpha = 0.15f)
                    ),
                    onClick = { profilesExpanded = !profilesExpanded }
                ) {
                    Column(Modifier.padding(12.dp)) {
                        Text(
                            profile?.name?.ifBlank { Branding.OWNER_BUSINESS_NAME } ?: Branding.OWNER_BUSINESS_NAME,
                            color = Color.White, fontWeight = FontWeight.Bold
                        )
                        Text(
                            profile?.category?.label ?: Branding.OWNER_BUSINESS_TYPE,
                            color = Color.White.copy(alpha = 0.8f), fontSize = 13.sp
                        )
                        if (profilesExpanded) {
                            Spacer(Modifier.height(8.dp))
                            profiles.forEach { p ->
                                TextButton(onClick = { onProfile(p.id); profilesExpanded = false }) {
                                    Text(
                                        (if (p.id == activeProfileId) "✓ " else "") +
                                            p.name.ifBlank { Branding.OWNER_BUSINESS_NAME },
                                        color = Color.White
                                    )
                                }
                            }
                        }
                    }
                }
            }
        }
        // Menu items.
        androidx.compose.foundation.lazy.LazyColumn(
            Modifier.weight(1f).padding(horizontal = 12.dp, vertical = 8.dp),
            verticalArrangement = Arrangement.spacedBy(2.dp)
        ) {
            val entries: List<DrawerEntry> = listOf(
                DrawerEntry("Dashboard", Icons.Filled.Dashboard, Routes.DASHBOARD),
                DrawerEntry("Chatbot / AI Assistant", Icons.Filled.Chat, Routes.CHATBOT),
                DrawerEntry("Daily Dhandha", Icons.Filled.Assessment, Routes.DAILY_BUSINESS),
                DrawerEntry("Cash Book", Icons.Filled.Wallet, Routes.CASH_BOOK),
                DrawerEntry("UPI Book", Icons.Filled.SwapHoriz, Routes.UPI_BOOK),
                DrawerEntry("Money Transfer", Icons.Filled.SwapHoriz, Routes.MONEY_TRANSFER)
            )
            items(entries.size) { i ->
                val e = entries[i]
                NavigationDrawerItem(
                    label = { Text(e.label) },
                    selected = false,
                    onClick = { onNavigate(e.route) },
                    icon = { Icon(e.icon, contentDescription = null) },
                    colors = NavigationDrawerItemDefaults.colors(
                        selectedContainerColor = BizColors.PurpleSoft
                    )
                )
            }
            item {
                NavigationDrawerItem(
                    label = { Text("Services") },
                    selected = false,
                    onClick = { servicesExpanded = !servicesExpanded },
                    icon = { Icon(Icons.Filled.GridView, contentDescription = null) },
                    badge = { Text(if (servicesExpanded) "▾" else "▸") }
                )
            }
            if (servicesExpanded) {
                ServiceType.values().filter { it != ServiceType.MONEY_TRANSFER && it != ServiceType.OTHER }.forEach { service ->
                    item {
                        NavigationDrawerItem(
                            label = { Text("  ${service.label}") },
                            selected = false,
                            onClick = { onNavigate(Routes.service(service.name)) },
                            colors = NavigationDrawerItemDefaults.colors(
                                selectedContainerColor = BizColors.PurpleSoft
                            )
                        )
                    }
                }
            }
            val more: List<DrawerEntry> = listOf(
                DrawerEntry("Customers", Icons.Filled.People, Routes.KHATA),
                DrawerEntry("Customer Khata", Icons.Filled.Description, Routes.KHATA),
                DrawerEntry("Agents", Icons.Filled.Person, Routes.AGENTS),
                DrawerEntry("Expenses", Icons.Filled.Receipt, Routes.EXPENSES),
                DrawerEntry("Machine Maintenance", Icons.Filled.Build, Routes.MAINTENANCE),
                DrawerEntry("Receipts", Icons.Filled.Receipt, Routes.RECEIPTS),
                DrawerEntry("Reports", Icons.Filled.Assessment, Routes.REPORTS),
                DrawerEntry("Difference Finder", Icons.Filled.Search, Routes.DIFFERENCE_FINDER),
                DrawerEntry("Audit Log", Icons.Filled.Description, Routes.AUDIT_LOG),
                DrawerEntry("Recycle Bin", Icons.Filled.Delete, Routes.RECYCLE_BIN),
                DrawerEntry("Customization Studio", Icons.Filled.Tune, Routes.CUSTOMIZATION),
                DrawerEntry("Settings", Icons.Filled.Settings, Routes.SETTINGS)
            )
            items(more.size) { i ->
                val e = more[i]
                NavigationDrawerItem(
                    label = { Text(e.label) },
                    selected = false,
                    onClick = { onNavigate(e.route) },
                    icon = { Icon(e.icon, contentDescription = null) },
                    colors = NavigationDrawerItemDefaults.colors(
                        selectedContainerColor = BizColors.PurpleSoft
                    )
                )
            }
        }
    }
}

/** Tiny ViewModel factory helper (screens create their ViewModels this way). */
fun <T : ViewModel> vmFactory(create: () -> T): ViewModelProvider.Factory =
    object : ViewModelProvider.Factory {
        @Suppress("UNCHECKED_CAST")
        override fun <V : ViewModel> create(modelClass: Class<V>): V = create() as V
    }
