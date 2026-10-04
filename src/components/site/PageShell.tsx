import Background from "@/components/Background";
import Header from "@/components/Header";

/**
 * Standard public page chrome: decorative background, header with the primary
 * navigation, and the single <main> landmark that the skip link targets.
 * The footer (also a landmark) is rendered once by the root layout.
 */
export default function PageShell({
  children,
  className = "doc-main public-main",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className="relative w-full min-h-screen">
      <Background />
      <Header />
      <main id="main" tabIndex={-1} className={className}>
        {children}
      </main>
    </div>
  );
}
