"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAction } from "@/hooks/use-action";
import { deleteAccount } from "@/app/actions/brain";

export function DeleteAccount() {
  const router = useRouter();
  const [text, setText] = useState("");
  const del = useAction(deleteAccount);
  return (
    <div className="flex flex-col gap-2 sm:flex-row">
      <Input value={text} onChange={(e) => setText(e.target.value)} placeholder='Type "DELETE" to confirm' aria-label="Confirmation" className="sm:w-64" />
      <Button variant="destructive" disabled={text !== "DELETE" || del.pending} onClick={async () => (await del.run(text)).ok && router.push("/login")}>
        {del.pending ? <Loader2 className="animate-spin" /> : null} Delete my account
      </Button>
    </div>
  );
}
