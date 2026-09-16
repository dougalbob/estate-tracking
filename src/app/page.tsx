import { currentUser } from "@/lib/auth/current-user";
import { authConfiguration } from "@/lib/auth/verify";
import { database } from "@/lib/db";
import { recordStore } from "@/lib/records/store";
import { Workspace } from "@/components/workspace";
import { LockKeyhole } from "lucide-react";
export const dynamic = "force-dynamic";
export default async function Page() {
  let user;
  try {
    user = await currentUser();
  } catch {
    return (
      <main className="access">
        <LockKeyhole size={32} />
        <h1>Protected workspace</h1>
        <p>
          Open Estate Organiser through your configured Cloudflare Access
          address.
        </p>
        <p>
          If you are setting up the app, check the server authentication
          configuration. No estate data has been loaded.
        </p>
      </main>
    );
  }
  const users = user.demo
    ? ["alex@example.invalid", "jamie@example.invalid"]
    : authConfiguration(process.env).users;
  const store = recordStore(database(), users);
  store.seedProjects();
  return <Workspace user={user} users={users} data={store.snapshot()} />;
}
