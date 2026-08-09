export interface PreparedRepository {
  id: string;
  publicRepositoryUrl: string;
  localCheckoutPath?: string;
  validationProfileId?: string;
  defaultBranch?: string;
  browserVerificationProfileId?: string;
}

export const preparedRepositories: readonly PreparedRepository[] = [
  {
    id: "prepared_devcrew_main",
    publicRepositoryUrl: "https://github.com/example/devcrew",
    localCheckoutPath:
      process.env.DEVCREW_PREPARED_DEVCREW_LOCAL_CHECKOUT_PATH,
    validationProfileId: "node_standard",
    defaultBranch: "main",
    browserVerificationProfileId: "next_localhost",
  },
];

export function findPreparedRepository(
  repositories: readonly PreparedRepository[],
  preparedRepositoryId: string,
): PreparedRepository | undefined {
  return repositories.find((repository) => repository.id === preparedRepositoryId);
}
