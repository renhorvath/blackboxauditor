import { redirect } from "next/navigation";

/** Legacy recovery landing → Meder home. */
export default function LandingRedirect() {
  redirect("/");
}
