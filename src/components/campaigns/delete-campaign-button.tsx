"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useAction } from "@/hooks/use-action";
import { deleteCampaign } from "@/app/actions/campaigns";

export function DeleteCampaignButton({ id }: { id: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const del = useAction(deleteCampaign);
  return (
    <>
      <Button variant="ghost" size="icon-sm" aria-label="Delete campaign" onClick={() => setOpen(true)}>
        <Trash2 />
      </Button>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this campaign?</AlertDialogTitle>
            <AlertDialogDescription>The campaign plan is deleted. Its content drafts stay in Studio, and posts already in Buffer are not affected.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={del.pending} onClick={async () => (await del.run(id)).ok && router.push("/campaigns")}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
