import { redirect } from "next/navigation";

// The bare address opens the login page (it forwards to the dashboard if this tab is already logged in)
export default function Home() {
  redirect("/login");
}
