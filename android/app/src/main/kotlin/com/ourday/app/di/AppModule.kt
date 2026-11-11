package com.ourday.app.di

import android.content.Context
import androidx.room.Room
import com.ourday.app.data.db.OurDayDatabase
import com.ourday.app.data.remote.buildSupabase
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import io.github.jan.supabase.SupabaseClient
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
object AppModule {
    @Provides @Singleton fun supabase(): SupabaseClient = buildSupabase()

    @Provides @Singleton
    fun database(@ApplicationContext c: Context): OurDayDatabase =
        Room.databaseBuilder(c, OurDayDatabase::class.java, "ourday.db").fallbackToDestructiveMigration().build()
    // Destructive fallback is safe here: Room is only a cache of the server plus the sync queue, and migrations will be added before the first release that changes the schema.
}
