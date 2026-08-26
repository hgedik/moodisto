import type {
  Database,
  SystemSettingRecord,
  SystemSettingWriteInput,
  UnitOfWork,
} from '../../../src/application/ports';

/**
 * The settings half of the persistence layer, in memory. Enough for the service under test:
 * everything else on the unit of work stays untouched and would throw if it were used.
 */
export class FakeSystemSettingStore {
  readonly rows = new Map<string, SystemSettingRecord>();
  savedBy: string | null = null;
  reads = 0;

  readonly database: Database;

  constructor(private readonly now: () => Date = () => new Date('2026-08-27T10:00:00.000Z')) {
    const repository = {
      findAll: async (): Promise<readonly SystemSettingRecord[]> => {
        this.reads += 1;
        return [...this.rows.values()];
      },
      save: async (
        entries: readonly SystemSettingWriteInput[],
        updatedById: string | null,
      ): Promise<void> => {
        this.savedBy = updatedById;
        for (const entry of entries) {
          this.rows.set(entry.key, { ...entry, updatedById, updatedAt: this.now() });
        }
      },
      remove: async (keys: readonly string[]): Promise<void> => {
        for (const key of keys) {
          this.rows.delete(key);
        }
      },
    };

    const uow = { systemSettings: repository } as unknown as UnitOfWork;
    this.database = {
      read: () => uow,
      transaction: async <T>(work: (unit: UnitOfWork) => Promise<T>): Promise<T> => work(uow),
    };
  }
}
