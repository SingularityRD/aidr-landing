import { redirect } from "next/navigation";

// The old "book a demo" page only pointed at the waitlist. Route requests to the real contact form.
export default function DemoPage() {
  redirect("/contact?topic=sales");
}
