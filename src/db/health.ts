export interface DatabaseHealth {
  checkConnection(): Promise<void>;
}

export function createDatabaseHealth(
  query: () => Promise<unknown>,
): DatabaseHealth {
  return {
    async checkConnection() {
      await query();
    },
  };
}
