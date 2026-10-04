import PageShell from "@/components/site/PageShell";

export default function PublicLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <PageShell>{children}</PageShell>;
}
