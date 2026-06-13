export const firebaseDbEnvError = null;

export async function createServerFirebaseClient() {
  return {
    auth: {
      async getSession() {
        return { data: { session: null }, error: null };
      },
      async getUser() {
        return { data: { user: null }, error: null };
      },
    },
  };
}
