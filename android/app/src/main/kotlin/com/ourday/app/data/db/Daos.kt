package com.ourday.app.data.db

import androidx.room.Dao
import androidx.room.Database
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.RoomDatabase
import androidx.room.Transaction
import kotlinx.coroutines.flow.Flow

@Dao
interface TaskDao {
    @Query("SELECT * FROM tasks") fun observeAll(): Flow<List<TaskEntity>>
    @Query("SELECT * FROM tasks WHERE id = :id") suspend fun get(id: String): TaskEntity?
    @Query("SELECT * FROM tasks WHERE id = :id") fun observe(id: String): Flow<TaskEntity?>
    @Insert(onConflict = OnConflictStrategy.REPLACE) suspend fun upsert(t: TaskEntity)
    @Insert(onConflict = OnConflictStrategy.REPLACE) suspend fun upsertAll(t: List<TaskEntity>)
    @Query("DELETE FROM tasks WHERE id = :id") suspend fun delete(id: String)
    @Query("DELETE FROM tasks") suspend fun clear()
    @Query("UPDATE tasks SET syncState = :state WHERE id = :id") suspend fun setSync(id: String, state: String)
}

@Dao
interface HabitDao {
    @Query("SELECT * FROM habits") fun observeAll(): Flow<List<HabitEntity>>
    @Query("SELECT * FROM habits WHERE id = :id") suspend fun get(id: String): HabitEntity?
    @Insert(onConflict = OnConflictStrategy.REPLACE) suspend fun upsert(h: HabitEntity)
    @Insert(onConflict = OnConflictStrategy.REPLACE) suspend fun upsertAll(h: List<HabitEntity>)
    @Query("DELETE FROM habits WHERE id = :id") suspend fun delete(id: String)
    @Query("DELETE FROM habits") suspend fun clear()
    @Query("UPDATE habits SET syncState = :state WHERE id = :id") suspend fun setSync(id: String, state: String)

    @Query("SELECT * FROM habit_logs") fun observeLogs(): Flow<List<HabitLogEntity>>
    @Query("SELECT * FROM habit_logs WHERE habitId = :habitId AND userId = :userId AND day = :day") suspend fun getLog(habitId: String, userId: String, day: String): HabitLogEntity?
    @Insert(onConflict = OnConflictStrategy.REPLACE) suspend fun upsertLog(l: HabitLogEntity)
    @Insert(onConflict = OnConflictStrategy.REPLACE) suspend fun upsertLogs(l: List<HabitLogEntity>)
    @Query("DELETE FROM habit_logs WHERE habitId = :habitId AND userId = :userId AND day = :day") suspend fun deleteLog(habitId: String, userId: String, day: String)
    @Query("DELETE FROM habit_logs WHERE habitId = :habitId") suspend fun deleteLogsOf(habitId: String)
    @Query("DELETE FROM habit_logs") suspend fun clearLogs()
}

@Dao
interface WorkspaceDao {
    @Query("SELECT * FROM workspace LIMIT 1") fun observe(): Flow<WorkspaceEntity?>
    @Query("SELECT * FROM workspace LIMIT 1") suspend fun get(): WorkspaceEntity?
    @Insert(onConflict = OnConflictStrategy.REPLACE) suspend fun set(w: WorkspaceEntity)
    @Query("DELETE FROM workspace") suspend fun clear()
    @Query("SELECT * FROM members") fun observeMembers(): Flow<List<MemberEntity>>
    @Insert(onConflict = OnConflictStrategy.REPLACE) suspend fun upsertMembers(m: List<MemberEntity>)
    @Query("DELETE FROM members") suspend fun clearMembers()
}

@Dao
interface QuoteDao {
    @Query("SELECT * FROM quotes ORDER BY createdAtMs") fun observeAll(): Flow<List<QuoteEntity>>
    @Query("SELECT * FROM quotes ORDER BY createdAtMs") suspend fun all(): List<QuoteEntity>
    @Insert(onConflict = OnConflictStrategy.REPLACE) suspend fun upsertAll(q: List<QuoteEntity>)
    @Query("DELETE FROM quotes") suspend fun clear()
}

@Dao
interface QueueDao {
    @Query("SELECT * FROM op_queue ORDER BY seq") suspend fun all(): List<QueuedOpEntity>
    @Query("SELECT COUNT(*) FROM op_queue") fun observeCount(): Flow<Int>
    @Insert suspend fun insert(q: QueuedOpEntity)
    @Query("DELETE FROM op_queue") suspend fun clear()

    @Transaction
    suspend fun replaceAll(rows: List<QueuedOpEntity>) { clear(); rows.forEach { insert(it.copy(seq = 0)) } }

    @Query("SELECT * FROM sync_issues ORDER BY atMs DESC") fun observeIssues(): Flow<List<SyncIssueEntity>>
    @Query("SELECT * FROM sync_issues") suspend fun issues(): List<SyncIssueEntity>
    @Insert(onConflict = OnConflictStrategy.REPLACE) suspend fun putIssue(i: SyncIssueEntity)
    @Query("DELETE FROM sync_issues WHERE entity = :entity") suspend fun dismissIssue(entity: String)
    @Query("DELETE FROM sync_issues") suspend fun clearIssues()
}

@Database(
    entities = [TaskEntity::class, HabitEntity::class, HabitLogEntity::class, MemberEntity::class, WorkspaceEntity::class, QuoteEntity::class, QueuedOpEntity::class, SyncIssueEntity::class],
    version = 1,
    exportSchema = false,
)
abstract class OurDayDatabase : RoomDatabase() {
    abstract fun tasks(): TaskDao
    abstract fun habits(): HabitDao
    abstract fun workspace(): WorkspaceDao
    abstract fun quotes(): QuoteDao
    abstract fun queue(): QueueDao
}
