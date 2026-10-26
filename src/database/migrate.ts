import { createDatabaseConnection } from '../config/database';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import type { Database } from 'bun:sqlite';
import { logger } from '../utils/logger';

export class DatabaseMigrator {
  private db: Database;

  constructor() {
    this.db = createDatabaseConnection();
  }

  async runMigrations(): Promise<void> {
    logger.task.start('数据库迁移');

    try {
      // 创建迁移记录表
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS migrations (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          filename TEXT NOT NULL UNIQUE,
          executed_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // 获取已执行的迁移
      const executedMigrations = this.db.query(`
        SELECT filename FROM migrations ORDER BY id
      `).all().map((row: any) => row.filename);

      // 读取迁移文件
      const migrationFiles = ['001_initial.sql', '002_add_rss_config.sql', '003_add_telegram_mode.sql', '004_subscription_controls.sql', '005_account_preferences.sql', '006_hot_ranking.sql', '007_hot_samples.sql', '008_hot_collector_cooldown.sql', '009_account_avatar.sql', '010_dismissed_matches.sql', '011_forum_author_links.sql', '012_collection_insights.sql', '014_remove_trade_analysis.sql', '015_remove_post_history.sql', '016_hot_browser_collection.sql', '017_hot_collector_control.sql'];

      migrationFiles.push('018_retire_hot_ranking.sql');

      for (const filename of migrationFiles) {
        if (executedMigrations.includes(filename)) {
          logger.task.info(`跳过已执行的迁移: ${filename}`);
          continue;
        }

        logger.task.info(`执行迁移: ${filename}`);

        const sourcePath = join(__dirname, 'migrations', filename);
        const migrationPath = existsSync(sourcePath) ? sourcePath : join(process.cwd(), 'src', 'database', 'migrations', filename);
        const migrationSQL = readFileSync(migrationPath, 'utf-8');

        // 执行迁移
        this.db.transaction(() => {
          this.db.exec(migrationSQL);
          this.db.query('INSERT INTO migrations (filename) VALUES (?)').run(filename);
        })();

        logger.task.info(`迁移完成: ${filename}`);
      }

      logger.task.end('数据库迁移');
    } catch (error) {
      logger.error('数据库迁移失败:', error);
      throw error;
    }
  }

  close(): void {
    this.db.close();
  }
}

// DatabaseMigrator 类已经在上面导出了
