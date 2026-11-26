package com.alfalah.business

import android.app.Application
import com.alfalah.business.data.AppDatabase
import com.alfalah.business.data.repository.BusinessRepository

/** Application class — owns the database and repository singletons. */
class AlFalahApp : Application() {
    val database: AppDatabase by lazy { AppDatabase.get(this) }
    val repository: BusinessRepository by lazy { BusinessRepository(database) }
}
