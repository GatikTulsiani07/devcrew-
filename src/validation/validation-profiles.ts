import type { ValidationProfile } from "./types.js";

export const validationProfiles: readonly ValidationProfile[] = [
  {
    id: "node_standard",
    checks: [
      {
        name: "typecheck",
        executable: "npm",
        args: ["run", "typecheck"],
        timeoutMs: 120_000,
      },
      {
        name: "tests",
        executable: "npm",
        args: ["test"],
        timeoutMs: 300_000,
      },
      {
        name: "build",
        executable: "npm",
        args: ["run", "build"],
        timeoutMs: 300_000,
      },
    ],
  },
];

export function findValidationProfile(
  profiles: readonly ValidationProfile[],
  profileId: string,
): ValidationProfile | undefined {
  return profiles.find((profile) => profile.id === profileId);
}
