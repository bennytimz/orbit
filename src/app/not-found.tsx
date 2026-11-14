import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center p-6 text-center">
      <h1 className="text-lg font-semibold">Not found</h1>
      <p className="mt-2 text-sm text-muted-foreground">This item doesn&apos;t exist or belongs to another account.</p>
      <Link href="/dashboard" className={buttonVariants({ className: "mt-6" })}>
        Back to Command Center
      </Link>
    </div>
  );
}
