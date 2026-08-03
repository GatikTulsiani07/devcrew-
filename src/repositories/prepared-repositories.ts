export interface PreparedRepository {
  id: string;
  publicRepositoryUrl: string;
}

export const preparedRepositories: readonly PreparedRepository[] = [
  {
    id: "prepared_devcrew_main",
    publicRepositoryUrl: "https://github.com/example/devcrew",
  },
];

export function findPreparedRepository(
  repositories: readonly PreparedRepository[],
  preparedRepositoryId: string,
): PreparedRepository | undefined {
  return repositories.find((repository) => repository.id === preparedRepositoryId);
}
