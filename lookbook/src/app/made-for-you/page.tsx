import type { Metadata } from "next"
import { SignIn } from "@/components/foryou/sign-in"

export const metadata: Metadata = {
  title: "Made for you · Suta",
  description: "Sign in with Instagram and get three Suta looks styled from your own posts.",
}

export default function MadeForYouPage() {
  return <SignIn />
}
