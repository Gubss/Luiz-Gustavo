"use client";

import { IDEA_STATUS } from "@/lib/idea-status";

export function IdeaStatusSelect({ action, value }: { action: (fd: FormData) => Promise<void>; value: string }) {
  return (
    <form action={action}>
      <select name="status" defaultValue={value} className="input w-auto py-1" onChange={(e) => e.currentTarget.form?.requestSubmit()}>
        {Object.entries(IDEA_STATUS).map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </form>
  );
}
