package com.alfalah.business

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import com.alfalah.business.data.SettingsStore
import com.alfalah.business.data.entity.BusinessProfileEntity
import com.alfalah.business.domain.AppLanguage
import com.alfalah.business.domain.Branding
import com.alfalah.business.domain.BusinessCategory
import com.alfalah.business.domain.ServiceType
import com.alfalah.business.navigation.Routes
import com.alfalah.business.ui.agents.AgentScreen
import com.alfalah.business.ui.cashbook.CashBookScreen
import com.alfalah.business.ui.cashbook.DifferenceFinderScreen
import com.alfalah.business.ui.dashboard.DashboardScreen
import com.alfalah.business.ui.dashboard.DashboardViewModel
import com.alfalah.business.ui.expenses.ExpensesScreen
import com.alfalah.business.ui.khata.KhataScreen
import com.alfalah.business.ui.language.LanguageScreen
import com.alfalah.business.ui.language.Strings
import com.alfalah.business.ui.moneytransfer.MoneyTransferScreen
import com.alfalah.business.ui.receipts.ReceiptsScreen
import com.alfalah.business.ui.reports.ReportsScreen
import com.alfalah.business.ui.services.ServiceJobsScreen
import com.alfalah.business.ui.settings.CategoryPickScreen
import com.alfalah.business.ui.settings.SettingsScreen
import com.alfalah.business.ui.theme.BizKhataTheme
import kotlinx.coroutines.flow.map

/** Entry point. No WebView anywhere — native Compose navigation only.
 *  First run: Language → Category pick (creates the first business profile)
 *  → Dashboard. After that the Dashboard is the start screen. */
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
            val profiles by app.repository.observeProfiles()
                .collectAsState(initial = emptyList())
            val activeProfileId by settings.activeProfileId.collectAsState(initial = -1L)

            // The active profile: the one the user picked, else the first one.
            // Profiles are strictly isolated — every screen gets this id.
            val activeProfile: BusinessProfileEntity? =
                profiles.firstOrNull { it.id == activeProfileId } ?: profiles.firstOrNull()

            BizKhataTheme(darkTheme = darkTheme) {
                val nav = rememberNavController()
                val scope = androidx.compose.runtime.rememberCoroutineScope()
                val start = if (profiles.isEmpty()) Routes.LANGUAGE else Routes.DASHBOARD
                Scaffold(
                    topBar = {
                        TopAppBar(
                            title = { Text(Branding.APP_NAME) },
                            navigationIcon = {
                                if (nav.previousBackStackEntry != null) {
                                    IconButton(onClick = { nav.popBackStack() }) {
                                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                                    }
                                }
                            }
                        )
                    }
                ) { padding ->
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
                                    nav.navigate(Routes.DASHBOARD) {
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
                            DashboardScreen(
                                state = vm.state.collectAsState().value,
                                language = language,
                                profileName = profile.name.ifBlank { Branding.OWNER_BUSINESS_NAME },
                                onOpen = { route -> nav.navigate(route) }
                            )
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
                        composable(Routes.SERVICE) { backStack ->
                            val profile = activeProfile ?: return@composable
                            val serviceName = backStack.arguments?.getString("service") ?: "PAN"
                            ServiceJobsScreen(
                                profileId = profile.id,
                                repository = app.repository,
                                language = language,
                                service = ServiceType.valueOf(serviceName)
                            )
                        }
                        composable(Routes.KHATA) {
                            val profile = activeProfile ?: return@composable
                            KhataScreen(profileId = profile.id, repository = app.repository, language = language)
                        }
                        composable(Routes.AGENTS) {
                            val profile = activeProfile ?: return@composable
                            AgentScreen(profileId = profile.id, repository = app.repository, language = language)
                        }
                        composable(Routes.EXPENSES) {
                            val profile = activeProfile ?: return@composable
                            ExpensesScreen(profileId = profile.id, repository = app.repository, language = language)
                        }
                        composable(Routes.MAINTENANCE) {
                            val profile = activeProfile ?: return@composable
                            ExpensesScreen(profileId = profile.id, repository = app.repository, language = language)
                        }
                        composable(Routes.RECEIPTS) {
                            val profile = activeProfile ?: return@composable
                            ReceiptsScreen(profileId = profile.id, repository = app.repository, language = language)
                        }
                        composable(Routes.DAILY_BUSINESS) {
                            val profile = activeProfile ?: return@composable
                            ReportsScreen(profileId = profile.id, repository = app.repository, language = language)
                        }
                        composable(Routes.REPORTS) {
                            val profile = activeProfile ?: return@composable
                            ReportsScreen(profileId = profile.id, repository = app.repository, language = language)
                        }
                        composable(Routes.DIFFERENCE_FINDER) {
                            val profile = activeProfile ?: return@composable
                            DifferenceFinderScreen(profileId = profile.id, repository = app.repository, language = language)
                        }
                        composable(Routes.SETTINGS) {
                            val profile = activeProfile ?: return@composable
                            SettingsScreen(
                                profileId = profile.id,
                                repository = app.repository,
                                language = language,
                                themeMode = themeMode,
                                profiles = profiles,
                                activeProfileId = activeProfile?.id ?: -1L,
                                onLanguage = { l -> scope.launch { settings.setLanguage(l) } },
                                onThemeMode = { m -> scope.launch { settings.setThemeMode(m) } },
                                onProfile = { id -> scope.launch { settings.setActiveProfile(id) } }
                            )
                        }
                    }
                }
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
