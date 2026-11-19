import { adminClient, clearState, readState } from "./support";

/** Deletes the throwaway E2E user. Every ORBIT table cascades from auth.users, so this removes all its data. */
export default async function globalTeardown() {
  const state = readState();
  if (!state) return;
  const admin = adminClient();
  const { error } = await admin.auth.admin.deleteUser(state.userId);
  if (error) console.error(`E2E teardown: could not delete test user ${state.userId}: ${error.message}`);
  else clearState();
}
