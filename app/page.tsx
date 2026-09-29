import { redirect } from "next/navigation";

// The bare address opens the dashboard (the app layout sends people to login first if needed)
export default function Home() {
  redirect("/dashboard");
}
