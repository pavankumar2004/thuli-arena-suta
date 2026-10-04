import type { Metadata } from "next"
import { SignIn } from "@/components/foryou/sign-in"

export const metadata: Metadata = {
  title: "Made for you · Suta",
  description: "Sign in with Instagram, enter a public profile, and get three Suta looks styled from its posts.",
}

export default function MadeForYouPage() {
  return <SignIn />
}
