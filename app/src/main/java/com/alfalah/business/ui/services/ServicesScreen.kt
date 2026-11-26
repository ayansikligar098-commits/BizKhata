package com.alfalah.business.ui.services

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AccountBox
import androidx.compose.material.icons.filled.Assignment
import androidx.compose.material.icons.filled.Badge
import androidx.compose.material.icons.filled.CameraAlt
import androidx.compose.material.icons.filled.CardMembership
import androidx.compose.material.icons.filled.Description
import androidx.compose.material.icons.filled.FileCopy
import androidx.compose.material.icons.filled.Fingerprint
import androidx.compose.material.icons.filled.HealthAndSafety
import androidx.compose.material.icons.filled.Print
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.alfalah.business.domain.ServiceType
import com.alfalah.business.navigation.Routes
import com.alfalah.business.ui.components.BizCard

/**
 * Services (All) — reference screen 6. A 2-column grid of service cards;
 * each card opens that service's own jobs page (its own customer list).
 * Money Transfer has its own ledger screen and is reached from the drawer
 * and the Dashboard, not from this grid.
 */
@Composable
fun ServicesScreen(onOpenService: (String) -> Unit) {
    val services: List<Pair<ServiceType, ImageVector>> = listOf(
        ServiceType.PAN to Icons.Filled.Badge,
        ServiceType.AADHAAR to Icons.Filled.Fingerprint,
        ServiceType.VOTER_ID to Icons.Filled.AccountBox,
        ServiceType.AYUSHMAN to Icons.Filled.HealthAndSafety,
        ServiceType.XEROX to Icons.Filled.Description,
        ServiceType.PRINTING to Icons.Filled.Print,
        ServiceType.SMART_CARD to Icons.Filled.CardMembership,
        ServiceType.PASSPORT_PHOTO to Icons.Filled.CameraAlt,
        ServiceType.SCANNING to Icons.Filled.FileCopy,
        ServiceType.DOCUMENT_WORK to Icons.Filled.Assignment
    )
    LazyVerticalGrid(
        columns = GridCells.Adaptive(minSize = 150.dp),
        modifier = Modifier.fillMaxSize().padding(horizontal = 16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        item(span = { GridItemSpan(maxLineSpan) }) {
            Column(Modifier.fillMaxWidth()) {
                Spacer(Modifier.height(4.dp))
                Text(
                    "All Services",
                    style = MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.Bold
                )
                Text(
                    "Tap a service to see its jobs and customers.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }
        items(services) { (service, icon) ->
            BizCard(Modifier.fillMaxWidth(), onClick = { onOpenService(Routes.service(service.name)) }) {
                Column(
                    Modifier.fillMaxWidth().padding(vertical = 8.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    Icon(
                        icon,
                        contentDescription = service.label,
                        tint = com.alfalah.business.ui.theme.BizColors.Purple,
                        modifier = Modifier.size(40.dp)
                    )
                    Text(
                        service.label,
                        fontWeight = FontWeight.SemiBold,
                        textAlign = TextAlign.Center,
                        style = MaterialTheme.typography.bodyLarge
                    )
                }
            }
        }
    }
}
